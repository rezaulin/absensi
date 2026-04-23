const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdmin } = require('../middleware/admin');

router.get('/', async (req, res) => {
  try {
    const rows = await dbQuery('SELECT * FROM kegiatan WHERE sekolah_id = ? ORDER BY nama', [req.sekolah_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil data kegiatan' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await dbGet('SELECT * FROM kegiatan WHERE id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!row) return res.status(404).json({ error: 'Kegiatan tidak ditemukan' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { nama, jenis, jam_mulai, jam_selesai, keterangan } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama kegiatan harus diisi' });
    const id = await dbInsert('kegiatan', {
      sekolah_id: req.sekolah_id, nama, jenis: jenis || 'harian',
      jam_mulai: jam_mulai || null, jam_selesai: jam_selesai || null, keterangan: keterangan || ''
    });
    res.json({ success: true, id, message: 'Kegiatan berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ error: 'Gagal menambah kegiatan' }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const data = {};
    ['nama','jenis','jam_mulai','jam_selesai','keterangan','is_active'].forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    const affected = await dbUpdate('kegiatan', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Kegiatan tidak ditemukan' });
    res.json({ success: true, message: 'Kegiatan berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate kegiatan' }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const affected = await dbDelete('kegiatan', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Kegiatan tidak ditemukan' });
    res.json({ success: true, message: 'Kegiatan berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus kegiatan' }); }
});

module.exports = router;
