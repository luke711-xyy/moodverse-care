import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from '../src/store.mjs'
import { checkLocalModel, connectionState, credentialSlot, localRequest, readConnection } from '../src/connection.mjs'
import { availableModels, chat } from '../src/providers.mjs'

const custom={protocol:'completions',url:'https://models.example.test/tenant/v2',auth:'bearer'}
const messages={model:'my-model',history:[],instructions:'system',text:'hello'}

test('a new or untouched legacy profile stays unconfigured and makes no model request', async t=>{
  const dir=mkdtempSync(join(tmpdir(),'mosic-provider-test-'))
  t.after(()=>rmSync(dir,{recursive:true,force:true}))
  for(const legacy of [null,{provider:'local',models:{},allowCockpit:true},{provider:'local',models:{local:'confirmed'},allowCockpit:true}]) {
    if(legacy)writeFileSync(join(dir,'desk.json'),JSON.stringify(legacy))
    const vault=openStore(dir,{})
    try {
      const status=connectionState(vault.db)
      if(legacy?.models.local) {
        assert.equal(status.enabled,true)
        assert.equal(status.model,'confirmed')
      } else {
        assert.equal(status.provider,'none')
        assert.equal(status.configured,false)
        assert.equal(status.enabled,false)
        const fail=()=>assert.fail('unconfigured mode cannot issue a request')
        await assert.rejects(chat({...messages,provider:status.provider},fail),/未配置/)
        await assert.rejects(availableModels({provider:status.provider},fail),/未配置/)
      }
    }finally{vault.history.close()}
  }
})

test('Agent local setup requires the literal model from a loopback service',async()=>{
  assert.equal(localRequest(['/Applications/MOSIC.app/Contents/MacOS/MOSIC']),null)
  const input=localRequest(['--connect-local-url=http://127.0.0.1:11434/v1','--connect-local-model=qwen-local'])
  const config=readConnection({},input)
  await checkLocalModel(config,()=>[{id:'qwen-local'}])
  await assert.rejects(checkLocalModel(config,()=>[{id:'wrong'}]),/未列出/)
  assert.throws(()=>readConnection({}, {...input,endpoint:'https://another.example/v1'}),/回环/)
})

test('a saved API key is scoped to the exact endpoint, protocol and auth header',()=>{
  const config=readConnection({}, {provider:'custom',model:'m',custom})
  const slot=credentialSlot(config)
  for(const changed of [{url:custom.url+'/other'},{url:'https://elsewhere.example/v2'},{protocol:'responses'},{auth:'x-api-key'}]) {
    const next=readConnection({}, {provider:'custom',model:'m',custom:{...custom,...changed}})
    assert.notEqual(credentialSlot(next),slot)
    assert.equal(connectionState({provider:'custom',custom:next.custom,models:{custom:'m'},vault:{[slot]:'encrypted'},allowCockpit:true}).enabled,false)
  }
  assert.throws(()=>readConnection({},{provider:'custom',custom:{...custom,url:'http://models.example.test/v1'}}),/HTTPS/)
  assert.throws(()=>readConnection({},{provider:'custom',custom:{...custom,auth:'other',authHeader:'Cookie',authScheme:'raw'}}),/请求头/)
})

test('custom service supports real provider cursors in URLs, completion payloads and isolated response fields',async()=>{
  let seen=[]
  const api={...custom,url:'https://example.test/v1/chat/completions?api-version=stable',auth:'api-key'}
  const config={...messages,provider:'custom',token:'sample-key',custom:api}
  const net=async(url,init)=>{
    seen.push(url)
    assert.equal(init.redirect,'error')
    assert.equal(init.headers['api-key'],'sample-key')
    if(!init.body)return Response.json({data:[{id:'my-model'}]})
    const body=JSON.parse(init.body)
    assert.equal(body.messages.at(-1).content,'hello')
    return Response.json({choices:[{message:{content:'test response'}}]})
  }
  assert.equal((await availableModels(config,net))[0].id,'my-model')
  assert.equal(await chat(config,net),'test response')
  assert.deepEqual(seen,['https://example.test/v1/models?api-version=stable',api.url])
  const json={...custom,url:'https://myvendor.test/infer',protocol:'json',auth:'other',authHeader:'X-Client-Key',authScheme:'raw',
    bodyTemplate:'{"dialog":"{{messages}}","engine":"{{model}}"}',responsePath:'reply.text'}
  assert.equal(await chat({...config,custom:json},async(url,init)=>{
    assert.equal(url,json.url)
    assert.equal(init.headers['X-Client-Key'],'sample-key')
    assert.deepEqual(JSON.parse(init.body),{dialog:[{role:'system',content:'system'},{role:'user',content:'hello'}],engine:'my-model'})
    return Response.json({reply:{text:'bonjour'}})
  }),'bonjour')
  await assert.rejects(chat({...config,custom:json},()=>Response.json({unexpected:true})),/没有返回回复文字/)
})

test('desktop Agent subscriptions use the explicitly chosen local CLI and need no API key',()=>{
  for (const provider of ['codex','copilot']) {
    const config=readConnection({}, {provider,model:'default'})
    assert.equal(credentialSlot(config),null)
    const current={provider,models:{[provider]:'default'},vault:{},allowCockpit:false}
    assert.equal(connectionState(current).configured,true)
    assert.equal(connectionState(current).enabled,false)
    assert.equal(connectionState({...current,allowCockpit:true}).enabled,true)
  }
})

test('a custom JSON endpoint that owns its model accepts just its URL, key and schema',async()=>{
  const input={provider:'custom',model:'',custom:{protocol:'json',url:'https://inference.example.test/answer',auth:'bearer',
    bodyTemplate:'{"prompt":"{{prompt}}"}',responsePath:'answer'}}
  const config=readConnection({},input)
  const status=connectionState({...config,models:{custom:''},allowCockpit:true,vault:{[credentialSlot(config)]:'encrypted'}})
  assert.equal(status.enabled,true);assert.equal(status.model,'')
  const response=await chat({...messages,...config,token:'dummy-key'},async(url,init)=>{
    assert.equal(url,input.custom.url);assert.equal(init.headers.Authorization,'Bearer dummy-key')
    const body=JSON.parse(init.body)
    assert.deepEqual(Object.keys(body),['prompt'])
    return Response.json({answer:'ok'})
  })
  assert.equal(response,'ok')
})
