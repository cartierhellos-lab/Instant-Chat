import React, { useState } from 'react';
import { ListTodo, Trash2, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Loader, Send } from 'lucide-react';
import { useTaskStore } from '@/hooks/useStore';
import { cn, formatTime } from '@/lib/index';
import type { BroadcastTask, TaskResult } from '@/lib/index';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:   { label: '等待中', color: 'text-muted-foreground',  icon: Clock },
  running:   { label: '执行中', color: 'text-amber-600',         icon: Loader },
  paused:    { label: '已暂停', color: 'text-blue-600',          icon: Clock },
  completed: { label: '已完成', color: 'text-green-600',         icon: CheckCircle },
  failed:    { label: '失败',   color: 'text-red-500',           icon: XCircle },
};

const RESULT_STATUS = {
  pending: { label: '等待', color: 'text-muted-foreground', icon: Clock },
  running: { label: '发送中', color: 'text-amber-600', icon: Loader },
  success: { label: '成功', color: 'text-green-600', icon: CheckCircle },
  failed:  { label: '失败', color: 'text-red-500', icon: XCircle },
} as const;

function ResultRow({ result }: { result: TaskResult }) {
  const cfg = RESULT_STATUS[result.status];
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded text-[10px] border border-[#dfe5eb] bg-white">
      <Icon className={cn('w-3 h-3 shrink-0', cfg.color, result.status === 'running' && 'animate-spin')} />
      <span className="font-mono text-foreground flex-1 truncate">{result.number || result.numberId}</span>
      <span className="font-mono text-muted-foreground truncate max-w-[100px]">→ {result.contactNumber || '—'}</span>
      <span className={cn('font-medium shrink-0', cfg.color)}>{cfg.label}</span>
      {result.error && <span className="text-red-500 truncate max-w-[80px]" title={result.error}>⚠ {result.error}</span>}
    </div>
  );
}

function TaskCard({ task }: { task: BroadcastTask }) {
  const [expanded, setExpanded] = useState(false);
  const { deleteTask } = useTaskStore();
  const cfg = STATUS_CONFIG[task.status];
  const StatusIcon = cfg.icon;

  return (
    <div className="tool-panel overflow-hidden">
      {/* 行头 */}
      <div className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/70 transition-colors"
        onClick={() => setExpanded(p => !p)}>
        <StatusIcon className={cn('w-3.5 h-3.5 shrink-0', cfg.color, task.status === 'running' && 'animate-spin')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-foreground truncate">{task.name}</span>
            <span className={cn('text-[9px] font-medium px-1 py-0.5 rounded border', cfg.color,
              task.status === 'running' ? 'border-amber-300 bg-amber-50'
              : task.status === 'completed' ? 'border-green-300 bg-green-50'
              : task.status === 'failed' ? 'border-red-300 bg-red-50'
              : 'border-[#ddd] bg-[#f5f5f5]'
            )}>
              {cfg.label}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate max-w-xs mt-0.5">{task.message}</p>
        </div>

        {/* 统计 */}
        <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono">
          <span className="text-green-600 font-semibold">{task.successCount}✓</span>
          <span className="text-red-500 font-semibold">{task.failCount}✗</span>
          <span className="text-muted-foreground">{task.targetNumbers.length}总</span>
          <span className="text-muted-foreground">{formatTime(task.createdAt)}</span>
        </div>

        <div className="flex items-center gap-1 ml-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* 进度条 */}
      {(task.status === 'running' || task.status === 'completed') && (
        <div className="px-3 pb-1.5">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-0.5">
            <span>发送进度</span><span>{task.progress}%</span>
          </div>
          <div className="h-1 rounded-full bg-[#e8e8e8] overflow-hidden">
            <div className={cn('h-full rounded-full transition-all duration-500', task.status === 'running' ? 'bg-primary' : 'bg-green-500')}
              style={{ width: `${task.progress}%` }} />
          </div>
        </div>
      )}

      {/* 展开明细 */}
      {expanded && (
        <div className="px-3 pb-3 pt-1.5 border-t border-[#ebebeb] bg-[linear-gradient(180deg,#fbfcfe_0%,#f4f7fa_100%)] space-y-1">
          <p className="text-[9px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">发送明细</p>
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
    <div className="flex flex-col h-full w-full overflow-hidden bg-transparent">
      {/* 工具栏 */}
      <div className="tool-toolbar flex items-center gap-3 px-4 py-2 shrink-0">
        <ListTodo className="w-4 h-4 text-muted-foreground" />
        <span className="text-[12px] font-semibold text-foreground">群发任务</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {tasks.length} 个 · {done} 已完成 · {running} 执行中
        </span>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Send className="w-8 h-8 text-muted-foreground/15 mb-2" />
            <p className="text-[12px] text-muted-foreground">暂无群发任务</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">在聊天页面点击「群发」按钮创建</p>
          </div>
        ) : tasks.map(task => <TaskCard key={task.id} task={task} />)}
      </div>
    </div>
  );
}
