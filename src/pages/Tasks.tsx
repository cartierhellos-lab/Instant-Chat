import React, { useState } from 'react';
import { ListTodo, Trash2, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Loader, Send } from 'lucide-react';
import { useTaskStore } from '@/hooks/useStore';
import { cn, formatTime } from '@/lib/index';
import type { BroadcastTask, TaskResult } from '@/lib/index';

const STATUS_CONFIG: Record<string, { label: string; chipCls: string; dotCls: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:   { label: '等待中', chipCls: 'bg-[#f2f2f7] text-[#8e8e93] border-[#e5e5ea]',             dotCls: 'bg-[#8e8e93]',   icon: Clock },
  running:   { label: '执行中', chipCls: 'bg-[#ff9500]/10 text-[#ff9500] border-[#ff9500]/25',        dotCls: 'bg-[#ff9500]',   icon: Loader },
  paused:    { label: '已暂停', chipCls: 'bg-[#007aff]/10 text-[#007aff] border-[#007aff]/25',        dotCls: 'bg-[#007aff]',   icon: Clock },
  completed: { label: '已完成', chipCls: 'bg-[#34c759]/10 text-[#34c759] border-[#34c759]/25',        dotCls: 'bg-[#34c759]',   icon: CheckCircle },
  failed:    { label: '失败',   chipCls: 'bg-[#ff3b30]/10 text-[#ff3b30] border-[#ff3b30]/25',        dotCls: 'bg-[#ff3b30]',   icon: XCircle },
};

const RESULT_STATUS = {
  pending: { label: '等待',   color: 'text-[#8e8e93]', icon: Clock },
  running: { label: '发送中', color: 'text-[#ff9500]', icon: Loader },
  success: { label: '成功',   color: 'text-[#34c759]', icon: CheckCircle },
  failed:  { label: '失败',   color: 'text-[#ff3b30]', icon: XCircle },
} as const;

function ResultRow({ result }: { result: TaskResult }) {
  const cfg = RESULT_STATUS[result.status];
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-[7px] border border-[#e3e6eb] bg-white text-[11px]">
      <Icon className={cn('w-3 h-3 shrink-0', cfg.color, result.status === 'running' && 'animate-spin')} />
      <span className="font-mono text-[#1f2328] flex-1 truncate">{result.number || result.numberId}</span>
      <span className="font-mono text-[#6b7280] truncate max-w-[100px]">→ {result.contactNumber || '—'}</span>
      <span className={cn('font-medium shrink-0', cfg.color)}>{cfg.label}</span>
      {result.error && (
        <span className="text-[#ff3b30] truncate max-w-[80px]" title={result.error}>⚠ {result.error}</span>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: BroadcastTask }) {
  const [expanded, setExpanded] = useState(false);
  const { deleteTask } = useTaskStore();
  const cfg = STATUS_CONFIG[task.status];
  const StatusIcon = cfg.icon;
  const total = task.targetNumbers.length;
  const successPct = total > 0 ? (task.successCount / total) * 100 : 0;
  const failPct    = total > 0 ? (task.failCount    / total) * 100 : 0;

  return (
    <div className="tool-panel overflow-hidden animate-fade-up rounded-[10px]">
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[#f9fafb] transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        <div className={cn(
          'w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 border',
          task.status === 'completed' ? 'bg-[#eef8f1] border-[#bfdac8]'
          : task.status === 'running'   ? 'bg-[#fff7ed] border-[#fed7aa]'
          : task.status === 'failed'    ? 'bg-[#fef2f2] border-[#fecaca]'
          : 'bg-[#f6f7f9] border-[#d7dbe2]'
        )}>
          <StatusIcon className={cn(
            'w-3.5 h-3.5',
            task.status === 'completed' ? 'text-[#1f8f4d]'
            : task.status === 'running'   ? 'text-[#b45309] animate-spin'
            : task.status === 'failed'    ? 'text-[#ef4444]'
            : 'text-[#6b7280]'
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[#1f2328] truncate">{task.name}</span>
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-[6px] border',
              cfg.chipCls
            )}>
              {cfg.label}
            </span>
          </div>
          <p className="text-[11px] text-[#6b7280] truncate mt-0.5">{task.message}</p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 text-[11px] font-mono">
          <span className="text-[#1f8f4d] font-semibold">{task.successCount}✓</span>
          <span className="text-[#ef4444] font-semibold">{task.failCount}✗</span>
          <span className="text-[#6b7280]">{total} 总</span>
          <span className="text-[#6b7280] text-[10px]">{formatTime(task.createdAt)}</span>
        </div>

        <div className="flex items-center gap-1 ml-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
            className="w-6 h-6 flex items-center justify-center rounded-[6px] hover:bg-[#fef2f2] text-[#9ca3af] hover:text-[#ef4444] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-[#9ca3af]" />
            : <ChevronDown className="w-4 h-4 text-[#9ca3af]" />}
        </div>
      </div>

      {(task.status === 'running' || task.status === 'completed') && (
        <div className="px-3 pb-2.5">
          <div className="flex items-center justify-between text-[10px] text-[#6b7280] mb-1">
            <span>发送进度</span>
            <span className="font-mono">{task.progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#f2f2f7] overflow-hidden flex">
            <div
              className="h-full bg-[#1f8f4d] rounded-l-full transition-all duration-500"
              style={{ width: `${successPct}%` }}
            />
            <div
              className="h-full bg-[#ef4444] transition-all duration-500"
              style={{ width: `${failPct}%` }}
            />
          </div>
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-[#e3e6eb] bg-[#fbfbfc] space-y-1.5 animate-fade-up">
          <p className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider mb-2">发送明细</p>
          {task.results.map((r, i) => <ResultRow key={`${r.numberId}-${i}`} result={r} />)}
        </div>
      )}
    </div>
  );
}

export default function Tasks() {
  const { tasks } = useTaskStore();
  const running = tasks.filter(t => t.status === 'running').length;
  const done = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#f3f4f6]">
      <div className="tool-toolbar h-10 px-3 flex items-center gap-2 shrink-0">
        <div className="flex flex-1 items-center gap-2">
          <ListTodo className="h-4 w-4 text-[#2563eb]" />
          <span className="text-[13px] font-semibold tracking-[0.01em] text-[#1f2328]">群发任务</span>
          <span className="tool-chip text-[10px]">{tasks.length} 个</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[#6b7280]">
          {done > 0 && (
            <span className="text-[#1f8f4d] font-medium">{done} 已完成</span>
          )}
          {running > 0 && (
            <span className="flex items-center gap-1 text-[#b45309] font-medium">
              <Loader className="w-3 h-3 animate-spin" />{running} 执行中
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {tasks.length === 0 ? (
          <div className="tool-empty">
            <div className="w-12 h-12 rounded-[10px] bg-[#f6f7f9] border border-[#d7dbe2] flex items-center justify-center mb-3">
              <Send className="w-5 h-5 text-[#9ca3af]" />
            </div>
            <p className="text-[14px] font-medium text-[#6b7280]">暂无群发任务</p>
            <p className="text-[12px] text-[#9ca3af] mt-1">在聊天页面点击「群发」按钮创建</p>
          </div>
        ) : (
          tasks.map(task => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
