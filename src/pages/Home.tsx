import { useState, useRef, useEffect } from 'react';
import { Search, Plus, Send, RefreshCw, MessageSquare, Languages, ArrowUpRight, ArrowDownLeft, Inbox } from 'lucide-react';
import { useChatStore, useSettingsStore } from '@/hooks/useStore';
import { cn, getInitials } from '@/lib/index';
import { writeSmsByPhone } from '@/api/duoplus';
import { translateText } from '@/api/translate';
import BroadcastDialog from '@/components/BroadcastDialog';
import type { Conversation, SmsMessage } from '@/lib/index';

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

// ─── 会话列表项 ──────────────────────────────────────────────────────────────
function ConvItem({ conv, isActive, onClick }: { conv: Conversation; isActive: boolean; onClick: () => void }) {
  const lastMsg = conv.lastMessage;
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-[#ebebeb] transition-colors',
        isActive ? 'bg-primary/8 border-l-2 border-l-primary' : 'hover:bg-[#f5f5f5]'
      )}
    >
      {/* 头像 — 纯色圆形缩写 */}
      <div className="relative shrink-0">
        <div className="w-8 h-8 rounded-full bg-[#e8e8e8] flex items-center justify-center text-[10px] font-mono font-semibold text-foreground/60 border border-[#d8d8d8]">
          {getInitials(conv.cloudNumber.number)}
        </div>
        {conv.cloudNumber.status === 'online' && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-white" />
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={cn('text-[12px] font-mono truncate', conv.unreadCount > 0 ? 'font-semibold text-foreground' : 'text-foreground/80')}>
            {conv.cloudNumber.name || conv.cloudNumber.number}
          </span>
          <span className="text-[10px] text-muted-foreground ml-2 shrink-0 font-mono">
            {conv.lastUpdated ? formatMsgTime(conv.lastUpdated) : ''}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">
            {lastMsg ? (lastMsg.direction === 'outbound' ? '↑ ' : '↓ ') + lastMsg.message : '暂无消息'}
          </p>
          {conv.unreadCount > 0 && (
            <span className="ml-1 shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 消息气泡 ────────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status?: string }) {
  if (status === 'pending') return <RefreshCw className="w-2.5 h-2.5 animate-spin opacity-60" />;
  if (status === 'sent') return <span className="text-[10px] text-primary/70">✓✓</span>;
  if (status === 'failed') return <span className="text-[10px] text-red-400">✗</span>;
  return null;
}

function MessageBubble({ msg }: { msg: SmsMessage }) {
  const isOut = msg.direction === 'outbound';
  return (
    <div className={cn('flex mb-1.5', isOut ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[70%] px-3 py-1.5 rounded text-[12px] leading-relaxed',
        isOut
          ? 'bg-primary text-white rounded-br-sm'
          : 'bg-white text-foreground border border-[#e0e0e0] rounded-bl-sm'
      )}>
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="" className="max-w-full rounded mb-1.5 max-h-40 object-contain" />
        )}
        <p className="break-words">{msg.message}</p>
        <div className={cn('flex items-center gap-1 mt-0.5 text-[10px]', isOut ? 'justify-end text-white/60' : 'text-muted-foreground')}>
          <span className="font-mono">{formatMsgTime(msg.receivedAt)}</span>
          {isOut && <StatusIcon status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

// ─── 语言列表 ────────────────────────────────────────────────────────────────
const LANGS = [
  { code: 'en', label: 'English' }, { code: 'zh', label: '中文' },
  { code: 'es', label: 'Español' }, { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' }, { code: 'ar', label: 'العربية' },
  { code: 'ru', label: 'Русский' }, { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' }, { code: 'hi', label: 'हिन्दी' },
];

// ─── 聊天面板 ────────────────────────────────────────────────────────────────
function ChatPanel({ conv }: { conv: Conversation }) {
  const { settings } = useSettingsStore();
  const { sendOutboundMessage, pollMessages } = useChatStore();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [translateOn, setTranslateOn] = useState(false);
  const [targetLang, setTargetLang] = useState('en');
  const [translated, setTranslated] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translateEngine, setTranslateEngine] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const translateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages.length]);

  useEffect(() => {
    if (!translateOn || !input.trim()) { setTranslated(''); setTranslateEngine(''); return; }
    if (translateTimer.current) clearTimeout(translateTimer.current);
    setTranslating(true);
    translateTimer.current = setTimeout(async () => {
      const { result, engine, error } = await translateText(input, {
        engine: settings.translateEngine ?? 'mymemory',
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: settings.ollamaModel,
        targetLang,
      });
      setTranslated(result);
      setTranslateEngine(error ? `${engine}(降级)` : engine);
      setTranslating(false);
    }, 600);
    return () => { if (translateTimer.current) clearTimeout(translateTimer.current); };
  }, [input, translateOn, targetLang, settings.translateEngine, settings.ollamaUrl, settings.ollamaModel]);

  const handleSend = async (useTranslated = false) => {
    const text = (useTranslated ? translated : input).trim();
    if (!text || sending) return;
    setInput(''); setTranslated('');
    setSending(true);
    try {
      if (settings.apiKey) {
        await writeSmsByPhone(settings.apiKey, settings.apiRegion, conv.cloudNumber.id, [
          { phone: conv.contactNumber, message: text },
        ]);
      }
      sendOutboundMessage(conv.id, text);
      if (settings.apiKey) setTimeout(() => pollMessages(settings.apiKey, settings.apiRegion), 2000);
    } catch {
      sendOutboundMessage(conv.id, text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8f8f8]">
      {/* 顶部信息栏 */}
      <div className="flex items-center gap-2.5 px-4 py-2 border-b border-[#d8d8d8] bg-[#f0f0f0] shrink-0">
        <div className="w-7 h-7 rounded-full bg-[#e0e0e0] flex items-center justify-center text-[10px] font-mono font-semibold text-foreground/60 border border-[#ccc]">
          {getInitials(conv.cloudNumber.number)}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-semibold font-mono text-foreground">{conv.cloudNumber.name || conv.cloudNumber.number}</span>
          <span className="text-[10px] text-muted-foreground ml-2">→ {conv.contactNumber || '未知'}</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{conv.messages.length} 条</span>
      </div>

      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {conv.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground/20 mb-2" />
            <p className="text-[11px] text-muted-foreground">暂无消息记录</p>
          </div>
        ) : (
          conv.messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* 翻译预览栏 */}
      {translateOn && input.trim() && (
        <div className="px-4 py-2 border-t border-[#e0e0e0] bg-[#f5f5f5] text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {translating ? '翻译中…' : translated || '—'}
              {translateEngine && !translating && (
                <span className="ml-2 text-[9px] text-primary/60 font-mono">[{translateEngine}]</span>
              )}
            </span>
            {translated && !translating && (
              <button
                onClick={() => handleSend(true)}
                disabled={sending}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-600 text-white text-[10px] font-medium hover:bg-green-700 disabled:opacity-50"
              >
                <Send size={9} /> 发译文
              </button>
            )}
          </div>
        </div>
      )}

      {/* 输入区 */}
      <div className="px-3 py-2 border-t border-[#d0d0d0] bg-[#f0f0f0] shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <button
            onClick={() => setTranslateOn(!translateOn)}
            className={cn(
              'flex items-center gap-1 px-2 h-5 rounded text-[10px] font-medium transition border',
              translateOn ? 'bg-primary text-white border-primary' : 'bg-white text-muted-foreground border-[#c8c8c8] hover:border-primary hover:text-primary'
            )}
          >
            <Languages size={10} /> 翻译
          </button>
          {translateOn && (
            <select
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
              className="h-5 px-1.5 text-[10px] border border-[#c8c8c8] rounded bg-white text-foreground outline-none"
            >
              {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          )}
          <span className="ml-auto text-[9px] text-muted-foreground">Enter 发送 · Shift+Enter 换行</span>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="输入消息…"
            rows={2}
            className="flex-1 resize-none rounded border border-[#c8c8c8] bg-white px-3 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition min-h-[44px] max-h-24"
          />
          <button
            onClick={() => handleSend(false)}
            disabled={!input.trim() || sending}
            className="flex items-center justify-center w-9 h-9 rounded bg-primary text-white shadow-btn hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0"
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
    <div className="flex flex-col items-center justify-center h-full bg-[#f8f8f8] text-center">
      <MessageSquare className="w-10 h-10 text-muted-foreground/15 mb-3" />
      <p className="text-[12px] text-muted-foreground">从左侧选择号码开始聊天</p>
    </div>
  );
}

// ─── 筛选 ────────────────────────────────────────────────────────────────────
type ConvFilter = 'all' | 'unread' | 'inbound' | 'outbound';
const CONV_FILTERS: { value: ConvFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'inbound', label: '收到' },
  { value: 'outbound', label: '发出' },
];
function applyFilter(convs: Conversation[], f: ConvFilter) {
  if (f === 'unread') return convs.filter(c => c.unreadCount > 0);
  if (f === 'inbound') return convs.filter(c => c.lastMessage?.direction === 'inbound');
  if (f === 'outbound') return convs.filter(c => c.lastMessage?.direction === 'outbound');
  return convs;
}

// ─── 主页 ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConvFilter>('all');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const { conversations, activeConversationId, setActiveConversation } = useChatStore();

  const searched = conversations.filter(c => {
    const q = search.toLowerCase();
    return c.cloudNumber.number.toLowerCase().includes(q) || (c.cloudNumber.name?.toLowerCase().includes(q) ?? false);
  });
  const filtered = applyFilter(searched, filter);
  const sorted = [...filtered].sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
    if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
    return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
  });
  const activeConv = conversations.find(c => c.id === activeConversationId);

  return (
    <>
      {/* ── 左栏：会话列表 ─────────────────────────────────────── */}
      <div className="w-[260px] shrink-0 h-full flex flex-col border-r border-[#d0d0d0] bg-[#f7f7f7]">

        {/* 搜索 + 群发 */}
        <div className="px-2 py-2 border-b border-[#d8d8d8] space-y-1.5 shrink-0 bg-[#efefef]">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索号码…"
                className="w-full h-6 pl-6 pr-2 text-[11px] rounded border border-[#c8c8c8] bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition placeholder:text-muted-foreground/40"
              />
            </div>
            <button
              onClick={() => setShowBroadcast(true)}
              className="flex items-center gap-1 h-6 px-2 rounded bg-primary text-white text-[10px] font-medium shadow-btn hover:opacity-90 transition-opacity shrink-0"
            >
              <Plus size={10} /> 群发
            </button>
          </div>

          {/* 筛选 tabs */}
          <div className="flex gap-0.5">
            {CONV_FILTERS.map(({ value, label }) => {
              const cnt = value === 'all' ? conversations.length : applyFilter(conversations, value).length;
              return (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    'flex-1 h-5 text-[10px] font-medium rounded transition-colors',
                    filter === value
                      ? 'bg-primary text-white'
                      : 'bg-white text-muted-foreground border border-[#d0d0d0] hover:border-primary hover:text-primary'
                  )}
                >
                  {label}{cnt > 0 ? ` ${cnt}` : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <Inbox className="w-6 h-6 text-muted-foreground/20 mb-2" />
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
        <div className="px-3 py-1.5 border-t border-[#d8d8d8] bg-[#efefef] shrink-0">
          <p className="text-[9px] text-muted-foreground font-mono">{conversations.length} 个号码 · 自动轮询</p>
        </div>
      </div>

      {/* ── 右栏：聊天 ─────────────────────────────────────────── */}
      <div className="flex-1 h-full min-w-0">
        {activeConv ? <ChatPanel conv={activeConv} /> : <EmptyChat />}
      </div>

      <BroadcastDialog open={showBroadcast} onClose={() => setShowBroadcast(false)} />
    </>
  );
}
