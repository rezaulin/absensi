const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdminOrUstadz } = require('../middleware/admin');

// Get sesi list
router.get('/sesi', async (req, res) => {
  try {
    const { tanggal, kegiatan_id, kelompok_id } = req.query;
    let sql = `SELECT a.*, k.nama as kegiatan_nama, kl.nama as kelompok_nama, u.nama as dibuka_nama
               FROM absensi_sesi a
               LEFT JOIN kegiatan k ON a.kegiatan_id = k.id
               LEFT JOIN kelompok kl ON a.kelompok_id = kl.id
               LEFT JOIN users u ON a.dibuka_oleh = u.id
               WHERE a.sekolah_id = ?`;
    const vals = [req.sekolah_id];
    if (tanggal) { sql += ' AND a.tanggal = ?'; vals.push(tanggal); }
    if (kegiatan_id) { sql += ' AND a.kegiatan_id = ?'; vals.push(kegiatan_id); }
    if (kelompok_id) { sql += ' AND a.kelompok_id = ?'; vals.push(kelompok_id); }
    sql += ' ORDER BY a.tanggal DESC, a.created_at DESC';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil sesi absensi' }); }
});

// Open new sesi
router.post('/sesi', requireAdminOrUstadz, async (req, res) => {
  try {
    const { kegiatan_id, kelompok_id, tanggal } = req.body;
    if (!kegiatan_id || !tanggal) return res.status(400).json({ error: 'Kegiatan dan tanggal harus diisi' });
    const id = await dbInsert('absensi_sesi', {
      sekolah_id: req.sekolah_id, kegiatan_id, kelompok_id: kelompok_id || null,
      tanggal, dibuka_oleh: req.user.id, status: 'buka'
    });
    res.json({ success: true, id, message: 'Sesi absensi dibuka' });
  } catch (err) { res.status(500).json({ error: 'Gagal membuka sesi absensi' }); }
});

// Close sesi
router.put('/sesi/:id/tutup', requireAdminOrUstadz, async (req, res) => {
  try {
    await dbUpdate('absensi_sesi', {
      status: 'tutup',
      waktu_tutup: new Date().toISOString().slice(0, 19).replace('T', ' ')
    }, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Sesi absensi ditutup' });
  } catch (err) { res.status(500).json({ error: 'Gagal menutup sesi' }); }
});

// Get sesi detail + absensi records
router.get('/sesi/:id', async (req, res) => {
  try {
    const sesi = await dbGet(
      `SELECT a.*, k.nama as kegiatan_nama, kl.nama as kelompok_nama
       FROM absensi_sesi a LEFT JOIN kegiatan k ON a.kegiatan_id = k.id LEFT JOIN kelompok kl ON a.kelompok_id = kl.id
       WHERE a.id = ? AND a.sekolah_id = ?`,
      [req.params.id, req.sekolah_id]
    );
    if (!sesi) return res.status(404).json({ error: 'Sesi tidak ditemukan' });

    const absensi = await dbQuery(
      `SELECT ab.*, s.nama as santri_nama, s.nis FROM absensi ab
       JOIN santri s ON ab.santri_id = s.id
       WHERE ab.sesi_id = ? AND ab.sekolah_id = ? ORDER BY s.nama`,
      [req.params.id, req.sekolah_id]
    );

    res.json({ ...sesi, absensi });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Bulk save absensi
router.post('/bulk', requireAdminOrUstadz, async (req, res) => {
  try {
    const { sesi_id, data } = req.body;
    if (!sesi_id || !Array.isArray(data)) return res.status(400).json({ error: 'Data tidak valid' });

    let saved = 0;
    for (const item of data) {
      const existing = await dbGet(
        'SELECT id FROM absensi WHERE sekolah_id = ? AND sesi_id = ? AND santri_id = ?',
        [req.sekolah_id, sesi_id, item.santri_id]
      );
      if (existing) {
        await dbUpdate('absensi', { status: item.status, keterangan: item.keterangan || '' }, 'id = ?', [existing.id]);
      } else {
        await dbInsert('absensi', {
          sekolah_id: req.sekolah_id, sesi_id, santri_id: item.santri_id,
          status: item.status, keterangan: item.keterangan || ''
        });
      }
      saved++;
    }
    res.json({ success: true, saved, message: 'Absensi berhasil disimpan' });
  } catch (err) {
    console.error('Bulk absensi error:', err);
    res.status(500).json({ error: 'Gagal menyimpan absensi' });
  }
});

// Get santri list by kelompok (for attendance form)
router.get('/kelompok/:kelompokId', async (req, res) => {
  try {
    const kelompok = await dbGet('SELECT * FROM kelompok WHERE id = ? AND sekolah_id = ?', [req.params.kelompokId, req.sekolah_id]);
    if (!kelompok) return res.status(404).json({ error: 'Kelompok tidak ditemukan' });
    const santri = await dbQuery(
      `SELECT s.* FROM santri s JOIN santri_kelompok sk ON s.id = sk.santri_id
       WHERE sk.kelompok_id = ? AND sk.sekolah_id = ? AND s.status = 'aktif' ORDER BY s.nama`,
      [req.params.kelompokId, req.sekolah_id]
    );
    res.json({ kelompok, santri });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Get kegiatan list for absensi
router.get('/kegiatan', async (req, res) => {
  try {
    const rows = await dbQuery('SELECT * FROM kegiatan WHERE sekolah_id = ? AND is_active = 1 ORDER BY nama', [req.sekolah_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Delete sesi
router.delete('/sesi/:id', requireAdminOrUstadz, async (req, res) => {
  try {
    await dbDelete('absensi', 'sesi_id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    await dbDelete('absensi_sesi', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Sesi absensi berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus sesi' }); }
});

module.exports = router;
