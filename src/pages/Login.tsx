import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { useSettingsStore, useAdminStore, useChatStore } from '@/hooks/useStore';
import { ROUTE_PATHS } from '@/lib/index';

export default function LoginPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettingsStore();
  const { setRole, subAccounts } = useAdminStore();
  const { startPolling } = useChatStore();

  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (settings.accessKey !== undefined) {
      navigate(ROUTE_PATHS.HOME, { replace: true });
    }
  }, []);

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
          <span className="text-[12px] font-semibold text-foreground/80">Instant Chat</span>
          <span className="text-[10px] text-muted-foreground ml-1">· CartierMiller 管理平台</span>
        </div>

        {/* 表单区 */}
        <div className="px-6 py-6 space-y-4 bg-[linear-gradient(180deg,#ffffff_0%,#fafbfd_100%)]">
          {/* 提示文字 */}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            输入 CartierMiller API Key 以管理员身份进入，或输入子账号密钥访问分配的资源。
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
                placeholder="粘贴密钥…"
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
          <span className="text-[10px] text-muted-foreground/60 font-mono tracking-wider">CARTIER MILLER</span>
          <button
            onClick={handleLogin}
            disabled={loading || !key.trim()}
            className="tool-btn tool-btn-primary h-7 px-4 text-[11px] font-semibold disabled:opacity-40"
          >
            {loading
              ? <><Loader2 size={11} className="animate-spin" />验证中…</>
              : <><LogIn size={11} />进入系统</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
