import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, chmod, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { pairToFile } from '../src/mcp.mjs'

const moduleURL = new URL('../src/mcp.mjs',import.meta.url).href
const token='01234567-89ab-4cde-8012-3456789abcde'.repeat(2)
const stub = `
import { serve } from ${JSON.stringify(moduleURL)}
const fetcher = async (url,opt)=>{
  if(url.origin!=='https://moodverse-care.pages.dev') throw new Error('Unexpected host')
  if(url.pathname==='/api/music/catalog' && !opt.headers?.Authorization) return Response.json({ status:'fixture',tracks:[
    {id:'catalog:1',title:'潮声',artistName:'岛',audioUrl:'/audio/sample.mp3'},
    {id:'catalog:2',title:'unplayable',audioUrl:'https://foreign.example/'}
  ]})
  if(url.pathname==='/api/music/copilot-device' && opt.headers?.Authorization==='Bearer '+${JSON.stringify(token)} &&
    JSON.stringify(JSON.parse(opt.body))===JSON.stringify({action:'match',trackId:'catalog:1'})) return Response.json({planets:[{planetId:'p1',displayName:'岛屿'}]})
  throw new Error('Unexpected request')
}
await serve({fetcher})
`
function rpc(id,method,params={}) {return {jsonrpc:'2.0',id,method,params}}
const init=rpc(1,'initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'test',version:'1'},capabilities:{}})
function client(t, env={}) {
  const child=spawn(process.execPath,['--input-type=module','-e',stub],{env:{PATH:process.env.PATH,...env},stdio:['pipe','pipe','pipe']})
  const next=createInterface({input:child.stdout})[Symbol.asyncIterator]()
  t.after(()=>{child.stdin.end();child.kill()})
  return {
    send(value){child.stdin.write((typeof value==='string'?value:JSON.stringify(value))+'\n')},
    async read(){const {value,done}=await next.next();assert.equal(done,false);return JSON.parse(value)},
    async start(){this.send(init);assert.equal((await this.read()).result.protocolVersion,'2025-11-25');this.send({jsonrpc:'2.0',method:'notifications/initialized'})},
    async call(id,name,args){this.send(rpc(id,'tools/call',{name,arguments:args}));return (await this.read()).result},
    async close(){const exit=once(child,'exit');child.stdin.end();assert.equal((await exit)[0],0)},
  }
}
test('stdio handshake, tool discovery, catalogue, authorized matches and a local draft never sent to MOSIC',async t=>{
  const c=client(t,{MOSIC_DEVICE_TOKEN:token})
  c.send(rpc(0,'tools/list'));assert.equal((await c.read()).error.code,-32002)
  await c.start();c.send(rpc(2,'tools/list'))
  assert.deepEqual((await c.read()).result.tools.map(t=>t.name),['search_music','find_same_song_planets','draft_introduction'])
  assert.equal((await c.call(3,'draft_introduction',{trackId:'catalog:1'})).isError,true)
  assert.deepEqual(JSON.parse((await c.call(4,'search_music',{query:'潮'})).content[0].text).tracks.map(t=>t.title),['潮声'])
  const matches=await c.call(5,'find_same_song_planets',{trackId:'catalog:1'})
  assert.deepEqual(JSON.parse(matches.content[0].text).planets,[{planetId:'p1',displayName:'岛屿'}])
  assert.doesNotMatch(JSON.stringify(matches),new RegExp(token))
  const draft=JSON.parse((await c.call(6,'draft_introduction',{trackId:'catalog:1',greeting:'想交换歌曲'})).content[0].text)
  assert.equal(draft.sent,false);assert.match(draft.introduction,/潮声/);assert.equal(draft.greeting,'想交换歌曲')
  assert.equal((await c.call(7,'draft_introduction',{trackId:'catalog:1',send:true})).isError,true)
  await c.close()
})
test('modern protocol discovery, request metadata, and invalid frames recover independently',async t=>{
  const c=client(t)
  c.send('{');assert.equal((await c.read()).error.code,-32700)
  const meta={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}
  c.send(rpc(1,'server/discover',{_meta:meta}))
  const discovered=(await c.read()).result;assert.ok(discovered.supportedVersions.includes('2026-07-28'));assert.equal(discovered.resultType,'complete')
  c.send(rpc(2,'tools/list',{_meta:meta}));assert.equal((await c.read()).result.tools.length,3)
  c.send(rpc(3,'tools/list',{_meta:{...meta,'io.modelcontextprotocol/protocolVersion':'3000-01-01'}}));assert.equal((await c.read()).error.code,-32022)
  c.send(rpc(4,'tools/call',{_meta:meta,name:'find_same_song_planets',arguments:{trackId:'catalog:1'}}));assert.equal((await c.read()).result.isError,true)
  await c.close()
})
test('explicit pairing writes an exclusively owned token file, refuses overwrites, symlinks and insecure permissions',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'mosic-mcp-test-'));t.after(()=>rm(dir,{recursive:true,force:true}))
  const path=join(dir,'device.token')
  let calls=0
  const net=async(url,opt)=>{calls++;assert.equal(url.pathname,'/api/music/copilot-device');assert.deepEqual(JSON.parse(opt.body),{action:'pair',code:'ABCDEFGH23456789'});return Response.json({token})}
  await pairToFile(path,'ABCD-EFGH-2345-6789',net)
  assert.equal((await stat(path)).mode & 0o777,0o600);assert.equal((await readFile(path,'utf8')).trim(),token)
  await assert.rejects(pairToFile(path,'ABCD-EFGH-2345-6789',net));assert.equal(calls,1)
  const c=client(t,{MOSIC_DEVICE_TOKEN_FILE:path});await c.start()
  assert.equal((await c.call(2,'find_same_song_planets',{trackId:'catalog:1'})).isError,false)
  await chmod(path,0o644)
  assert.equal((await c.call(3,'find_same_song_planets',{trackId:'catalog:1'})).isError,true)
  await chmod(path,0o600)
  const link=join(dir,'link');await symlink(path,link)
  const linked=client(t,{MOSIC_DEVICE_TOKEN_FILE:link});await linked.start()
  assert.equal((await linked.call(4,'find_same_song_planets',{trackId:'catalog:1'})).isError,true)
  await linked.close();await c.close()
})
