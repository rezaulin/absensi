#!/bin/bash
# ============================================================
# e-Pesantren SaaS — One-Click Install Script (Cloudflare + Nginx)
# Platform: Ubuntu 20.04+ / Debian 11+
# Usage:
#   chmod +x install.sh && sudo ./install.sh yourdomain.com
#
# Prasyarat di Cloudflare:
#   1. Domain sudah ditambahkan ke Cloudflare
#   2. DNS A Record: yourdomain.com  → IP VPS (Proxied ☁️)
#   3. DNS A Record: *.yourdomain.com → IP VPS (Proxied ☁️)
#   4. SSL/TLS mode: Full (Strict)
# ============================================================
set -euo pipefail

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✘]${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}${BOLD}══════════════════════════════════════${NC}"; echo -e "${CYAN}${BOLD}  $1${NC}"; echo -e "${CYAN}${BOLD}══════════════════════════════════════${NC}"; }

# ── Check root ───────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Jalankan sebagai root: sudo ./install.sh yourdomain.com"
fi

# ── Domain argument ──────────────────────────────────────────
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo -e "${BOLD}Usage:${NC} sudo ./install.sh ${CYAN}yourdomain.com${NC}"
  echo ""
  echo "Contoh: sudo ./install.sh e-pesantren.app"
  exit 1
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   e-Pesantren SaaS — Auto Installer      ║${NC}"
echo -e "${BOLD}║   Domain: ${CYAN}${DOMAIN}${NC}${BOLD}$(printf '%*s' $((23 - ${#DOMAIN})) '')║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Variables ────────────────────────────────────────────────
DB_NAME="epesantren_saas"
DB_USER="epesantren"
DB_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
SUPER_PASS=$(openssl rand -base64 16 | tr -d '=/+' | head -c 16)
APP_DIR="/var/www/epesantren"
SSL_DIR="/etc/ssl/cloudflare"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─────────────────────────────────────────────────────────────
# STEP 1: System Update
# ─────────────────────────────────────────────────────────────
step "1/8 — Update Sistem"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git unzip software-properties-common ufw openssl
log "Sistem berhasil diperbarui"

# ─────────────────────────────────────────────────────────────
# STEP 2: Node.js 20 LTS
# ─────────────────────────────────────────────────────────────
step "2/8 — Install Node.js 20 LTS"
if command -v node &> /dev/null && [[ "$(node -v)" == v20* || "$(node -v)" == v22* ]]; then
  log "Node.js $(node -v) sudah terinstall"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs
  log "Node.js $(node -v) terinstall"
fi
log "NPM $(npm -v)"

# ─────────────────────────────────────────────────────────────
# STEP 3: MariaDB
# ─────────────────────────────────────────────────────────────
step "3/8 — Install MariaDB"
if command -v mariadb &> /dev/null; then
  log "MariaDB sudah terinstall"
else
  apt-get install -y -qq mariadb-server mariadb-client
  systemctl enable mariadb
  systemctl start mariadb
  log "MariaDB terinstall & running"
fi

# ─────────────────────────────────────────────────────────────
# STEP 4: Setup Database
# ─────────────────────────────────────────────────────────────
step "4/8 — Setup Database"
mariadb -e "CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mariadb -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mariadb -e "GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';"
mariadb -e "FLUSH PRIVILEGES;"

# Import schema (skip CREATE DATABASE & USE lines)
if [ -f "${SCRIPT_DIR}/db/schema.sql" ]; then
  sed '/^CREATE DATABASE/d; /^USE /d' "${SCRIPT_DIR}/db/schema.sql" | mariadb "${DB_NAME}" 2>/dev/null || true
  log "Schema berhasil diimport"
else
  warn "schema.sql tidak ditemukan, skip import"
fi

# ─────────────────────────────────────────────────────────────
# STEP 5: Deploy Aplikasi
# ─────────────────────────────────────────────────────────────
step "5/8 — Deploy Aplikasi"
mkdir -p "${APP_DIR}/logs"
mkdir -p "${APP_DIR}/uploads"

