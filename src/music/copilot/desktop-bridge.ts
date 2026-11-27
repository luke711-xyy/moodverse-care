import type { CopilotContext, CopilotMessage } from './contracts'

export type DesktopStatus = {
  enabled: boolean
  configured?: boolean
  connectionVersion?: number
  provider: keyof typeof desktopProviders
  model: string
}
export type DesktopChatReply = { requestId: string; messages: CopilotMessage[] }
export type DesktopBridge = {
  status(): Promise<DesktopStatus>
  openSettings(): Promise<void>
  chat(turn: { requestId: string; text: string; context?: CopilotContext }): Promise<DesktopChatReply>
  history?(range: { start: string; end: string; cursor?: string }): Promise<{ messages: CopilotMessage[]; nextCursor: string | null }>
  clearHistory?(): Promise<void>
  onHistoryChanged?(handler: () => void): () => void
  cancel(): Promise<void>
  voiceStart?(): Promise<void>
  voiceFinish?(): Promise<void>
  voiceCancel?(): Promise<void>
  onVoice?(
    handler: (e: {
      type: 'ready' | 'partial' | 'text' | 'error' | 'cancelled'
      text?: string
      message?: string
      code?: string
    }) => void,
  ): () => void
}
declare global {
  interface Window {
    mosicDesktop?: DesktopBridge
  }
}
export const desktopProviders = {
  none: '未配置',
  custom: '自定义 API',
  codex: 'Codex CLI',
  copilot: 'GitHub Copilot CLI',
  local: '本地模型',
  openai: 'OpenAI API',
  anthropic: 'Anthropic API',
  subscription: 'ChatGPT 套餐',
} as const

export function desktopReady(status?: DesktopStatus | null) {
  return Boolean(status?.enabled && (status.connectionVersion === 2 ? status.configured : status.model.trim()))
}

export function desktopModelLabel(status: DesktopStatus) {
  return `${desktopProviders[status.provider]} · ${status.model.trim() || '接口默认模型'}`
}
