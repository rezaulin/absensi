-- ============================================================
-- e-Pesantren SaaS Multi-Tenant — Database Schema
-- Platform: MariaDB / MySQL 8.0+
-- Generated: Production-Ready
-- ============================================================

CREATE DATABASE IF NOT EXISTS epesantren_saas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE epesantren_saas;

-- ============================================================
-- 1. PAKET / SUBSCRIPTION PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS paket (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(50) NOT NULL,
  harga_bulan INT NOT NULL DEFAULT 0,
  max_santri INT NOT NULL DEFAULT 200,
  max_users INT NOT NULL DEFAULT 20,
  fitur JSON NOT NULL,
  deskripsi TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed paket
INSERT INTO paket (nama, harga_bulan, max_santri, max_users, fitur, deskripsi) VALUES
(
  'Basic', 150000, 200, 20,
  '{"absensi":true,"pelanggaran":true,"prestasi":true,"catatan":true,"pengumuman":true,"raport_pdf":false,"export_excel":false,"custom_logo":false,"rekap_ustadz":false}',
  'Paket dasar untuk pesantren kecil. Fitur absensi lengkap, pelanggaran, dan pengumuman.'
),
(
  'Pro', 250000, 500, 50,
  '{"absensi":true,"pelanggaran":true,"prestasi":true,"catatan":true,"pengumuman":true,"raport_pdf":true,"export_excel":true,"custom_logo":true,"rekap_ustadz":true}',
  'Paket profesional dengan export Excel/PDF, custom logo, dan rekap ustadz.'
),
(
  'Premium', 400000, 999999, 999999,
  '{"absensi":true,"pelanggaran":true,"prestasi":true,"catatan":true,"pengumuman":true,"raport_pdf":true,"export_excel":true,"custom_logo":true,"rekap_ustadz":true,"custom_domain":true,"api_access":true}',
  'Paket premium tanpa batas. Semua fitur termasuk custom domain dan API access.'
);

-- ============================================================
-- 2. SEKOLAH / TENANT
-- ============================================================
CREATE TABLE IF NOT EXISTS sekolah (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  alamat TEXT,
  kepala_nama VARCHAR(200) DEFAULT '',
  nama_kota VARCHAR(100) DEFAULT '',
  no_telp VARCHAR(20) DEFAULT '',
  email VARCHAR(200) DEFAULT '',
  logo LONGTEXT,
  background LONGTEXT,
  dashboard_bg LONGTEXT,
  app_name VARCHAR(200) DEFAULT 'e-Pesantren',
  paket_id INT DEFAULT 1,
  status ENUM('aktif','suspend','trial') DEFAULT 'trial',
  expired_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_slug (slug),
  INDEX idx_slug (slug),
  INDEX idx_status (status),
  INDEX idx_paket (paket_id),
  CONSTRAINT fk_sekolah_paket FOREIGN KEY (paket_id) REFERENCES paket(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. USERS (per tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  username VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  nama VARCHAR(200) NOT NULL,
  role ENUM('admin','ustadz','wali') DEFAULT 'ustadz',
  email VARCHAR(200) DEFAULT '',
  no_hp VARCHAR(20) DEFAULT '',
  foto LONGTEXT,
  status ENUM('aktif','nonaktif') DEFAULT 'aktif',
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  UNIQUE KEY uk_user (sekolah_id, username),
  CONSTRAINT fk_users_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. SANTRI
-- ============================================================
CREATE TABLE IF NOT EXISTS santri (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  nama VARCHAR(200) NOT NULL,
  nis VARCHAR(50) DEFAULT '',
  jenis_kelamin ENUM('L','P') DEFAULT 'L',
  tempat_lahir VARCHAR(100) DEFAULT '',
  tanggal_lahir DATE DEFAULT NULL,
  alamat TEXT,
  kamar_id INT DEFAULT NULL,
  kelas_id INT DEFAULT NULL,
  nama_ayah VARCHAR(200) DEFAULT '',
  nama_ibu VARCHAR(200) DEFAULT '',
  no_hp_wali VARCHAR(20) DEFAULT '',
  foto LONGTEXT,
  tahun_masuk YEAR DEFAULT NULL,
  status ENUM('aktif','nonaktif','lulus','keluar') DEFAULT 'aktif',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_nis (sekolah_id, nis),
  INDEX idx_kamar (kamar_id),
  INDEX idx_kelas (kelas_id),
  INDEX idx_status (sekolah_id, status),
  CONSTRAINT fk_santri_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. KAMAR / ASRAMA
-- ============================================================
CREATE TABLE IF NOT EXISTS kamar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  nama VARCHAR(100) NOT NULL,
  kapasitas INT DEFAULT 20,
  gedung VARCHAR(100) DEFAULT '',
  lantai VARCHAR(20) DEFAULT '',
  ustadz_id INT DEFAULT NULL,
  keterangan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  CONSTRAINT fk_kamar_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. KELAS SEKOLAH
-- ============================================================
CREATE TABLE IF NOT EXISTS kelas_sekolah (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  nama VARCHAR(100) NOT NULL,
  tingkat VARCHAR(20) DEFAULT '',
  wali_kelas_id INT DEFAULT NULL,
  keterangan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  CONSTRAINT fk_kelas_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. KEGIATAN
-- ============================================================
CREATE TABLE IF NOT EXISTS kegiatan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  nama VARCHAR(200) NOT NULL,
  jenis ENUM('harian','mingguan','bulanan','lainnya') DEFAULT 'harian',
  jam_mulai TIME DEFAULT NULL,
  jam_selesai TIME DEFAULT NULL,
  keterangan TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  CONSTRAINT fk_kegiatan_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. KELOMPOK
-- ============================================================
CREATE TABLE IF NOT EXISTS kelompok (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  nama VARCHAR(200) NOT NULL,
  kegiatan_id INT DEFAULT NULL,
  ustadz_id INT DEFAULT NULL,
  keterangan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_kegiatan (kegiatan_id),
  INDEX idx_ustadz (ustadz_id),
  CONSTRAINT fk_kelompok_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_kelompok_kegiatan FOREIGN KEY (kegiatan_id) REFERENCES kegiatan(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_kelompok_ustadz FOREIGN KEY (ustadz_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. PIVOT: SANTRI ↔ KELOMPOK
-- ============================================================
CREATE TABLE IF NOT EXISTS santri_kelompok (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  santri_id INT NOT NULL,
  kelompok_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_santri (santri_id),
  INDEX idx_kelompok (kelompok_id),
  UNIQUE KEY uk_santri_kelompok (sekolah_id, santri_id, kelompok_id),
  CONSTRAINT fk_sk_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sk_santri FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sk_kelompok FOREIGN KEY (kelompok_id) REFERENCES kelompok(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. JADWAL UMUM (kegiatan harian)
-- ============================================================
CREATE TABLE IF NOT EXISTS jadwal_umum (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  kegiatan_id INT NOT NULL,
  hari ENUM('senin','selasa','rabu','kamis','jumat','sabtu','minggu') NOT NULL,
  jam_mulai TIME NOT NULL,
  jam_selesai TIME NOT NULL,
  keterangan TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_kegiatan (kegiatan_id),
  INDEX idx_hari (sekolah_id, hari),
  CONSTRAINT fk_jadwal_umum_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_jadwal_umum_kegiatan FOREIGN KEY (kegiatan_id) REFERENCES kegiatan(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. JADWAL SEKOLAH (per kelas)
-- ============================================================
CREATE TABLE IF NOT EXISTS jadwal_sekolah (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  kelas_id INT NOT NULL,
  hari ENUM('senin','selasa','rabu','kamis','jumat','sabtu','minggu') NOT NULL,
  mata_pelajaran VARCHAR(200) NOT NULL,
  jam_mulai TIME NOT NULL,
  jam_selesai TIME NOT NULL,
  ustadz_id INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_kelas (kelas_id),
  INDEX idx_hari (sekolah_id, hari),
  CONSTRAINT fk_jadwal_sekolah_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_jadwal_sekolah_kelas FOREIGN KEY (kelas_id) REFERENCES kelas_sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_jadwal_sekolah_ustadz FOREIGN KEY (ustadz_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. ABSENSI SESI
-- ============================================================
CREATE TABLE IF NOT EXISTS absensi_sesi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  kegiatan_id INT NOT NULL,
  kelompok_id INT DEFAULT NULL,
  tanggal DATE NOT NULL,
  waktu_buka DATETIME DEFAULT CURRENT_TIMESTAMP,
  waktu_tutup DATETIME DEFAULT NULL,
  dibuka_oleh INT DEFAULT NULL,
  status ENUM('buka','tutup') DEFAULT 'buka',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_tanggal (sekolah_id, tanggal),
  INDEX idx_kegiatan (sekolah_id, kegiatan_id),
  CONSTRAINT fk_absesi_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_absesi_kegiatan FOREIGN KEY (kegiatan_id) REFERENCES kegiatan(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_absesi_kelompok FOREIGN KEY (kelompok_id) REFERENCES kelompok(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_absesi_user FOREIGN KEY (dibuka_oleh) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. ABSENSI (detail per santri per sesi)
-- ============================================================
CREATE TABLE IF NOT EXISTS absensi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  sesi_id INT NOT NULL,
  santri_id INT NOT NULL,
  status ENUM('hadir','izin','sakit','alpha') DEFAULT 'hadir',
  keterangan TEXT,
  waktu DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_sesi (sesi_id),
  INDEX idx_santri (santri_id),
  UNIQUE KEY uk_absensi (sekolah_id, sesi_id, santri_id),
  CONSTRAINT fk_absensi_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_absensi_sesi FOREIGN KEY (sesi_id) REFERENCES absensi_sesi(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_absensi_santri FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. ABSEN MALAM
-- ============================================================
CREATE TABLE IF NOT EXISTS absen_malam (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  santri_id INT NOT NULL,
  tanggal DATE NOT NULL,
  status ENUM('hadir','izin','sakit','alpha') DEFAULT 'hadir',
  keterangan TEXT,
  dicatat_oleh INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_tanggal (sekolah_id, tanggal),
  UNIQUE KEY uk_absen_malam (sekolah_id, santri_id, tanggal),
  CONSTRAINT fk_abmalam_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_abmalam_santri FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. ABSEN SEKOLAH
-- ============================================================
CREATE TABLE IF NOT EXISTS absen_sekolah (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  santri_id INT NOT NULL,
  kelas_id INT DEFAULT NULL,
  tanggal DATE NOT NULL,
  status ENUM('hadir','izin','sakit','alpha') DEFAULT 'hadir',
  keterangan TEXT,
  dicatat_oleh INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_tanggal (sekolah_id, tanggal),
  INDEX idx_kelas (sekolah_id, kelas_id),
  UNIQUE KEY uk_absen_sekolah (sekolah_id, santri_id, tanggal),
  CONSTRAINT fk_absekolah_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_absekolah_santri FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. PELANGGARAN
-- ============================================================
CREATE TABLE IF NOT EXISTS pelanggaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  santri_id INT NOT NULL,
  jenis VARCHAR(200) NOT NULL,
  poin INT DEFAULT 0,
  keterangan TEXT,
  tanggal DATE NOT NULL,
  dilaporkan_oleh INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_santri (sekolah_id, santri_id),
  INDEX idx_tanggal (sekolah_id, tanggal),
  CONSTRAINT fk_pelanggaran_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pelanggaran_santri FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pelanggaran_user FOREIGN KEY (dilaporkan_oleh) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 17. PRESTASI
-- ============================================================
CREATE TABLE IF NOT EXISTS prestasi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  santri_id INT NOT NULL,
  jenis VARCHAR(200) NOT NULL,
  poin INT DEFAULT 0,
  keterangan TEXT,
  tanggal DATE NOT NULL,
  dilaporkan_oleh INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_santri (sekolah_id, santri_id),
  INDEX idx_tanggal (sekolah_id, tanggal),
  CONSTRAINT fk_prestasi_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_prestasi_santri FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_prestasi_user FOREIGN KEY (dilaporkan_oleh) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 18. CATATAN GURU
-- ============================================================
CREATE TABLE IF NOT EXISTS catatan_guru (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  santri_id INT NOT NULL,
  judul VARCHAR(200) NOT NULL,
  isi TEXT,
  kategori ENUM('akademik','behavior','lainnya') DEFAULT 'lainnya',
  ustadz_id INT DEFAULT NULL,
  tanggal DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_santri (sekolah_id, santri_id),
  CONSTRAINT fk_catatan_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_catatan_santri FOREIGN KEY (santri_id) REFERENCES santri(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_catatan_ustadz FOREIGN KEY (ustadz_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 19. PENGUMUMAN
-- ============================================================
CREATE TABLE IF NOT EXISTS pengumuman (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT NOT NULL,
  judul VARCHAR(200) NOT NULL,
  isi TEXT NOT NULL,
  target ENUM('semua','ustadz','wali','admin') DEFAULT 'semua',
  prioritas ENUM('normal','penting','urgent') DEFAULT 'normal',
  aktif ENUM('ya','tidak') DEFAULT 'ya',
  tanggal DATE NOT NULL,
  dibuat_oleh INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_target (sekolah_id, target),
  INDEX idx_tanggal (sekolah_id, tanggal),
  CONSTRAINT fk_pengumuman_sekolah FOREIGN KEY (sekolah_id) REFERENCES sekolah(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_pengumuman_user FOREIGN KEY (dibuat_oleh) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 20. ACTIVITY LOG (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sekolah_id INT DEFAULT NULL,
  user_id INT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(50) DEFAULT NULL,
  entity_id INT DEFAULT NULL,
  detail TEXT,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sekolah (sekolah_id),
  INDEX idx_user (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
