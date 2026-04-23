const { dbGet, dbUpdate } = require('../db');

// ============================================================
// Resolve tenant from subdomain
// ============================================================
function resolveTenant(req, res, next) {
  const host = req.hostname || req.headers.host || '';
  const domain = process.env.DOMAIN || 'e-pesantren.app';
  const parts = host.split('.');

  let slug = null;

  // Extract subdomain: subdomain.domain.com -> subdomain
  if (parts.length >= 3) {
    slug = parts[0];
  } else if (parts.length === 2 && !host.includes(domain)) {
    slug = parts[0];
  }

  // Fallback for localhost testing: X-Tenant-Slug header or ?slug= query
  if (!slug && req.headers['x-tenant-slug']) {
    slug = req.headers['x-tenant-slug'];
  }
  if (!slug && req.query.slug) {
    slug = req.query.slug;
  }

  // Skip tenant for super admin, static files, and public endpoints
  const skipPaths = [
    '/api/super',
    '/api/cek-slug',
    '/api/register-public'
  ];
  const skipExact = ['/', '/index.html', '/login.html', '/app.html', '/manifest.json', '/sw.js'];

  if (skipExact.includes(req.path) || skipPaths.some(p => req.path.startsWith(p))) {
    req.tenantSlug = slug;
    return next();
  }

  // Static files (css, js, images, fonts)
  if (/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|webm|mp4)$/i.test(req.path)) {
    return next();
  }

  if (!slug) {
    if (req.path.startsWith('/api/')) {
      return res.status(400).json({
        error: 'Tenant tidak ditemukan. Gunakan subdomain yang valid.',
        hint: 'Contoh: darul-ulum.e-pesantren.app'
      });
    }
    return next();
  }

  req.tenantSlug = slug;
  next();
}

// ============================================================
// Load tenant data from database
// ============================================================
async function loadTenant(req, res, next) {
  if (req.sekolah) return next();

  const slug = req.tenantSlug || req.headers['x-tenant-slug'] || req.query.slug;
  if (!slug) {
    return res.status(400).json({ error: 'Tenant tidak ditemukan' });
  }

  try {
    const sekolah = await dbGet(
      `SELECT s.*, p.nama as paket_nama, p.harga_bulan, p.max_santri, p.max_users, p.fitur
       FROM sekolah s
       LEFT JOIN paket p ON s.paket_id = p.id
       WHERE s.slug = ?`,
      [slug]
    );

    if (!sekolah) {
      return res.status(404).json({ error: 'Pesantren tidak ditemukan' });
    }

    // Parse fitur JSON
    if (typeof sekolah.fitur === 'string') {
      try { sekolah.fitur = JSON.parse(sekolah.fitur); }
      catch (e) { sekolah.fitur = {}; }
    }

    req.sekolah = sekolah;
    req.sekolah_id = sekolah.id;
    next();
  } catch (err) {
    console.error('loadTenant error:', err);
    res.status(500).json({ error: 'Gagal memuat data pesantren' });
  }
}

// ============================================================
// Check if subscription is expired
// ============================================================
function checkExpired(req, res, next) {
  const sekolah = req.sekolah;
  if (!sekolah) return res.status(400).json({ error: 'Tenant belum dimuat' });

  // Super admin bypass
  if (req.user && req.user.role === 'superadmin') return next();

  if (sekolah.status === 'suspend') {
    return res.status(403).json({
      error: 'Akun pesantren ini telah disuspend. Hubungi administrator.',
      code: 'SUSPENDED'
    });
  }

  if (sekolah.expired_at && new Date(sekolah.expired_at) < new Date()) {
    // Auto-suspend expired accounts
    dbUpdate('sekolah', { status: 'suspend' }, 'id = ?', [sekolah.id]).catch(() => {});
    return res.status(403).json({
      error: 'Masa berlangganan telah habis. Silakan perpanjang untuk melanjutkan.',
      code: 'EXPIRED'
    });
  }

  next();
}

// ============================================================
// Check feature access based on subscription plan
// ============================================================
function checkFeature(fiturName) {
  return (req, res, next) => {
    const sekolah = req.sekolah;
    if (!sekolah) return res.status(400).json({ error: 'Tenant belum dimuat' });

    // Super admin bypass
    if (req.user && req.user.role === 'superadmin') return next();

    const fitur = sekolah.fitur || {};
    if (!fitur[fiturName]) {
      return res.status(403).json({
        error: `Fitur "${fiturName}" tidak tersedia di paket ${sekolah.paket_nama}. Silakan upgrade paket Anda.`,
        code: 'FEATURE_LOCKED',
        required_upgrade: true
      });
    }
    next();
  };
}

// ============================================================
// Check quota (max santri / max users)
// ============================================================
function checkQuota(tipe) {
  return async (req, res, next) => {
    const sekolah = req.sekolah;
    if (!sekolah) return res.status(400).json({ error: 'Tenant belum dimuat' });

    // Super admin bypass
    if (req.user && req.user.role === 'superadmin') return next();

    try {
      let count, max;
      if (tipe === 'santri') {
        const row = await dbGet(
          'SELECT COUNT(*) as cnt FROM santri WHERE sekolah_id = ? AND status = "aktif"',
          [sekolah.id]
        );
        count = row.cnt;
        max = sekolah.max_santri;
      } else if (tipe === 'users') {
        const row = await dbGet(
          'SELECT COUNT(*) as cnt FROM users WHERE sekolah_id = ? AND status = "aktif"',
          [sekolah.id]
        );
        count = row.cnt;
        max = sekolah.max_users;
      }

      if (count >= max) {
        return res.status(403).json({
          error: `Kuota ${tipe} telah tercapai (${count}/${max}). Silakan upgrade paket Anda.`,
          code: 'QUOTA_EXCEEDED',
          current: count,
          max: max
        });
      }
      next();
    } catch (err) {
      console.error('checkQuota error:', err);
      next();
    }
  };
}

module.exports = { resolveTenant, loadTenant, checkExpired, checkFeature, checkQuota };
