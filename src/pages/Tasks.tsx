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
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-[#f2f2f7] bg-white text-[12px]">
      <Icon className={cn('w-3 h-3 shrink-0', cfg.color, result.status === 'running' && 'animate-spin')} />
      <span className="font-mono text-[#1c1c1e] flex-1 truncate">{result.number || result.numberId}</span>
      <span className="font-mono text-[#8e8e93] truncate max-w-[100px]">→ {result.contactNumber || '—'}</span>
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
    <div className="ios-card overflow-hidden animate-fade-up">
      {/* 任务行头 */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#fafafa] transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        {/* 状态图标 */}
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          task.status === 'completed' ? 'bg-[#34c759]/10'
          : task.status === 'running'   ? 'bg-[#ff9500]/10'
          : task.status === 'failed'    ? 'bg-[#ff3b30]/10'
          : 'bg-[#f2f2f7]'
        )}>
          <StatusIcon className={cn(
            'w-4 h-4',
            task.status === 'completed' ? 'text-[#34c759]'
            : task.status === 'running'   ? 'text-[#ff9500] animate-spin'
            : task.status === 'failed'    ? 'text-[#ff3b30]'
            : 'text-[#8e8e93]'
          )} />
        </div>

        {/* 任务名 + 状态 chip + 消息摘要 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-[#1c1c1e] truncate">{task.name}</span>
            <span className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-full border',
              cfg.chipCls
            )}>
              {cfg.label}
            </span>
          </div>
          <p className="text-[12px] text-[#8e8e93] truncate mt-0.5">{task.message}</p>
        </div>

        {/* 统计数字 */}
        <div className="flex items-center gap-3 shrink-0 text-[12px] font-mono">
          <span className="text-[#34c759] font-semibold">{task.successCount}✓</span>
          <span className="text-[#ff3b30] font-semibold">{task.failCount}✗</span>
          <span className="text-[#8e8e93]">{total} 总</span>
          <span className="text-[#8e8e93] text-[11px]">{formatTime(task.createdAt)}</span>
        </div>

        {/* 删除 + 展开 */}
        <div className="flex items-center gap-1 ml-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#ff3b30]/10 text-[#c7c7cc] hover:text-[#ff3b30] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-[#c7c7cc]" />
            : <ChevronDown className="w-4 h-4 text-[#c7c7cc]" />}
        </div>
      </div>

      {/* 进度条 */}
      {(task.status === 'running' || task.status === 'completed') && (
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between text-[11px] text-[#8e8e93] mb-1">
            <span>发送进度</span>
            <span className="font-mono">{task.progress}%</span>
          </div>
          {/* 三段进度条：成功/失败/待发 */}
          <div className="h-1.5 rounded-full bg-[#f2f2f7] overflow-hidden flex">
            <div
              className="h-full bg-[#34c759] rounded-l-full transition-all duration-500"
              style={{ width: `${successPct}%` }}
            />
            <div
              className="h-full bg-[#ff3b30] transition-all duration-500"
              style={{ width: `${failPct}%` }}
            />
          </div>
        </div>
      )}

      {/* 展开明细 */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-[#f2f2f7] bg-[#fafafa] space-y-1.5 animate-fade-up">
          <p className="text-[11px] font-semibold text-[#8e8e93] uppercase tracking-wider mb-2">发送明细</p>
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
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#f2f2f7]">
      {/* 工具栏 */}
      <div className="tool-toolbar h-11 px-4 flex items-center gap-2 shrink-0">
        <span className="text-[17px] font-semibold text-[#1c1c1e] flex-1">群发任务</span>
        <div className="flex items-center gap-1.5 text-[12px] text-[#8e8e93]">
          <span>{tasks.length} 个</span>
          {done > 0 && (
            <span className="text-[#34c759] font-medium">{done} 已完成</span>
          )}
          {running > 0 && (
            <span className="flex items-center gap-1 text-[#ff9500] font-medium">
              <Loader className="w-3 h-3 animate-spin" />{running} 执行中
            </span>
          )}
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {tasks.length === 0 ? (
          <div className="tool-empty">
            <div className="w-16 h-16 rounded-full bg-[#f2f2f7] flex items-center justify-center mb-3">
              <Send className="w-7 h-7 text-[#c7c7cc]" />
            </div>
            <p className="text-[15px] font-medium text-[#8e8e93]">暂无群发任务</p>
            <p className="text-[13px] text-[#c7c7cc] mt-1">在聊天页面点击「群发」按钮创建</p>
          </div>
        ) : (
          tasks.map(task => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
