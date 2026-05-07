import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  MessageSquare, ListTodo, Settings, RefreshCw,
  Smartphone, Users, Megaphone, Languages, MessageCircle,
} from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { useSettingsStore, useChatStore, useAdminStore } from '@/hooks/useStore';
import { cn } from '@/lib/index';
import { ensureCommunityRoom, getSubAccounts } from '@/api/supabase';
// WhatsApp 未读角标
import { useWhatsAppStore } from '@/pages/WhatsApp';

export default function Layout() {
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

  // 导航项（按任务要求的顺序）
  const NAV_ITEMS = [
    { path: ROUTE_PATHS.HOME,       icon: MessageSquare, label: '聊天',     show: true,    badge: 0 },
    { path: '/whatsapp',            icon: MessageCircle, label: 'WhatsApp', show: true,    badge: waUnreadTotal },
    { path: ROUTE_PATHS.PHONES,     icon: Smartphone,    label: '云手机',   show: true,    badge: 0 },
    { path: ROUTE_PATHS.ACCOUNTS,   icon: Users,         label: '账号',     show: isAdmin, badge: 0 },
    { path: ROUTE_PATHS.TASKS,      icon: ListTodo,      label: '任务',     show: true,    badge: 0 },
    { path: ROUTE_PATHS.TRANSLATOR, icon: Languages,     label: '翻译',     show: true,    badge: 0 },
    { path: ROUTE_PATHS.COMMUNITY,  icon: Megaphone,     label: '社群',     show: true,    badge: 0 },
    { path: ROUTE_PATHS.SETTINGS,   icon: Settings,      label: '管理',     show: isAdmin, badge: 0, adminOnly: true },
    { path: ROUTE_PATHS.SETTINGS,   icon: Settings,      label: '设置',     show: !isAdmin, badge: 0 },
  ];

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── 左侧边栏 200px ─────────────────────────────────────────── */}
      <aside className="ios-sidebar flex flex-col" style={{ width: 200, flexShrink: 0 }}>

        {/* 1. 顶部 Logo 区 */}
        <div
          className="flex items-center gap-2.5 px-4 shrink-0"
          style={{
            height: 56,
            borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          }}
        >
          {/* 渐变圆形图标 28×28 */}
          <div
            className="flex items-center justify-center rounded-lg shrink-0"
            style={{
              width: 28,
              height: 28,
              background: 'linear-gradient(135deg, #007aff 0%, #a855f7 100%)',
            }}
          >
            <MessageCircle size={14} color="white" strokeWidth={2.2} />
          </div>
          {/* App 名称 */}
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--foreground, #1c1c1e)',
            }}
          >
            Instant Chat
          </span>
        </div>

        {/* 2. 状态指示行 */}
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ height: 32 }}
        >
          {/* 左：号码数量 */}
          <span style={{ fontSize: 11, color: 'var(--muted-foreground, #8e8e93)' }}>
            {cloudNumbers.length} 个号码
          </span>

          {/* 右：连接状态点 */}
          {isLoading
            ? <span className="ios-dot ios-dot-loading" />
            : lastError
              ? <span className="ios-dot ios-dot-offline" />
              : <span className="ios-dot ios-dot-online" />
          }
        </div>

        {/* 3. 导航列表 */}
        <nav
          className="flex-1 overflow-y-auto px-2 py-2"
          style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {NAV_ITEMS.filter(i => i.show).map(({ path, icon: Icon, label, badge, adminOnly }, idx) => (
            <NavLink
              key={`${path}-${label}-${idx}`}
              to={path}
              end={path === ROUTE_PATHS.HOME}
              className={({ isActive }) =>
                cn('ios-nav-item', isActive && 'active')
              }
            >
              <Icon size={16} strokeWidth={1.8} />
              <span style={{ fontSize: 15, flex: 1 }}>{label}</span>

              {/* WhatsApp 未读角标 */}
              {badge > 0 && (
                <span className="ios-badge">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 4. 底部用户区 */}
        <div
          className="flex items-center gap-2 px-3 shrink-0"
          style={{
            height: 48,
            borderTop: '0.5px solid rgba(0,0,0,0.08)',
          }}
        >
          {/* 角色标签 */}
          <span
            className="tool-chip"
            style={{
              fontSize: 11,
              fontWeight: 600,
              background: isAdmin ? 'rgba(0,122,255,0.12)' : 'rgba(142,142,147,0.12)',
              color: isAdmin ? '#007aff' : '#8e8e93',
              padding: '2px 8px',
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            {isAdmin ? '管理员' : '用户'}
          </span>

          {/* spacer */}
          <div style={{ flex: 1 }} />

          {/* 刷新按钮 */}
          <button
            className="tool-btn-quiet flex items-center justify-center"
            style={{ width: 28, height: 28, borderRadius: 7 }}
            onClick={() => startPolling(settings.apiKey ?? '', settings.apiRegion, settings.pollInterval)}
            title="刷新连接"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </aside>

      {/* ── 右侧内容区 ──────────────────────────────────────────────── */}
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
