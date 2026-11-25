#!/usr/bin/env bash
# Auralis VPS setup: backend API + landing page behind nginx.
# Run as root on a fresh Ubuntu 22.04/24.04 VM:
#   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=sb_publishable_xxx bash deploy/setup-vps.sh
set -euo pipefail

APP_DIR=/opt/auralis
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

command -v node >/dev/null 2>&1 || {
  apt-get update -y
  apt-get install -y nodejs nginx curl ca-certificates
}

mkdir -p "$APP_DIR"
cp -r "$REPO_DIR/server" "$APP_DIR/server"
cp -r "$REPO_DIR/site" "$APP_DIR/site"

cat >/etc/systemd/system/auralis-api.service <<SERVICE
[Unit]
Description=Auralis API
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR/server
Environment=NODE_ENV=production
Environment=PORT=8787
Environment=HOST=127.0.0.1
Environment=SUPABASE_URL=${SUPABASE_URL:-}
Environment=SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-}
ExecStart=/usr/bin/node $APP_DIR/server/index.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE

cat >/etc/nginx/sites-available/auralis <<'NGINX'
server {
    listen 80 default_server;
    server_name _;

    root /opt/auralis/site;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /health {
        proxy_pass http://127.0.0.1:8787;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/auralis /etc/nginx/sites-enabled/auralis
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now auralis-api
nginx -t
systemctl restart nginx

PUBLIC_IP="$(curl -s https://api.ipify.org || echo '<this-server-ip>')"
echo "Auralis API:  http://$PUBLIC_IP/health"
echo "Auralis site: http://$PUBLIC_IP/"
echo "Set VITE_AURALIS_API_URL=http://$PUBLIC_IP in the desktop app to use the backend."
