import { createLogger, defineConfig, loadEnv } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const configDir = path.dirname(fileURLToPath(import.meta.url));
console.log('>>> laravel plugin loaded:', typeof laravel);

// Tự copy .vite/manifest.json -> manifest.json sau MỖI lần build
// (thay cho move-manifest.js, chạy được cả ở watch mode)
function copyManifestPlugin() {
    return {
        name: 'copy-manifest-to-build-root',
        closeBundle() {
            const src = path.resolve(configDir, '../backend/public/build/.vite/manifest.json');
            const dest = path.resolve(configDir, '../backend/public/build/manifest.json');

            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                console.log('✅ Copied manifest.json to build root');
            } else {
                console.warn('⚠️ .vite/manifest.json not found, skip copy');
            }
        },
    };
}

function showReadyTunnelUrl(tunnelUrl) {
    return {
        name: 'show-ready-tunnel-url',
        configureServer(server) {
            server.middlewares.use('/__hgh_tunnel_ready', (req, res) => {
                if (req.method !== 'POST' || req.socket.remoteAddress !== '127.0.0.1'
                    || req.headers['x-hgh-tunnel-url'] !== tunnelUrl) {
                    res.writeHead(404).end();
                    return;
                }

                server.config.logger.info(`  ➜  Tunnel ready: ${tunnelUrl}`);
                res.writeHead(204).end();
            });
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
    const allowedHosts = ['localhost', '127.0.0.1'];
    if (isTunnel && URL.canParse(tunnelUrl)) {
        allowedHosts.push(new URL(tunnelUrl).hostname);
    }

    const logger = createLogger();
    const logInfo = logger.info.bind(logger);
    logger.info = (message, options) => {
        // The Laravel plugin prints a snapshot of APP_URL from startup.
        const plainMessage = stripVTControlCharacters(message);
        if (/^\s*➜\s*APP_URL:\s*https?:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i.test(plainMessage)) return;
        logInfo(message, options);
    };

    console.log(`>>> Vite mode: ${env.VITE_MODE || 'localhost'}`);

    return {
        customLogger: logger,
        resolve: {
            alias: {
                '@': path.resolve(configDir, './src'),
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
            ...(isCloudflared && URL.canParse(tunnelUrl) ? [showReadyTunnelUrl(tunnelUrl)] : []),
        ],
        server: {
            host: '127.0.0.1',
            port: 5173,
            strictPort: true,
            https: isNgrok ? {
                key: fs.readFileSync(path.resolve(configDir, 'certs/localhost+2-key.pem')),
                cert: fs.readFileSync(path.resolve(configDir, 'certs/localhost+2.pem')),
            } : undefined,
            cors: true,
            allowedHosts,
            hmr: isNgrok ? {
                host: 'localhost',
                protocol: 'wss',
                clientPort: 5173,
            } : undefined,
        },
        build: {
            outDir: '../backend/public/build',
            manifest: true,
            emptyOutDir: true,
        },
    };
});
