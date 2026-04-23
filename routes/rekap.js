const express = require('express');
const router = express.Router();
const { dbQuery, dbGet } = require('../db');
const { checkFeature } = require('../middleware/tenant');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Rekap absensi
router.get('/', async (req, res) => {
  try {
    const { bulan, tahun, kegiatan_id, kelompok_id, tipe } = req.query;
    if (!bulan || !tahun) return res.status(400).json({ error: 'Bulan dan tahun harus diisi' });

    let sql, vals;
    if (tipe === 'malam') {
      sql = `SELECT s.id, s.nama, s.nis,
              SUM(CASE WHEN am.status='hadir' THEN 1 ELSE 0 END) as hadir,
              SUM(CASE WHEN am.status='izin' THEN 1 ELSE 0 END) as izin,
              SUM(CASE WHEN am.status='sakit' THEN 1 ELSE 0 END) as sakit,
              SUM(CASE WHEN am.status='alpha' THEN 1 ELSE 0 END) as alpha,
              COUNT(am.id) as total
             FROM santri s LEFT JOIN absen_malam am ON s.id=am.santri_id AND MONTH(am.tanggal)=? AND YEAR(am.tanggal)=?
             WHERE s.sekolah_id=? AND s.status='aktif' GROUP BY s.id ORDER BY s.nama`;
      vals = [bulan, tahun, req.sekolah_id];
    } else if (tipe === 'sekolah') {
      sql = `SELECT s.id, s.nama, s.nis,
              SUM(CASE WHEN ab.status='hadir' THEN 1 ELSE 0 END) as hadir,
              SUM(CASE WHEN ab.status='izin' THEN 1 ELSE 0 END) as izin,
              SUM(CASE WHEN ab.status='sakit' THEN 1 ELSE 0 END) as sakit,
              SUM(CASE WHEN ab.status='alpha' THEN 1 ELSE 0 END) as alpha,
              COUNT(ab.id) as total
             FROM santri s LEFT JOIN absen_sekolah ab ON s.id=ab.santri_id AND MONTH(ab.tanggal)=? AND YEAR(ab.tanggal)=?
             WHERE s.sekolah_id=? AND s.status='aktif' GROUP BY s.id ORDER BY s.nama`;
      vals = [bulan, tahun, req.sekolah_id];
    } else {
      // Default: absensi kegiatan
      sql = `SELECT s.id, s.nama, s.nis,
              SUM(CASE WHEN a.status='hadir' THEN 1 ELSE 0 END) as hadir,
              SUM(CASE WHEN a.status='izin' THEN 1 ELSE 0 END) as izin,
              SUM(CASE WHEN a.status='sakit' THEN 1 ELSE 0 END) as sakit,
              SUM(CASE WHEN a.status='alpha' THEN 1 ELSE 0 END) as alpha,
              COUNT(a.id) as total
             FROM santri s
             LEFT JOIN absensi a ON s.id=a.santri_id
             LEFT JOIN absensi_sesi ses ON a.sesi_id=ses.id AND MONTH(ses.tanggal)=? AND YEAR(ses.tanggal)=?`;
      vals = [bulan, tahun];
      if (kegiatan_id) { sql += ' AND ses.kegiatan_id=?'; vals.push(kegiatan_id); }
      if (kelompok_id) { sql += ' AND ses.kelompok_id=?'; vals.push(kelompok_id); }
      sql += ` WHERE s.sekolah_id=? AND s.status='aktif' GROUP BY s.id ORDER BY s.nama`;
      vals.push(req.sekolah_id);
    }

    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) {
    console.error('Rekap error:', err);
    res.status(500).json({ error: 'Gagal mengambil rekap' });
  }
});

