const express = require('express');
const router = express.Router();
const { dbQuery, dbGet, dbInsert, dbUpdate, dbDelete } = require('../db');
const { checkQuota } = require('../middleware/tenant');
const { requireAdmin } = require('../middleware/admin');
const multer = require('multer');
const ExcelJS = require('exceljs');

// Multer config — store in memory for parsing
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// List all santri
router.get('/', async (req, res) => {
  try {
    const sid = req.sekolah_id;
    const { status, kamar_id, kelas_id, search } = req.query;
    let sql = `SELECT s.*, k.nama as kamar_nama, ks.nama as kelas_nama
               FROM santri s
               LEFT JOIN kamar k ON s.kamar_id = k.id
               LEFT JOIN kelas_sekolah ks ON s.kelas_id = ks.id
               WHERE s.sekolah_id = ?`;
    const vals = [sid];

    if (status) { sql += ' AND s.status = ?'; vals.push(status); }
    if (kamar_id) { sql += ' AND s.kamar_id = ?'; vals.push(kamar_id); }
    if (kelas_id) { sql += ' AND s.kelas_id = ?'; vals.push(kelas_id); }
    if (search) { sql += ' AND (s.nama LIKE ? OR s.nis LIKE ?)'; vals.push(`%${search}%`, `%${search}%`); }

    sql += ' ORDER BY s.nama';
    const rows = await dbQuery(sql, vals);
    res.json(rows);
  } catch (err) {
    console.error('Get santri error:', err);
    res.status(500).json({ error: 'Gagal mengambil data santri' });
  }
});

// Get single santri with detail
router.get('/:id', async (req, res) => {
  try {
    const row = await dbGet(
      `SELECT s.*, k.nama as kamar_nama, ks.nama as kelas_nama
       FROM santri s
       LEFT JOIN kamar k ON s.kamar_id = k.id
       LEFT JOIN kelas_sekolah ks ON s.kelas_id = ks.id
       WHERE s.id = ? AND s.sekolah_id = ?`,
      [req.params.id, req.sekolah_id]
    );
    if (!row) return res.status(404).json({ error: 'Santri tidak ditemukan' });

    // Get pelanggaran count
    const pel = await dbGet('SELECT COUNT(*) as cnt, COALESCE(SUM(poin),0) as total_poin FROM pelanggaran WHERE santri_id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    // Get prestasi count
    const pres = await dbGet('SELECT COUNT(*) as cnt, COALESCE(SUM(poin),0) as total_poin FROM prestasi WHERE santri_id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);

    row.pelanggaran_count = pel.cnt;
    row.pelanggaran_poin = pel.total_poin;
    row.prestasi_count = pres.cnt;
    row.prestasi_poin = pres.total_poin;

    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create santri
router.post('/', requireAdmin, checkQuota('santri'), async (req, res) => {
  try {
    const { nama, nis, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, kamar_id, kelas_id, nama_ayah, nama_ibu, no_hp_wali, tahun_masuk } = req.body;
    if (!nama) return res.status(400).json({ error: 'Nama santri harus diisi' });

    const id = await dbInsert('santri', {
      sekolah_id: req.sekolah_id,
      nama,
      nis: nis || '',
      jenis_kelamin: jenis_kelamin || 'L',
      tempat_lahir: tempat_lahir || '',
      tanggal_lahir: tanggal_lahir || null,
      alamat: alamat || '',
      kamar_id: kamar_id || null,
      kelas_id: kelas_id || null,
      nama_ayah: nama_ayah || '',
      nama_ibu: nama_ibu || '',
      no_hp_wali: no_hp_wali || '',
      tahun_masuk: tahun_masuk || null
    });
    res.json({ success: true, id, message: 'Santri berhasil ditambahkan' });
  } catch (err) {
    console.error('Create santri error:', err);
    res.status(500).json({ error: 'Gagal menambah santri' });
  }
});

// Update santri
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const fields = ['nama','nis','jenis_kelamin','tempat_lahir','tanggal_lahir','alamat','kamar_id','kelas_id','nama_ayah','nama_ibu','no_hp_wali','foto','status','tahun_masuk'];
    const data = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        data[f] = (f === 'kamar_id' || f === 'kelas_id') ? (req.body[f] || null) : req.body[f];
      }
    }

    const affected = await dbUpdate('santri', data, 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Santri tidak ditemukan' });
    res.json({ success: true, message: 'Santri berhasil diupdate' });
  } catch (err) {
    console.error('Update santri error:', err);
    res.status(500).json({ error: 'Gagal mengupdate santri' });
  }
});

// Delete santri
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const affected = await dbDelete('santri', 'id = ? AND sekolah_id = ?', [req.params.id, req.sekolah_id]);
    if (!affected) return res.status(404).json({ error: 'Santri tidak ditemukan' });
    res.json({ success: true, message: 'Santri berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus santri' });
  }
});

