import { useState, useRef } from 'react';
import { Upload, Users, Trash2, RefreshCw, Search, Download, CheckSquare, Square, Zap, AlertCircle, Check, Terminal } from 'lucide-react';
import { useAccountStore, useChatStore, useSettingsStore } from '@/hooks/useStore';
import { parseTxtAccounts } from '@/api/duoplus';
import { cn, statusColor, statusLabel, formatTime, DEFAULT_ADB_TEMPLATE } from '@/lib/index';
import type { AccountStatus, TextNowAccount } from '@/lib/index';

const STATUS_FILTERS: { label: string; value: AccountStatus | 'all' }[] = [
  { label: '全部', value: 'all' }, { label: '可用', value: 'available' },
  { label: '已分配', value: 'assigned' }, { label: '活跃', value: 'active' },
  { label: '已封禁', value: 'banned' }, { label: '冷却中', value: 'cooling' },
];

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
    <div className="border border-[#d8d8d8] rounded bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground">批量导入账号</span>
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 h-5 px-2 rounded border border-[#c8c8c8] bg-[#f5f5f5] text-[10px] text-foreground/70 hover:border-primary hover:text-primary transition-colors">
          <Upload className="w-3 h-3" />选择 TXT
        </button>
        <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFile} />
      </div>

      <div className="p-2 rounded border border-dashed border-[#d0d0d0] bg-[#fafafa] text-[9px] text-muted-foreground font-mono space-y-0.5">
        <p className="font-semibold text-foreground">5字段格式（每行一个账号）</p>
        <p>手机号 | 用户名 | 密码 | 注册邮箱 | 邮箱密码</p>
        <p className="text-primary/70">+15551234567 | user | Pass@123 | u@gmail.com | gmailP</p>
      </div>

      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder="粘贴账号数据或选择 TXT 文件…" rows={5}
        className="w-full px-2.5 py-1.5 rounded border border-[#c8c8c8] bg-white text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition resize-none" />

      <div className="flex items-center gap-2">
        <button onClick={handleParse} disabled={!text.trim()}
          className="flex items-center gap-1 h-6 px-3 rounded bg-primary text-white text-[10px] font-medium shadow-btn hover:opacity-90 disabled:opacity-40 transition-opacity">
          <Download className="w-3 h-3" />解析并导入
        </button>
        {result && (
          <span className={cn('text-[10px]', result.added > 0 ? 'text-green-600' : 'text-muted-foreground')}>
            ✓ 新增 {result.added}，重复 {result.duplicate}
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
    <div className="border border-[#d8d8d8] rounded bg-white p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Terminal className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-foreground">ADB 命令模板</span>
      </div>
      <p className="text-[9px] text-muted-foreground leading-relaxed">
        变量：<code className="text-primary">{'{phone}'}</code> <code className="text-primary">{'{username}'}</code> <code className="text-primary">{'{password}'}</code> <code className="text-primary">{'{email}'}</code> <code className="text-primary">{'{emailPassword}'}</code>
      </p>
      <textarea value={tpl} onChange={e => setTpl(e.target.value)} rows={3}
        className="w-full px-2.5 py-1.5 rounded border border-[#c8c8c8] bg-[#fafafa] text-[10px] font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition resize-none" />
      <div className="flex items-center gap-2">
        <button onClick={handleSave}
          className="flex items-center gap-1 h-5 px-2 rounded bg-primary text-white text-[9px] font-medium shadow-btn hover:opacity-90 transition-opacity">
          {saved ? <><Check className="w-2.5 h-2.5" />已保存</> : '保存模板'}
        </button>
        <button onClick={() => setTpl(DEFAULT_ADB_TEMPLATE)} className="text-[9px] text-primary hover:underline">恢复默认</button>
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
    if (!confirm(`确定删除选中的 ${selected.size} 个账号？`)) return;
    deleteSelected([...selected]);
    setSelected(new Set());
  };

  const handleInject = async (acc: TextNowAccount) => {
    if (!settings.apiKey) { alert('请先配置 API Key'); return; }
    if (!acc.assignedPhoneId) { alert('账号未绑定设备'); return; }
    setInjectingId(acc.id);
    const r = await injectAccount(acc.assignedPhoneId, acc.id, settings.apiKey, settings.apiRegion, settings.adbCommandTemplate);
    setInjectingId(null);
    alert(r.success ? `✓ 注入成功：${r.message}` : `✗ 注入失败：${r.message}`);
  };

  const stats = {
    available: accounts.filter(a => a.status === 'available').length,
    assigned: accounts.filter(a => a.status === 'assigned' || a.status === 'active').length,
    banned: accounts.filter(a => a.status === 'banned').length,
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#d0d0d0] bg-[#f0f0f0] shrink-0">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-[12px] font-semibold text-foreground">资源管理</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {accounts.length} 个 · 可用 {stats.available} · 已分配 {stats.assigned} · 封禁 {stats.banned}
        </span>
        {selected.size > 0 && (
          <button onClick={handleDeleteSelected}
            className="ml-auto flex items-center gap-1 h-6 px-2.5 rounded border border-red-300 bg-red-50 text-red-600 text-[10px] font-medium hover:bg-red-100 transition-colors">
            <Trash2 className="w-3 h-3" />删除 {selected.size} 个
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 左边栏：导入+统计+ADB */}
        <div className="w-64 shrink-0 h-full overflow-y-auto border-r border-[#d0d0d0] px-3 py-3 space-y-3 bg-[#f7f7f7]">
          <ImportPanel onImported={(a, d) => setImportMsg(`导入 ${a} 个，重复 ${d} 个`)} />
          {importMsg && (
            <div className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
              <Check className="w-3 h-3 shrink-0" />{importMsg}
            </div>
          )}
          <div className="grid gap-1">
            {[
              { label: '可用账号', count: stats.available, color: 'text-green-600' },
              { label: '已分配', count: stats.assigned, color: 'text-blue-600' },
              { label: '已封禁', count: stats.banned, color: 'text-red-500' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between px-2 py-1 rounded border border-[#e0e0e0] bg-white text-[10px]">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn('font-bold font-mono', color)}>{count}</span>
              </div>
            ))}
            <div className="px-2 py-1 rounded border border-[#e0e0e0] bg-white text-[9px] text-muted-foreground">
              {cloudPhones.length} 台设备 · 最大 {cloudPhones.length * 10} 个账号
            </div>
          </div>
          <AdbTemplatePanel />
        </div>

        {/* 右侧：账号列表 */}
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          {/* 搜索+筛选 */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#d8d8d8] bg-[#f5f5f5] shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索…"
                className="h-6 pl-6 pr-2 w-40 text-[10px] rounded border border-[#c8c8c8] bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition placeholder:text-muted-foreground/40" />
            </div>
            <div className="flex gap-0.5">
              {STATUS_FILTERS.map(({ label, value }) => (
                <button key={value} onClick={() => setFilter(value)}
                  className={cn('h-6 px-2 rounded text-[10px] font-medium transition-colors',
                    filter === value ? 'bg-primary text-white' : 'bg-white border border-[#c8c8c8] text-foreground/60 hover:border-primary hover:text-primary'
                  )}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 表格 */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground/15 mb-2" />
                <p className="text-[12px] text-muted-foreground">
                  {accounts.length === 0 ? '请从左侧导入 TextNow 账号' : '无匹配结果'}
                </p>
              </div>
            ) : (
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-[#f0f0f0] border-b border-[#d0d0d0] z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left w-7">
                      <button onClick={toggleAll}>
                        {selected.size === filtered.length && filtered.length > 0
                          ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                      </button>
                    </th>
                    {['手机号', '用户名', '邮箱', '状态', '绑定设备', '导入时间', '操作'].map(h => (
                      <th key={h} className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(acc => {
                    const phone = cloudPhones.find(p => p.id === acc.assignedPhoneId);
                    return (
                      <tr key={acc.id} className={cn('border-b border-[#ebebeb] hover:bg-[#f8f8f8] transition-colors', selected.has(acc.id) && 'bg-primary/5')}>
                        <td className="px-2 py-1.5">
                          <button onClick={() => toggleSelect(acc.id)}>
                            {selected.has(acc.id) ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5 text-muted-foreground/40" />}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-foreground">{acc.phoneNumber}</td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[90px]">{acc.username}</td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[100px]">{acc.email}</td>
                        <td className="px-2 py-1.5">
                          <span className={cn('text-[9px] font-medium px-1 py-0.5 rounded border',
                            acc.status === 'available' ? 'border-green-300 bg-green-50 text-green-700'
                            : acc.status === 'banned' ? 'border-red-300 bg-red-50 text-red-600'
                            : acc.status === 'active' ? 'border-primary/30 bg-primary/5 text-primary'
                            : 'border-[#ddd] bg-[#f5f5f5] text-muted-foreground'
                          )}>
                            {statusLabel(acc.status)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          {phone ? <span className="font-mono text-[9px] text-blue-600">{phone.name || phone.id} #{(acc.slotIndex ?? 0) + 1}</span> : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground font-mono text-[9px]">{formatTime(acc.importedAt)}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            {acc.assignedPhoneId && (
                              <button onClick={() => handleInject(acc)} disabled={injectingId === acc.id}
                                className="flex items-center gap-0.5 h-5 px-1.5 rounded border border-[#c8c8c8] bg-[#f5f5f5] text-[9px] text-foreground/70 hover:border-primary hover:text-primary disabled:opacity-40 transition-colors">
                                {injectingId === acc.id ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}注入
                              </button>
                            )}
                            {acc.status !== 'banned' ? (
                              <button onClick={() => markBanned(acc.id)}
                                className="h-5 px-1.5 rounded border border-[#e0e0e0] text-[9px] text-muted-foreground hover:border-red-400 hover:text-red-500 transition-colors">封禁</button>
                            ) : (
                              <button onClick={() => updateAccount(acc.id, { status: 'available', bannedAt: undefined })}
                                className="h-5 px-1.5 rounded border border-[#e0e0e0] text-[9px] text-muted-foreground hover:border-green-500 hover:text-green-600 transition-colors">恢复</button>
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
  );
}
