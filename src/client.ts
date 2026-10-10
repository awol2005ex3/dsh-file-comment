/**
 * dsh-file-comment — Browser bundle module body.
 *
 * Build contract (deepseek-harness packages/client/tsdown.client.ts closure
 * factory format): this file is compiled by tsc, then wrapped by
 * scripts/wrap-client.mjs with:
 *   banner: window.__ModuleLoader__.load({ id, factory: (require) => {
 *   intro : var module = { exports: {} }; var exports = module.exports;
 *   footer: return module.exports; } });
 * becoming a lazy CJS bundle. Side effects run inside the factory closure
 * when the browser shell materializes the fiber.
 *
 * No import/export statements (except the final module.exports assignment)
 * so the wrap script can cleanly enclose the body. Types are declared
 * locally to avoid external d.ts imports.
 *
 * Feature:
 *   - Listen for text selection in the right-sidebar document preview
 *   - Show a floating toolbar near the selection
 *   - "Add Comment" button opens an inline dialog
 *   - "Send to Chat" button sends selected text directly
 *   - Formatted text (file path + lines + code + comment) is pasted into the
 *     conversation composer via connection.rpc
 */

const PLUGIN_ID = 'dsh-file-comment'

/* ── CSS selectors for locating the document preview area ── */
const PREVIEW_SELECTORS = [
  '[data-code-preview]',
  '[data-sidebar-right-session]',
  '[data-slot="sidebar.right.pane.tab"]',
].join(',')

/* ── Build guard (single mount) ── */
const BUILD_GUARD_KEY = '__dshFileCommentMounted'

/* ── CJS globals injected by the wrap script ── */
declare const module: { exports: unknown }
declare function require(id: string): any

/* ── Narrow DOM access ── */
const win = window as unknown as Record<string, unknown>
const doc = document

/* ── Types ── */

interface SelectionInfo {
  text: string
  filePath: string
  startLine: number | null
  endLine: number | null
}

/* ── State ── */

let currentSelection: SelectionInfo | null = null
let toolbarVisible = false
let dialogVisible = false

/* ── Composer slot capture (official conversation.input API) ── */

/** Minimal face of the stable public input actions exposed to session-scope slots. */
interface ComposerInputActions {
  captureInsertion(): unknown
  insertText(text: string, span: unknown): boolean
}

let pluginCtx: any = null
let capturedInputActions: ComposerInputActions | null = null
let composerSlotInjected = false

/**
 * Passively occupy `conversation.input.activity` (kind: single, scope: session)
 * to capture the active composer's InputActions — the official plugin channel
 * (see dsh fixture apps/web/tests/fixtures/plugins/fixture-input-extension).
 * The render body only stores props.inputActions and renders nothing.
 * Idempotent; called again on the first send in case the `slots` service was
 * not yet available when apply() ran (boot ordering).
 */
function ensureComposerSlot(): void {
  if (composerSlotInjected || !pluginCtx) return
  try {
    /* ctx.get bypasses cordis 4's strict inject check on property access */
    const slots = pluginCtx.get?.('slots')
    if (!slots || typeof slots.inject !== 'function') return
    composerSlotInjected = true
    slots.inject('conversation.input.activity', () => slots.register(
      { name: 'conversation.input.activity' },
      (props: any) => {
        if (props && props.inputActions) capturedInputActions = props.inputActions as ComposerInputActions
        /* render nothing; the slot machinery's error boundary tolerates null */
        return null
      },
    ))
  } catch {
    /* leave the flag false so the next send retries */
    composerSlotInjected = false
  }
}

/* ──────────────────────────────────────────────────────────
 * Styles
 * ────────────────────────────────────────────────────────── */

const TOOLBAR_CSS = [
  'position:fixed;z-index:2147483646;',
  'display:none;align-items:center;gap:6px;',
  'padding:4px 8px;',
  'background:#1e1e2e;color:#cdd6f4;',
  'border:1px solid rgba(205,214,244,.2);border-radius:8px;',
  'box-shadow:0 4px 16px rgba(0,0,0,.35);',
  'font:12px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
  'user-select:none;',
].join('')

