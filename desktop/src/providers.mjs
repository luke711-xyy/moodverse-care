import { modelRequest, modelReply } from './http-model.mjs'
import { agentSubscriptionModels, chatWithAgent } from './agent-subscriptions.mjs'

const openai = 'https://api.openai.com/v1'
const anthropic = 'https://api.anthropic.com/v1'
export const isAgentProvider = provider => provider==='codex' || provider==='copilot'
export const acceptsNoModel = (provider,custom) => provider==='custom' && custom?.protocol==='json'
const short = (value, size) => String(value || '').slice(0,size)

export function localEndpoint(value) {
  const u = new URL(value)
  if (!['http:','https:'].includes(u.protocol) || !['localhost','127.0.0.1','[::1]'].includes(u.hostname)
    || u.username || u.password || u.search || u.hash || !['/v1','/v1/'].includes(u.pathname)) throw new Error('本地模型地址应为本机回环地址的 /v1。')
  return u.origin + '/v1'
}
const routes = { completions:'/chat/completions', responses:'/responses', messages:'/messages', json:'' }
export function customService(value = {}) {
  if (!Object.hasOwn(routes, value.protocol)) throw new Error('选择与服务商兼容的 API 协议。')
  if (!['bearer','api-key','x-api-key','other'].includes(value.auth)) throw new Error('选择服务商要求的密钥格式。')
  let u
  try { u = new URL(String(value.url || '').trim()) } catch { throw new Error('填写有效的 API 地址。') }
  if (u.protocol!=='https:' || u.username || u.password || u.hash)
    throw new Error('自定义 API 需要 HTTPS 地址，凭据请填入密钥框。')
  // Never persist a key accidentally pasted as a URL parameter.
  for (const name of u.searchParams.keys()) if (/key|token|secret|password|signature|credential/i.test(name))
    throw new Error('请将密钥单独填入 API Key 栏。')
  const path=u.pathname.replace(/\/+$/, ''), suffix=routes[value.protocol]
  const known=Boolean(suffix) && path.endsWith(suffix)
  const full=value.protocol==='json' || value.full===true || known
  const canList=!full || known
  const base=known ? path.slice(0,-suffix.length) : path
  const chatUrl=new URL(u), modelsUrl=new URL(u)
  chatUrl.pathname=full ? path : base+suffix
  modelsUrl.pathname=base+'/models'
  u.pathname=path || '/'
  const authHeader=value.auth==='other' ? String(value.authHeader || '').trim() : value.auth==='bearer' ? 'Authorization' : value.auth
  const authScheme=value.auth==='other' ? value.authScheme : value.auth==='bearer' ? 'bearer' : 'raw'
  if (!/^[A-Za-z][A-Za-z0-9-]{0,80}$/.test(authHeader) || !['bearer','raw'].includes(authScheme)) throw new Error('请填写有效的鉴权请求头和密钥格式。')
  return {url:u.href,full,protocol:value.protocol,auth:value.auth,authHeader,authScheme,chatUrl:chatUrl.href,modelsUrl:canList ? modelsUrl.href : null,
    ...(value.protocol==='json' ? {bodyTemplate:value.bodyTemplate,responsePath:value.responsePath} : {})}
}
const customProtocols={completions:'openai',responses:'responses',messages:'anthropic',json:'json'}
export function customRequest(service,model,key,system,messages) {
  return modelRequest({requestUrl:service.chatUrl,baseUrl:service.url,protocol:customProtocols[service.protocol],model,key,system,messages,
    authHeader:service.authHeader,authScheme:service.authScheme,bodyTemplate:service.bodyTemplate,responsePath:service.responsePath})
}

function serviceFor(provider, endpoint, custom) {
  if (provider==='custom') return customService(custom)
  const known={local:[null,'completions','bearer'],openai:[openai,'responses','bearer'],anthropic:[anthropic,'messages','x-api-key'],subscription:[openai,'responses','bearer']}
  if (!Object.hasOwn(known,provider)) throw new Error('副驾未配置，请先选择连接方式。')
  const [base,protocol,auth]=known[provider]
  const url=base || localEndpoint(endpoint)
  return {chatUrl:url+routes[protocol],modelsUrl:url+'/models',protocol,authHeader:auth==='bearer' ? 'Authorization':auth,authScheme:auth==='bearer' ? 'bearer':'raw'}
}
function requestHeaders(service, token) {
  const headers={'Content-Type':'application/json'}
  if (service.protocol==='messages') headers['anthropic-version']='2023-06-01'
  if (token) {
    headers[service.authHeader]=service.authScheme==='bearer' ? 'Bearer '+token : token
  }
  return headers
}
async function call(url, options, net) {
  let res
  try { res = await net(url,{redirect:'error',signal:AbortSignal.timeout(90000),...options}) }
  catch (e) { throw new Error(e.name === 'AbortError' ? '本次对话已取消。' : '模型未连接。请检查所选服务、模型和网络。') }
  if (!res.ok) throw new Error(`模型请求未完成（${res.status}）。请检查所选账号、模型与额度。`)
  return res
}
export async function availableModels({provider,endpoint,custom,token},net = fetch) {
  if (isAgentProvider(provider)) return agentSubscriptionModels(provider)
  const service=serviceFor(provider,endpoint,custom)
  if (!service.modelsUrl) throw new Error('这个自定义请求路径没有标准模型列表，请输入服务商提供的模型 ID。')
  if (provider!=='local' && !token) throw new Error('所选提供方需要登录或 API Key。')
  const res=await call(service.modelsUrl,{headers:requestHeaders(service,token)},net)
  const data = await res.json()
  if (provider==='subscription') return (data.models || []).filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name || m.slug}))
  return (data.data || []).filter(m=>typeof m.id==='string').map(m=>({id:m.id,name:m.display_name || m.id}))
}

