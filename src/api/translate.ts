/**
 * 双通道翻译引擎
 * - mymemory: 免费在线 API（无需配置，开箱即用）
 * - ollama:   本地大模型（需本地运行 Ollama 服务）
 */

export type TranslateEngine = 'mymemory' | 'ollama';

export interface TranslateOptions {
  engine?: TranslateEngine;
  ollamaUrl?: string;
  ollamaModel?: string;
  sourceLang?: string;
  targetLang: string;
}

// ─── MyMemory 引擎 ─────────────────────────────────────────────────────────────
async function translateMyMemory(text: string, targetLang: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const json = await res.json() as {
    responseStatus: number;
    responseData?: { translatedText?: string };
  };
  if (json.responseStatus !== 200) throw new Error('MyMemory translation failed');
  return json.responseData?.translatedText ?? '';
}

// ─── Ollama 引擎 ───────────────────────────────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  zh: '中文', en: 'English', es: 'Español', fr: 'Français',
  pt: 'Português', ar: 'العربية', ru: 'Русский',
  ja: '日本語', ko: '한국어', hi: 'हिन्दी', de: 'Deutsch',
  it: 'Italiano', th: 'ภาษาไทย', vi: 'Tiếng Việt',
};

async function translateOllama(
  text: string,
  targetLang: string,
  ollamaUrl = 'http://localhost:11434',
  model = 'qwen2:7b',
): Promise<string> {
  const langName = LANG_NAMES[targetLang] ?? targetLang;
  const prompt = `Translate the following text to ${langName}. Output ONLY the translated text, no explanation, no quotes:\n\n${text}`;

  const res = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);

  const json = await res.json() as { response?: string; error?: string };
  if (json.error) throw new Error(`Ollama error: ${json.error}`);
  return (json.response ?? '').trim();
}

// ─── 检测 Ollama 连通性 ────────────────────────────────────────────────────────
export async function testOllamaConnection(
  ollamaUrl = 'http://localhost:11434',
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, models: [], error: `HTTP ${res.status}` };
    const json = await res.json() as { models?: Array<{ name: string }> };
    const models = (json.models ?? []).map((m) => m.name);
    return { ok: true, models };
  } catch (e) {
    const message = (e as Error).message;
    const isBrowserLocalhost =
      typeof window !== 'undefined' &&
      /localhost|127\.0\.0\.1/.test(ollamaUrl) &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';

    if (isBrowserLocalhost) {
      return {
        ok: false,
        models: [],
        error: '当前网页运行在远程域名，无法访问你本机的 localhost:11434。请改为可公网访问的 Ollama 地址，或切换到 MyMemory。',
      };
    }

    return { ok: false, models: [], error: message };
  }
}

// ─── 统一翻译入口 ──────────────────────────────────────────────────────────────
export async function translateText(
  text: string,
  opts: TranslateOptions,
): Promise<{ result: string; engine: TranslateEngine; error?: string }> {
  if (!text.trim()) return { result: '', engine: opts.engine ?? 'mymemory' };

  const engine = opts.engine ?? 'mymemory';

  try {
    if (engine === 'ollama') {
      const result = await translateOllama(
        text, opts.targetLang, opts.ollamaUrl, opts.ollamaModel,
      );
      return { result, engine };
    } else {
      const result = await translateMyMemory(text, opts.targetLang);
      return { result, engine };
    }
  } catch (err) {
    // Ollama 失败时自动降级到 MyMemory
    if (engine === 'ollama') {
      try {
        const result = await translateMyMemory(text, opts.targetLang);
        return { result, engine: 'mymemory', error: `Ollama 不可用，已降级: ${(err as Error).message}` };
      } catch (e2) {
        return { result: '', engine, error: (e2 as Error).message };
      }
    }
    return { result: '', engine, error: (err as Error).message };
  }
}