const BTN_CSS = [
  'padding:4px 10px;cursor:pointer;',
  'border:1px solid rgba(205,214,244,.25);background:transparent;color:#cdd6f4;',
  'border-radius:5px;font:12px/1.4 inherit;white-space:nowrap;',
].join('')

const BTN_PRI_CSS = 'background:#89b4fa;color:#1e1e2e;border-color:#89b4fa;'
const SEL_INFO_CSS = 'max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.65;'

const DIALOG_OV_CSS = [
  'position:fixed;inset:0;z-index:2147483647;',
  'display:flex;align-items:center;justify-content:center;',
  'background:rgba(0,0,0,.45);',
].join('')

const DIALOG_BOX_CSS = [
  'width:480px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;',
  'background:#1e1e2e;color:#cdd6f4;border-radius:12px;',
  'box-shadow:0 12px 40px rgba(0,0,0,.45);overflow:hidden;',
  'font:14px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
].join('')

const DIALOG_HDR_CSS = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(205,214,244,.12);'
const DIALOG_BODY_CSS = 'flex:1;overflow:auto;padding:16px;'
const DIALOG_FTR_CSS = 'display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid rgba(205,214,244,.12);'

const INPUT_CSS = [
  'width:100%;box-sizing:border-box;padding:8px 10px;margin-top:6px;',
  'border:1px solid rgba(205,214,244,.2);border-radius:6px;',
  'background:rgba(255,255,255,.05);color:#cdd6f4;',
  'font:13px/1.5 Consolas,Monaco,monospace;resize:vertical;',
].join('')

const CODE_PRE_CSS = [
  'max-height:140px;overflow:auto;margin:8px 0 0;',
  'padding:8px 10px;border-radius:6px;',
  'background:rgba(0,0,0,.25);border:1px solid rgba(205,214,244,.1);',
  'font:12px/1.4 Consolas,Monaco,monospace;white-space:pre-wrap;word-break:break-all;',
].join('')

const META_CSS = 'opacity:.65;font-size:12px;margin-bottom:10px;'
const CLOSE_BTN_CSS = 'background:none;border:none;color:#cdd6f4;cursor:pointer;font-size:18px;padding:0 4px;'

/* ──────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────── */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, unknown>,
  children?: (Node | string)[],
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === 'style') node.setAttribute('style', v as string)
      else (node as unknown as Record<string, unknown>)[k] = v
    }
  }
  if (children) {
    for (const c of children) node.append(typeof c === 'string' ? doc.createTextNode(c) : c)
  }
  return node
}

/**
 * Like `Element.closest`, but crosses Shadow DOM boundaries (DSH uses
 * Shadow DOM extensively): walks up the parent chain one level at a time and
 * only hops from a ShadowRoot to its host when the tree edge is reached.
 * Accepts any node — text-node anchors (the normal case for text selections)
 * are handled by walking up to their parent element first.
 */
function closestAcrossShadow(node: Node | null, selector: string): Element | null {
  let current: Node | null = node
  while (current) {
    if (current instanceof Element) {
      const hit = current.closest(selector)
      if (hit) return hit
    }
    const parent = current.parentNode
    if (parent) {
      current = parent
      continue
    }
    /* tree edge: hop across the Shadow DOM boundary if there is one */
    const root = current.getRootNode()
    if (root instanceof ShadowRoot) {
      current = root.host
      continue
    }
    break
  }
  return null
}

/**
 * Is `node` inside the document-preview area of the right sidebar?
 * Walks up through Shadow DOM boundaries (DSH uses Shadow DOM extensively).
 */
function inPreviewArea(node: Node | null): boolean {
  return closestAcrossShadow(node, PREVIEW_SELECTORS) !== null
}

/** Find the active right-sidebar document tab and return its visible title text. */
function findActiveDocTab(): HTMLElement | null {
  const candidates = doc.querySelectorAll(
    '[data-slot="sidebar.right.pane.tab"], [data-active="true"], [aria-selected="true"]',
  )
  for (let i = 0; i < candidates.length; i++) {
    const tab = candidates[i]
    if (!(tab instanceof HTMLElement)) continue
    const attrs = (tab.getAttribute('data-slot-key') ?? '') + ' ' + (tab.className ?? '')
    if (/document|preview|text|code/i.test(attrs)) return tab
  }
  return null
}

