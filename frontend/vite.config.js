import { defineConfig, loadEnv } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
console.log('>>> laravel plugin loaded:', typeof laravel);

// Tự copy .vite/manifest.json -> manifest.json sau MỖI lần build
// (thay cho move-manifest.js, chạy được cả ở watch mode)
function copyManifestPlugin() {
    return {
        name: 'copy-manifest-to-build-root',
        closeBundle() {
            const src = path.resolve(__dirname, '../backend/public/build/.vite/manifest.json');
            const dest = path.resolve(__dirname, '../backend/public/build/manifest.json');

            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                console.log('✅ Copied manifest.json to build root');
            } else {
                console.warn('⚠️ .vite/manifest.json not found, skip copy');
            }
        },
    };
}

export default defineConfig(({ mode }) => {
    // Tải biến env theo mode (development / production)
    const env = loadEnv(mode, process.cwd(), '');

    const isNgrok = env.VITE_MODE === 'ngrok';
    const isCloudflared = env.VITE_MODE === 'cloudflared';
    const isTunnel = isNgrok || isCloudflared;

    // Lấy URL tương ứng với mode
    let tunnelUrl = '';
    if (isNgrok) tunnelUrl = env.VITE_NGROK_URL || '';
    if (isCloudflared) tunnelUrl = env.VITE_CLOUDFLARED_URL || '';

    console.log(`>>> Vite mode: ${env.VITE_MODE || 'localhost'} | API: ${env.VITE_API_URL}`);

    return {
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        plugins: [
            laravel({
                input: ['src/app.jsx'],
                publicDirectory: '../backend/public',
                buildDirectory: 'build',
                refresh: true,
            }),
            react(),
            tailwindcss(),
            copyManifestPlugin(),
        ],
        server: {
            host: '0.0.0.0',
            port: 5173,
            https: {
                key: fs.readFileSync(path.resolve(__dirname, 'certs/localhost+2-key.pem')),
                cert: fs.readFileSync(path.resolve(__dirname, 'certs/localhost+2.pem')),
            },
            cors: true,
            // Origin LUÔN là localhost:5173 để Laravel @vite gọi đúng chỗ
            origin: 'https://localhost:5173',
            allowedHosts: isTunnel
                ? [new URL(tunnelUrl).hostname, 'localhost', '127.0.0.1']
                : ['localhost', '127.0.0.1'],
            hmr: {
                host: 'localhost',
                protocol: 'wss',
                clientPort: 5173,
            },
        },
        build: {
            outDir: '../backend/public/build',
            manifest: true,
            emptyOutDir: true,
        },
    };
});