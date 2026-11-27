import { createHash } from 'node:crypto'
import { acceptsNoModel, customRequest, customService, isAgentProvider, localEndpoint } from './providers.mjs'

const sources = new Set(['none','local','custom','openai','anthropic','subscription','codex','copilot'])

export function readConnection(current, input) {
  const provider=input.provider
  if (!sources.has(provider)) throw new Error('无效的模型来源。')
  const model=String(input.model ?? '').trim()
  if (model.length>250 || /[\x00-\x1f\x7f]/.test(model)) throw new Error('请填写有效的模型 ID。')
  const config={provider,model}
  if (provider==='local') config.endpoint=localEndpoint(String(input.endpoint ?? current.endpoint))
  if (provider==='custom') {
    const service=customService(input.custom ?? current.custom)
    const {modelsUrl,chatUrl,...settings}=service
    // Validate the auth header and any JSON template before persisting secrets.
    customRequest(service,model,'validation','',[{role:'user',content:'test'}])
    config.custom=settings
  }
  return config
}

export function credentialSlot(config) {
  if (config.provider==='custom') {
    const {chatUrl,authHeader,authScheme,protocol}=customService(config.custom)
    const digest=createHash('sha256').update(JSON.stringify([chatUrl,protocol,authHeader.toLowerCase(),authScheme])).digest('hex')
    return 'key:custom:'+digest
  }
  return ['openai','anthropic'].includes(config.provider) ? 'key:'+config.provider : null
}

export function connectionState(s) {
  const provider=s.provider
  const model=s.models[provider] || ''
  const key=credentialSlot(s)
  const keyPresent=Boolean(key && s.vault[key])
  const authenticated=key ? keyPresent : provider==='subscription' ? Boolean(s.vault['auth:'+s.account]) : (provider==='local' || isAgentProvider(provider))
  const configured=Boolean(authenticated && (model || acceptsNoModel(provider,s.custom)))
  return {provider,model,configured,enabled:configured && s.allowCockpit===true,connectionVersion:2,keyPresent}
}

// Only these two non-secret switches may be forwarded to a running instance.
export function localRequest(argv) {
  const field=prefix=>argv.find(arg=>arg.startsWith(prefix))?.slice(prefix.length)
  const endpoint=field('--connect-local-url='), model=field('--connect-local-model=')
  if (endpoint===undefined && model===undefined) return null
  return {provider:'local',endpoint:endpoint||'',model:model||''}
}
export async function checkLocalModel(config, list) {
  const models=await list(config)
  if (!config.model || !models.some(row=>row.id===config.model)) throw new Error('服务未列出这个模型 ID。请确认已安装并启动模型，再重新连接。')
}
