/**
 * Electron 主进程 — 生产级实现
 * 负责：主窗口创建、BrowserView 实例池、IPC 总线、系统托盘、自动更新、错误捕获
 */

import {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  shell,
  dialog,
  session as electronSession,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ─── IPC handler 注册 ────────────────────────────────────────────────────────
import { registerTranslateHandlers } from './ipc/translateHandler';
import { registerWaSessionHandlers, destroyAllSessions } from './ipc/waSessionHandler';

// ─── 常量 ────────────────────────────────────────────────────────────────────
const IS_DEV = !app.isPackaged;
const DEV_URL = 'http://localhost:5173';
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'main.log');

// ─── 日志工具 ─────────────────────────────────────────────────────────────────
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function writeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, extra?: unknown): void {
  ensureLogDir();
  const ts = new Date().toISOString();
  const extraStr = extra !== undefined ? `\n  detail: ${JSON.stringify(extra, null, 2)}` : '';
  const line = `[${ts}] [${level}] ${message}${extraStr}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf-8');
  if (IS_DEV) {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](line.trimEnd());
  }
}

// ─── 全局错误捕获 ─────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  writeLog('ERROR', 'uncaughtException', { message: err.message, stack: err.stack });
  // 非开发环境弹对话框后退出
  if (!IS_DEV) {
    dialog.showErrorBox(
      'Instant-Chat 遇到了一个错误',
      `${err.message}\n\n详情已记录到：${LOG_FILE}`,
    );
    app.quit();
  }
});

process.on('unhandledRejection', (reason) => {
  writeLog('WARN', 'unhandledRejection', reason);
});

// ─── 全局引用（防止 GC）──────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

/** 未读消息计数（角标用） */
let unreadCount = 0;

// ─── 单实例锁 ────────────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── 主窗口创建 ───────────────────────────────────────────────────────────────
async function createMainWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f8f9fa',
    // 无边框 + 自定义标题栏
    titleBarStyle: 'hidden',
    // macOS：允许拖动区域
    trafficLightPosition: { x: 12, y: 12 },
    // Windows / Linux 隐藏默认边框
    frame: process.platform === 'darwin',
    show: false, // 等待 ready-to-show 再显示，避免白屏
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要 require Node 模块
      webviewTag: false,
      spellcheck: true,
    },
  });

  // 开发 / 生产加载不同资源
  if (IS_DEV) {
    await win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    await win.loadFile(indexPath);
  }

  // 首次渲染完成后再展示，消除闪屏
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // 关闭时最小化到托盘
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  // 新窗口请求用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  writeLog('INFO', 'Main window created');
  return win;
}

// ─── 系统托盘 ─────────────────────────────────────────────────────────────────
function createTray(win: BrowserWindow): Tray {
  // 图标路径：打包后在 resources/ 目录
  const iconPath = IS_DEV
    ? path.join(__dirname, '../../public/tray-icon.png')
    : path.join(process.resourcesPath, 'tray-icon.png');

  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  const t = new Tray(icon.resize({ width: 16, height: 16 }));
  t.setToolTip('Instant-Chat');

  const buildMenu = () =>
    Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => {
          win.show();
          win.focus();
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

  t.setContextMenu(buildMenu());

  t.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  return t;
}

/** 更新托盘角标（unread 数量） */
function updateTrayBadge(count: number): void {
  unreadCount = count;
  if (process.platform === 'darwin') {
    // macOS dock 角标
    app.dock?.setBadge(count > 0 ? String(count) : '');
  }
  if (tray) {
    tray.setToolTip(count > 0 ? `Instant-Chat (${count} 条未读)` : 'Instant-Chat');
  }
}

// ─── 自动更新 ─────────────────────────────────────────────────────────────────
function setupAutoUpdater(win: BrowserWindow): void {
  if (IS_DEV) return; // 开发环境跳过

  autoUpdater.autoDownload = false;
  autoUpdater.logger = {
    info: (msg: string) => writeLog('INFO', `[updater] ${msg}`),
    warn: (msg: string) => writeLog('WARN', `[updater] ${msg}`),
    error: (msg: string) => writeLog('ERROR', `[updater] ${msg}`),
    debug: () => {},
    transports: {},
  } as never;

  autoUpdater.on('update-available', (info) => {
    writeLog('INFO', 'Update available', info);
    win.webContents.send('updater:available', info);
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: '发现新版本',
        message: `新版本 ${info.version} 已发布，是否立即下载？`,
        buttons: ['下载', '稍后'],
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
      });
  });

  autoUpdater.on('download-progress', (p) => {
    win.webContents.send('updater:progress', p);
    win.setProgressBar(p.percent / 100);
  });

  autoUpdater.on('update-downloaded', (info) => {
    writeLog('INFO', 'Update downloaded', info);
    win.setProgressBar(-1);
    dialog
      .showMessageBox(win, {
        type: 'info',
        title: '更新已下载',
        message: '更新包已下载完毕，重启后生效，是否现在重启？',
        buttons: ['重启', '稍后'],
      })
      .then(({ response }) => {
        if (response === 0) {
          app.isQuitting = true;
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err) => {
    writeLog('ERROR', 'Auto-updater error', { message: err.message });
  });

  // 启动 5 秒后检查更新，避免影响首屏
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  // 每 4 小时定期检查
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}

// ─── 窗口控制 IPC ─────────────────────────────────────────────────────────────
function registerWindowControlHandlers(win: BrowserWindow): void {
  ipcMain.on('window:minimize', () => win.minimize());
  ipcMain.on('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', () => win.hide());
  ipcMain.handle('window:isMaximized', () => win.isMaximized());

  // 最大化状态变化时通知渲染进程（标题栏按钮图标切换）
  win.on('maximize', () => win.webContents.send('window:maximizeChange', true));
  win.on('unmaximize', () => win.webContents.send('window:maximizeChange', false));
}

// ─── 未读消息角标 IPC ─────────────────────────────────────────────────────────
function registerBadgeHandlers(): void {
  ipcMain.on('badge:update', (_e, count: number) => updateTrayBadge(count));
}

// ─── 应用生命周期 ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  writeLog('INFO', `App starting — v${app.getVersion()} | ${IS_DEV ? 'DEV' : 'PROD'}`);

  // 阻止 HTTP → HTTPS 降级（生产安全策略）
  if (!IS_DEV) {
    electronSession.defaultSession.webRequest.onBeforeSendHeaders((details, cb) => {
      cb({ requestHeaders: details.requestHeaders });
    });
  }

  mainWindow = await createMainWindow();
  tray = createTray(mainWindow);

  // 注册所有 IPC handlers
  registerWindowControlHandlers(mainWindow);
  registerBadgeHandlers();
  registerTranslateHandlers();
  registerWaSessionHandlers(mainWindow);

  setupAutoUpdater(mainWindow);

  app.on('activate', () => {
    // macOS：点击 dock 图标重新展示窗口
    if (mainWindow === null) {
      createMainWindow().then((w) => {
        mainWindow = w;
        tray = createTray(w);
      });
    } else {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS 习惯：关闭窗口不退出应用
  if (process.platform !== 'darwin') {
    destroyAllSessions();
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  destroyAllSessions();
  writeLog('INFO', 'App quitting');
});

// ─── 类型扩展（app.isQuitting 自定义属性）──────────────────────────────────
declare module 'electron' {
  interface App {
    isQuitting: boolean;
  }
}
app.isQuitting = false;