# Copy project files (exclude node_modules, .git, install.sh)
rsync -a --exclude='node_modules' --exclude='.git' --exclude='install.sh' "${SCRIPT_DIR}/" "${APP_DIR}/" 2>/dev/null || \
  cp -r "${SCRIPT_DIR}"/{server.js,db.js,db,middleware,routes,public,package.json,package-lock.json,ecosystem.config.js,.gitignore} "${APP_DIR}/" 2>/dev/null || true

# Create production .env
cat > "${APP_DIR}/.env" << ENVEOF
DB_HOST=localhost
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
DB_NAME=${DB_NAME}
DB_PORT=3306
PORT=3000
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
DOMAIN=${DOMAIN}
SUPER_ADMIN_USER=superadmin
SUPER_ADMIN_PASS=${SUPER_PASS}
LOG_LEVEL=info
MAX_UPLOAD_SIZE=10
ENVEOF

cd "${APP_DIR}"
npm install --production --silent 2>&1 | tail -1
log "Aplikasi ter-deploy di ${APP_DIR}"

# ─────────────────────────────────────────────────────────────
# STEP 6: PM2 Process Manager
# ─────────────────────────────────────────────────────────────
step "6/8 — Setup PM2"
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2 --silent 2>&1 | tail -1
fi

cd "${APP_DIR}"
pm2 delete epesantren 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>&1 | tail -1
log "PM2 running & auto-start enabled"

# ─────────────────────────────────────────────────────────────
# STEP 7: Cloudflare Origin Certificate + Nginx
# ─────────────────────────────────────────────────────────────
step "7/8 — Setup Nginx + Cloudflare SSL"

# Install Nginx
apt-get install -y -qq nginx

# Generate Cloudflare Origin Certificate (self-signed, Cloudflare will handle public SSL)
mkdir -p "${SSL_DIR}"

if [ ! -f "${SSL_DIR}/${DOMAIN}.key" ]; then
  # Generate self-signed origin cert for Cloudflare Full (Strict)
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${SSL_DIR}/${DOMAIN}.key" \
    -out "${SSL_DIR}/${DOMAIN}.crt" \
    -subj "/C=ID/ST=Indonesia/O=e-Pesantren/CN=*.${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:*.${DOMAIN}" \
    2>/dev/null
  log "SSL Origin Certificate dibuat (10 tahun)"
else
  log "SSL Certificate sudah ada"
fi

# Write Nginx config
cat > /etc/nginx/sites-available/epesantren << NGINXEOF
# ============================================================
# e-Pesantren SaaS — Nginx Config (Cloudflare Proxy Mode)
# Domain: ${DOMAIN}
# ============================================================

# Redirect HTTP → HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} *.${DOMAIN};
    return 301 https://\$host\$request_uri;
}

# HTTPS — Wildcard Subdomain
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN} *.${DOMAIN};

    # Cloudflare Origin SSL
    ssl_certificate     ${SSL_DIR}/${DOMAIN}.crt;
    ssl_certificate_key ${SSL_DIR}/${DOMAIN}.key;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Max upload size
    client_max_body_size 50M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 5;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    # Proxy ke Node.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
    }

    # Cache static files
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Deny hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
NGINXEOF

# Enable site, disable default
ln -sf /etc/nginx/sites-available/epesantren /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test & restart
nginx -t 2>&1 && systemctl restart nginx && systemctl enable nginx
log "Nginx dikonfigurasi dengan SSL untuk ${DOMAIN}"

# ─────────────────────────────────────────────────────────────
# STEP 8: Firewall + Logrotate
# ─────────────────────────────────────────────────────────────
step "8/8 — Firewall & Finishing"

# UFW Firewall
ufw allow OpenSSH > /dev/null 2>&1
ufw allow 'Nginx Full' > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1
log "Firewall aktif (SSH + HTTP + HTTPS)"

# Logrotate for app logs
cat > /etc/logrotate.d/epesantren << LOGEOF
${APP_DIR}/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
}
LOGEOF
log "Logrotate dikonfigurasi"

