import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { useSettingsStore, useAdminStore, useChatStore } from '@/hooks/useStore';
import { ROUTE_PATHS, ADMIN_HOSTNAME, USER_HOSTNAME, getHostMode } from '@/lib/index';
import { getSubAccounts } from '@/api/supabase';

export default function LoginPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettingsStore();
  const { setRole, subAccounts, setSubAccounts, setRoleResolved } = useAdminStore();
  const { startPolling } = useChatStore();
  const hostMode = getHostMode();

  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isAdminSession =
    settings.accessKey === '' ||
    (!!settings.apiKey && settings.accessKey === settings.apiKey);
  const isUserSession =
    settings.accessKey !== undefined && !isAdminSession;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const accounts = await getSubAccounts();
        if (!cancelled) {
          setSubAccounts(accounts);
          setRoleResolved(true);
        }
      } catch {
        // keep local fallback list
        if (!cancelled) {
          setRoleResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setSubAccounts]);

  const hostCopy = hostMode === 'admin'
    ? {
        subtitle: '· 奥贝思维空间站 管理后台',
        prompt: `输入管理员 API Key 进入管理后台。子账号请使用 ${USER_HOSTNAME} 登录。`,
        footer: 'AOBESIWEI ADMIN',
        button: '进入管理后台',
        placeholder: '输入管理员 API Key…',
      }
    : hostMode === 'user'
      ? {
          subtitle: '· 奥贝思维空间站 用户入口',
          prompt: `输入子账号密钥访问分配资源。管理员请使用 ${ADMIN_HOSTNAME} 登录。`,
          footer: 'AOBESIWEI USER',
          button: '进入用户系统',
          placeholder: '输入子账号密钥…',
        }
      : {
          subtitle: '· 奥贝思维空间站',
          prompt: '输入管理员 API Key 或子账号密钥进入系统。',
          footer: 'AOBESIWEI',
          button: '进入系统',
          placeholder: '粘贴密钥…',
        };

  useEffect(() => {
    if (settings.accessKey === undefined) return;

    if (hostMode === 'admin' && isUserSession) {
      setError(`子账号请使用 ${USER_HOSTNAME} 登录`);
      return;
    }

    if (hostMode === 'user' && isAdminSession) {
      setError(`管理员请使用 ${ADMIN_HOSTNAME} 登录`);
      return;
    }

    if (settings.accessKey !== undefined) {
      navigate(ROUTE_PATHS.HOME, { replace: true });
    }
  }, [hostMode, isAdminSession, isUserSession, navigate, settings.accessKey]);

  const handleLogin = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('请输入访问密钥'); return; }
    setLoading(true);
    setError('');
    await new Promise(r => setTimeout(r, 300));

    const savedApiKey = settings.apiKey;
    const isFirstTime = !savedApiKey;
    const isAdminKey = savedApiKey && trimmed === savedApiKey;
    const looksLikeApiKey = /^[0-9a-f-]{32,}$/i.test(trimmed);
    const matchedSub = subAccounts.find(s => s.key === trimmed);

    if (hostMode === 'admin' && matchedSub) {
      setError(`子账号请使用 ${USER_HOSTNAME} 登录`);
      setLoading(false);
      return;
    }

    if (hostMode === 'user' && (isAdminKey || (isFirstTime && looksLikeApiKey))) {
      setError(`管理员请使用 ${ADMIN_HOSTNAME} 登录`);
      setLoading(false);
      return;
    }

    if (isFirstTime && looksLikeApiKey) {
      updateSettings({ apiKey: trimmed, accessKey: '' });
      setRole('admin');
      startPolling(trimmed, settings.apiRegion, settings.pollInterval);
      navigate(ROUTE_PATHS.HOME, { replace: true });
      return;
    }
    if (isAdminKey) {
      updateSettings({ accessKey: '' });
      setRole('admin');
      startPolling(savedApiKey, settings.apiRegion, settings.pollInterval);
      navigate(ROUTE_PATHS.HOME, { replace: true });
      return;
    }
    if (matchedSub) {
      updateSettings({ accessKey: trimmed });
      setRole('user', matchedSub.id);
      if (savedApiKey) startPolling(savedApiKey, settings.apiRegion, settings.pollInterval);
      navigate(ROUTE_PATHS.HOME, { replace: true });
      return;
    }
    if (isFirstTime && !looksLikeApiKey) {
      setError('格式不正确，请输入 CartierMiller API Key（UUID格式）');
    } else {
      setError('密钥无效，请联系管理员获取访问权限');
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center w-screen h-screen px-4">
      {/* 居中卡片 — macOS 偏好设置风格 */}
      <div className="tool-window w-[400px] rounded-[18px] overflow-hidden">

        {/* 标题栏 */}
        <div className="tool-header flex items-center gap-2 px-4 py-3">
          <div className="w-4 h-4 rounded-[4px] bg-primary flex items-center justify-center shadow-btn">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 12 19.79 19.79 0 0 1 1.9 3.38 2 2 0 0 1 3.68 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.65a16 16 0 0 0 6.44 6.44l1.02-1.01a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <span className="text-[12px] font-semibold text-foreground/80">Aobesiwei Chat</span>
          <span className="text-[10px] text-muted-foreground ml-1">{hostCopy.subtitle}</span>
        </div>

        {/* 表单区 */}
        <div className="px-6 py-6 space-y-4 bg-[linear-gradient(180deg,#ffffff_0%,#fafbfd_100%)]">
          {/* 提示文字 */}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {hostCopy.prompt}
          </p>

          {/* 输入框 */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-foreground/70">访问密钥</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={key}
                onChange={e => { setKey(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder={hostCopy.placeholder}
                autoComplete="off"
                autoFocus
                className="tool-input h-8 px-2.5 pr-8 text-[12px] font-mono placeholder:text-muted-foreground/50"
                style={{ borderColor: error ? '#ef4444' : undefined }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShow(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                {show ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            {error && (
              <p className="text-[11px] text-red-500">{error}</p>
            )}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="tool-toolbar flex items-center justify-between px-6 py-3">
          <span className="text-[10px] text-muted-foreground/60 font-mono tracking-wider">{hostCopy.footer}</span>
          <button
            onClick={handleLogin}
            disabled={loading || !key.trim()}
            className="tool-btn tool-btn-primary h-7 px-4 text-[11px] font-semibold disabled:opacity-40"
          >
            {loading
              ? <><Loader2 size={11} className="animate-spin" />验证中…</>
              : <><LogIn size={11} />{hostCopy.button}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
