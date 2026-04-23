const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdmin } = require('../middleware/admin');

router.get('/', async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT k.*, (SELECT COUNT(*) FROM santri s WHERE s.kelas_id = k.id AND s.status = 'aktif') as jumlah_santri
       FROM kelas_sekolah k WHERE k.sekolah_id = ? ORDER BY k.tingkat, k.nama`,
      [req.sekolah_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil data kelas' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await dbGet('SELECT * FROM kelas_sekolah WHERE id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!row) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
    const santri = await dbQuery('SELECT id, nama, nis FROM santri WHERE kelas_id = ? AND sekolah_id = ? AND status = "aktif" ORDER BY nama', [req.params.id, req.sekolah_id]);
    row.santri = santri;
    res.json(row);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { nama, tingkat, wali_kelas_id, keterangan } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama kelas harus diisi' });
    const id = await dbInsert('kelas_sekolah', {
      sekolah_id: req.sekolah_id, nama, tingkat: tingkat || '', wali_kelas_id: wali_kelas_id || null, keterangan: keterangan || ''
    });
    res.json({ success: true, id, message: 'Kelas berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ error: 'Gagal menambah kelas' }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const data = {};
    ['nama','tingkat','wali_kelas_id','keterangan'].forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    const affected = await dbUpdate('kelas_sekolah', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
    res.json({ success: true, message: 'Kelas berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate kelas' }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await dbUpdate('santri', { kelas_id: null }, 'kelas_id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    const affected = await dbDelete('kelas_sekolah', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Kelas tidak ditemukan' });
    res.json({ success: true, message: 'Kelas berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus kelas' }); }
});

// Get available santri (not in this kelas)
router.get('/:id/available-santri', async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT id, nama, nis FROM santri 
       WHERE sekolah_id = ? AND status = 'aktif' AND (kelas_id IS NULL OR kelas_id != ?)
       ORDER BY nama`,
      [req.sekolah_id, req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data santri' });
  }
});

// Assign santri to kelas
router.post('/:id/santri', requireAdmin, async (req, res) => {
  try {
    const { santri_ids } = req.body;
    if (!Array.isArray(santri_ids) || santri_ids.length === 0) {
      return res.status(400).json({ error: 'Pilih minimal 1 santri' });
    }
    const kelas = await dbGet('SELECT * FROM kelas_sekolah WHERE id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });

    let added = 0;
    for (const sid of santri_ids) {
      const affected = await dbUpdate('santri', { kelas_id: req.params.id }, 'id = ? AND sekolah_id = ?', [sid, req.sekolah_id]);
      if (affected) added++;
    }
    res.json({ success: true, added, message: `${added} santri ditambahkan ke kelas` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menambah santri ke kelas' });
  }
});

// Remove santri from kelas
router.delete('/:id/santri/:santriId', requireAdmin, async (req, res) => {
  try {
    const affected = await dbUpdate('santri', { kelas_id: null }, 'id = ? AND kelas_id = ? AND sekolah_id = ?', [req.params.santriId, req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Santri tidak ditemukan di kelas ini' });
    res.json({ success: true, message: 'Santri dihapus dari kelas' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus santri dari kelas' });
  }
});

module.exports = router;
