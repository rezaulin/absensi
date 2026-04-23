const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { requireAdmin } = require('../middleware/admin');

// ============ JADWAL UMUM (harian) ============

// List jadwal umum, optional filter by hari
router.get('/umum', async (req, res) => {
  try {
    const { hari } = req.query;
    let sql = `SELECT j.*, k.nama as kegiatan_nama
               FROM jadwal_umum j LEFT JOIN kegiatan k ON j.kegiatan_id = k.id
               WHERE j.sekolah_id = ?`;
    const vals = [req.sekolah_id];
    if (hari) { sql += ' AND j.hari = ?'; vals.push(hari); }
    sql += ' ORDER BY FIELD(j.hari,"senin","selasa","rabu","kamis","jumat","sabtu","minggu"), j.jam_mulai';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil jadwal' }); }
});

// Create jadwal umum
router.post('/umum', requireAdmin, async (req, res) => {
  try {
    const { kegiatan_id, hari, jam_mulai, jam_selesai, keterangan } = req.body;
    if (!kegiatan_id || !hari || !jam_mulai || !jam_selesai) {
      return res.status(400).json({ error: 'Kegiatan, hari, jam mulai dan jam selesai harus diisi' });
    }
    const id = await dbInsert('jadwal_umum', {
      sekolah_id: req.sekolah_id, kegiatan_id, hari, jam_mulai, jam_selesai, keterangan: keterangan || ''
    });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: 'Gagal menambah jadwal' }); }
});

// Update jadwal umum
router.put('/umum/:id', requireAdmin, async (req, res) => {
  try {
    const data = {};
    ['kegiatan_id','hari','jam_mulai','jam_selesai','keterangan'].forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    await dbUpdate('jadwal_umum', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Jadwal berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate jadwal' }); }
});

// Delete jadwal umum
router.delete('/umum/:id', requireAdmin, async (req, res) => {
  try {
    await dbDelete('jadwal_umum', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Jadwal berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus jadwal' }); }
});

// ============ JADWAL SEKOLAH (per kelas) ============

router.get('/sekolah', async (req, res) => {
  try {
    const { kelas_id, hari } = req.query;
    let sql = `SELECT j.*, ks.nama as kelas_nama, u.nama as ustadz_nama
               FROM jadwal_sekolah j
               LEFT JOIN kelas_sekolah ks ON j.kelas_id = ks.id
               LEFT JOIN users u ON j.ustadz_id = u.id
               WHERE j.sekolah_id = ?`;
    const vals = [req.sekolah_id];
    if (kelas_id) { sql += ' AND j.kelas_id = ?'; vals.push(kelas_id); }
    if (hari) { sql += ' AND j.hari = ?'; vals.push(hari); }
    sql += ' ORDER BY FIELD(j.hari,"senin","selasa","rabu","kamis","jumat","sabtu","minggu"), j.jam_mulai';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Gagal mengambil jadwal sekolah' }); }
});

router.post('/sekolah', requireAdmin, async (req, res) => {
  try {
    const { kelas_id, hari, mata_pelajaran, jam_mulai, jam_selesai, ustadz_id } = req.body;
    if (!kelas_id || !hari || !mata_pelajaran || !jam_mulai || !jam_selesai) {
      return res.status(400).json({ error: 'Semua field harus diisi' });
    }
    const id = await dbInsert('jadwal_sekolah', {
      sekolah_id: req.sekolah_id, kelas_id, hari, mata_pelajaran, jam_mulai, jam_selesai, ustadz_id: ustadz_id || null
    });
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: 'Gagal menambah jadwal sekolah' }); }
});

router.put('/sekolah/:id', requireAdmin, async (req, res) => {
  try {
    const data = {};
    ['kelas_id','hari','mata_pelajaran','jam_mulai','jam_selesai','ustadz_id'].forEach(f => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });
    await dbUpdate('jadwal_sekolah', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Jadwal sekolah berhasil diupdate' });
  } catch (err) { res.status(500).json({ error: 'Gagal mengupdate jadwal sekolah' }); }
});

router.delete('/sekolah/:id', requireAdmin, async (req, res) => {
  try {
    await dbDelete('jadwal_sekolah', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    res.json({ success: true, message: 'Jadwal sekolah berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: 'Gagal menghapus jadwal sekolah' }); }
});

// Get today's jadwal (auto-detect)
router.get('/hari-ini', async (req, res) => {
  try {
    const days = ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'];
    const today = days[new Date().getDay()];
    const jadwal = await dbQuery(
      `SELECT j.*, k.nama as kegiatan_nama FROM jadwal_umum j
       LEFT JOIN kegiatan k ON j.kegiatan_id = k.id
       WHERE j.sekolah_id = ? AND j.hari = ? ORDER BY j.jam_mulai`,
      [req.sekolah_id, today]
    );
    res.json({ hari: today, jadwal });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