// Bulk import santri (JSON)
router.post('/import', requireAdmin, async (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Data tidak valid' });
    }

    let success = 0, failed = 0, errors = [];
    for (const item of data) {
      try {
        if (!item.nama) { failed++; errors.push(`Baris ${success+failed+1}: Nama kosong`); continue; }
        await dbInsert('santri', {
          sekolah_id: req.sekolah_id,
          nama: item.nama,
          nis: item.nis || '',
          jenis_kelamin: item.jenis_kelamin || 'L',
          tempat_lahir: item.tempat_lahir || '',
          tanggal_lahir: item.tanggal_lahir || null,
          alamat: item.alamat || '',
          nama_ayah: item.nama_ayah || '',
          nama_ibu: item.nama_ibu || '',
          no_hp_wali: item.no_hp_wali || '',
          tahun_masuk: item.tahun_masuk || null
        });
        success++;
      } catch (e) {
        failed++;
        errors.push(`${item.nama}: ${e.message}`);
      }
    }
    res.json({ success: true, imported: success, failed, errors: errors.slice(0, 10), message: `${success} santri berhasil diimport` });
  } catch (err) {
    res.status(500).json({ error: 'Gagal import santri' });
  }
});

// Import from Excel file
router.post('/import-excel', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File Excel harus diupload' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet || worksheet.rowCount < 2) {
      return res.status(400).json({ error: 'File Excel kosong atau tidak valid. Minimal harus ada header + 1 baris data.' });
    }

    // Read header row to detect column mapping
    const headerRow = worksheet.getRow(1);
    const headers = {};
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const val = String(cell.value || '').trim().toLowerCase();
      headers[val] = colNumber;
    });

    // Column mapping (flexible — supports various header names)
    const colMap = {
      nama: headers['nama'] || headers['nama santri'] || headers['name'] || headers['nama lengkap'] || 1,
      nis: headers['nis'] || headers['no induk'] || headers['nomor induk'] || headers['nis santri'] || 2,
      jenis_kelamin: headers['jenis kelamin'] || headers['jk'] || headers['gender'] || headers['l/p'] || 3,
      tempat_lahir: headers['tempat lahir'] || headers['tmp lahir'] || null,
      tanggal_lahir: headers['tanggal lahir'] || headers['tgl lahir'] || headers['ttl'] || null,
      alamat: headers['alamat'] || headers['address'] || null,
      nama_ayah: headers['nama ayah'] || headers['ayah'] || headers['wali'] || null,
      nama_ibu: headers['nama ibu'] || headers['ibu'] || null,
      no_hp_wali: headers['no hp'] || headers['no hp wali'] || headers['hp wali'] || headers['telp'] || headers['no telp'] || null,
      tahun_masuk: headers['tahun masuk'] || headers['thn masuk'] || headers['angkatan'] || null
    };

    const data = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const getCellVal = (col) => {
        if (!col) return '';
        const cell = row.getCell(col);
        if (cell.value === null || cell.value === undefined) return '';
        if (cell.value instanceof Date) {
          return cell.value.toISOString().slice(0, 10);
        }
        if (typeof cell.value === 'object' && cell.value.result !== undefined) {
          return String(cell.value.result);
        }
        return String(cell.value).trim();
      };

      const nama = getCellVal(colMap.nama);
      if (!nama) return; // skip empty rows

      let jk = getCellVal(colMap.jenis_kelamin).toUpperCase();
      if (jk === 'LAKI-LAKI' || jk === 'LAKI' || jk === 'L' || jk === 'MALE') jk = 'L';
      else if (jk === 'PEREMPUAN' || jk === 'P' || jk === 'FEMALE' || jk === 'WANITA') jk = 'P';
      else jk = 'L';

      let tglLahir = getCellVal(colMap.tanggal_lahir);
      if (tglLahir && !/^\d{4}-\d{2}-\d{2}$/.test(tglLahir)) {
        // Try parsing common date formats
        const d = new Date(tglLahir);
        tglLahir = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      }

      data.push({
        nama,
        nis: getCellVal(colMap.nis),
        jenis_kelamin: jk,
        tempat_lahir: getCellVal(colMap.tempat_lahir),
        tanggal_lahir: tglLahir || null,
        alamat: getCellVal(colMap.alamat),
        nama_ayah: getCellVal(colMap.nama_ayah),
        nama_ibu: getCellVal(colMap.nama_ibu),
        no_hp_wali: getCellVal(colMap.no_hp_wali),
        tahun_masuk: getCellVal(colMap.tahun_masuk) || null
      });
    });

    if (data.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data valid ditemukan di file Excel' });
    }

    // Insert to database
    let success = 0, failed = 0, errors = [];
    for (const item of data) {
      try {
        await dbInsert('santri', {
          sekolah_id: req.sekolah_id,
          nama: item.nama,
          nis: item.nis || '',
          jenis_kelamin: item.jenis_kelamin,
          tempat_lahir: item.tempat_lahir || '',
          tanggal_lahir: item.tanggal_lahir,
          alamat: item.alamat || '',
          nama_ayah: item.nama_ayah || '',
          nama_ibu: item.nama_ibu || '',
          no_hp_wali: item.no_hp_wali || '',
          tahun_masuk: item.tahun_masuk
        });
        success++;
      } catch (e) {
        failed++;
        errors.push(`${item.nama}: ${e.message}`);
      }
    }

    res.json({
      success: true,
      imported: success,
      failed,
      total_read: data.length,
      errors: errors.slice(0, 10),
      message: `${success} santri berhasil diimport dari Excel`
    });
  } catch (err) {
    console.error('Import Excel error:', err);
    res.status(500).json({ error: 'Gagal import Excel: ' + err.message });
  }
});

