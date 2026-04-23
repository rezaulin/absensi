const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdminOrUstadz } = require('../middleware/admin');

router.get('/', async (req, res) => {
  try {
    const { santri_id, kategori } = req.query;
    let sql = `SELECT c.*, s.nama as santri_nama, s.nis, u.nama as ustadz_nama
               FROM catatan_guru c JOIN santri s ON c.santri_id = s.id
               LEFT JOIN users u ON c.ustadz_id = u.id WHERE c.sekolah_id = ?`;
    const vals = [req.sekolah_id];
    if (santri_id) { sql += ' AND c.santri_id = ?'; vals.push(santri_id); }
    if (kategori) { sql += ' AND c.kategori = ?'; vals.push(kategori); }
    sql += ' ORDER BY c.tanggal DESC';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil catatan' }); }
});

router.post('/', requireAdminOrUstadz, async (req, res) => {
  try {
    const { santri_id, judul, isi, kategori, tanggal } = req.body;
    if (!santri_id || !judul || !tanggal) return res.status(400).json({ error: 'Santri, judul, dan tanggal harus diisi' });
    const id = await dbInsert('catatan_guru', {
      sekolah_id: req.sekolah_id, santri_id, judul, isi: isi || '',
      kategori: kategori || 'lainnya', ustadz_id: req.user.id, tanggal
    });
    res.json({ success: true, id, message: 'Catatan berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ error: 'Gagal menambah catatan' }); }
});

router.put('/:id', requireAdminOrUstadz, async (req, res) => {
  try {
    const data = {};
    ['judul','isi','kategori','tanggal'].forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    await dbUpdate('catatan_guru', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Catatan berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate catatan' }); }
});

router.delete('/:id', requireAdminOrUstadz, async (req, res) => {
  try {
    await dbDelete('catatan_guru', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Catatan berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus catatan' }); }
});

module.exports = router;
