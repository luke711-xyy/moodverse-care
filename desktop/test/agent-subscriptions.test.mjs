import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentSubscriptionModels, chatWithAgent } from '../src/agent-subscriptions.mjs'

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(),'mosic-subscription-test-'))
  const saved = new Map(['PATH','CODEX_HOME','OPENAI_API_KEY','OPENAI_BASE_URL'].map(key => [key,process.env[key]]))
  t.after(async () => {
    for (const [key,value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(dir,{recursive:true,force:true})
  })
  process.env.PATH = dir
  process.env.CODEX_HOME = dir
  process.env.OPENAI_API_KEY = 'test-key-should-stay-out'
  process.env.OPENAI_BASE_URL = 'https://gateway.invalid'
  // Use the process's actual Node path, even when the desktop test runner
  // inherited a minimal Finder-style PATH.
  const script = `#!${process.execPath}
const fs=require('node:fs'),p=require('node:path'),args=process.argv.slice(2),home=process.env.CODEX_HOME
if(args.includes('login')) {
  process.stderr.write(fs.readFileSync(p.join(home,'status'),'utf8'))
} else {
  const input=fs.readFileSync(0,'utf8')
  fs.writeFileSync(p.join(home,'request'),JSON.stringify({args,input,cwd:process.cwd(),key:process.env.OPENAI_API_KEY,url:process.env.OPENAI_BASE_URL}))
  if(fs.existsSync(p.join(home,'wait'))) setInterval(()=>{},1000)
  else fs.writeFileSync(args[args.indexOf('--output-last-message')+1], '{"reply":"music"}')
}`
  await writeFile(join(dir,'codex'),script,{mode:0o755})
  await writeFile(join(dir,'status'),'Logged in using ChatGPT\n')
  return dir
}

test('subscription lists only visible local Codex models after checking ChatGPT sign-in',async t=>{
  const dir=await fixture(t)
  assert.deepEqual((await agentSubscriptionModels('codex')).map(m=>m.id),['default'])
  await writeFile(join(dir,'models_cache.json'),JSON.stringify({models:[
    {slug:'model-1',visibility:'list',display_name:'Model 1'},{slug:'model-2',visibility:'hide'},{slug:'model-1',visibility:'list'},
  ]}))
  assert.deepEqual((await agentSubscriptionModels('codex')).map(m=>m.id),['default','model-1'])
  await writeFile(join(dir,'status'),'Logged in using an API key')
  await assert.rejects(agentSubscriptionModels('codex'),/ChatGPT 登录/)
  await assert.rejects(chatWithAgent({provider:'codex',model:'default',text:'test'}),/ChatGPT 登录/)
  await assert.rejects(access(join(dir,'request')))
})

test('Codex receives recent text over stdin in an ephemeral, restricted workspace',async t=>{
  const dir=await fixture(t)
  const request={provider:'codex',model:'chosen-model',instructions:'Return a music suggestion',history:Array.from({length:12},(_,i)=>({role:'user',text:'old '+i})),text:'Input containing quotes and $(example)'}
  assert.equal(await chatWithAgent(request),'{"reply":"music"}')
  const {args,input,cwd,key,url}=JSON.parse(await readFile(join(dir,'request'),'utf8'))
  assert.equal(key,undefined);assert.equal(url,undefined)
  assert.equal(args[args.indexOf('--model')+1],'chosen-model')
  assert.ok(args.includes('--ignore-user-config') && args.includes('--ephemeral'))
  assert.ok(args.includes('permissions.mosic.filesystem={":root"="deny"}') && args.includes('permissions.mosic.network.enabled=false'))
  assert.ok(args.includes('shell_tool') && args.includes('apps') && args.includes('hooks'))
  assert.ok(!args.some(arg=>arg.includes(request.text)))
  assert.deepEqual(JSON.parse(input),{instructions:request.instructions,history:request.history.slice(-10),userMessage:request.text})
  await assert.rejects(access(cwd))
  assert.equal(await chatWithAgent({...request,model:'default'}),'{"reply":"music"}')
  assert.ok(!JSON.parse(await readFile(join(dir,'request'),'utf8')).args.includes('--model'))
  await assert.rejects(chatWithAgent({...request,model:'--unknown-flag'}),/选择有效的 Agent 模型/)
})

test('aborting a pending subscription response cleans its temporary directory',async t=>{
  const dir=await fixture(t)
  await writeFile(join(dir,'wait'),'')
  const controller=new AbortController()
  const promise=chatWithAgent({provider:'codex',model:'default',text:'x',signal:controller.signal})
  const result=assert.rejects(promise,/取消/)
  let observed
  for(let i=0;i<100 && !observed;i++){
    try { observed=JSON.parse(await readFile(join(dir,'request'),'utf8')) } catch { await new Promise(resolve=>setTimeout(resolve,20)) }
  }
  controller.abort();await result
  assert.ok(observed);await assert.rejects(access(observed.cwd))
})

async function copilotFixture(t) {
  const dir = await fixture(t)
  const saved = new Map(['COPILOT_HOME','GITHUB_TOKEN','COPILOT_ALLOW_ALL'].map(key=>[key,process.env[key]]))
  t.after(() => {
    for (const [key,value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  process.env.COPILOT_HOME = dir
  process.env.GITHUB_TOKEN = 'unused-fixture'
  process.env.COPILOT_ALLOW_ALL = 'true'
  await writeFile(join(dir,'copilot'), `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path'), home = process.env.COPILOT_HOME
const read = name => fs.readFileSync(path.join(home,name),'utf8')
let buffer = Buffer.alloc(0)
process.stdin.on('data',chunk => {
  buffer = Buffer.concat([buffer,chunk])
  const end = buffer.indexOf('\\r\\n\\r\\n')
  if (end<0) return
  const length = Number(buffer.toString('ascii',0,end).split(':')[1])
  if (buffer.length < end+4+length) return
  const {id,method,params} = JSON.parse(buffer.subarray(end+4,end+4+length))
  buffer = buffer.subarray(end+4+length)
  fs.appendFileSync(path.join(home,'requests'),JSON.stringify({method,params,cwd:process.cwd(),pid:process.pid,args:process.argv.slice(2),token:process.env.GITHUB_TOKEN,allowAll:process.env.COPILOT_ALLOW_ALL})+'\\n')
  const scenario = read('scenario')
  const results = {
    connect:{ok:true,protocolVersion:scenario === 'older' ? 3 : 4},
    'auth.getStatus':{isAuthenticated:scenario !== 'signed-out',authType:scenario === 'env-token' ? 'env' : 'user'},
    'models.list':{models:[{id:'chosen',name:'模型',provider:{kind:'copilot'}},{id:'chosen',provider:{kind:'copilot'}},{id:'byok'},{id:'off',provider:{kind:'copilot'},policy:{state:'disabled'}}]},
    'session.create':{sessionId:'testsession'},
    'session.sendAndWait':{response:{type:'assistant.message',data:{content:'{"reply":"music"}'}}},
  }
  if (method === 'session.sendAndWait' && scenario === 'pending') return
  if (method === 'session.sendAndWait' && scenario === 'exited') process.exit(1)
  const payload = Buffer.from(JSON.stringify({jsonrpc:'2.0',id,result:results[method]}))
  process.stdout.write('Content-Length: '+payload.length+'\\r\\n\\r\\n')
  process.stdout.write(payload.subarray(0,4))
  setImmediate(()=>process.stdout.write(payload.subarray(4)))
})
`, {mode:0o755})
  await writeFile(join(dir,'scenario'),'signed-in')
  return dir
}

async function copilotCalls(dir) {
  return (await readFile(join(dir,'requests'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))
}

test('Copilot reads subscription models and uses only an authenticated, tool-free CLI session',async t=>{
  const dir = await copilotFixture(t)
  assert.deepEqual((await agentSubscriptionModels('copilot')).map(m=>m.id),['default','chosen'])
  const request={provider:'copilot',model:'chosen',instructions:'音乐建议',text:'$(echo music)',history:[{role:'user',text:'prior'}]}
  assert.equal(await chatWithAgent(request),'{"reply":"music"}')
  const calls=await copilotCalls(dir)
  const start=calls.find(r=>r.method==='session.create')
  assert.deepEqual(start.params.tools.availableTools,[])
  assert.equal(start.params.permissions.request,true)
  assert.equal(start.params.enableConfigDiscovery,false)
  assert.equal(start.params.hooks.enableRepositoryHooks,false)
  assert.equal(start.params.configDirectory,start.cwd)
  assert.ok(start.args.includes('--disable-builtin-mcps'))
  assert.equal(start.token,undefined)
  assert.equal(start.allowAll,undefined)
  assert.equal(start.params.model,'chosen')
  assert.deepEqual(JSON.parse(calls.at(-1).params.prompt),{history:request.history,userMessage:request.text})
  await assert.rejects(access(start.cwd))
  await assert.rejects(chatWithAgent({...request,model:'byok'}),/当前不可用/)
  await chatWithAgent({...request,model:'default'})
  assert.equal((await copilotCalls(dir)).filter(r=>r.method==='session.create').at(-1).params.model,'auto')
})

test('Copilot blocks incompatible protocols, missing login and environment credentials before inference',async t=>{
  const dir = await copilotFixture(t)
  for (const [scenario,expect] of [['older',/版本不兼容/],['signed-out',/copilot login/],['env-token',/copilot login/]]) {
    await writeFile(join(dir,'scenario'),scenario)
    await assert.rejects(chatWithAgent({provider:'copilot',model:'default',text:'private'}),expect)
  }
  const calls=await copilotCalls(dir)
  assert.ok(calls.every(row=>row.method==='connect' || row.method==='auth.getStatus'))
})

test('Copilot startup and pending responses terminate cleanly on exit, cancellation and timeout',async t=>{
  const dir=await copilotFixture(t)
  const request={provider:'copilot',model:'default',text:'test'}
  await writeFile(join(dir,'scenario'),'exited')
  await assert.rejects(chatWithAgent(request),/未完成请求/)
  await writeFile(join(dir,'scenario'),'pending')
  for (const useTimeout of [false,true]) {
    await writeFile(join(dir,'requests'),'')
    const controller=new AbortController()
    const signal=useTimeout ? AbortSignal.timeout(500) : controller.signal
    const result=assert.rejects(chatWithAgent({...request,signal}),useTimeout ? /超时/ : /取消/)
    let send
    for(let i=0;i<100 && !send;i++){
      try { send=(await copilotCalls(dir)).find(r=>r.method==='session.sendAndWait') } catch { /* CLI is starting. */ }
      if (!send) await new Promise(resolve=>setTimeout(resolve,10))
    }
    if (!useTimeout) controller.abort()
    await result
    assert.ok(send)
    assert.throws(()=>process.kill(send.pid,0),{code:'ESRCH'})
    await assert.rejects(access(send.cwd))
  }
})