/**
 * Best-effort file path extraction from the active document tab element.
 * Tries several DOM heuristics; returns empty string when nothing found.
 * Searches through Shadow DOM roots as well.
 */
function getFilePath(): string {
  const tab = findActiveDocTab()
  if (!tab) return ''

  /* title / label element */
  const title = tab.querySelector('[title]')
  if (title?.getAttribute('title')) return title.getAttribute('title')!

  const fileName = tab.querySelector(
    '[data-file-name], [data-file-path], [data-resource-path], .tab-title, .file-name',
  )
  if (fileName?.textContent) return fileName.textContent.trim()

  /* tab-info region */
  const info = tab.querySelector('[data-tab-info], .tab-info, .tab-label')
  if (info?.textContent) return info.textContent.trim()

  /* contentId / address data attribute */
  const withAddr = tab.querySelector('[data-content-id], [data-address]')
  const addr = withAddr?.getAttribute('data-content-id') ?? withAddr?.getAttribute('data-address') ?? ''
  if (addr) {
    try { return new URL(addr).pathname.replace(/^\/session\/[^/]+\//, '/') } catch { return addr }
  }

  /* search inside shadow roots */
  const shadowPath = findInShadowRoots('[title]')
  if (shadowPath?.getAttribute('title')) return shadowPath.getAttribute('title')!

  /* fallback: any element with a path-like title anywhere in the sidebar */
  const sidebars = doc.querySelectorAll('[data-sidebar-right-session]')
  for (let i = 0; i < sidebars.length; i++) {
    const titled = sidebars[i]!.querySelectorAll('[title]')
    for (let j = 0; j < titled.length; j++) {
      const t = titled[j]!.getAttribute('title')
      if (t && (t.includes('/') || t.includes('\\') || t.includes('.'))) return t
    }
  }

  /* fallback: visible title text */
  const txt = tab.querySelector('[data-slot="sidebar.right.pane.tab.title"]')?.textContent
    ?? tab.querySelector('.title, h3, h4, span')?.textContent
  return txt?.trim() ?? ''
}

/** Search all shadow roots in the document for the first element matching `selector`. */
function findInShadowRoots(selector: string): Element | null {
  const allElements = doc.querySelectorAll('*')
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i]!
    if (el.shadowRoot) {
      const found = el.shadowRoot.querySelector(selector)
      if (found) return found
    }
  }
  return null
}

/**
 * Try to determine which source lines the selection covers.
 * Walks the selection's text nodes inside the preview container, looking for
 * DOM elements that carry line-number metadata (data-line, class patterns).
 * Returns null when line numbers cannot be determined.
 */
function detectLines(sel: Selection): { start: number; end: number } | null {
  if (!sel.rangeCount) return null
  const range = sel.getRangeAt(0)
  const container = range.commonAncestorContainer instanceof HTMLElement
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement
  if (!container) return null

  const previewRoot = closestAcrossShadow(container, '[data-code-preview]')
    ?? closestAcrossShadow(container, PREVIEW_SELECTORS)
  if (!previewRoot) return null

  const walker = doc.createTreeWalker(previewRoot, NodeFilter.SHOW_ELEMENT)
  let start: number | null = null
  let end: number | null = null

  const lineOf = (e: Element): number | null => {
    const dl = e.getAttribute('data-line')
    if (dl) { const n = parseInt(dl, 10); if (!isNaN(n)) return n }
    const cls = e.className
    if (typeof cls === 'string') {
      const m = cls.match(/(?:line[-_]?|l)(\d+)/i)
      if (m && m[1] !== undefined) return parseInt(m[1], 10)
    }
    return null
  }

  let node = walker.nextNode() as Element | null
  while (node) {
    if (node instanceof Element && range.intersectsNode(node)) {
      const ln = lineOf(node)
      if (ln !== null) {
        if (start === null || ln < start) start = ln
        if (end === null || ln > end) end = ln
      }
    }
    node = walker.nextNode() as Element | null
  }

  if (start !== null && end !== null) return { start, end }
  return null
}

