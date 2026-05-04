import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { useSettingsStore, useAdminStore } from '@/hooks/useStore';
import { ROUTE_PATHS } from '@/lib/index';

export default function LoginPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettingsStore();
  const { resolveRole, setRole, subAccounts } = useAdminStore();

  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 已登录直接跳过
  useEffect(() => {
    if (settings.accessKey !== undefined && settings.accessKey !== '') {
      navigate(ROUTE_PATHS.HOME, { replace: true });
    }
  }, []);

  // 视频静音 + 循环保障
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.playsInline = true;
    v.loop = true;
    v.play().catch(() => {});
  }, []);

  const handleLogin = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('请输入访问密钥'); return; }

    setLoading(true);
    setError('');
    await new Promise(r => setTimeout(r, 600)); // 动画缓冲

    // 判断角色：管理员 API Key 或子账号 key
    const isAdmin = trimmed === settings.apiKey ||
      (!settings.apiKey && trimmed.length > 10);
    const isSub = subAccounts.some(s => s.key === trimmed);

    if (!settings.apiKey && !isSub) {
      // 首次登录：视为管理员，保存 API Key
      updateSettings({ apiKey: trimmed, accessKey: trimmed });
      setRole('admin');
      navigate(ROUTE_PATHS.HOME, { replace: true });
      return;
    }

    if (isAdmin) {
      updateSettings({ accessKey: '' }); // 管理员 accessKey 留空
      setRole('admin');
      navigate(ROUTE_PATHS.HOME, { replace: true });
    } else if (isSub) {
      updateSettings({ accessKey: trimmed });
      setRole('user', subAccounts.find(s => s.key === trimmed)?.id);
      navigate(ROUTE_PATHS.HOME, { replace: true });
    } else {
      setError('密钥无效，请联系管理员获取访问权限');
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="relative flex items-center justify-center w-screen h-screen overflow-hidden bg-black">
      {/* ── 背景视频 ── */}
      <video
        ref={videoRef}
        src="/bg.mp4"
        className="absolute inset-0 w-full h-full object-cover opacity-70"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />

      {/* ── 渐变遮罩（底部加深，保证卡片可读性） ── */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/50" />

      {/* ── 磨砂玻璃登录卡片 ── */}
      <div
        className="relative z-10 w-[380px] rounded-3xl px-8 py-10 flex flex-col items-center gap-6"
        style={{
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.25)',
          boxShadow: '0 8px 48px rgba(0,0,0,0.35)',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1"
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.30)',
              boxShadow: '0 2px 16px rgba(0,0,0,0.20)',
            }}
          >
            {/* Phone icon svg */}
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.93 12 19.79 19.79 0 0 1 1.9 3.38 2 2 0 0 1 3.68 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.65a16 16 0 0 0 6.44 6.44l1.02-1.01a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <h1 className="text-white text-xl font-bold tracking-wide">Instant Chat</h1>
          <p className="text-white/60 text-xs text-center">DuoPlus 云手机智能管理平台</p>
        </div>

        {/* Divider */}
        <div className="w-full h-px" style={{ background: 'rgba(255,255,255,0.18)' }} />

        {/* Key input */}
        <div className="w-full space-y-3">
          <label className="block text-white/80 text-xs font-medium mb-1">访问密钥</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={e => { setKey(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="输入管理员 API Key 或子账号密钥"
              autoComplete="off"
              className="w-full pr-10 pl-4 py-3 rounded-xl text-sm text-white placeholder:text-white/40 outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.10)',
                border: error
                  ? '1px solid rgba(239,68,68,0.6)'
                  : '1px solid rgba(255,255,255,0.20)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
              }}
              onFocus={e => {
                e.target.style.border = '1px solid rgba(255,255,255,0.50)';
                e.target.style.background = 'rgba(255,255,255,0.15)';
              }}
              onBlur={e => {
                e.target.style.border = error
                  ? '1px solid rgba(239,68,68,0.6)'
                  : '1px solid rgba(255,255,255,0.20)';
                e.target.style.background = 'rgba(255,255,255,0.10)';
              }}
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/90 transition"
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-xs px-1">{error}</p>
          )}
        </div>

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={loading || !key.trim()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50"
          style={{
            background: loading
              ? 'rgba(255,255,255,0.15)'
              : 'rgba(255,255,255,0.90)',
            color: loading ? 'rgba(255,255,255,0.7)' : '#1a1a2e',
            boxShadow: '0 2px 16px rgba(0,0,0,0.20)',
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,1)'; }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.90)'; }}
        >
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> 验证中…</>
            : <><LogIn size={15} /> 进入系统</>
          }
        </button>

        {/* Hint */}
        <p className="text-white/35 text-[10px] text-center leading-relaxed">
          管理员请输入 DuoPlus API Key · 子账号请输入分配的密钥
        </p>
      </div>

      {/* 底部水印 */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-center">
        <span className="text-white/25 text-[10px] tracking-widest font-mono">POWERED BY DUOPLUS</span>
      </div>
    </div>
  );
}
