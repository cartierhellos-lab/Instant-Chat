import { useState, useRef } from 'react';
import { Upload, Users, Trash2, RefreshCw, Search, Download, CheckSquare, Square, Zap, AlertCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccountStore, useChatStore, useSettingsStore } from '@/hooks/useStore';
import { parseTxtAccounts } from '@/api/duoplus';
import { cn, statusColor, statusLabel, formatTime, SUPABASE_CONFIGURED } from '@/lib/index';
import type { AccountStatus, TextNowAccount } from '@/lib/index';

const STATUS_FILTERS: { label: string; value: AccountStatus | 'all' }[] = [
  { label: '全部', value: 'all' },
  { label: '可用', value: 'available' },
  { label: '已分配', value: 'assigned' },
  { label: '活跃', value: 'active' },
  { label: '已封禁', value: 'banned' },
  { label: '冷却中', value: 'cooling' },
];

function StatusBadge({ status }: { status: AccountStatus }) {
  const bgMap: Record<AccountStatus, string> = {
    available: 'bg-green-400/10 border-green-400/30',
    assigned: 'bg-blue-400/10 border-blue-400/30',
    active: 'bg-primary/10 border-primary/30',
    banned: 'bg-destructive/10 border-destructive/30',
    cooling: 'bg-amber-400/10 border-amber-400/30',
    injecting: 'bg-muted border-border',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium', bgMap[status], statusColor(status))}>
      {statusLabel(status)}
    </span>
  );
}

function ImportPanel({ onImported }: { onImported: (added: number, dup: number) => void }) {
  const { importAccounts } = useAccountStore();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ added: number; duplicate: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = () => {
    if (!text.trim()) return;
    const raws = parseTxtAccounts(text);
    const r = importAccounts(raws);
    setResult({ added: r.added, duplicate: r.duplicate });
    onImported(r.added, r.duplicate);
    if (r.added > 0) setText('');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText((ev.target?.result as string) || '');
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">批量导入账号</h3>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          选择 TXT 文件
        </button>
        <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFile} />
      </div>

      <div className="text-[10px] text-muted-foreground space-y-0.5 p-2.5 rounded-lg bg-muted/40 border border-dashed border-border">
        <p className="font-medium text-foreground mb-1">5字段格式（每行一个账号）</p>
        <p>支持分隔符：<code className="text-primary">|</code> 或 <code className="text-primary">:</code> 或 <code className="text-primary">----</code></p>
        <code className="text-[10px] text-muted-foreground block font-mono mt-1">
          手机号 | 用户名 | 密码 | 注册邮箱 | 邮箱密码
        </code>
        <code className="text-[10px] text-primary/70 block font-mono">
          +15551234567 | john_doe | Pass@123 | john@gmail.com | gmailPass
        </code>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="粘贴账号数据或选择 TXT 文件..."
        rows={5}
        className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/30 outline-none transition-all resize-none"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={handleParse}
          disabled={!text.trim()}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            text.trim() ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          <Download className="w-3.5 h-3.5" />
          解析并导入
        </button>
        {result && (
          <span className={cn('text-xs', result.added > 0 ? 'text-green-400' : 'text-muted-foreground')}>
            ✓ 新增 {result.added} 个，重复 {result.duplicate} 个
          </span>
        )}
      </div>
    </div>
  );
}

