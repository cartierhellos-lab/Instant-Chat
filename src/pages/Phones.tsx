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
    <div className="space-y-3">
      {/* 槽位标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#1c1c1e]">槽位分配</span>
          <span className="ios-badge">{usedCount}/{MAX_SLOTS}</span>
        </div>
        <button
          onClick={onAutoAssign}
          disabled={availableAccounts.length === 0}
          className="tool-btn tool-btn-quiet text-[11px] h-6 px-2.5 disabled:opacity-40"
        >
          <Plus className="w-3 h-3" />自动补全
        </button>
      </div>

      {/* 进度条 */}
      <div className="flex gap-1">
        {Array.from({ length: MAX_SLOTS }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 h-1.5 rounded-full transition-colors',
              binding.slots[i]
                ? binding.activeSlot === i
                  ? 'bg-[#007aff]'
                  : 'bg-[#007aff]/40'
                : 'bg-[#e5e5ea]'
            )}
          />
        ))}
      </div>

      {/* 槽位网格 */}
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
                'rounded-[10px] border p-2 min-h-[72px] transition-all',
                isActive
                  ? 'border-[#007aff]/40 bg-[#007aff]/5'
                  : acc
                    ? 'border-[#e5e5ea] bg-white'
                    : 'border-dashed border-[#c7c7cc] bg-[#f9f9fb]'
              )}
            >
              <div className={cn(
                'text-[9px] font-mono font-semibold mb-1.5',
                isActive ? 'text-[#007aff]' : 'text-[#8e8e93]'
              )}>
                #{slotIdx + 1}{isActive ? ' ▶' : ''}
              </div>
              {acc ? (
                <>
                  <div className="text-[9px] font-mono text-[#1c1c1e] leading-tight truncate">{acc.phoneNumber}</div>
                  <div className={cn('text-[9px] mt-0.5', statusColor(acc.status))}>{statusLabel(acc.status)}</div>
                  <div className="flex gap-0.5 mt-1.5">
                    <button
                      onClick={() => onInject(slotIdx)}
                      disabled={!!injectingId}
                      className="tool-btn h-4 px-1 text-[9px] disabled:opacity-40 rounded-[5px]"
                    >
                      {isInjecting ? <RefreshCw className="w-2 h-2 animate-spin" /> : <Zap className="w-2 h-2" />}
                    </button>
                    <button
                      onClick={() => onAssign(slotIdx, null)}
                      className="h-4 px-1 rounded-[5px] border border-[#e5e5ea] bg-[#f2f2f7] text-[9px] text-[#8e8e93] hover:border-[#ff3b30] hover:text-[#ff3b30] transition-colors"
                    >✕</button>
                  </div>
                </>
              ) : (
                <select
                  onChange={e => e.target.value && onAssign(slotIdx, e.target.value)}
                  defaultValue=""
                  className="w-full text-[9px] text-[#8e8e93] bg-transparent border-none outline-none cursor-pointer mt-1"
                >
                  <option value="">+ 分配</option>
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
    <div className="ios-card overflow-hidden animate-fade-up">
      {/* 卡片头部 */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => { ensureBinding(phoneId); setExpanded(p => !p); }}
      >
        {/* 状态点 + 图标 */}
        <div className="relative shrink-0">
          <div className={cn(
            'w-10 h-10 rounded-[10px] flex items-center justify-center',
            phone?.status === 1 ? 'bg-[#34c759]/10' : 'bg-[#f2f2f7]'
          )}>
            <Smartphone className={cn('w-5 h-5', phone?.status === 1 ? 'text-[#34c759]' : 'text-[#8e8e93]')} />
          </div>
          <span className={cn(
            'ios-dot absolute -top-0.5 -right-0.5',
            phone?.status === 1 ? 'ios-dot-online' : 'ios-dot-offline'
          )} />
        </div>

        {/* 主机名 + IP */}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#1c1c1e] truncate leading-tight">
            {phone?.name || phoneId}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="font-mono text-[13px] text-[#8e8e93]">{phone?.ip || '—'}</span>
            {phone?.ip && <IpCopyButton ip={phone.ip} />}
            {phone?.os && (
              <span className="tool-chip text-[11px] ml-1">{phone.os}</span>
            )}
          </div>
        </div>

        {/* 右侧统计 + 展开 */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-[12px] font-semibold text-[#1c1c1e]">{assignedCount}/{MAX_SLOTS}</p>
            <p className="text-[11px] text-[#8e8e93]">{injectedCount} 注入</p>
          </div>
          <ChevronRight className={cn(
            'w-4 h-4 text-[#c7c7cc] transition-transform duration-200',
            expanded && 'rotate-90'
          )} />
        </div>
      </div>

      {/* 展开区域 */}
      {expanded && (
        <div className="border-t border-[#f2f2f7] px-4 pb-4 pt-3 space-y-3 bg-[#fafafa] animate-fade-up">
          {/* 操作按钮组 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { label: '批量注入', icon: <Zap className="w-3 h-3" />, onClick: handleInjectAll, disabled: assignedCount === 0 || !!injectingId, cls: 'text-[#007aff]' },
              { label: '自动分配', icon: <Plus className="w-3 h-3" />, onClick: () => { const n = autoAssign(phoneId); setMsg(`自动分配了 ${n} 个账号`); }, disabled: availableAccounts.length === 0, cls: 'text-[#34c759]' },
              { label: '自动补号', icon: <ArrowRightLeft className="w-3 h-3" />, onClick: handleAutoReplace, disabled: !!injectingId, cls: 'text-[#ff9500]' },
              { label: '切换槽位', icon: <RefreshCw className="w-3 h-3" />, onClick: () => advanceSlot(phoneId), disabled: false, cls: 'text-[#8e8e93]' },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={btn.onClick}
                disabled={btn.disabled}
                className={cn('tool-btn tool-btn-quiet h-7 px-2.5 text-[11px] font-medium disabled:opacity-40', btn.cls)}
              >
                {injectingId && btn.label === '批量注入'
                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                  : btn.icon}
                {btn.label}
              </button>
            ))}
          </div>

          {/* 操作反馈 */}
          {msg && (
            <div className="flex items-center gap-1.5 text-[12px] text-[#34c759] bg-[#34c759]/8 border border-[#34c759]/20 rounded-[8px] px-3 py-1.5">
              <Check className="w-3.5 h-3.5 shrink-0" />{msg}
            </div>
          )}

          {/* 槽位网格 */}
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
    <div className="flex flex-col h-full overflow-hidden bg-[#f2f2f7]">
      {/* 工具栏 */}
      <div className="tool-toolbar h-11 px-4 flex items-center gap-2 shrink-0">
        <span className="text-[17px] font-semibold text-[#1c1c1e] flex-1">云手机</span>
        <span className="text-[13px] text-[#8e8e93]">{cloudPhones.length} 台设备</span>
        <button
          onClick={() => loadNumbers(settings.apiKey, settings.apiRegion)}
          className="tool-btn tool-btn-quiet h-7 px-2.5 text-[12px]"
        >
          <RefreshCw className="w-3.5 h-3.5" />刷新
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-4">
        {cloudPhones.length === 0 ? (
          <div className="tool-empty">
            <Smartphone className="w-10 h-10 text-[#c7c7cc] mb-3" />
            <p className="text-[15px] font-medium text-[#8e8e93]">暂无云手机设备</p>
            <p className="text-[13px] text-[#c7c7cc] mt-1">请在设置页配置 API Key 后刷新</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {cloudPhones.map(phone => (
              <PhoneCard key={phone.id} phoneId={phone.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
