const { app, BrowserWindow, ipcMain, clipboard, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const unsafeNoSandbox = process.env.ELECTRON_DISABLE_SANDBOX === '1';
const disableHardwareAcceleration = process.env.ELECTRON_DISABLE_GPU !== '0';

if (disableHardwareAcceleration) {
  app.disableHardwareAcceleration();
}

if (unsafeNoSandbox) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

const isDev =
  process.env.ELECTRON_START_URL ||
  !fs.existsSync(path.join(__dirname, '..', 'dist', 'index.html'));

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#edf2f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !unsafeNoSandbox,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL || 'http://127.0.0.1:8080');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('desktop:clipboard-read', () => clipboard.readText());
  ipcMain.handle('desktop:clipboard-write', (_event, text) => {
    clipboard.writeText(typeof text === 'string' ? text : '');
    return true;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
