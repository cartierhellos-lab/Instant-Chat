/**
 * @fileoverview WhatsApp Web 注入脚本 (生产级)
 * @description 注入到 WhatsApp Web BrowserView，实现实时翻译、新消息通知、用户画像触发等功能。
 *              通过 window.postMessage 与 Electron 主进程通信（兼容 contextIsolation）。
 * @version 2.0.0
 * @author Instant-Chat
 */

;(function WhatsAppInject() {
  'use strict'

  /* ─────────────────────────────────────────────────────────────────────────
   * 0. 全局守卫：防止重复注入
   * ───────────────────────────────────────────────────────────────────────── */
  if (window.__WA_INJECT_LOADED__) {
    console.warn('[WA-Inject] 已注入，跳过重复执行')
    return
  }
  window.__WA_INJECT_LOADED__ = true

  /* ─────────────────────────────────────────────────────────────────────────
   * 1. 全局错误防护
   * ───────────────────────────────────────────────────────────────────────── */
  window.addEventListener('error', (e) => {
    if (e.filename && e.filename.includes('whatsapp-inject')) {
      console.error('[WA-Inject] 脚本内部错误:', e.message, e.filename, e.lineno)
      e.preventDefault() // 阻止传播，避免影响 WhatsApp 自身
    }
  })

  window.addEventListener('unhandledrejection', (e) => {
    if (String(e.reason).includes('WA-Inject')) {
      console.error('[WA-Inject] 未处理的 Promise 拒绝:', e.reason)
      e.preventDefault()
    }
  })

  /* ─────────────────────────────────────────────────────────────────────────
   * 2. 常量 & 状态
   * ───────────────────────────────────────────────────────────────────────── */
  const CONSTANTS = Object.freeze({
    DB_NAME: 'WA_TranslationDB',
    DB_VERSION: 1,
    DB_STORE: 'translations',
    TRANSLATE_TIMEOUT_MS: 8000,
    BATCH_SIZE: 5,
    THROTTLE_MS: 500,
    LOGIN_POLL_MS: 5000,
    LS_LOCAL_LANG: 'wa_inject_localLanguage',
    LS_TARGET_LANG: 'wa_inject_targetLanguage',
  })

  /** @type {{ languages: Array<{code:string,name:string}>, localLang: string, targetLang: string }} */
  const STATE = {
    languages: [],
    localLang: localStorage.getItem(CONSTANTS.LS_LOCAL_LANG) || 'auto',
    targetLang: localStorage.getItem(CONSTANTS.LS_TARGET_LANG) || 'zh',
    loginChecked: false,
    inBackground: false,
    translateBusy: false,
  }

  let _requestIdCounter = 0
  /** 生成唯一请求 ID */
  const genRequestId = () => `wa_${Date.now()}_${++_requestIdCounter}`

  /* ─────────────────────────────────────────────────────────────────────────
   * 3. 通信桥：与 Electron 主进程
   * ───────────────────────────────────────────────────────────────────────── */

  /**
   * 发送消息给主进程
   * @param {object} payload
   */
  const sendToMain = (payload) => {
    try {
      window.postMessage(payload, '*')
    } catch (err) {
      console.error('[WA-Inject] sendToMain 失败:', err)
    }
  }

  /**
   * 挂起的翻译 Promise 解析器 Map
   * @type {Map<string, { resolve: Function, reject: Function, timer: number }>}
   */
  const _pendingTranslations = new Map()

  /**
   * 请求翻译（返回 Promise，带超时）
   * @param {string} text
   * @param {string} local  源语言 code
   * @param {string} target 目标语言 code
   * @returns {Promise<string>}
   */
  const requestTranslation = (text, local, target) => {
    return new Promise((resolve, reject) => {
      const requestId = genRequestId()
      const timer = setTimeout(() => {
        _pendingTranslations.delete(requestId)
        reject(new Error(`[WA-Inject] 翻译超时 requestId=${requestId}`))
      }, CONSTANTS.TRANSLATE_TIMEOUT_MS)

      _pendingTranslations.set(requestId, { resolve, reject, timer })
      sendToMain({ type: 'WA_TRANSLATE', text, local, target, requestId })
    })
  }

  /* 接收主进程消息 */
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data.type !== 'string') return

    switch (e.data.type) {
      /* 翻译结果回调 */
      case 'WA_TRANSLATE_RESULT': {
        const { requestId, result, error } = e.data
        const pending = _pendingTranslations.get(requestId)
        if (!pending) return
        clearTimeout(pending.timer)
        _pendingTranslations.delete(requestId)
        if (error) {
          pending.reject(new Error(error))
        } else {
          pending.resolve(result)
        }
        break
      }
      /* 语言列表更新 */
      case 'WA_LANGUAGES': {
        STATE.languages = Array.isArray(e.data.languages) ? e.data.languages : []
        updateLanguageDropdowns()
        break
      }
      default:
        break
    }
  })

  /* ─────────────────────────────────────────────────────────────────────────
   * 4. IndexedDB 翻译缓存
   * ───────────────────────────────────────────────────────────────────────── */

  /** @type {IDBDatabase|null} */
  let _db = null

  /**
   * 打开/初始化 IndexedDB
   * @returns {Promise<IDBDatabase>}
   */
  const openDB = () =>
    new Promise((resolve, reject) => {
      if (_db) return resolve(_db)
      try {
        const req = indexedDB.open(CONSTANTS.DB_NAME, CONSTANTS.DB_VERSION)
        req.onupgradeneeded = (ev) => {
          const db = ev.target.result
          if (!db.objectStoreNames.contains(CONSTANTS.DB_STORE)) {
            // 复合主键：text + targetLang
            db.createObjectStore(CONSTANTS.DB_STORE, { keyPath: ['text', 'targetLang'] })
          }
        }
        req.onsuccess = (ev) => {
          _db = ev.target.result
          resolve(_db)
        }
        req.onerror = () => reject(req.error)
      } catch (err) {
        reject(err)
      }
    })

  /**
   * 从缓存读取翻译结果
   * @param {string} text
   * @param {string} targetLang
   * @returns {Promise<string|null>}
   */
  const getCachedTranslation = async (text, targetLang) => {
    try {
      const db = await openDB()
      return new Promise((resolve) => {
        const tx = db.transaction(CONSTANTS.DB_STORE, 'readonly')
        const req = tx.objectStore(CONSTANTS.DB_STORE).get([text, targetLang])
        req.onsuccess = () => resolve(req.result ? req.result.translated : null)
        req.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }

  /**
   * 写入翻译缓存
   * @param {string} text
   * @param {string} targetLang
   * @param {string} translated
   */
  const setCachedTranslation = async (text, targetLang, translated) => {
    try {
      const db = await openDB()
      return new Promise((resolve) => {
        const tx = db.transaction(CONSTANTS.DB_STORE, 'readwrite')
        tx.objectStore(CONSTANTS.DB_STORE).put({ text, targetLang, translated, ts: Date.now() })
        tx.oncomplete = resolve
        tx.onerror = resolve // 缓存写失败不影响主流程
      })
    } catch {
      /* silent */
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 5. 工具函数
   * ───────────────────────────────────────────────────────────────────────── */

  /**
   * 节流函数
   * @param {Function} fn
   * @param {number} delay
   * @returns {Function}
   */
  const throttle = (fn, delay) => {
    let last = 0
    let timer = null
    return function (...args) {
      const now = Date.now()
      const remaining = delay - (now - last)
      if (remaining <= 0) {
        clearTimeout(timer)
        last = now
        fn.apply(this, args)
      } else {
        clearTimeout(timer)
        timer = setTimeout(() => {
          last = Date.now()
          fn.apply(this, args)
        }, remaining)
      }
    }
  }

  /**
   * 等待某个 DOM 元素出现（MutationObserver + 超时）
   * @param {string} selector
   * @param {number} [timeoutMs=30000]
   * @param {Element} [root=document.body]
   * @returns {Promise<Element>}
   */
  const waitForElement = (selector, timeoutMs = 30000, root = document.body) =>
    new Promise((resolve, reject) => {
      try {
        const existing = root.querySelector(selector)
        if (existing) return resolve(existing)

        const timer = setTimeout(() => {
          observer.disconnect()
          reject(new Error(`[WA-Inject] 等待超时: ${selector}`))
        }, timeoutMs)

        const observer = new MutationObserver(() => {
          try {
            const el = root.querySelector(selector)
            if (el) {
              clearTimeout(timer)
              observer.disconnect()
              resolve(el)
            }
          } catch {
            /* ignore */
          }
        })
        observer.observe(root, { childList: true, subtree: true })
      } catch (err) {
        reject(err)
      }
    })

  /**
   * 检测字符串是否为纯表情（无可见文字）
   * @param {string} text
   * @returns {boolean}
   */
  const isPureEmoji = (text) => {
    if (!text || !text.trim()) return true
    // Unicode 表情范围匹配，去掉所有 emoji 后是否有剩余文字
    const cleaned = text.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{20D0}-\u{20FF}\u{1F1E0}-\u{1F1FF}\u200d\uFE0F\u20E3\uFE0F]/gu,
      ''
    )
    return cleaned.trim().length === 0
  }

  /**
   * 显示一个轻量级 Toast 提示
   * @param {string} message
   * @param {'info'|'error'|'success'} [type='info']
   */
  const showToast = (message, type = 'info') => {
    try {
      const existing = document.getElementById('wa-inject-toast')
      if (existing) existing.remove()

      const toast = document.createElement('div')
      toast.id = 'wa-inject-toast'
      const colors = { info: '#2196F3', error: '#f44336', success: '#4CAF50' }
      toast.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: ${colors[type] || colors.info}; color: #fff;
        padding: 10px 20px; border-radius: 20px; font-size: 13px;
        z-index: 99999; box-shadow: 0 4px 12px rgba(0,0,0,.3);
        pointer-events: none; transition: opacity .3s;
      `
      toast.textContent = message
      document.body.appendChild(toast)
      setTimeout(() => {
        toast.style.opacity = '0'
        setTimeout(() => toast.remove(), 300)
      }, 3000)
    } catch {
      /* silent */
    }
  }

  /**
   * 创建波浪加载节点（3点跳动动画）
   * @returns {HTMLElement}
   */
  const createLoadingNode = () => {
    const wrap = document.createElement('span')
    wrap.className = 'wa-inject-loading'
    wrap.setAttribute('aria-label', '翻译中…')
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:3px;margin-left:4px;'
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span')
      dot.style.cssText = `
        width:5px;height:5px;border-radius:50%;background:currentColor;
        animation:wa-bounce .8s ease-in-out ${i * 0.16}s infinite;
        display:inline-block;opacity:.7;
      `
      wrap.appendChild(dot)
    }
    // 注入动画 keyframes（只注入一次）
    if (!document.getElementById('wa-inject-styles')) {
      const style = document.createElement('style')
      style.id = 'wa-inject-styles'
      style.textContent = `
        @keyframes wa-bounce {
          0%,80%,100%{transform:translateY(0)}
          40%{transform:translateY(-6px)}
        }
        .wa-inject-translation {
          display: block;
          font-size: 11.5px;
          margin-top: 3px;
          padding-top: 4px;
          border-top: 1px solid rgba(128,128,128,.25);
          color: #5b9bd5;
          line-height: 1.5;
          word-break: break-word;
        }
        @media (prefers-color-scheme: dark) {
          .wa-inject-translation { color: #7ec8e3; }
        }
        #wa-inject-lang-btn {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px; border: none; background: transparent;
          cursor: pointer; border-radius: 50%; transition: background .2s;
          margin: 0 2px; padding: 0; flex-shrink: 0;
        }
        #wa-inject-lang-btn:hover { background: rgba(128,128,128,.15); }
        #wa-inject-lang-popup {
          position: absolute; bottom: 56px; left: 8px;
          background: var(--bg-default, #fff); border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0,0,0,.2); padding: 12px 14px;
          z-index: 9999; display: none; min-width: 220px;
          font-size: 13px; line-height: 1.6;
        }
        @media (prefers-color-scheme: dark) {
          #wa-inject-lang-popup { background: #233138; color: #e9edef; }
        }
        #wa-inject-lang-popup.visible { display: block; }
        .wa-inject-select-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .wa-inject-select-row label { flex: 0 0 50px; font-size: 12px; opacity: .75; }
        .wa-inject-select-row select {
          flex: 1; border: 1px solid rgba(128,128,128,.3); border-radius: 6px;
          padding: 3px 6px; font-size: 12px; background: transparent;
          cursor: pointer; outline: none; color: inherit;
        }
        #wa-inject-portrait-btn {
          position: fixed; right: 0; top: 50%; transform: translateY(-50%);
          width: 28px; height: 56px; background: rgba(37,211,102,.85);
          border: none; border-radius: 8px 0 0 8px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          z-index: 9000; transition: background .2s;
        }
        #wa-inject-portrait-btn:hover { background: rgba(37,211,102,1); }
      `
      document.head.appendChild(style)
    }
    return wrap
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 6. 接收消息翻译（批处理 + 状态机 + IndexedDB 缓存）
   * ───────────────────────────────────────────────────────────────────────── */

  /** 待翻译的消息节点队列 */
  let _translateQueue = []

  /**
   * 处理一批消息节点
   */
  const processBatch = async () => {
    if (_translateQueue.length === 0) return

    const batch = _translateQueue.splice(0, CONSTANTS.BATCH_SIZE)

    for (const span of batch) {
      try {
        // 防止重复处理
        if (span.dataset.translateStatus && span.dataset.translateStatus !== 'unprocessed') continue

        const rawText = span.textContent || ''
        if (!rawText.trim() || isPureEmoji(rawText)) continue

        // 不翻译自己已注入的翻译节点
        if (span.classList.contains('wa-inject-translation')) continue

        // 标记处理中
        span.dataset.translateStatus = 'processing'

        // 先查缓存
        const cached = await getCachedTranslation(rawText, STATE.targetLang)
        if (cached) {
          insertTranslationNode(span, cached)
          span.dataset.translateStatus = 'translated'
          continue
        }

        // 请求主进程翻译
        const result = await requestTranslation(rawText, STATE.localLang, STATE.targetLang)
        if (result && result.trim() && result.trim() !== rawText.trim()) {
          insertTranslationNode(span, result)
          await setCachedTranslation(rawText, STATE.targetLang, result)
          span.dataset.translateStatus = 'translated'
        } else {
          // 翻译结果与原文相同，无需展示
          span.dataset.translateStatus = 'translated'
        }
      } catch (err) {
        // 静默降级：标记失败，但不插入任何错误节点
        if (span && span.dataset) span.dataset.translateStatus = 'failed'
        console.warn('[WA-Inject] 消息翻译失败（已静默）:', err.message)
      }
    }

    // 如果队列还有，继续处理
    if (_translateQueue.length > 0) {
      setTimeout(processBatch, CONSTANTS.THROTTLE_MS)
    }
  }

  /**
   * 在消息气泡内插入翻译节点
   * @param {Element} span 原文 span
   * @param {string} translatedText 翻译结果
   */
  const insertTranslationNode = (span, translatedText) => {
    try {
      // 找到包裹气泡（通常是 .copyable-text 或最近的消息容器）
      const bubble = span.closest('[data-id]') || span.closest('.message-in, .message-out') || span.parentElement
      if (!bubble) return

      // 如果已有翻译节点则更新，否则插入
      let node = bubble.querySelector('.wa-inject-translation')
      if (!node) {
        node = document.createElement('span')
        node.className = 'wa-inject-translation'
        // 找到气泡内最底部的文字区域插入
        const textWrap = span.closest('.copyable-text') || span.parentElement
        if (textWrap) {
          textWrap.appendChild(node)
        } else {
          bubble.appendChild(node)
        }
      }
      node.textContent = translatedText
    } catch (err) {
      console.warn('[WA-Inject] insertTranslationNode 失败:', err.message)
    }
  }

  /**
   * 将节点加入翻译队列（去重）
   * @param {NodeList|Array<Element>} spans
   */
  const enqueueSpans = (spans) => {
    for (const span of spans) {
      try {
        if (!span.dataset.translateStatus) {
          span.dataset.translateStatus = 'unprocessed'
          _translateQueue.push(span)
        }
      } catch {
        /* ignore */
      }
    }
  }

  const throttledProcessBatch = throttle(processBatch, CONSTANTS.THROTTLE_MS)

  /**
   * 启动消息接收翻译的 MutationObserver
   */
  const startReceiveTranslationObserver = () => {
    try {
      const appRoot = document.querySelector('div[role="application"]')
      if (!appRoot) return

      // 扫描已有消息
      const existing = appRoot.querySelectorAll('span[dir] > span:not([data-translate-status])')
      enqueueSpans(existing)
      throttledProcessBatch()

      const observer = new MutationObserver((mutations) => {
        /** @type {Element[]} */
        const newSpans = []
        for (const mut of mutations) {
          for (const node of mut.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue
            try {
              // 直接命中
              if (node.matches && node.matches('span[dir] > span')) {
                newSpans.push(node)
              }
              // 后代查找
              const descendants = node.querySelectorAll
                ? node.querySelectorAll('span[dir] > span:not([data-translate-status])')
                : []
              for (const d of descendants) newSpans.push(d)
            } catch {
              /* ignore */
            }
          }
        }
        if (newSpans.length > 0) {
          enqueueSpans(newSpans)
          throttledProcessBatch()
        }
      })

      observer.observe(appRoot, { childList: true, subtree: true })
      console.log('[WA-Inject] 接收翻译 Observer 已启动')
    } catch (err) {
      console.error('[WA-Inject] startReceiveTranslationObserver 失败:', err.message)
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 7. 发送消息翻译
   * ───────────────────────────────────────────────────────────────────────── */

  /**
   * 获取 WhatsApp 输入框元素
   * @returns {Element|null}
   */
  const getInputBox = () => {
    try {
      return (
        document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]') ||
        document.querySelector('#main footer div[contenteditable="true"]')
      )
    } catch {
      return null
    }
  }

  /**
   * 获取发送按钮
   * @returns {Element|null}
   */
  const getSendButton = () => {
    try {
      return (
        document.querySelector('button[data-tab="11"]') ||
        document.querySelector('span[data-icon="send"]')?.closest('button') ||
        document.querySelector('#main footer button[aria-label]')
      )
    } catch {
      return null
    }
  }

  /**
   * 从输入框提取纯文本（保留换行）
   * @param {Element} input
   * @returns {string}
   */
  const extractInputText = (input) => {
    try {
      const paragraphs = input.querySelectorAll('p')
      if (paragraphs.length > 0) {
        return Array.from(paragraphs).map((p) => p.textContent || '').join('\n').trim()
      }
      return input.textContent || ''
    } catch {
      return ''
    }
  }

  /**
   * 检测输入框内容是否为纯表情（仅含 span，无文本节点）
   * @param {Element} input
   * @returns {boolean}
   */
  const isInputPureEmoji = (input) => {
    try {
      const text = extractInputText(input)
      return isPureEmoji(text)
    } catch {
      return false
    }
  }

  /**
   * 将翻译后文本写回输入框（触发 React 受控更新）
   * @param {Element} input
   * @param {string} text
   */
  const setInputText = (input, text) => {
    try {
      // 清空
      input.focus()
      document.execCommand('selectAll', false, null)
      document.execCommand('delete', false, null)
      // 逐段插入
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        document.execCommand('insertText', false, lines[i])
        if (i < lines.length - 1) {
          document.execCommand('insertParagraph', false, null)
        }
      }
      // 触发 React input 事件
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    } catch (err) {
      console.error('[WA-Inject] setInputText 失败:', err.message)
    }
  }

  /**
   * 绑定发送消息翻译拦截（捕获阶段 keydown）
   */
  const bindSendTranslation = () => {
    try {
      const footer = document.querySelector('#main footer') || document.querySelector('footer')
      if (!footer) return

      footer.addEventListener(
        'keydown',
        async (e) => {
          // 只拦截 Enter（不拦截 Shift+Enter）
          if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey) return

          const input = getInputBox()
          if (!input) return
          if (!input.contains(document.activeElement) && document.activeElement !== input) return

          // 纯表情直接放行
          if (isInputPureEmoji(input)) return

          const originalText = extractInputText(input)
          if (!originalText.trim()) return

          // 阻止 WhatsApp 原生发送
          e.stopImmediatePropagation()
          e.preventDefault()

          if (STATE.translateBusy) return
          STATE.translateBusy = true

          // 插入加载动画
          let loadingNode = null
          try {
            loadingNode = createLoadingNode()
            input.appendChild(loadingNode)
          } catch { /* ignore */ }

          try {
            const translated = await requestTranslation(originalText, STATE.localLang, STATE.targetLang)

            // 移除加载节点
            if (loadingNode) {
              try { loadingNode.remove() } catch { /* ignore */ }
              loadingNode = null
            }

            if (translated && translated.trim() && translated.trim() !== originalText.trim()) {
              setInputText(input, translated)
            }
            // 等待 React 渲染后点击发送
            await new Promise((r) => requestAnimationFrame(r))
            const sendBtn = getSendButton()
            if (sendBtn) {
              sendBtn.click()
            }
          } catch (err) {
            // 翻译失败：移除加载节点，恢复原文，Toast 提示
            if (loadingNode) {
              try { loadingNode.remove() } catch { /* ignore */ }
            }
            setInputText(input, originalText)
            showToast('翻译失败，请重试或直接发送', 'error')
            console.warn('[WA-Inject] 发送翻译失败:', err.message)
          } finally {
            STATE.translateBusy = false
          }
        },
        true // 捕获阶段
      )
      console.log('[WA-Inject] 发送翻译拦截已绑定')
    } catch (err) {
      console.error('[WA-Inject] bindSendTranslation 失败:', err.message)
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 8. UI 组件：语言选择按钮 + 浮窗
   * ───────────────────────────────────────────────────────────────────────── */

  /** @type {HTMLElement|null} */
  let _langPopup = null

  /**
   * 更新浮窗内下拉选项（当 WA_LANGUAGES 消息更新时调用）
   */
  const updateLanguageDropdowns = () => {
    try {
      if (!_langPopup) return
      const selects = _langPopup.querySelectorAll('select')
      selects.forEach((sel) => {
        const currentVal = sel.value
        sel.innerHTML = ''
        // auto 选项
        const autoOpt = document.createElement('option')
        autoOpt.value = 'auto'
        autoOpt.textContent = '自动检测'
        sel.appendChild(autoOpt)
        // 动态语言列表
        for (const lang of STATE.languages) {
          const opt = document.createElement('option')
          opt.value = lang.code
          opt.textContent = lang.name
          sel.appendChild(opt)
        }
        sel.value = currentVal || 'auto'
      })
    } catch (err) {
      console.warn('[WA-Inject] updateLanguageDropdowns 失败:', err.message)
    }
  }

  /**
   * 注入语言选择按钮到输入框工具栏
   */
  const injectLangButton = () => {
    try {
      if (document.getElementById('wa-inject-lang-btn')) return

      // WhatsApp 工具栏（通常是 footer 内 div[data-tab] 行）
      const toolbar =
        document.querySelector('#main footer > div > div > div:first-child') ||
        document.querySelector('#main footer > div > div')

      if (!toolbar) return

      /* ── 按钮 ── */
      const btn = document.createElement('button')
      btn.id = 'wa-inject-lang-btn'
      btn.title = '翻译语言设置'
      btn.setAttribute('aria-label', '翻译语言设置')
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12.65 6.3C11.82 4.91 10.25 4 8.5 4 5.47 4 3 6.47 3 9.5S5.47 15 8.5 15c1.75 0 3.32-.91 4.15-2.3l1.68 1.14C13.2 15.7 11 17 8.5 17 4.36 17 1 13.64 1 9.5S4.36 2 8.5 2c2.5 0 4.7 1.3 5.83 3.16L12.65 6.3zM22 9h-2V7h-2v2h-5v2h1.27c.44 1.46 1.3 2.73 2.41 3.71-1.07.44-2.25.69-3.48.69v2c1.78 0 3.44-.45 4.89-1.24C20.56 14.55 22.22 15 24 15v-2c-1.23 0-2.41-.25-3.48-.69 1.11-.98 1.97-2.25 2.41-3.71H24V9h-2zm-4 3.7c-.9-.8-1.63-1.8-2.08-2.7h4.16c-.45.9-1.18 1.9-2.08 2.7z"/>
      </svg>`

      /* ── 浮窗 ── */
      const popup = document.createElement('div')
      popup.id = 'wa-inject-lang-popup'
      _langPopup = popup

      const makeRow = (labelText, id, storageKey, currentValue) => {
        const row = document.createElement('div')
        row.className = 'wa-inject-select-row'
        const lbl = document.createElement('label')
        lbl.htmlFor = id
        lbl.textContent = labelText
        const sel = document.createElement('select')
        sel.id = id
        // 默认加 auto
        const autoOpt = document.createElement('option')
        autoOpt.value = 'auto'
        autoOpt.textContent = '自动检测'
        sel.appendChild(autoOpt)
        sel.value = currentValue || 'auto'
        sel.addEventListener('change', () => {
          if (storageKey === CONSTANTS.LS_LOCAL_LANG) {
            STATE.localLang = sel.value
          } else {
            STATE.targetLang = sel.value
          }
          localStorage.setItem(storageKey, sel.value)
        })
        row.appendChild(lbl)
        row.appendChild(sel)
        return row
      }

      popup.appendChild(makeRow('源语言', 'wa-inject-local-sel', CONSTANTS.LS_LOCAL_LANG, STATE.localLang))
      popup.appendChild(makeRow('目标语言', 'wa-inject-target-sel', CONSTANTS.LS_TARGET_LANG, STATE.targetLang))

      // 填充已有语言列表
      updateLanguageDropdowns()

      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        popup.classList.toggle('visible')
      })

      // 点击外部关闭
      document.addEventListener('click', (e) => {
        if (!popup.contains(e.target) && e.target !== btn) {
          popup.classList.remove('visible')
        }
      })

      // 将按钮和浮窗插到工具栏
      const wrap = document.createElement('div')
      wrap.style.cssText = 'position:relative;display:flex;align-items:center;'
      wrap.appendChild(btn)
      wrap.appendChild(popup)

      // 插到工具栏第一个子元素前（紧贴输入框左侧）
      if (toolbar.firstChild) {
        toolbar.insertBefore(wrap, toolbar.firstChild)
      } else {
        toolbar.appendChild(wrap)
      }

      console.log('[WA-Inject] 语言选择按钮已注入')
    } catch (err) {
      console.error('[WA-Inject] injectLangButton 失败:', err.message)
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 9. 登录状态检测（5秒轮询）
   * ───────────────────────────────────────────────────────────────────────── */

  let _loginPollInterval = null
  let _lastLoginState = null

  /**
   * 检测一次登录状态并上报
   */
  const checkLoginStatus = () => {
    try {
      const avatar = document.querySelector('#app header img')
      if (avatar && avatar.src) {
        if (_lastLoginState !== true) {
          _lastLoginState = true
          sendToMain({ type: 'WA_STATUS', online: true, avatarUrl: avatar.src })
          // 登录后初始化功能模块
          initModulesAfterLogin()
        }
      } else {
        if (_lastLoginState !== false) {
          _lastLoginState = false
          sendToMain({ type: 'WA_STATUS', online: false })
        }
      }
    } catch (err) {
      console.warn('[WA-Inject] checkLoginStatus 失败:', err.message)
    }
  }

  /**
   * 启动登录状态轮询
   */
  const startLoginPolling = () => {
    if (_loginPollInterval) clearInterval(_loginPollInterval)
    checkLoginStatus()
    _loginPollInterval = setInterval(checkLoginStatus, CONSTANTS.LOGIN_POLL_MS)
    console.log('[WA-Inject] 登录状态轮询已启动')
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 10. 新消息通知（后台模式）
   * ───────────────────────────────────────────────────────────────────────── */

  let _notifyObserver = null

  /**
   * 监听可见性变化，管理通知观察
   */
  const setupVisibilityListener = () => {
    try {
      document.addEventListener('visibilitychange', () => {
        STATE.inBackground = document.visibilityState === 'hidden'
        if (STATE.inBackground) {
          startNewMsgObserver()
        } else {
          stopNewMsgObserver()
        }
      })
    } catch (err) {
      console.warn('[WA-Inject] setupVisibilityListener 失败:', err.message)
    }
  }

  /**
   * 启动新消息角标监听
   */
  const startNewMsgObserver = () => {
    try {
      if (_notifyObserver) return
      const chatList = document.querySelector('#pane-side') || document.querySelector('[data-testid="chat-list"]')
      if (!chatList) return

      _notifyObserver = new MutationObserver(() => {
        try {
          // WhatsApp 未读角标：span 内含数字，位于 .unread-count 或 [data-testid="icon-unread-count"]
          const badge =
            document.querySelector('[data-testid="icon-unread-count"]') ||
            document.querySelector('span.unread-count') ||
            document.querySelector('span[aria-label*="unread"]')

          if (!badge) return
          const count = parseInt(badge.textContent, 10)
          if (!count || isNaN(count)) return

          // 尝试提取发信方信息
          const chatItem = badge.closest('[data-testid="cell-frame-container"]') ||
            badge.closest('div[role="listitem"]')
          const from = chatItem?.querySelector('[data-testid="cell-frame-title"] span')?.textContent ||
            chatItem?.querySelector('span[title]')?.getAttribute('title') || '未知联系人'
          const msgText = chatItem?.querySelector('[data-testid="last-msg-status"] ~ span')?.textContent || ''
          const msgId = `notify_${Date.now()}`

          sendToMain({ type: 'WA_NEW_MSG', from, text: msgText, time: Date.now(), msgId })
        } catch { /* ignore */ }
      })

      _notifyObserver.observe(chatList, { childList: true, subtree: true, characterData: true })
      console.log('[WA-Inject] 新消息 Observer 已启动（后台模式）')
    } catch (err) {
      console.warn('[WA-Inject] startNewMsgObserver 失败:', err.message)
    }
  }

  /**
   * 停止新消息角标监听
   */
  const stopNewMsgObserver = () => {
    try {
      if (_notifyObserver) {
        _notifyObserver.disconnect()
        _notifyObserver = null
        console.log('[WA-Inject] 新消息 Observer 已停止（前台模式）')
      }
    } catch { /* ignore */ }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 11. 用户画像触发按钮
   * ───────────────────────────────────────────────────────────────────────── */

  /**
   * 从 React Fiber 或 DOM 提取当前对话联系人手机号
   * @returns {string|null}
   */
  const extractCurrentContactPhone = () => {
    try {
      // 方法1：从页头 title/subtitle 提取（E.164 格式 +xxxx）
      const header = document.querySelector('#main header')
      if (header) {
        const titleEl = header.querySelector('[data-testid="conversation-info-header-chat-title"] span') ||
          header.querySelector('span[title]')
        if (titleEl) {
          const title = titleEl.getAttribute('title') || titleEl.textContent || ''
          const phoneMatch = title.match(/\+\d[\d\s\-()]{6,}/)
          if (phoneMatch) return phoneMatch[0].replace(/[\s\-()]/g, '')
        }
      }

      // 方法2：从 React Fiber Props 挖掘（内部 API，不稳定但有效）
      const chatTitleEl = document.querySelector('[data-testid="conversation-info-header-chat-title"]')
      if (chatTitleEl) {
        let fiber = chatTitleEl._reactFiber || chatTitleEl.__reactFiber ||
          Object.keys(chatTitleEl).find(k => k.startsWith('__reactFiber'))
        if (typeof fiber === 'string') fiber = chatTitleEl[fiber]
        if (fiber) {
          let node = fiber
          for (let i = 0; i < 20; i++) {
            if (node?.memoizedProps?.id) {
              const id = String(node.memoizedProps.id)
              const m = id.match(/^(\+?\d{7,15})@/)
              if (m) return m[1]
            }
            node = node?.return
            if (!node) break
          }
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * 注入用户画像按钮
   */
  const injectPortraitButton = () => {
    try {
      if (document.getElementById('wa-inject-portrait-btn')) return

      const btn = document.createElement('button')
      btn.id = 'wa-inject-portrait-btn'
      btn.title = '查看用户画像'
      btn.setAttribute('aria-label', '查看用户画像')
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="#fff">
        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
      </svg>`

      btn.addEventListener('click', () => {
        const phone = extractCurrentContactPhone()
        if (phone) {
          sendToMain({ type: 'WA_PORTRAIT', phone_number: phone })
        } else {
          showToast('无法识别当前联系人手机号', 'error')
        }
      })

      document.body.appendChild(btn)
      console.log('[WA-Inject] 用户画像按钮已注入')
    } catch (err) {
      console.error('[WA-Inject] injectPortraitButton 失败:', err.message)
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 12. 登录后功能初始化（只执行一次）
   * ───────────────────────────────────────────────────────────────────────── */

  let _modulesInited = false

  /**
   * 登录检测成功后初始化所有功能模块
   */
  const initModulesAfterLogin = async () => {
    if (_modulesInited) return
    _modulesInited = true

    try {
      // 等待主聊天面板就绪
      await waitForElement('#pane-side', 30000)
      console.log('[WA-Inject] #pane-side 已就绪，初始化功能模块…')

      // 并行初始化各模块
      startReceiveTranslationObserver()
      setupVisibilityListener()

      // 等待输入框区域就绪后注入 UI
      await waitForElement('#main footer', 20000)
      injectLangButton()
      bindSendTranslation()
      injectPortraitButton()

      console.log('[WA-Inject] 所有模块初始化完成 ✓')
    } catch (err) {
      console.error('[WA-Inject] initModulesAfterLogin 失败:', err.message)
      // 重置标志，允许下次重试
      _modulesInited = false
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * 13. 入口：等待 WhatsApp 页面基础结构加载
   * ───────────────────────────────────────────────────────────────────────── */

  /**
   * 主入口
   */
  const main = async () => {
    try {
      console.log('[WA-Inject] 脚本已加载，等待 WhatsApp 初始化…')

      // 等待 WhatsApp 应用根节点
      await waitForElement('#app', 60000)
      console.log('[WA-Inject] #app 已就绪')

      // 启动登录轮询（可能在扫码阶段，故不等待登录就启动轮询）
      startLoginPolling()

      // 若已登录（无需扫码），等待 pane-side 出现触发模块初始化
      // （loginPolling 检测到登录后会调用 initModulesAfterLogin）
    } catch (err) {
      console.error('[WA-Inject] main() 失败:', err.message)
    }
  }

  // DOM 加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main)
  } else {
    main()
  }
})()
