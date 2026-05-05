import { useState, useRef, useCallback } from 'react';
import { X, Send, Upload, Image, Clock, Plus, FileText, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore, useChatStore, useAccountStore, useTaskStore } from '@/hooks/useStore';
import { cn, generateId, randomQueueInterval, QUEUE_INTERVAL_MIN, QUEUE_INTERVAL_MAX } from '@/lib/index';
import type { QueueItem } from '@/lib/index';

interface Props {
  open: boolean;
  onClose: () => void;
}

// 解析联系人号码（TXT/CSV，每行一个，支持逗号/制表符分隔）
function parseContactNumbers(raw: string): string[] {
  return raw
    .split(/[\n\r]+/)
    .flatMap((line) => line.split(/[,\t]+/))
    .map((s) => s.trim().replace(/\D/g, ''))
    .filter((s) => s.length >= 7);
}

export default function BroadcastDialog({ open, onClose }: Props) {
  const { settings } = useSettingsStore();
  const { cloudNumbers, cloudPhones } = useChatStore();
  const { accounts, bindings } = useAccountStore();
  const { createTask, runTaskInBackground, abortTask, tasks } = useTaskStore();

  const [mode, setMode] = useState<'cloud_number' | 'textnow'>('cloud_number');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: message content
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');

  // Step 2: target numbers & senders
  const [contactRaw, setContactRaw] = useState('');
  const [contacts, setContacts] = useState<string[]>([]);
  const [selectedSenders, setSelectedSenders] = useState<string[]>([]);
  const [showContactImport, setShowContactImport] = useState(false);
  const [cycleCount, setCycleCount] = useState(1);

  // Step 3: queue preview
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [taskName, setTaskName] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const activeTask = tasks.find(t => t.id === activeTaskId);
  const running = activeTask?.status === 'running';

  const imageInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1); setMessage(''); setImageUrl(''); setImagePreview('');
    setContactRaw(''); setContacts([]); setSelectedSenders([]);
    setQueue([]); setTaskName(''); setActiveTaskId(null); setSent(0);
  };

  // 关闭弹窗不中断后台任务
  const handleClose = () => { reset(); onClose(); };

  // Handle local image selection → convert to data URL for preview
  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setImagePreview(url);
      setImageUrl(url);
    };
    reader.readAsDataURL(file);
  };

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  };

  // Parse contacts from textarea
  const handleParseContacts = () => {
    const nums = parseContactNumbers(contactRaw);
    setContacts(nums);
  };

  const handleContactFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = ev.target?.result as string;
      setContactRaw(raw);
      setContacts(parseContactNumbers(raw));
    };
    reader.readAsText(file);
  };

  const toggleSender = (id: string) =>
    setSelectedSenders((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  // Build ordered send queue with 350-450s intervals
  const buildQueue = useCallback((): QueueItem[] => {
    const items: QueueItem[] = [];
    let timeOffset = 0;

    if (mode === 'cloud_number') {
      // Each sender × each contact
      for (const senderId of selectedSenders) {
        for (const contact of contacts) {
          items.push({
            id: generateId(),
            targetNumber: contact,
            message,
            imageUrl: imageUrl || undefined,
            numberId: senderId,
            status: 'waiting',
            scheduledAt: Date.now() + timeOffset,
            retryCount: 0,
          });
          timeOffset += randomQueueInterval();
        }
      }
    } else {
      // TextNow mode: cycle through accounts
      for (const phoneId of selectedSenders) {
        const binding = bindings.find((b) => b.phoneId === phoneId);
        if (!binding) continue;
        const slotAccounts = binding.slots
          .map((id) => (id ? accounts.find((a) => a.id === id) : null))
          .filter(Boolean);
        for (let c = 0; c < cycleCount; c++) {
          for (let si = 0; si < slotAccounts.length; si++) {
            const acct = slotAccounts[si % slotAccounts.length];
            const contact = contacts[c % contacts.length];
            if (!acct || !contact) continue;
            items.push({
              id: generateId(),
              targetNumber: contact,
              message,
              imageUrl: imageUrl || undefined,
              numberId: acct.id,
              status: 'waiting',
              scheduledAt: Date.now() + timeOffset,
              retryCount: 0,
            });
            timeOffset += randomQueueInterval();
          }
        }
      }
    }
    return items;
  }, [mode, selectedSenders, contacts, message, imageUrl, cycleCount, bindings, accounts]);

  const goToStep2 = () => {
    if (!message.trim()) return;
    setStep(2);
  };

  const goToStep3 = () => {
    if (contacts.length === 0 || selectedSenders.length === 0) return;
    const q = buildQueue();
    setQueue(q);
    setTaskName(`群发 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
    setStep(3);
  };

  // 启动后台任务（关闭弹窗后继续运行）
  const handleRun = () => {
    if (!settings.apiKey) return;
    const taskId = createTask({
      name: taskName,
      message,
      imageUrl: imageUrl || undefined,
      mode,
      targetNumbers: mode === 'cloud_number' ? selectedSenders : [],
      targetPhones: mode === 'textnow' ? selectedSenders : [],
      intervalMin: QUEUE_INTERVAL_MIN,
      intervalMax: QUEUE_INTERVAL_MAX,
      status: 'pending',
      queue,
    });
    setActiveTaskId(taskId);
    runTaskInBackground(taskId, settings.apiKey, settings.apiRegion, (_tid, _iid, ok) => {
      if (ok) setSent(s => s + 1);
    });
  };

  const handleAbort = () => { if (activeTaskId) abortTask(activeTaskId); };

  const totalDurationSec = queue.length > 0
    ? Math.round(((QUEUE_INTERVAL_MIN + QUEUE_INTERVAL_MAX) / 2) * (queue.length - 1))
    : 0;
  const durationLabel = totalDurationSec > 3600
    ? `约 ${Math.round(totalDurationSec / 3600)} 小时`
    : `约 ${Math.round(totalDurationSec / 60)} 分钟`;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="tool-window rounded-[18px] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="tool-header flex items-center gap-3 px-6 py-4">
            <Send size={18} className="text-primary" />
            <span className="font-semibold text-foreground">创建群发任务</span>
            <div className="ml-4 flex gap-1">
              {[1, 2, 3].map((s) => (
                <div key={s} className={cn('w-6 h-1.5 rounded-full transition', step >= s ? 'bg-primary' : 'bg-slate-200')} />
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3">
              {/* Mode toggle */}
              <div className="tool-tabs flex text-xs">
                {(['cloud_number', 'textnow'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => !running && setMode(m)}
                    className={cn('tool-tab px-3 py-1.5 rounded-[6px] font-medium transition', mode === m ? 'tool-tab-active text-foreground' : 'text-muted-foreground')}
                  >
                    {m === 'cloud_number' ? '云号码' : 'TextNow'}
                  </button>
                ))}
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-[linear-gradient(180deg,#ffffff_0%,#fafbfd_100%)]">
            {/* ─── STEP 1: Message ─── */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">消息内容 <span className="text-destructive">*</span></label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    placeholder="输入要群发的消息内容..."
                    className="tool-textarea px-4 py-3 text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{message.length} 字符</p>
                </div>

                {/* Image attachment */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">图片附件（选填）</label>
                  <div
                    onDrop={handleImageDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="border-2 border-dashed border-[#d2d9e1] rounded-[12px] p-4 text-center hover:border-primary/50 transition cursor-pointer bg-[linear-gradient(180deg,#fcfdff_0%,#f5f8fb_100%)]"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    {imagePreview ? (
                      <div className="relative inline-block">
                        <img src={imagePreview} alt="preview" className="max-h-32 rounded-[10px] object-contain mx-auto" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setImagePreview(''); setImageUrl(''); }}
                          className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Image size={24} />
                        <p className="text-sm">点击上传或拖拽图片</p>
                        <p className="text-xs">支持 JPG / PNG / GIF</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
                  />
                  {/* Or input URL directly */}
                  {!imagePreview && (
                    <input
                      className="tool-input mt-2 h-8 px-3 text-sm"
                      placeholder="或输入图片 URL"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ─── STEP 2: Targets ─── */}
            {step === 2 && (
              <div className="space-y-5">
                {/* Contact number import */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-foreground">
                      目标号码 <span className="text-destructive">*</span>
                      {contacts.length > 0 && <span className="ml-2 text-emerald-600 font-mono text-xs">({contacts.length} 个)</span>}
                    </label>
                    <button
                      onClick={() => setShowContactImport(!showContactImport)}
                      className="text-xs text-primary flex items-center gap-1"
                    >
                      <FileText size={12} />
                      从文件导入
                      {showContactImport ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>

                  <textarea
                    value={contactRaw}
                    onChange={(e) => setContactRaw(e.target.value)}
                    rows={4}
                    placeholder={`每行一个号码，例如：\n+12135551234\n+13105559876\n\n也支持逗号分隔`}
                    className="tool-textarea px-4 py-3 text-sm font-mono"
                  />

                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={handleParseContacts}
                      className="tool-btn tool-btn-primary px-4 py-1.5 text-xs font-medium"
                    >
                      <Plus size={13} /> 解析号码
                    </button>
                    {showContactImport && (
                      <label className="tool-btn px-4 py-1.5 text-xs text-slate-600 cursor-pointer">
                        <Upload size={13} /> 上传 TXT/CSV
                        <input type="file" accept=".txt,.csv" className="hidden" onChange={handleContactFile} />
                      </label>
                    )}
                    {contacts.length > 0 && (
                      <button onClick={() => { setContacts([]); setContactRaw(''); }} className="text-xs text-destructive hover:underline">清空</button>
                    )}
                  </div>

                  {contacts.length > 0 && (
                    <div className="mt-3 max-h-28 overflow-y-auto bg-[linear-gradient(180deg,#fbfcfe_0%,#f2f5f8_100%)] rounded-[12px] p-3 flex flex-wrap gap-1.5 border border-[#dbe2e9]">
                      {contacts.slice(0, 50).map((n, i) => (
                        <span key={i} className="font-mono text-[10px] bg-white border border-[#dbe2e9] rounded px-1.5 py-0.5 text-slate-700">
                          {n}
                        </span>
                      ))}
                      {contacts.length > 50 && (
                        <span className="text-xs text-muted-foreground">…还有 {contacts.length - 50} 个</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Sender selection */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    {mode === 'cloud_number' ? '发送号码' : '设备'} <span className="text-destructive">*</span>
                    {selectedSenders.length > 0 && <span className="ml-2 text-primary text-xs">({selectedSenders.length} 已选)</span>}
                  </label>

                  {mode === 'cloud_number' ? (
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {cloudNumbers.map((cn_) => {
                        const sel = selectedSenders.includes(cn_.id);
                        return (
                          <div
                            key={cn_.id}
                            onClick={() => toggleSender(cn_.id)}
                            className={cn(
                              'border rounded-[12px] p-3 cursor-pointer transition',
                              sel ? 'border-primary bg-[linear-gradient(180deg,#edf5ff_0%,#e6f0fd_100%)]' : 'border-[#dbe2e9] hover:border-primary/40 bg-white'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{cn_.number}</span>
                              {sel && <CheckCircle2 size={14} className="ml-auto text-primary" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto mb-3">
                        {cloudPhones.map((phone) => {
                          const sel = selectedSenders.includes(phone.id);
                          const binding = bindings.find((b) => b.phoneId === phone.id);
                          const slotCount = binding?.slots.filter(Boolean).length ?? 0;
                          return (
                            <div
                              key={phone.id}
                              onClick={() => toggleSender(phone.id)}
                              className={cn(
                                'border rounded-[12px] p-3 cursor-pointer transition',
                                sel ? 'border-primary bg-[linear-gradient(180deg,#edf5ff_0%,#e6f0fd_100%)]' : 'border-[#dbe2e9] hover:border-primary/40 bg-white'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{phone.name || phone.id}</span>
                                {sel && <CheckCircle2 size={14} className="ml-auto text-primary" />}
                              </div>
                              <p className="text-[10px] text-muted-foreground">{slotCount} 个账号</p>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-sm text-muted-foreground">每台轮发轮次</label>
                        <input
                          type="number" min={1} max={50} value={cycleCount}
                          onChange={(e) => setCycleCount(Math.max(1, parseInt(e.target.value) || 1))}
                          className="tool-input w-20 h-8 px-3 text-sm text-center"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ─── STEP 3: Queue Preview ─── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-[12px] px-4 py-3">
                  <Clock size={16} className="text-amber-500 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium text-amber-700">发送计划</span>
                    <span className="text-amber-600 ml-2">
                      共 {queue.length} 条消息，每轮间隔 {QUEUE_INTERVAL_MIN}–{QUEUE_INTERVAL_MAX}s，{queue.length > 1 ? durationLabel : '立即完成'}
                    </span>
                  </div>
                </div>

                <input
                  className="tool-input w-full h-9 px-4 text-sm"
                  placeholder="任务名称"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                />

                {running && (
                  <div className="bg-[linear-gradient(180deg,#fbfcfe_0%,#f2f5f8_100%)] rounded-[12px] p-3 border border-[#dbe2e9]">
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 size={14} className="text-primary animate-spin" />
                      <span className="text-sm text-foreground font-medium">发送中… {sent}/{queue.length}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${Math.round((sent / queue.length) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Queue list */}
                <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-[12px] border border-[#dbe2e9] p-3 bg-[linear-gradient(180deg,#ffffff_0%,#fafbfd_100%)]">
                  {(activeTask?.queue ?? queue).map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/50 last:border-0">
                      <span className="w-6 text-muted-foreground font-mono text-center shrink-0">{idx + 1}</span>
                      <span className="font-mono text-slate-700 w-32 truncate">{item.targetNumber}</span>
                      <span className="text-muted-foreground truncate flex-1">{item.message.slice(0, 30)}{item.message.length > 30 ? '…' : ''}</span>
                      {item.imageUrl && <Image size={11} className="text-blue-400 shrink-0" />}
                      <span className={cn(
                        'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium',
                        item.status === 'waiting' ? 'bg-slate-100 text-slate-500' :
                        item.status === 'sending' ? 'bg-blue-100 text-blue-600' :
                        item.status === 'success' ? 'bg-emerald-100 text-emerald-600' :
                        'bg-red-100 text-red-600'
                      )}>
                        {item.status === 'waiting' ? `等待 ${new Date(item.scheduledAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` :
                         item.status === 'sending' ? '发送中' :
                         item.status === 'success' ? '成功' : '失败'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="tool-toolbar flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2">
              {step > 1 && !running && (
                <button
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                  className="tool-btn px-4 py-2 text-sm text-slate-600"
                >
                  上一步
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {step === 1 && (
                <button
                  onClick={goToStep2}
                  disabled={!message.trim()}
                  className="tool-btn tool-btn-primary px-6 py-2 text-sm font-medium disabled:opacity-40"
                >
                  下一步：选择目标 →
                </button>
              )}
              {step === 2 && (
                <button
                  onClick={goToStep3}
                  disabled={contacts.length === 0 || selectedSenders.length === 0}
                  className="tool-btn tool-btn-primary px-6 py-2 text-sm font-medium disabled:opacity-40"
                >
                  下一步：预览队列 →
                </button>
              )}
              {step === 3 && !running && (
                <button
                  onClick={handleRun}
                  disabled={queue.length === 0}
                  className="tool-btn tool-btn-primary flex items-center gap-2 px-6 py-2 text-sm font-medium disabled:opacity-40"
                >
                  <Send size={15} /> 开始群发
                </button>
              )}
              {step === 3 && running && (
                <button
                  onClick={handleAbort}
                  className="tool-btn flex items-center gap-2 px-5 py-2 text-sm font-medium border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
                >
                  <AlertCircle size={15} /> 中止
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
