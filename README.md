# e-Pesantren SaaS

Platform SaaS multi-tenant untuk manajemen absensi pesantren modern.

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** MariaDB / MySQL
- **Frontend:** Tailwind CSS + Alpine.js (SPA)
- **Auth:** JWT
- **Multi-tenant:** Subdomain-based (contoh: `darul-ulum.e-pesantren.app`)

## Fitur Utama

### Super Admin
- Kelola semua pesantren (tambah, suspend, aktifkan, perpanjang)
- Manajemen paket subscription (Basic/Pro/Premium)
- Statistik global & estimasi revenue

### Tenant (per Pesantren)
- 👨‍🎓 Manajemen Santri (CRUD + Import Excel)
- 🏠 Kamar & Kelas
- 📅 Kegiatan & Kelompok
- 📋 Absensi Harian (sesi-based)
- 🌙 Absen Malam (bulk)
- 🏫 Absen Sekolah (per kelas)
- ⚠️ Pelanggaran & 🏆 Prestasi (poin system)
- 📝 Catatan Guru
- 📢 Pengumuman (target: semua/ustadz/wali)
- 📊 Rekap + Export Excel & PDF
- ⚙️ Settings (logo, nama, dll)
- 👤 Multi-role: Admin, Ustadz, Wali

## Quick Start (Development)

```bash
# 1. Clone & install
git clone <repo> && cd sas
npm install

# 2. Setup database
mysql -u root -p < db/schema.sql

# 3. Create .env
cp .env.example .env
# Edit .env sesuai config database Anda

# 4. Start
npm run dev
# Server berjalan di http://localhost:3000
```

## Production (VPS Ubuntu + Cloudflare)

### One-Click Install
```bash
# Upload project ke VPS, lalu:
chmod +x install.sh
sudo ./install.sh yourdomain.com
```

Script akan otomatis:
1. ✅ Update system & install dependencies
2. ✅ Install Node.js 20 LTS + MariaDB
3. ✅ Setup database + import schema
4. ✅ Generate .env dengan kredensial aman (random password)
5. ✅ Deploy app + PM2 cluster mode (auto-restart)
6. ✅ Generate SSL Origin Certificate (10 tahun)
7. ✅ Configure Nginx reverse proxy + wildcard subdomain
8. ✅ Setup UFW firewall + logrotate

### Setup Cloudflare (Setelah Install)
1. Login ke [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Tambahkan DNS records:
   ```
   Type: A | Name: @  | Content: IP_VPS | Proxy: ☁️ Proxied
   Type: A | Name: *  | Content: IP_VPS | Proxy: ☁️ Proxied
   ```
3. SSL/TLS → Encryption mode: **Full (Strict)**
4. Selesai! Akses `https://yourdomain.com`

### Kredensial
Setelah install, semua kredensial tersimpan di:
- `/var/www/epesantren/.env` — environment config
- `/var/www/epesantren/CREDENTIALS.txt` — ringkasan kredensial

### Useful Commands
```bash
pm2 status                  # Cek status app
pm2 logs epesantren         # Lihat logs
pm2 restart epesantren      # Restart app
systemctl restart nginx     # Restart nginx
```

## Struktur Folder

```
sas/
├── server.js              # Main Express server
├── db.js                  # Database module
├── package.json
├── .env.example
├── ecosystem.config.js    # PM2 config
├── nginx.conf             # Nginx template
├── install.sh             # Auto-install script
├── db/
│   └── schema.sql         # Complete database schema (20 tabel)
├── middleware/
│   ├── tenant.js          # Multi-tenant resolution
│   ├── auth.js            # JWT authentication
│   └── admin.js           # Role-based access
├── routes/
│   ├── santri.js          # CRUD + import
│   ├── kamar.js           # CRUD
│   ├── kelas.js           # CRUD
│   ├── kegiatan.js        # CRUD
│   ├── kelompok.js        # CRUD + assign santri
│   ├── jadwal.js          # Jadwal umum + sekolah
│   ├── absensi.js         # Sesi + bulk input
│   ├── absen-malam.js     # Bulk save + rekap
│   ├── absen-sekolah.js   # Per kelas + rekap
│   ├── pelanggaran.js     # CRUD + ranking
│   ├── prestasi.js        # CRUD
│   ├── catatan.js         # CRUD
│   ├── pengumuman.js      # CRUD + role filter
│   ├── rekap.js           # Rekap + Excel + PDF
│   ├── settings.js        # Tenant settings
│   ├── users.js           # User management
│   └── super-admin.js     # Super admin panel
└── public/
    ├── index.html         # Landing page
    ├── login.html         # Login (3 tabs)
    ├── app.html           # Dashboard SPA
    ├── app.js             # Dashboard logic
    ├── manifest.json      # PWA
    └── sw.js              # Service worker
```

## API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/register-public` | Registrasi pesantren baru |
| POST | `/api/login` | Login admin/ustadz |
| POST | `/api/login-wali` | Login wali santri |
| POST | `/api/super/login` | Login super admin |
| GET | `/api/dashboard` | Dashboard stats |
| CRUD | `/api/santri` | Manajemen santri |
| CRUD | `/api/kamar` | Manajemen kamar |
| CRUD | `/api/kelas` | Manajemen kelas |
| CRUD | `/api/kegiatan` | Manajemen kegiatan |
| CRUD | `/api/kelompok` | Manajemen kelompok |
| CRUD | `/api/jadwal/umum` | Jadwal harian |
| CRUD | `/api/jadwal/sekolah` | Jadwal per kelas |
| CRUD | `/api/absensi` | Absensi harian |
| POST | `/api/absen-malam` | Absen malam bulk |
| POST | `/api/absen-sekolah` | Absen sekolah bulk |
| CRUD | `/api/pelanggaran` | Pelanggaran |
| CRUD | `/api/prestasi` | Prestasi |
| CRUD | `/api/catatan` | Catatan guru |
| CRUD | `/api/pengumuman` | Pengumuman |
| GET | `/api/rekap` | Rekap absensi |
| GET | `/api/rekap/export/excel` | Export Excel |
| GET | `/api/rekap/export/pdf/:id` | Export PDF |
| GET/PUT | `/api/settings` | Pengaturan |
| CRUD | `/api/users` | Manajemen user |
| ALL | `/api/super/*` | Super admin |

## Subscription Plans

| Paket | Harga/bulan | Max Santri | Max Users | Fitur |
|-------|-------------|-----------|-----------|-------|
| Basic | Rp 150.000 | 200 | 20 | Absensi, pelanggaran, pengumuman |
| Pro | Rp 250.000 | 500 | 50 | + Export Excel/PDF, custom logo |
| Premium | Rp 400.000 | Unlimited | Unlimited | + Custom domain, API access |

## License

UNLICENSED — Proprietary
