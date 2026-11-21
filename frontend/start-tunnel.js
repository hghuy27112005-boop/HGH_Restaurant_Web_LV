import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const frontend = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(frontend, '../backend');
const origin = 'http://127.0.0.1:8000';
const viteOrigin = 'http://127.0.0.1:5173';
const tunnelHostPattern = /(?:<your-tunnel>|[a-z0-9-]+)\.trycloudflare\.com/gi;
const tunnelUrlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i;
const stop = new AbortController();

async function isHealthy(url, options) {
    try {
        const response = await fetch(url, {
            ...options,
            redirect: 'manual',
            signal: AbortSignal.any([stop.signal, AbortSignal.timeout(4000)]),
        });
        await response.body?.cancel();
        return response.ok;
    } catch {
        return false;
    }
}

async function isViteHealthy() {
    const hotFile = path.join(backend, 'public/hot');
    const hotUrl = await fs.promises.readFile(hotFile, 'utf8').catch(() => '');
    return hotUrl.trim() === viteOrigin && await isHealthy(`${viteOrigin}/@vite/client`);
}

async function waitUntil(check, timeoutMs, errorMessage) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        stop.signal.throwIfAborted();
        if (await check()) return;
        await sleep(1500, undefined, { signal: stop.signal });
    }
    throw new Error(errorMessage);
}

function updateEnv(directory, update) {
    const filename = path.join(directory, '.env');
    const source = fs.existsSync(filename) ? filename : `${filename}.cloudflared.backup`;
    const original = fs.readFileSync(source, 'utf8');
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const entries = original.split(/\r?\n/);
    const set = (name, value, fallback) => {
        const index = entries.findIndex(line => line.startsWith(`${name}=`));
        if (index >= 0) {
            const previous = entries[index].slice(name.length + 1);
            entries[index] = `${name}=${typeof value === 'function' ? value(previous) : value}`;
        } else {
            const next = typeof value === 'function' ? fallback : value;
            if (next !== undefined) {
                entries.splice(entries.at(-1) === '' ? entries.length - 1 : entries.length, 0, `${name}=${next}`);
            }
        }
    };
    update(set);

    const temp = `${filename}.cloudflared.${process.pid}.tmp`;
    try {
        fs.writeFileSync(temp, entries.join(newline), { mode: 0o600, flag: 'wx' });
        fs.renameSync(temp, filename);
    } finally {
        fs.rmSync(temp, { force: true });
    }
}

function updateTunnelEnv(url) {
    const { hostname } = new URL(url);
    updateEnv(backend, set => {
        set('APP_URL', url);
        set('APP_FRONTEND_URL', url);
        set('ASSET_URL', url);
        set('SANCTUM_STATEFUL_DOMAINS', previous => {
            const domains = previous.replace(/^["']|["']$/g, '').split(',')
                .map(domain => domain.trim())
                .filter(domain => domain && !domain.endsWith('.trycloudflare.com'));
            return [...domains, hostname].join(',');
        }, hostname);
        for (const key of ['GOOGLE_REDIRECT_URL', 'FACEBOOK_REDIRECT_URL', 'VNPAY_RETURN_URL', 'VNPAY_IPN_URL']) {
            set(key, previous => previous.replace(tunnelHostPattern, hostname));
        }
    });
    updateEnv(frontend, set => {
        set('VITE_MODE', 'cloudflared');
        set('VITE_API_URL', `${url}/api`);
        set('VITE_CLOUDFLARED_URL', url);
        set('APP_URL', url);
    });
}

let cloudflared;
function stopTunnel() {
    stop.abort();
    cloudflared?.kill();
}
process.once('SIGINT', stopTunnel);

try {
    const bundled = path.join(frontend, 'cloudflared.exe');
    const executable = process.platform === 'win32' && fs.existsSync(bundled) ? bundled : 'cloudflared';
    cloudflared = spawn(executable, ['tunnel', '--url', origin]);
    let tunnelUrl;
    let startupError;
    cloudflared.on('error', error => { startupError = error; });
    const closed = new Promise(resolve => cloudflared.once('close', (code, signal) => {
        startupError ??= new Error(`cloudflared stopped (code ${code ?? signal}).`);
        resolve();
    }));

    for (const stream of [cloudflared.stdout, cloudflared.stderr]) {
        createInterface({ input: stream }).on('line', line => {
            const match = line.match(tunnelUrlPattern);
            if (match && !tunnelUrl) tunnelUrl = match[0];
            console.log(line);
        });
    }

    console.log('Waiting for the tunnel and Laravel at http://127.0.0.1:8000/up...');
    await waitUntil(async () => {
        if (startupError) throw startupError;
        return tunnelUrl && await isHealthy(`${tunnelUrl}/up`);
    }, 150_000, 'Quick Tunnel did not reach Laravel. Check the cloudflared connection log above.');

    stop.signal.throwIfAborted();
    if (startupError) throw startupError;
    updateTunnelEnv(tunnelUrl);
    console.log(`Waiting for Vite at ${viteOrigin}/@vite/client...`);
    await waitUntil(async () => {
        if (startupError) throw startupError;
        if (!(await isViteHealthy()) || !(await isHealthy(tunnelUrl))) return false;
        return isHealthy(`${viteOrigin}/__hgh_tunnel_ready`, {
            method: 'POST',
            headers: { 'X-HGH-Tunnel-Url': tunnelUrl },
        });
    }, 30_000, 'The tunnel is connected but the application did not load. Check the Laravel and Vite windows.');

    stop.signal.throwIfAborted();
    if (startupError) throw startupError;
    console.log(`\nTunnel ready: ${tunnelUrl}\n`);
    await closed;
    throw startupError;
} catch (error) {
    if (stop.signal.aborted) {
        console.log('\nTunnel stopped.');
    } else {
        console.error(`\nTunnel error: ${error.message}`);
        process.exitCode = 1;
    }
    console.log('Run npm run tunnel in this window to start it again.');
} finally {
    cloudflared?.kill();
    process.removeListener('SIGINT', stopTunnel);
}
