import { useState, useRef, useEffect } from 'react';
import { Search, Plus, Send, RefreshCw, MessageSquare, Languages, Inbox, Image as ImageIcon, Smile, Paperclip, X } from 'lucide-react';
import { useChatStore, useSettingsStore } from '@/hooks/useStore';
import { cn, getInitials } from '@/lib/index';
import { writeSmsByPhone } from '@/api/duoplus';
import { translateText } from '@/api/translate';
import BroadcastDialog from '@/components/BroadcastDialog';
import type { Conversation, SmsMessage } from '@/lib/index';
import { toast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ─── 时间格式化 ──────────────────────────────────────────────────────────────
function formatMsgTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const hm = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (date >= todayStart) return hm;
  if (date >= yesterdayStart) return `昨天 ${hm}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${hm}`;
}

// ─── 彩色头像色生成（按号码哈希） ────────────────────────────────────────────
const AVATAR_COLORS = [
  ['#FF6B6B', '#FF8E53'], ['#4FACFE', '#00F2FE'],
  ['#43E97B', '#38F9D7'], ['#FA709A', '#FEE140'],
  ['#A18CD1', '#FBC2EB'], ['#F093FB', '#F5576C'],
  ['#4481EB', '#04BEFE'], ['#0BA360', '#3CBA92'],
];
function getAvatarGradient(str: string): string[] {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ─── 会话列表项 ──────────────────────────────────────────────────────────────
function ConvItem({ conv, isActive, onClick }: { conv: Conversation; isActive: boolean; onClick: () => void }) {
  const lastMsg = conv.lastMessage;
  const num = conv.cloudNumber.number;
  const [c1, c2] = getAvatarGradient(num);
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors min-h-[60px]',
        'border-b border-black/[0.04]',
        isActive
          ? 'bg-primary/[0.07]'
          : 'hover:bg-black/[0.03]'
      )}
    >
      {/* 彩色数字头像 */}
      <div
        className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-[11px] font-mono font-bold text-white"
        style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)` }}
      >
        {getInitials(num)}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={cn(
            'text-[13px] font-mono truncate',
            conv.unreadCount > 0 ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
          )}>
            {conv.cloudNumber.name || num}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {conv.lastUpdated ? formatMsgTime(conv.lastUpdated) : ''}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-[11px] text-muted-foreground truncate max-w-[150px]">
            {lastMsg ? (lastMsg.direction === 'outbound' ? '↑ ' : '↓ ') + lastMsg.message : '暂无消息'}
          </p>
          {conv.unreadCount > 0 && (
            <span className="ios-badge shrink-0">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 消息气泡状态图标 ─────────────────────────────────────────────────────────
function StatusIcon({ status }: { status?: string }) {
  if (status === 'pending') return <RefreshCw className="w-2.5 h-2.5 animate-spin opacity-60" />;
  if (status === 'sent') return <span className="text-[10px] text-primary/70">✓✓</span>;
  if (status === 'failed') return <span className="text-[10px] text-red-400">✗</span>;
  return null;
}

function MessageBubble({
  msg,
  translatedText,
  translating,
  targetLang,
}: {
  msg: SmsMessage;
  translatedText?: string;
  translating?: boolean;
  targetLang: string;
}) {
  const isOut = msg.direction === 'outbound';
  return (
    <div className={cn('flex flex-col mb-1.5', isOut ? 'items-end' : 'items-start')}>
      <div className={cn(isOut ? 'ios-bubble-out ml-auto' : 'ios-bubble-in mr-auto', 'max-w-[70%]')}>
        {msg.mediaUrl && (
          <img
            src={msg.mediaUrl}
            alt="图片"
            className="rounded-lg mb-1.5 max-w-full max-h-48 object-cover"
          />
        )}
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.message}</p>
        <div className={cn('flex items-center gap-1 mt-1', isOut ? 'justify-end' : 'justify-start')}>
          <span className="text-[10px] text-muted-foreground opacity-70">
            {msg.sentAt ? formatMsgTime(msg.sentAt) : ''}
          </span>
          {isOut && <StatusIcon status={msg.status} />}
        </div>
      </div>
      {/* 翻译结果 */}
      {!isOut && translating && (
        <p className="text-[10px] text-muted-foreground italic mt-0.5 ml-1 animate-pulse">翻译中…</p>
      )}
      {!isOut && translatedText && !translating && (
        <p className="text-[10px] text-muted-foreground italic mt-0.5 ml-1">{translatedText}</p>
      )}
    </div>
  );
}

// ─── Languages选项 ─────────────────────────────────────────────────────────────────
const LANG_OPTIONS = [
  { value: 'en', label: '英文' },
  { value: 'zh-CN', label: '中文' },
  { value: 'es', label: '西班牙语' },
  { value: 'ar', label: '阿拉伯语' },
  { value: 'ru', label: '俄语' },
  { value: 'pt', label: '葡萄牙语' },
  { value: 'fr', label: '法语' },
];

// ─── 聊天区 ──────────────────────────────────────────────────────────────────
function ChatArea({ conv }: { conv: Conversation }) {
  const { settings } = useSettingsStore();
  const { markRead, addMessage } = useChatStore();
  const [input, setInput] = useState('');
  const [translated, set翻译d] = useState('');
  const [sending, setSending] = useState(false);
  const [translateOn, set翻译On] = useState(false);
  const [targetLang, setTargetLang] = useState('en');
  const [translating, setTranslating] = useState(false);
  const [translateEngine, set翻译Engine] = useState('');
  const [langOpen, setLangOpen] = useState(false);
  const [inboundTranslations, setInboundTranslations] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Record<string, boolean>>({});
  const [selectedImage, setSelectedImage] = useState<{ name: string; url: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const translateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightTranslations = useRef<Set<string>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages.length]);

  useEffect(() => {
    setInput('');
    set翻译d('');
    setSelectedImage(null);
    setInboundTranslations({});
    setTranslatingIds({});
    inflightTranslations.current.clear();
  }, [conv.id]);

  useEffect(() => {
    if (!translateOn || !input.trim()) { set翻译d(''); set翻译Engine(''); return; }
    if (translateTimer.current) clearTimeout(translateTimer.current);
    setTranslating(true);
    translateTimer.current = setTimeout(async () => {
      const { result, engine, error } = await translateText(input, {
        engine: settings.translateEngine ?? 'mymemory',
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: settings.ollamaModel,
        targetLang,
      });
      set翻译d(result);
      set翻译Engine(error ? `${engine}(降级)` : engine);
      setTranslating(false);
    }, 600);
    return () => { if (translateTimer.current) clearTimeout(translateTimer.current); };
  }, [input, translateOn, targetLang, settings.translateEngine, settings.ollamaUrl, settings.ollamaModel]);

  useEffect(() => {
    if (!translateOn) return;
    conv.messages
      .filter((msg) => msg.direction === 'inbound' && !!msg.message.trim())
      .forEach((msg) => {
        const cacheKey = `${msg.id}:${targetLang}`;
        if (inboundTranslations[cacheKey] !== undefined || inflightTranslations.current.has(cacheKey)) return;
        inflightTranslations.current.add(cacheKey);
        setTranslatingIds((current) => ({ ...current, [cacheKey]: true }));
        void translateText(msg.message, {
          engine: settings.translateEngine ?? 'mymemory',
          ollamaUrl: settings.ollamaUrl,
          ollamaModel: settings.ollamaModel,
          targetLang,
        }).then(({ result }) => {
          setInboundTranslations((current) => ({ ...current, [cacheKey]: result || '' }));
        }).catch(() => {
          setInboundTranslations((current) => ({ ...current, [cacheKey]: '' }));
        }).finally(() => {
          inflightTranslations.current.delete(cacheKey);
          setTranslatingIds((current) => ({ ...current, [cacheKey]: false }));
        });
      });
  }, [conv.messages, inboundTranslations, settings.ollamaModel, settings.ollamaUrl, settings.translateEngine, targetLang, translateOn]);

  useEffect(() => {
    return () => {
      if (selectedImage?.url?.startsWith('blob:')) URL.revokeObjectURL(selectedImage.url);
    };
  }, [selectedImage]);

  const handlePickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (selectedImage?.url?.startsWith('blob:')) URL.revokeObjectURL(selectedImage.url);
    const url = URL.createObjectURL(file);
    setSelectedImage({ name: file.name, url });
    event.target.value = '';
  };

  const handleSend = async (use翻译d = false) => {
    const text = (use翻译d ? translated : input).trim();
    if ((!text && !selectedImage) || sending) return;
    const previewImage = selectedImage;
    if (previewImage) {
      toast({
        title: '外部通道图片尚未接通',
        description: '当前第三方号码聊天仅支持文本直发；图片Send将改走 DuoPlus 云机自动化流程。',
      });
      return;
    }
    setInput('');
    set翻译d('');
    setSending(true);
    try {
      if (settings.apiKey) {
        await writeSmsByPhone(settings.apiKey, settings.apiRegion, conv.cloudNumber.number, conv.contactNumber, text);
      }
      addMessage(conv.id, {
        id: `msg-${Date.now()}`,
        direction: 'outbound',
        message: text,
        sentAt: new Date().toISOString(),
        status: 'sent',
      });
    } catch (err) {
      toast({ title: 'Send失败', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const currentLangLabel = LANG_OPTIONS.find(l => l.value === targetLang)?.label ?? targetLang;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶栏 */}
      <div className="ios-nav-bar h-12 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[15px] font-semibold text-foreground truncate font-mono">
            {conv.cloudNumber.name || conv.cloudNumber.number}
          </span>
          <span className="text-[11px] text-muted-foreground">→ {conv.contactNumber || '未知'}</span>
        </div>
        {/* 翻译 toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground">翻译</span>
          <button
            type="button"
            onClick={() => set翻译On(v => !v)}
            className={cn(
              'relative inline-flex h-[22px] w-[38px] rounded-full border-2 border-transparent transition-colors duration-200',
              translateOn ? 'bg-primary' : 'bg-black/20'
            )}
          >
            <span className={cn(
              'inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200',
              translateOn ? 'translate-x-[16px]' : 'translate-x-0'
            )} />
          </button>
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {conv.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-[12px] text-muted-foreground">暂无消息记录</p>
          </div>
        ) : (
          conv.messages.map((msg) => {
            const cacheKey = `${msg.id}:${targetLang}`;
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                translatedText={inboundTranslations[cacheKey]}
                translating={!!translatingIds[cacheKey]}
                targetLang={targetLang}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* 翻译预览栏 */}
      {translateOn && input.trim() && (
        <div className="px-4 py-2 border-t border-black/[0.06] bg-white/60 backdrop-blur-sm text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground flex-1 truncate">
              {translating ? '翻译中…' : translated || '—'}
              {translateEngine && !translating && (
                <span className="ml-1.5 text-[9px] text-primary/60 font-mono">[{translateEngine}]</span>
              )}
            </span>
            {translated && !translating && (
              <button
                onClick={() => handleSend(true)}
                disabled={sending}
                className="tool-btn-primary h-6 px-2.5 text-[10px] rounded-full flex items-center gap-1 shrink-0"
              >
                <Send size={9} /> 发译文
              </button>
            )}
          </div>
        </div>
      )}

      {/* 图片预览 */}
      {selectedImage && (
        <div className="mx-3 mb-1.5 flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white/80 px-3 py-2">
          <img src={selectedImage.url} alt={selectedImage.name} className="h-12 w-12 rounded-lg object-cover border border-black/[0.06]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-foreground font-medium">{selectedImage.name}</p>
            <p className="text-[10px] text-muted-foreground">图片Send需走 DuoPlus 自动化流程</p>
          </div>
          <button
            type="button"
            onClick={() => { if (selectedImage.url.startsWith('blob:')) URL.revokeObjectURL(selectedImage.url); setSelectedImage(null); }}
            className="w-5 h-5 rounded-full bg-black/10 flex items-center justify-center hover:bg-black/20 transition"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* 底部输入栏 */}
      <div className="ios-input-bar px-3 py-2.5 shrink-0">
        {/* 工具行 */}
        <div className="flex items-center gap-2 mb-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickImage} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="tool-btn-quiet w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="选择图片"
          >
            <ImageIcon size={13} />
          </button>
          <button
            type="button"
            onClick={() => setInput((v) => `${v}${v ? ' ' : ''}😊`)}
            className="tool-btn-quiet w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="插入表情"
          >
            <Smile size={13} />
          </button>

          {/* Languages Popover */}
          <Popover open={langOpen} onOpenChange={setLangOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={() => set翻译On(true)}
                className={cn(
                  'inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-medium transition border',
                  translateOn
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-muted-foreground border-black/[0.1] hover:border-primary hover:text-primary'
                )}
              >
                <Languages size={11} />
                {currentLangLabel}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-44 p-1.5 rounded-xl shadow-lg border border-black/[0.08]">
              {LANG_OPTIONS.map(lang => (
                <button
                  key={lang.value}
                  onClick={() => { setTargetLang(lang.value); setLangOpen(false); }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 rounded-lg text-[12px] transition-colors',
                    lang.value === targetLang
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-foreground hover:bg-black/[0.04]'
                  )}
                >
                  {lang.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <span className="ml-auto text-[9px] text-muted-foreground/60">Enter Send · Shift+Enter 换行</span>
        </div>

        {/* 输入行 */}
        <div className="flex items-end gap-2">
          <div className="ios-input-bubble flex-1 min-h-[38px] max-h-32 overflow-auto">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="输入消息…"
              rows={1}
              className="w-full bg-transparent resize-none outline-none text-[13px] text-foreground placeholder:text-muted-foreground/40 leading-relaxed"
              style={{ minHeight: 22 }}
            />
          </div>
          <button
            onClick={() => handleSend(false)}
            disabled={(!input.trim() && !selectedImage) || sending}
            className="ios-send-btn shrink-0"
          >
            {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 空状态 ──────────────────────────────────────────────────────────────────
function EmptyChat() {
  return (
    <div className="tool-empty h-full bg-[var(--background)]">
      <MessageSquare className="w-12 h-12 text-muted-foreground/20 mb-3" />
      <p className="text-[13px] text-muted-foreground">从左侧选择号码开始聊天</p>
    </div>
  );
}

// ─── 筛选 ────────────────────────────────────────────────────────────────────
type Conv筛选 = 'all' | 'unread' | 'inbound' | 'outbound';
const CONV_FILTERS: { value: Conv筛选; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'inbound', label: '收到' },
  { value: 'outbound', label: '发出' },
];
function apply筛选(convs: Conversation[], f: Conv筛选) {
  if (f === 'unread') return convs.filter(c => c.unreadCount > 0);
  if (f === 'inbound') return convs.filter(c => c.lastMessage?.direction === 'inbound');
  if (f === 'outbound') return convs.filter(c => c.lastMessage?.direction === 'outbound');
  return convs;
}

// ─── 主页 ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [search, setSearch] = useState('');
  const [filter, set筛选] = useState<Conv筛选>('all');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const { conversations, activeConversationId, setActiveConversation } = useChatStore();

  const searched = conversations.filter(c => {
    const q = search.toLowerCase();
    return c.cloudNumber.number.toLowerCase().includes(q) || (c.cloudNumber.name?.toLowerCase().includes(q) ?? false);
  });
  const filtered = apply筛选(searched, filter);
  const sorted = [...filtered].sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
    if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
    return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
  });
  const activeConv = conversations.find(c => c.id === activeConversationId);

  return (
    <>
      {showBroadcast && <BroadcastDialog onClose={() => setShowBroadcast(false)} />}

      {/* ── 左栏：会话列表 ─────────────────────────────────────── */}
      <div
        className="shrink-0 h-full flex flex-col bg-white/80"
        style={{ width: 260, borderRight: '0.5px solid rgba(0,0,0,0.09)' }}
      >
        {/* Search栏 */}
        <div
          className="h-12 px-3 flex items-center gap-2 shrink-0"
          style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              className="tool-input h-8 w-full pl-8 pr-3 rounded-full text-[13px] placeholder:text-muted-foreground/50"
            />
          </div>
          <button
            onClick={() => setShowBroadcast(true)}
            className="tool-btn-primary h-8 w-8 rounded-full flex items-center justify-center shrink-0"
            title="群发"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* 筛选 tabs */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 shrink-0">
          {CONV_FILTERS.map(({ value, label }) => {
            const cnt = value === 'all' ? conversations.length : apply筛选(conversations, value).length;
            return (
              <button
                key={value}
                onClick={() => set筛选(value)}
                className={cn(
                  'flex-1 h-6 text-[10px] font-medium rounded-full transition-colors',
                  filter === value
                    ? 'tool-tab-active'
                    : 'tool-tab'
                )}
              >
                {label}{cnt > 0 ? ` ${cnt}` : ''}
              </button>
            );
          })}
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <Inbox className="w-7 h-7 text-muted-foreground/20 mb-2" />
              <p className="text-[11px] text-muted-foreground">
                {conversations.length === 0 ? '请配置 API Key' : '无匹配结果'}
              </p>
            </div>
          ) : sorted.map(conv => (
            <ConvItem
              key={conv.id}
              conv={conv}
              isActive={conv.id === activeConversationId}
              onClick={() => setActiveConversation(conv.id)}
            />
          ))}
        </div>

        {/* 底部计数 */}
        <div className="px-3 py-2 shrink-0" style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
          <p className="text-[9px] text-muted-foreground font-mono">{conversations.length} 个号码 · 自动轮询</p>
        </div>
      </div>

      {/* ── 右栏：聊天 ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--background)' }}>
        {activeConv ? <ChatArea conv={activeConv} /> : <EmptyChat />}
      </div>
    </>
  );
}
