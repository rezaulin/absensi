require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { pool, dbGet, dbInsert, testConnection } = require('./db');
const { resolveTenant, loadTenant, checkExpired } = require('./middleware/tenant');
const { authenticate, authenticateTenant } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'epesantren-default-secret-change-me';

// ============================================================
// Global Middleware
// ============================================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('short'));
}

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Tenant resolution (runs on every request)
app.use(resolveTenant);

// ============================================================
// Public Routes (no auth)
// ============================================================

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Check slug availability
app.get('/api/cek-slug/:slug', async (req, res) => {
  try {
    const existing = await dbGet('SELECT id FROM sekolah WHERE slug = ?', [req.params.slug]);
    res.json({ available: !existing });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Public registration (creates tenant + admin)
app.post('/api/register-public', authLimiter, async (req, res) => {
  try {
    const { nama, slug, admin_nama, admin_username, admin_password, paket_id } = req.body;

    if (!nama || !slug || !admin_nama || !admin_username || !admin_password) {
      return res.status(400).json({ error: 'Semua field harus diisi' });
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug hanya boleh huruf kecil, angka, dan strip' });
    }

    if (slug.length < 3 || slug.length > 50) {
      return res.status(400).json({ error: 'Slug harus antara 3-50 karakter' });
    }

    const reserved = ['www', 'api', 'admin', 'super', 'app', 'mail', 'ftp', 'ns1', 'ns2', 'cpanel'];
    if (reserved.includes(slug)) {
      return res.status(400).json({ error: 'Slug tersebut tidak dapat digunakan' });
    }

    const existing = await dbGet('SELECT id FROM sekolah WHERE slug = ?', [slug]);
    if (existing) {
      return res.status(400).json({ error: 'Slug sudah digunakan' });
    }

    // Trial 1 month
    const expiredAt = new Date();
    expiredAt.setMonth(expiredAt.getMonth() + 1);

    const sekolahId = await dbInsert('sekolah', {
      nama,
      slug,
      app_name: 'e-Pesantren',
      paket_id: paket_id || 1,
      status: 'trial',
      expired_at: expiredAt.toISOString().slice(0, 19).replace('T', ' ')
    });

    const hashedPass = await bcrypt.hash(admin_password, 10);
    await dbInsert('users', {
      sekolah_id: sekolahId,
      username: admin_username,
      password: hashedPass,
      nama: admin_nama,
      role: 'admin',
      status: 'aktif'
    });

    const domain = process.env.DOMAIN || 'e-pesantren.app';
    res.json({
      success: true,
      message: 'Pesantren berhasil didaftarkan!',
      sekolah_id: sekolahId,
      url: `https://${slug}.${domain}`
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Gagal mendaftar. Silakan coba lagi.' });
  }
});

// Get tenant info (public, needs tenant slug)
app.get('/api/tenant-info', loadTenant, async (req, res) => {
  const s = req.sekolah;
  res.json({
    id: s.id,
    nama: s.nama,
    slug: s.slug,
    app_name: s.app_name,
    logo: s.logo,
    background: s.background,
    dashboard_bg: s.dashboard_bg,
    kepala_nama: s.kepala_nama,
    nama_kota: s.nama_kota,
    paket_nama: s.paket_nama,
    status: s.status,
    fitur: s.fitur
  });
});

// ============================================================
// Login Routes
// ============================================================

// Admin/Ustadz login
app.post('/api/login', authLimiter, loadTenant, async (req, res) => {
  try {
    const { username, password } = req.body;
    const sekolah_id = req.sekolah_id;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password harus diisi' });
    }

    const user = await dbGet(
      'SELECT * FROM users WHERE sekolah_id = ? AND username = ? AND status = "aktif"',
      [sekolah_id, username]
    );

    if (!user) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }

    // Update last login
    const { dbUpdate } = require('./db');
    dbUpdate('users', { last_login: new Date() }, 'id = ?', [user.id]).catch(() => {});

    const token = jwt.sign(
      { id: user.id, sekolah_id: user.sekolah_id, username: user.username, nama: user.nama, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, nama: user.nama, role: user.role, sekolah_id: user.sekolah_id }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Wali login (by NIS or nama santri)
app.post('/api/login-wali', authLimiter, loadTenant, async (req, res) => {
  try {
    const { identitas } = req.body;
    const sekolah_id = req.sekolah_id;

    if (!identitas) {
      return res.status(400).json({ error: 'Masukkan NIS atau nama santri' });
    }

    const santri = await dbGet(
      'SELECT * FROM santri WHERE sekolah_id = ? AND (nis = ? OR nama = ?) AND status = "aktif"',
      [sekolah_id, identitas, identitas]
    );

    if (!santri) {
      return res.status(401).json({ error: 'Santri tidak ditemukan atau tidak aktif' });
    }

    const token = jwt.sign(
      { id: santri.id, sekolah_id, role: 'wali', nama: santri.nama, santri_id: santri.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: santri.id, nama: santri.nama, role: 'wali', santri_id: santri.id, sekolah_id }
    });
  } catch (err) {
    console.error('Login wali error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Super admin login
app.post('/api/super/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const superUser = process.env.SUPER_ADMIN_USER || 'superadmin';
    const superPass = process.env.SUPER_ADMIN_PASS || 'superadmin123';

    if (username === superUser && password === superPass) {
      const token = jwt.sign(
        { id: 0, role: 'superadmin', username: 'superadmin', nama: 'Super Admin' },
        JWT_SECRET,
        { expiresIn: '1d' }
      );
      res.json({ token, user: { role: 'superadmin', nama: 'Super Admin' } });
    } else {
      res.status(401).json({ error: 'Kredensial salah' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================
// Dashboard stats (per tenant)
// ============================================================
app.get('/api/dashboard', authenticateTenant, checkExpired, async (req, res) => {
  try {
    const sid = req.sekolah_id;
    const { dbQuery } = require('./db');

    const totalSantri = await dbGet('SELECT COUNT(*) as total FROM santri WHERE sekolah_id = ? AND status = "aktif"', [sid]);
    const totalKamar = await dbGet('SELECT COUNT(*) as total FROM kamar WHERE sekolah_id = ?', [sid]);
    const totalKelas = await dbGet('SELECT COUNT(*) as total FROM kelas_sekolah WHERE sekolah_id = ?', [sid]);
    const totalKegiatan = await dbGet('SELECT COUNT(*) as total FROM kegiatan WHERE sekolah_id = ?', [sid]);
    const totalUsers = await dbGet('SELECT COUNT(*) as total FROM users WHERE sekolah_id = ? AND status = "aktif"', [sid]);

    const today = new Date().toISOString().slice(0, 10);
    const absensiHariIni = await dbGet(
      'SELECT COUNT(*) as total FROM absensi_sesi WHERE sekolah_id = ? AND tanggal = ?',
      [sid, today]
    );

    const pelanggaranBulanIni = await dbGet(
      'SELECT COUNT(*) as total FROM pelanggaran WHERE sekolah_id = ? AND MONTH(tanggal) = MONTH(NOW()) AND YEAR(tanggal) = YEAR(NOW())',
      [sid]
    );

    const pengumumanAktif = await dbGet(
      'SELECT COUNT(*) as total FROM pengumuman WHERE sekolah_id = ? AND aktif = "ya"',
      [sid]
    );

    // Recent absensi
    const recentAbsensi = await dbQuery(
      `SELECT a.tanggal, k.nama as kegiatan_nama, a.status,
              COUNT(ab.id) as jumlah_absen
       FROM absensi_sesi a
       LEFT JOIN kegiatan k ON a.kegiatan_id = k.id
       LEFT JOIN absensi ab ON a.id = ab.sesi_id
       WHERE a.sekolah_id = ?
       GROUP BY a.id
       ORDER BY a.tanggal DESC, a.created_at DESC
       LIMIT 5`,
      [sid]
    );

    res.json({
      total_santri: totalSantri.total,
      total_kamar: totalKamar.total,
      total_kelas: totalKelas.total,
      total_kegiatan: totalKegiatan.total,
      total_users: totalUsers.total,
      absensi_hari_ini: absensiHariIni.total,
      pelanggaran_bulan_ini: pelanggaranBulanIni.total,
      pengumuman_aktif: pengumumanAktif.total,
      recent_absensi: recentAbsensi,
      sekolah: req.sekolah ? {
        nama: req.sekolah.nama,
        paket_nama: req.sekolah.paket_nama,
        status: req.sekolah.status,
        expired_at: req.sekolah.expired_at,
        max_santri: req.sekolah.max_santri,
        max_users: req.sekolah.max_users
      } : null
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Gagal memuat dashboard' });
  }
});

// ============================================================
// Protected Routes (tenant + auth + expiry check)
// ============================================================
app.use('/api/santri', authenticateTenant, checkExpired, require('./routes/santri'));
app.use('/api/kamar', authenticateTenant, checkExpired, require('./routes/kamar'));
app.use('/api/kelas', authenticateTenant, checkExpired, require('./routes/kelas'));
app.use('/api/kegiatan', authenticateTenant, checkExpired, require('./routes/kegiatan'));
app.use('/api/kelompok', authenticateTenant, checkExpired, require('./routes/kelompok'));
app.use('/api/jadwal', authenticateTenant, checkExpired, require('./routes/jadwal'));
app.use('/api/absensi', authenticateTenant, checkExpired, require('./routes/absensi'));
app.use('/api/absen-malam', authenticateTenant, checkExpired, require('./routes/absen-malam'));
app.use('/api/absen-sekolah', authenticateTenant, checkExpired, require('./routes/absen-sekolah'));
app.use('/api/pelanggaran', authenticateTenant, checkExpired, require('./routes/pelanggaran'));
app.use('/api/prestasi', authenticateTenant, checkExpired, require('./routes/prestasi'));
app.use('/api/catatan', authenticateTenant, checkExpired, require('./routes/catatan'));
app.use('/api/pengumuman', authenticateTenant, checkExpired, require('./routes/pengumuman'));
app.use('/api/rekap', authenticateTenant, checkExpired, require('./routes/rekap'));
app.use('/api/settings', authenticateTenant, checkExpired, require('./routes/settings'));
app.use('/api/users', authenticateTenant, checkExpired, require('./routes/users'));

// Super admin routes (no tenant needed)
app.use('/api/super', authenticate, require('./routes/super-admin'));

// ============================================================
// Error Handler
// ============================================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// Start Server
// ============================================================
async function startServer() {
  await testConnection();

  app.listen(PORT, () => {
    console.log('═══════════════════════════════════════════');
    console.log('  e-Pesantren SaaS Platform');
    console.log(`  Port: ${PORT}`);
    console.log(`  Domain: ${process.env.DOMAIN || 'localhost'}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('═══════════════════════════════════════════');
  });
}

startServer();
module.exports = app;
