const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireSuperAdmin } = require('../middleware/admin');

// ============ STATISTICS ============
router.get('/stats', requireSuperAdmin, async (req, res) => {
  try {
    const totalSekolah = await dbGet('SELECT COUNT(*) as total FROM sekolah');
    const totalAktif = await dbGet('SELECT COUNT(*) as total FROM sekolah WHERE status = "aktif"');
    const totalTrial = await dbGet('SELECT COUNT(*) as total FROM sekolah WHERE status = "trial"');
    const totalSuspend = await dbGet('SELECT COUNT(*) as total FROM sekolah WHERE status = "suspend"');
    const totalSantri = await dbGet('SELECT COUNT(*) as total FROM santri WHERE status = "aktif"');
    const totalUsers = await dbGet('SELECT COUNT(*) as total FROM users');

    const revenue = await dbQuery(
      'SELECT p.harga_bulan FROM sekolah s JOIN paket p ON s.paket_id = p.id WHERE s.status = "aktif"'
    );
    const monthlyRevenue = revenue.reduce((sum, r) => sum + r.harga_bulan, 0);

    // Recent registrations
    const recentTenants = await dbQuery(
      'SELECT s.id, s.nama, s.slug, s.status, s.created_at, p.nama as paket_nama FROM sekolah s LEFT JOIN paket p ON s.paket_id = p.id ORDER BY s.created_at DESC LIMIT 5'
    );

    res.json({
      total_sekolah: totalSekolah.total,
      sekolah_aktif: totalAktif.total,
      sekolah_trial: totalTrial.total,
      sekolah_suspend: totalSuspend.total,
      total_santri: totalSantri.total,
      total_users: totalUsers.total,
      monthly_revenue: monthlyRevenue,
      recent_tenants: recentTenants
    });
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil statistik' }); }
});

// ============ SEKOLAH / TENANT MANAGEMENT ============
router.get('/sekolah', requireSuperAdmin, async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT s.*, p.nama as paket_nama, p.harga_bulan, p.max_santri, p.max_users, p.fitur,
              (SELECT COUNT(*) FROM santri st WHERE st.sekolah_id = s.id AND st.status='aktif') as jumlah_santri,
              (SELECT COUNT(*) FROM users u WHERE u.sekolah_id = s.id) as jumlah_users
       FROM sekolah s LEFT JOIN paket p ON s.paket_id = p.id ORDER BY s.created_at DESC`
    );
    rows.forEach(r => { if (typeof r.fitur === 'string') try { r.fitur = JSON.parse(r.fitur); } catch(e) { r.fitur = {}; } });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil data sekolah' }); }
});

router.get('/sekolah/:id', requireSuperAdmin, async (req, res) => {
  try {
    const sekolah = await dbGet(
      `SELECT s.*, p.nama as paket_nama, p.harga_bulan, p.max_santri, p.max_users, p.fitur
       FROM sekolah s LEFT JOIN paket p ON s.paket_id = p.id WHERE s.id = ?`,
      [req.params.id]
    );
    if (!sekolah) return res.status(404).json({ error: 'Sekolah tidak ditemukan' });
    if (typeof sekolah.fitur === 'string') try { sekolah.fitur = JSON.parse(sekolah.fitur); } catch(e) { sekolah.fitur = {}; }
    res.json(sekolah);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Create new tenant
router.post('/sekolah', requireSuperAdmin, async (req, res) => {
  try {
    const { nama, slug, admin_nama, admin_username, admin_password, paket_id, alamat, nama_kota } = req.body;
    if (!nama || !slug || !admin_nama || !admin_username || !admin_password) {
      return res.status(400).json({ error: 'Semua field wajib harus diisi' });
    }
    if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Slug hanya boleh huruf kecil, angka, dan strip' });

    const existing = await dbGet('SELECT id FROM sekolah WHERE slug = ?', [slug]);
    if (existing) return res.status(400).json({ error: 'Slug sudah digunakan' });

    const expiredAt = new Date();
    expiredAt.setMonth(expiredAt.getMonth() + 1);

    const sekolahId = await dbInsert('sekolah', {
      nama, slug, alamat: alamat || '', nama_kota: nama_kota || '',
      app_name: 'e-Pesantren', paket_id: paket_id || 1, status: 'trial',
      expired_at: expiredAt.toISOString().slice(0, 19).replace('T', ' ')
    });

    const hashedPass = await bcrypt.hash(admin_password, 10);
    await dbInsert('users', {
      sekolah_id: sekolahId, username: admin_username, password: hashedPass,
      nama: admin_nama, role: 'admin'
    });

    res.json({ success: true, id: sekolahId, message: 'Pesantren berhasil dibuat' });
  } catch (err) {
    console.error('Create sekolah error:', err);
    res.status(500).json({ error: 'Gagal membuat pesantren' });
  }
});

// Update sekolah
router.put('/sekolah/:id', requireSuperAdmin, async (req, res) => {
  try {
    const data = {};
    ['paket_id','status','expired_at','nama','alamat','nama_kota'].forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    await dbUpdate('sekolah', data, 'id = ?', [req.params.id]);
    res.json({ success: true, message: 'Pesantren berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate pesantren' }); }
});

// Delete sekolah (careful!)
router.delete('/sekolah/:id', requireSuperAdmin, async (req, res) => {
  try {
    await dbDelete('sekolah', 'id = ?', [req.params.id]);
    res.json({ success: true, message: 'Pesantren berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus pesantren' }); }
});

// Activate (after payment)
router.post('/sekolah/:id/activate', requireSuperAdmin, async (req, res) => {
  try {
    const { months, paket_id } = req.body;
    const m = months || 1;
    const sekolah = await dbGet('SELECT * FROM sekolah WHERE id = ?', [req.params.id]);
    if (!sekolah) return res.status(404).json({ error: 'Sekolah tidak ditemukan' });

    let newExpiry = new Date();
    if (sekolah.expired_at && new Date(sekolah.expired_at) > new Date()) {
      newExpiry = new Date(sekolah.expired_at);
    }
    newExpiry.setMonth(newExpiry.getMonth() + m);

    const updateData = {
      status: 'aktif',
      expired_at: newExpiry.toISOString().slice(0, 19).replace('T', ' ')
    };
    if (paket_id) updateData.paket_id = paket_id;

    await dbUpdate('sekolah', updateData, 'id = ?', [req.params.id]);
    res.json({ success: true, message: `Pesantren diaktifkan selama ${m} bulan`, expired_at: newExpiry });
  } catch (err) { res.status(500).json({ error: 'Gagal mengaktifkan pesantren' }); }
});

// Suspend
router.post('/sekolah/:id/suspend', requireSuperAdmin, async (req, res) => {
  try {
    await dbUpdate('sekolah', { status: 'suspend' }, 'id = ?', [req.params.id]);
    res.json({ success: true, message: 'Pesantren berhasil disuspend' });
  } catch (err) { res.status(500).json({ error: 'Gagal suspend pesantren' }); }
});

// Extend trial
router.post('/sekolah/:id/extend-trial', requireSuperAdmin, async (req, res) => {
  try {
    const { days } = req.body;
    const d = days || 7;
    const sekolah = await dbGet('SELECT * FROM sekolah WHERE id = ?', [req.params.id]);
    if (!sekolah) return res.status(404).json({ error: 'Sekolah tidak ditemukan' });

    let newExpiry = new Date();
    if (sekolah.expired_at && new Date(sekolah.expired_at) > new Date()) {
      newExpiry = new Date(sekolah.expired_at);
    }
    newExpiry.setDate(newExpiry.getDate() + d);

    await dbUpdate('sekolah', {
      status: 'trial',
      expired_at: newExpiry.toISOString().slice(0, 19).replace('T', ' ')
    }, 'id = ?', [req.params.id]);
    res.json({ success: true, message: `Trial diperpanjang ${d} hari` });
  } catch (err) { res.status(500).json({ error: 'Gagal memperpanjang trial' }); }
});

// ============ PAKET MANAGEMENT ============
router.get('/paket', requireSuperAdmin, async (req, res) => {
  try {
    const rows = await dbQuery('SELECT * FROM paket ORDER BY harga_bulan');
    rows.forEach(r => { if (typeof r.fitur === 'string') try { r.fitur = JSON.parse(r.fitur); } catch(e) { r.fitur = {}; } });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/paket', requireSuperAdmin, async (req, res) => {
  try {
    const { nama, harga_bulan, max_santri, max_users, fitur, deskripsi } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama paket harus diisi' });
    const id = await dbInsert('paket', {
      nama, harga_bulan: harga_bulan || 0, max_santri: max_santri || 200, max_users: max_users || 20,
      fitur: typeof fitur === 'string' ? fitur : JSON.stringify(fitur || {}), deskripsi: deskripsi || ''
    });
    res.json({ success: true, id, message: 'Paket berhasil dibuat' });
  } catch (err) { res.status(500).json({ error: 'Gagal membuat paket' }); }
});

router.put('/paket/:id', requireSuperAdmin, async (req, res) => {
  try {
    const data = {};
    ['nama','harga_bulan','max_santri','max_users','deskripsi','is_active'].forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    if (req.body.fitur !== undefined) data.fitur = typeof req.body.fitur === 'string' ? req.body.fitur : JSON.stringify(req.body.fitur);
    await dbUpdate('paket', data, 'id = ?', [req.params.id]);
    res.json({ success: true, message: 'Paket berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate paket' }); }
});

module.exports = router;