/** Read the current browser selection if it falls inside the preview area. */
function updateSelection(): SelectionInfo | null {
  const sel = doc.getSelection()
  if (!sel || sel.isCollapsed) { currentSelection = null; return null }

  const text = sel.toString().trim()
  /* anchor or focus endpoint may sit inside the preview area (dragged selections) */
  const inArea = inPreviewArea(sel.anchorNode) || inPreviewArea(sel.focusNode)
  if (!text || !inArea) { currentSelection = null; return null }

  const lines = detectLines(sel)
  currentSelection = {
    text,
    filePath: getFilePath(),
    startLine: lines?.start ?? null,
    endLine: lines?.end ?? null,
  }
  return currentSelection
}

/* ──────────────────────────────────────────────────────────
 * Toolbar
 * ────────────────────────────────────────────────────────── */

function positionToolbar(toolbar: HTMLElement, sel: Selection): void {
  if (!sel.rangeCount) return
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return

  const vw = window.innerWidth
  const vh = window.innerHeight
  let top = rect.top - 44
  let left = rect.left + rect.width / 2 - 140

  if (top < 8) top = rect.bottom + 8
  if (top + 48 > vh) top = vh - 56
  if (left < 8) left = 8
  if (left + 320 > vw) left = vw - 328

  toolbar.style.top = `${Math.round(top)}px`
  toolbar.style.left = `${Math.round(left)}px`
}

function showToolbar(info: SelectionInfo): void {
  let toolbar = doc.getElementById(PLUGIN_ID + '-toolbar') as HTMLElement | null

  if (!toolbar) {
    toolbar = el('div', { id: PLUGIN_ID + '-toolbar', style: TOOLBAR_CSS })

    const snippet = el('span', {
      style: SEL_INFO_CSS,
      title: info.text.length > 80 ? info.text.slice(0, 200) + '...' : info.text,
    })
    snippet.textContent = info.text.length > 36 ? info.text.slice(0, 36) + '...' : info.text

    const commentBtn = el('button', { style: BTN_CSS + BTN_PRI_CSS, textContent: '\u{1F4AC} \u8BC4\u8BBA\u5E76\u63D0\u95EE' })
    const sendBtn = el('button', { style: BTN_CSS, textContent: '\u{1F4E4} \u53D1\u9001\u5230\u804A\u5929' })

    commentBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showDialog(info) })
    sendBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); sendToComposer(info, '') })

    toolbar.append(snippet, commentBtn, sendBtn)
    doc.body.append(toolbar)
  } else {
    const snip = toolbar.querySelector('span')
    if (snip) {
      snip.textContent = info.text.length > 36 ? info.text.slice(0, 36) + '...' : info.text
      snip.title = info.text.length > 80 ? info.text.slice(0, 200) + '...' : info.text
    }
    /* rebind click handlers with fresh selection info */
    const btns = toolbar.querySelectorAll('button')
    const newComment = el('button', { style: BTN_CSS + BTN_PRI_CSS, textContent: '\u{1F4AC} \u8BC4\u8BBA\u5E76\u63D0\u95EE' })
    const newSend = el('button', { style: BTN_CSS, textContent: '\u{1F4E4} \u53D1\u9001\u5230\u804A\u5929' })
    newComment.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showDialog(info) })
    newSend.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); sendToComposer(info, '') })
    if (btns[0]) btns[0].replaceWith(newComment)
    if (btns[1]) btns[1].replaceWith(newSend)
  }

  const sel = doc.getSelection()
  if (sel) positionToolbar(toolbar, sel)
  toolbar.style.display = 'flex'
  toolbarVisible = true
}

function hideToolbar(): void {
  const toolbar = doc.getElementById(PLUGIN_ID + '-toolbar')
  if (toolbar) toolbar.style.display = 'none'
  toolbarVisible = false
}

/* ──────────────────────────────────────────────────────────
 * Comment dialog
 * ────────────────────────────────────────────────────────── */

