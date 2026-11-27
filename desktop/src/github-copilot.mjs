import { spawn } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// GitHub Copilot SDK protocol v4 over the installed CLI's private stdio pipe.
// The CLI owns account credentials. No GitHub token crosses this protocol.
const updateCLI = '此 GitHub Copilot CLI 版本不兼容。请更新官方 CLI 后重新检测。'
const failed = 'GitHub Copilot 未完成请求。请检查本机登录、网络、所选模型和订阅额度。'
const needsLogin = '未检测到 GitHub Copilot CLI 的账户登录。请在终端运行 copilot login，以有 Copilot 访问权的 GitHub 账户登录后重试。'
const unavailableModel = '此 GitHub Copilot 模型当前不可用，请重新读取模型列表。'

async function* readMessages(stream) {
  let buffer = Buffer.alloc(0)
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      const end = buffer.indexOf('\r\n\r\n')
      if (end < 0) {
        if (buffer.length > 4096) throw new Error(failed)
        break
      }
      const header = buffer.toString('ascii', 0, end)
      const length = /^Content-Length: *(\d+)$/im.exec(header)?.[1]
      if (end > 4096 || !length || +length > 4_000_000) throw new Error(failed)
      const start = end + 4
      if (buffer.length < start + Number(length)) break
      yield JSON.parse(buffer.toString('utf8', start, start + Number(length)))
      buffer = buffer.subarray(start + Number(length))
    }
  }
}

function rpc(child) {
  const messages = readMessages(child.stdout)
  let sequence = 0
  return async (method, params = {}) => {
    const id = ++sequence
    const data = JSON.stringify({jsonrpc:'2.0', id, method, params})
    child.stdin.write('Content-Length: ' + Buffer.byteLength(data) + '\r\n\r\n' + data)
    while (true) {
      const { value, done } = await messages.next()
      if (done) throw new Error(failed)
      // This client exposes no host RPC methods, tools, filesystem or permissions.
      if (value.method && value.id !== undefined) throw new Error(failed)
      if (value.method === 'session.event' && value.params?.event?.type === 'permission.requested') throw new Error(failed)
      if (value.id !== id) continue
      if (value.error) throw new Error(value.error.code === -32601 ? updateCLI : failed)
      return value.result
    }
  }
}

async function catalogue(call) {
  const { models } = await call('models.list')
  const seen = new Set(['default','auto'])
  const choices = [{id:'default',name:'GitHub Copilot 自动选择'}]
  for (const m of models || []) {
    if (m.provider?.kind !== 'copilot' || m.policy?.state === 'disabled' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(m.id) || seen.has(m.id)) continue
    seen.add(m.id)
    choices.push({id:m.id,name:String(m.name || m.id).slice(0,150)})
  }
  return choices
}

function sessionConfig(cwd, request) {
  return {
    model:request.model === 'default' ? 'auto' : request.model,
    workingDirectory:cwd, configDirectory:cwd, enableConfigDiscovery:false,
    systemMessage:{mode:'replace',content:String(request.instructions || 'You are a music assistant.')},
    tools:{availableTools:[],definitions:[]}, permissions:{request:true}, agents:{includedBuiltinAgents:[]},
    mcp:{servers:{}}, extensions:{enabled:false}, extensionSources:{user:false,project:false,plugins:false},
    hooks:{enableRepositoryHooks:false}, git:{enableHostGitOperations:false}, skills:{enabled:false},
    state:{enableCrossSessionStore:false,skipEmbeddingRetrieval:true,infiniteSessions:{enabled:false}},
  }
}

export async function runCopilot(binary, env, request) {
  const cwd = await mkdtemp(join(await realpath(tmpdir()), 'mosic-github-copilot-'))
  const timeout = AbortSignal.timeout(request ? 120000 : 30000)
  const signal = request?.signal ? AbortSignal.any([request.signal,timeout]) : timeout
  let child, closed
  try {
    const args = ['--headless','--stdio','--no-auto-update','--disable-builtin-mcps','--no-custom-instructions','--log-level','none','--sync-session=off']
    child = spawn(binary, args, {cwd,signal,killSignal:'SIGKILL',stdio:['pipe','pipe','ignore'],
      env:{...env,COPILOT_AUTO_UPDATE:'false',COPILOT_CACHE_HOME:join(cwd,'cache'),COPILOT_PROVIDERS_CONFIG:join(cwd,'providers.json'),COPILOT_DISABLE_LOGIN_SHELL_ENV:'1',COPILOT_TELEMETRY_DISABLED:'true'}})
    closed = new Promise(resolve => child.once('close',resolve))
    child.on('error', () => {}) // close also fires on spawn failure and signal abort.
    child.stdin.on('error', () => {})
    const call = rpc(child)
    if ((await call('connect')).protocolVersion !== 4) throw new Error(updateCLI)
    const status = await call('auth.getStatus')
    if (!status.isAuthenticated || status.authType !== 'user') {
      throw new Error(needsLogin)
    }
    if (!request) return await catalogue(call)
    if (request.model !== 'default' && !(await catalogue(call)).some(m => m.id === request.model)) throw new Error(unavailableModel)
    const { sessionId } = await call('session.create',sessionConfig(cwd,request))
    if (!sessionId) throw new Error(failed)
    const history = (request.history || []).slice(-10).map(m => ({role:m.role === 'assistant' ? 'assistant' : 'user',text:String(m.text || '').slice(0,1600)}))
    const prompt = JSON.stringify({history,userMessage:String(request.text || '').slice(0,1800)})
    const result = await call('session.sendAndWait',{sessionId,prompt})
    const answer = result.response?.data?.content
    if (result.aborted || result.response?.type !== 'assistant.message' || result.response.agentId || result.response.data.toolRequests?.length || typeof answer !== 'string' || !answer.trim() || answer.length > 100000) throw new Error(failed)
    return answer.trim()
  } catch (error) {
    if (signal.aborted) throw new Error(signal.reason?.name === 'TimeoutError' ? 'GitHub Copilot 回复超时，请重试。' : '本次对话已取消。')
    if ([updateCLI, needsLogin, unavailableModel].includes(error?.message)) throw error
    throw new Error(failed)
  } finally {
    child?.kill('SIGKILL')
    await closed
    await rm(cwd,{recursive:true,force:true})
  }
}
