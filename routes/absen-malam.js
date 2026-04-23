const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate } = require('../db');
const { requireAdminOrUstadz } = require('../middleware/admin');

// Get absen malam by date
router.get('/', async (req, res) => {
  try {
    const { tanggal, kamar_id } = req.query;
    if (!tanggal) return res.status(400).json({ error: 'Tanggal harus diisi' });
    let sql = `SELECT am.*, s.nama as santri_nama, s.nis, k.nama as kamar_nama
               FROM absen_malam am
               JOIN santri s ON am.santri_id = s.id
               LEFT JOIN kamar k ON s.kamar_id = k.id
               WHERE am.sekolah_id = ? AND am.tanggal = ?`;
    const vals = [req.sekolah_id, tanggal];
    if (kamar_id) { sql += ' AND s.kamar_id = ?'; vals.push(kamar_id); }
    sql += ' ORDER BY s.nama';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil absen malam' }); }
});

// Bulk save absen malam
router.post('/', requireAdminOrUstadz, async (req, res) => {
  try {
    const { tanggal, data } = req.body;
    if (!tanggal || !Array.isArray(data)) return res.status(400).json({ error: 'Data tidak valid' });
    let saved = 0;
    for (const item of data) {
      const existing = await dbGet(
        'SELECT id FROM absen_malam WHERE sekolah_id = ? AND santri_id = ? AND tanggal = ?',
        [req.sekolah_id, item.santri_id, tanggal]
      );
      if (existing) {
        await dbUpdate('absen_malam', { status: item.status, keterangan: item.keterangan || '' }, 'id = ?', [existing.id]);
      } else {
        await dbInsert('absen_malam', {
          sekolah_id: req.sekolah_id, santri_id: item.santri_id, tanggal,
          status: item.status, keterangan: item.keterangan || '', dicatat_oleh: req.user.id
        });
      }
      saved++;
    }
    res.json({ success: true, saved, message: 'Absen malam berhasil disimpan' });
  } catch (err) {
    console.error('Save absen malam error:', err);
    res.status(500).json({ error: 'Gagal menyimpan absen malam' });
  }
});

// Rekap absen malam per bulan
router.get('/rekap', async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    if (!bulan || !tahun) return res.status(400).json({ error: 'Bulan dan tahun harus diisi' });
    const rows = await dbQuery(
      `SELECT s.id, s.nama, s.nis,
              SUM(CASE WHEN am.status = 'hadir' THEN 1 ELSE 0 END) as hadir,
              SUM(CASE WHEN am.status = 'izin' THEN 1 ELSE 0 END) as izin,
              SUM(CASE WHEN am.status = 'sakit' THEN 1 ELSE 0 END) as sakit,
              SUM(CASE WHEN am.status = 'alpha' THEN 1 ELSE 0 END) as alpha
       FROM santri s LEFT JOIN absen_malam am ON s.id = am.santri_id AND MONTH(am.tanggal) = ? AND YEAR(am.tanggal) = ?
       WHERE s.sekolah_id = ? AND s.status = 'aktif'
       GROUP BY s.id ORDER BY s.nama`,
      [bulan, tahun, req.sekolah_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil rekap' }); }
});

module.exports = router;