// Export Excel
router.get('/export/excel', checkFeature('export_excel'), async (req, res) => {
  try {
    const { bulan, tahun, tipe } = req.query;
    if (!bulan || !tahun) return res.status(400).json({ error: 'Bulan dan tahun harus diisi' });

    // Re-use rekap query (simplified)
    const rows = await dbQuery(
      `SELECT s.id, s.nama, s.nis,
        SUM(CASE WHEN a.status='hadir' THEN 1 ELSE 0 END) as hadir,
        SUM(CASE WHEN a.status='izin' THEN 1 ELSE 0 END) as izin,
        SUM(CASE WHEN a.status='sakit' THEN 1 ELSE 0 END) as sakit,
        SUM(CASE WHEN a.status='alpha' THEN 1 ELSE 0 END) as alpha,
        COUNT(a.id) as total
       FROM santri s LEFT JOIN absensi a ON s.id=a.santri_id
       LEFT JOIN absensi_sesi ses ON a.sesi_id=ses.id AND MONTH(ses.tanggal)=? AND YEAR(ses.tanggal)=?
       WHERE s.sekolah_id=? AND s.status='aktif' GROUP BY s.id ORDER BY s.nama`,
      [bulan, tahun, req.sekolah_id]
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Rekap Absensi');

    const sekolah = req.sekolah || {};
    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = sekolah.nama || 'e-Pesantren';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    const namaBulan = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value = `Rekap Absensi — ${namaBulan[parseInt(bulan)]} ${tahun}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    sheet.addRow([]);
    sheet.addRow(['No', 'Nama', 'NIS', 'Hadir', 'Izin', 'Sakit', 'Alpha', 'Total']);
    const headerRow = sheet.getRow(4);
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });

    rows.forEach((r, i) => {
      sheet.addRow([i + 1, r.nama, r.nis, r.hadir, r.izin, r.sakit, r.alpha, r.total]);
    });

    // Auto-width
    sheet.columns.forEach(col => { col.width = 15; });
    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 30;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=rekap_absensi_${bulan}_${tahun}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export excel error:', err);
    res.status(500).json({ error: 'Gagal export Excel' });
  }
});

// Export PDF per santri
router.get('/export/pdf/:santriId', checkFeature('raport_pdf'), async (req, res) => {
  try {
    const { bulan, tahun } = req.query;
    if (!bulan || !tahun) return res.status(400).json({ error: 'Bulan dan tahun harus diisi' });

    const santri = await dbGet('SELECT * FROM santri WHERE id = ? AND sekolah_id = ?', [req.params.santriId, req.sekolah_id]);
    if (!santri) return res.status(404).json({ error: 'Santri tidak ditemukan' });

    const rekap = await dbQuery(
      `SELECT ses.tanggal, k.nama as kegiatan_nama, a.status, a.keterangan
       FROM absensi a JOIN absensi_sesi ses ON a.sesi_id=ses.id
       LEFT JOIN kegiatan k ON ses.kegiatan_id=k.id
       WHERE a.santri_id=? AND a.sekolah_id=? AND MONTH(ses.tanggal)=? AND YEAR(ses.tanggal)=?
       ORDER BY ses.tanggal, k.nama`,
      [req.params.santriId, req.sekolah_id, bulan, tahun]
    );

    const sekolah = req.sekolah || {};
    const namaBulan = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rekap_${santri.nama}_${bulan}_${tahun}.pdf`);
    doc.pipe(res);

    doc.fontSize(16).text(sekolah.nama || 'e-Pesantren', { align: 'center' });
    doc.fontSize(12).text(`Rekap Absensi — ${namaBulan[parseInt(bulan)]} ${tahun}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Nama: ${santri.nama}`);
    doc.text(`NIS: ${santri.nis || '-'}`);
    doc.moveDown();

    // Summary
    const hadir = rekap.filter(r => r.status === 'hadir').length;
    const izin = rekap.filter(r => r.status === 'izin').length;
    const sakit = rekap.filter(r => r.status === 'sakit').length;
    const alpha = rekap.filter(r => r.status === 'alpha').length;
    doc.text(`Hadir: ${hadir}  |  Izin: ${izin}  |  Sakit: ${sakit}  |  Alpha: ${alpha}  |  Total: ${rekap.length}`);
    doc.moveDown();

    // Detail table
    const tableTop = doc.y;
    const headers = ['Tanggal', 'Kegiatan', 'Status', 'Keterangan'];
    const colWidths = [100, 150, 80, 150];
    let x = 50;
    headers.forEach((h, i) => { doc.fontSize(10).text(h, x, tableTop, { width: colWidths[i], bold: true }); x += colWidths[i]; });
    doc.moveDown(0.5);

    rekap.forEach(r => {
      if (doc.y > 700) { doc.addPage(); }
      x = 50;
      const y = doc.y;
      doc.fontSize(9).text(r.tanggal ? new Date(r.tanggal).toLocaleDateString('id-ID') : '-', x, y, { width: colWidths[0] }); x += colWidths[0];
      doc.text(r.kegiatan_nama || '-', x, y, { width: colWidths[1] }); x += colWidths[1];
      doc.text(r.status || '-', x, y, { width: colWidths[2] }); x += colWidths[2];
      doc.text(r.keterangan || '-', x, y, { width: colWidths[3] });
      doc.moveDown(0.3);
    });

    doc.moveDown(2);
    if (sekolah.kepala_nama) {
      doc.fontSize(10).text(`${sekolah.nama_kota || ''}, ${new Date().toLocaleDateString('id-ID')}`, { align: 'right' });
      doc.text(sekolah.kepala_nama, { align: 'right' });
    }

    doc.end();
  } catch (err) {
    console.error('Export PDF error:', err);
    res.status(500).json({ error: 'Gagal export PDF' });
  }
});

module.exports = router;
