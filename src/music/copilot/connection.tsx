import { useEffect, useRef, useState } from 'react'
import setupPrompt from '../../../desktop/ui/local-model-setup.txt?raw'
import { connectBrowserModel, type BrowserConnection } from './browser-local'
import { desktopModelLabel, desktopReady, type DesktopStatus } from './desktop-bridge'
import type { CopilotProvider, CopilotTurn } from './contracts'

export type ModelSession = {
  provider: CopilotProvider | 'none' | 'browser-local' | 'desktop'
  key: string
  model: string
  baseUrl: string
  protocol: NonNullable<CopilotTurn['protocol']>
  authHeader: string
  authScheme: 'bearer' | 'raw'
  bodyTemplate: string
  responsePath: string
  browser?: BrowserConnection
}
export const emptySession: ModelSession = {
  provider: 'none', key: '', model: '', baseUrl: '', protocol: 'openai',
  authHeader: 'Authorization', authScheme: 'bearer',
  bodyTemplate: '{"messages":"{{messages}}"}', responsePath: 'choices.0.message.content',
}

export function configured(session: ModelSession, desktop?: DesktopStatus | null) {
  switch (session.provider) {
    case 'none': return false
    case 'desktop': return desktopReady(desktop)
    case 'browser-local': return Boolean(session.browser)
    case 'custom': {
      try {
        const url = new URL(session.baseUrl)
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false
      } catch { return false }
      if (session.protocol !== 'json' && !session.model.trim()) return false
      if (session.protocol === 'json' && (!session.responsePath.trim() || !session.bodyTemplate.trim() || !session.authHeader.trim())) return false
      return Boolean(session.key.trim())
    }
    default: return Boolean(session.key.trim())
  }
}

