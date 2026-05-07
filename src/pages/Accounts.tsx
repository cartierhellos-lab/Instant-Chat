import { useState, useRef } from 'react';
import { Upload, Users, Trash2, RefreshCw, Search, Download, CheckSquare, Square, Zap, AlertCircle, Check, Terminal } from 'lucide-react';
import { useAccountStore, useChatStore, useSettingsStore } from '@/hooks/useStore';
import { parseTxtAccounts } from '@/api/duoplus';
import { cn, formatTime, DEFAULT_ADB_TEMPLATE } from '@/lib/index';
import type { AccountStatus, TextNowAccount } from '@/lib/index';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';

const STATUS_FILTERS: { label: string; value: AccountStatus | 'all' }[] = [
  { label: '全部', value: 'all' }, { label: '可用', value: 'available' },
  { label: '已分配', value: 'assigned' }, { label: '使用中', value: 'active' },
  { label: '已封禁', value: 'banned' }, { label: '冷却中', value: 'cooling' },
];

const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  available: '可用',
  assigned: '已分配',
  active: '使用中',
  banned: '已封禁',
  cooling: '冷却中',
  injecting: 'ADB注入中',
};

// ─── 状态配色 ─────────────────────────────────────────────────────────────────
function statusChipClass(status: AccountStatus): string {
  switch (status) {
    case 'available': return 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25';
    case 'banned':    return 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/25';
    case 'active':    return 'bg-[#007aff]/10 text-[#007aff] border-[#007aff]/25';
    case 'assigned':  return 'bg-[#007aff]/8 text-[#007aff]/80 border-[#007aff]/20';
    case 'injecting': return 'bg-[#ff9500]/10 text-[#ff9500] border-[#ff9500]/25';
    default:          return 'bg-[#f2f2f7] text-[#8e8e93] border-[#e5e5ea]';
  }
}

