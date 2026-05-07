/**
 * Electron Preload Script — contextBridge 安全桥接
 * 渲染进程通过 window.electronAPI 访问所有 Electron 能力
 * 严格遵循 contextIsolation: true，不暴露任何 Node/Electron 原始对象
 */

import { contextBridge, ipcRenderer } from 'electron';

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

type SessionStatus = 'loading' | 'qr' | 'online' | 'offline';

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TranslateArgs {
  text: string;
  local: string;   // 源语言代码，如 'zh'
  target: string;  // 目标语言代码，如 'en'
}

interface NewMessageData {
  sessionId: string;
  from: string;
  text: string;
  time: number; // unix ms
}

interface SessionStatusData {
  sessionId: string;
  status: SessionStatus;
  avatarUrl?: string;
}

interface LanguageOption {
  code: string;
  displayName: string;
}

interface UserPortraitData {
  platform: string;
  phone_number: string;
}

interface TranslateSettings {
  translateEngine: 'mymemory' | 'ollama' | 'deepl';
  ollamaUrl?: string;
  ollamaModel?: string;
  deeplApiKey?: string;
  localLang?: string;
  targetLang?: string;
}

// 事件监听器清理函数
type Unsubscribe = () => void;

// ─── 辅助：安全注册事件监听（自动防内存泄漏）──────────────────────────────
function onIpcEvent<T>(
  channel: string,
  cb: (data: T) => void,
): Unsubscribe {
  // 包装回调，从 IPC event 中提取 data
  const handler = (_event: Electron.IpcRendererEvent, data: T) => cb(data);
  ipcRenderer.on(channel, handler);
  // 返回清理函数，供渲染进程在组件卸载时调用
  return () => ipcRenderer.removeListener(channel, handler);
}

// ─── electronAPI 实现 ─────────────────────────────────────────────────────────

