const express = require('express');
const router = express.Router();
const { dbGet, dbUpdate } = require('../db');
const { requireAdmin } = require('../middleware/admin');

// Get tenant settings
router.get('/', async (req, res) => {
  try {
    const s = req.sekolah;
    res.json({
      id: s.id, nama: s.nama, slug: s.slug, alamat: s.alamat,
      kepala_nama: s.kepala_nama, nama_kota: s.nama_kota,
      no_telp: s.no_telp, email: s.email,
      logo: s.logo, background: s.background, dashboard_bg: s.dashboard_bg,
      app_name: s.app_name, paket_nama: s.paket_nama, status: s.status,
      expired_at: s.expired_at, max_santri: s.max_santri, max_users: s.max_users, fitur: s.fitur
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Update settings
router.put('/', requireAdmin, async (req, res) => {
  try {
    const data = {};
    ['nama','alamat','kepala_nama','nama_kota','no_telp','email','logo','background','dashboard_bg','app_name'].forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Tidak ada data untuk diupdate' });
    await dbUpdate('sekolah', data, 'id = ?', [req.sekolah_id]);
    res.json({ success: true, message: 'Pengaturan berhasil disimpan' });
  } catch (err) { res.status(500).json({ error: 'Gagal menyimpan pengaturan' }); }
});

module.exports = router;