# Update nginx.conf in app dir for reference
cp /etc/nginx/sites-available/epesantren "${APP_DIR}/nginx.conf"

# ─────────────────────────────────────────────────────────────
# DONE — Summary
# ─────────────────────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║${GREEN}        ✅ INSTALASI SELESAI!                          ${NC}${BOLD}║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${CYAN}Server IP${NC}     : ${SERVER_IP}$(printf '%*s' $((28 - ${#SERVER_IP})) '')${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${CYAN}Domain${NC}        : ${DOMAIN}$(printf '%*s' $((28 - ${#DOMAIN})) '')${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${CYAN}App Dir${NC}       : ${APP_DIR}$(printf '%*s' $((28 - ${#APP_DIR})) '')${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${YELLOW}── Database ──${NC}                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  DB Name       : ${DB_NAME}$(printf '%*s' $((28 - ${#DB_NAME})) '')${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  DB User       : ${DB_USER}$(printf '%*s' $((28 - ${#DB_USER})) '')${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  DB Pass       : ${DB_PASS}$(printf '%*s' $((28 - ${#DB_PASS})) '')${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${YELLOW}── Super Admin ──${NC}                                   ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Username      : superadmin                          ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Password      : ${SUPER_PASS}$(printf '%*s' $((28 - ${#SUPER_PASS})) '')${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${YELLOW}⚠  SETUP CLOUDFLARE (WAJIB):${NC}                         ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  1. Login ke Cloudflare Dashboard                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  2. Pilih domain: ${DOMAIN}$(printf '%*s' $((24 - ${#DOMAIN})) '')    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  3. DNS → Add Record:                                ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     • Type: A | Name: @ | IP: ${SERVER_IP}$(printf '%*s' $((12 - ${#SERVER_IP})) '')   ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     • Type: A | Name: * | IP: ${SERVER_IP}$(printf '%*s' $((12 - ${#SERVER_IP})) '')   ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}     (Pastikan Proxy status: ☁️ Proxied)              ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  4. SSL/TLS → Mode: ${GREEN}Full (Strict)${NC}                     ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${GREEN}Setelah DNS aktif, akses:${NC}                             ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  • Landing : https://${DOMAIN}$(printf '%*s' $((22 - ${#DOMAIN})) '')     ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  • Tenant  : https://SLUG.${DOMAIN}$(printf '%*s' $((17 - ${#DOMAIN})) '')${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${RED}⚠  SIMPAN KREDENSIAL DI ATAS!${NC}                         ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  File .env: ${APP_DIR}/.env$(printf '%*s' $((25 - ${#APP_DIR})) '')  ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                      ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Save credentials to file
cat > "${APP_DIR}/CREDENTIALS.txt" << CREDEOF
═══════════════════════════════════════
e-Pesantren SaaS — Credentials
Installed: $(date '+%Y-%m-%d %H:%M:%S')
═══════════════════════════════════════

Server IP    : ${SERVER_IP}
Domain       : ${DOMAIN}
App Dir      : ${APP_DIR}

── Database ──
DB Name      : ${DB_NAME}
DB User      : ${DB_USER}
DB Pass      : ${DB_PASS}

── Super Admin ──
URL          : https://${DOMAIN}
Username     : superadmin
Password     : ${SUPER_PASS}

── Cloudflare Setup ──
1. DNS A Record: ${DOMAIN}   → ${SERVER_IP} (Proxied)
2. DNS A Record: *.${DOMAIN} → ${SERVER_IP} (Proxied)
3. SSL/TLS Mode: Full (Strict)

── Useful Commands ──
pm2 status                  # Cek status app
pm2 logs epesantren         # Lihat logs
pm2 restart epesantren      # Restart app
systemctl restart nginx     # Restart nginx
cat ${APP_DIR}/.env         # Lihat env config
═══════════════════════════════════════
CREDEOF

chmod 600 "${APP_DIR}/CREDENTIALS.txt"
chmod 600 "${APP_DIR}/.env"
log "Kredensial disimpan di: ${APP_DIR}/CREDENTIALS.txt"
echo ""