export default function Accounts() {
  const { accounts, deleteSelected, markBanned, updateAccount } = useAccountStore();
  const { cloudPhones } = useChatStore();
  const { settings } = useSettingsStore();
  const [filter, setFilter] = useState<AccountStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importMsg, setImportMsg] = useState('');
  const [injectingId, setInjectingId] = useState<string | null>(null);
  const { injectAccount } = useAccountStore();

  const filtered = accounts.filter((a) => {
    if (filter !== 'all' && a.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.phoneNumber.includes(q) || a.username.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((a) => a.id)));
  };

  const handleDeleteSelected = () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 个账号？`)) return;
    deleteSelected([...selected]);
    setSelected(new Set());
  };

  const handleInject = async (acc: TextNowAccount) => {
    if (!SUPABASE_CONFIGURED) { alert('请先配置 Supabase 代理'); return; }
    if (!acc.assignedPhoneId) { alert('账号未绑定设备'); return; }
    setInjectingId(acc.id);
    const r = await injectAccount(acc.assignedPhoneId, acc.id, settings.apiKey, settings.apiRegion, settings.adbCommandTemplate);
    setInjectingId(null);
    alert(r.success ? `✓ ADB注入成功：${r.message}` : `✗ 注入失败：${r.message}`);
  };

  const stats = {
    available: accounts.filter((a) => a.status === 'available').length,
    assigned: accounts.filter((a) => a.status === 'assigned' || a.status === 'active').length,
    banned: accounts.filter((a) => a.status === 'banned').length,
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card/30 shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 border border-primary/20">
          <Users className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">TextNow 账号库</h1>
          <p className="text-xs text-muted-foreground">
            共 {accounts.length} 个 · 可用 {stats.available} · 已分配 {stats.assigned} · 封禁 {stats.banned}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">已选 {selected.size} 个</span>
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: import + stats */}
        <div className="w-72 shrink-0 h-full overflow-y-auto border-r border-border px-4 py-4 space-y-4">
          <ImportPanel onImported={(added, dup) => setImportMsg(`导入 ${added} 个，重复 ${dup} 个`)} />
          {importMsg && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-400/10 border border-green-400/20 text-green-400 text-xs">
              <Check className="w-3.5 h-3.5 shrink-0" />
              {importMsg}
            </div>
          )}
          {/* Quick stats */}
          <div className="grid grid-cols-1 gap-2">
            {[
              { label: '可用账号', count: stats.available, color: 'text-green-400', bg: 'bg-green-400/10' },
              { label: '已分配', count: stats.assigned, color: 'text-blue-400', bg: 'bg-blue-400/10' },
              { label: '已封禁', count: stats.banned, color: 'text-destructive', bg: 'bg-destructive/10' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} className={cn('flex items-center justify-between px-3 py-2.5 rounded-lg border border-border', bg)}>
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className={cn('text-sm font-bold font-mono', color)}>{count}</span>
              </div>
            ))}
          </div>
          {/* Cloud phone count */}
          <div className="text-[10px] text-muted-foreground p-2.5 rounded-lg bg-muted/30 border border-border">
            <p className="font-medium text-foreground mb-1">设备: {cloudPhones.length} 台</p>
            <p>每台最多 10 个 TextNow 账号</p>
            <p className="mt-0.5">最大容量: {cloudPhones.length * 10} 个账号</p>
          </div>
        </div>

        {/* Right: account list */}
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索号码/用户名/邮箱..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-muted border border-border text-xs text-foreground placeholder:text-muted-foreground focus:border-ring outline-none"
              />
            </div>
            <div className="flex gap-1">
              {STATUS_FILTERS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all',
                    filter === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <AlertCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {accounts.length === 0 ? '请从左侧导入 TextNow 账号' : '没有匹配的账号'}
                </p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card/90 backdrop-blur-sm border-b border-border z-10">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">
                      <button onClick={toggleAll}>
                        {selected.size === filtered.length && filtered.length > 0
                          ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium">手机号</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium">用户名</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium">邮箱</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium">状态</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium">绑定设备</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium">导入时间</th>
                    <th className="px-3 py-2 text-right text-muted-foreground font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filtered.map((acc) => {
                      const phone = cloudPhones.find((p) => p.id === acc.assignedPhoneId);
                      return (
                        <motion.tr
                          key={acc.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={cn(
                            'border-b border-border/50 hover:bg-muted/20 transition-colors',
                            selected.has(acc.id) && 'bg-primary/5'
                          )}
                        >
                          <td className="px-3 py-2">
                            <button onClick={() => toggleSelect(acc.id)}>
                              {selected.has(acc.id)
                                ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                                : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                          </td>
                          <td className="px-3 py-2 font-mono text-foreground">{acc.phoneNumber}</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[100px]">{acc.username}</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[120px]">{acc.email}</td>
                          <td className="px-3 py-2"><StatusBadge status={acc.status} /></td>
                          <td className="px-3 py-2">
                            {phone ? (
                              <span className="font-mono text-blue-400 text-[10px]">
                                {phone.name || phone.id} #{(acc.slotIndex ?? 0) + 1}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground font-mono">{formatTime(acc.importedAt)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              {acc.assignedPhoneId && (
                                <button
                                  onClick={() => handleInject(acc)}
                                  disabled={injectingId === acc.id || acc.status === 'injecting'}
                                  className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 text-primary text-[10px] hover:bg-primary/20 transition-colors disabled:opacity-50"
                                  title="ADB注入到设备"
                                >
                                  {injectingId === acc.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                  注入
                                </button>
                              )}
                              {acc.status !== 'banned' && (
                                <button
                                  onClick={() => markBanned(acc.id)}
                                  className="px-2 py-1 rounded bg-destructive/10 text-destructive text-[10px] hover:bg-destructive/20 transition-colors"
                                >
                                  封禁
                                </button>
                              )}
                              {acc.status === 'banned' && (
                                <button
                                  onClick={() => updateAccount(acc.id, { status: 'available', bannedAt: undefined })}
                                  className="px-2 py-1 rounded bg-green-400/10 text-green-400 text-[10px] hover:bg-green-400/20 transition-colors"
                                >
                                  恢复
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
