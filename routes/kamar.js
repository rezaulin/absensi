const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdmin } = require('../middleware/admin');

// List kamar with ustadz pengawas
router.get('/', async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT k.*, u.nama as ustadz_nama,
              (SELECT COUNT(*) FROM santri s WHERE s.kamar_id = k.id AND s.status = 'aktif') as jumlah_santri
       FROM kamar k
       LEFT JOIN users u ON k.ustadz_id = u.id
       WHERE k.sekolah_id = ? ORDER BY k.nama`,
      [req.sekolah_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data kamar' });
  }
});

// Get single kamar with santri list
router.get('/:id', async (req, res) => {
  try {
    const row = await dbGet('SELECT * FROM kamar WHERE id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!row) return res.status(404).json({ error: 'Kamar tidak ditemukan' });
    const santri = await dbQuery('SELECT id, nama, nis FROM santri WHERE kamar_id = ? AND sekolah_id = ? AND status = "aktif" ORDER BY nama', [req.params.id, req.sekolah_id]);
    row.santri = santri;
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get santri available to be assigned to this kamar (not in any kamar or in a different kamar)
router.get('/:id/available-santri', async (req, res) => {
  try {
    const rows = await dbQuery(
      `SELECT id, nama, nis FROM santri 
       WHERE sekolah_id = ? AND status = 'aktif' AND (kamar_id IS NULL OR kamar_id != ?)
       ORDER BY nama`,
      [req.sekolah_id, req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil data santri' });
  }
});

// Create kamar
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { nama, kapasitas, gedung, lantai, keterangan, ustadz_id } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama kamar harus diisi' });
    const id = await dbInsert('kamar', {
      sekolah_id: req.sekolah_id, nama, kapasitas: kapasitas || 20,
      gedung: gedung || '', lantai: lantai || '', keterangan: keterangan || '',
      ustadz_id: ustadz_id || null
    });
    res.json({ success: true, id, message: 'Kamar berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menambah kamar' });
  }
});

// Update kamar
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const data = {};
    ['nama','kapasitas','gedung','lantai','keterangan','ustadz_id'].forEach(f => {
      if (req.body[f] !== undefined) data[f] = f === 'ustadz_id' ? (req.body[f] || null) : req.body[f];
    });
    const affected = await dbUpdate('kamar', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Kamar tidak ditemukan' });
    res.json({ success: true, message: 'Kamar berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengupdate kamar' });
  }
});

// Delete kamar
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await dbUpdate('santri', { kamar_id: null }, 'kamar_id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    const affected = await dbDelete('kamar', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Kamar tidak ditemukan' });
    res.json({ success: true, message: 'Kamar berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus kamar' });
  }
});

// Assign santri to kamar (set santri.kamar_id)
router.post('/:id/santri', requireAdmin, async (req, res) => {
  try {
    const { santri_ids } = req.body;
    if (!Array.isArray(santri_ids) || santri_ids.length === 0) {
      return res.status(400).json({ error: 'Pilih minimal 1 santri' });
    }

    // Check kamar exists
    const kamar = await dbGet('SELECT * FROM kamar WHERE id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!kamar) return res.status(404).json({ error: 'Kamar tidak ditemukan' });

    // Check capacity
    const current = await dbGet('SELECT COUNT(*) as cnt FROM santri WHERE kamar_id = ? AND sekolah_id = ? AND status = "aktif"', [req.params.id, req.sekolah_id]);
    if (current.cnt + santri_ids.length > kamar.kapasitas) {
      return res.status(400).json({ error: `Kapasitas kamar penuh. Sisa: ${kamar.kapasitas - current.cnt}` });
    }

    let added = 0;
    for (const sid of santri_ids) {
      const affected = await dbUpdate('santri', { kamar_id: req.params.id }, 'id = ? AND sekolah_id = ?', [sid, req.sekolah_id]);
      if (affected) added++;
    }
    res.json({ success: true, added, message: `${added} santri ditambahkan ke kamar` });
  } catch (err) {
    console.error('Assign santri to kamar error:', err);
    res.status(500).json({ error: 'Gagal menambah santri ke kamar' });
  }
});

// Remove santri from kamar (set santri.kamar_id = null)
router.delete('/:id/santri/:santriId', requireAdmin, async (req, res) => {
  try {
    const affected = await dbUpdate('santri', { kamar_id: null }, 'id = ? AND kamar_id = ? AND sekolah_id = ?', [req.params.santriId, req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Santri tidak ditemukan di kamar ini' });
    res.json({ success: true, message: 'Santri dihapus dari kamar' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus santri dari kamar' });
  }
});

module.exports = router;
