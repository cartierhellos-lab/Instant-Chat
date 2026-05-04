import { useState } from 'react';
import { Smartphone, Zap, RefreshCw, Plus, Check, AlertCircle, ChevronRight, ArrowRightLeft, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAccountStore, useChatStore, useSettingsStore } from '@/hooks/useStore';
import { cn, MAX_SLOTS, statusColor, statusLabel } from '@/lib/index';
import type { PhoneBinding, TextNowAccount } from '@/lib/index';

// ─── IP 复制按钮 ──────────────────────────────────────────────────────────────
function IpCopyButton({ ip }: { ip: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ip).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center justify-center w-5 h-5 rounded hover:bg-primary/10 transition-colors shrink-0"
      title="复制 IP"
    >
      {copied
        ? <Check className="w-3 h-3 text-green-400" />
        : <Copy className="w-3 h-3 text-primary/60 hover:text-primary" />}
    </button>
  );
}


function SlotGrid({
  binding,
  accounts,
  availableAccounts,
  onAssign,
  onInject,
  onAutoAssign,
  injectingId,
}: {
  binding: PhoneBinding;
  accounts: TextNowAccount[];
  availableAccounts: TextNowAccount[];
  onAssign: (slot: number, accountId: string | null) => void;
  onInject: (slot: number) => void;
  onAutoAssign: () => void;
  injectingId: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-muted-foreground">
          {binding.slots.filter(Boolean).length}/{MAX_SLOTS} 槽位已分配 · 当前活跃: 槽{binding.activeSlot + 1}
        </span>
        <button
          onClick={onAutoAssign}
          disabled={availableAccounts.length === 0}
          className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-[10px] hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          自动补全
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: MAX_SLOTS }).map((_, slotIdx) => {
          const accountId = binding.slots[slotIdx];
          const acc = accountId ? accounts.find((a) => a.id === accountId) : null;
          const isActive = binding.activeSlot === slotIdx;
          const isInjecting = accountId && injectingId === accountId;

          return (
            <div
              key={slotIdx}
              className={cn(
                'relative rounded-lg border p-2 min-h-[72px] transition-all duration-150',
                isActive ? 'border-primary/60 bg-primary/8' : 'border-border bg-muted/30',
                !acc && 'border-dashed'
              )}
            >
              {/* Slot number */}
              <div className={cn('text-[9px] font-mono font-bold mb-1', isActive ? 'text-primary' : 'text-muted-foreground')}>
                #{slotIdx + 1}{isActive ? ' ●' : ''}
              </div>

              {acc ? (
                <>
                  <div className="text-[9px] font-mono text-foreground leading-tight truncate">{acc.phoneNumber}</div>
                  <div className={cn('text-[9px] mt-0.5', statusColor(acc.status))}>{statusLabel(acc.status)}</div>
                  <div className="flex gap-0.5 mt-1">
                    <button
                      onClick={() => onInject(slotIdx)}
                      disabled={isInjecting !== null && isInjecting !== false}
                      className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-primary/10 text-primary text-[9px] hover:bg-primary/20 transition-colors"
                      title="ADB注入"
                    >
                      {isInjecting ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
                    </button>
                    <button
                      onClick={() => onAssign(slotIdx, null)}
                      className="px-1 py-0.5 rounded bg-muted text-muted-foreground text-[9px] hover:bg-muted/80 transition-colors"
                      title="移除"
                    >✕</button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-10">
                  <select
                    onChange={(e) => e.target.value && onAssign(slotIdx, e.target.value)}
                    defaultValue=""
                    className="w-full text-[9px] bg-transparent text-muted-foreground border-none outline-none cursor-pointer"
                  >
                    <option value="">+ 分配</option>
                    {availableAccounts.slice(0, 50).map((a) => (
                      <option key={a.id} value={a.id}>{a.phoneNumber}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Phone Card
// ============================================================
function PhoneCard({ phoneId }: { phoneId: string }) {
  const { cloudPhones } = useChatStore();
  const { accounts, bindings, ensureBinding, assignToSlot, autoAssign, injectAccount, getBinding, advanceSlot, autoReplace } = useAccountStore();
  const { settings } = useSettingsStore();
  const [injectingId, setInjectingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [msg, setMsg] = useState('');

  const phone = cloudPhones.find((p) => p.id === phoneId);
  const binding = getBinding(phoneId) ?? { phoneId, slots: Array(MAX_SLOTS).fill(null) as (string | null)[], activeSlot: 0 };
  const assignedCount = binding.slots.filter(Boolean).length;
  const injectedCount = binding.slots.filter((s) => {
    if (!s) return false;
    return accounts.find((a) => a.id === s)?.injected ?? false;
  }).length;
  const availableAccounts = accounts.filter((a) => a.status === 'available');
  const slotAccounts = binding.slots.map((id) => accounts.find((a) => a.id === id));

  const handleInjectSlot = async (slot: number) => {
    const accId = binding.slots[slot];
    if (!accId || !settings.apiKey) return;
    setInjectingId(accId);
    const r = await injectAccount(phoneId, accId, settings.apiKey, settings.apiRegion, settings.adbCommandTemplate);
    setMsg(r.success ? `槽${slot + 1} 注入成功` : `槽${slot + 1} 注入失败: ${r.message}`);
    setInjectingId(null);
  };

  const handleInjectAll = async () => {
    if (!settings.apiKey) { setMsg('请先配置 API Key'); return; }
    let ok = 0;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const accId = binding.slots[i];
      if (!accId) continue;
      setInjectingId(accId);
      const r = await injectAccount(phoneId, accId, settings.apiKey, settings.apiRegion, settings.adbCommandTemplate);
      if (r.success) ok++;
      await new Promise((res) => setTimeout(res, 600));
    }
    setInjectingId(null);
    setMsg(`批量注入完成: ${ok}/${assignedCount} 成功`);
  };

  const handleAutoReplace = async () => {
    if (!settings.apiKey) { setMsg('请先配置 API Key'); return; }
    const r = await autoReplace(phoneId, settings.apiKey, settings.apiRegion, settings.adbCommandTemplate);
    setMsg(r.replaced ? `补号成功，已注入新账号` : '无可用账号可补充');
  };

  return (
    <motion.div layout className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/10 transition-colors"
        onClick={() => { ensureBinding(phoneId); setExpanded((p) => !p); }}
      >
        <div className={cn(
          'flex items-center justify-center w-9 h-9 rounded-xl shrink-0',
          phone?.status === 1 ? 'bg-green-400/10 border border-green-400/20' : 'bg-muted border border-border'
        )}>
          <Smartphone className={cn('w-4.5 h-4.5', phone?.status === 1 ? 'text-green-400' : 'text-muted-foreground')} size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground truncate">{phone?.name || phoneId}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-base font-bold text-primary leading-tight">
              {phone?.ip || '—'}
            </span>
            {phone?.ip && (
              <IpCopyButton ip={phone.ip} />
            )}
          </div>
          {phone?.os && <p className="text-[10px] text-muted-foreground mt-0.5">{phone.os}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0 text-[10px]">
          <span className="text-muted-foreground"><span className="font-bold text-foreground">{assignedCount}</span>/{MAX_SLOTS} 已分配</span>
          <span className="text-green-400"><span className="font-bold">{injectedCount}</span> 已注入</span>
          <ChevronRight className={cn('w-4 h-4 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
        </div>
      </div>

      {/* Expanded slots */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleInjectAll} disabled={assignedCount === 0 || !!injectingId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors disabled:opacity-50">
              {injectingId ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              批量注入全部
            </button>
            <button onClick={() => { ensureBinding(phoneId); const n = autoAssign(phoneId); setMsg(`自动分配了 ${n} 个账号`); }}
              disabled={availableAccounts.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-400/10 text-blue-400 text-xs hover:bg-blue-400/20 transition-colors disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" />
              自动分配
            </button>
            <button onClick={handleAutoReplace} disabled={!!injectingId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-400 text-xs hover:bg-amber-400/20 transition-colors disabled:opacity-50">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              自动补号
            </button>
            <button onClick={() => advanceSlot(phoneId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:bg-muted/80 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              切换活跃槽
            </button>
          </div>

          {msg && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs">
              <Check className="w-3 h-3 shrink-0" />
              {msg}
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

          {/* Slot summary */}
          <div className="grid grid-cols-5 gap-1 mt-1">
            {slotAccounts.map((acc, i) => (
              <div key={i} className={cn('text-center text-[9px] font-mono px-1 py-0.5 rounded', acc ? statusColor(acc.status) : 'text-muted-foreground/30')}>
                {acc ? (acc.injected ? '✓' : '◌') : '—'}
              </div>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground">✓ 已注入 ◌ 未注入 — 空槽</p>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================
// Phones Page
// ============================================================
export default function Phones() {
  const { cloudPhones, loadCloudPhones } = useChatStore();
  const { accounts } = useAccountStore();
  const { settings } = useSettingsStore();
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    if (!settings.apiKey) return;
    setLoading(true);
    await loadCloudPhones(settings.apiKey, settings.apiRegion);
    setLoading(false);
  };

  const totalSlots = cloudPhones.length * MAX_SLOTS;
  const usedSlots = accounts.filter((a) => a.assignedPhoneId).length;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card/30 shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 border border-primary/20">
          <Smartphone className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">设备绑定管理</h1>
          <p className="text-xs text-muted-foreground">
            {cloudPhones.length} 台设备 · {usedSlots}/{totalSlots} 槽位已分配
          </p>
        </div>
        <button onClick={handleRefresh} disabled={loading || !settings.apiKey}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs hover:bg-muted/80 transition-colors disabled:opacity-50">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          刷新设备
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {cloudPhones.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">暂无设备数据</p>
            <p className="text-xs text-muted-foreground/70 mt-1">请先在设置中配置 API Key，再点击"刷新设备"</p>
          </div>
        ) : (
          cloudPhones.map((phone) => <PhoneCard key={phone.id} phoneId={phone.id} />)
        )}
      </div>
    </div>
  );
}
