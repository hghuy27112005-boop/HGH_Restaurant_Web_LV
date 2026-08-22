@echo off
set ROOT=%~dp0

echo Dang khoi chay Cloudflare Tunnel...
start "Tunnel" cmd /k "cd /d %ROOT%frontend && npm run tunnel"

echo Doi 8 giay de tunnel cap nhat file .env...
timeout /t 8 /nobreak > nul

echo Dang khoi chay Frontend (Vite dev)...
start "Frontend Dev" cmd /k "cd /d %ROOT%frontend && npm run dev"

echo Dang khoi chay Backend (gui mail reminder + Laravel serve)...
start "Backend Serve" cmd /k "cd /d %ROOT%backend && php artisan bookings:send-daily-reminders && php artisan serve"

echo Da khoi chay xong 3 cua so. Kiem tra tung cua so de xac nhan.