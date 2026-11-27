import type { CopilotContext, CopilotMessage } from '../../src/music/copilot/contracts'

export function generateCockpitReply(options: {
  input: { requestId: string; text: string; context?: CopilotContext; history?: CopilotMessage[]; preferences?: string[] }
  config: { personality: string }
  source: 'browser-local' | 'desktop'
  origin: string
  fetcher: typeof fetch
  signal: AbortSignal
  generate: (input: { instructions: string }) => Promise<string>
}): Promise<{ requestId: string; messages: CopilotMessage[] }>
