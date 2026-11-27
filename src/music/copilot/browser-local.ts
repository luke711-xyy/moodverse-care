import { generateCockpitReply } from '../../../desktop/src/cockpit-conversation.mjs'
import type { CopilotContext, CopilotMessage, CopilotSettings } from './contracts'
import { localDay, rangeFor, type HistoryRange, type HistoryPage } from './HistoryPanel'

export type BrowserConnection = { owner: string; endpoint: string; model: string }
const connectionPrefix = 'mosic-browser-model:'
const turnPrefix = (owner: string) => 'mosic-browser-turn:' + encodeURIComponent(owner) + ':'
const generationKey = (owner: string) => 'mosic-browser-history-generation:' + encodeURIComponent(owner)

export function loopbackUrl(value: string) {
  const invalid = '请填写这台电脑的回环接口地址，例如 http://127.0.0.1:11434/v1。'
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error(invalid) }
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || !/^\/v1\/?$/.test(url.pathname)) throw new Error(invalid)
  return url.origin + '/v1'
}

async function localRequest(endpoint: string, path: string, init: RequestInit) {
  const url = loopbackUrl(endpoint) + path
  let result: Response
  try { result = await fetch(url, { ...init, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' }) }
  catch (error) {
    if (init.signal?.aborted) throw error
    throw new Error('无法连接这台电脑的模型。请确认服务正在运行，允许 MOSIC 来源跨域访问，并检查浏览器的本地网络权限。')
  }
  if (!result.ok) throw new Error(`本机模型服务返回 ${result.status}。请检查地址、模型和本机服务。`)
  return result.json()
}

async function currentOwner(signal?: AbortSignal): Promise<string> {
  const result = await fetch('/api/me/copilot/history?owner=1', { credentials: 'same-origin', cache: 'no-store', signal })
  if (result.ok) {
    const { ownerId } = await result.json()
    if (typeof ownerId === 'string' && /^[\w:-]{1,180}$/.test(ownerId)) return ownerId
  }
  throw new Error('无法确认当前驾驶员，请刷新后重试。')
}

export async function connectBrowserModel(url: string, modelId: string, signal: AbortSignal): Promise<BrowserConnection> {
  const endpoint = loopbackUrl(url), model = modelId.trim()
  if (!model || model.length > 250) throw new Error('请填写你的 Agent 已确认的完整模型 ID。')
  const owner = await currentOwner(signal)
  const data = await localRequest(endpoint, '/models', { signal })
  if (!Array.isArray(data.data) || !data.data.some((item: { id?: string } | null) => item?.id === model))
    throw new Error('服务已响应，但模型列表中没有这个 ID。请核对 Agent 返回的完整名称。')
  return { owner, endpoint, model }
}

export async function restoreBrowserModel(signal: AbortSignal): Promise<BrowserConnection | undefined> {
  try {
    if (!Object.keys(localStorage).some(key => key.startsWith(connectionPrefix))) return
    const owner = await currentOwner(signal)
    const raw = localStorage.getItem(connectionPrefix + owner)
    if (!raw) return
    const { endpoint, model } = JSON.parse(raw)
    if (typeof model === 'string' && model.trim()) return { owner, endpoint: loopbackUrl(endpoint), model }
  } catch { /* A fresh or storage-restricted browser starts unconfigured. */ }
}

export function saveBrowserModel(connection: BrowserConnection, remember: boolean) {
  try {
    const key = connectionPrefix + connection.owner
    if (remember) localStorage.setItem(key, JSON.stringify({ endpoint: connection.endpoint, model: connection.model }))
    else localStorage.removeItem(key)
  } catch { /* The connection is still usable for this page. */ }
}

// Each turn has its own key so simultaneous replies from different tabs do not overwrite each other.
export function browserHistory(owner: string, range: HistoryRange, cursor?: string): HistoryPage {
  const prefix = turnPrefix(owner)
  const turns = Object.keys(localStorage).filter(key => {
    if (!key.startsWith(prefix)) return false
    const at = key.slice(prefix.length, prefix.length + 24)
    return at >= range.start && at < range.end && (!cursor || key < cursor)
  }).sort()
  const latest = turns.slice(-50)
  const messages: CopilotMessage[] = latest.flatMap(key => {
    try {
      const rows = JSON.parse(localStorage.getItem(key) || '[]')
      return Array.isArray(rows) ? rows : []
    } catch { return [] }
  })
  return { messages, nextCursor: turns.length > latest.length ? latest[0] : null }
}

export function clearBrowserHistory(owner: string) {
  localStorage.setItem(generationKey(owner), crypto.randomUUID())
  for (const key of Object.keys(localStorage)) if (key.startsWith(turnPrefix(owner))) localStorage.removeItem(key)
}

export async function browserTurn(connection: BrowserConnection, input: { requestId: string; text: string; context: CopilotContext },
  settings: CopilotSettings, preferences: string[], signal: AbortSignal) {
  const { endpoint, model, owner } = connection
  const started = new Date()
  if (await currentOwner(signal) !== owner) throw new Error('当前驾驶员已切换，请为这个账号重新连接本机模型。')
  const generation = localStorage.getItem(generationKey(owner))
  const history = browserHistory(owner, rangeFor(localDay(started))).messages
  const result = await generateCockpitReply({
    input: { ...input, history, preferences: settings.memoryEnabled ? preferences : [] },
    config: { personality: { warm: '沉着亲和', concise: '简短直接', playful: '轻快活泼' }[settings.personality] },
    origin: window.location.origin, fetcher: fetch, source: 'browser-local', signal,
    generate: async ({ instructions }: { instructions: string }) => {
      const response = await localRequest(endpoint, '/chat/completions', {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: false, max_tokens: 1000, messages: [
          { role: 'system', content: instructions },
          ...history.slice(-10).map(m => ({ role: m.role, content: m.text.slice(0, 1600) })),
          { role: 'user', content: input.text },
        ] }),
      })
      const content = response.choices?.[0]?.message?.content
      const text = typeof content === 'string' && content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      if (!text) throw new Error('本机模型没有返回文字。可以切换到支持聊天的模型后再试。')
      return text
    },
  })
  signal.throwIfAborted()
  if (generation !== localStorage.getItem(generationKey(owner))) throw new Error('本机对话已清空。')
  const messages = result.messages.map((m: CopilotMessage) => ({ ...m, createdAt: started.toISOString() }))
  try { localStorage.setItem(turnPrefix(owner) + started.toISOString() + ':' + input.requestId, JSON.stringify(messages)) }
  catch { throw new Error('浏览器无法保存本机通讯记录，请检查站点存储空间和权限。') }
  return messages as CopilotMessage[]
}
