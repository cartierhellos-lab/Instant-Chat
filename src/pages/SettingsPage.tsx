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
      <div className="tool-sidebar w-72 flex flex-col overflow-y-auto shrink-0">
        {/* Create form */}
        <div className="p-4 border-b border-[#dbe2e9]">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">新建子账号</p>
          <input
            className="tool-input h-8 px-3 text-sm mb-2"
            placeholder="子账号名称（必填）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="tool-input h-8 px-3 text-sm mb-3"
            placeholder="备注（选填）"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="tool-btn tool-btn-primary w-full justify-center py-2 text-sm font-medium disabled:opacity-40"
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
                  'p-3 border-b border-[#dbe2e9] cursor-pointer hover:bg-white/70 transition',
                  selectedSub?.id === sub.id && 'bg-primary/5'
                )}
                onClick={() => setSelectedSub(sub)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{sub.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSubAccount(sub.id); if (selectedSub?.id === sub.id) setSelectedSub(null); }}
                    className="p-1 rounded hover:bg-white text-muted-foreground hover:text-destructive transition"
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
                    className="p-1 rounded hover:bg-white transition"
                    title="复制密钥"
                  >
                    {copiedId === sub.id + '-key' ? <Check size={11} className="text-green-400" /> : <Copy size={11} className="text-muted-foreground" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRegenKey(sub); }}
                    className="p-1 rounded hover:bg-white transition"
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
              <div className="w-8 h-8 rounded-lg bg-[linear-gradient(180deg,#edf5ff_0%,#e6f0fd_100%)] flex items-center justify-center">
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
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-xs font-medium transition border',
                    assignMode === mode
                      ? 'bg-[linear-gradient(180deg,#3683ec_0%,#276bcc_100%)] text-primary-foreground border-transparent'
                      : 'border-[#dbe2e9] text-muted-foreground hover:bg-white/70'
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
                    <label key={phone.id} className="flex items-center gap-2 px-3 py-2 rounded-[7px] border border-[#dbe2e9] hover:bg-white/70 cursor-pointer transition">
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
                    <label key={acc.id} className="flex items-center gap-2 px-3 py-2 rounded-[7px] border border-[#dbe2e9] hover:bg-white/70 cursor-pointer transition">
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
              className="tool-btn tool-btn-primary w-full justify-center py-2 text-sm font-medium"
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
      {/* 工具栏 */}
      <div className="tool-toolbar flex items-center gap-2 px-4 py-2 shrink-0">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <span className="text-[12px] font-semibold text-foreground">设置</span>
        <div className="flex items-center gap-0.5 ml-3">
          {(['general', ...(isAdmin ? ['admin'] : [])] as ('general' | 'admin')[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('tool-tab h-6 px-2.5 text-[10px] font-medium transition-colors',
                activeTab === tab ? 'tool-tab-active text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/70'
              )}>
              {tab === 'admin' && <ShieldCheck size={10} />}
              {tab === 'general' ? '常规设置' : '管理员'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'general' ? (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-2xl">
          {/* 连接状态 */}
          <div className={cn('flex items-center gap-2.5 px-3 py-2 rounded-[8px] border text-[11px]',
            lastError ? 'border-red-300 bg-red-50 text-red-600' : cloudNumbers.length > 0 ? 'border-green-300 bg-green-50 text-green-700' : 'border-[#dbe2e9] bg-white text-muted-foreground'
          )}>
            {lastError ? <WifiOff className="w-3.5 h-3.5 shrink-0" /> : cloudNumbers.length > 0 ? <Wifi className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            <span className="font-medium">{lastError ? '连接失败' : cloudNumbers.length > 0 ? `已连接 · ${cloudNumbers.length} 个号码` : '未连接'}</span>
            {lastError && <span className="ml-1 font-mono text-[10px] truncate">{lastError}</span>}
            {!lastError && settings.apiKey && cloudNumbers.length > 0 && (
              <span className="ml-1 font-mono text-[10px] opacity-70">{maskApiKey(settings.apiKey)} · {settings.apiRegion === 'cn' ? '国内' : '国际'}</span>
            )}
          </div>

          {/* API Key */}
          <section className="tool-panel p-4 space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-[#ebebeb]">
              <Key className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-[11px] font-semibold">API 密钥</span>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-muted-foreground">CartierMiller API Key</label>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="粘贴 API Key…"
                className="tool-input h-7 px-2.5 text-[11px] font-mono placeholder:text-muted-foreground/40" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleTest} disabled={!apiKey || testing}
                className="tool-btn h-6 px-3 text-[10px] disabled:opacity-40">
                {testing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}测试连接
              </button>
              {testResult !== 'idle' && (
                <span className={cn('flex items-center gap-1 text-[10px]', testResult === 'ok' ? 'text-green-600' : 'text-red-500')}>
                  {testResult === 'ok' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}{testMsg}
                </span>
              )}
            </div>
          </section>

          {/* 接口配置 */}
          <section className="tool-panel p-4 space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-[#ebebeb]">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-[11px] font-semibold">接口配置</span>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-muted-foreground">API 节点区域</label>
              <div className="flex gap-1.5">
                {(['cn', 'global'] as const).map(r => (
                  <button key={r} onClick={() => setRegion(r)}
                    className={cn('flex-1 h-8 px-3 rounded-[7px] border text-[10px] font-medium transition-colors',
                      region === r ? 'border-primary bg-[linear-gradient(180deg,#edf5ff_0%,#e6f0fd_100%)] text-primary' : 'border-[#c8c8c8] bg-white text-foreground/70 hover:border-primary hover:text-primary'
                    )}>
                    {r === 'cn' ? '🇨🇳 中国大陆' : '🌍 国际节点'}
                    <div className="text-[9px] font-mono opacity-60 mt-0.5">{r === 'cn' ? 'api.carriermiller.cn' : 'api.carriermiller.net'}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-muted-foreground">轮询间隔：<span className="font-mono text-primary">{pollInterval}s</span></label>
              <input type="range" min={3} max={60} step={1} value={pollInterval} onChange={e => setPollInterval(Number(e.target.value))}
                className="w-full accent-primary" style={{height:'4px'}} />
              <div className="flex justify-between text-[9px] text-muted-foreground"><span>3s 高频</span><span>建议 5-10s</span><span>60s 低频</span></div>
            </div>
          </section>

          {/* 翻译引擎 */}
          <section className="tool-panel p-4 space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-[#ebebeb]">
              <Languages className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-[11px] font-semibold">翻译引擎</span>
            </div>
            <div className="flex gap-1.5">
              {(['mymemory', 'ollama'] as const).map(e => (
                <button key={e} onClick={() => setTranslateEngine(e)}
                  className={cn('flex-1 h-7 px-3 rounded-[7px] border text-[10px] font-medium transition-colors',
                    translateEngine === e ? 'border-primary bg-[linear-gradient(180deg,#edf5ff_0%,#e6f0fd_100%)] text-primary' : 'border-[#c8c8c8] bg-white text-foreground/70 hover:border-primary hover:text-primary'
                  )}>
                  {e === 'mymemory' ? '🌐 MyMemory（在线）' : '⚡ Ollama（本地）'}
                </button>
              ))}
            </div>
            {translateEngine === 'ollama' && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1">Ollama 地址</label>
                  <input value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} placeholder="http://localhost:11434"
                    className="tool-input h-7 px-2.5 text-[11px] font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1">翻译模型</label>
                  <div className="flex gap-1.5">
                    <input value={ollamaModel} onChange={e => setOllamaModel(e.target.value)} placeholder="qwen2:7b"
                      className="tool-input h-7 px-2.5 text-[11px] font-mono" />
                    {ollamaModels.length > 0 && (
                      <select value={ollamaModel} onChange={e => setOllamaModel(e.target.value)}
                        className="tool-input h-7 px-1.5 text-[10px]">
                        {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={async () => {
                    setOllamaTestResult('idle'); setOllamaTestMsg('');
                    const { testOllamaConnection } = await import('@/api/translate');
                    const r = await testOllamaConnection(ollamaUrl);
                    setOllamaTestResult(r.ok ? 'ok' : 'fail');
                    setOllamaTestMsg(r.ok ? `连接成功，${r.models.length} 个模型` : r.error ?? '连接失败');
                    if (r.ok) setOllamaModels(r.models);
                  }} className="tool-btn h-6 px-2.5 text-[10px]">
                    <Wifi className="w-3 h-3" />测试 Ollama
                  </button>
                  {ollamaTestResult !== 'idle' && (
                    <span className={cn('flex items-center gap-1 text-[10px]', ollamaTestResult === 'ok' ? 'text-green-600' : 'text-red-500')}>
                      {ollamaTestResult === 'ok' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}{ollamaTestMsg}
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground">Ollama 不可用时自动降级到 MyMemory</p>
              </div>
            )}
            {translateEngine === 'mymemory' && <p className="text-[10px] text-muted-foreground">MyMemory 免费在线翻译，支持 50+ 语言，每天约 5000 次调用限额</p>}
          </section>

          {/* Supabase */}
          <section className="tool-panel p-4 space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-[#ebebeb]">
              <Database className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-[11px] font-semibold">Supabase 数据库</span>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-muted-foreground">Project URL</label>
              <input type="text" value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="https://xxxx.supabase.co"
                className="tool-input h-7 px-2.5 text-[11px] font-mono" />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-medium text-muted-foreground">Anon / Public Key</label>
              <input type="password" value={sbKey} onChange={e => setSbKey(e.target.value)} placeholder="eyJhbGciOi…"
                className="tool-input h-7 px-2.5 text-[11px] font-mono" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSbTest} disabled={!sbUrl.trim() || !sbKey.trim() || sbTesting}
                className="tool-btn h-6 px-2.5 text-[10px] disabled:opacity-40">
                {sbTesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}测试
              </button>
              <button onClick={handleSbSave} disabled={!sbUrl.trim() || !sbKey.trim()}
                className={cn('tool-btn h-6 px-2.5 text-[10px] font-medium disabled:opacity-40',
                  sbSaved ? 'border border-green-300 bg-green-50 text-green-700' : 'tool-btn-primary'
                )}>
                {sbSaved ? <><Check className="w-3 h-3" />已保存</> : <><Database className="w-3 h-3" />保存配置</>}
              </button>
              {sbTestResult !== 'idle' && (
                <span className={cn('flex items-center gap-1 text-[10px]', sbTestResult === 'ok' ? 'text-green-600' : 'text-red-500')}>
                  {sbTestResult === 'ok' ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}{sbTestMsg}
                </span>
              )}
            </div>
          </section>

          {/* 保存 + 身份 + 退出 */}
          <div className="flex items-center gap-3 pb-4">
            <button onClick={handleSave}
              className={cn('tool-btn h-7 px-4 text-[11px] font-semibold',
                saved ? 'border border-green-300 bg-green-50 text-green-700' : 'tool-btn-primary'
              )}>
              {saved ? <><Check className="w-3.5 h-3.5" />已保存</> : <><Settings className="w-3.5 h-3.5" />保存并应用</>}
            </button>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {currentRole === 'admin' ? '🔑 管理员' : '👤 子账号'} · {settings.apiKey ? maskApiKey(settings.apiKey) : '未配置'}
            </span>
            <button onClick={() => { stopPolling(); updateSettings({ accessKey: undefined }); navigate(ROUTE_PATHS.LOGIN, { replace: true }); }}
              className="tool-btn h-6 px-2 text-[10px] border-red-300 bg-red-50 text-red-600 hover:bg-red-100">
              <LogOut className="w-3 h-3" />退出
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden min-h-0">
          <AdminPanel />
        </div>
      )}
    </div>
  );
}