export async function readResponseStream(body) {
  if (!body) throw new Error('模型未返回可读内容。')
  const decoder = new TextDecoder()
  let pending='', text='', completed=false
  function event(line) {
    if (!line.startsWith('data:')) return
    const json=line.slice(5).trim()
    if (!json || json==='[DONE]') return
    const e=JSON.parse(json)
    if (e.type==='response.output_text.delta') text+=e.delta || ''
    if (e.type==='response.completed') completed=true
    if (e.type==='error' || e.type==='response.failed' || e.type==='response.incomplete') throw new Error('模型没有完成回答，请检查套餐额度或稍后重试。')
  }
  for await (const chunk of body) {
    pending+=decoder.decode(chunk,{stream:true})
    const lines=pending.split('\n')
    pending=lines.pop()
    for (const line of lines) event(line)
    if (text.length>100000 || pending.length>2_000_000) throw new Error('模型响应过长。')
  }
  event(pending+decoder.decode())
  if (!completed) throw new Error('响应在模型完成前断开。')
  return text
}

export async function chat({provider,endpoint,custom,model='',token,instructions,history,text,signal},net=fetch) {
  if (!provider || provider==='none') throw new Error('副驾未配置，请先选择连接方式。')
  if ((!model && !acceptsNoModel(provider,custom)) || model.length>250) throw new Error('先选择或填写一个模型。')
  if (isAgentProvider(provider)) return chatWithAgent({provider,model,instructions,history,text,signal})
  const service=serviceFor(provider,endpoint,custom)
  if (provider!=='local' && !token) throw new Error('所选提供方需要登录或 API Key。')
  const input = history.slice(-10).map(m=>({role:m.role==='user'?'user':'assistant',content:short(m.text,1600)}))
  input.push({role:'user',content:short(text,1800)})
  if (provider==='custom') {
    const request=customRequest(service,model,token,instructions,input)
    const response=await call(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(request.body),signal:signal??AbortSignal.timeout(120000)},net)
    const answer=modelReply(await response.json(),customProtocols[service.protocol],service.responsePath)
    if (!answer.trim()) throw new Error('接口没有返回回复文字，请检查协议和回复字段设置。')
    return answer
  }
  const headers=requestHeaders(service,token)
  const opts={method:'POST',headers,signal:signal??AbortSignal.timeout(120000)}
  if (service.protocol==='messages') {
    const res=await call(service.chatUrl,{...opts,body:JSON.stringify({model,max_tokens:850,system:instructions,messages:input})},net)
    return (await res.json()).content?.filter(x=>x.type==='text').map(x=>x.text).join('') || ''
  }
  if (service.protocol==='responses') {
    const res=await call(service.chatUrl,{...opts,body:JSON.stringify({model,input,instructions,store:false,stream:true})},net)
    return readResponseStream(res.body)
  }
  const res=await call(service.chatUrl,{...opts,body:JSON.stringify({model,stream:false,max_tokens:1000,
    messages:[{role:'system',content:instructions},...input]})},net)
  const out=(await res.json()).choices?.[0]?.message?.content
  if (typeof out!=='string' || !out.trim()) throw new Error('模型未返回文字。')
  return out.replace(/<think>[\s\S]*?<\/think>/gi,'').trim()
}

export function candidateTracks(all,text,previousIds,currentId) {
  const terms=text.toLocaleLowerCase().split(/[\s，。！？,.?、]+/u).filter(Boolean)
  const slow=/慢|安静|放松|舒缓|平静|relax|slow|calm/i.test(text)
  const fast=/快节奏|提神|快一点|跑步|兴奋|energetic|fast/i.test(text)
  const lessKnown=/换|冷门|另一|别的|不同/.test(text)
  const score=t=>{
    const labels=[t.title,t.artist,...t.genres,...t.moods].join(' ').toLowerCase()
    let n=terms.reduce((v,term)=>v+(labels.includes(term)?4:0),0)
    if (slow&&t.bpm>0) n+=Math.max(0,(150-t.bpm)/22)
    if (fast&&t.bpm>0) n+=Math.max(0,(t.bpm-60)/22)
    if (lessKnown&&previousIds.includes(t.id)) n-=20
    return n
  }
  const priority=all.filter(t=>previousIds.includes(t.id)||t.id===currentId)
  return [...new Map([...all.slice().sort((a,b)=>score(b)-score(a)).slice(0,10),...priority].map(t=>[t.id,t])).values()]
}

export { parseAnswer } from './answer.mjs'
