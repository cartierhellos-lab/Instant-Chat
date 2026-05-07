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

// Admin tab content (restored from the original Admin.tsx behavior)
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
      toast({ title: 'Sub-account sync failed', description: (error as Error).message || 'The database is unavailable right now. Check the Supabase configuration.' });
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
      toast({ title: 'Sub-account created', description: `A new access key was generated for "${newName.trim()}".` });
    } catch (error) {
      toast({ title: 'Create failed', description: (error as Error).message || 'Database write failed. Check the Supabase configuration.' });
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
      toast({ title: 'Key regenerated', description: `A new key was generated for "${regenTarget.name}".` });
    } catch (error) {
      toast({ title: 'Reset failed', description: (error as Error).message || 'Database write failed.' });
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
      toast({ title: 'Assignments saved', description: `Resource assignments for "${selectedSub.name}" were updated.` });
    } catch (error) {
      toast({ title: 'Save failed', description: (error as Error).message || `Assignments for "${selectedSub.name}" could not be written to the database.` });
    } finally {
      setSaving(false);
    }
    setSelectedSub(null);
  };

  const toggleSel = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const syncChipCls = {
    ok: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    syncing: 'border border-sky-200 bg-sky-50 text-sky-700',
    offline: 'border border-amber-200 bg-amber-50 text-amber-700',
    idle: 'border border-slate-200 bg-slate-100 text-slate-500',
  }[syncStatus];

  return (
    <>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-80 shrink-0 border-r border-slate-200 bg-slate-50/70">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b border-slate-200 bg-white px-4 py-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Sub-account source</span>
              <div className="flex items-center gap-2">
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', syncChipCls)}>
                  {syncStatus === 'ok' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing' : syncStatus === 'offline' ? 'Database offline' : 'Idle'}
                </span>
                <button
                  type="button"
                  onClick={() => void refreshSubAccounts()}
                  disabled={syncStatus === 'syncing'}
                  className="tool-btn tool-btn-quiet h-6 px-2 text-[11px] disabled:opacity-40"
                >
                  <RefreshCw size={11} className={cn(syncStatus === 'syncing' && 'animate-spin')} />
                  Sync
                </button>
              </div>
            </div>

            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Create sub-account</p>
            <input
              className="tool-input h-8 px-3 text-[13px] mb-2"
              placeholder="Sub-account name (required)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="tool-input h-8 px-3 text-[13px] mb-3"
              placeholder="Notes (optional)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || saving}
              className="tool-btn tool-btn-primary h-8 w-full justify-center text-[13px] disabled:opacity-40"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              Generate key
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {syncStatus === 'syncing' && subAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                <RefreshCw size={22} className="text-[#c7c7cc] mb-2 animate-spin" />
                <p className="text-[12px] text-slate-500">Loading sub-accounts from the database…</p>
              </div>
            ) : subAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                <Users size={28} className="text-[#c7c7cc] mb-2" />
                <p className="text-[12px] text-[#8e8e93]">
                  {syncStatus === 'offline' ? 'Database offline. Sub-accounts are unavailable.' : 'No sub-accounts yet'}
                </p>
              </div>
            ) : (
              subAccounts.map((sub) => (
                <div
                  key={sub.id}
                  className={cn(
                    'cursor-pointer border-b border-slate-200 px-3 py-3 transition-colors',
                    selectedSub?.id === sub.id ? 'bg-sky-50' : 'bg-white hover:bg-slate-50'
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
                          toast({ title: 'Sub-account deleted', description: `"${sub.name}" was removed.` });
                        } catch (error) {
                          toast({ title: 'Delete failed', description: (error as Error).message || `"${sub.name}" could not be deleted from the database.` });
                        } finally {
                          setSaving(false); }
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
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
                      title="Copy key"
                    >
                      {copiedId === sub.id + '-key' ? <Check size={11} className="text-[#34c759]" /> : <Copy size={11} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRegenKey(sub); }}
                      className="shrink-0 text-[#c7c7cc] hover:text-[#ff9500] transition-colors"
                      title="Regenerate key"
                    >
                      <RefreshCw size={11} />
                    </button>
                  </div>
                  <div className="flex gap-3 mt-1.5 text-[11px] text-[#8e8e93]">
                    <span className="flex items-center gap-1"><Smartphone size={10} /> {sub.assignedPhoneIds.length} devices</span>
                    <span className="flex items-center gap-1"><Users size={10} /> {sub.assignedAccountIds.length} accounts</span>
                  </div>
                  <p className="text-[10px] text-[#c7c7cc] mt-0.5">{formatTime(sub.createdAt)}</p>
                </div>
              ))
            )}
          </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-5">
          {!selectedSub ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-3">
                <ShieldCheck size={28} className="text-[#c7c7cc]" />
              </div>
              <p className="text-[15px] font-medium text-slate-500">Select a sub-account</p>
              <p className="mt-1 text-[13px] text-slate-400">Assign devices and account resources from the list on the left.</p>
            </div>
          ) : (
            <div className="max-w-2xl space-y-4">
              <div className="tool-panel flex items-center gap-3 p-4">
                <div className="w-10 h-10 rounded-[10px] bg-[#007aff]/10 flex items-center justify-center shrink-0">
                  <User size={18} className="text-[#007aff]" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[#1c1c1e]">{selectedSub.name}</p>
                  {selectedSub.note && <p className="text-[12px] text-[#8e8e93]">{selectedSub.note}</p>}
                </div>
              </div>

              <div className="tool-tabs inline-flex gap-1 p-1">
                {(['phones', 'accounts'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAssignMode(mode)}
                    className={cn(
                      'tool-tab h-8 px-3 text-[12px] font-medium',
                      assignMode === mode ? 'tool-tab-active' : ''
                    )}
                  >
                    {mode === 'phones' ? <Smartphone size={13} /> : <Users size={13} />}
                    {mode === 'phones' ? 'Assign devices' : 'Assign accounts'}
                  </button>
                ))}
              </div>

              <div className="tool-panel overflow-hidden p-0">
                {assignMode === 'phones' ? (
                  cloudPhones.length === 0 ? (
                    <p className="px-4 py-3 text-[13px] italic text-slate-500">No devices available</p>
                  ) : cloudPhones.map((phone, idx) => {
                    const checked = phoneSelections.includes(phone.id);
                    return (
                      <label
                        key={phone.id}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                          idx > 0 && 'border-t border-slate-200',
                          checked ? 'bg-sky-50' : 'hover:bg-slate-50'
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
                    <p className="px-4 py-3 text-[13px] italic text-slate-500">No accounts available. Import them on the Accounts page first.</p>
                  ) : accounts.slice(0, 100).map((acc, idx) => {
                    const checked = accountSelections.includes(acc.id);
                    return (
                      <label
                        key={acc.id}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                          idx > 0 && 'border-t border-slate-200',
                          checked ? 'bg-sky-50' : 'hover:bg-slate-50'
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
                className="tool-btn tool-btn-primary h-9 w-full justify-center text-[14px] font-medium disabled:opacity-40"
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Save assignments
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!regenTarget}
        onOpenChange={(open) => !open && setRegenTarget(null)}
        title="Regenerate this sub-account key?"
        description={`After regeneration, the old key for "${regenTarget?.name ?? ''}" will stop working immediately.`}
        confirmText="Regenerate"
        cancelText="Cancel"
        destructive
        onConfirm={confirmRegenKey}
      />
    </>
  );
}

// Main settings page
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
      setTestResult('ok'); setTestMsg(`Connected successfully. Retrieved ${numbers.length} cloud numbers.`);
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
      toast({ title: 'Notice updated', description: 'The top scrolling notice has been saved.' });
    } finally { setMarqueeSaving(false); }
  };

  const isAdmin = currentRole === 'admin';

  // Connection state styling
  const connStatusCls = lastError
    ? 'border-[#ff3b30]/30 bg-[#ff3b30]/5 text-[#ff3b30]'
    : cloudNumbers.length > 0
      ? 'border-[#34c759]/30 bg-[#34c759]/5 text-[#34c759]'
      : 'border-[#e5e5ea] bg-white text-[#8e8e93]';

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50">
      <div className="tool-toolbar h-11 shrink-0 px-4">
        <div className="flex flex-1 items-center gap-3">
          <span className="text-[16px] font-semibold tracking-tight text-slate-900">Settings</span>
          <div className="tool-tabs ml-auto flex items-center gap-1 p-1">
          {(['general', ...(isAdmin ? ['admin'] : [])] as ('general' | 'admin')[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'tool-tab h-7 px-3 text-[12px] font-medium',
                activeTab === tab ? 'tool-tab-active' : ''
              )}
            >
              {tab === 'admin' && <ShieldCheck size={11} />}
              {tab === 'general' ? 'General' : 'Admin'}
            </button>
          ))}
          </div>
        </div>
      </div>

      {activeTab === 'general' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-6">

          <div className={cn('flex items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px]', connStatusCls)}>
            {lastError
              ? <WifiOff className="w-4 h-4 shrink-0" />
              : cloudNumbers.length > 0
                ? <Wifi className="w-4 h-4 shrink-0" />
                : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="font-medium">
              {lastError ? 'Connection failed' : cloudNumbers.length > 0 ? `Connected · ${cloudNumbers.length} numbers` : 'Not connected'}
            </span>
            {lastError && <span className="ml-1 font-mono text-[11px] truncate">{lastError}</span>}
            {!lastError && settings.apiKey && cloudNumbers.length > 0 && (
              <span className="ml-1 font-mono text-[11px] opacity-70">{maskApiKey(settings.apiKey)} · {settings.apiRegion === 'cn' ? 'China' : 'Global'}</span>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="ios-section-header">API key</p>
            <div className="tool-panel overflow-hidden p-0">
              <div className="ios-list-row">
                <Key className="w-4 h-4 text-[#8e8e93] shrink-0" />
                <label className="text-[15px] text-[#1c1c1e] flex-1">CartierMiller API Key</label>
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7]">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Paste API key…"
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
                  {testing ? 'Testing…' : 'Test connection'}
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

          <div className="space-y-1.5">
            <p className="ios-section-header">Connection settings</p>
            <div className="tool-panel overflow-hidden p-0">
              <div className="ios-list-row">
                <Globe className="w-4 h-4 text-[#8e8e93] shrink-0" />
                <span className="text-[15px] text-[#1c1c1e] flex-1">API region</span>
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
                      {r === 'cn' ? '🇨🇳 China' : '🌐 Global'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7] flex-col items-start gap-1.5">
                <label className="text-[13px] text-[#8e8e93]">
                  Poll interval: <span className="font-mono text-[#007aff]">{pollInterval}s</span>
                </label>
                <input
                  type="range" min={3} max={60} step={1}
                  value={pollInterval}
                  onChange={e => setPollInterval(Number(e.target.value))}
                  className="w-full accent-[#007aff]"
                  style={{ height: '4px' }}
                />
                <div className="flex justify-between w-full text-[10px] text-[#c7c7cc]">
                  <span>3s high</span><span>Recommended 5–10s</span><span>60s low</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="ios-section-header">Translation engine</p>
            <div className="tool-panel overflow-hidden p-0">
              <div className="ios-list-row">
                <Languages className="w-4 h-4 text-[#8e8e93] shrink-0" />
                <span className="text-[15px] text-[#1c1c1e] flex-1">Engine</span>
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
                    <label className="text-[12px] text-[#8e8e93]">Ollama URL</label>
                    <input
                      value={ollamaUrl}
                      onChange={e => setOllamaUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="tool-input h-8 w-full px-2.5 text-[12px] font-mono"
                    />
                  </div>
                  <div className="ios-list-row border-t border-[#f2f2f7] flex-col items-start gap-1.5">
                    <label className="text-[12px] text-[#8e8e93]">Translation model</label>
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
                        setOllamaTestMsg(r.ok ? `Connected successfully, ${r.models.length} models found` : r.error ?? 'Connection failed');
                        if (r.ok) setOllamaModels(r.models);
                        setOllamaTesting(false);
                      }}
                      disabled={ollamaTesting}
                      className="tool-btn tool-btn-quiet h-7 px-3 text-[12px] disabled:opacity-40"
                    >
                      {ollamaTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                      {ollamaTesting ? 'Testing…' : 'Test Ollama'}
                    </button>
                    {ollamaTestResult !== 'idle' && (
                      <span className={cn('flex items-center gap-1 text-[12px]', ollamaTestResult === 'ok' ? 'text-[#34c759]' : 'text-[#ff3b30]')}>
                        {ollamaTestResult === 'ok' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        {ollamaTestMsg}
                      </span>
                    )}
                  </div>
                  <div className="ios-list-row border-t border-[#f2f2f7]">
                    <p className="text-[11px] text-[#8e8e93]">Automatically falls back to MyMemory when Ollama is unavailable.</p>
                  </div>
                </>
              )}
              {translateEngine === 'mymemory' && (
                <div className="ios-list-row border-t border-[#f2f2f7]">
                  <p className="text-[12px] text-[#8e8e93]">Free online translation with no local setup required.</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="ios-section-header">Top marquee</p>
            <div className="tool-panel overflow-hidden p-0">
              <label className="ios-list-row cursor-pointer">
                <div className="flex-1">
                  <p className="text-[15px] text-[#1c1c1e]">Show top marquee</p>
                  <p className="text-[12px] text-[#8e8e93]">Disable this to hide the scrolling notice.</p>
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
                  Loop duration: <span className="font-mono text-[#007aff]">{Math.max(15, marqueeDuration)}s</span>
                </label>
                <input
                  type="range" min={15} max={180} step={5}
                  value={marqueeDuration}
                  onChange={(event) => setMarqueeDuration(Number(event.target.value))}
                  className="w-full accent-[#007aff]"
                  style={{ height: '4px' }}
                />
                <div className="flex justify-between w-full text-[10px] text-[#c7c7cc]">
                  <span>15s fast</span><span>60s recommended</span><span>180s slow</span>
                </div>
              </div>
              <div className="ios-list-row border-t border-[#f2f2f7] flex-col items-start gap-1.5">
                <label className="text-[12px] text-[#8e8e93]">Notice content</label>
                <textarea
                  value={marqueeNotice}
                  onChange={(event) => setMarqueeNotice(event.target.value)}
                  className="tool-textarea min-h-20 px-3 py-2 text-[13px] w-full"
                  placeholder="Enter the scrolling message shown at the top"
                />
                <div className="flex justify-end w-full">
                  <button
                    onClick={handleMarqueeSave}
                    disabled={marqueeSaving}
                    className="tool-btn tool-btn-quiet h-7 px-3 text-[12px] disabled:opacity-40"
                  >
                    {marqueeSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save notice
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="ios-section-header">Supabase</p>
            <div className="tool-panel overflow-hidden p-0">
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
                  {sbTesting ? 'Testing…' : 'Test'}
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
                  {sbSaved ? <><Check className="w-3.5 h-3.5" />Saved</> : <><Database className="w-3.5 h-3.5" />Save config</>}
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

          <div className="flex items-center gap-3 pb-2">
            <button
              onClick={handleSave}
              style={{ minWidth: '220px' }}
              className={cn(
                'tool-btn h-9 px-6 text-[14px] font-semibold',
                saved
                  ? 'border border-[#34c759]/30 bg-[#34c759]/10 text-[#34c759]'
                  : 'tool-btn-primary'
              )}
            >
              {saved ? <><Check className="w-4 h-4" />Saved</> : <><Settings className="w-4 h-4" />Save and apply</>}
            </button>
            <span className="text-[12px] text-[#8e8e93] ml-auto">
              {currentRole === 'admin' ? '🔑 Admin' : '👤 Sub-account'} · {settings.apiKey ? maskApiKey(settings.apiKey) : 'Not configured'}
            </span>
            <button
              onClick={() => { stopPolling(); updateSettings({ accessKey: undefined }); navigate(ROUTE_PATHS.LOGIN, { replace: true }); }}
              className="tool-btn h-8 border border-rose-200 bg-rose-50 px-3 text-[13px] text-rose-700 hover:bg-rose-100"
            >
              <LogOut className="w-3.5 h-3.5" />Sign out
            </button>
          </div>
          </div>
        </div>
      ) : (
        <AdminPanel />
      )}
    </div>
  );
}
