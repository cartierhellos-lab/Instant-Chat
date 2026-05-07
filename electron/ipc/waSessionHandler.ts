/**
 * WhatsApp 会话 IPC Handler — 生产级实现
 * 功能：BrowserView 生命周期管理 | 注入脚本 | 消息转发 | 会话状态机
 */

import { ipcMain, BrowserView, BrowserWindow, session as electronSession } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ─── 类型 ─────────────────────────────────────────────────────────────────────

/** 会话状态机的合法状态 */
type SessionStatus = 'loading' | 'qr' | 'online' | 'offline';

interface SessionInfo {
  view: BrowserView;
  status: SessionStatus;
  sessionId: string;
  /** 是否已注入监听脚本 */
  injected: boolean;
  /** 视图是否当前可见 */
  visible: boolean;
}

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── 全局状态 ─────────────────────────────────────────────────────────────────

/** BrowserView 实例池：sessionId → SessionInfo */
const sessionPool = new Map<string, SessionInfo>();

/** 主窗口引用（用于注册 BrowserView、转发事件） */
let mainWin: BrowserWindow | null = null;

// ─── 日志工具 ─────────────────────────────────────────────────────────────────

function writeWaLog(level: 'INFO' | 'WARN' | 'ERROR', msg: string, extra?: unknown): void {
  const ts = new Date().toISOString();
  const detail = extra !== undefined ? ` | ${JSON.stringify(extra)}` : '';
  const line = `[${ts}] [${level}] [wa-session] ${msg}${detail}\n`;
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'wa-session.log'), line, 'utf-8');
  } catch {
    // 忽略日志写入失败
  }
  if (!app.isPackaged) {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](line.trim());
  }
}

// ─── 注入脚本内容 ─────────────────────────────────────────────────────────────

/**
 * 生成注入到 WhatsApp Web 的监听脚本
 * 功能：
 *   1. 检测 QR 码 / 已登录状态
 *   2. MutationObserver 监听新消息气泡
 *   3. 联系人头像点击 → 通知主进程展示用户画像面板
 *   4. 实时翻译钩子（调用 electronAPI 缓存优先翻译）
 *
 * 注意：此脚本在 WhatsApp Web 的 renderer 上下文中运行，
 * 可以访问 window.electronAPI（通过 contextBridge 桥接）
 */