export function ConnectionSettings({ session, busy, desktop, onChange, onDesktopSettings }: {
  session: ModelSession
  busy: boolean
  desktop?: DesktopStatus | null
  onChange: (next: ModelSession) => void
  onDesktopSettings?: () => void
}) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle')
  const [working, setWorking] = useState(false)
  const [problem, setProblem] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const { provider } = session
  const local = provider === 'browser-local'
  const remote = provider === 'openai' || provider === 'anthropic' || provider === 'custom'
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(setupPrompt.trim()); setCopy('copied') }
    catch { setCopy('manual') }
  }
  const change = (patch: Partial<ModelSession>) => {
    setProblem('')
    onChange({ ...session, ...patch })
  }
  const verify = async () => {
    const controller = new AbortController()
    request.current = controller
    setWorking(true); setProblem('')
    try {
      const connection = await connectBrowserModel(session.baseUrl, session.model, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]))
      if (!controller.signal.aborted) change({ browser: connection, baseUrl: connection.endpoint, model: connection.model })
    } catch (error) {
      if (!controller.signal.aborted) setProblem(error instanceof Error && error.name !== 'TimeoutError'
        ? error.message : '连接超时，请检查本机服务后重试。')
    } finally {
      if (!controller.signal.aborted) setWorking(false)
    }
  }
  return <fieldset disabled={busy || working} className="cp-connection">
    <legend>模型连接</legend>
    <label>本次连接
      <select value={provider} onChange={event => {
        const next = event.target.value as ModelSession['provider']
        setCopy('idle'); setProblem('')
        onChange({ ...emptySession, provider: next, baseUrl: next === 'browser-local' ? 'http://127.0.0.1:11434/v1' : '' })
      }}>
        <option value="none">未配置</option>
        {onDesktopSettings ? <option value="desktop">此设备的 MOSIC 连接</option> : <option value="browser-local">此浏览器的本机模型</option>}
        <option value="custom">自定义 API</option>
        <option value="openai">我的 OpenAI API</option>
        <option value="anthropic">我的 Anthropic API</option>
      </select>
    </label>
    {(provider === 'none' || local || provider === 'desktop') && <>
      <small>把提示词交给自己电脑上的 Agent。它会检查已有模型，请你确认选择，再帮你接入。</small>
      <button type="button" onClick={() => void copyPrompt()}>复制本机模型配置提示词</button>
      {copy === 'copied' && <small role="status">已复制，粘贴到这台电脑上的 Agent 即可。</small>}
      {copy === 'manual' && <label>选中并复制提示词<textarea readOnly rows={5} value={setupPrompt.trim()} onFocus={e => e.target.select()} /></label>}
    </>}
    {provider === 'none' && <small>也可以在「本次连接」中选择自己的 API。使用 Codex 或 GitHub Copilot 订阅时，请在 MOSIC 桌面端连接。</small>}
    {provider === 'desktop' && <div className="cp-desktop-connection">
      <small>{desktop && desktopReady(desktop) ? desktopModelLabel(desktop) : '请在本机模型设置中配置接口，并允许驾驶舱连接。'}</small>
      <p>驾驶舱使用这台设备的模型设置。桌面通讯记录保存在这台 Mac 上。</p>
      <button type="button" onClick={onDesktopSettings}>打开本机模型设置</button>
    </div>}
    {local && <>
      <label>本机接口地址<input type="url" value={session.baseUrl} onChange={e => change({ baseUrl: e.target.value, browser: undefined })} /></label>
      <label>本机模型 ID<input value={session.model} spellCheck={false} onChange={e => change({ model: e.target.value, browser: undefined })} /></label>
      <small>填入 Agent 确认的地址与模型 ID。浏览器会直接访问回环地址，曲库检索只向 MOSIC 提交筛选条件。对话保存在当前浏览器。</small>
      {problem && <small role="alert">{problem}</small>}
      <button type="button" disabled={!session.model.trim() || !session.baseUrl.trim() || Boolean(session.browser)} onClick={() => void verify()}>
        {working ? '正在验证…' : session.browser ? '已连接本机模型' : '验证并连接本机模型'}
      </button>
    </>}
    {remote && <>
      {provider === 'custom' && <>
        <label>接口协议<select value={session.protocol} onChange={e => change({ protocol: e.target.value as ModelSession['protocol'], key: '' })}>
          <option value="openai">OpenAI 兼容 · Chat Completions</option><option value="responses">OpenAI Responses</option>
          <option value="anthropic">Anthropic Messages</option><option value="json">自定义 JSON</option></select></label>
        <label>接口网址<input type="url" spellCheck={false} autoComplete="off" value={session.baseUrl}
          placeholder={session.protocol === 'json' ? 'https://…/接口路径' : 'https://…/v1'}
          onChange={e => change({ baseUrl: e.target.value, key: '' })} /></label>
      </>}
      <label>{provider !== 'custom' || session.protocol === 'json' ? '模型名称（可选）' : '模型名称'}
        <input spellCheck={false} value={session.model} onChange={e => change({ model: e.target.value })} /></label>
      {provider === 'custom' && session.protocol === 'json' && <>
        <label>密钥请求头<input value={session.authHeader} spellCheck={false} onChange={e => change({ authHeader: e.target.value, key: '' })} /></label>
        <label>密钥格式<select value={session.authScheme} onChange={e => change({ authScheme: e.target.value as ModelSession['authScheme'], key: '' })}>
          <option value="bearer">Bearer 加密钥</option><option value="raw">直接使用密钥</option></select></label>
        <label>请求 JSON 模板<textarea rows={3} value={session.bodyTemplate} spellCheck={false} onChange={e => change({ bodyTemplate: e.target.value })} /></label>
        <small>{'可用 {{model}}、{{prompt}}、{{messages}} 和 {{system}}。'}</small>
        <label>回复文本字段<input value={session.responsePath} spellCheck={false} onChange={e => change({ responsePath: e.target.value })} /></label>
      </>}
      <label>API 密钥<input type="password" autoComplete="off" spellCheck={false} value={session.key}
        onChange={e => change({ key: e.target.value })} /></label>
      <small>API 密钥只在本次页面会话中保留。发送时由 MOSIC 转交你所选的接口。</small>
    </>}
    {(session.browser || remote && session.key) && <button type="button" onClick={() => onChange(emptySession)}>断开本次连接</button>}
  </fieldset>
}
