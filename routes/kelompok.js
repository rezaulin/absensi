const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdmin } = require('../middleware/admin');

// List kelompok
router.get('/', async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT kl.*, kg.nama as kegiatan_nama, u.nama as ustadz_nama,
              (SELECT COUNT(*) FROM santri_kelompok sk WHERE sk.kelompok_id = kl.id) as jumlah_santri
       FROM kelompok kl
       LEFT JOIN kegiatan kg ON kl.kegiatan_id = kg.id
       LEFT JOIN users u ON kl.ustadz_id = u.id
       WHERE kl.sekolah_id = ? ORDER BY kl.nama`,
      [req.sekolah_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil data kelompok' }); }
});

// Get kelompok + santri list
router.get('/:id', async (req, res) => {
  try {
    const row = await dbGet(
      `SELECT kl.*, kg.nama as kegiatan_nama, u.nama as ustadz_nama
       FROM kelompok kl LEFT JOIN kegiatan kg ON kl.kegiatan_id = kg.id LEFT JOIN users u ON kl.ustadz_id = u.id
       WHERE kl.id = ? AND kl.sekolah_id = ?`,
      [req.params.id, req.sekolah_id]
    );
    if (!row) return res.status(404).json({ error: 'Kelompok tidak ditemukan' });
    const santri = await dbQuery(
      `SELECT s.id, s.nama, s.nis FROM santri s
       JOIN santri_kelompok sk ON s.id = sk.santri_id
       WHERE sk.kelompok_id = ? AND sk.sekolah_id = ? AND s.status = 'aktif' ORDER BY s.nama`,
      [req.params.id, req.sekolah_id]
    );
    row.santri = santri;
    res.json(row);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Create kelompok
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { nama, kegiatan_id, ustadz_id, keterangan } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama kelompok harus diisi' });
    const id = await dbInsert('kelompok', {
      sekolah_id: req.sekolah_id, nama, kegiatan_id: kegiatan_id || null,
      ustadz_id: ustadz_id || null, keterangan: keterangan || ''
    });
    res.json({ success: true, id, message: 'Kelompok berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ error: 'Gagal menambah kelompok' }); }
});

// Update kelompok
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const data = {};
    ['nama','kegiatan_id','ustadz_id','keterangan'].forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f] || null;
    });
    if (req.body.nama) data.nama = req.body.nama;
    const affected = await dbUpdate('kelompok', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Kelompok tidak ditemukan' });
    res.json({ success: true, message: 'Kelompok berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate kelompok' }); }
});

// Delete kelompok
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await dbDelete('santri_kelompok', 'kelompok_id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    const affected = await dbDelete('kelompok', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Kelompok tidak ditemukan' });
    res.json({ success: true, message: 'Kelompok berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus kelompok' }); }
});

// Assign santri to kelompok
router.post('/:id/santri', requireAdmin, async (req, res) => {
  try {
    const { santri_ids } = req.body;
    if (!Array.isArray(santri_ids)) return res.status(400).json({ error: 'santri_ids harus array' });
    let added = 0;
    for (const sid of santri_ids) {
      try {
        await dbInsert('santri_kelompok', { sekolah_id: req.sekolah_id, santri_id: sid, kelompok_id: req.params.id });
        added++;
      } catch (e) { /* duplicate, skip */ }
    }
    res.json({ success: true, added, message: `${added} santri ditambahkan ke kelompok` });
  } catch (err) { res.status(500).json({ error: 'Gagal assign santri' }); }
});

// Remove santri from kelompok
router.delete('/:id/santri/:santriId', requireAdmin, async (req, res) => {
  try {
    await dbDelete('santri_kelompok', 'kelompok_id = ? AND santri_id = ? AND sekolah_id = ?',
      [req.params.id, req.params.santriId, req.sekolah_id]);
    res.json({ success: true, message: 'Santri dihapus dari kelompok' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus santri dari kelompok' }); }
});

module.exports = router;
