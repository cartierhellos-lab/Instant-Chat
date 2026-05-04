import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { MessageSquare, ListTodo, Settings, RefreshCw, Wifi, WifiOff, Phone, Users, Smartphone, ShieldCheck } from 'lucide-react';
import { ROUTE_PATHS } from '@/lib/index';
import { useSettingsStore, useChatStore, useAdminStore } from '@/hooks/useStore';
import { cn } from '@/lib/index';

export default function Layout() {
  const { settings } = useSettingsStore();
  const { startPolling, stopPolling, isLoading, lastError, cloudNumbers } = useChatStore();
  const { currentRole, resolveRole, setRole } = useAdminStore();
  const [connected, setConnected] = useState(false);

  // 根据 accessKey 解析角色
  useEffect(() => {
    const role = resolveRole(settings.accessKey ?? '', settings.apiKey);
    setRole(role);
  }, [settings.accessKey, settings.apiKey, resolveRole, setRole]);

  useEffect(() => {
    if (settings.apiKey) {
      startPolling(settings.apiKey, settings.apiRegion, settings.pollInterval);
      setConnected(true);
    } else {
      stopPolling();
      setConnected(false);
    }
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.apiKey, settings.apiRegion, settings.pollInterval]);

  const isAdmin = currentRole === 'admin';

  const NAV_ITEMS = [
    { path: ROUTE_PATHS.HOME, icon: MessageSquare, label: '聊天', show: true },
    { path: ROUTE_PATHS.ACCOUNTS, icon: Users, label: '账号库', show: isAdmin },
    { path: ROUTE_PATHS.PHONES, icon: Smartphone, label: '云手机', show: true },
    { path: ROUTE_PATHS.TASKS, icon: ListTodo, label: '群发', show: true },
    { path: ROUTE_PATHS.ADMIN, icon: ShieldCheck, label: '管理', show: isAdmin },
    { path: ROUTE_PATHS.SETTINGS, icon: Settings, label: '设置', show: true },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Narrow icon sidebar */}
      <aside className="flex flex-col items-center w-16 h-full bg-white border-r border-border shrink-0 py-4 gap-1 shadow-sm">
        {/* Logo */}
        <div className="flex items-center justify-center w-10 h-10 mb-3 rounded-xl bg-primary/10">
          <Phone className="w-5 h-5 text-primary" />
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 flex-1 w-full px-2">
          {NAV_ITEMS.filter((i) => i.show).map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === ROUTE_PATHS.HOME}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 w-full py-2 rounded-lg transition-all duration-200 text-[10px] font-medium',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                )
              }
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Status indicator */}
        <div className="flex flex-col items-center gap-1 mt-auto px-2">
          {isAdmin && (
            <div className="text-[8px] text-primary font-bold bg-primary/10 rounded px-1 py-0.5 mb-1">ADMIN</div>
          )}
          {isLoading && (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100">
              <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
            </div>
          )}
          {lastError && !isLoading && (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-50" title={lastError}>
              <WifiOff className="w-3.5 h-3.5 text-destructive" />
            </div>
          )}
          {connected && !lastError && !isLoading && (
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
              <Wifi className="w-3.5 h-3.5 text-primary" />
            </div>
          )}
          <div className="text-[9px] text-slate-400 font-mono text-center leading-tight">
            {cloudNumbers.length}<br />号码
          </div>
        </div>
      </aside>

      {/* Page content area */}
      <div className="flex flex-1 min-w-0 h-full overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