// ─── 导入面板 ────────────────────────────────────────────────────────────────
function ImportPanel({ onImported }: { onImported: (added: number, dup: number) => void }) {
  const { importAccounts } = useAccountStore();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ added: number; duplicate: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = () => {
    if (!text.trim()) return;
    const raws = parseTxtAccounts(text);
    const r = importAccounts(raws);
    setResult(r);
    onImported(r.added, r.duplicate);
    if (r.added > 0) setText('');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setText((ev.target?.result as string) || '');
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="tool-panel rounded-[10px] p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#1f2328]">批量导入</span>
        <button onClick={() => fileRef.current?.click()} className="tool-btn tool-btn-quiet h-6 px-2 text-[10px]">
          <Upload className="w-3 h-3" />选择文件
        </button>
        <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFile} />
      </div>

      <div className="rounded-[7px] border border-[#e3e6eb] bg-[#f6f7f9] p-2 text-[10px] text-[#6b7280] font-mono space-y-0.5">
        <p className="font-semibold text-[#1f2328] text-[10px]">支持 JSON 格式 / 5字段格式（每行一条）</p>
        <p>手机号 | 用户名 | 密码 | 邮箱 | 邮箱密码</p>
        <p className="text-[#2563eb]/80">+15551234567 | user | Pass@123 | u@gmail.com | gmailP</p>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="粘贴账号数据，或上传 TXT / JSON 文件…"
        rows={5}
        className="tool-textarea px-2.5 py-1.5 text-[11px] font-mono placeholder:text-[#9ca3af]"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={handleParse}
          disabled={!text.trim()}
          className="tool-btn h-6 px-2 text-[10px] disabled:opacity-40"
        >
          <Download className="w-3 h-3" />解析并导入
        </button>
        {result && (
          <span className={cn('text-[10px]', result.added > 0 ? 'text-[#1f8f4d]' : 'text-[#6b7280]')}>
            ✓ 新增 {result.added} 条，重复 {result.duplicate} 条
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ADB 模板面板 ────────────────────────────────────────────────────────────
function AdbTemplatePanel() {
  const { settings, updateSettings } = useSettingsStore();
  const [tpl, setTpl] = useState(settings.adbCommandTemplate || DEFAULT_ADB_TEMPLATE);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updateSettings({ adbCommandTemplate: tpl });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="tool-panel rounded-[10px] p-3 space-y-2.5">
      <div className="flex items-center gap-1.5">
        <Terminal className="w-3.5 h-3.5 text-[#6b7280]" />
        <span className="text-[12px] font-semibold text-[#1f2328]">ADB 注入模板</span>
      </div>
      <p className="text-[10px] text-[#6b7280] leading-relaxed">
        可用变量: <code className="text-[#2563eb]">{'{phone}'}</code>{' '}
        <code className="text-[#2563eb]">{'{username}'}</code>{' '}
        <code className="text-[#2563eb]">{'{password}'}</code>{' '}
        <code className="text-[#2563eb]">{'{email}'}</code>{' '}
        <code className="text-[#2563eb]">{'{emailPassword}'}</code>
      </p>
      <textarea
        value={tpl}
        onChange={e => setTpl(e.target.value)}
        rows={3}
        className="tool-textarea px-2.5 py-1.5 text-[10px] font-mono"
      />
      <div className="flex items-center gap-2">
        <button onClick={handleSave} className="tool-btn tool-btn-quiet h-6 px-2 text-[10px] font-medium">
          {saved ? <><Check className="w-3 h-3 text-[#1f8f4d]" />已保存</> : '保存模板'}
        </button>
        <button onClick={() => setTpl(DEFAULT_ADB_TEMPLATE)} className="text-[10px] text-[#2563eb] hover:underline">
          Reset
          </button>
      </div>
    </div>
  );
}

// ─── 资源页 ──────────────────────────────────────────────────────────────────
export default function Accounts() {
  const { accounts, deleteSelected, markBanned, updateAccount, injectAccount } = useAccountStore();
  const { cloudPhones } = useChatStore();
  const { settings } = useSettingsStore();
  const [filter, setFilter] = useState<AccountStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importMsg, setImportMsg] = useState('');
  const [injectingId, setInjectingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const filtered = accounts.filter(a => {
    if (filter !== 'all' && a.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.phoneNumber.includes(q) || a.username.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
    }
    return true;
  });

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(a => a.id)));
  };

  const handleDeleteSelected = () => {
    if (selected.size === 0) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteSelected = () => {
    deleteSelected([...selected]);
    setSelected(new Set());
    setDeleteConfirmOpen(false);
    toast({ title: '删除成功', description: `已删除 ${selected.size} 条账号。` });
    setStatusMsg(`已删除 ${selected.size} 条账号`);
  };

  const handleInject = async (acc: TextNowAccount) => {
    if (!settings.apiKey) {
      toast({ title: '缺少 API Key', description: '请先在设置中配置 CartierMiller API Key。', variant: 'destructive' });
      setStatusMsg('请先配置 API Key');
      return;
    }
    if (!acc.assignedPhoneId) {
      toast({ title: '无法注入', description: '该账号尚未绑定设备。', variant: 'destructive' });
      setStatusMsg('账号未绑定设备');
      return;
    }
    setInjectingId(acc.id);
    const r = await injectAccount(acc.assignedPhoneId, acc.id, settings.apiKey, settings.apiRegion, settings.adbCommandTemplate);
    setInjectingId(null);
    toast({ title: r.success ? '注入成功' : '注入失败', description: r.message, variant: r.success ? 'default' : 'destructive' });
    setStatusMsg(r.success ? '注入成功' : r.message);
  };

  const stats = {
    available: accounts.filter(a => a.status === 'available').length,
    assigned: accounts.filter(a => a.status === 'assigned' || a.status === 'active').length,
    banned: accounts.filter(a => a.status === 'banned').length,
  };

  return (
    <>
      <div className="flex flex-col h-full w-full overflow-hidden bg-[#f3f4f6]">
        <div className="tool-toolbar h-10 px-3 flex items-center gap-2 shrink-0">
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <Users className="h-4 w-4 text-[#2563eb]" />
            <span className="text-[13px] font-semibold tracking-[0.01em] text-[#1f2328]">账号资源</span>
            <span className="tool-chip text-[10px]">
              共 {accounts.length} 条 · {stats.available} 可用 · {stats.banned} 封禁
            </span>
          </div>
          {statusMsg && (
            <span className="hidden sm:inline text-[10px] text-[#6b7280] border-l border-[#d7dbe2] pl-2 truncate max-w-[220px]">{statusMsg}</span>
          )}
          {selected.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="tool-btn h-6 px-2 text-[10px] text-[#ef4444]"
            >
              <Trash2 className="w-3.5 h-3.5" />删除 {selected.size} 条
            </button>
          )}
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 左边栏 */}
          <div className="tool-sidebar w-64 shrink-0 h-full overflow-y-auto px-3 py-3 space-y-2.5 bg-[#eef1f4]">
            <ImportPanel onImported={(a, d) => setImportMsg(`新增 ${a} 条，重复 ${d} 条`)} />
            {importMsg && (
              <div className="flex items-center gap-1.5 text-[11px] text-[#1f8f4d] bg-[#eef8f1] border border-[#bfdac8] rounded-[7px] px-2.5 py-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" />{importMsg}
              </div>
            )}

            <div className="tool-panel rounded-[10px] p-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-2">账号统计</p>
              {[
                { label: '可用', count: stats.available, dotCls: 'ios-dot-online' },
                { label: '已分配/使用中', count: stats.assigned, dotCls: 'bg-[#007aff]' },
                { label: '已封禁', count: stats.banned, dotCls: 'ios-dot-offline' },
              ].map(({ label, count, dotCls }) => (
                <div key={label} className="px-0 py-0.5 flex items-center justify-between border-none">
                  <div className="flex items-center gap-2">
                    <span className={cn('ios-dot', dotCls)} />
                    <span className="text-[12px] text-[#1f2328]">{label}</span>
                  </div>
                  <span className="text-[12px] font-semibold text-[#1f2328]">{count}</span>
                </div>
              ))}
              <p className="text-[10px] text-[#6b7280] pt-1 border-t border-[#e3e6eb]">
                {cloudPhones.length} 台设备 · 最多 {cloudPhones.length * 10} 个槽位
              </p>
            </div>

            <AdbTemplatePanel />
          </div>

          {/* 右侧：账号列表 */}
          <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-white">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e3e6eb] shrink-0 bg-white">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b7280]" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="搜索手机号 / 用户名 / 邮箱…"
                  className="tool-input h-7 pl-7 pr-3 w-48 text-[12px] placeholder:text-[#9ca3af]"
                />
              </div>
              <div className="flex gap-1 flex-wrap">
                {STATUS_FILTERS.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={cn(
                      'h-6 px-2 rounded-[6px] text-[10px] font-medium transition-colors border',
                      filter === value
                        ? 'bg-[#2563eb] text-white border-transparent'
                        : 'bg-[#f3f4f6] border-[#e3e6eb] text-[#6b7280] hover:text-[#2563eb]'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 表格 */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="tool-empty">
                  <AlertCircle className="w-8 h-8 text-[#c7c7cc] mb-2" />
                  <p className="text-[15px] font-medium text-[#8e8e93]">
                    {accounts.length === 0 ? '请从左侧面板导入账号（支持 JSON / 5字段格式）' : '没有匹配的结果'}
                  </p>
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-[#fbfbfc] z-10">
                    <tr className="border-b border-[#d7dbe2]">
                      <th className="px-3 py-1.5 text-left w-8">
                        <button onClick={toggleAll}>
                          {selected.size === filtered.length && filtered.length > 0
                            ? <CheckSquare className="w-4 h-4 text-[#2563eb]" />
                            : <Square className="w-4 h-4 text-[#9ca3af]" />}
                        </button>
                      </th>
                      {['手机号', '用户名', '邮箱', '状态', '绑定设备', '导入时间', '操作'].map(h => (
                        <th
                          key={h}
                          className="px-3 py-1.5 text-left text-[10px] font-semibold text-[#6b7280] uppercase tracking-[0.04em] whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(acc => {
                      const phone = cloudPhones.find(p => p.id === acc.assignedPhoneId);
                      return (
                        <tr
                          key={acc.id}
                          className={cn(
                            'border-b border-[#eef1f4] transition-colors',
                            selected.has(acc.id) ? 'bg-[#eef5ff]' : 'hover:bg-[#f9fafb]'
                          )}
                        >
                          <td className="px-3 py-1.5">
                            <button onClick={() => toggleSelect(acc.id)}>
                              {selected.has(acc.id)
                                ? <CheckSquare className="w-4 h-4 text-[#2563eb]" />
                                : <Square className="w-4 h-4 text-[#9ca3af]" />}
                            </button>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[12px] text-[#1f2328]">{acc.phoneNumber}</td>
                          <td className="px-3 py-1.5 text-[12px] text-[#6b7280] truncate max-w-[90px]">{acc.username}</td>
                          <td className="px-3 py-1.5 text-[12px] text-[#6b7280] truncate max-w-[100px]">{acc.email}</td>
                          <td className="px-3 py-1.5">
                            <span className={cn(
                              'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-[6px] border',
                              statusChipClass(acc.status)
                            )}>
                              <span className={cn(
                                'w-1.5 h-1.5 rounded-full shrink-0',
                                acc.status === 'available' ? 'bg-[#34c759]'
                                : acc.status === 'banned' ? 'bg-[#ff3b30]'
                                : acc.status === 'active' ? 'bg-[#007aff]'
                                : 'bg-[#8e8e93]'
                              )} />
                              {ACCOUNT_STATUS_LABELS[acc.status]}
                            </span>
                          </td>
                          <td className="px-3 py-1.5">
                            {phone
                              ? <span className="font-mono text-[10px] text-[#2563eb]">{phone.name || phone.id} #{(acc.slotIndex ?? 0) + 1}</span>
                              : <span className="text-[#9ca3af]">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-[#6b7280] font-mono">{formatTime(acc.importedAt)}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              {acc.assignedPhoneId && (
                                <button
                                  onClick={() => handleInject(acc)}
                                  disabled={injectingId === acc.id}
                                  className="tool-btn tool-btn-quiet h-6 px-2 text-[10px] disabled:opacity-40"
                                >
                                  {injectingId === acc.id
                                    ? <RefreshCw className="w-3 h-3 animate-spin" />
                                    : <Zap className="w-3 h-3" />}
                                  {injectingId === acc.id ? '注入中…' : '注入'}
                                </button>
                              )}
                              {acc.status !== 'banned' ? (
                                <button
                                  onClick={() => markBanned(acc.id)}
                                  className="h-6 px-2 rounded-[6px] border border-[#d7dbe2] text-[10px] text-[#6b7280] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
                                >封禁</button>
                              ) : (
                                <button
                                  onClick={() => updateAccount(acc.id, { status: 'available', bannedAt: undefined })}
                                  className="h-6 px-2 rounded-[6px] border border-[#d7dbe2] text-[10px] text-[#6b7280] hover:border-[#1f8f4d] hover:text-[#1f8f4d] transition-colors"
                                >恢复</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="确认删除所选账号？"
        description={`将删除已选中的 ${selected.size} 条账号，此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        destructive
        onConfirm={confirmDeleteSelected}
      />
    </>
  );
}
