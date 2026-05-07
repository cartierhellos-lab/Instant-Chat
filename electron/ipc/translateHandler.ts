/**
 * 翻译 IPC Handler — 生产级实现
 * 功能：LRU 内存缓存 | 术语表替换 | 三引擎支持 | 引擎降级 | 并发限制
 */

import { ipcMain } from 'electron';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ─── 类型 ─────────────────────────────────────────────────────────────────────

type Engine = 'mymemory' | 'ollama' | 'deepl';

interface TranslateSettings {
  translateEngine: Engine;
  ollamaUrl?: string;
  ollamaModel?: string;
  deeplApiKey?: string;
  localLang?: string;
  targetLang?: string;
}

interface TranslateArgs {
  text: string;
  local: string;
  target: string;
}

// ─── LRU 缓存 ─────────────────────────────────────────────────────────────────

/**
 * 双向链表节点
 */
interface LRUNode {
  key: string;
  value: string;
  prev: LRUNode | null;
  next: LRUNode | null;
}

/**
 * LRU 缓存，容量 2000 条
 * key: `${text}::${targetLang}`
 */
class LRUCache {
  private capacity: number;
  private map: Map<string, LRUNode> = new Map();
  private head: LRUNode; // 哑头节点（最近使用端）
  private tail: LRUNode; // 哑尾节点（最久未用端）

  constructor(capacity = 2000) {
    this.capacity = capacity;
    // 初始化哑头尾
    this.head = { key: '', value: '', prev: null, next: null };
    this.tail = { key: '', value: '', prev: null, next: null };
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: string): string | null {
    const node = this.map.get(key);
    if (!node) return null;
    this.moveToHead(node);
    return node.value;
  }

  set(key: string, value: string): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToHead(existing);
      return;
    }
    const node: LRUNode = { key, value, prev: null, next: null };
    this.map.set(key, node);
    this.addToHead(node);
    if (this.map.size > this.capacity) {
      const evicted = this.removeTail();
      if (evicted) this.map.delete(evicted.key);
    }
  }

  get size(): number {
    return this.map.size;
  }

  private addToHead(node: LRUNode): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }

  private removeNode(node: LRUNode): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  private moveToHead(node: LRUNode): void {
    this.removeNode(node);
    this.addToHead(node);
  }

  private removeTail(): LRUNode | null {
    const node = this.tail.prev;
    if (!node || node === this.head) return null;
    this.removeNode(node);
    return node;
  }
}

// ─── 术语表 ───────────────────────────────────────────────────────────────────

/**
 * 术语表条目：精确字符串替换（区分大小写）
 * 实际项目中可从 JSON 文件热加载
 */
interface GlossaryEntry {
  source: string;
  target: string;
}

const DEFAULT_GLOSSARY: GlossaryEntry[] = [
  { source: 'WhatsApp', target: 'WhatsApp' },
  { source: 'Instant-Chat', target: 'Instant-Chat' },
  // 在此处添加更多术语
];

/** 在翻译前用占位符替换术语，翻译后还原 */
function applyGlossary(
  text: string,
  glossary: GlossaryEntry[],
): { processed: string; restore: (t: string) => string } {
  const placeholders: Array<{ placeholder: string; target: string }> = [];
  let processed = text;

  glossary.forEach((entry, i) => {
    const placeholder = `__TERM_${i}__`;
    if (processed.includes(entry.source)) {
      processed = processed.split(entry.source).join(placeholder);
      placeholders.push({ placeholder, target: entry.target });
    }
  });

  const restore = (translated: string): string => {
    let result = translated;
    placeholders.forEach(({ placeholder, target }) => {
      result = result.split(placeholder).join(target);
    });
    return result;
  };

  return { processed, restore };
}

// ─── 并发限制（Semaphore）────────────────────────────────────────────────────

class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.permits++;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// ─── HTTP 工具 ────────────────────────────────────────────────────────────────

/** 带超时的 HTTP/HTTPS 请求封装 */
function httpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Instant-Chat/1.0',
        ...options.headers,
      },
    };

    const req = lib.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });

    req.on('error', reject);

    if (options.timeoutMs) {
      req.setTimeout(options.timeoutMs, () => {
        req.destroy(new Error(`Request timeout after ${options.timeoutMs}ms`));
      });
    }

    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── 翻译引擎实现 ─────────────────────────────────────────────────────────────

