import { useState } from 'react';
import { Smartphone, Zap, RefreshCw, Plus, Check, ChevronRight, ArrowRightLeft, Copy, Server, RotateCw } from 'lucide-react';
import { useAccountStore, useChatStore, useSettingsStore } from '@/hooks/useStore';
import { cn, MAX_SLOTS, statusColor, statusLabel } from '@/lib/index';
import type { PhoneBinding, TextNowAccount } from '@/lib/index';

// ─── IP 复制按钮 ─────────────────────────────────────────────────────────────
function IpCopyButton({ ip }: { ip: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(ip).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={cn(
        'flex items-center justify-center w-6 h-6 rounded-full transition-colors shrink-0',
        copied ? 'bg-[#34c759]/15 text-[#34c759]' : 'hover:bg-[#f2f2f7] text-[#8e8e93]'
      )}
      title="复制 IP"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─── 槽位网格 ────────────────────────────────────────────────────────────────
function SlotGrid({ binding, accounts, availableAccounts, onAssign, onInject, onAutoAssign, injectingId }: {
  binding: PhoneBinding; accounts: TextNowAccount[]; availableAccounts: TextNowAccount[];
  onAssign: (slot: number, accountId: string | null) => void;
  onInject: (slot: number) => void; onAutoAssign: () => void; injectingId: string | null;
}) {
  const usedCount = binding.slots.filter(Boolean).length;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.02em] text-[#1f2328]">Slots</span>
          <span className="tool-chip">{usedCount}/{MAX_SLOTS}</span>
        </div>
        <button
          onClick={onAutoAssign}
          disabled={availableAccounts.length === 0}
          className="tool-btn tool-btn-quiet h-6 px-2 text-[10px] disabled:opacity-40"
        >
          <Plus className="w-3 h-3" />Auto Fill
        </button>
      </div>

      <div className="flex gap-1">
        {Array.from({ length: MAX_SLOTS }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              binding.slots[i]
                ? binding.activeSlot === i
                  ? 'bg-[#2563eb]'
                  : 'bg-[#93c5fd]'
                : 'bg-[#d7dbe2]'
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: MAX_SLOTS }).map((_, slotIdx) => {
          const accountId = binding.slots[slotIdx];
          const acc = accountId ? accounts.find(a => a.id === accountId) : null;
          const isActive = binding.activeSlot === slotIdx;
          const isInjecting = accountId && injectingId === accountId;
          return (
            <div
              key={slotIdx}
              className={cn(
                'min-h-[78px] rounded-[8px] border p-2 transition-all',
                isActive
                  ? 'border-[#8fb4ff] bg-[#eef5ff]'
                  : acc
                    ? 'border-[#d7dbe2] bg-white'
                    : 'border-dashed border-[#c7ccd6] bg-[#f6f7f9]'
              )}
            >
              <div className={cn(
                'mb-1 font-mono text-[9px] font-semibold',
                isActive ? 'text-[#2563eb]' : 'text-[#6b7280]'
              )}>
                #{slotIdx + 1}{isActive ? ' ▶' : ''}
              </div>
              {acc ? (
                <>
                  <div className="truncate font-mono text-[9px] leading-tight text-[#1f2328]">{acc.phoneNumber}</div>
                  <div className={cn('mt-0.5 text-[9px]', statusColor(acc.status))}>{statusLabel(acc.status)}</div>
                  <div className="mt-1.5 flex gap-1">
                    <button
                      onClick={() => onInject(slotIdx)}
                      disabled={!!injectingId}
                      className="tool-btn h-4 rounded-[4px] px-1 text-[9px] disabled:opacity-40"
                    >
                      {isInjecting ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Zap className="w-2 h-2" />}
                    </button>
                    <button
                      onClick={() => onAssign(slotIdx, null)}
                      className="h-4 rounded-[4px] border border-[#d7dbe2] bg-[#f3f4f6] px-1 text-[9px] text-[#6b7280] transition-colors hover:border-[#ef4444] hover:text-[#ef4444]"
                    >✕</button>
                  </div>
                </>
              ) : (
                <select
                  onChange={e => e.target.value && onAssign(slotIdx, e.target.value)}
                  defaultValue=""
                  className="mt-1 w-full cursor-pointer border-none bg-transparent text-[9px] text-[#6b7280] outline-none"
                >
                  <option value="">+ Assign</option>
                  {availableAccounts.slice(0, 50).map(a => (
                    <option key={a.id} value={a.id}>{a.phoneNumber}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 设备卡片 ─────────────────────────────────────────────────────────────────
function PhoneCard({ phoneId }: { phoneId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [injectingId, setInjectingId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const { accounts, assignToSlot, autoAssign } = useAccountStore();
  const { cloudPhones, ensureBinding, bindings, advanceSlot, autoReplace, injectAccount } = useChatStore();
  const { settings } = useSettingsStore();

  const phone = cloudPhones.find(p => p.id === phoneId);
  const binding: PhoneBinding = bindings[phoneId] ?? { phoneId, slots: Array(MAX_SLOTS).fill(null), activeSlot: 0, rotateCount: 0 };
  const availableAccounts = accounts.filter(a => a.status === 'available' && !a.assignedPhoneId);
  const assignedCount = binding.slots.filter(Boolean).length;
  const injectedCount = binding.slots.filter(id => {
    if (!id) return false;
    const a = accounts.find(x => x.id === id);
    return a?.status === 'active';
  }).length;

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
    <div className="tool-panel overflow-hidden animate-fade-up rounded-[10px]">
      <div
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
        onClick={() => { ensureBinding(phoneId); setExpanded(p => !p); }}
      >
        <div className="relative shrink-0">
          <div className={cn(
            'flex h-9 w-9 items-center justify-center rounded-[8px] border',
            phone?.status === 1 ? 'border-[#bfdac8] bg-[#eef8f1]' : 'border-[#d7dbe2] bg-[#f6f7f9]'
          )}>
            <Server className={cn('h-4 w-4', phone?.status === 1 ? 'text-[#1f8f4d]' : 'text-[#6b7280]')} />
          </div>
          <span className={cn(
            'ios-dot absolute -top-0.5 -right-0.5',
            phone?.status === 1 ? 'ios-dot-online' : 'ios-dot-offline'
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight text-[#1f2328]">
            {phone?.name || phoneId}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="font-mono text-[11px] text-[#6b7280]">{phone?.ip || '—'}</span>
            {phone?.ip && <IpCopyButton ip={phone.ip} />}
            {phone?.os && (
              <span className="tool-chip ml-1 text-[10px]">{phone.os}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right leading-tight">
            <p className="text-[11px] font-semibold text-[#1f2328]">{assignedCount}/{MAX_SLOTS}</p>
            <p className="text-[10px] text-[#6b7280]">{injectedCount} active</p>
          </div>
          <ChevronRight className={cn(
            'h-4 w-4 text-[#9ca3af] transition-transform duration-200',
            expanded && 'rotate-90'
          )} />
        </div>
      </div>

      {expanded && (
        <div className="animate-fade-up space-y-3 border-t border-[#e3e6eb] bg-[#fbfbfc] px-3 pb-3 pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: 'Inject All', icon: <Zap className="w-3 h-3" />, onClick: handleInjectAll, disabled: assignedCount === 0 || !!injectingId, cls: 'text-[#2563eb]' },
              { label: 'Auto Assign', icon: <Plus className="w-3 h-3" />, onClick: () => { const n = autoAssign(phoneId); setMsg(`Assigned ${n} account(s)`); }, disabled: availableAccounts.length === 0, cls: 'text-[#1f8f4d]' },
              { label: 'Replace', icon: <ArrowRightLeft className="w-3 h-3" />, onClick: handleAutoReplace, disabled: !!injectingId, cls: 'text-[#b45309]' },
              { label: 'Rotate', icon: <RotateCw className="w-3 h-3" />, onClick: () => advanceSlot(phoneId), disabled: false, cls: 'text-[#6b7280]' },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={btn.onClick}
                disabled={btn.disabled}
                className={cn('tool-btn tool-btn-quiet h-6 px-2 text-[10px] font-medium disabled:opacity-40', btn.cls)}
              >
                {injectingId && btn.label === 'Inject All'
                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                  : btn.icon}
                {btn.label}
              </button>
            ))}
          </div>

          {msg && (
            <div className="flex items-center gap-1.5 rounded-[7px] border border-[#bfdac8] bg-[#eef8f1] px-2.5 py-1.5 text-[11px] text-[#1f8f4d]">
              <Check className="w-3.5 h-3.5 shrink-0" />{msg}
            </div>
          )}

          <SlotGrid
            binding={binding}
            accounts={accounts}
            availableAccounts={availableAccounts}
            onAssign={(slot, accId) => assignToSlot(phoneId, slot, accId)}
            onInject={handleInjectSlot}
            onAutoAssign={() => { const n = autoAssign(phoneId); setMsg(`自动分配了 ${n} 个账号`); }}
            injectingId={injectingId}
          />
        </div>
      )}
    </div>
  );
}

// ─── 设备页 ───────────────────────────────────────────────────────────────────
export default function Phones() {
  const { cloudPhones, loadNumbers } = useChatStore();
  const { settings } = useSettingsStore();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f3f4f6]">
      <div className="tool-toolbar h-10 px-3 flex items-center gap-2 shrink-0">
        <div className="flex flex-1 items-center gap-2">
          <Smartphone className="h-4 w-4 text-[#2563eb]" />
          <span className="text-[13px] font-semibold tracking-[0.01em] text-[#1f2328]">Cloud Phones</span>
          <span className="tool-chip text-[10px]">{cloudPhones.length} devices</span>
        </div>
        <button
          onClick={() => loadNumbers(settings.apiKey, settings.apiRegion)}
          className="tool-btn tool-btn-quiet h-6 px-2 text-[10px]"
        >
          <RefreshCw className="h-3 w-3" />Refresh
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {cloudPhones.length === 0 ? (
          <div className="tool-empty">
            <Smartphone className="w-10 h-10 text-[#c7c7cc] mb-3" />
            <p className="text-[15px] font-medium text-[#6b7280]">No cloud phone devices yet</p>
            <p className="mt-1 text-[13px] text-[#9ca3af]">Configure the API key in Settings, then refresh.</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2.5">
            {cloudPhones.map(phone => (
              <PhoneCard key={phone.id} phoneId={phone.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
