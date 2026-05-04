import React, { useState } from 'react';
import { ListTodo, Trash2, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Loader, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/hooks/useStore';
import { cn, formatTime } from '@/lib/index';
import type { BroadcastTask, TaskResult } from '@/lib/index';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: '等待中', color: 'text-muted-foreground', bg: 'bg-muted', icon: Clock },
  running: { label: '执行中', color: 'text-amber-500', bg: 'bg-amber-50', icon: Loader },
  paused: { label: '已暂停', color: 'text-blue-500', bg: 'bg-blue-50', icon: Clock },
  completed: { label: '已完成', color: 'text-emerald-500', bg: 'bg-emerald-50', icon: CheckCircle },
  failed: { label: '失败', color: 'text-destructive', bg: 'bg-destructive/10', icon: XCircle },
};

const RESULT_STATUS = {
  pending: { label: '等待', color: 'text-muted-foreground', icon: Clock },
  running: { label: '发送中', color: 'text-amber-400', icon: Loader },
  success: { label: '成功', color: 'text-green-400', icon: CheckCircle },
  failed: { label: '失败', color: 'text-destructive', icon: XCircle },
} as const;

function ResultRow({ result }: { result: TaskResult }) {
  const cfg = RESULT_STATUS[result.status];
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40 text-xs">
      <Icon className={cn('w-3.5 h-3.5 shrink-0', cfg.color, result.status === 'running' && 'animate-spin')} />
      <span className="font-mono text-foreground flex-1 truncate">{result.number || result.numberId}</span>
      <span className="font-mono text-muted-foreground truncate max-w-[120px]">→ {result.contactNumber || '未填写'}</span>
      <span className={cn('font-medium shrink-0', cfg.color)}>{cfg.label}</span>
      {result.error && <span className="text-destructive truncate max-w-[100px]" title={result.error}>⚠ {result.error}</span>}
    </div>
  );
}

function TaskCard({ task }: { task: BroadcastTask }) {
  const [expanded, setExpanded] = useState(false);
  const { deleteTask } = useTaskStore();
  const cfg = STATUS_CONFIG[task.status];
  const StatusIcon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card overflow-hidden shadow-sm"
    >
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Status icon */}
        <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', cfg.bg)}>
          <StatusIcon className={cn('w-4 h-4', cfg.color, task.status === 'running' && 'animate-spin')} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground truncate">{task.name}</span>
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0', cfg.bg, cfg.color)}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate max-w-xs">{task.message}</p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 shrink-0 text-xs">
          <div className="text-center">
            <div className="font-semibold text-green-400">{task.successCount}</div>
            <div className="text-muted-foreground">成功</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-destructive">{task.failCount}</div>
            <div className="text-muted-foreground">失败</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground">{task.targetNumbers.length}</div>
            <div className="text-muted-foreground">总数</div>
          </div>
        </div>

        {/* Time + actions */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-[10px] text-muted-foreground font-mono">{formatTime(task.createdAt)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Progress bar */}
      {(task.status === 'running' || task.status === 'completed') && (
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>发送进度</span>
            <span>{task.progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', task.status === 'running' ? 'bg-primary animate-pulse' : 'bg-green-400')}
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded results */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 border-t border-border space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground mb-2">发送明细</p>
              {task.results.map((r, i) => (
                <ResultRow key={`${r.numberId}-${i}`} result={r} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Tasks() {
  const { tasks } = useTaskStore();

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card/30 shrink-0">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 border border-primary/20">
          <ListTodo className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">群发任务</h1>
          <p className="text-xs text-muted-foreground">共 {tasks.length} 个任务</p>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            {tasks.filter((t) => t.status === 'completed').length} 已完成
          </span>
          <span className="flex items-center gap-1">
            <Loader className="w-3.5 h-3.5 text-amber-400" />
            {tasks.filter((t) => t.status === 'running').length} 执行中
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
              <Send className="w-10 h-10 text-primary/60" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">暂无群发任务</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              在聊天页面点击「群发」按钮创建批量发送任务
            </p>
          </div>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
