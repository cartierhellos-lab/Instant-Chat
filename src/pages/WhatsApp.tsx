/**
 * WhatsApp.tsx — 生产级 WhatsApp 多账号管理页面
 *
 * 架构说明：
 * - 左侧 240px 会话列表栏
 * - 右侧主区：空态 / 待扫码 / 在线（BrowserView 覆盖占位）
 * - Electron BrowserView 通过 window.electronAPI.wa_showSession(id, bounds) 定位
 * - ResizeObserver 实时同步容器位置到 BrowserView
 * - 非 Electron 环境自动降级为 Demo 模式（Mock 数据展示 UI）
 */

import {
  useEffect,
  useRef,
  useCallback,
  useState,
} from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  MessageCircle,
  Plus,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  Smartphone,
  AlertCircle,
  ScanLine,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import type {
  WASession as WASessionType,
  WAStatusChangeEvent,
  WANewMessageEvent,
  WASessionInfo,
} from '@/types/electron';

// ─────────────────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────────────────

export interface WASession {
  id: string;
  status: 'loading' | 'qr' | 'online' | 'offline';
  avatarUrl?: string;
  phone?: string;
  lastSeen?: string;
  unreadCount: number;
  /** 二维码 DataURL，status === 'qr' 时有值 */
  qrDataUrl?: string;
}

