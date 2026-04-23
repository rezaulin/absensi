const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdminOrUstadz } = require('../middleware/admin');

router.get('/', async (req, res) => {
  try {
    const { santri_id, tanggal_dari, tanggal_sampai } = req.query;
    let sql = `SELECT p.*, s.nama as santri_nama, s.nis, u.nama as pelapor_nama
               FROM pelanggaran p JOIN santri s ON p.santri_id = s.id
               LEFT JOIN users u ON p.dilaporkan_oleh = u.id
               WHERE p.sekolah_id = ?`;
    const vals = [req.sekolah_id];
    if (santri_id) { sql += ' AND p.santri_id = ?'; vals.push(santri_id); }
    if (tanggal_dari) { sql += ' AND p.tanggal >= ?'; vals.push(tanggal_dari); }
    if (tanggal_sampai) { sql += ' AND p.tanggal <= ?'; vals.push(tanggal_sampai); }
    sql += ' ORDER BY p.tanggal DESC, p.created_at DESC';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil data pelanggaran' }); }
});

router.post('/', requireAdminOrUstadz, async (req, res) => {
  try {
    const { santri_id, jenis, poin, keterangan, tanggal } = req.body;
    if (!santri_id || !jenis || !tanggal) return res.status(400).json({ error: 'Santri, jenis, dan tanggal harus diisi' });
    const id = await dbInsert('pelanggaran', {
      sekolah_id: req.sekolah_id, santri_id, jenis, poin: poin || 0,
      keterangan: keterangan || '', tanggal, dilaporkan_oleh: req.user.id
    });
    res.json({ success: true, id, message: 'Pelanggaran berhasil dicatat' });
  } catch (err) { res.status(500).json({ error: 'Gagal mencatat pelanggaran' }); }
});

router.put('/:id', requireAdminOrUstadz, async (req, res) => {
  try {
    const data = {};
    ['jenis','poin','keterangan','tanggal'].forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    await dbUpdate('pelanggaran', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Pelanggaran berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate pelanggaran' }); }
});

router.delete('/:id', requireAdminOrUstadz, async (req, res) => {
  try {
    await dbDelete('pelanggaran', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Pelanggaran berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus pelanggaran' }); }
});

// Ranking pelanggaran
router.get('/ranking', async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT s.id, s.nama, s.nis, COUNT(p.id) as jumlah, COALESCE(SUM(p.poin),0) as total_poin
       FROM santri s JOIN pelanggaran p ON s.id = p.santri_id
       WHERE p.sekolah_id = ? GROUP BY s.id ORDER BY total_poin DESC LIMIT 20`,
      [req.sekolah_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
