import { createInterface } from 'node:readline'
import { constants } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { catalogue, device, matchingPlanets } from './universe.mjs'

const modernVersion = '2026-07-28'
const handshakeVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const supported = [modernVersion, ...handshakeVersions]
const serverInfo = { name: 'mosic-copilot', version: '0.1.0' }
const capabilities = { tools: {} }
const idSchema = { type: 'string', pattern: '^[A-Za-z0-9_:-]{1,128}$' }
const objectSchema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false })
const tools = [
  { name: 'search_music', description: '在 MOSIC 的公开曲库按曲名或艺人找可播放的录音，返回真实曲目 ID。', inputSchema: objectSchema({query:{type:'string',maxLength:120}}) },
  { name: 'find_same_song_planets', description: '用本人授权的 MOSIC 设备身份查找公开唱片架中有这首歌的真人星球。', inputSchema:objectSchema({trackId:idSchema},['trackId']) },
  { name: 'draft_introduction', description: '根据刚查到的歌曲与用户明确要求公开的招呼语，在本机准备一张可编辑的介绍草稿。由用户在驾驶舱预览、授权后发布。', inputSchema:objectSchema({trackId:idSchema,greeting:{type:'string',maxLength:100}},['trackId']) },
].map(tool=>({...tool,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:tool.name!=='draft_introduction'}}))
const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const validToken = token => typeof token==='string' && /^[0-9a-f-]{72}$/.test(token)

async function readToken(env) {
  let token = env.MOSIC_DEVICE_TOKEN
  if (!token && env.MOSIC_DEVICE_TOKEN_FILE) {
    if (typeof process.getuid!=='function') throw new Error('此系统请使用 MOSIC_DEVICE_TOKEN。')
    const file = await open(env.MOSIC_DEVICE_TOKEN_FILE, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.uid!==process.getuid() || (stat.mode & 0o777)!==0o600 || stat.size>256) throw new Error('需要由当前用户拥有且权限为 0600 的设备令牌文件。')
      token = (await file.readFile('utf8')).trim()
    } finally { await file.close() }
  }
  if (!validToken(token)) throw new Error('请先用 MOSIC 的配对码连接此设备，并在 MCP 配置中指定设备令牌。')
  return token
}

export async function pairToFile(path, code, fetcher = fetch) {
  const normalized = code.trim().replace(/[\s-]/g,'').toUpperCase()
  if (!/^[A-HJ-NP-Z2-9]{16}$/.test(normalized)) throw new Error('请输入网页显示的十六位配对码。')
  if (typeof process.getuid!=='function') throw new Error('此系统请使用 MOSIC_DEVICE_TOKEN。')
  const file = await open(path,'wx',0o600)
  try {
    await file.chmod(0o600)
    const { token } = await device('pair',{code:normalized},null,fetcher)
    if (!validToken(token)) throw new Error('配对未返回有效设备令牌。')
    await file.writeFile(token+'\n')
  } catch (error) {
    await unlink(path).catch(()=>{})
    throw error
  } finally { await file.close() }
}

