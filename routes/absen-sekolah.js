const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate } = require('../db');
const { requireAdminOrUstadz } = require('../middleware/admin');

// Get absen sekolah by date + optional kelas
router.get('/', async (req, res) => {
  try {
    const { tanggal, kelas_id } = req.query;
    if (!tanggal) return res.status(400).json({ error: 'Tanggal harus diisi' });
    let sql = `SELECT ab.*, s.nama as santri_nama, s.nis, ks.nama as kelas_nama
               FROM absen_sekolah ab
               JOIN santri s ON ab.santri_id = s.id
               LEFT JOIN kelas_sekolah ks ON ab.kelas_id = ks.id
               WHERE ab.sekolah_id = ? AND ab.tanggal = ?`;
    const vals = [req.sekolah_id, tanggal];
    if (kelas_id) { sql += ' AND ab.kelas_id = ?'; vals.push(kelas_id); }
    sql += ' ORDER BY s.nama';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil absen sekolah' }); }
});

// Bulk save
router.post('/', requireAdminOrUstadz, async (req, res) => {
  try {
    const { tanggal, kelas_id, data } = req.body;
    if (!tanggal || !Array.isArray(data)) return res.status(400).json({ error: 'Data tidak valid' });
    let saved = 0;
    for (const item of data) {
      const existing = await dbGet(
        'SELECT id FROM absen_sekolah WHERE sekolah_id = ? AND santri_id = ? AND tanggal = ?',
        [req.sekolah_id, item.santri_id, tanggal]
      );
      if (existing) {
        await dbUpdate('absen_sekolah', { status: item.status, keterangan: item.keterangan || '' }, 'id = ?', [existing.id]);
      } else {
        await dbInsert('absen_sekolah', {
          sekolah_id: req.sekolah_id, santri_id: item.santri_id, kelas_id: kelas_id || null,
          tanggal, status: item.status, keterangan: item.keterangan || '', dicatat_oleh: req.user.id
        });
      }
      saved++;
    }
    res.json({ success: true, saved, message: 'Absen sekolah berhasil disimpan' });
  } catch (err) { res.status(500).json({ error: 'Gagal menyimpan absen sekolah' }); }
});

// Rekap per bulan
router.get('/rekap', async (req, res) => {
  try {
    const { bulan, tahun, kelas_id } = req.query;
    if (!bulan || !tahun) return res.status(400).json({ error: 'Bulan dan tahun harus diisi' });
    let sql = `SELECT s.id, s.nama, s.nis,
              SUM(CASE WHEN ab.status = 'hadir' THEN 1 ELSE 0 END) as hadir,
              SUM(CASE WHEN ab.status = 'izin' THEN 1 ELSE 0 END) as izin,
              SUM(CASE WHEN ab.status = 'sakit' THEN 1 ELSE 0 END) as sakit,
              SUM(CASE WHEN ab.status = 'alpha' THEN 1 ELSE 0 END) as alpha
       FROM santri s LEFT JOIN absen_sekolah ab ON s.id = ab.santri_id AND MONTH(ab.tanggal) = ? AND YEAR(ab.tanggal) = ?
       WHERE s.sekolah_id = ? AND s.status = 'aktif'`;
    const vals = [bulan, tahun, req.sekolah_id];
    if (kelas_id) { sql += ' AND s.kelas_id = ?'; vals.push(kelas_id); }
    sql += ' GROUP BY s.id ORDER BY s.nama';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil rekap' }); }
});

module.exports = router;
