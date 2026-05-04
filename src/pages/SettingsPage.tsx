import { useState, useEffect } from 'react';
import { Settings, Key, Globe, RefreshCw, Check, AlertCircle, Wifi, WifiOff, Terminal, LogOut, ShieldCheck, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useChatStore, useAdminStore } from '@/hooks/useStore';
import { cn, DEFAULT_ADB_TEMPLATE, ROUTE_PATHS } from '@/lib/index';
import { fetchCloudNumbers } from '@/api/duoplus';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettingsStore();
  const { cloudNumbers, loadNumbers, lastError, stopPolling } = useChatStore();
  const { currentRole } = useAdminStore();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [region, setRegion] = useState(settings.apiRegion);
  const [pollInterval, setPollInterval] = useState(settings.pollInterval);
  const [adbTemplate, setAdbTemplate] = useState(settings.adbCommandTemplate || DEFAULT_ADB_TEMPLATE);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setApiKey(settings.apiKey);
    setRegion(settings.apiRegion);
    setPollInterval(settings.pollInterval);
    setAdbTemplate(settings.adbCommandTemplate || DEFAULT_ADB_TEMPLATE);
  }, [settings]);

  const handleTest = async () => {
    if (!apiKey) return;
    setTesting(true);
    setTestResult('idle');
    setTestMsg('');
    try {
      const numbers = await fetchCloudNumbers(apiKey, region);
      setTestResult('ok');
      setTestMsg(`连接成功，共获取到 ${numbers.length} 个云号码`);
    } catch (e) {
      setTestResult('fail');
      setTestMsg((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    updateSettings({
      apiKey,
      apiRegion: region,
      pollInterval: Math.max(3, Math.min(60, pollInterval)),
      adbCommandTemplate: adbTemplate,
      // 不覆盖 accessKey，由登录页管理
    });
    loadNumbers(apiKey, region);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const maskApiKey = (key: string) => {
    if (!key || key.length < 8) return key;
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card/30 shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 border border-primary/20">
          <Settings className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">系统设置</h1>
          <p className="text-xs text-muted-foreground">配置 CartierMiller API 连接参数</p>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6 max-w-2xl">
        {/* Connection status */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl border',
          lastError ? 'border-destructive/30 bg-destructive/5' : cloudNumbers.length > 0 ? 'border-green-400/30 bg-green-400/5' : 'border-border bg-muted/30'
        )}>
          {lastError ? (
            <WifiOff className="w-4.5 h-4.5 text-destructive shrink-0" />
          ) : cloudNumbers.length > 0 ? (
            <Wifi className="w-4.5 h-4.5 text-green-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4.5 h-4.5 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {lastError ? '连接失败' : cloudNumbers.length > 0 ? `已连接 · ${cloudNumbers.length} 个云号码` : '未连接'}
            </p>
            {lastError && <p className="text-xs text-destructive font-mono truncate mt-0.5">{lastError}</p>}
            {!lastError && settings.apiKey && cloudNumbers.length > 0 && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                API Key: {maskApiKey(settings.apiKey)} · {settings.apiRegion === 'cn' ? '中国大陆节点' : '国际节点'}
              </p>
            )}
          </div>
        </div>

        {/* API Key */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">API 密钥</h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              CartierMiller API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="请输入您的 API Key（在控制台「自动化」→「API」获取）"
              className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 outline-none transition-all"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              在 CartierMiller 控制台获取 API Key
            </p>
          </div>

          {/* Test connection */}
          <button
            onClick={handleTest}
            disabled={!apiKey || testing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              apiKey && !testing
                ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
            测试连接
          </button>

          {testResult !== 'idle' && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
              testResult === 'ok' ? 'bg-green-400/10 text-green-400 border border-green-400/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
            )}>
              {testResult === 'ok' ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span>{testMsg}</span>
            </div>
          )}
        </div>

        {/* Region & Polling */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">接口配置</h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              API 节点区域
            </label>
            <div className="flex gap-2">
              {(['cn', 'global'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  className={cn(
                    'flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all duration-200',
                    region === r
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {r === 'cn' ? '🇨🇳 中国大陆' : '🌍 国际节点'}
                  <div className="text-[10px] font-mono opacity-70 mt-0.5">
                    {r === 'cn' ? 'api.carriermiller.cn' : 'api.carriermiller.net'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              轮询间隔（秒）
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={3}
                max={60}
                step={1}
                value={pollInterval}
                onChange={(e) => setPollInterval(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-mono text-foreground w-12 text-right">
                {pollInterval}s
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>3s（高频）</span>
              <span>建议 5-10s</span>
              <span>60s（低频）</span>
            </div>
          </div>
        </div>

        {/* ADB command template */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">TextNow ADB 导入命令模板</h2>
          </div>
          <p className="text-[11px] text-muted-foreground">
            用于将 TextNow 账号免密码注入到设备，支持变量：
            <code className="text-primary mx-1">{'{phone}'}</code>
            <code className="text-primary mx-1">{'{username}'}</code>
            <code className="text-primary mx-1">{'{password}'}</code>
            <code className="text-primary mx-1">{'{email}'}</code>
            <code className="text-primary mx-1">{'{emailPassword}'}</code>
          </p>
          <textarea
            value={adbTemplate}
            onChange={(e) => setAdbTemplate(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 outline-none transition-all resize-none"
          />
          <button onClick={() => setAdbTemplate(DEFAULT_ADB_TEMPLATE)}
            className="text-[10px] text-primary hover:underline">
            恢复默认命令
          </button>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200 shadow-md',
            saved
              ? 'bg-green-400/20 text-green-400 border border-green-400/30'
              : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]'
          )}
        >
          {saved ? <Check className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          {saved ? '已保存！' : '保存并应用设置'}
        </button>

        {/* 当前身份 + 登出 */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className={cn(
            'flex items-center justify-center w-8 h-8 rounded-lg shrink-0',
            currentRole === 'admin' ? 'bg-primary/10' : 'bg-muted'
          )}>
            {currentRole === 'admin'
              ? <ShieldCheck className="w-4 h-4 text-primary" />
              : <User className="w-4 h-4 text-muted-foreground" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {currentRole === 'admin' ? '管理员' : '子账号用户'}
            </p>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {currentRole === 'admin'
                ? (settings.apiKey ? maskApiKey(settings.apiKey) : '未设置 CartierMiller API Key')
                : `密钥: ${settings.accessKey ? maskApiKey(settings.accessKey) : '—'}`
              }
            </p>
          </div>
          <button
            onClick={() => {
              stopPolling();
              updateSettings({ accessKey: undefined });
              navigate(ROUTE_PATHS.LOGIN, { replace: true });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors border border-destructive/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            退出登录
          </button>
        </div>

        {/* API docs hint */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-foreground">📖 API 接口说明</h3>
          <div className="space-y-1 text-[11px] text-muted-foreground font-mono">
            <div><span className="text-primary">POST</span> /api/v1/cloudNumber/list — 获取号码列表</div>
            <div><span className="text-primary">POST</span> /api/v1/cloudNumber/smsList — 查询接收短信（轮询）</div>
            <div><span className="text-primary">POST</span> /api/v1/cloudNumber/imageWriteSms — 写入短信到设备（发送）</div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            注：写入短信仅限 Android 15 和 Android 12 (区域A) 的设备可操作
          </p>
        </div>
      </div>
    </div>
  );
}
