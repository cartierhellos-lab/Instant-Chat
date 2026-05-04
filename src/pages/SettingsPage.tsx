import { useState, useEffect } from 'react';
import { Settings, Key, Globe, RefreshCw, Check, AlertCircle, Wifi, WifiOff, LogOut, ShieldCheck, User, Plus, Trash2, Copy, Smartphone, Users, Database, Languages } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useChatStore, useAdminStore, useAccountStore } from '@/hooks/useStore';
import { cn, ROUTE_PATHS, generateSubKey, formatTime } from '@/lib/index';
import { fetchCloudNumbers } from '@/api/duoplus';
import { reinitSupabase, testSupabaseConnection } from '@/api/supabase';
import type { SubAccount } from '@/lib/index';

// ─── 管理员 Tab 内容（原 Admin.tsx 功能）──────────────────────────────────────
function AdminPanel() {
  const { subAccounts, createSubAccount, deleteSubAccount, updateSubAccount, assignPhones, assignAccounts } = useAdminStore();
  const { cloudPhones } = useChatStore();
  const { accounts } = useAccountStore();

  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');
  const [selectedSub, setSelectedSub] = useState<SubAccount | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [phoneSelections, setPhoneSelections] = useState<string[]>([]);
  const [accountSelections, setAccountSelections] = useState<string[]>([]);
  const [assignMode, setAssignMode] = useState<'phones' | 'accounts'>('phones');

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createSubAccount(newName.trim(), newNote.trim() || undefined);
    setNewName('');
    setNewNote('');
  };

  const handleRegenKey = (sub: SubAccount) => {
    if (confirm(`确定要重置 "${sub.name}" 的密钥吗？旧密钥将立即失效。`)) {
      updateSubAccount(sub.id, { key: generateSubKey() });
    }
  };

  const openAssign = (sub: SubAccount, mode: 'phones' | 'accounts') => {
    setSelectedSub(sub);
    setAssignMode(mode);
    setPhoneSelections(sub.assignedPhoneIds);
    setAccountSelections(sub.assignedAccountIds);
  };

  const handleSaveAssign = () => {
    if (!selectedSub) return;
    if (assignMode === 'phones') assignPhones(selectedSub.id, phoneSelections);
    else assignAccounts(selectedSub.id, accountSelections);
    setSelectedSub(null);
  };

  const toggleSel = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* Left: create + list */}
      <div className="w-72 flex flex-col border-r border-border bg-white overflow-y-auto shrink-0">
        {/* Create form */}
        <div className="p-4 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">新建子账号</p>
          <input
            className="w-full border border-input rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            placeholder="子账号名称（必填）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="w-full border border-input rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ring bg-background"
            placeholder="备注（选填）"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition"
          >
            <Plus size={15} /> 生成密钥
          </button>
        </div>

        {/* Sub account list */}
        <div className="flex-1 overflow-y-auto">
          {subAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <Users size={32} className="text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">暂无子账号</p>
            </div>
          ) : (
            subAccounts.map((sub) => (
              <div
                key={sub.id}
                className={cn(
                  'p-3 border-b border-border cursor-pointer hover:bg-slate-50 transition',
                  selectedSub?.id === sub.id && 'bg-primary/5'
                )}
                onClick={() => setSelectedSub(sub)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{sub.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSubAccount(sub.id); if (selectedSub?.id === sub.id) setSelectedSub(null); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {sub.note && <p className="text-[10px] text-muted-foreground mb-1">{sub.note}</p>}
                <div className="flex items-center gap-1">
                  <code className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 flex-1 truncate">
                    {sub.key}
                  </code>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopy(sub.key, sub.id + '-key'); }}
                    className="p-1 rounded hover:bg-muted transition"
                    title="复制密钥"
                  >
                    {copiedId === sub.id + '-key' ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-muted-foreground" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRegenKey(sub); }}
                    className="p-1 rounded hover:bg-muted transition"
                    title="重置密钥"
                  >
                    <RefreshCw size={11} className="text-muted-foreground" />
                  </button>
                </div>
                <div className="flex gap-2 mt-1.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5"><Smartphone size={9} /> {sub.assignedPhoneIds.length} 台设备</span>
                  <span className="flex items-center gap-0.5"><Users size={9} /> {sub.assignedAccountIds.length} 个账号</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">{formatTime(sub.createdAt)}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: assign panel */}
      <div className="flex-1 overflow-y-auto p-5">
        {!selectedSub ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <ShieldCheck size={36} className="text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">从左侧选择子账号进行资源分配</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-lg">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <User size={15} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedSub.name}</p>
                {selectedSub.note && <p className="text-xs text-muted-foreground">{selectedSub.note}</p>}
              </div>
            </div>

            {/* Assign mode switcher */}
            <div className="flex gap-2">
              {(['phones', 'accounts'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAssignMode(mode)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border',
                    assignMode === mode
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  )}
                >
                  {mode === 'phones' ? <Smartphone size={12} /> : <Users size={12} />}
                  {mode === 'phones' ? '分配设备' : '分配账号'}
                </button>
              ))}
            </div>

            {assignMode === 'phones' ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground mb-2">选择要分配给此子账号的设备：</p>
                {cloudPhones.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">暂无设备</p>
                ) : cloudPhones.map((phone) => {
                  const checked = phoneSelections.includes(phone.id);
                  return (
                    <label key={phone.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSel(phone.id, phoneSelections, setPhoneSelections)}
                        className="accent-primary"
                      />
                      <Smartphone size={13} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{phone.name || phone.id}</p>
                        {phone.ip && <p className="text-[10px] text-muted-foreground font-mono">{phone.ip}</p>}
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground mb-2">选择要分配给此子账号的 TextNow 账号：</p>
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">暂无账号（请先在资源页导入）</p>
                ) : accounts.slice(0, 100).map((acc) => {
                  const checked = accountSelections.includes(acc.id);
                  return (
                    <label key={acc.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSel(acc.id, accountSelections, setAccountSelections)}
                        className="accent-primary"
                      />
                      <span className="text-xs font-mono text-foreground">{acc.phoneNumber}</span>
                      <span className="text-[10px] text-muted-foreground">{acc.username}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <button
              onClick={handleSaveAssign}
              className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition flex items-center justify-center gap-2"
            >
              <Check size={14} /> 保存分配
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主设置页面 ───────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettingsStore();
  const { cloudNumbers, loadNumbers, lastError, stopPolling } = useChatStore();
  const { currentRole } = useAdminStore();
  const [activeTab, setActiveTab] = useState<'general' | 'admin'>('general');
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [region, setRegion] = useState(settings.apiRegion);
  const [pollInterval, setPollInterval] = useState(settings.pollInterval);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [saved, setSaved] = useState(false);

  // Supabase 配置状态
  const [sbUrl, setSbUrl] = useState(() => localStorage.getItem('sb_url') || '');
  const [sbKey, setSbKey] = useState(() => localStorage.getItem('sb_key') || '');
  const [sbTesting, setSbTesting] = useState(false);

  // 翻译引擎配置状态
  const [translateEngine, setTranslateEngine] = useState<'mymemory' | 'ollama'>(settings.translateEngine ?? 'mymemory');
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl ?? 'http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel ?? 'qwen2:7b');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaTestResult, setOllamaTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [ollamaTestMsg, setOllamaTestMsg] = useState('');
  const [sbTestResult, setSbTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [sbTestMsg, setSbTestMsg] = useState('');
  const [sbSaved, setSbSaved] = useState(false);

  useEffect(() => {
    setApiKey(settings.apiKey);
    setRegion(settings.apiRegion);
    setPollInterval(settings.pollInterval);
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
      translateEngine,
      ollamaUrl: ollamaUrl.trim() || 'http://localhost:11434',
      ollamaModel: ollamaModel.trim() || 'qwen2:7b',
    });
    loadNumbers(apiKey, region);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const maskApiKey = (key: string) => {
    if (!key || key.length < 8) return key;
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  };

  const handleSbSave = () => {
    reinitSupabase(sbUrl.trim(), sbKey.trim());
    setSbSaved(true);
    setTimeout(() => setSbSaved(false), 2000);
  };

  const handleSbTest = async () => {
    if (!sbUrl.trim() || !sbKey.trim()) return;
    setSbTesting(true);
    setSbTestResult('idle');
    setSbTestMsg('');
    // 先用当前输入框的值临时初始化
    reinitSupabase(sbUrl.trim(), sbKey.trim());
    try {
      const result = await testSupabaseConnection();
      setSbTestResult(result.ok ? 'ok' : 'fail');
      setSbTestMsg(result.message);
    } catch (e) {
      setSbTestResult('fail');
      setSbTestMsg((e as Error).message);
    } finally {
      setSbTesting(false);
    }
  };

  const isAdmin = currentRole === 'admin';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
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

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-border bg-card/30 shrink-0">
        <button
          onClick={() => setActiveTab('general')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2',
            activeTab === 'general'
              ? 'border-primary text-primary bg-primary/5'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          常规设置
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('admin')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2',
              activeTab === 'admin'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <ShieldCheck size={14} />
            管理员
          </button>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'general' ? (
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-2xl">
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

          {/* Translation Engine */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Languages className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">翻译引擎</h2>
            </div>
            {/* 引擎选择 */}
            <div className="flex gap-2">
              {(['mymemory', 'ollama'] as const).map((e) => (
                <button key={e} onClick={() => setTranslateEngine(e)}
                  className={cn('flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all',
                    translateEngine === e ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground hover:bg-muted/80'
                  )}>
                  {e === 'mymemory' ? '🌐 MyMemory（在线免费）' : '⚡ Ollama（本地模型）'}
                </button>
              ))}
            </div>

            {translateEngine === 'ollama' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Ollama 服务地址</label>
                  <input value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm font-mono text-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 outline-none" />
                  <p className="text-[10px] text-muted-foreground mt-1">本地运行 Ollama 后的默认地址，部署在服务器则填写服务器 IP</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">翻译模型</label>
                  <div className="flex gap-2">
                    <input value={ollamaModel} onChange={e => setOllamaModel(e.target.value)}
                      placeholder="qwen2:7b"
                      className="flex-1 px-3 py-2.5 rounded-lg bg-muted border border-border text-sm font-mono text-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 outline-none" />
                    {ollamaModels.length > 0 && (
                      <select value={ollamaModel} onChange={e => setOllamaModel(e.target.value)}
                        className="px-2 py-2 rounded-lg bg-muted border border-border text-xs text-foreground outline-none">
                        {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                <button onClick={async () => {
                  setOllamaTestResult('idle'); setOllamaTestMsg('');
                  const { testOllamaConnection } = await import('@/api/translate');
                  const r = await testOllamaConnection(ollamaUrl);
                  setOllamaTestResult(r.ok ? 'ok' : 'fail');
                  setOllamaTestMsg(r.ok ? `连接成功，${r.models.length} 个模型可用` : r.error ?? '连接失败');
                  if (r.ok) setOllamaModels(r.models);
                }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all">
                  <Wifi className="w-3.5 h-3.5" /> 测试 Ollama 连接
                </button>
                {ollamaTestResult !== 'idle' && (
                  <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                    ollamaTestResult === 'ok' ? 'bg-green-400/10 text-green-600 border border-green-400/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
                  )}>
                    {ollamaTestResult === 'ok' ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                    {ollamaTestMsg}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">Ollama 不可用时自动降级到 MyMemory</p>
              </div>
            )}

            {translateEngine === 'mymemory' && (
              <p className="text-xs text-muted-foreground">使用 MyMemory 免费翻译 API，无需配置，支持 50+ 语言，每天有调用限额（约 5000 次）</p>
            )}
          </div>

          {/* Supabase Configuration */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Supabase 数据库</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              配置 Supabase 项目地址，用于持久化存储账号、任务等数据。
            </p>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Project URL
              </label>
              <input
                type="text"
                value={sbUrl}
                onChange={(e) => setSbUrl(e.target.value)}
                placeholder="https://xxxxxxxxxxxx.supabase.co"
                className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Anon / Public Key
              </label>
              <input
                type="password"
                value={sbKey}
                onChange={(e) => setSbKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 outline-none transition-all"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                在 Supabase 控制台 → Project Settings → API 中获取
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSbTest}
                disabled={!sbUrl.trim() || !sbKey.trim() || sbTesting}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  sbUrl.trim() && sbKey.trim() && !sbTesting
                    ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                {sbTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                测试连接
              </button>
              <button
                onClick={handleSbSave}
                disabled={!sbUrl.trim() || !sbKey.trim()}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  sbUrl.trim() && sbKey.trim()
                    ? sbSaved
                      ? 'bg-green-400/20 text-green-400 border border-green-400/30'
                      : 'bg-primary text-primary-foreground hover:opacity-90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                {sbSaved ? <Check className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
                {sbSaved ? '已保存！' : '保存配置'}
              </button>
            </div>

            {sbTestResult !== 'idle' && (
              <div className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                sbTestResult === 'ok' ? 'bg-green-400/10 text-green-400 border border-green-400/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
              )}>
                {sbTestResult === 'ok' ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                <span>{sbTestMsg}</span>
              </div>
            )}
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
      ) : (
        /* Admin tab */
        <div className="flex flex-1 overflow-hidden min-h-0">
          <AdminPanel />
        </div>
      )}
    </div>
  );
}