// Download template Excel
router.get('/template/excel', requireAdmin, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Data Santri');

    ws.columns = [
      { header: 'Nama', key: 'nama', width: 30 },
      { header: 'NIS', key: 'nis', width: 15 },
      { header: 'Jenis Kelamin', key: 'jenis_kelamin', width: 15 },
      { header: 'Tempat Lahir', key: 'tempat_lahir', width: 20 },
      { header: 'Tanggal Lahir', key: 'tanggal_lahir', width: 15 },
      { header: 'Alamat', key: 'alamat', width: 35 },
      { header: 'Nama Ayah', key: 'nama_ayah', width: 25 },
      { header: 'Nama Ibu', key: 'nama_ibu', width: 25 },
      { header: 'No HP Wali', key: 'no_hp_wali', width: 18 },
      { header: 'Tahun Masuk', key: 'tahun_masuk', width: 12 }
    ];

    // Style header
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add sample row
    ws.addRow({
      nama: 'Ahmad Fauzi',
      nis: '2024001',
      jenis_kelamin: 'L',
      tempat_lahir: 'Jakarta',
      tanggal_lahir: '2010-05-15',
      alamat: 'Jl. Masjid No.1',
      nama_ayah: 'Budi Santoso',
      nama_ibu: 'Siti Aminah',
      no_hp_wali: '081234567890',
      tahun_masuk: '2024'
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=template_import_santri.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Gagal generate template' });
  }
});

module.exports = router;
