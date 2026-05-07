import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, AlertCircle, MessageCircle } from 'lucide-react';
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
  }, [setRoleResolved, setSubAccounts]);

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
    <div
      className="flex items-center justify-center w-screen h-screen px-4"
      style={{ background: '#eef1f4' }}
    >
      <div
        className="ios-login-panel animate-spring-in"
        style={{ width: 380, padding: '28px 26px' }}
      >
        <div className="flex flex-col items-center gap-2 mb-5">
          <div
            className="flex items-center justify-center rounded-[8px] shadow-btn"
            style={{
              width: 38,
              height: 38,
              background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
            }}
          >
            <MessageCircle size={18} color="white" strokeWidth={2} />
          </div>

          <div className="text-center">
            <h1
              className="font-bold text-center"
              style={{ fontSize: 18, color: '#1f2328', letterSpacing: '-0.015em' }}
            >
              Instant Chat
            </h1>

            <p
              className="text-center mt-1"
              style={{ fontSize: 12, color: 'var(--muted-foreground, #6b7280)' }}
            >
              {hostCopy.subtitle}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="relative">
            <Lock
              size={13}
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: 10, color: 'var(--muted-foreground, #6b7280)' }}
            />

            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={e => { setKey(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder={hostCopy.placeholder}
              autoComplete="off"
              autoFocus
              className="tool-input w-full"
              style={{
                height: 38,
                fontSize: 13,
                paddingLeft: 34,
                paddingRight: 34,
                borderColor: error ? '#ff3b30' : undefined,
              }}
            />

            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShow(s => !s)}
              className="absolute top-1/2 -translate-y-1/2 transition-colors"
              style={{
                right: 10,
                color: 'var(--muted-foreground, #6b7280)',
              }}
            >
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-1.5" style={{ color: '#ff3b30', fontSize: 12 }}>
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}

          <div
            className="text-center px-1"
            style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--muted-foreground, #6b7280)' }}
          >
            {hostCopy.prompt}
          </div>
          <button
            onClick={handleLogin}
            disabled={loading || !key.trim()}
            className="ios-btn ios-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ height: 36, fontSize: 13, borderRadius: 6 }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>验证中…</span>
              </>
            ) : (
              <span>{hostCopy.button}</span>
            )}
          </button>
        </div>

        <p
          className="text-center mt-5"
          style={{
            fontSize: 10,
            color: 'var(--muted-foreground, #6b7280)',
            letterSpacing: '0.14em',
            opacity: 0.8,
          }}
        >
          {hostCopy.footer}
        </p>
      </div>
    </div>
  );
}
