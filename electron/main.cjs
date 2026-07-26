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
const { spawn } = require('node:child_process');
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