function showDialog(info: SelectionInfo): void {
  hideToolbar()
  hideDialog()
  dialogVisible = true

  const overlay = el('div', { id: PLUGIN_ID + '-dialog', style: DIALOG_OV_CSS })

  /* header */
  const closeBtn = el('button', { style: CLOSE_BTN_CSS, textContent: '\u00D7' })
  closeBtn.addEventListener('click', () => hideDialog())
  const header = el('div', { style: DIALOG_HDR_CSS }, [
    el('div', { style: 'font-weight:700;font-size:15px;', textContent: '\u{1F4DD} \u6DFB\u52A0\u8BC4\u8BBA\u5E76\u63D0\u95EE' }),
    closeBtn,
  ])

  /* body */
  const metaParts: string[] = []
  if (info.filePath) metaParts.push('\u{1F4C4} ' + info.filePath)
  if (info.startLine !== null) {
    metaParts.push('\u884C ' + info.startLine + (info.endLine !== null && info.endLine !== info.startLine ? '-' + info.endLine : ''))
  }
  const meta = el('div', { style: META_CSS })
  meta.textContent = metaParts.join('  |  ') || '(\u672A\u77E5\u6587\u4EF6)'

  const codePre = el('pre', { style: CODE_PRE_CSS })
  codePre.textContent = info.text.length > 500 ? info.text.slice(0, 500) + '\n...' : info.text

  const textarea = el('textarea', {
    placeholder: '\u8F93\u5165\u4F60\u7684\u8BC4\u8BBA\u6216\u95EE\u9898\u2026',
    style: INPUT_CSS + 'min-height:80px;',
  }) as HTMLTextAreaElement

  const body = el('div', { style: DIALOG_BODY_CSS }, [meta, codePre, textarea])

  /* footer */
  const cancelBtn = el('button', { style: BTN_CSS, textContent: '\u53D6\u6D88' })
  cancelBtn.addEventListener('click', () => hideDialog())

  const sendCommentBtn = el('button', { style: BTN_CSS + BTN_PRI_CSS, textContent: '\u{1F680} \u53D1\u9001\u5230\u804A\u5929' })
  sendCommentBtn.addEventListener('click', () => {
    const comment = textarea.value.trim()
    if (!comment) { textarea.style.borderColor = '#f38ba8'; textarea.focus(); return }
    sendToComposer(info, comment)
    hideDialog()
  })

  const sendOnlyBtn = el('button', { style: BTN_CSS, textContent: '\u{1F4E4} \u53EA\u53D1\u4EE3\u7801' })
  sendOnlyBtn.addEventListener('click', () => {
    sendToComposer(info, '')
    hideDialog()
  })

  const footer = el('div', { style: DIALOG_FTR_CSS }, [cancelBtn, sendOnlyBtn, sendCommentBtn])
  const box = el('div', { style: DIALOG_BOX_CSS }, [header, body, footer])
  overlay.append(box)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) hideDialog() })
  doc.body.append(overlay)

  /* Enter sends, Shift+Enter for newline */
  setTimeout(() => {
    textarea.focus()
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendCommentBtn.click()
      }
      if (e.key === 'Escape') hideDialog()
    })
  }, 60)
}

function hideDialog(): void {
  const d = doc.getElementById(PLUGIN_ID + '-dialog')
  if (d) d.remove()
  dialogVisible = false
}

/* ──────────────────────────────────────────────────────────
 * Composer integration
 * ────────────────────────────────────────────────────────── */

/** Format the selection + optional comment into a structured message. */
function formatMessage(info: SelectionInfo, comment: string): string {
  const parts: string[] = []

  /* header: file + lines */
  let header = ''
  if (info.filePath) header += '\u{1F4C4} `' + info.filePath + '`'
  if (info.startLine !== null) {
    header += (header ? ' ' : '') + '\u2014 \u884C ' + info.startLine
    if (info.endLine !== null && info.endLine !== info.startLine) header += '-' + info.endLine
  }
  if (header) parts.push(header)

  /* selected code */
  parts.push('```')
  parts.push(info.text)
  parts.push('```')

  /* user comment */
  if (comment) parts.push('\u{1F4AC} ' + comment)

  parts.push('')
  return parts.join('\n')
}

/**
 * Locate the visible main chat composer: DSH's composer binds a Lexical editor
 * to a contenteditable root. Prefers the lowest such element on screen (the
 * composer bar sits at the bottom) and skips right-sidebar panes.
 */
function findComposerElement(): HTMLElement | null {
  const nodes = doc.querySelectorAll('[contenteditable="true"]')
  let best: HTMLElement | null = null
  let bestTop = -1
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!
    if (!(node instanceof HTMLElement)) continue
    const rect = node.getBoundingClientRect()
    if (rect.width < 40 || rect.height < 16) continue
    /* the right sidebar hosts its own panes; the chat composer is in the main area */
    if (closestAcrossShadow(node, PREVIEW_SELECTORS)) continue
    if (rect.top > bestTop) { bestTop = rect.top; best = node }
  }
  return best
}

