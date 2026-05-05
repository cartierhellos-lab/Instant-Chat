import { useState } from 'react';
import { Smartphone, Zap, RefreshCw, Plus, Check, AlertCircle, ChevronRight, ArrowRightLeft, Copy } from 'lucide-react';
import { useAccountStore, useChatStore, useSettingsStore } from '@/hooks/useStore';
import { cn, MAX_SLOTS, statusColor, statusLabel } from '@/lib/index';
import type { PhoneBinding, TextNowAccount } from '@/lib/index';

// ─── IP 复制按钮 ─────────────────────────────────────────────────────────────
function IpCopyButton({ ip }: { ip: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(ip).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center justify-center w-5 h-5 rounded hover:bg-white/80 transition-colors shrink-0"
      title="复制 IP"
    >
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
    </button>
  );
}

// ─── 槽位网格 ────────────────────────────────────────────────────────────────
function SlotGrid({ binding, accounts, availableAccounts, onAssign, onInject, onAutoAssign, injectingId }: {
  binding: PhoneBinding; accounts: TextNowAccount[]; availableAccounts: TextNowAccount[];
  onAssign: (slot: number, accountId: string | null) => void;
  onInject: (slot: number) => void; onAutoAssign: () => void; injectingId: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {binding.slots.filter(Boolean).length}/{MAX_SLOTS} 槽位已分配 · 活跃: 槽{binding.activeSlot + 1}
        </span>
        <button onClick={onAutoAssign} disabled={availableAccounts.length === 0}
          className="tool-btn h-5 px-2 text-[10px] disabled:opacity-40">
          <Plus className="w-3 h-3" />自动补全
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: MAX_SLOTS }).map((_, slotIdx) => {
          const accountId = binding.slots[slotIdx];
          const acc = accountId ? accounts.find(a => a.id === accountId) : null;
          const isActive = binding.activeSlot === slotIdx;
          const isInjecting = accountId && injectingId === accountId;
          return (
            <div key={slotIdx} className={cn(
              'rounded border p-1.5 min-h-[68px] transition-colors',
              isActive ? 'border-primary bg-[linear-gradient(180deg,#edf5ff_0%,#e6f0fd_100%)]' : 'border-[#dbe2e9] bg-white',
              !acc && 'border-dashed'
            )}>
              <div className={cn('text-[9px] font-mono font-semibold mb-1', isActive ? 'text-primary' : 'text-muted-foreground/60')}>
                #{slotIdx + 1}{isActive ? ' ▶' : ''}
              </div>
              {acc ? (
                <>
                  <div className="text-[9px] font-mono text-foreground leading-tight truncate">{acc.phoneNumber}</div>
                  <div className={cn('text-[9px] mt-0.5', statusColor(acc.status))}>{statusLabel(acc.status)}</div>
                  <div className="flex gap-0.5 mt-1">
                    <button onClick={() => onInject(slotIdx)} disabled={!!injectingId}
                      className="tool-btn h-4 px-1 text-[9px] disabled:opacity-40">
                      {isInjecting ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Zap className="w-2 h-2" />}
                    </button>
                    <button onClick={() => onAssign(slotIdx, null)}
                      className="h-4 px-1 rounded-[5px] border border-[#dbe2e9] bg-[#f5f7fa] text-[9px] text-muted-foreground hover:border-red-400 hover:text-red-500 transition-colors">✕</button>
                  </div>
                </>
              ) : (
                <select onChange={e => e.target.value && onAssign(slotIdx, e.target.value)} defaultValue=""
                  className="w-full text-[9px] text-muted-foreground bg-transparent border-none outline-none cursor-pointer mt-1">
                  <option value="">+ 分配</option>
                  {availableAccounts.slice(0, 50).map(a => <option key={a.id} value={a.id}>{a.phoneNumber}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 设备卡片 ────────────────────────────────────────────────────────────────
function PhoneCard({ phoneId }: { phoneId: string }) {
  const { cloudPhones } = useChatStore();
  const { accounts, ensureBinding, assignToSlot, autoAssign, injectAccount, getBinding, advanceSlot, autoReplace } = useAccountStore();
  const { settings } = useSettingsStore();
  const [injectingId, setInjectingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [msg, setMsg] = useState('');

  const phone = cloudPhones.find(p => p.id === phoneId);
  const binding = getBinding(phoneId) ?? { phoneId, slots: Array(MAX_SLOTS).fill(null) as (string | null)[], activeSlot: 0 };
  const assignedCount = binding.slots.filter(Boolean).length;
  const injectedCount = binding.slots.filter(s => s && (accounts.find(a => a.id === s)?.injected ?? false)).length;
  const availableAccounts = accounts.filter(a => a.status === 'available');

  const handleInjectAll = async () => {
    if (!settings.apiKey) { setMsg('请先配置 API Key'); return; }
    let ok = 0;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const accId = binding.slots[i];
      if (!accId) continue;
      setInjectingId(accId);
      const r = await injectAccount(phoneId, accId, settings.apiKey, settings.apiRegion, settings.adbCommandTemplate);
      if (r.success) ok++;
      await new Promise(res => setTimeout(res, 600));
    }
    setInjectingId(null);
    setMsg(`批量注入完成: ${ok}/${assignedCount} 成功`);
  };

  const handleInjectSlot = async (slot: number) => {
    const accId = binding.slots[slot];
    if (!accId || !settings.apiKey) return;
    setInjectingId(accId);
    const r = await injectAccount(phoneId, accId, settings.apiKey, settings.apiRegion, settings.adbCommandTemplate);
    setMsg(r.success ? `槽${slot + 1} 注入成功` : `槽${slot + 1} 注入失败: ${r.message}`);
    setInjectingId(null);
  };

  const handleAutoReplace = async () => {
    if (!settings.apiKey) { setMsg('请先配置 API Key'); return; }
    const r = await autoReplace(phoneId, settings.apiKey, settings.apiRegion, settings.adbCommandTemplate);
    setMsg(r.replaced ? '补号成功，已注入新账号' : '无可用账号可补充');
  };

  return (
    <div className="tool-panel overflow-hidden">
      {/* 行头 */}
      <div className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/70 transition-colors border-b border-[#ebebeb]"
        onClick={() => { ensureBinding(phoneId); setExpanded(p => !p); }}>
        <Smartphone className={cn('w-4 h-4 shrink-0', phone?.status === 1 ? 'text-green-600' : 'text-muted-foreground/40')} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground truncate">{phone?.name || phoneId}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[15px] font-bold text-foreground leading-none">{phone?.ip || '—'}</span>
            {phone?.ip && <IpCopyButton ip={phone.ip} />}
          </div>
          {phone?.os && <p className="text-[9px] text-muted-foreground mt-0.5">{phone.os}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono">
          <span><span className="font-semibold text-foreground">{assignedCount}</span>/{MAX_SLOTS} 分配</span>
          <span className="text-green-600"><span className="font-semibold">{injectedCount}</span> 注入</span>
          <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
        </div>
      </div>

      {/* 展开区 */}
      {expanded && (
        <div className="px-3 py-3 space-y-3 bg-[linear-gradient(180deg,#fbfcfe_0%,#f4f7fa_100%)]">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { label: '批量注入', icon: <Zap className="w-3 h-3" />, onClick: handleInjectAll, disabled: assignedCount === 0 || !!injectingId, color: 'text-primary' },
              { label: '自动分配', icon: <Plus className="w-3 h-3" />, onClick: () => { const n = autoAssign(phoneId); setMsg(`自动分配了 ${n} 个账号`); }, disabled: availableAccounts.length === 0, color: 'text-blue-600' },
              { label: '自动补号', icon: <ArrowRightLeft className="w-3 h-3" />, onClick: handleAutoReplace, disabled: !!injectingId, color: 'text-amber-600' },
              { label: '切换槽位', icon: <RefreshCw className="w-3 h-3" />, onClick: () => advanceSlot(phoneId), disabled: false, color: 'text-foreground/60' },
            ].map(btn => (
              <button key={btn.label} onClick={btn.onClick} disabled={btn.disabled}
                className={cn('tool-btn h-6 px-2.5 text-[10px] font-medium disabled:opacity-40', btn.color)}>
                {injectingId && btn.label === '批量注入' ? <RefreshCw className="w-3 h-3 animate-spin" /> : btn.icon}
                {btn.label}
              </button>
            ))}
          </div>
          {msg && (
            <div className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
              <Check className="w-3 h-3 shrink-0" />{msg}
            </div>
          )}
          <SlotGrid binding={binding} accounts={accounts} availableAccounts={availableAccounts}
            onAssign={(slot, accId) => assignToSlot(phoneId, slot, accId)}
            onInject={handleInjectSlot}
            onAutoAssign={() => { const n = autoAssign(phoneId); setMsg(`自动分配了 ${n} 个账号`); }}
            injectingId={injectingId} />
        </div>
      )}
    </div>
  );
}

// ─── 设备页 ──────────────────────────────────────────────────────────────────
export default function Phones() {
  const { cloudPhones, loadCloudPhones } = useChatStore();
  const { accounts } = useAccountStore();
  const { settings } = useSettingsStore();
  const [loading, setLoading] = useState(false);

  const totalSlots = cloudPhones.length * MAX_SLOTS;
  const usedSlots = accounts.filter(a => a.assignedPhoneId).length;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-transparent">
      {/* 工具栏 */}
      <div className="tool-toolbar flex items-center gap-3 px-4 py-2 shrink-0">
        <Smartphone className="w-4 h-4 text-muted-foreground" />
        <span className="text-[12px] font-semibold text-foreground">设备管理</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {cloudPhones.length} 台 · {usedSlots}/{totalSlots} 槽位
        </span>
        <button onClick={async () => { if (!settings.apiKey) return; setLoading(true); await loadCloudPhones(settings.apiKey, settings.apiRegion); setLoading(false); }}
          disabled={loading || !settings.apiKey}
          className="tool-btn ml-auto h-6 px-2.5 text-[10px] disabled:opacity-40">
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />刷新
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {cloudPhones.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-[12px] text-muted-foreground">暂无设备数据</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">请配置 API Key 后点击刷新</p>
          </div>
        ) : cloudPhones.map(phone => <PhoneCard key={phone.id} phoneId={phone.id} />)}
      </div>
    </div>
  );
}