interface WhatsAppStore {
  sessions: WASession[];
  activeSessionId: string | null;
  addSession: () => Promise<string>;
  removeSession: (id: string) => Promise<void>;
  setActiveSession: (id: string | null) => void;
  updateSessionStatus: (
    id: string,
    status: WASession['status'],
    extra?: Partial<WASession>
  ) => void;
  incrementUnread: (id: string) => void;
  clearUnread: (id: string) => void;
  setSessions: (sessions: WASession[]) => void;
  /** 总未读数（供 Layout 角标使用） */
  totalUnread: () => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock 数据（非 Electron 环境下的演示数据）
// ─────────────────────────────────────────────────────────────────────────────

let _mockIdCounter = 100;

function generateMockId(): string {
  return `wa-mock-${++_mockIdCounter}-${Date.now().toString(36)}`;
}

const MOCK_SESSIONS: WASession[] = [
  {
    id: 'wa-mock-1',
    status: 'online',
    phone: '+86 138 0000 0001',
    avatarUrl: undefined,
    unreadCount: 3,
    lastSeen: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'wa-mock-2',
    status: 'qr',
    unreadCount: 0,
    lastSeen: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: 'wa-mock-3',
    status: 'offline',
    phone: '+1 555 000 0003',
    unreadCount: 0,
    lastSeen: new Date(Date.now() - 3600 * 1000).toISOString(),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Zustand Store
// ─────────────────────────────────────────────────────────────────────────────

export const useWhatsAppStore = create<WhatsAppStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      setSessions: (sessions) => set({ sessions }),

      addSession: async () => {
        const api = window.electronAPI;

        if (!api) {
          // Mock 模式
          const mockId = generateMockId();
          const newSession: WASession = {
            id: mockId,
            status: 'qr',
            unreadCount: 0,
            lastSeen: new Date().toISOString(),
          };
          set((state) => ({
            sessions: [...state.sessions, newSession],
            activeSessionId: mockId,
          }));
          toast({ title: '演示模式', description: '已添加模拟会话（非 Electron 环境）' });
          return mockId;
        }

        try {
          const sessionId = await api.wa_createSession();
          const newSession: WASession = {
            id: sessionId,
            status: 'loading',
            unreadCount: 0,
            lastSeen: new Date().toISOString(),
          };
          set((state) => ({
            sessions: [...state.sessions, newSession],
            activeSessionId: sessionId,
          }));
          return sessionId;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast({ title: '添加失败', description: msg, variant: 'destructive' });
          throw err;
        }
      },

      removeSession: async (id) => {
        const api = window.electronAPI;

        if (api) {
          try {
            await api.wa_destroySession(id);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast({ title: '删除失败', description: msg, variant: 'destructive' });
            throw err;
          }
        }

        set((state) => {
          const remaining = state.sessions.filter((s) => s.id !== id);
          const nextActive =
            state.activeSessionId === id
              ? (remaining[0]?.id ?? null)
              : state.activeSessionId;
          return { sessions: remaining, activeSessionId: nextActive };
        });
      },

      setActiveSession: (id) => {
        set({ activeSessionId: id });
        if (id) {
          get().clearUnread(id);
        }
      },

      updateSessionStatus: (id, status, extra = {}) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? { ...s, status, ...extra, lastSeen: new Date().toISOString() }
              : s
          ),
        }));
      },

      incrementUnread: (id) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, unreadCount: s.unreadCount + 1 } : s
          ),
        }));
      },

      clearUnread: (id) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, unreadCount: 0 } : s
          ),
        }));
      },

      totalUnread: () => {
        return get().sessions.reduce((sum, s) => sum + s.unreadCount, 0);
      },
    }),
    {
      name: 'whatsapp-sessions',
      // 只持久化会话列表和当前活跃 ID，状态会在运行时从 Electron 刷新
      partialize: (state) => ({
        sessions: state.sessions.map((s) => ({
          ...s,
          // 持久化时把 online 变 offline（重启后需重新连接）
          status: s.status === 'online' ? 'offline' : s.status,
          qrDataUrl: undefined,
        })),
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

function isElectronEnv(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

function formatLastSeen(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  return `${Math.floor(diffHr / 24)} 天前`;
}

function truncateId(id: string, maxLen = 14): string {
  if (id.length <= maxLen) return id;
  return id.slice(0, 6) + '…' + id.slice(-5);
}

// ─────────────────────────────────────────────────────────────────────────────
// 子组件：会话状态标签
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WASession['status'] }) {
  const map = {
    online:  { label: '在线',   dot: 'bg-green-500', text: 'text-green-700'  },
    loading: { label: '加载中', dot: 'bg-amber-400',  text: 'text-amber-700' },
    qr:      { label: '待扫码', dot: 'bg-blue-400',   text: 'text-blue-700'  },
    offline: { label: '离线',   dot: 'bg-gray-400',   text: 'text-gray-500'  },
  } as const;

  const cfg = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-mono', cfg.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot,
        status === 'loading' && 'animate-pulse'
      )} />
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 子组件：会话卡片（左侧列表项）
// ─────────────────────────────────────────────────────────────────────────────

interface WASessionCardProps {
  session: WASession;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  removing: boolean;
}

export function WASessionCard({
  session,
  isActive,
  onSelect,
  onRemove,
  removing,
}: WASessionCardProps) {
  const [hovering, setHovering] = useState(false);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  // 状态点 class 映射
  const dotClass: Record<WASession['status'], string> = {
    online:  'ios-dot-online',
    loading: 'ios-dot-loading',
    qr:      'ios-dot-qr',
    offline: 'ios-dot-offline',
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isActive}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={cn(
        'relative flex items-center gap-2.5 px-3 h-12 cursor-pointer transition-colors select-none rounded-lg',
        isActive
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-black/[0.05] border border-transparent'
      )}
    >
      {/* 状态点 */}
      <span className={cn(
        'w-2 h-2 rounded-full shrink-0',
        dotClass[session.status],
        session.status === 'loading' && 'animate-pulse'
      )} />

      {/* 标签 */}
      <span className="flex-1 truncate text-[13px] text-foreground font-medium">
        {session.phone ?? truncateId(session.id)}
      </span>

      {/* 右侧：未读角标 + 删除 */}
      <div className="flex items-center gap-1 shrink-0">
        {session.unreadCount > 0 && (
          <span className="ios-badge">{session.unreadCount > 99 ? '99+' : session.unreadCount}</span>
        )}
        {(hovering || removing) && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 transition"
            title="删除"
          >
            {removing
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Trash2 className="w-3 h-3" />
            }
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 子组件：空状态引导卡
// ─────────────────────────────────────────────────────────────────────────────

interface WAEmptyStateProps {
  onAdd: () => void;
  adding: boolean;
  isElectron: boolean;
}

export function WAEmptyState({ onAdd, adding, isElectron }: WAEmptyStateProps) {
  if (!isElectron) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 animate-fade-up">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-amber-500" />
        </div>
        <div className="text-center max-w-xs">
          <p className="text-[14px] font-semibold text-foreground mb-1">
            请在 Electron 应用中运行
          </p>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            WhatsApp 集成需要 Electron 桌面客户端支持。<br />
            当前环境为 Web 浏览器，下方为 UI 演示模式。
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          className="tool-btn px-4 py-1.5 text-[12px] flex items-center gap-1.5"
        >
          {adding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          添加演示会话
        </button>
        <p className="text-[10px] text-muted-foreground">演示模式 · 仅展示界面交互</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 animate-fade-up">
      <MessageCircle className="w-16 h-16 text-muted-foreground/20" />
      <div className="text-center max-w-xs">
        <p className="text-[14px] font-semibold text-foreground mb-1">选择账号开始</p>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          点击左侧「+」添加 WhatsApp 账号，<br />扫码完成登录后即可开始管理消息。
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={adding}
        className="tool-btn-primary px-5 py-2 text-[12px] rounded-full flex items-center gap-1.5"
      >
        {adding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        添加 WhatsApp 账号
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 子组件：加载中 / 待扫码面板
// ─────────────────────────────────────────────────────────────────────────────

interface WALoadingPanelProps {
  session: WASession;
}

export function WALoadingPanel({ session }: WALoadingPanelProps) {
  if (session.status === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <div className="text-center">
          <p className="text-[13px] font-semibold text-foreground mb-1">正在初始化...</p>
          <p className="text-[11px] text-muted-foreground font-mono">{truncateId(session.id)}</p>
        </div>
      </div>
    );
  }

  if (session.status === 'qr') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        {/* 二维码展示区 */}
        <div className="relative">
          {session.qrDataUrl ? (
            <div className="relative p-3 bg-white rounded-xl border-2 border-[#25D366]/30 shadow-sm">
              <img
                src={session.qrDataUrl}
                alt="WhatsApp QR Code"
                className="w-48 h-48 object-contain"
              />
              {/* 角标装饰 */}
              <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-[#25D366] rounded-tl-sm" />
              <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-[#25D366] rounded-tr-sm" />
              <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-[#25D366] rounded-bl-sm" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-[#25D366] rounded-br-sm" />
            </div>
          ) : (
            /* 等待二维码生成的骨架占位 */
            <div className="w-48 h-48 rounded-xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-3">
              <ScanLine className="w-10 h-10 text-muted-foreground/40 animate-pulse" />
              <span className="text-[11px] text-muted-foreground">等待二维码...</span>
            </div>
          )}
        </div>

        {/* 操作说明 */}
        <div className="text-center max-w-[260px] space-y-2">
          <p className="text-[13px] font-semibold text-foreground">扫描二维码登录</p>
          <ol className="text-[11px] text-muted-foreground space-y-1 text-left list-decimal list-inside">
            <li>打开手机 WhatsApp</li>
            <li>点击右上角 ⋮ → 已链接的设备</li>
            <li>点击「链接设备」扫描上方二维码</li>
          </ol>
        </div>

        {/* 扫码等待动画 */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-muted-foreground/50 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
          等待扫码中
        </div>

        <p className="text-[10px] text-muted-foreground font-mono">
          Session: {truncateId(session.id)}
        </p>
      </div>
    );
  }

  // offline
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
        <WifiOff className="w-6 h-6 text-gray-400" />
      </div>
      <div className="text-center">
        <p className="text-[13px] font-semibold text-foreground mb-1">账号已离线</p>
        <p className="text-[11px] text-muted-foreground">
          {session.phone ?? truncateId(session.id)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          最后在线：{session.lastSeen ? formatLastSeen(session.lastSeen) : '未知'}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 子组件：在线会话占位层（BrowserView 将覆盖此区域）
// ─────────────────────────────────────────────────────────────────────────────

interface WAOnlinePanelProps {
  session: WASession;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function WAOnlinePanel({ session, containerRef }: WAOnlinePanelProps) {
  const electron = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const isElectron = !!electron;

  // 同步 BrowserView 位置
  const syncBounds = useCallback(() => {
    if (!electron || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio ?? 1;
    void electron.wa_showSession(session.id, {
      x: Math.round(rect.left * dpr),
      y: Math.round(rect.top * dpr),
      width: Math.round(rect.width * dpr),
      height: Math.round(rect.height * dpr),
    });
  }, [electron, session.id, containerRef]);

  // ResizeObserver 监听容器尺寸变化
  useEffect(() => {
    if (!electron || !containerRef.current) return;
    syncBounds();

    const observer = new ResizeObserver(() => syncBounds());
    observer.observe(containerRef.current);

    // 监听窗口 resize
    const onResize = () => syncBounds();
    window.addEventListener('resize', onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [electron, syncBounds, containerRef]);

  if (!isElectron) {
    // 演示模式：显示模拟的聊天界面占位
    return (
      <div className="flex-1 flex flex-col">
        {/* 模拟顶部栏 */}
        <div className="h-12 border-b border-border/50 flex items-center px-4 gap-3 bg-[#f0f2f5]">
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
            <User className="w-4 h-4 text-gray-500" />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-foreground">
              {session.phone ?? '演示账号'}
            </p>
            <p className="text-[10px] text-green-600">在线</p>
          </div>
          <div className="ml-auto flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            <AlertCircle className="w-3 h-3" />
            演示模式（非 Electron）
          </div>
        </div>

        {/* 模拟消息区 */}
        <div className="flex-1 bg-[#efeae2] flex flex-col justify-end p-4 gap-2">
          {[
            { out: false, text: '你好！这是一条演示消息。', t: '09:30' },
            { out: true,  text: '收到，正在处理中。',      t: '09:31' },
            { out: false, text: 'WhatsApp 集成已就绪 ✅',  t: '09:32' },
          ].map((msg, i) => (
            <div key={i} className={cn('flex', msg.out ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[60%] px-3 py-1.5 rounded-lg text-[12px] shadow-sm',
                msg.out
                  ? 'bg-[#d9fdd3] text-foreground rounded-br-sm'
                  : 'bg-white text-foreground rounded-bl-sm'
              )}>
                {msg.text}
                <span className="ml-2 text-[10px] text-muted-foreground">{msg.t}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 模拟输入框 */}
        <div className="h-12 border-t border-border/50 bg-[#f0f2f5] flex items-center px-4 gap-2">
          <div className="flex-1 h-8 bg-white rounded-full border border-border px-3 flex items-center">
            <span className="text-[11px] text-muted-foreground">输入消息...</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#00a884] flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
    );
  }

  // Electron 模式：透明占位，BrowserView 覆盖其上
  return (
    <div className="flex-1 relative bg-[#efeae2]">
      {/* 此 div 是 BrowserView 的定位锚点，内容由 Electron 覆盖 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <div className="text-center opacity-20">
          <MessageCircle className="w-12 h-12 mx-auto mb-2 text-[#25D366]" />
          <p className="text-[11px] font-mono text-muted-foreground">BrowserView 将覆盖此区域</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 主页面
// ─────────────────────────────────────────────────────────────────────────────

export default function WhatsAppPage() {
  const {
    sessions,
    activeSessionId,
    addSession,
    removeSession,
    setActiveSession,
    updateSessionStatus,
    incrementUnread,
    setSessions,
  } = useWhatsAppStore();

  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const isElectron = isElectronEnv();

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  // ── 初始化：从 Electron 恢复会话列表 ──────────────────────────────────────
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      // 非 Electron：加载 Mock 数据
      setSessions(MOCK_SESSIONS);
      if (MOCK_SESSIONS.length > 0 && !activeSessionId) {
        setActiveSession(MOCK_SESSIONS[0].id);
      }
      return;
    }

    void (async () => {
      try {
        const infos: WASessionInfo[] = await api.wa_listSessions();
        const wasSessions: WASession[] = infos.map((info) => ({
          id: info.id,
          status: info.status,
          avatarUrl: info.avatarUrl,
          phone: info.phone,
          unreadCount: info.unreadCount,
          lastSeen: info.lastSeen,
        }));
        setSessions(wasSessions);
        if (wasSessions.length > 0 && !activeSessionId) {
          setActiveSession(wasSessions[0].id);
        }
      } catch (err) {
        console.error('[WhatsApp] wa_listSessions failed:', err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── IPC 事件监听：状态变更 ─────────────────────────────────────────────────
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const unsub = api.onSessionStatusChange((event: WAStatusChangeEvent) => {
      updateSessionStatus(event.sessionId, event.status, {
        avatarUrl: event.avatarUrl,
        phone: event.phone,
        qrDataUrl: event.qrDataUrl,
      });

      if (event.status === 'online') {
        toast({
          title: 'WhatsApp 已连接',
          description: event.phone ?? event.sessionId,
        });
      } else if (event.status === 'offline') {
        toast({
          title: '连接已断开',
          description: event.sessionId,
          variant: 'destructive',
        });
      }
    });

    return unsub;
  }, [updateSessionStatus]);

  // ── IPC 事件监听：新消息 ───────────────────────────────────────────────────
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const unsub = api.onNewMessage((event: WANewMessageEvent) => {
      // 只更新非当前活跃会话的未读角标
      if (event.sessionId !== activeSessionId && !event.fromMe) {
        incrementUnread(event.sessionId);
      }
    });

    return unsub;
  }, [activeSessionId, incrementUnread]);

  // ── 页面卸载时隐藏所有 BrowserView ────────────────────────────────────────
  useEffect(() => {
    return () => {
      void window.electronAPI?.wa_hideAllSessions?.();
    };
  }, []);

  // ── 切换会话时同步 BrowserView ────────────────────────────────────────────
  const prevActiveRef = useRef<string | null>(null);
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const prevId = prevActiveRef.current;
    if (prevId && prevId !== activeSessionId) {
      void api.wa_hideSession(prevId);
    }
    prevActiveRef.current = activeSessionId;

    // 显示当前会话由 WAOnlinePanel 内的 useEffect 负责（syncBounds）
  }, [activeSessionId]);

  // ── 操作处理器 ─────────────────────────────────────────────────────────────
  const handleAddSession = async () => {
    if (adding) return;
    setAdding(true);
    try {
      await addSession();
    } catch {
      // toast already shown in store
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveSession = async (id: string) => {
    if (removingId) return;
    setRemovingId(id);
    try {
      await removeSession(id);
      toast({ title: '会话已删除' });
    } catch {
      // toast already shown in store
    } finally {
      setRemovingId(null);
    }
  };

  const handleSelectSession = (id: string) => {
    setActiveSession(id);
  };

  // ── 渲染 ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* ── 左侧：会话列表 220px ── */}
      <aside
        className="shrink-0 flex flex-col overflow-hidden bg-white/80"
        style={{ width: 220, borderRight: '0.5px solid rgba(0,0,0,0.09)' }}
      >
        {/* 顶部栏 */}
        <div
          className="h-12 flex items-center justify-between px-3 shrink-0"
          style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}
        >
          <span className="text-[15px] font-bold text-foreground">WhatsApp</span>
          <button
            type="button"
            onClick={handleAddSession}
            disabled={adding}
            title="添加账号"
            className="tool-btn-quiet w-8 h-8 rounded-full flex items-center justify-center"
          >
            {adding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-muted-foreground">
              <Smartphone className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p>暂无账号</p>
              <p className="mt-0.5 text-[10px]">点击「+」开始添加</p>
            </div>
          ) : (
            sessions.map((session) => (
              <WASessionCard
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={() => handleSelectSession(session.id)}
                onRemove={() => void handleRemoveSession(session.id)}
                removing={removingId === session.id}
              />
            ))
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="h-7 flex items-center px-3 gap-1.5 shrink-0" style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
          {isElectron ? (
            <>
              <Wifi className="w-3 h-3 text-green-500" />
              <span className="text-[10px] text-muted-foreground font-mono">Electron</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] text-muted-foreground font-mono">演示模式</span>
            </>
          )}
        </div>
      </aside>

      {/* ── 右侧：主内容区 ── */}
      <main
        ref={mainAreaRef}
        className="flex-1 flex flex-col overflow-hidden min-w-0 relative"
      >
        {/* 无会话时 */}
        {sessions.length === 0 && (
          <WAEmptyState
            onAdd={handleAddSession}
            adding={adding}
            isElectron={isElectron}
          />
        )}

        {/* 有会话但未选中 */}
        {sessions.length > 0 && !activeSession && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground animate-fade-up">
              <MessageCircle className="w-16 h-16 mx-auto mb-3 opacity-20" />
              <p className="text-[13px]">选择账号开始</p>
            </div>
          </div>
        )}

        {/* 已选中会话 */}
        {activeSession && (
          <>
            {/* 顶部信息条 */}
            <div
              className="h-11 ios-nav-bar flex items-center px-4 gap-2 shrink-0"
            >
              <StatusBadge status={activeSession.status} />
              <span className="text-[13px] font-mono text-foreground/80 truncate">
                {activeSession.phone ?? truncateId(activeSession.id)}
              </span>
              {activeSession.lastSeen && (
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {formatLastSeen(activeSession.lastSeen)}
                </span>
              )}
            </div>

            {/* 内容区 */}
            <div className="flex-1 flex overflow-hidden">
              {activeSession.status === 'online' ? (
                <WAOnlinePanel
                  session={activeSession}
                  containerRef={mainAreaRef}
                />
              ) : (
                <WALoadingPanel session={activeSession} />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
