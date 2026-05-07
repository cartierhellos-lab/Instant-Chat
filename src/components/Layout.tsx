import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  MessageSquare, ListTodo, Settings, RefreshCw,
  Smartphone, Users, Megaphone, Languages, MessageCircle, Phone, Wifi, WifiOff,
} from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { useSettingsStore, useChatStore, useAdminStore } from '@/hooks/useStore';
import { cn } from '@/lib/index';
import { ensureCommunityRoom, getSubAccounts } from '@/api/supabase';
// WhatsApp 未读角标
import { useWhatsAppStore } from '@/pages/WhatsApp';

export default function Layout() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { startPolling, stopPolling, isLoading, lastError, cloudNumbers, loadCloudPhones } = useChatStore();
  const { currentRole, resolveRole, setRole, setSubAccounts, setRoleResolved } = useAdminStore();
  const pollingKey = useRef<string>('');
  const [marqueeNotice, setMarqueeNotice] = useState('系统公告：欢迎使用奥贝思维空间站，管理员可在"社群"页面发布最新通知。');
  const lastNoticeRef = useRef('');

  // WhatsApp 全局未读数（供角标显示）
  const waUnreadTotal = useWhatsAppStore((s) => s.sessions.reduce((sum, sess) => sum + sess.unreadCount, 0));

  const playNoticeTone = useCallback(() => {
    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.24);
    oscillator.onended = () => {
      void ctx.close();
    };
  }, []);

  const notifyNotice = useCallback((notice: string) => {
    if (typeof window === 'undefined' || !notice.trim()) return;
    playNoticeTone();
    if (!('Notification' in window)) return;

    const show = () => {
      try {
        new Notification('奥贝思维空间站公告', {
          body: notice,
          tag: 'aobesiwei-marquee-notice',
        });
      } catch {
        // ignore browser notification failures
      }
    };

    if (Notification.permission === 'granted') {
      show();
      return;
    }

    if (Notification.permission === 'default') {
      void Notification.requestPermission().then((permission) => {
        if (permission === 'granted') show();
      });
    }
  }, [playNoticeTone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (settings.accessKey && settings.accessKey !== settings.apiKey) {
          const accounts = await getSubAccounts();
          if (cancelled) return;
          setSubAccounts(accounts);
        }
      } catch {
        // keep local cache fallback
      } finally {
        if (!cancelled) {
          const role = resolveRole(settings.accessKey ?? '', settings.apiKey);
          setRole(role);
          setRoleResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolveRole, setRole, setRoleResolved, setSubAccounts, settings.accessKey, settings.apiKey]);

  useEffect(() => {
    let cancelled = false;
    const loadNotice = async () => {
      try {
        const room = await ensureCommunityRoom();
        if (!cancelled && room.marqueeNotice?.trim()) {
          const nextNotice = room.marqueeNotice.trim();
          setMarqueeNotice(nextNotice);
          if (lastNoticeRef.current && lastNoticeRef.current !== nextNotice) {
            notifyNotice(nextNotice);
          }
          lastNoticeRef.current = nextNotice;
        }
      } catch {
        // keep fallback notice
      }
    };

    void loadNotice();
    const timer = window.setInterval(() => void loadNotice(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [notifyNotice]);

  useEffect(() => {
    if (!settings.apiKey) {
      stopPolling();
      pollingKey.current = '';
      return;
    }
    const newKey = `${settings.apiKey}|${settings.apiRegion}|${settings.pollInterval}`;
    if (pollingKey.current === newKey) return;
    pollingKey.current = newKey;
    startPolling(settings.apiKey, settings.apiRegion, settings.pollInterval);
    loadCloudPhones(settings.apiKey, settings.apiRegion);
    return () => {
      stopPolling();
      pollingKey.current = '';
    };
  }, [loadCloudPhones, settings.apiKey, settings.apiRegion, settings.pollInterval, startPolling, stopPolling]);

  const isAdmin = currentRole === 'admin';
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  // 导航项（按任务要求的顺序）
  const NAV_ITEMS = [
    { path: ROUTE_PATHS.HOME,       icon: MessageSquare, label: '聊天',     show: true,       badge: 0 },
    { path: ROUTE_PATHS.TRANSLATOR, icon: Languages,     label: '翻译',     show: true,       badge: 0 },
    { path: ROUTE_PATHS.COMMUNITY,  icon: Megaphone,     label: '社群',     show: true,       badge: 0 },
    { path: ROUTE_PATHS.ACCOUNTS,   icon: Users,         label: '资源',     show: isAdmin,    badge: 0 },
    { path: ROUTE_PATHS.PHONES,     icon: Smartphone,    label: '设备',     show: true,       badge: 0 },
    { path: ROUTE_PATHS.TASKS,      icon: ListTodo,      label: '群发',     show: true,       badge: 0 },
    { path: '/whatsapp',            icon: MessageCircle, label: 'WhatsApp', show: isElectron, badge: waUnreadTotal },
    { path: ROUTE_PATHS.SETTINGS,   icon: Settings,      label: 'Settings',     show: true,       badge: 0 },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="tool-header flex h-10 items-center gap-2 px-3 shrink-0 select-none">
        <div className="flex items-center gap-1.5 mr-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-primary text-primary-foreground shadow-btn">
            <Phone size={12} strokeWidth={2.2} />
          </div>
          <span className="text-[11px] font-semibold tracking-tight text-foreground/75">
            Instant Chat
          </span>
        </div>

        <div className="toolbar-divider" />

        <nav className="flex items-center gap-0.5 min-w-0 overflow-x-auto">
          {NAV_ITEMS.filter((item) => item.show).map(({ path, icon: Icon, label, badge }, idx) => (
            <NavLink
              key={`${path}-${label}-${idx}`}
              to={path}
              end={path === ROUTE_PATHS.HOME}
              className={({ isActive }) =>
                cn(
                  'desktop-nav-item tool-tab h-6 transition-all duration-100',
                  isActive
                    ? 'desktop-nav-item-active tool-tab-active text-foreground'
                    : 'text-foreground/60 hover:text-foreground hover:bg-white/60'
                )
              }
            >
              <Icon size={12} strokeWidth={2} />
              <span>{label}</span>
              {badge > 0 && (
                <span className="ios-badge ml-1 min-w-[16px] h-4 px-1 text-[9px]">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] font-mono text-foreground/45">
            {cloudNumbers.length} numbers
          </span>

          <div className="toolbar-divider" />

          {isLoading && <RefreshCw className="h-3 w-3 animate-spin text-foreground/45" />}

          {lastError && !isLoading && (
            <button
              onClick={() => navigate(ROUTE_PATHS.SETTINGS)}
              className="flex items-center gap-1 text-[9px] text-destructive hover:opacity-80"
              title={lastError}
            >
              <WifiOff className="h-3 w-3" />
              <span>offline</span>
            </button>
          )}

          {settings.apiKey && !lastError && !isLoading && (
            <span className="flex items-center gap-1 text-[9px] text-[color:var(--success)]">
              <Wifi className="h-3 w-3" />
              <span>online</span>
            </span>
          )}

          <div className="toolbar-divider" />

          <span className="tool-chip rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em]">
            {isAdmin ? 'admin' : 'user'}
          </span>
        </div>
      </header>

      <div className="flex flex-col flex-1 overflow-hidden">

        {/* 公告滚动条（仅在有公告时显示） */}
        {settings.marqueeEnabled !== false && marqueeNotice.trim() && (
          <div className="marquee-bar shrink-0">
            <div
              className="marquee-track"
              style={{ ['--marquee-duration' as string]: `${Math.max(15, settings.marqueeDuration ?? 60)}s` }}
            >
              <span>{marqueeNotice}</span>
            </div>
          </div>
        )}

        {/* 页面内容 */}
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