/**
 * Insert text through the composer's own paste pipeline (multiline →
 * paragraphs, undo integrated), with execCommand as the fallback. Returns
 * whether an insertion path consumed the text.
 */
function pasteIntoComposer(text: string): boolean {
  const target = findComposerElement()
  if (!target) return false
  target.focus()
  /* synthetic paste event: Lexical's DOM paste listener reads clipboardData */
  try {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    /* dispatchEvent === false → preventDefault → a handler consumed the paste */
    if (!target.dispatchEvent(event)) return true
  } catch { /* DataTransfer / ClipboardEvent may be unavailable */ }
  /* fallback: execCommand keeps the editor's undo integration */
  try {
    return doc.execCommand('insertText', false, text)
  } catch {
    return false
  }
}

/** Deliver formatted text to the conversation composer; layered fallbacks, each isolated. */
async function sendToComposer(info: SelectionInfo, comment: string): Promise<void> {
  const text = formatMessage(info, comment)

  /* 1. Official channel: InputActions captured from the composer activity slot
   *    (revision-guarded, undo-integrated, newlines split paragraphs). */
  try {
    ensureComposerSlot()
    const actions = capturedInputActions
    if (actions) {
      const span = actions.captureInsertion()
      if (span != null && actions.insertText(text, span)) {
        /* eslint-disable-next-line no-console */
        console.debug('[dsh-file-comment] sent via conversation.input slot')
        return
      }
    }
  } catch (err) {
    /* eslint-disable-next-line no-console */
    console.debug('[dsh-file-comment] slot insert unavailable:', err)
  }

  /* 2. DOM paste into the visible main composer (the app's own paste pipeline). */
  try {
    if (pasteIntoComposer(text)) {
      /* eslint-disable-next-line no-console */
      console.debug('[dsh-file-comment] sent via composer paste event')
      return
    }
  } catch (err) {
    /* eslint-disable-next-line no-console */
    console.debug('[dsh-file-comment] composer paste failed:', err)
  }

  /* 3. Legacy: connection.rpc (only reachable if a connection was cached). */
  try {
    const conn = getConnection()
    if (conn?.rpc?.call) {
      await conn.rpc.call('/api', 'conversation/input-paste', { args: { text } })
      /* eslint-disable-next-line no-console */
      console.debug('[dsh-file-comment] sent via connection.rpc')
      return
    }
  } catch (err) {
    /* eslint-disable-next-line no-console */
    console.debug('[dsh-file-comment] connection.rpc failed:', err)
  }

  /* 4. Legacy: Cordis context exposed on a global (best-effort, some builds). */
  try {
    const globalCtx = (win as unknown as Record<string, any>).__dshContext
    if (globalCtx?.conversation?.input) {
      const sessionId = globalCtx.sidebarRight?.mounted?.getSnapshot?.()
      if (sessionId) {
        const sessionCtx = globalCtx.sessions?.scope?.(sessionId)
        if (sessionCtx) {
          const input = globalCtx.conversation.input.for(sessionCtx)
          input.focus()
          input.paste(text)
          /* eslint-disable-next-line no-console */
          console.debug('[dsh-file-comment] sent via __dshContext')
          return
        }
      }
    }
  } catch (err) {
    /* eslint-disable-next-line no-console */
    console.debug('[dsh-file-comment] __dshContext paste failed:', err)
  }

  /* 5. Last resort: clipboard (user can paste manually). */
  try {
    await navigator.clipboard.writeText(text)
    /* eslint-disable-next-line no-console */
    console.debug('[dsh-file-comment] composer not reached — text copied to clipboard')
  } catch {
    /* clipboard API may not be available */
  }
}

/* ──────────────────────────────────────────────────────────
 * Event wiring & init
 * ────────────────────────────────────────────────────────── */