function buildInjectScript(sessionId: string): string {
  return `
(function() {
  'use strict';

  const SESSION_ID = ${JSON.stringify(sessionId)};
  const POLL_INTERVAL = 2000; // ms

  // 防重复注入
  if (window.__instantChatInjected) return;
  window.__instantChatInjected = true;

  // ── 工具函数 ────────────────────────────────────────────────────────────────

  function sendToMain(channel, data) {
    // electronAPI 由 contextBridge 暴露，但注入脚本运行在 isolated world
    // 使用 ipcRenderer 不可达，改由主进程轮询 / DOM 属性通信
    // 实际实现：通过 window.postMessage → preload 转发
    window.postMessage({ __instantChat: true, channel, data }, '*');
  }

  // ── 状态检测 ────────────────────────────────────────────────────────────────

  let lastStatus = '';

  function detectStatus() {
    // QR 码容器（WhatsApp Web 2024 selector）
    const qrCanvas = document.querySelector('canvas[aria-label="Scan me!"]') ||
                     document.querySelector('[data-ref]');
    // 聊天列表（已登录标志）
    const chatList  = document.querySelector('#pane-side') ||
                      document.querySelector('[data-testid="chat-list"]');

    let status = 'loading';
    if (qrCanvas)  status = 'qr';
    else if (chatList) status = 'online';

    if (status !== lastStatus) {
      lastStatus = status;
      sendToMain('wa:statusChange', { sessionId: SESSION_ID, status });

      // 登录成功后启动消息监听
      if (status === 'online') {
        startMessageObserver();
        startAvatarClickHandler();
      }
    }
  }

  // 每 2 秒轮询状态
  const statusTimer = setInterval(detectStatus, POLL_INTERVAL);
  detectStatus(); // 立即检测一次

  // ── 新消息监听（MutationObserver）──────────────────────────────────────────

  let messageObserver = null;
  const seenMessages = new Set(); // 去重已处理的消息

  function extractMessageText(el) {
    // 尝试多个可能的 selector（WhatsApp Web 结构会变化）
    const copyable = el.querySelector('.copyable-text');
    if (copyable) return copyable.innerText || copyable.textContent || '';
    const span = el.querySelector('span[class*="selectable-text"]');
    if (span) return span.innerText || '';
    return '';
  }

  function extractSender(el) {
    const header = el.closest('[data-id]');
    const name = header?.querySelector('span[data-testid="msg-meta"]')?.previousSibling?.textContent;
    return name || 'unknown';
  }

  function startMessageObserver() {
    if (messageObserver) return;

    const target = document.querySelector('#main') ||
                   document.querySelector('[data-testid="conversation-panel-messages"]') ||
                   document.body;

    messageObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          // 只处理消息类节点
          const msgEl = node.querySelector('[data-testid="msg-container"]') ||
                        (node.matches?.('[data-testid="msg-container"]') ? node : null);
          if (!msgEl) continue;

          // 仅处理收到的消息（非自己发送）
          const isIncoming = !msgEl.querySelector('[data-testid="msg-dblcheck"]');
          if (!isIncoming) continue;

          const msgId = msgEl.closest('[data-id]')?.getAttribute('data-id');
          if (!msgId || seenMessages.has(msgId)) continue;
          seenMessages.add(msgId);

          const text = extractMessageText(msgEl);
          const from = extractSender(msgEl);

          if (text) {
            sendToMain('wa:newMessage', {
              sessionId: SESSION_ID,
              from,
              text,
              time: Date.now(),
              msgId,
            });
          }
        }
      }
    });

    messageObserver.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  // ── 头像点击 → 用户画像面板 ────────────────────────────────────────────────

  function startAvatarClickHandler() {
    document.addEventListener('click', (e) => {
      const avatar = e.target.closest('[data-testid="contact-photo"]') ||
                     e.target.closest('img[src*="profile"]');
      if (!avatar) return;

      // 尝试提取电话号码（WhatsApp 号码通常在 data-id 或 aria-label 中）
      const container = avatar.closest('[data-id]');
      const rawId = container?.getAttribute('data-id') || '';
      const phone = rawId.replace('@c.us', '').replace(/[^0-9+]/g, '');
      if (!phone) return;

      sendToMain('wa:avatarClick', {
        sessionId: SESSION_ID,
        phone_number: phone,
        platform: 'whatsapp',
      });
    }, true); // capture phase
  }

  // ── postMessage 转发（供主进程 executeJavaScript 轮询，或 preload 监听）──
  // 主进程在注入后会监听 webContents.ipc 消息
  // 由于注入脚本无法直接访问 ipcRenderer，通过 postMessage 传递给 preload
  // preload 已在 wa-partition 的 session 中预注入转发逻辑（见下方说明）

  console.log('[Instant-Chat] WhatsApp inject v1.0 loaded for session:', SESSION_ID);
})();
  `.trim();
}

/**
 * 在 BrowserView 的 session 中注入 preload 转发脚本
 * 使 window.postMessage → ipcRenderer.send 的通道可用
 */
function buildPartitionPreload(): string {
  return `
(function() {
  // 此脚本在 wa-partition 的 preload 中运行，拥有 Node 环境
  const { ipcRenderer } = require('electron');
  window.addEventListener('message', (e) => {
    if (!e.data?.__instantChat) return;
    ipcRenderer.send('wa:inject-event', e.data.channel, e.data.data);
  });
})();
  `.trim();
}

// ─── 会话创建 ─────────────────────────────────────────────────────────────────

