import type { MusicTrackSummary } from '../../music-domain'

export type CopilotSettings = {
  name: string
  personality: 'warm' | 'concise' | 'playful'
  proactivity: 'off' | 'low' | 'normal'
  memoryEnabled: boolean
  voiceEnabled: boolean
}
export const defaultCopilotSettings: CopilotSettings = {
  name: '副驾',
  personality: 'warm',
  proactivity: 'low',
  memoryEnabled: true,
  voiceEnabled: false,
}
export type CopilotCard =
  | { type: 'track'; track: MusicTrackSummary; reason: string; source: 'catalog' | 'audius_weekly' }
  | { type: 'planet'; planetId: string; displayName: string; reason: string; source: 'public_planet' }
export type CopilotProvider = 'platform' | 'openai' | 'anthropic'
export type CopilotMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  cards?: CopilotCard[]
  source?: CopilotProvider | 'fallback' | 'desktop'
  fallbackReason?: string
  playTrackId?: string
}
export type CopilotMemory = { id: string; text: string; kind: 'preference' | 'mood'; expiresAt: string | null }
export type CopilotContext = { trackId?: string; planetId?: string; view?: string }
export type CopilotState = {
  settings: CopilotSettings
  memories: CopilotMemory[]
  messages: CopilotMessage[]
  capabilities: { platform: boolean; stt: boolean; tts: boolean }
}
export type CopilotTurn = {
  text: string
  requestId: string
  context?: CopilotContext
  provider?: CopilotProvider
  model?: string
}
export type CopilotReply = { messages: CopilotMessage[]; memories: CopilotMemory[]; requestId: string }
export type CopilotPatch = {
  settings?: Partial<CopilotSettings>
  clearHistory?: boolean
  memory?: { action: 'add' | 'edit' | 'forget' | 'clear'; text?: string; id?: string }
}
