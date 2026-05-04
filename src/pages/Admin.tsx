import { useState } from 'react';
import { ShieldCheck, Plus, Trash2, Copy, Smartphone, Users, Key, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAdminStore, useAccountStore } from '@/hooks/useStore';
import { useChatStore } from '@/hooks/useStore';
import { cn, generateSubKey, formatTime } from '@/lib/index';
import type { SubAccount } from '@/lib/index';

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function AdminPage() {
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
    copyText(text);
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

  const openAssign = (sub: SubAccount, mode: 'phones' | 'accounts') => {
    setSelectedSub(sub);
    setAssignMode(mode);
    setPhoneSelections(sub.assignedPhoneIds);
    setAccountSelections(sub.assignedAccountIds);
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
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">子账号管理</h1>
          <p className="text-xs text-muted-foreground">创建子账号密钥并分配云手机 / TextNow 账号</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: create + list */}
        <div className="w-80 flex flex-col border-r border-border bg-white overflow-y-auto">
          {/* Create form */}
          <div className="p-4 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">新建子账号</p>
            <input
              className="w-full border border-input rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              placeholder="子账号名称（必填）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="w-full border border-input rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              placeholder="备注（选填）"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition"
            >
              <Plus size={15} /> 生成密钥
            </button>
          </div>

          {/* Sub account list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {subAccounts.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">暂无子账号</p>
            )}
            {subAccounts.map((sub) => (
              <motion.div
                key={sub.id}
                layout
                className="border border-border rounded-xl p-3 bg-white hover:border-primary/40 transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-foreground">{sub.name}</span>
                  <button
                    onClick={() => deleteSubAccount(sub.id)}
                    className="text-destructive hover:bg-destructive/10 rounded p-1 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {sub.note && <p className="text-xs text-muted-foreground mb-2">{sub.note}</p>}

                {/* Key display */}
                <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1.5 mb-2">
                  <Key size={11} className="text-muted-foreground shrink-0" />
                  <span className="font-mono text-[10px] text-slate-600 flex-1 truncate">{sub.key}</span>
                  <button
                    onClick={() => handleCopy(sub.key, sub.id + '-copy')}
                    className="text-primary hover:bg-primary/10 rounded p-0.5 transition"
                    title="复制密钥"
                  >
                    {copiedId === sub.id + '-copy' ? (
                      <span className="text-[10px] text-emerald-500">✓</span>
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                  <button
                    onClick={() => handleRegenKey(sub)}
                    className="text-amber-500 hover:bg-amber-50 rounded p-0.5 transition"
                    title="重置密钥"
                  >
                    <RefreshCw size={11} />
                  </button>
                </div>

                {/* Assignment counts */}
                <div className="flex gap-2 text-[10px] text-muted-foreground mb-2">
                  <span className="bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">
                    {sub.assignedPhoneIds.length} 台云手机
                  </span>
                  <span className="bg-emerald-50 text-emerald-600 rounded px-1.5 py-0.5">
                    {sub.assignedAccountIds.length} 个账号
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => openAssign(sub, 'phones')}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-border text-xs text-slate-600 hover:bg-slate-50 transition"
                  >
                    <Smartphone size={12} /> 分配云手机
                  </button>
                  <button
                    onClick={() => openAssign(sub, 'accounts')}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-border text-xs text-slate-600 hover:bg-slate-50 transition"
                  >
                    <Users size={12} /> 分配账号
                  </button>
                </div>
                <p className="text-[9px] text-muted-foreground mt-2">{formatTime(sub.createdAt)}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right: assignment panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedSub ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <ShieldCheck size={40} className="mb-3 opacity-30" />
              <p className="text-sm">选择左侧子账号，分配云手机或 TextNow 账号</p>
            </div>
          ) : (
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-5">
                <div>
                  <h2 className="font-semibold text-foreground">
                    为 <span className="text-primary">{selectedSub.name}</span> 分配资源
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {assignMode === 'phones' ? '选择允许访问的云手机' : '选择允许访问的 TextNow 账号'}
                  </p>
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => setAssignMode('phones')}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition',
                      assignMode === 'phones'
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    云手机
                  </button>
                  <button
                    onClick={() => setAssignMode('accounts')}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition',
                      assignMode === 'accounts'
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    TextNow账号
                  </button>
                </div>
              </div>

              {assignMode === 'phones' ? (
                <div className="grid grid-cols-2 gap-3">
                  {cloudPhones.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2 py-8 text-center">
                      暂无云手机，请先在设置里配置 API Key
                    </p>
                  )}
                  {cloudPhones.map((phone) => {
                    const sel = phoneSelections.includes(phone.id);
                    return (
                      <div
                        key={phone.id}
                        onClick={() => toggleSel(phone.id, phoneSelections, setPhoneSelections)}
                        className={cn(
                          'border rounded-xl p-3 cursor-pointer transition',
                          sel ? 'border-primary bg-primary/5' : 'border-border bg-white hover:border-primary/40'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Smartphone size={14} className={sel ? 'text-primary' : 'text-slate-400'} />
                          <span className="text-sm font-medium truncate">{phone.name || phone.id}</span>
                          {sel && <span className="ml-auto text-primary text-xs">✓</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 font-mono">{phone.ip}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {accounts.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2 py-8 text-center">
                      暂无账号，请先在账号库导入
                    </p>
                  )}
                  {accounts.map((acc) => {
                    const sel = accountSelections.includes(acc.id);
                    return (
                      <div
                        key={acc.id}
                        onClick={() => toggleSel(acc.id, accountSelections, setAccountSelections)}
                        className={cn(
                          'border rounded-xl p-3 cursor-pointer transition',
                          sel ? 'border-primary bg-primary/5' : 'border-border bg-white hover:border-primary/40'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Users size={14} className={sel ? 'text-primary' : 'text-slate-400'} />
                          <span className="text-sm font-medium font-mono truncate">{acc.phoneNumber}</span>
                          {sel && <span className="ml-auto text-primary text-xs">✓</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">{acc.username}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setSelectedSub(null)}
                  className="px-5 py-2 rounded-lg border border-border text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveAssign}
                  className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
                >
                  保存分配
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