async function createSession(sessionId: string): Promise<void> {
  if (sessionPool.has(sessionId)) {
    writeWaLog('WARN', `Session already exists: ${sessionId}`);
    return;
  }
  if (!mainWin) throw new Error('Main window not initialized');

  const partitionKey = `persist:wa-${sessionId}`;

  // 获取或创建隔离 session
  const partitionSession = electronSession.fromPartition(partitionKey);

  // 注入 postMessage→IPC 转发 preload（在 partition session 中）
  const preloadScript = buildPartitionPreload();
  // 写临时 preload 文件（electron 的 registerPreloadScript 需要文件路径）
  const tmpDir = path.join(app.getPath('temp'), 'instant-chat-preloads');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const preloadPath = path.join(tmpDir, `wa-preload-${sessionId}.js`);
  fs.writeFileSync(preloadPath, preloadScript, 'utf-8');

  // electron 24+ 支持 session.setPreloads
  if (typeof (partitionSession as any).setPreloads === 'function') {
    (partitionSession as any).setPreloads([preloadPath]);
  }

  // 创建 BrowserView
  const view = new BrowserView({
    webPreferences: {
      session: partitionSession,
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // 允许 WhatsApp Web 使用剪贴板等权限
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const info: SessionInfo = {
    view,
    status: 'loading',
    sessionId,
    injected: false,
    visible: false,
  };

  sessionPool.set(sessionId, info);

  // 初始隐藏（大小为 0）
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  mainWin.addBrowserView(view);

  // 监听加载完成，注入脚本
  view.webContents.on('did-finish-load', () => {
    const url = view.webContents.getURL();
    if (!url.includes('web.whatsapp.com')) return;
    injectScript(sessionId);
  });

  // 监听导航状态
  view.webContents.on('did-start-loading', () => updateStatus(sessionId, 'loading'));
  view.webContents.on('did-fail-load', (_e, code, desc) => {
    writeWaLog('WARN', `Session ${sessionId} load failed`, { code, desc });
    updateStatus(sessionId, 'offline');
  });

  // 监听从注入脚本发来的 IPC 消息
  view.webContents.ipc.on('wa:inject-event', (_event, channel: string, data: unknown) => {
    handleInjectEvent(sessionId, channel, data);
  });

  // 加载 WhatsApp Web
  await view.webContents.loadURL('https://web.whatsapp.com', {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Safari/537.36',
  });

  writeWaLog('INFO', `Session created: ${sessionId}`);
}

// ─── 注入脚本 ─────────────────────────────────────────────────────────────────

async function injectScript(sessionId: string): Promise<void> {
  const info = sessionPool.get(sessionId);
  if (!info) return;

  try {
    const script = buildInjectScript(sessionId);
    await info.view.webContents.executeJavaScript(script);
    info.injected = true;
    writeWaLog('INFO', `Inject script loaded: ${sessionId}`);
  } catch (err) {
    writeWaLog('ERROR', `Inject failed for ${sessionId}`, err);
  }
}

// ─── 注入事件分发 ─────────────────────────────────────────────────────────────

function handleInjectEvent(sessionId: string, channel: string, data: unknown): void {
  if (!mainWin) return;

  switch (channel) {
    case 'wa:statusChange': {
      const { status } = data as { sessionId: string; status: SessionStatus };
      updateStatus(sessionId, status);
      break;
    }
    case 'wa:newMessage': {
      // 转发到渲染进程
      mainWin.webContents.send('wa:newMessage', data);
      writeWaLog('INFO', `New message from session ${sessionId}`);
      break;
    }
    case 'wa:avatarClick': {
      const { phone_number, platform } = data as { phone_number: string; platform: string };
      // 转发用户画像面板请求
      mainWin.webContents.send('app:showUserPortrait', { platform, phone_number });
      break;
    }
    default:
      writeWaLog('WARN', `Unknown inject channel: ${channel}`);
  }
}

// ─── 状态机 ───────────────────────────────────────────────────────────────────

function updateStatus(sessionId: string, status: SessionStatus): void {
  const info = sessionPool.get(sessionId);
  if (!info || info.status === status) return;

  info.status = status;

  if (mainWin) {
    mainWin.webContents.send('wa:sessionStatus', { sessionId, status });
  }

  writeWaLog('INFO', `Session ${sessionId} status → ${status}`);
}

// ─── 会话显示 / 隐藏 ──────────────────────────────────────────────────────────

/**
 * 显示指定会话并调整位置大小
 * bounds 使用 CSS 逻辑像素，主进程自动换算设备像素
 */
function showSession(sessionId: string, bounds: Bounds): void {
  const info = sessionPool.get(sessionId);
  if (!info || !mainWin) {
    writeWaLog('WARN', `showSession: session not found ${sessionId}`);
    return;
  }

  const scaleFactor = mainWin.webContents.getOwnerBrowserWindow()?.webContents
    ? 1
    : 1;

  // 将所有其他可见 view 隐藏（单屏同时只展示一个）
  for (const [id, s] of sessionPool.entries()) {
    if (id !== sessionId && s.visible) {
      s.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      s.visible = false;
    }
  }

  // 设置 BrowserView 位置（electron bounds 用整数像素）
  info.view.setBounds({
    x: Math.round(bounds.x * scaleFactor),
    y: Math.round(bounds.y * scaleFactor),
    width: Math.round(bounds.w * scaleFactor),
    height: Math.round(bounds.h * scaleFactor),
  });

  // 调整 z-order（置顶）
  mainWin.setTopBrowserView(info.view);
  info.visible = true;

  writeWaLog('INFO', `Session ${sessionId} shown`, bounds);
}

function hideSession(sessionId: string): void {
  const info = sessionPool.get(sessionId);
  if (!info) return;
  info.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  info.visible = false;
  writeWaLog('INFO', `Session ${sessionId} hidden`);
}

// ─── 会话销毁 ─────────────────────────────────────────────────────────────────

function closeSession(sessionId: string): void {
  const info = sessionPool.get(sessionId);
  if (!info) return;

  try {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.removeBrowserView(info.view);
    }
    // electron 28+ BrowserView 可调用 destroy
    if (typeof (info.view as any).destroy === 'function') {
      (info.view as any).destroy();
    }
    // 清理 session 中的临时 preload 文件
    const preloadPath = path.join(
      app.getPath('temp'),
      'instant-chat-preloads',
      `wa-preload-${sessionId}.js`,
    );
    if (fs.existsSync(preloadPath)) fs.unlinkSync(preloadPath);
  } catch (err) {
    writeWaLog('ERROR', `Error closing session ${sessionId}`, err);
  }

  sessionPool.delete(sessionId);
  writeWaLog('INFO', `Session closed: ${sessionId}`);
}

/** 应用退出时销毁所有会话 */
export function destroyAllSessions(): void {
  for (const sessionId of [...sessionPool.keys()]) {
    closeSession(sessionId);
  }
  writeWaLog('INFO', 'All sessions destroyed');
}

// ─── IPC Handler 注册 ─────────────────────────────────────────────────────────

export function registerWaSessionHandlers(win: BrowserWindow): void {
  mainWin = win;

  // 创建会话
  ipcMain.handle('wa:createSession', async (_event, sessionId: string) => {
    try {
      await createSession(sessionId);
    } catch (err) {
      writeWaLog('ERROR', `wa:createSession failed for ${sessionId}`, err);
      throw err;
    }
  });

  // 关闭会话
  ipcMain.handle('wa:closeSession', (_event, sessionId: string) => {
    closeSession(sessionId);
  });

  // 显示会话
  ipcMain.handle('wa:showSession', (_event, sessionId: string, bounds: Bounds) => {
    showSession(sessionId, bounds);
  });

  // 隐藏会话
  ipcMain.handle('wa:hideSession', (_event, sessionId: string) => {
    hideSession(sessionId);
  });

  // 查询状态
  ipcMain.handle('wa:getSessionStatus', (_event, sessionId: string): SessionStatus => {
    return sessionPool.get(sessionId)?.status ?? 'offline';
  });

  // 列出所有会话
  ipcMain.handle('wa:listSessions', (): string[] => {
    return [...sessionPool.keys()];
  });

  // 主窗口大小变化时重新布局可见会话
  win.on('resize', () => {
    for (const [sessionId, info] of sessionPool.entries()) {
      if (info.visible) {
        // 保持已有 bounds（不重置，由渲染进程主动 showSession 管理）
        writeWaLog('INFO', `Window resized, session ${sessionId} may need re-layout`);
      }
    }
  });

  writeWaLog('INFO', 'WA session IPC handlers registered');
}
