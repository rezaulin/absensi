const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdminOrUstadz } = require('../middleware/admin');

router.get('/', async (req, res) => {
  try {
    const { santri_id } = req.query;
    let sql = `SELECT p.*, s.nama as santri_nama, s.nis, u.nama as pelapor_nama
               FROM prestasi p JOIN santri s ON p.santri_id = s.id
               LEFT JOIN users u ON p.dilaporkan_oleh = u.id WHERE p.sekolah_id = ?`;
    const vals = [req.sekolah_id];
    if (santri_id) { sql += ' AND p.santri_id = ?'; vals.push(santri_id); }
    sql += ' ORDER BY p.tanggal DESC';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil data prestasi' }); }
});

router.post('/', requireAdminOrUstadz, async (req, res) => {
  try {
    const { santri_id, jenis, poin, keterangan, tanggal } = req.body;
    if (!santri_id || !jenis || !tanggal) return res.status(400).json({ error: 'Santri, jenis, dan tanggal harus diisi' });
    const id = await dbInsert('prestasi', {
      sekolah_id: req.sekolah_id, santri_id, jenis, poin: poin || 0,
      keterangan: keterangan || '', tanggal, dilaporkan_oleh: req.user.id
    });
    res.json({ success: true, id, message: 'Prestasi berhasil dicatat' });
  } catch (err) { res.status(500).json({ error: 'Gagal mencatat prestasi' }); }
});

router.put('/:id', requireAdminOrUstadz, async (req, res) => {
  try {
    const data = {};
    ['jenis','poin','keterangan','tanggal'].forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    await dbUpdate('prestasi', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Prestasi berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate prestasi' }); }
});

router.delete('/:id', requireAdminOrUstadz, async (req, res) => {
  try {
    await dbDelete('prestasi', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Prestasi berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus prestasi' }); }
});

module.exports = router;
