import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendBackupPath = path.resolve(__dirname, '../backend/.env.cloudflared.backup');
const frontendBackupPath = path.resolve(__dirname, './.env.cloudflared.backup');
const backendEnvPath = path.resolve(__dirname, '../backend/.env');
const frontendEnvPath = path.resolve(__dirname, './.env');

console.log('🚀 Bắt đầu khởi chạy Cloudflared Tunnel...');
const cloudflared = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:8000']);

let urlFound = false;

function processOutput(data) {
    const text = data.toString();
    process.stdout.write(text); // Hiển thị log của cloudflared ra console

    if (!urlFound) {
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
            const fullUrl = match[0];
            urlFound = true;
            console.log('\n=========================================');
            console.log('✅ Đã tìm thấy Tunnel URL:', fullUrl);
            console.log('=========================================');
            updateEnvFiles(fullUrl);
        }
    }
}

// Cloudflared thường in thông tin kết nối ra stderr thay vì stdout
cloudflared.stdout.on('data', processOutput);
cloudflared.stderr.on('data', processOutput);

cloudflared.on('close', (code) => {
    console.log(`\n❌ Cloudflared đã đóng với mã lỗi ${code}`);
});

function updateEnvFiles(fullUrl) {
    // Tách bỏ https:// để thay vào placeholder "<your-tunnel>.trycloudflare.com"
    const domainOnly = fullUrl.replace('https://', '');
    const placeholder = '<your-tunnel>.trycloudflare.com';

    try {
        // --- 1. Cập nhật Backend ---
        if (fs.existsSync(backendBackupPath)) {
            let backendContent = fs.readFileSync(backendBackupPath, 'utf8');
            backendContent = backendContent.split(placeholder).join(domainOnly);
            fs.writeFileSync(backendEnvPath, backendContent);
            console.log('✅ Cập nhật thành công: backend/.env');
        } else {
            console.error('❌ Cảnh báo: Không tìm thấy', backendBackupPath);
        }

        // --- 2. Cập nhật Frontend ---
        if (fs.existsSync(frontendBackupPath)) {
            let frontendContent = fs.readFileSync(frontendBackupPath, 'utf8');
            frontendContent = frontendContent.split(placeholder).join(domainOnly);
            fs.writeFileSync(frontendEnvPath, frontendContent);
            console.log('✅ Cập nhật thành công: frontend/.env');
        } else {
            console.error('❌ Cảnh báo: Không tìm thấy', frontendBackupPath);
        }

        console.log('\n🎉 MỌI THỨ ĐÃ SẴN SÀNG!');
        console.log('👉 Bây giờ bạn có thể bật "npm run dev" (nếu chưa bật) và test web!');

    } catch (error) {
        console.error('❌ Lỗi trong quá trình cập nhật file .env:', error);
    }
}