/** MyMemory 免费翻译 */
async function translateMyMemory(
  text: string,
  from: string,
  to: string,
): Promise<string> {
  const encoded = encodeURIComponent(text);
  const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${from}|${to}&de=user@instant-chat.app`;
  const raw = await httpRequest(url, { timeoutMs: 10_000 });
  const json = JSON.parse(raw);
  if (json?.responseStatus === 200 && json?.responseData?.translatedText) {
    return json.responseData.translatedText as string;
  }
  throw new Error(`MyMemory error: ${json?.responseStatus} — ${json?.responseDetails}`);
}

/** Ollama 本地大模型翻译 */
async function translateOllama(
  text: string,
  targetLang: string,
  ollamaUrl: string,
  model: string,
): Promise<string> {
  const prompt =
    `Translate the following text to ${targetLang}. ` +
    `Return ONLY the translation, no explanations:\n${text}`;

  const body = JSON.stringify({
    model,
    prompt,
    stream: false,
    options: { temperature: 0.2 },
  });

  const url = `${ollamaUrl.replace(/\/$/, '')}/api/generate`;
  const raw = await httpRequest(url, {
    method: 'POST',
    body,
    timeoutMs: 30_000,
  });

  const json = JSON.parse(raw);
  if (json?.response) return (json.response as string).trim();
  throw new Error(`Ollama error: ${raw.slice(0, 200)}`);
}

/** DeepL 翻译 */
async function translateDeepL(
  text: string,
  from: string,
  to: string,
  apiKey: string,
): Promise<string> {
  // DeepL 语言代码大写
  const sourceLang = from.toUpperCase();
  const targetLang = to.toUpperCase();

  const body = JSON.stringify({
    text: [text],
    source_lang: sourceLang,
    target_lang: targetLang,
  });

  const raw = await httpRequest('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body,
    timeoutMs: 10_000,
  });

  const json = JSON.parse(raw);
  const translated = json?.translations?.[0]?.text;
  if (translated !== undefined) return translated as string;
  throw new Error(`DeepL error: ${raw.slice(0, 200)}`);
}

// ─── 全局状态 ─────────────────────────────────────────────────────────────────

const lruCache = new LRUCache(2000);
const semaphore = new Semaphore(5); // 最多 5 个并发翻译请求

let currentSettings: TranslateSettings = {
  translateEngine: 'mymemory',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:7b',
  localLang: 'zh',
  targetLang: 'en',
};

let glossary: GlossaryEntry[] = [...DEFAULT_GLOSSARY];

// ─── 主翻译函数（含降级链）───────────────────────────────────────────────────

/**
 * 翻译入口，带 LRU 缓存 + 术语表 + 引擎降级
 * 降级链：DeepL → MyMemory → 原文
 */
async function translateWithFallback(args: TranslateArgs): Promise<string> {
  const { text, local, target } = args;

  // 空文本直接返回
  if (!text || !text.trim()) return text;
  // 相同语言无需翻译
  if (local === target) return text;

  const cacheKey = `${text}::${target}`;

  // 1. 检查 LRU 缓存
  const cached = lruCache.get(cacheKey);
  if (cached !== null) return cached;

  // 2. 术语表处理
  const { processed, restore } = applyGlossary(text, glossary);

  // 3. 在并发限制内执行翻译
  const result = await semaphore.run(async (): Promise<string> => {
    const engine = currentSettings.translateEngine;

    // 尝试首选引擎
    try {
      let translated: string;
      if (engine === 'ollama') {
        translated = await translateOllama(
          processed,
          target,
          currentSettings.ollamaUrl || 'http://localhost:11434',
          currentSettings.ollamaModel || 'qwen2.5:7b',
        );
      } else if (engine === 'deepl' && currentSettings.deeplApiKey) {
        translated = await translateDeepL(
          processed,
          local,
          target,
          currentSettings.deeplApiKey,
        );
      } else {
        translated = await translateMyMemory(processed, local, target);
      }
      return restore(translated);
    } catch (primaryErr) {
      writeTranslateLog('WARN', `Primary engine [${engine}] failed`, primaryErr);
    }

    // 4. 降级到 MyMemory
    if (engine !== 'mymemory') {
      try {
        const fallback = await translateMyMemory(processed, local, target);
        return restore(fallback);
      } catch (fallbackErr) {
        writeTranslateLog('WARN', 'MyMemory fallback also failed', fallbackErr);
      }
    }

    // 5. 最终降级：返回原文
    writeTranslateLog('WARN', 'All engines failed, returning original text');
    return text;
  });

  // 6. 写入缓存
  lruCache.set(cacheKey, result);
  return result;
}

// ─── 日志 ─────────────────────────────────────────────────────────────────────

function writeTranslateLog(level: 'INFO' | 'WARN' | 'ERROR', msg: string, err?: unknown): void {
  const ts = new Date().toISOString();
  const detail = err instanceof Error ? err.message : err ? JSON.stringify(err) : '';
  const line = `[${ts}] [${level}] [translate] ${msg}${detail ? ` | ${detail}` : ''}\n`;
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'translate.log'), line, 'utf-8');
  } catch {
    // 日志写失败不影响主流程
  }
  if (process.env.NODE_ENV !== 'production') {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](line.trim());
  }
}

// ─── 支持的语言列表 ───────────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = [
  { code: 'zh', displayName: '中文（简体）' },
  { code: 'zh-TW', displayName: '中文（繁體）' },
  { code: 'en', displayName: 'English' },
  { code: 'ja', displayName: '日本語' },
  { code: 'ko', displayName: '한국어' },
  { code: 'es', displayName: 'Español' },
  { code: 'fr', displayName: 'Français' },
  { code: 'de', displayName: 'Deutsch' },
  { code: 'pt', displayName: 'Português' },
  { code: 'ru', displayName: 'Русский' },
  { code: 'ar', displayName: 'العربية' },
  { code: 'hi', displayName: 'हिन्दी' },
  { code: 'it', displayName: 'Italiano' },
  { code: 'nl', displayName: 'Nederlands' },
  { code: 'tr', displayName: 'Türkçe' },
  { code: 'pl', displayName: 'Polski' },
  { code: 'vi', displayName: 'Tiếng Việt' },
  { code: 'th', displayName: 'ภาษาไทย' },
  { code: 'id', displayName: 'Bahasa Indonesia' },
  { code: 'ms', displayName: 'Bahasa Melayu' },
];

// ─── IPC Handler 注册 ─────────────────────────────────────────────────────────

export function registerTranslateHandlers(): void {

  // 翻译文本
  ipcMain.handle('translate:text', async (_event, args: TranslateArgs) => {
    try {
      return await translateWithFallback(args);
    } catch (err) {
      writeTranslateLog('ERROR', 'translate:text unhandled error', err);
      return args.text; // 安全降级：返回原文
    }
  });

  // LRU 缓存查询
  ipcMain.handle('translate:getCache', (_event, { text, lang }: { text: string; lang: string }) => {
    return lruCache.get(`${text}::${lang}`);
  });

  // LRU 缓存写入（注入脚本调用）
  ipcMain.handle(
    'translate:setCache',
    (_event, { text, lang, translated }: { text: string; lang: string; translated: string }) => {
      lruCache.set(`${text}::${lang}`, translated);
    },
  );

  // 语言列表
  ipcMain.handle('translate:languageList', () => SUPPORTED_LANGUAGES);

  // 设置同步（渲染进程 → 主进程）
  ipcMain.on('settings:sync', (_event, settings: TranslateSettings) => {
    currentSettings = { ...currentSettings, ...settings };
    writeTranslateLog('INFO', `Settings synced: engine=${settings.translateEngine}`);
  });

  // 更新术语表（可选：运行时热更新）
  ipcMain.on('translate:setGlossary', (_event, entries: GlossaryEntry[]) => {
    glossary = [...DEFAULT_GLOSSARY, ...entries];
    writeTranslateLog('INFO', `Glossary updated: ${glossary.length} entries`);
  });

  // 外部链接（安全打开）
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    const { shell } = await import('electron');
    await shell.openExternal(url);
  });

  // 应用版本
  ipcMain.handle('app:getVersion', () => app.getVersion());

  writeTranslateLog('INFO', 'Translate IPC handlers registered');
}
