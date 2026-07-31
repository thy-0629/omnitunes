/**
 * Omnitunes Electron main process.
 *
 * Two modes:
 *   - dev  (ELECTRON_DEV=1): expects `pnpm dev` (:3000) and `pnpm dev:web`
 *     (:5173) to be running already; loads the Vite dev server for HMR.
 *   - prod (default): spawns the compiled backend (dist/server.js) as a
 *     child process, waits for /health, then loads the static frontend it
 *     serves (single origin — no CORS, no proxy needed).
 *
 * The backend is killed when the app quits.
 */
const { app, BrowserWindow } = require('electron');
const { spawn, execSync } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

// Debug log — GUI apps have no console, so trace to a file.
const LOG_FILE = path.join(process.env.TEMP || '.', 'omnitunes-electron.log');
function log(...args) {
  const line = `${new Date().toISOString()} ${args.map(String).join(' ')}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // ignore
  }
  console.log(...args);
}
process.on('uncaughtException', (err) => log('UNCAUGHT:', err.stack || err));

const IS_DEV = process.env.ELECTRON_DEV === '1';
const BACKEND_PORT = process.env.PORT || '3000';
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const DEV_URL = 'http://localhost:5173';

/** @type {import('node:child_process').ChildProcess | null} */
let backend = null;
let mainWindow = null;

/**
 * Detect the OS-level HTTP proxy on Windows.
 *
 * Clash / V2Ray "system proxy" mode writes the Windows registry but does NOT
 * set HTTP_PROXY/HTTPS_PROXY env vars. The backend's outbound fetch (undici)
 * only honors those env vars, so without this it bypasses the proxy and
 * archive.org times out. Returns an `http://host:port` URL or null.
 * Explicit HTTP(S)_PROXY env always wins (caller checks first).
 */
function detectSystemProxy() {
  if (process.platform !== 'win32') return null;
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  try {
    const enableOut = execSync(`reg query "${key}" /v ProxyEnable`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(enableOut)) return null;
    const serverOut = execSync(`reg query "${key}" /v ProxyServer`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = serverOut.match(/ProxyServer\s+REG_SZ\s+(.+)/);
    if (!m) return null;
    let host = m[1].trim();
    // per-protocol form: "http=127.0.0.1:8080;https=127.0.0.1:8080;socks=..."
    if (host.includes('=')) {
      const parts = {};
      for (const p of host.split(';')) {
        const [k, v] = p.split('=');
        if (k && v) parts[k.trim().toLowerCase()] = v.trim();
      }
      host = parts.https || parts.http || Object.values(parts)[0] || '';
    }
    if (!host) return null;
    if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
    return host;
  } catch {
    return null;
  }
}

function startBackend() {
  const serverEntry = path.join(__dirname, '..', 'dist', 'server.js');
  const dataDir = path.join(app.getPath('userData'), 'data');
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: BACKEND_PORT,
    HOST: '127.0.0.1',
    // per-user writable data location (the install dir may be read-only)
    DATABASE_URL: `file:${path.join(dataDir, 'omnitune.sqlite')}`,
    MEDIA_DIR: path.join(dataDir, 'media'),
    CACHE_DIR: path.join(dataDir, 'cache'),
  };
  delete env.ELECTRON_RUN_AS_NODE;

  // Forward the OS proxy to the backend so source-adapter fetch (archive.org,
  // bilibili) honors it. The backend's installProxySupport() reads these env
  // vars and wires undici's EnvHttpProxyAgent. NO_PROXY keeps localhost
  // (the backend's own /health, local streams) off the proxy.
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || detectSystemProxy();
  if (proxy) {
    env.HTTP_PROXY = proxy;
    env.HTTPS_PROXY = proxy;
    env.NO_PROXY = process.env.NO_PROXY || 'localhost,127.0.0.1,::1';
    log('using proxy for backend:', proxy);
  }

  // Prefer the system Node: better-sqlite3 is a native module built for the
  // system Node's ABI — Electron's embedded Node has a different ABI and
  // would fail to load it. Fall back to ELECTRON_RUN_AS_NODE only if no
  // system node is on PATH (requires an electron-rebuilt better-sqlite3).
  // cwd = app root so drizzle/ migrations resolve.
  const cwd = path.join(__dirname, '..');
  backend = spawn('node', [serverEntry], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  backend.on('error', () => {
    log('system node not found, falling back to Electron runtime');
    backend = spawn(process.execPath, [serverEntry], {
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    wireBackendLogs();
  });
  wireBackendLogs();
}

function wireBackendLogs() {
  backend.stdout.on('data', (d) => log('[backend]', String(d).trim()));
  backend.stderr.on('data', (d) => log('[backend!]', String(d).trim()));
  backend.on('exit', (code) => log(`[backend] exited with code ${code}`));
}

function waitForHealth(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolvePromise, reject) => {
    const attempt = () => {
      http
        .get(`${url}/health`, (res) => {
          if (res.statusCode === 200) return resolvePromise(undefined);
          retry();
        })
        .on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('backend did not become healthy in time'));
      }
      setTimeout(attempt, 400);
    };
    attempt();
  });
}

async function createWindow() {
  log('createWindow, IS_DEV=', IS_DEV, 'PORT=', BACKEND_PORT);
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      // The frontend only talks to our own backend — keep the session isolated.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (IS_DEV) {
    await mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    startBackend();
    log('backend spawned, waiting for health');
    await waitForHealth(BACKEND_URL);
    log('backend healthy, loading URL');
    await mainWindow.loadURL(BACKEND_URL);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (backend) backend.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (backend) backend.kill();
});
