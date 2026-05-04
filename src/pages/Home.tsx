import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, Send, RefreshCw, MessageSquare, Languages, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore, useSettingsStore } from '@/hooks/useStore';
import { cn, formatTime, getInitials, SUPABASE_CONFIGURED } from '@/lib/index';
import { writeSmsByPhone } from '@/api/duoplus';
import BroadcastDialog from '@/components/BroadcastDialog';
import type { Conversation } from '@/lib/index';

// ─── Translation helper (MyMemory free API, CORS-friendly) ───────────────────
async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text.trim()) return '';
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const json = await res.json() as { responseData?: { translatedText?: string } };
    return json.responseData?.translatedText ?? '';
  } catch {
    return '';
  }
}

// ─── Conversation List Item ───────────────────────────────────────────────────
function ConvItem({ conv, isActive, onClick }: { conv: Conversation; isActive: boolean; onClick: () => void }) {
  const lastMsg = conv.lastMessage;
  return (
    <motion.div
      layout
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-3 cursor-pointer rounded-xl mx-2 transition-all duration-150',
        isActive ? 'bg-primary/10 border border-primary/30' : 'hover:bg-slate-100 border border-transparent'
      )}
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-primary font-mono font-semibold text-xs border border-primary/20">
          {getInitials(conv.cloudNumber.number)}
        </div>
        {conv.cloudNumber.status === 'online' && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm font-medium text-foreground font-mono truncate">
            {conv.cloudNumber.name || conv.cloudNumber.number}
          </span>
          <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
            {conv.lastUpdated ? formatTime(conv.lastUpdated) : ''}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">
            {lastMsg ? (lastMsg.direction === 'outbound' ? '你: ' : '') + lastMsg.message : '暂无消息'}
          </p>
          {conv.unreadCount > 0 && (
            <span className="ml-2 shrink-0 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: { direction: string; message: string; imageUrl?: string; receivedAt: string; status?: string } }) {
  const isOut = msg.direction === 'outbound';
  return (
    <div className={cn('flex mb-2', isOut ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[72%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm',
        isOut ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-white text-foreground rounded-tl-sm border border-border'
      )}>
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="img" className="max-w-full rounded-lg mb-2 max-h-48 object-contain" />
        )}
        <p className="break-words">{msg.message}</p>
        <div className={cn('flex items-center gap-1 mt-1 text-[10px]', isOut ? 'justify-end text-primary-foreground/70' : 'text-muted-foreground')}>
          <span className="font-mono">{new Date(msg.receivedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
          {isOut && msg.status === 'sent' && <span>✓✓</span>}
          {isOut && msg.status === 'failed' && <span className="text-red-300">✗</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────
const LANGS = [
  { code: 'zh', label: '中文' }, { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' }, { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' }, { code: 'ar', label: 'العربية' },
  { code: 'ru', label: 'Русский' }, { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' }, { code: 'hi', label: 'हिन्दी' },
];

function ChatPanel({ conv }: { conv: Conversation }) {
  const { settings } = useSettingsStore();
  const { sendOutboundMessage, pollMessages } = useChatStore();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Translation state
  const [translateOn, setTranslateOn] = useState(false);
  const [targetLang, setTargetLang] = useState('en');
  const [translated, setTranslated] = useState('');
  const [translating, setTranslating] = useState(false);
  const translateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages.length]);

  // Debounced translation
  useEffect(() => {
    if (!translateOn || !input.trim()) { setTranslated(''); return; }
    if (translateTimer.current) clearTimeout(translateTimer.current);
    setTranslating(true);
    translateTimer.current = setTimeout(async () => {
      const result = await translateText(input, targetLang);
      setTranslated(result);
      setTranslating(false);
    }, 600);
    return () => { if (translateTimer.current) clearTimeout(translateTimer.current); };
  }, [input, translateOn, targetLang]);

  const handleSend = async (useTranslated = false) => {
    const text = (useTranslated ? translated : input).trim();
    if (!text || sending) return;
    setInput(''); setTranslated('');
    setSending(true);
    try {
      if (SUPABASE_CONFIGURED) {
        await writeSmsByPhone(settings.apiKey, settings.apiRegion, conv.cloudNumber.id, [
          { phone: conv.contactNumber, message: text },
        ]);
      }
      sendOutboundMessage(conv.id, text);
      // 发送后 2s 立即拉取一次最新消息（减少延迟感）
      if (SUPABASE_CONFIGURED) {
        setTimeout(() => pollMessages(settings.apiKey, settings.apiRegion), 2000);
      }
    } catch {
      sendOutboundMessage(conv.id, text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-white shrink-0 shadow-sm">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center text-primary font-mono font-bold text-xs border border-primary/20">
          {getInitials(conv.cloudNumber.number)}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground font-mono">{conv.cloudNumber.name || conv.cloudNumber.number}</p>
          <p className="text-xs text-muted-foreground">对方: {conv.contactNumber || '未知'}</p>
        </div>
        <div className="ml-auto text-[10px] font-mono text-muted-foreground">{conv.messages.length} 条消息</div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5">
        <AnimatePresence>
          {conv.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">暂无消息记录</p>
            </div>
          ) : (
            conv.messages.map((msg) => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                <MessageBubble msg={msg} />
              </motion.div>
            ))
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="px-4 py-3 border-t border-border bg-white shrink-0">
        {/* Translation bar */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setTranslateOn(!translateOn)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition border',
              translateOn ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            <Languages size={12} />
            实时翻译
          </button>
          {translateOn && (
            <>
              <span className="text-xs text-muted-foreground">→</span>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="text-xs border border-border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* Translation preview */}
        <AnimatePresence>
          {translateOn && (input.trim()) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 bg-slate-50 border border-border rounded-xl px-3 py-2"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground font-medium">译文预览</span>
                {translating && <RefreshCw size={10} className="text-muted-foreground animate-spin" />}
              </div>
              {translated ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-foreground flex-1">{translated}</p>
                  <button
                    onClick={() => handleSend(true)}
                    disabled={sending}
                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition disabled:opacity-50"
                  >
                    <Send size={10} /> 发译文
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">翻译中…</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={translateOn ? `输入原文，自动翻译为 ${LANGS.find((l) => l.code === targetLang)?.label}...` : '输入消息，Enter 发送 · Shift+Enter 换行'}
            rows={2}
            className="flex-1 resize-none rounded-xl bg-slate-50 border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30 outline-none transition-all max-h-28 min-h-[52px]"
          />
          <button
            onClick={() => handleSend(false)}
            disabled={!input.trim() || sending}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl transition-all shrink-0',
              input.trim() && !sending
                ? 'bg-primary text-primary-foreground hover:opacity-90 active:scale-95 shadow'
                : 'bg-slate-100 text-muted-foreground cursor-not-allowed'
            )}
          >
            {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          DuoPlus API 写入 · Enter 发送原文{translateOn ? ' · 点击「发译文」发送翻译后内容' : ''}
        </p>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyChat() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 bg-slate-50">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <MessageSquare className="w-10 h-10 text-primary/50" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">选择一个会话</h2>
      <p className="text-sm text-muted-foreground max-w-56">从左侧选择云号码开始双向聊天</p>
    </div>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [search, setSearch] = useState('');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const { conversations, activeConversationId, setActiveConversation } = useChatStore();

  const filtered = conversations.filter((c) => {
    const q = search.toLowerCase();
    return c.cloudNumber.number.toLowerCase().includes(q) || (c.cloudNumber.name?.toLowerCase().includes(q) ?? false);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
    if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
    return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
  });

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  return (
    <>
      {/* Conversation list */}
      <div className="w-[300px] shrink-0 h-full flex flex-col border-r border-border bg-white">
        <div className="px-3 py-3.5 border-b border-border space-y-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">消息</h2>
            <button
              onClick={() => setShowBroadcast(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> 群发
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索号码..."
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-50 text-sm border border-border focus:border-ring focus:ring-1 focus:ring-ring/30 outline-none transition"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <MessageSquare className="w-8 h-8 text-muted-foreground/20 mb-2" />
              <p className="text-xs text-muted-foreground">{conversations.length === 0 ? '请在设置中配置 Supabase 代理' : '无匹配'}</p>
            </div>
          ) : sorted.map((conv) => (
            <ConvItem key={conv.id} conv={conv} isActive={conv.id === activeConversationId} onClick={() => setActiveConversation(conv.id)} />
          ))}
        </div>

        <div className="px-3 py-2 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground text-center font-mono">{conversations.length} 个云号码 · 自动轮询</p>
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 h-full min-w-0">
        {activeConv ? <ChatPanel conv={activeConv} /> : <EmptyChat />}
      </div>

      <BroadcastDialog open={showBroadcast} onClose={() => setShowBroadcast(false)} />
    </>
  );
}
