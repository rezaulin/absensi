const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdminOrUstadz } = require('../middleware/admin');

router.get('/', async (req, res) => {
  try {
    const role = req.user.role;
    let sql = `SELECT p.*, u.nama as dibuat_nama FROM pengumuman p
               LEFT JOIN users u ON p.dibuat_oleh = u.id WHERE p.sekolah_id = ?`;
    const vals = [req.sekolah_id];
    // Wali only sees 'semua' and 'wali' target
    if (role === 'wali') {
      sql += ' AND p.target IN ("semua","wali") AND p.aktif = "ya"';
    } else if (role === 'ustadz') {
      sql += ' AND p.target IN ("semua","ustadz") AND p.aktif = "ya"';
    }
    sql += ' ORDER BY p.tanggal DESC, p.created_at DESC';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil pengumuman' }); }
});

router.post('/', requireAdminOrUstadz, async (req, res) => {
  try {
    const { judul, isi, target, prioritas, tanggal } = req.body;
    if (!judul || !isi || !tanggal) return res.status(400).json({ error: 'Judul, isi, dan tanggal harus diisi' });
    const id = await dbInsert('pengumuman', {
      sekolah_id: req.sekolah_id, judul, isi, target: target || 'semua',
      prioritas: prioritas || 'normal', tanggal, dibuat_oleh: req.user.id
    });
    res.json({ success: true, id, message: 'Pengumuman berhasil dibuat' });
  } catch (err) { res.status(500).json({ error: 'Gagal membuat pengumuman' }); }
});

router.put('/:id', requireAdminOrUstadz, async (req, res) => {
  try {
    const data = {};
    ['judul','isi','target','prioritas','aktif','tanggal'].forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    await dbUpdate('pengumuman', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Pengumuman berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate pengumuman' }); }
});

router.delete('/:id', requireAdminOrUstadz, async (req, res) => {
  try {
    await dbDelete('pengumuman', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Pengumuman berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus pengumuman' }); }
});

module.exports = router;
