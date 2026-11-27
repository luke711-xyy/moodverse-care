export type ModelProtocol = 'openai' | 'responses' | 'anthropic' | 'json'
export type ModelInterface = {
  baseUrl: string
  protocol: ModelProtocol
  requestUrl?: string
  authHeader?: string
  authScheme?: 'bearer' | 'raw'
  bodyTemplate?: string
  responsePath?: string
}
export function modelRequest(options: ModelInterface & {
  model: string; key: string; system: string; messages: { role: 'user' | 'assistant'; content: string }[]
}): { url: string; headers: Record<string, string>; body: Record<string, unknown> }
export function modelReply(result: unknown, protocol: ModelProtocol, responsePath?: string): string
