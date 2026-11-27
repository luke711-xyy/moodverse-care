import { execFile } from 'node:child_process'
import { runCopilot } from './github-copilot.mjs'
import { constants } from 'node:fs'
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const validModel = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(value)
const authStore = 'cli_auth_credentials_store="auto"'

// Finder-launched apps do not inherit the user's interactive shell PATH.
// Resolve the CLI on this Mac and never interpolate a model or prompt into a shell.
async function findCli(name) {
  const dirs = [
    ...(process.env.PATH || '').split(delimiter).filter(isAbsolute),
    join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin',
    ...(name === 'codex' ? ['/Applications/Codex.app/Contents/Resources',
      '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS'] : []),
  ]
  for (const dir of new Set(dirs)) {
    const candidate = join(dir, name)
    try { await access(candidate, constants.X_OK); if ((await stat(candidate)).isFile()) return candidate } catch { /* Try the next installation. */ }
  }
  if (name === 'copilot') throw new Error('本机未找到 GitHub Copilot CLI。请安装官方 CLI，在终端运行 copilot login 后重新检测。')
  throw new Error('本机未找到 Codex CLI。请安装官方 Codex CLI，在终端运行 codex login，然后重新检测。')
}

function cliEnvironment() {
  const env = {}
  // Retain the local CLI login path and HTTPS connectivity, without inheriting
  // model gateway overrides, API credentials or Node startup scripts.
  for (const key of ['HOME','PATH','CODEX_HOME','TMPDIR','LANG','LC_ALL','HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY','https_proxy','http_proxy','all_proxy','no_proxy','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  env.PATH = [...new Set([...(env.PATH || '').split(delimiter).filter(isAbsolute), '/opt/homebrew/bin', '/usr/local/bin','/usr/bin','/bin'])].join(delimiter)
  return env
}

async function authenticatedCli(provider, signal) {
  if (provider !== 'codex') throw new Error('请选择已支持的 Agent 订阅。')
  const binary = await findCli('codex')
  const env = cliEnvironment()
  let status
  try {
    const result = await execute(binary, ['-c',authStore,'login','status'], { env, cwd:tmpdir(), signal, timeout:12000, maxBuffer:64000 })
    status = result.stdout + result.stderr
  } catch {
    if (signal?.aborted) throw new Error('本次对话已取消。')
    throw new Error('未检测到 Codex 的 ChatGPT 登录。请在终端运行 codex login，选择 ChatGPT 登录后重试。')
  }
  if (!/logged in using chatgpt/i.test(status)) throw new Error('Codex 当前未使用 ChatGPT 登录。请在本机切换到 ChatGPT 登录，或在 MOSIC 选择 API Key。')
  return { binary, env }
}

async function githubCopilot(request) {
  const binary = await findCli('copilot')
  const env = cliEnvironment()
  delete env.CODEX_HOME
  if (process.env.COPILOT_HOME) env.COPILOT_HOME = process.env.COPILOT_HOME
  return runCopilot(binary, env, request)
}

export async function agentSubscriptionModels(provider) {
  if (provider === 'copilot') return githubCopilot()
  const { env } = await authenticatedCli(provider)
  const models = [{id:'default',name:'Codex 自动选择'}]
  try {
    const file = join(env.CODEX_HOME || join(homedir(),'.codex'), 'models_cache.json')
    if ((await stat(file)).size > 5_000_000) return models
    const cache = JSON.parse(await readFile(file, 'utf8'))
    for (const item of Array.isArray(cache.models) ? cache.models : []) {
      if (item.visibility === 'list' && validModel(item.slug) && !models.some(m => m.id === item.slug)) {
        models.push({id:item.slug,name:String(item.display_name || item.slug).slice(0,150)})
      }
    }
  } catch { /* The CLI can choose a model before its optional model cache exists. */ }
  return models
}

const disabledFeatures = ['shell_tool','unified_exec','view_image','browser_use','browser_use_external','computer_use','image_generation','apps','plugins','hooks','multi_agent','memories','skill_search','tool_suggest']
const runConfig = [
  authStore, 'forced_login_method="chatgpt"', 'model_provider="openai"', 'approval_policy="never"',
  'default_permissions="mosic"', 'permissions.mosic.filesystem={":root"="deny"}',
  'permissions.mosic.network.enabled=false', 'web_search="disabled"',
  'project_doc_max_bytes=0', 'skills.include_instructions=false', 'tools.experimental_request_user_input.enabled=false',
]

export async function chatWithAgent({provider,model,instructions,history=[],text,signal}) {
  if (model !== 'default' && !validModel(model)) throw new Error('请先选择有效的 Agent 模型。')
  if (provider === 'copilot') return githubCopilot({model,instructions,history,text,signal})
  const { binary, env } = await authenticatedCli(provider, signal)
  const cwd = await mkdtemp(join(tmpdir(), 'mosic-codex-'))
  const output = join(cwd,'answer.txt')
  try {
    // The named permissions profile denies filesystem access to tools. Older
    // CLIs that do not understand it fail instead of running with wider access.
    const args = ['exec','--strict-config','--ignore-user-config','--ignore-rules','--skip-git-repo-check','--ephemeral',
      ...runConfig.flatMap(value => ['-c',value]), ...disabledFeatures.flatMap(flag => ['--disable',flag]),
      ...(model === 'default' ? [] : ['--model',model]), '--color','never','--output-last-message',output,'-']
    const input = JSON.stringify({instructions,history:history.slice(-10).map(m => ({role:m.role === 'assistant' ? 'assistant' : 'user',text:String(m.text || '').slice(0,1600)})),userMessage:String(text || '').slice(0,1800)})
    const task = execute(binary, args, { env, cwd, signal, timeout:120000, killSignal:'SIGKILL', maxBuffer:1_000_000 })
    task.child.stdin.on('error', () => {}) // The process may exit before reading stdin.
    task.child.stdin.end(input)
    try { await task } catch (error) {
      if (signal?.aborted) throw new Error('本次对话已取消。')
      if (error.killed || error.signal === 'SIGKILL') throw new Error('Codex 回复超时，请重试。')
      if (/unexpected argument|unknown (feature|field)|unrecognized (option|argument)|config.*invalid/i.test(error.stderr || '')) {
        throw new Error('请更新本机 Codex CLI 后重试。当前版本不支持 MOSIC 的只读对话配置。')
      }
      throw new Error('Codex 未完成回答。请检查本机 Codex 登录、所选模型、网络和订阅额度。')
    }
    if ((await stat(output).catch(() => null))?.size > 100000) throw new Error('Codex 回复过长。')
    const answer = (await readFile(output,'utf8').catch(() => '')).trim()
    if (!answer) throw new Error('Codex 未返回文字。')
    return answer
  } finally { await rm(cwd,{recursive:true,force:true}) }
}
