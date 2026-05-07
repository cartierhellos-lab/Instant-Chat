/**
 * electron.d.ts
 * WhatsApp Electron IPC Bridge 完整类型声明
 * 
 * 在 electron/preload.cjs 中通过 contextBridge.exposeInMainWorld('electronAPI', {...})
 * 注入后，渲染进程可通过 window.electronAPI 访问。
 */

export {};

/** WhatsApp 会话状态 */
export type WASessionStatus = 'loading' | 'qr' | 'online' | 'offline';

/** IPC 事件：会话状态变更 */
export interface WAStatusChangeEvent {
  sessionId: string;
  status: WASessionStatus;
  /** 二维码数据 URL（status === 'qr' 时提供） */
  qrDataUrl?: string;
  /** 已登录账号头像 URL（status === 'online' 时提供） */
  avatarUrl?: string;
  /** 已登录账号手机号（status === 'online' 时提供） */
  phone?: string;
}

/** IPC 事件：新消息到达 */
export interface WANewMessageEvent {
  sessionId: string;
  from: string;
  body: string;
  timestamp: number;
  /** 是否为自己发送的消息（outbound） */
  fromMe: boolean;
  hasMedia: boolean;
}

/** 列出会话时返回的会话摘要 */
export interface WASessionInfo {
  id: string;
  status: WASessionStatus;
  avatarUrl?: string;
  phone?: string;
  unreadCount: number;
  lastSeen?: string;
}

/** BrowserView 边界定位信息（屏幕坐标，像素） */
export interface WAViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * window.electronAPI
 * 
 * 在 Electron 应用中由 preload 注入，Web 环境下不存在（undefined）。
 * 所有方法均为异步（Promise），事件监听器通过 on* 方法注册。
 */
declare global {
  interface Window {
    /**
     * 原有的 desktopBridge（兼容，勿删）
     */
    desktopBridge?: {
      isElectron: boolean;
      readClipboard: () => Promise<string>;
      writeClipboard: (text: string) => Promise<boolean>;
    };

    /**
     * WhatsApp IPC 桥接 API
     * 仅在 Electron 环境中存在，Web 浏览器中为 undefined。
     */
    electronAPI?: {
      // ─── 标识 ────────────────────────────────────────────────────────────
      /** 永远为 true（用于检测是否在 Electron 中运行） */
      isElectron: true;

      // ─── 会话生命周期 ────────────────────────────────────────────────────
      /**
       * 获取当前所有已持久化的会话列表（应用重启后恢复）
       * @returns 会话信息数组
       */
      wa_listSessions: () => Promise<WASessionInfo[]>;

      /**
       * 创建一个新的 WhatsApp 会话
       * @returns 新创建的会话 ID
       */
      wa_createSession: () => Promise<string>;

      /**
       * 销毁指定会话，并关闭其 BrowserView
       * @param sessionId 会话 ID
       */
      wa_destroySession: (sessionId: string) => Promise<void>;

      // ─── BrowserView 显示控制 ────────────────────────────────────────────
      /**
       * 将指定会话的 BrowserView 覆盖到指定屏幕区域
       * @param sessionId 会话 ID
       * @param bounds    屏幕绝对坐标区域（相对于 BrowserWindow 客户区）
       */
      wa_showSession: (sessionId: string, bounds: WAViewBounds) => Promise<void>;

      /**
       * 隐藏指定会话的 BrowserView（不销毁，仅移出可视区域）
       * @param sessionId 会话 ID
       */
      wa_hideSession: (sessionId: string) => Promise<void>;

      /**
       * 隐藏所有 WhatsApp 会话的 BrowserView
       */
      wa_hideAllSessions: () => Promise<void>;

      /**
       * 更新指定会话 BrowserView 的位置/尺寸（ResizeObserver 触发时调用）
       * @param sessionId 会话 ID
       * @param bounds    新的边界区域
       */
      wa_updateBounds: (sessionId: string, bounds: WAViewBounds) => Promise<void>;

      // ─── 状态事件监听 ────────────────────────────────────────────────────
      /**
       * 监听会话状态变更（loading → qr → online / offline）
       * @param handler 回调函数，接收状态变更事件
       * @returns 取消监听函数
       */
      onSessionStatusChange: (
        handler: (event: WAStatusChangeEvent) => void
      ) => () => void;

      /**
       * 监听新消息到达（用于更新未读角标）
       * @param handler 回调函数，接收新消息事件
       * @returns 取消监听函数
       */
      onNewMessage: (
        handler: (event: WANewMessageEvent) => void
      ) => () => void;

      // ─── 剪贴板（兼容原有 desktopBridge） ────────────────────────────────
      readClipboard: () => Promise<string>;
      writeClipboard: (text: string) => Promise<boolean>;
    };
  }
}