function onSelectionChange(): void {
  if (dialogVisible) return

  const sel = doc.getSelection()
  if (!sel) { /* eslint-disable-next-line no-console */ console.debug('[dsh-file-comment] no selection object'); return }

  const text = sel.isCollapsed ? '' : sel.toString().trim()
  const anchor = sel.anchorNode
  const inPreview = inPreviewArea(anchor)
  /* eslint-disable-next-line no-console */
  console.debug('[dsh-file-comment] sel:', { collapsed: sel.isCollapsed, textLen: text.length, anchorTag: anchor?.nodeName, inPreview })

  if (inPreview && text) {
    /* eslint-disable-next-line no-console */
    console.debug('[dsh-file-comment] anchor path:', walkAnchorPath(anchor))
  }

  const info = updateSelection()
  if (info) {
    showToolbar(info)
  } else if (toolbarVisible) {
    hideToolbar()
  }
}

/** Debug helper: build a string showing the anchor's ancestor chain (including Shadow DOM hosts). */
function walkAnchorPath(node: Node | null): string {
  const parts: string[] = []
  let current: Node | null = node
  let depth = 0
  while (current && depth < 20) {
    depth++
    if (current instanceof Element) {
      const tag = current.tagName.toLowerCase()
      const id = current.id ? `#${current.id}` : ''
      const cls = current.className && typeof current.className === 'string'
        ? '.' + current.className.split(/\s+/).slice(0, 3).join('.') : ''
      const attrs: string[] = []
      for (let i = 0; i < current.attributes.length; i++) {
        const a = current.attributes[i]!
        if (a.name.startsWith('data-')) attrs.push(`[${a.name}="${a.value.slice(0, 30)}"]`)
      }
      parts.push(`${tag}${id}${cls}${attrs.join('')}`)
    } else {
      parts.push(current.nodeName)
    }
    const root = current.getRootNode()
    if (root instanceof ShadowRoot) {
      parts.push(`⤴ shadow(${root.host.tagName.toLowerCase()}${root.host.id ? '#' + root.host.id : ''})`)
      current = root.host
    } else {
      current = current.parentNode
    }
  }
  return parts.join(' → ')
}

function onGlobalClick(e: Event): void {
  if (dialogVisible) return
  if (!toolbarVisible) return
  const target = e.target as HTMLElement | null
  if (!target) return

  const toolbar = doc.getElementById(PLUGIN_ID + '-toolbar')
  if (toolbar?.contains(target)) return

  /* click outside preview area → dismiss toolbar */
  if (!inPreviewArea(target)) hideToolbar()
}

function init(): void {
  doc.addEventListener('selectionchange', onSelectionChange)
  doc.addEventListener('click', onGlobalClick)
  /* eslint-disable-next-line no-console */
  console.log('[dsh-file-comment] plugin loaded, listening for selections')
}

/* ── Resolve connection lazily (not in inject — it must not block loading) ── */

function getConnection(): any {
  /* cached from apply */
  const cached = (win as unknown as Record<string, any>).__dshConnection
  if (cached) return cached

  /* try to find it via the Cordis context exposed on the DOM or globals */
  const globalCtx = (win as unknown as Record<string, any>).__dshContext
    ?? (win as unknown as Record<string, any>).__cordisContext
  if (globalCtx?.connection?.rpc) return globalCtx.connection

  return null
}

/* ── Client plugin contract ── */

function apply(ctx: any): void {
  if ((win as unknown as Record<string, any>)[BUILD_GUARD_KEY] === true) return
  ;(win as unknown as Record<string, any>)[BUILD_GUARD_KEY] = true

  /* connection is optional — resolve via ctx.get (a bare ctx.connection property
   * access throws under cordis 4 strict inject rules, silently killing the cache) */
  try {
    const conn = typeof ctx?.get === 'function' ? ctx.get('connection') : ctx?.connection
    if (conn?.rpc && typeof conn.rpc.call === 'function') {
      ;(win as unknown as Record<string, any>).__dshConnection = conn
    }
  } catch { /* connection may not be available yet */ }

  /* capture the official composer input actions (non-fatal; retried on send) */
  pluginCtx = ctx
  try { ensureComposerSlot() } catch { /* slots service may not be up yet */ }

  try { init() } catch (err) {
    /* never let init failure silently kill the plugin */
    ;(win as unknown as Record<string, any>).__dshFileCommentError = String(err)
  }
}

/* no inject: connection is resolved lazily at send time */
module.exports = { name: PLUGIN_ID, apply }
