import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { MessageSquare, ListTodo, Settings, RefreshCw, WifiOff, Phone, Users, Smartphone, Wifi, Megaphone } from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { useSettingsStore, useChatStore, useAdminStore } from '@/hooks/useStore';
import { cn } from '@/lib/index';
import { ensureCommunityRoom, getSubAccounts } from '@/api/supabase';

export default function Layout() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { startPolling, stopPolling, isLoading, lastError, cloudNumbers, loadCloudPhones } = useChatStore();
  const { currentRole, resolveRole, setRole, setSubAccounts, setRoleResolved } = useAdminStore();
  const pollingKey = useRef<string>('');
  const [marqueeNotice, setMarqueeNotice] = useState('系统公告：欢迎使用奥贝思维空间站，管理员可在“社群”页面发布最新通知。');
  const lastNoticeRef = useRef('');

  const playNoticeTone = () => {
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
  };

  const notifyNotice = (notice: string) => {
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
  };

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
    const timer = window.setInterval(() => {
      void loadNotice();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

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
  }, [settings.apiKey, settings.apiRegion, settings.pollInterval]);

  const isAdmin = currentRole === 'admin';

  const NAV_ITEMS = [
    { path: ROUTE_PATHS.HOME,     icon: MessageSquare, label: '聊天',   show: true },
    { path: ROUTE_PATHS.COMMUNITY, icon: Megaphone,    label: '社群',   show: true },
    { path: ROUTE_PATHS.ACCOUNTS, icon: Users,         label: '资源',   show: isAdmin },
    { path: ROUTE_PATHS.PHONES,   icon: Smartphone,    label: '设备',   show: true },
    { path: ROUTE_PATHS.TASKS,    icon: ListTodo,      label: '群发',   show: true },
    { path: ROUTE_PATHS.SETTINGS, icon: Settings,      label: '设置',   show: true },
  ];

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-transparent">

      {/* ── Toolbar（macOS 标题栏风格）──────────────────────────────── */}
      <header className="tool-header flex items-center h-10 px-3 gap-1 shrink-0 select-none">

        {/* App icon + name */}
        <div className="flex items-center gap-1.5 mr-3">
          <div className="w-5 h-5 rounded-[5px] bg-primary flex items-center justify-center shadow-btn">
            <Phone className="w-3 h-3 text-white" />
          </div>
          <span className="text-[12px] font-semibold text-foreground/80 tracking-tight">Aobesiwei Chat</span>
        </div>

        {/* 分割线 */}
        <div className="toolbar-divider" />

        {/* Nav tabs — pill 风格 */}
        <nav className="flex items-center gap-0.5 ml-1">
          {NAV_ITEMS.filter(i => i.show).map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === ROUTE_PATHS.HOME}
              className={({ isActive }) =>
                cn(
                  'tool-tab h-6 transition-all duration-100',
                  isActive
                    ? 'tool-tab-active text-foreground'
                    : 'text-foreground/60 hover:text-foreground hover:bg-white/60'
                )
              }
            >
              <Icon size={12} strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* 右侧状态区 */}
        <div className="flex items-center gap-2 ml-auto">
          {/* 号码计数 */}
            <span className="text-[10px] text-foreground/45 font-mono">
              {cloudNumbers.length} 个号码
            </span>

          <div className="toolbar-divider" />

          {/* 连接状态 */}
          {isLoading && (
            <RefreshCw className="w-3 h-3 text-foreground/40 animate-spin" />
          )}
          {lastError && !isLoading && (
            <button
              onClick={() => navigate(ROUTE_PATHS.SETTINGS)}
              className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-600"
              title={lastError}
            >
              <WifiOff className="w-3 h-3" />
              <span>未连接</span>
            </button>
          )}
          {settings.apiKey && !lastError && !isLoading && (
              <span className="flex items-center gap-1 text-[10px] text-green-600">
                <Wifi className="w-3 h-3" />
                <span>已连接</span>
              </span>
          )}

          {/* Admin badge */}
          {isAdmin && (
            <>
              <div className="toolbar-divider" />
              <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                ADMIN
              </span>
            </>
          )}
        </div>
      </header>

      <div className="marquee-bar shrink-0">
        <div className="marquee-track">
          <span>{marqueeNotice}</span>
          <span aria-hidden="true">{marqueeNotice}</span>
        </div>
      </div>

      {/* ── 内容区 ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
