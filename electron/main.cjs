const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');

let serverProcess = null;
let dbFilePath = null;
let splashWindow = null;
let logStream = null;

const getUnpackedPath = () => {
  const appPath = app.getAppPath();
  if (appPath.endsWith('app.asar')) {
    return appPath.replace(/app\.asar$/i, 'app.asar.unpacked');
  }
  return appPath;
};

const getServerEntry = () => {
  const unpacked = getUnpackedPath();
  const entry = path.join(unpacked, 'server', 'src', 'index.js');
  return entry;
};

const getClientIndex = () => {
  const appPath = app.getAppPath();
  return path.join(appPath, 'client', 'dist', 'index.html');
};

const startServer = () => {
  if (serverProcess) {
    return;
  }

  const userData = app.getPath('userData');
  dbFilePath = path.join(userData, 'hour-management.db');
  const logFile = path.join(userData, 'server.log');
  fs.mkdirSync(userData, { recursive: true });
  logStream = fs.createWriteStream(logFile, { flags: 'a' });

  const serverEntry = getServerEntry();
  logStream.write(`[${new Date().toISOString()}] Starting server\n`);
  logStream.write(`[${new Date().toISOString()}] appPath=${app.getAppPath()}\n`);
  logStream.write(`[${new Date().toISOString()}] serverEntry=${serverEntry}\n`);
  logStream.write(`[${new Date().toISOString()}] dbFile=${dbFilePath}\n`);

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      HOST: process.env.HOST || '127.0.0.1',
      PORT: process.env.PORT || '3001',
      DB_PATH: dbFilePath,
      ELECTRON_RUN_AS_NODE: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (chunk) => {
      logStream?.write(chunk);
    });
  }

  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (chunk) => {
      logStream?.write(chunk);
    });
  }

  serverProcess.on('exit', () => {
    logStream?.write(`[${new Date().toISOString()}] Server exited\n`);
    serverProcess = null;
  });
};

const stopServer = () => {
  if (!serverProcess) {
    return;
  }
  serverProcess.kill();
  serverProcess = null;
  if (logStream) {
    logStream.end();
    logStream = null;
  }
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0c0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (process.env.ELECTRON_START_URL) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    win.loadFile(getClientIndex());
  }
};

const createSplash = () => {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 320,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    show: true
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
};

const waitForServer = ({ host, port, timeoutMs = 15000 }) =>
  new Promise((resolve, reject) => {
    const start = Date.now();

    const attempt = () => {
      const req = http.get(
        {
          host,
          port,
          path: '/api/clock-status',
          timeout: 1500
        },
        (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            retry();
          }
        }
      );

      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Server start timed out.'));
        return;
      }
      setTimeout(attempt, 400);
    };

    attempt();
  });

app.whenReady().then(() => {
  if (!process.env.ELECTRON_START_URL) {
    createSplash();
    startServer();
    waitForServer({ host: process.env.HOST || '127.0.0.1', port: process.env.PORT || 3001 })
      .then(() => {
        createWindow();
        if (splashWindow) {
          splashWindow.close();
          splashWindow = null;
        }
      })
      .catch(() => {
        createWindow();
        if (splashWindow) {
          splashWindow.close();
          splashWindow = null;
        }
      });
    return;
  }
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  stopServer();
});

ipcMain.handle('open-user-data', async () => {
  const userData = app.getPath('userData');
  await shell.openPath(userData);
  return { ok: true };
});

ipcMain.handle('export-backup', async () => {
  if (!dbFilePath || !fs.existsSync(dbFilePath)) {
    return { ok: false, error: 'No local database found yet.' };
  }

  const defaultName = `hour-management-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.db`;

  const result = await dialog.showSaveDialog({
    title: 'Export backup',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'SQLite Database', extensions: ['db'] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, error: 'Export cancelled.' };
  }

  await fs.promises.copyFile(dbFilePath, result.filePath);
  return { ok: true, filePath: result.filePath };
});