const rpcError = (id,code,message,data) => ({jsonrpc:'2.0',id,error:{code,message,...(data?{data}:{})}})
const toolText = (text,isError=false) => ({content:[{type:'text',text}],isError})
function session(fetcher, env) {
  let phase = 'new'
  const recent = new Map()
  async function call(name,args,net) {
    const tool = tools.find(item=>item.name===name)
    if (!tool) return null
    if (!isObject(args) || Object.keys(args).some(key=>!(Object.hasOwn(tool.inputSchema.properties,key)))) return toolText('工具参数不正确。',true)
    if (name==='search_music') {
      if (args.query!==undefined && (typeof args.query!=='string' || args.query.length>120)) return toolText('搜索词最多 120 字。',true)
      const result = await catalogue(args.query || '',net)
      for (const track of result.tracks) {
        recent.delete(track.id)
        recent.set(track.id,track)
        if (recent.size>200) recent.delete(recent.keys().next().value)
      }
      return toolText(JSON.stringify(result))
    }
    if (typeof args.trackId!=='string' || !/^[\w:-]{1,128}$/.test(args.trackId)) return toolText('请选择有效曲目 ID。',true)
    if (name==='find_same_song_planets') {
      const planets = await matchingPlanets(args.trackId,await readToken(env),net)
      return toolText(JSON.stringify({trackId:args.trackId,planets}))
    }
    if (args.greeting!==undefined && (typeof args.greeting!=='string' || Array.from(args.greeting).length>100)) return toolText('公开招呼最多 100 字。',true)
    const track = recent.get(args.trackId)
    if (!track) return toolText('请先调用 search_music 确认曲目，再准备介绍。',true)
    return toolText(JSON.stringify({draft:true,sent:false,trackId:track.id,
      introduction:`我想分享${track.artist}的《${track.title}》，也想听听你的选曲。`,greeting:args.greeting?.trim() || ''}))
  }

  return async (msg,signal) => {
    if (!isObject(msg) || msg.jsonrpc!=='2.0' || typeof msg.method!=='string' || (Object.hasOwn(msg,'id') && typeof msg.id!=='string' && !Number.isSafeInteger(msg.id))) {
      return rpcError(null,-32600,'Invalid Request')
    }
    const {id,method,params={}}=msg
    if (id===undefined) {
      if (method==='notifications/initialized' && phase==='initializing') phase='ready'
      return null
    }
    const version=params?._meta?.['io.modelcontextprotocol/protocolVersion']
    const modern=version===modernVersion
    if (version && !modern) return rpcError(id,-32022,'Unsupported protocol version',{requested:version,supported})
    const ok = result=>({jsonrpc:'2.0',id,result:{...(modern?{resultType:'complete'}:{}),...result}})
    if (!isObject(params)) return rpcError(id,-32602,'Invalid params')
    if (method==='server/discover' && modern) return ok({supportedVersions:supported,capabilities,_meta:{'io.modelcontextprotocol/serverInfo':serverInfo},ttlMs:3600000,cacheScope:'public'})
    if (method==='initialize' && !modern) {
      if (phase!=='new' || typeof params.protocolVersion!=='string' || !isObject(params.clientInfo) || !isObject(params.capabilities)) return rpcError(id,-32602,'Invalid initialization')
      phase='initializing'
      return ok({protocolVersion:handshakeVersions.includes(params.protocolVersion)?params.protocolVersion:handshakeVersions[0],capabilities,serverInfo})
    }
    if (method==='ping') return ok({})
    if (!modern && phase!=='ready') return rpcError(id,-32002,'Server not initialized')
    if (method==='tools/list') return ok({tools,...(modern?{ttlMs:3600000,cacheScope:'public'}:{})})
    if (method!=='tools/call') return rpcError(id,-32601,'Method not found')
    if (typeof params.name!=='string') return rpcError(id,-32602,'Missing tool name')
    try {
      const net = (url,options={})=>fetcher(url,{...options,signal:AbortSignal.any([signal,...(options.signal?[options.signal]:[])])})
      const result = await call(params.name, params.arguments??{},net)
      return result ? ok(result) : rpcError(id,-32602,'Unknown tool')
    } catch(error) {
      // OS errors can contain private file paths. Expose only controlled application messages.
      const message = error instanceof Error && !error.code ? error.message : '设备令牌不可读取或网络暂不可用。'
      return ok(toolText(message,true))
    }
  }
}

export async function serve({ input=process.stdin, output=process.stdout, fetcher=fetch, env=process.env }={}) {
  const dispatch = session(fetcher,env)
  const active = new Map(), pending = new Set()
  const write = message=>{if(message) output.write(JSON.stringify(message)+'\n')}
  for await (const line of createInterface({input,crlfDelay:Infinity})) {
    if (!line.trim()) continue
    let message
    try { message=JSON.parse(line) }
    catch { write(rpcError(null,-32700,'Parse error'));continue }
    if (message?.method==='notifications/cancelled' && !Object.hasOwn(message,'id')) {
      active.get(message.params?.requestId)?.abort()
      continue
    }
    const controller = new AbortController(), id=message?.id
    if (id!==undefined) {
      if (active.has(id)) {write(rpcError(id,-32600,'Duplicate request ID'));continue}
      active.set(id,controller)
    }
    const job=dispatch(message,controller.signal).then(result=>{if(!controller.signal.aborted)write(result)})
      .catch(()=>write(rpcError(id??null,-32603,'Internal error')))
      .finally(()=>{active.delete(id);pending.delete(job)})
    pending.add(job)
  }
  await Promise.all(pending)
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv[2]==='--pair') {
      if (!process.argv[3]) throw new Error('请指定新令牌文件的路径。')
      process.stderr.write('输入 MOSIC 网页生成的配对码：\n')
      const reader=createInterface({input:process.stdin})
      try {
        const {value}=await reader[Symbol.asyncIterator]().next()
        await pairToFile(process.argv[3],value || '')
        process.stderr.write('设备已配对。可随时在网页撤销。\n')
      } finally {reader.close()}
    } else { await serve() }
  } catch(error) {process.stderr.write((error.message || 'MCP 启动失败。')+'\n');process.exitCode=1}
}
