import { useCallback, useState, useEffect } from 'react';
import { Settings, Key, Globe, RefreshCw, Check, AlertCircle, Wifi, WifiOff, LogOut, ShieldCheck, User, Plus, Trash2, Copy, Smartphone, Users, Database, Languages } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useChatStore, useAdminStore, useAccountStore } from '@/hooks/useStore';
import { cn, ROUTE_PATHS, generateSubKey, formatTime, syncSharedSettings } from '@/lib/index';
import { fetchCloudNumbers } from '@/api/duoplus';
import {
  reinitSupabase,
  testSupabaseConnection,
  getSubAccounts,
  createSubAccount as createSubAccountRemote,
  updateSubAccount as updateSubAccountRemote,
  deleteSubAccount as deleteSubAccountRemote,
  ensureCommunityRoom,
  updateCommunityRoom,
} from '@/api/supabase';
import type { SubAccount } from '@/lib/index';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';

// ─── 管理员 Tab 内容（原 Admin.tsx 功能）──────────────────────────────────────
function AdminPanel() {
  const { subAccounts, setSubAccounts } = useAdminStore();
  const { cloudPhones } = useChatStore();
  const { accounts } = useAccountStore();

  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');
  const [selectedSub, setSelectedSub] = useState<SubAccount | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [phoneSelections, setPhoneSelections] = useState<string[]>([]);
  const [accountSelections, setAccountSelections] = useState<string[]>([]);
  const [assignMode, setAssignMode] = useState<'phones' | 'accounts'>('phones');
  const [regenTarget, setRegenTarget] = useState<SubAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'offline'>('idle');

  const refreshSubAccounts = useCallback(async () => {
    try {
      setSyncStatus('syncing');
      const latest = await getSubAccounts();
      setSubAccounts(latest);
      if (selectedSub) {
        const nextSelected = latest.find((item) => item.id === selectedSub.id) ?? null;
        setSelectedSub(nextSelected);
        setPhoneSelections(nextSelected?.assignedPhoneIds ?? []);
        setAccountSelections(nextSelected?.assignedAccountIds ?? []);
      }
      setSyncStatus('ok');
    } catch (error) {
      setSyncStatus('offline');
      toast({ title: '同步子账号失败', description: (error as Error).message || '数据库暂时不可用，请检查 Supabase 配置。' });
    }
  }, [selectedSub, setSubAccounts]);

  useEffect(() => { void refreshSubAccounts(); }, [refreshSubAccounts]);

  useEffect(() => {
    if (!selectedSub) return;
    setPhoneSelections(selectedSub.assignedPhoneIds);
    setAccountSelections(selectedSub.assignedAccountIds);
  }, [selectedSub]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createSubAccountRemote({
        name: newName.trim(),
        key: generateSubKey(),
        role: 'user',
        assignedPhoneIds: [],
        assignedAccountIds: [],
        createdAt: new Date().toISOString(),
        note: newNote.trim() || undefined,
      });
      await refreshSubAccounts();
      toast({ title: '子账号已创建', description: `已为"${newName.trim()}"生成密钥。` });
    } catch (error) {
      toast({ title: '创建失败', description: (error as Error).message || '数据库写入失败，请检查 Supabase 配置。' });
    } finally {
      setSaving(false);
    }
    setNewName('');
    setNewNote('');
  };

  const handleRegenKey = (sub: SubAccount) => { setRegenTarget(sub); };

  const confirmRegenKey = async () => {
    if (!regenTarget) return;
    setSaving(true);
    try {
      const nextKey = generateSubKey();
      await updateSubAccountRemote(regenTarget.id, { key: nextKey });
      await refreshSubAccounts();
      toast({ title: '密钥已重置', description: `"${regenTarget.name}" 的新密钥已生成。` });
    } catch (error) {
      toast({ title: '重置失败', description: (error as Error).message || '数据库写入失败。' });
    } finally {
      setSaving(false);
      setRegenTarget(null);
    }
  };

  const handleSaveAssign = async () => {
    if (!selectedSub) return;
    setSaving(true);
    try {
      await updateSubAccountRemote(selectedSub.id, {
        assignedPhoneIds: phoneSelections,
        assignedAccountIds: accountSelections,
      });
      await refreshSubAccounts();
      toast({ title: '分配已保存', description: `"${selectedSub.name}" 的资源分配已更新。` });
    } catch (error) {
      toast({ title: '保存失败', description: (error as Error).message || `"${selectedSub.name}" 的资源分配未能写入数据库。` });
    } finally {
      setSaving(false);
    }
    setSelectedSub(null);
  };

  const toggleSel = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const syncChipCls = {
    ok:      'bg-[#34c759]/10 text-[#34c759]',
    syncing: 'bg-[#007aff]/10 text-[#007aff]',
    offline: 'bg-[#ff9500]/10 text-[#ff9500]',
    idle:    'bg-[#f2f2f7] text-[#8e8e93]',
  }[syncStatus];

  return (
    <>
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* 左：新建 + 列表 */}
        <div className="tool-sidebar w-72 flex flex-col overflow-y-auto shrink-0 bg-[#f2f2f7]">
          {/* 新建表单 */}
          <div className="p-4 border-b border-[#e5e5ea] bg-white">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-[#8e8e93]">子账号数据源</span>
              <div className="flex items-center gap-2">
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', syncChipCls)}>
                  {syncStatus === 'ok' ? '已同步' : syncStatus === 'syncing' ? '同步中' : syncStatus === 'offline' ? '数据库离线' : '待同步'}
                </span>
                <button
                  type="button"
                  onClick={() => void refreshSubAccounts()}
                  disabled={syncStatus === 'syncing'}
                  className="tool-btn tool-btn-quiet h-6 px-2 text-[11px] disabled:opacity-40"
                >
                  <RefreshCw size={11} className={cn(syncStatus === 'syncing' && 'animate-spin')} />
                  同步
                </button>
              </div>
            </div>

            <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-2">新建子账号</p>
            <input
              className="tool-input h-8 px-3 text-[13px] mb-2"
              placeholder="子账号名称（必填）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="tool-input h-8 px-3 text-[13px] mb-3"
              placeholder="备注（选填）"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || saving}
              className="ios-btn ios-btn-primary w-full justify-center h-8 text-[13px] disabled:opacity-40"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              生成密钥
            </button>
          </div>

          {/* 子账号列表 */}
          <div className="flex-1 overflow-y-auto">
            {syncStatus === 'syncing' && subAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                <RefreshCw size={22} className="text-[#c7c7cc] mb-2 animate-spin" />
                <p className="text-[12px] text-[#8e8e93]">正在从数据库加载子账号…</p>
              </div>
            ) : subAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                <Users size={28} className="text-[#c7c7cc] mb-2" />
                <p className="text-[12px] text-[#8e8e93]">
                  {syncStatus === 'offline' ? '数据库未连接，暂时无法读取子账号' : '暂无子账号'}
                </p>
              </div>
            ) : (
              subAccounts.map((sub) => (
                <div
                  key={sub.id}
                  className={cn(
                    'p-3 border-b border-[#f2f2f7] cursor-pointer transition-colors',
                    selectedSub?.id === sub.id ? 'bg-[#007aff]/5' : 'bg-white hover:bg-[#fafafa]'
                  )}
                  onClick={() => setSelectedSub(sub)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[14px] font-medium text-[#1c1c1e]">{sub.name}</span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setSaving(true);
                        try {
                          await deleteSubAccountRemote(sub.id);
                          await refreshSubAccounts();
                          if (selectedSub?.id === sub.id) setSelectedSub(null);
                          toast({ title: '子账号已删除', description: `"${sub.name}" 已移除。` });
                        } catch (error) {
                          toast({ title: '删除失败', description: (error as Error).message || `"${sub.name}" 未能从数据库删除。` });
                        } finally {
                          setSaving(false); }
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-[#c7c7cc] hover:text-[#ff3b30] hover:bg-[#ff3b30]/10 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {sub.note && <p className="text-[11px] text-[#8e8e93] mb-1.5">{sub.note}</p>}
                  <div className="flex items-center gap-1 bg-[#f2f2f7] rounded-[6px] px-2 py-1">
                    <code className="text-[10px] font-mono text-[#8e8e93] flex-1 truncate">{sub.key}</code>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopy(sub.key, sub.id + '-key'); }}
                      className="shrink-0 text-[#c7c7cc] hover:text-[#007aff] transition-colors"
                      title="复制密钥"
                    >
                      {copiedId === sub.id + '-key' ? <Check size={11} className="text-[#34c759]" /> : <Copy size={11} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRegenKey(sub); }}
                      className="shrink-0 text-[#c7c7cc] hover:text-[#ff9500] transition-colors"
                      title="重置密钥"
                    >
                      <RefreshCw size={11} />
                    </button>
                  </div>
                  <div className="flex gap-3 mt-1.5 text-[11px] text-[#8e8e93]">
                    <span className="flex items-center gap-1"><Smartphone size={10} /> {sub.assignedPhoneIds.length} 台设备</span>
                    <span className="flex items-center gap-1"><Users size={10} /> {sub.assignedAccountIds.length} 个账号</span>
                  </div>
                  <p className="text-[10px] text-[#c7c7cc] mt-0.5">{formatTime(sub.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右：分配面板 */}
        <div className="flex-1 overflow-y-auto p-5 bg-[#f2f2f7]">
          {!selectedSub ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-3">
                <ShieldCheck size={28} className="text-[#c7c7cc]" />
              </div>
              <p className="text-[15px] font-medium text-[#8e8e93]">从左侧选择子账号</p>
              <p className="text-[13px] text-[#c7c7cc] mt-1">进行设备与账号资源分配</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-lg">
              {/* 选中子账号头部 */}
              <div className="ios-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-[10px] bg-[#007aff]/10 flex items-center justify-center shrink-0">
                  <User size={18} className="text-[#007aff]" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[#1c1c1e]">{selectedSub.name}</p>
                  {selectedSub.note && <p className="text-[12px] text-[#8e8e93]">{selectedSub.note}</p>}
                </div>
              </div>

              {/* 分配模式切换 */}
              <div className="flex gap-2">
                {(['phones', 'accounts'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAssignMode(mode)}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-medium transition border',
                      assignMode === mode
                        ? 'bg-[#007aff] text-white border-transparent'
                        : 'border-[#e5e5ea] bg-white text-[#8e8e93] hover:border-[#007aff] hover:text-[#007aff]'
                    )}
                  >
                    {mode === 'phones' ? <Smartphone size={13} /> : <Users size={13} />}
                    {mode === 'phones' ? '分配设备' : '分配账号'}
                  </button>
                ))}
              </div>

              {/* 选项列表 */}
              <div className="ios-card overflow-hidden">
                {assignMode === 'phones' ? (
                  cloudPhones.length === 0 ? (
                    <p className="px-4 py-3 text-[13px] text-[#8e8e93] italic">暂无设备</p>
                  ) : cloudPhones.map((phone, idx) => {
                    const checked = phoneSelections.includes(phone.id);
                    return (
                      <label
                        key={phone.id}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                          idx > 0 && 'border-t border-[#f2f2f7]',
                          checked ? 'bg-[#007aff]/5' : 'hover:bg-[#fafafa]'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSel(phone.id, phoneSelections, setPhoneSelections)}
                          className="w-4 h-4 accent-[#007aff] rounded"
                        />
                        <div className="w-8 h-8 rounded-[8px] bg-[#f2f2f7] flex items-center justify-center shrink-0">
                          <Smartphone size={14} className="text-[#8e8e93]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-[#1c1c1e] truncate">{phone.name || phone.id}</p>
                          {phone.ip && <p className="text-[11px] text-[#8e8e93] font-mono">{phone.ip}</p>}
                        </div>
                      </label>
                    );
                  })
                ) : (
                  accounts.length === 0 ? (
                    <p className="px-4 py-3 text-[13px] text-[#8e8e93] italic">暂无账号（请先在账号页导入）</p>
                  ) : accounts.slice(0, 100).map((acc, idx) => {
                    const checked = accountSelections.includes(acc.id);
                    return (
                      <label
                        key={acc.id}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                          idx > 0 && 'border-t border-[#f2f2f7]',
                          checked ? 'bg-[#007aff]/5' : 'hover:bg-[#fafafa]'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSel(acc.id, accountSelections, setAccountSelections)}
                          className="w-4 h-4 accent-[#007aff]"
                        />
                        <span className="text-[13px] font-mono text-[#1c1c1e]">{acc.phoneNumber}</span>
                        <span className="text-[12px] text-[#8e8e93]">{acc.username}</span>
                      </label>
                    );
                  })
                )}
              </div>

              <button
                onClick={handleSaveAssign}
                disabled={saving}
                className="ios-btn ios-btn-primary w-full justify-center h-9 text-[14px] font-medium disabled:opacity-40"
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                保存分配
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!regenTarget}
        onOpenChange={(open) => !open && setRegenTarget(null)}
        title="重置子账号密钥？"
        description={`重置后，"${regenTarget?.name ?? ''}" 的旧密钥将立即失效。`}
        confirmText="确认重置"
        cancelText="取消"
        destructive
        onConfirm={confirmRegenKey}
      />
    </>
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

  const [sbUrl, setSbUrl] = useState(() => localStorage.getItem('sb_url') || '');
  const [sbKey, setSbKey] = useState(() => localStorage.getItem('sb_key') || '');
  const [sbTesting, setSbTesting] = useState(false);

  const [translateEngine, setTranslateEngine] = useState<'mymemory' | 'ollama'>(settings.translateEngine ?? 'mymemory');
  const [ollamaUrl, setOllamaUrl] = useState(settings.ollamaUrl ?? 'http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState(settings.ollamaModel ?? 'qwen2:7b');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaTestResult, setOllamaTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [ollamaTestMsg, setOllamaTestMsg] = useState('');
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [sbTestResult, setSbTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [sbTestMsg, setSbTestMsg] = useState('');
  const [sbSaved, setSbSaved] = useState(false);
  const [marqueeEnabled, setMarqueeEnabled] = useState(settings.marqueeEnabled ?? true);
  const [marqueeDuration, setMarqueeDuration] = useState(settings.marqueeDuration ?? 60);
  const [marqueeNotice, setMarqueeNotice] = useState('');
  const [marqueeSaving, setMarqueeSaving] = useState(false);

  useEffect(() => {
    setApiKey(settings.apiKey);
    setRegion(settings.apiRegion);
    setPollInterval(settings.pollInterval);
    setMarqueeEnabled(settings.marqueeEnabled ?? true);
    setMarqueeDuration(settings.marqueeDuration ?? 60);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const room = await ensureCommunityRoom();
        if (!cancelled) setMarqueeNotice(room.marqueeNotice ?? '');
      } catch { /* keep local field */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleTest = async () => {
    if (!apiKey) return;
    setTesting(true); setTestResult('idle'); setTestMsg('');
    try {
      const numbers = await fetchCloudNumbers(apiKey, region);
      setTestResult('ok'); setTestMsg(`连接成功，共获取到 ${numbers.length} 个云号码`);
    } catch (e) {
      setTestResult('fail'); setTestMsg((e as Error).message);
    } finally { setTesting(false); }
  };

  const handleSave = () => {
    const nextSettings = {
      apiKey,
      apiRegion: region,
      pollInterval: Math.max(3, Math.min(60, pollInterval)),
      translateEngine,
      ollamaUrl: ollamaUrl.trim() || 'http://localhost:11434',
      ollamaModel: ollamaModel.trim() || 'qwen2:7b',
      marqueeEnabled,
      marqueeDuration: Math.max(15, Math.min(180, marqueeDuration)),
    };
    updateSettings(nextSettings);
    syncSharedSettings({ ...settings, ...nextSettings });
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
    setSbTesting(true); setSbTestResult('idle'); setSbTestMsg('');
    reinitSupabase(sbUrl.trim(), sbKey.trim());
    try {
      const result = await testSupabaseConnection();
      setSbTestResult(result.ok ? 'ok' : 'fail');
      setSbTestMsg(result.message);
    } catch (e) {
      setSbTestResult('fail'); setSbTestMsg((e as Error).message);
    } finally { setSbTesting(false); }
  };

  const handleMarqueeSave = async () => {
    setMarqueeSaving(true);
    try {
      const room = await ensureCommunityRoom();
      await updateCommunityRoom(room.id, { marqueeNotice: marqueeNotice.trim() });
      toast({ title: '公告已更新', description: '顶部滚动公告内容已保存。' });
    } finally { setMarqueeSaving(false); }
  };

  const isAdmin = currentRole === 'admin';

  // 连接状态样式
  const connStatusCls = lastError
    ? 'border-[#ff3b30]/30 bg-[#ff3b30]/5 text-[#ff3b30]'
    : cloudNumbers.length > 0
      ? 'border-[#34c759]/30 bg-[#34c759]/5 text-[#34c759]'
      : 'border-[#e5e5ea] bg-white text-[#8e8e93]';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#f2f2f7]">
      {/* 工具栏 */}
      <div className="tool-toolbar h-11 px-4 flex items-center gap-2 shrink-0">
        <span className="text-[17px] font-semibold text-[#1c1c1e] flex-1">设置</span>
        <div className="flex items-center gap-1 bg-[#f2f2f7] rounded-[8px] p-0.5">
          {(['general', ...(isAdmin ? ['admin'] : [])] as ('general' | 'admin')[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex items-center gap-1.5 h-7 px-3 rounded-[7px] text-[12px] font-medium transition-colors',
                activeTab === tab
                  ? 'bg-white text-[#1c1c1e] shadow-sm'
                  : 'text-[#8e8e93] hover:text-[#1c1c1e]'
              )}
            >
              {tab === 'admin' && <ShieldCheck size={11} />}
              {tab === 'general' ? '常规设置' : '管理员'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'general' ? (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 max-w-2xl">

          {/* 连接状态 banner */}
          <div className={cn('flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] border text-[13px]', connStatusCls)}>
            {lastError
              ? <WifiOff className="w-4 h-4 shrink-0" />
              : cloudNumbers.length > 0
                ? <Wifi className="w-4 h-4 shrink-0" />
                : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="font-medium">
              {lastError ? '连接失败' : cloudNumbers.length > 0 ? `已连接 · ${cloudNumbers.length} 个号码` : '未连接'}
            </span>
            {lastError && <span className="ml-1 font-mono text-[11px] truncate">{lastError}</span>}
            {!lastError && settings.apiKey && cloudNumbers.length > 0 && (
              <span className="ml-1 font-mono text-[11px] opacity-70">{maskApiKey(settings.apiKey)} · {settings.apiRegion === 'cn' ? '国内' : '国际'}</span>
            )}
          </div>

          {/* ── API 密钥 ── */}
          <div className="space-y-1.5">
            <p className="ios-section-header">API 密钥</p>
            <div className="ios-card-grouped">
              <div className="ios-list-row">
                <Key className="w-4 h-4 text-[#8e8e93] shrink-0" />
                <label className="text-[15px] text-[#1c1c1e] flex-1">CartierMiller API Key</label>
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7]">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="粘贴 API Key…"
                  className="tool-input h-8 flex-1 px-2.5 text-[13px] font-mono placeholder:text-[#c7c7cc]"
                />
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7] gap-2">
                <button
                  onClick={handleTest}
                  disabled={!apiKey || testing}
                  className="tool-btn tool-btn-quiet h-7 px-3 text-[12px] disabled:opacity-40"
                >
                  {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  {testing ? '连接中…' : '测试连接'}
                </button>
                {testResult !== 'idle' && (
                  <span className={cn('flex items-center gap-1 text-[12px]', testResult === 'ok' ? 'text-[#34c759]' : 'text-[#ff3b30]')}>
                    {testResult === 'ok' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {testMsg}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── 接口配置 ── */}
          <div className="space-y-1.5">
            <p className="ios-section-header">接口配置</p>
            <div className="ios-card-grouped">
              <div className="ios-list-row">
                <Globe className="w-4 h-4 text-[#8e8e93] shrink-0" />
                <span className="text-[15px] text-[#1c1c1e] flex-1">API 节点区域</span>
                <div className="flex gap-1">
                  {(['cn', 'global'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setRegion(r)}
                      className={cn(
                        'h-7 px-3 rounded-[8px] border text-[12px] font-medium transition-colors',
                        region === r
                          ? 'bg-[#007aff] text-white border-transparent'
                          : 'border-[#e5e5ea] text-[#8e8e93] hover:border-[#007aff] hover:text-[#007aff]'
                      )}
                    >
                      {r === 'cn' ? '🇨🇳 国内' : '🌐 国际'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7] flex-col items-start gap-1.5">
                <label className="text-[13px] text-[#8e8e93]">
                  轮询间隔：<span className="font-mono text-[#007aff]">{pollInterval}s</span>
                </label>
                <input
                  type="range" min={3} max={60} step={1}
                  value={pollInterval}
                  onChange={e => setPollInterval(Number(e.target.value))}
                  className="w-full accent-[#007aff]"
                  style={{ height: '4px' }}
                />
                <div className="flex justify-between w-full text-[10px] text-[#c7c7cc]">
                  <span>3s 高频</span><span>建议 5-10s</span><span>60s 低频</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── 翻译引擎 ── */}
          <div className="space-y-1.5">
            <p className="ios-section-header">翻译引擎</p>
            <div className="ios-card-grouped">
              <div className="ios-list-row">
                <Languages className="w-4 h-4 text-[#8e8e93] shrink-0" />
                <span className="text-[15px] text-[#1c1c1e] flex-1">引擎选择</span>
                <div className="flex gap-1">
                  {(['mymemory', 'ollama'] as const).map(e => (
                    <button
                      key={e}
                      onClick={() => setTranslateEngine(e)}
                      className={cn(
                        'h-7 px-3 rounded-[8px] border text-[12px] font-medium transition-colors',
                        translateEngine === e
                          ? 'bg-[#007aff] text-white border-transparent'
                          : 'border-[#e5e5ea] text-[#8e8e93] hover:border-[#007aff] hover:text-[#007aff]'
                      )}
                    >
                      {e === 'mymemory' ? '🌐 MyMemory' : '⚡ Ollama'}
                    </button>
                  ))}
                </div>
              </div>
              {translateEngine === 'ollama' && (
                <>
                  <div className="ios-list-row border-t border-[#f2f2f7] flex-col items-start gap-1.5">
                    <label className="text-[12px] text-[#8e8e93]">Ollama 地址</label>
                    <input
                      value={ollamaUrl}
                      onChange={e => setOllamaUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="tool-input h-8 w-full px-2.5 text-[12px] font-mono"
                    />
                  </div>
                  <div className="ios-list-row border-t border-[#f2f2f7] flex-col items-start gap-1.5">
                    <label className="text-[12px] text-[#8e8e93]">翻译模型</label>
                    <div className="flex gap-1.5 w-full">
                      <input
                        value={ollamaModel}
                        onChange={e => setOllamaModel(e.target.value)}
                        placeholder="qwen2:7b"
                        className="tool-input h-8 flex-1 px-2.5 text-[12px] font-mono"
                      />
                      {ollamaModels.length > 0 && (
                        <select
                          value={ollamaModel}
                          onChange={e => setOllamaModel(e.target.value)}
                          className="tool-input h-8 px-1.5 text-[11px]"
                        >
                          {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="ios-list-row border-t border-[#f2f2f7] gap-2">
                    <button
                      onClick={async () => {
                        setOllamaTesting(true);
                        setOllamaTestResult('idle'); setOllamaTestMsg('');
                        const { testOllamaConnection } = await import('@/api/translate');
                        const r = await testOllamaConnection(ollamaUrl);
                        setOllamaTestResult(r.ok ? 'ok' : 'fail');
                        setOllamaTestMsg(r.ok ? `连接成功，${r.models.length} 个模型` : r.error ?? '连接失败');
                        if (r.ok) setOllamaModels(r.models);
                        setOllamaTesting(false);
                      }}
                      disabled={ollamaTesting}
                      className="tool-btn tool-btn-quiet h-7 px-3 text-[12px] disabled:opacity-40"
                    >
                      {ollamaTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      {ollamaTesting ? '检测中…' : '测试 Ollama'}
                    </button>
                    {ollamaTestResult !== 'idle' && (
                      <span className={cn('flex items-center gap-1 text-[12px]', ollamaTestResult === 'ok' ? 'text-[#34c759]' : 'text-[#ff3b30]')}>
                        {ollamaTestResult === 'ok' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        {ollamaTestMsg}
                      </span>
                    )}
                  </div>
                  <div className="ios-list-row border-t border-[#f2f2f7]">
                    <p className="text-[11px] text-[#8e8e93]">Ollama 不可用时自动降级到 MyMemory</p>
                  </div>
                </>
              )}
              {translateEngine === 'mymemory' && (
                <div className="ios-list-row border-t border-[#f2f2f7]">
                  <p className="text-[12px] text-[#8e8e93]">免费在线翻译，无需本地配置</p>
                </div>
              )}
            </div>
          </div>

          {/* ── 公告滚动栏 ── */}
          <div className="space-y-1.5">
            <p className="ios-section-header">公告滚动栏</p>
            <div className="ios-card-grouped">
              <label className="ios-list-row cursor-pointer">
                <div className="flex-1">
                  <p className="text-[15px] text-[#1c1c1e]">显示顶部公告栏</p>
                  <p className="text-[12px] text-[#8e8e93]">关闭后不显示滚动公告</p>
                </div>
                <input
                  type="checkbox"
                  checked={marqueeEnabled}
                  onChange={(event) => setMarqueeEnabled(event.target.checked)}
                  className="h-4 w-4 accent-[#007aff]"
                />
              </label>
              <div className="ios-list-row border-t border-[#f2f2f7] flex-col items-start gap-1.5">
                <label className="text-[12px] text-[#8e8e93]">
                  滚动一轮时长：<span className="font-mono text-[#007aff]">{Math.max(15, marqueeDuration)}s</span>
                </label>
                <input
                  type="range" min={15} max={180} step={5}
                  value={marqueeDuration}
                  onChange={(event) => setMarqueeDuration(Number(event.target.value))}
                  className="w-full accent-[#007aff]"
                  style={{ height: '4px' }}
                />
                <div className="flex justify-between w-full text-[10px] text-[#c7c7cc]">
                  <span>15s 较快</span><span>60s 推荐</span><span>180s 较慢</span>
                </div>
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7] flex-col items-start gap-1.5">
                <label className="text-[12px] text-[#8e8e93]">公告内容</label>
                <textarea
                  value={marqueeNotice}
                  onChange={(event) => setMarqueeNotice(event.target.value)}
                  className="tool-textarea min-h-20 px-3 py-2 text-[13px] w-full"
                  placeholder="输入顶部滚动公告内容"
                />
                <div className="flex justify-end w-full">
                  <button
                    onClick={handleMarqueeSave}
                    disabled={marqueeSaving}
                    className="tool-btn tool-btn-quiet h-7 px-3 text-[12px] disabled:opacity-40"
                  >
                    {marqueeSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    保存公告内容
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Supabase 数据库 ── */}
          <div className="space-y-1.5">
            <p className="ios-section-header">Supabase 数据库</p>
            <div className="ios-card-grouped">
              <div className="ios-list-row">
                <Database className="w-4 h-4 text-[#8e8e93] shrink-0" />
                <span className="text-[15px] text-[#1c1c1e] flex-1">Project URL</span>
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7]">
                <input
                  type="text"
                  value={sbUrl}
                  onChange={e => setSbUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co"
                  className="tool-input h-8 flex-1 px-2.5 text-[12px] font-mono"
                />
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7]">
                <span className="text-[15px] text-[#1c1c1e] flex-1">Anon / Public Key</span>
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7]">
                <input
                  type="password"
                  value={sbKey}
                  onChange={e => setSbKey(e.target.value)}
                  placeholder="eyJhbGciOi…"
                  className="tool-input h-8 flex-1 px-2.5 text-[12px] font-mono"
                />
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7] gap-2">
                <button
                  onClick={handleSbTest}
                  disabled={!sbUrl.trim() || !sbKey.trim() || sbTesting}
                  className="tool-btn tool-btn-quiet h-7 px-3 text-[12px] disabled:opacity-40"
                >
                  {sbTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  {sbTesting ? '检测中…' : '测试'}
                </button>
                <button
                  onClick={handleSbSave}
                  disabled={!sbUrl.trim() || !sbKey.trim()}
                  className={cn(
                    'tool-btn h-7 px-3 text-[12px] font-medium disabled:opacity-40',
                    sbSaved
                      ? 'border border-[#34c759]/30 bg-[#34c759]/10 text-[#34c759]'
                      : 'tool-btn-primary'
                  )}
                >
                  {sbSaved ? <><Check className="w-3.5 h-3.5" />已保存</> : <><Database className="w-3.5 h-3.5" />保存配置</>}
                </button>
                {sbTestResult !== 'idle' && (
                  <span className={cn('flex items-center gap-1 text-[12px]', sbTestResult === 'ok' ? 'text-[#34c759]' : 'text-[#ff3b30]')}>
                    {sbTestResult === 'ok' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {sbTestMsg}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── 保存 + 身份 + 退出 ── */}
          <div className="flex items-center gap-3 pb-6">
            <button
              onClick={handleSave}
              style={{ minWidth: '220px' }}
              className={cn(
                'ios-btn h-9 px-6 text-[15px] font-semibold',
                saved
                  ? 'border border-[#34c759]/30 bg-[#34c759]/10 text-[#34c759]'
                  : 'ios-btn-primary'
              )}
            >
              {saved ? <><Check className="w-4 h-4" />已保存</> : <><Settings className="w-4 h-4" />保存并应用</>}
            </button>
            <span className="text-[12px] text-[#8e8e93] ml-auto">
              {currentRole === 'admin' ? '🔑 管理员' : '👤 子账号'} · {settings.apiKey ? maskApiKey(settings.apiKey) : '未配置'}
            </span>
            <button
              onClick={() => { stopPolling(); updateSettings({ accessKey: undefined }); navigate(ROUTE_PATHS.LOGIN, { replace: true }); }}
              className="ios-btn ios-btn-destructive h-8 px-3 text-[13px]"
            >
              <LogOut className="w-3.5 h-3.5" />退出
            </button>
          </div>

        </div>
      ) : (
        <AdminPanel />
      )}
    </div>
  );
}
