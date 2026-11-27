const openai = 'https://api.openai.com/v1'
const anthropic = 'https://api.anthropic.com/v1'
const short = (value, size) => String(value || '').slice(0,size)

export function localEndpoint(value) {
  const u = new URL(value)
  if (!['http:','https:'].includes(u.protocol) || !['localhost','127.0.0.1','[::1]'].includes(u.hostname)
    || u.username || u.password || u.search || u.hash || !['/v1','/v1/'].includes(u.pathname)) throw new Error('本地模型地址应为本机回环地址的 /v1。')
  return u.origin + '/v1'
}
async function call(url, options, net) {
  let res
  try { res = await net(url,{redirect:'error',signal:AbortSignal.timeout(90000),...options}) }
  catch (e) { throw new Error(e.name === 'AbortError' ? '本次对话已取消。' : '模型未连接。请检查所选服务、模型和网络。') }
  if (!res.ok) throw new Error(`模型请求未完成（${res.status}）。请检查所选账号、模型与额度。`)
  return res
}
export async function availableModels({provider,endpoint,token},net = fetch) {
  const base = provider === 'local' ? localEndpoint(endpoint) : provider === 'anthropic' ? anthropic : openai
  const headers = provider === 'anthropic' ? {'x-api-key':token,'anthropic-version':'2023-06-01'} : token ? {Authorization:'Bearer '+token} : {}
  const res = await call(base+'/models',{headers},net)
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

export async function chat({provider,endpoint,model,token,instructions,history,text,signal},net=fetch) {
  if (!model || model.length>250) throw new Error('先选择或填写一个模型。')
  if (provider!=='local' && !token) throw new Error('所选提供方需要登录或 API Key。')
  const input = history.slice(-10).map(m=>({role:m.role==='user'?'user':'assistant',content:short(m.text,1600)}))
  input.push({role:'user',content:short(text,1800)})
  const headers={'Content-Type':'application/json'}
  const opts={method:'POST',headers,signal:signal??AbortSignal.timeout(120000)}
  if (provider==='anthropic') {
    headers['x-api-key']=token; headers['anthropic-version']='2023-06-01'
    const res=await call(anthropic+'/messages',{...opts,body:JSON.stringify({model,max_tokens:850,system:instructions,messages:input})},net)
    return (await res.json()).content?.filter(x=>x.type==='text').map(x=>x.text).join('') || ''
  }
  if (token) headers.Authorization='Bearer '+token
  if (provider==='openai' || provider==='subscription') {
    const res=await call(openai+'/responses',{...opts,body:JSON.stringify({model,input,instructions,store:false,stream:true})},net)
    return readResponseStream(res.body)
  }
  if (provider!=='local') throw new Error('请选择已支持的模型来源。')
  const res=await call(localEndpoint(endpoint)+'/chat/completions',{...opts,body:JSON.stringify({model,stream:false,max_tokens:1000,
    messages:[{role:'system',content:instructions},...input]})},net)
  const out=(await res.json()).choices?.[0]?.message?.content
  if (typeof out!=='string' || !out.trim()) throw new Error('本机模型未返回文字。')
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

export function parseAnswer(raw,candidates,userText) {
  const clean=raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi,'')
  let data
  try { data=JSON.parse(clean) } catch { /* Some local models answer in prose. */ }
  if (!data || typeof data!=='object' || Array.isArray(data)) {
    const marker=/^\s*[-*]?\s*["'`*]*playId["'`*]*\s*[:：=]\s*["'`*]*([\w:-]+)["'`*]*[,.。]?\s*$/im
    const playId=clean.match(marker)?.[1]
    const reply=clean.replace(marker,'').trim()
    const words=reply.normalize('NFKC').toLowerCase()
    // Exact titles may identify a track when a model omits IDs. A duplicated
    // title cannot identify which version the listener was offered.
    const titles=candidates.map(t=>t.title?.normalize('NFKC').trim().toLowerCase()||'')
    const matches=candidates.filter((_,i)=>{
      const title=titles[i]
      if(title.length<2 || titles.indexOf(title)!==titles.lastIndexOf(title))return false
      const escaped=title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
      return new RegExp('(?<![a-z0-9])'+escaped+'(?![a-z0-9])','u').test(words)
    })
    data={reply,playId,trackIds:matches.map(t=>t.id)}
  }
  const ids=new Set([...(Array.isArray(data.trackIds)?data.trackIds:[]),data.playId])
  const cards=[...ids].flatMap(id=>candidates.filter(t=>t.id===id)).slice(0,3)
  const requested = /播放|放一首|给我放|直接播|播第|来一首|听第|请播|play\b/i.test(userText)
  const declined = /(?:别|不(?:要|用|必)?|先不|暂不|停止).{0,5}(?:播|放|听)|仅推荐|只(?:要)?推荐|(?:don't|do not|never)\s+play/i.test(userText)
  const nominated = cards.find(t=>t.id===data.playId)
  const playId = requested && !declined ? (nominated?.id ?? (!data.playId && cards.length===1 ? cards[0].id : null)) : null
  return {text:short(data.reply,2400)||(cards.length?'可以从这些结果开始。':'暂时没有找到合适的结果。'),cards,playId}
}
