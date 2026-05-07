import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Check, Clipboard, Copy, Languages, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { translateText } from '@/api/translate';
import { useSettingsStore, useTranslatorStore } from '@/hooks/useStore';
import { toast } from '@/hooks/use-toast';

const LANG_OPTIONS = [
  { value: 'en', label: '英文' },
  { value: 'zh-CN', label: '中文' },
  { value: 'es', label: '西班牙语' },
  { value: 'ar', label: '阿拉伯语' },
  { value: 'ru', label: '俄语' },
  { value: 'pt', label: '葡萄牙语' },
  { value: 'fr', label: '法语' },
];

function formatHistoryTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function readClipboardText(): Promise<string> {
  if (window.desktopBridge?.isElectron) {
    return window.desktopBridge.readClipboard();
  }
  return navigator.clipboard.readText();
}

async function writeClipboardText(text: string): Promise<void> {
  if (window.desktopBridge?.isElectron) {
    await window.desktopBridge.writeClipboard(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

function applyGlossary(text: string, glossary: { source: string; target: string }[]): string {
  return glossary.reduce((current, rule) => {
    const source = rule.source.trim();
    const target = rule.target.trim();
    if (!source || !target) return current;
    return current.split(source).join(target);
  }, text);
}

export default function TranslatorPage() {
  const { settings } = useSettingsStore();
  const {
    templates,
    history,
    clipboard,
    glossary,
    addTemplate,
    deleteTemplate,
    addHistory,
    clearHistory,
    addClipboardItem,
    deleteClipboardItem,
    addGlossaryRule,
    deleteGlossaryRule,
  } = useTranslatorStore();

  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [targetLang, setTargetLang] = useState('en');
  const [translating, setTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastEngine, setLastEngine] = useState<'mymemory' | 'ollama' | null>(null);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateText, setNewTemplateText] = useState('');
  const [newGlossarySource, setNewGlossarySource] = useState('');
  const [newGlossaryTarget, setNewGlossaryTarget] = useState('');

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const targetLabel = useMemo(
    () => LANG_OPTIONS.find((item) => item.value === targetLang)?.label ?? targetLang,
    [targetLang]
  );

  const helper = useMemo(() => {
    if (lastEngine === 'ollama') return '当前使用本地 Ollama 引擎。';
    if (lastEngine === 'mymemory') return '当前使用 MyMemory 引擎。';
    return '适合 Ubuntu 桌面场景下做对外回复、社媒沟通和跨应用复制发送。';
  }, [lastEngine]);

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setTranslating(true);
    try {
      const result = await translateText(sourceText, {
        engine: settings.translateEngine,
        ollamaUrl: settings.ollamaUrl,
        ollamaModel: settings.ollamaModel,
        targetLang,
      });
      const finalText = applyGlossary(result.result || '', glossary);
      setTranslatedText(finalText);
      setLastEngine(result.engine);
      addHistory({
        sourceText,
        translatedText: finalText,
        targetLang,
        engine: result.engine,
      });
      if (result.error) {
        toast({
          title: '翻译已完成',
          description: result.error,
        });
      }
    } catch (error) {
      toast({
        title: '翻译失败',
        description: (error as Error).message || '请检查当前翻译配置。',
      });
    } finally {
      setTranslating(false);
    }
  };

  const handleSwap = () => {
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  };

  const handleClear = () => {
    setSourceText('');
    setTranslatedText('');
  };

  const handleCopy = async (value: string, label: string) => {
    if (!value.trim()) return;
    try {
      await writeClipboardText(value);
      setCopied(true);
      toast({
        title: '已复制',
        description: `${label} 已复制到剪贴板。`,
      });
    } catch {
      toast({
        title: '复制失败',
        description: '当前环境未允许剪贴板写入。',
      });
    }
  };

  const handleAddTemplate = () => {
    if (!newTemplateText.trim()) return;
    addTemplate(newTemplateTitle, newTemplateText);
    setNewTemplateTitle('');
    setNewTemplateText('');
    toast({
      title: '模板已保存',
      description: '新的快捷回复模板已经加入左侧列表。',
    });
  };

  const handleCaptureClipboard = async () => {
    try {
      const text = await readClipboardText();
      if (!text.trim()) {
        toast({
          title: '剪贴板为空',
          description: '当前没有可暂存的文本内容。',
        });
        return;
      }
      addClipboardItem(text);
      toast({
        title: '已加入暂存区',
        description: '你可以稍后从右侧暂存区回填到原文区。',
      });
    } catch {
      toast({
        title: '读取失败',
        description: '浏览器未允许读取剪贴板，请手动复制后重试。',
      });
    }
  };

  const handleAddGlossary = () => {
    if (!newGlossarySource.trim() || !newGlossaryTarget.trim()) return;
    addGlossaryRule(newGlossarySource, newGlossaryTarget);
    setNewGlossarySource('');
    setNewGlossaryTarget('');
    toast({
      title: '术语已保存',
      description: '后续翻译会优先应用这条固定替换。',
    });
  };

  return (
    <div className="translator-workbench flex min-h-0 flex-1 overflow-hidden" style={{ background: 'var(--background)' }}>

      {/* ── 左侧工具栏 ── */}
      <aside
        className="tool-sidebar translator-sidebar shrink-0 flex flex-col overflow-y-auto"
        style={{ borderRight: '0.5px solid rgba(0,0,0,0.08)' }}
      >
        <div className="p-3 space-y-3">

          {/* 工作台说明 */}
          <div className="px-1">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
              <Languages size={14} className="text-primary" />
              <span>翻译工作台</span>
            </div>
            <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
              集中处理跨应用回复、客户沟通和多语种润色。
            </p>
          </div>

          {/* 快速模板区 */}
          <section>
            <div className="ios-section-header flex items-center justify-between mb-1">
              <span>快速模板</span>
              <span className="text-muted-foreground">{templates.length} 条</span>
            </div>
            <div className="ios-card-grouped space-y-px">
              {templates.length === 0 && (
                <div className="ios-list-row text-[10px] text-muted-foreground">暂无模板</div>
              )}
              {templates.map((item) => (
                <div key={item.id} className="ios-list-row flex-col items-start gap-1 min-h-[44px] py-2">
                  <button onClick={() => setSourceText(item.source)} className="w-full text-left">
                    <p className="text-[11px] font-semibold text-foreground">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground leading-5">{item.source}</p>
                  </button>
                  <div className="flex justify-end w-full">
                    <button onClick={() => deleteTemplate(item.id)} className="tool-btn h-5 px-2 text-[9px] text-red-500">
                      <Trash2 size={10} /> 删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 新建模板 */}
          <div className="ios-card rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-semibold text-foreground">新建模板</p>
            <input
              value={newTemplateTitle}
              onChange={(e) => setNewTemplateTitle(e.target.value)}
              placeholder="模板标题，例如：首次开场"
              className="tool-input h-8 w-full px-2.5 text-[11px]"
            />
            <textarea
              value={newTemplateText}
              onChange={(e) => setNewTemplateText(e.target.value)}
              placeholder="输入常用回复内容…"
              className="tool-textarea h-20 w-full resize-none px-2.5 py-2 text-[11px] leading-5"
            />
            <button
              onClick={handleAddTemplate}
              disabled={!newTemplateText.trim()}
              className="tool-btn tool-btn-primary h-8 w-full text-[11px] font-semibold disabled:opacity-40"
            >
              <Plus size={12} /> 保存模板
            </button>
          </div>

          {/* 术语表区 */}
          <section>
            <div className="ios-section-header mb-1">术语替换</div>
            <div className="ios-card-grouped space-y-px">
              {glossary.length === 0 && (
                <div className="ios-list-row text-[10px] text-muted-foreground">暂无术语</div>
              )}
              {glossary.map((item) => (
                <div key={item.id} className="ios-list-row flex-col items-start gap-0.5 min-h-[44px] py-2">
                  <div className="text-[11px] font-semibold text-foreground">{item.source}</div>
                  <div className="text-[10px] text-muted-foreground">→ {item.target}</div>
                  <div className="flex justify-end w-full mt-1">
                    <button onClick={() => deleteGlossaryRule(item.id)} className="tool-btn h-5 px-2 text-[9px] text-red-500">
                      <Trash2 size={10} /> 删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 新增术语 */}
          <div className="ios-card rounded-xl p-3 space-y-2">
            <input
              value={newGlossarySource}
              onChange={(e) => setNewGlossarySource(e.target.value)}
              placeholder="原词，例如：WhatsApp"
              className="tool-input h-8 w-full px-2.5 text-[11px]"
            />
            <input
              value={newGlossaryTarget}
              onChange={(e) => setNewGlossaryTarget(e.target.value)}
              placeholder="固定替换，例如：WhatsApp Business"
              className="tool-input h-8 w-full px-2.5 text-[11px]"
            />
            <button
              onClick={handleAddGlossary}
              disabled={!newGlossarySource.trim() || !newGlossaryTarget.trim()}
              className="tool-btn h-8 w-full text-[11px] font-semibold disabled:opacity-40"
            >
              <Plus size={12} /> 添加术语
            </button>
          </div>

        </div>
      </aside>

      {/* ── 右侧主区 ── */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* 顶部工具栏 */}
        <div
          className="flex items-center gap-3 px-4 py-2 shrink-0 bg-white/70 backdrop-blur-sm"
          style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}
        >
          <Languages className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">实时翻译中控</p>
            <p className="text-[10px] text-muted-foreground truncate">{helper}</p>
          </div>
          {window.desktopBridge?.isElectron && (
            <span className="tool-chip text-[9px] font-semibold">DESKTOP</span>
          )}
          {/* 语言切换 tabs */}
          <div className="tool-tabs">
            {LANG_OPTIONS.map(lang => (
              <button
                key={lang.value}
                onClick={() => setTargetLang(lang.value)}
                className={targetLang === lang.value ? 'tool-tab-active' : 'tool-tab'}
              >
                {lang.label}
              </button>
            ))}
          </div>
          <button onClick={handleClear} className="tool-btn h-7 px-3 text-[10px] font-medium">
            <Trash2 size={12} /> 清空
          </button>
        </div>

        {/* 翻译主网格 */}
        <div className="flex min-h-0 flex-1 overflow-hidden p-3 gap-3">
          <div className="translator-main-grid min-h-0 flex-1">

            {/* 原文框 */}
            <div className="tool-panel translator-column translator-editor flex min-h-0 flex-col overflow-hidden" style={{ borderRadius: 'var(--radius-lg)' }}>
              <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                <div>
                  <p className="text-[12px] font-semibold text-foreground">原文区</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">粘贴待翻译内容</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={handleCaptureClipboard} className="tool-btn h-7 px-2.5 text-[10px]">
                    <Clipboard size={11} /> 暂存
                  </button>
                  <button onClick={() => void handleCopy(sourceText, '原文')} className="tool-btn h-7 px-2.5 text-[10px]">
                    <Copy size={11} /> 复制
                  </button>
                </div>
              </div>
              <div className="flex-1 p-3">
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="例如：把对方的消息、你的中文回复、要发给客户的说明贴到这里…"
                  className="tool-textarea h-full min-h-[280px] w-full resize-none px-3 py-3 text-[12px] leading-6"
                />
              </div>
            </div>

            {/* 中间操作列 */}
            <div className="translator-actions flex flex-col items-center justify-center gap-2.5">
              <button
                onClick={handleTranslate}
                disabled={translating || !sourceText.trim()}
                className="tool-btn tool-btn-primary h-10 px-4 text-[12px] font-semibold disabled:opacity-40 w-full"
              >
                {translating ? <RefreshCw size={13} className="animate-spin" /> : <Languages size={13} />}
                翻译
              </button>
              <button
                onClick={handleSwap}
                disabled={!translatedText.trim()}
                className="tool-btn-quiet h-8 px-3 text-[11px] flex items-center gap-1.5 disabled:opacity-40"
              >
                <ArrowLeftRight size={12} /> 对调
              </button>
            </div>

            {/* 译文框 */}
            <div className="tool-panel translator-column translator-editor flex min-h-0 flex-col overflow-hidden" style={{ borderRadius: 'var(--radius-lg)' }}>
              <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                <div>
                  <p className="text-[12px] font-semibold text-foreground">译文区</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">→ {targetLabel}</p>
                </div>
                <button
                  onClick={() => void handleCopy(translatedText, '译文')}
                  className="tool-btn tool-btn-primary h-7 px-2.5 text-[10px] disabled:opacity-40"
                  disabled={!translatedText.trim()}
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
              <div className="flex-1 p-3">
                <textarea
                  value={translatedText}
                  onChange={(e) => setTranslatedText(e.target.value)}
                  placeholder="翻译结果会显示在这里。你也可以直接手动改写成更自然的表达。"
                  className="tool-textarea h-full min-h-[280px] w-full resize-none px-3 py-3 text-[12px] leading-6"
                />
              </div>
            </div>

            {/* 右侧记录栏 */}
            <aside className="tool-panel translator-column translator-sidepane flex min-h-0 flex-col overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                <div>
                  <p className="text-[12px] font-semibold text-foreground">最近翻译</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">保留最近 30 条</p>
                </div>
                <button onClick={clearHistory} className="tool-btn h-7 px-2 text-[9px]">
                  <Trash2 size={11} /> 清空
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {history.length === 0 && (
                  <div className="tool-surface p-3 text-[10px] leading-5 text-muted-foreground rounded-xl">
                    还没有翻译记录。完成第一次翻译后，这里会保留最近的工作痕迹。
                  </div>
                )}
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSourceText(item.sourceText);
                      setTranslatedText(item.translatedText);
                      setTargetLang(item.targetLang);
                      setLastEngine(item.engine);
                    }}
                    className="tool-list-item tool-record w-full rounded-xl px-3 py-2.5 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-foreground">
                        {LANG_OPTIONS.find((lang) => lang.value === item.targetLang)?.label ?? item.targetLang}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {formatHistoryTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[10px] leading-5 text-muted-foreground">{item.sourceText}</p>
                    <div className="mt-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[10px] leading-5 text-foreground">
                      {item.translatedText || '无译文'}
                    </div>
                  </button>
                ))}

                {/* 剪贴板暂存 */}
                {clipboard.length > 0 && (
                  <div className="pt-2">
                    <div className="ios-section-header mb-1.5">
                      <span>剪贴板暂存</span>
                      <span className="text-muted-foreground">{clipboard.length} 条</span>
                    </div>
                    <div className="space-y-1.5">
                      {clipboard.map((item) => (
                        <div key={item.id} className="tool-list-item tool-record rounded-xl px-3 py-2">
                          <button onClick={() => setSourceText(item.text)} className="w-full text-left">
                            <p className="line-clamp-3 text-[10px] leading-5 text-foreground">{item.text}</p>
                          </button>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[9px] text-muted-foreground">{formatHistoryTime(item.createdAt)}</span>
                            <button onClick={() => deleteClipboardItem(item.id)} className="tool-btn h-5 px-2 text-[9px] text-red-500">
                              <Trash2 size={10} /> 删除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>

          </div>
        </div>
      </section>
    </div>
  );
}
