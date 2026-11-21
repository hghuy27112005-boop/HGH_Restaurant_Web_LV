@echo off
setlocal

echo Dang khoi chay Cloudflare Tunnel...
start "Tunnel" /d "%~dp0frontend" cmd /d /k "node start-tunnel.js"

echo Dang khoi chay Frontend (Vite dev)...
start "Frontend Dev" /d "%~dp0frontend" cmd /d /k "npm run dev"

echo Dang khoi chay Backend (Laravel)...
start "Backend Serve" /d "%~dp0backend" cmd /d /k "php artisan serve --host=127.0.0.1 --port=8000 --tries=1"

echo Da mo 3 cua so. Xem cua so Tunnel de lay link khi hien Tunnel ready.