const electronAPI = {
  // ── WhatsApp 会话管理 ────────────────────────────────────────────────────

  /**
   * 创建一个新的 WhatsApp BrowserView 会话
   * 主进程会分配独立 session partition 保证 Cookie 隔离
   */
  wa_createSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke('wa:createSession', sessionId),

  /**
   * 销毁会话并释放 BrowserView 资源
   */
  wa_closeSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke('wa:closeSession', sessionId),

  /**
   * 将指定会话的 BrowserView 定位到给定区域并显示
   * bounds 使用屏幕物理像素坐标（主进程负责 DPI 换算）
   */
  wa_showSession: (sessionId: string, bounds: Bounds): Promise<void> =>
    ipcRenderer.invoke('wa:showSession', sessionId, bounds),

  /**
   * 隐藏指定会话的 BrowserView（不销毁，保持后台登录状态）
   */
  wa_hideSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke('wa:hideSession', sessionId),

  /**
   * 查询会话当前状态
   */
  wa_getSessionStatus: (sessionId: string): Promise<SessionStatus> =>
    ipcRenderer.invoke('wa:getSessionStatus', sessionId),

  /**
   * 获取所有活跃会话 ID 列表
   */
  wa_listSessions: (): Promise<string[]> =>
    ipcRenderer.invoke('wa:listSessions'),

  // ── 翻译 ────────────────────────────────────────────────────────────────

  /**
   * 翻译文本（主进程处理，含 LRU 缓存 + 引擎降级）
   * local: 源语言，target: 目标语言
   * 返回翻译结果，失败时返回原文
   */
  translateText: (args: TranslateArgs): Promise<string> =>
    ipcRenderer.invoke('translate:text', args),

  // ── 事件订阅 ────────────────────────────────────────────────────────────

  /**
   * 订阅 WhatsApp 新消息事件
   * 由注入脚本检测到新消息后，经主进程转发到渲染进程
   * @returns 清理函数，组件卸载时调用
   */
  onNewMessage: (cb: (data: NewMessageData) => void): Unsubscribe =>
    onIpcEvent<NewMessageData>('wa:newMessage', cb),

  /**
   * 订阅会话状态变化事件（loading/qr/online/offline + 头像 URL）
   * @returns 清理函数
   */
  onSessionStatusChange: (cb: (data: SessionStatusData) => void): Unsubscribe =>
    onIpcEvent<SessionStatusData>('wa:sessionStatus', cb),

  /**
   * 订阅窗口最大化状态变化（用于自定义标题栏按钮图标切换）
   */
  onMaximizeChange: (cb: (isMaximized: boolean) => void): Unsubscribe =>
    onIpcEvent<boolean>('window:maximizeChange', cb),

  /**
   * 订阅自动更新进度（用于渲染进度条）
   */
  onUpdaterProgress: (cb: (progress: { percent: number }) => void): Unsubscribe =>
    onIpcEvent('updater:progress', cb),

  // ── 语言列表 ────────────────────────────────────────────────────────────

  /**
   * 获取支持的语言列表（供注入脚本和翻译引擎使用）
   */
  languageList: (): Promise<LanguageOption[]> =>
    ipcRenderer.invoke('translate:languageList'),

  // ── 用户画像面板 ─────────────────────────────────────────────────────────

  /**
   * 通知渲染进程展示用户画像面板
   * 由 WhatsApp 注入脚本检测到联系人点击后触发
   */
  showUserPortraitPanel: (data: UserPortraitData): void =>
    ipcRenderer.send('app:showUserPortrait', data),

  /**
   * 订阅用户画像展示请求（渲染进程监听后弹出 Panel）
   */
  onShowUserPortrait: (cb: (data: UserPortraitData) => void): Unsubscribe =>
    onIpcEvent<UserPortraitData>('app:showUserPortrait', cb),

  // ── 翻译缓存（主进程内存 LRU，注入脚本可调用以加速重复翻译）──────────

  /**
   * 从主进程 LRU 缓存中查找翻译结果
   * @returns 缓存命中时返回翻译文本，否则返回 null
   */
  getCachedTranslation: (text: string, lang: string): Promise<string | null> =>
    ipcRenderer.invoke('translate:getCache', { text, lang }),

  /**
   * 将翻译结果写入主进程 LRU 缓存
   */
  setCachedTranslation: (text: string, lang: string, translated: string): Promise<void> =>
    ipcRenderer.invoke('translate:setCache', { text, lang, translated }),

  // ── 设置同步 ─────────────────────────────────────────────────────────────

  /**
   * 将渲染进程的翻译配置同步到主进程
   * 主进程翻译 handler 会立即应用新配置
   * 使用 send（非 invoke）：配置同步为 fire-and-forget
   */
  syncSettings: (settings: TranslateSettings): void =>
    ipcRenderer.send('settings:sync', settings),

  // ── 窗口控制（无边框窗口自定义标题栏）──────────────────────────────────

  /** 最小化到任务栏 */
  windowMinimize: (): void => ipcRenderer.send('window:minimize'),

  /** 切换最大化 / 还原 */
  windowMaximize: (): void => ipcRenderer.send('window:maximize'),

  /** 关闭（实际最小化到托盘） */
  windowClose: (): void => ipcRenderer.send('window:close'),

  /** 查询当前是否最大化 */
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),

  // ── 未读角标 ─────────────────────────────────────────────────────────────

  /**
   * 更新系统托盘 / Dock 未读角标数量
   * 渲染进程在 Zustand store 中统计后调用此方法
   */
  updateBadge: (count: number): void => ipcRenderer.send('badge:update', count),

  // ── 工具 ──────────────────────────────────────────────────────────────────

  /**
   * 用系统浏览器打开外部链接（安全，不在 Electron 内打开）
   * 注：shell.openExternal 在主进程已通过 setWindowOpenHandler 处理，
   * 此处为渲染进程主动调用场景（如"在浏览器中打开"按钮）
   */
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),

  /**
   * 获取应用版本号（用于关于页面展示）
   */
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:getVersion'),
};

// ─── 暴露到渲染进程 ───────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// ─── 类型声明（供 TypeScript 渲染进程使用）──────────────────────────────────
// 注：实际项目中应将此声明移至 src/types/electron.d.ts
export type ElectronAPI = typeof electronAPI;

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
