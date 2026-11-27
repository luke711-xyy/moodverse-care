import test from 'node:test'
import assert from 'node:assert/strict'
import { localEndpoint, parseAnswer, readResponseStream, candidateTracks, chat } from '../src/providers.mjs'

test('local endpoints stay on loopback; no arbitrary proxy or redirect',()=>{
  for (const bad of ['http://example.org/v1','http://127.0.0.1@example.org/v1','file:///v1','http://localhost/other'])
    assert.throws(()=>localEndpoint(bad))
  assert.equal(localEndpoint('http://localhost:1234/v1/'),'http://localhost:1234/v1')
})
test('SSE needs response.completed, supports split UTF-8 and handles a failed turn',async()=>{
  const values=['data: {"type":"response.output_text.delta","delta":"找到"}\n\n','data: {"type":"response.completed"}\n\n']
  const bytes=new TextEncoder().encode(values.join(''))
  const stream=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close()}})
  assert.equal(await readResponseStream(stream),'找到')
  await assert.rejects(readResponseStream(new Response(values[0]).body),/断开/)
  await assert.rejects(readResponseStream(new Response('data: {"type":"response.failed"}\n').body),/未|没有/)
})
test('recommendations and playback resolve only known candidates and explicit play intent',()=>{
  const tracks=[{id:'slow',title:'Slow',artist:'a',bpm:62,genres:[],moods:[]},{id:'fast',title:'Fast',artist:'a',bpm:166,genres:[],moods:[]}]
  assert.equal(candidateTracks(tracks,'慢一点',[])[0].id,'slow')
  const response=JSON.stringify({reply:'试试 Slow',trackIds:['slow','made-up'],playId:'slow'})
  assert.deepEqual(parseAnswer(response,tracks,'推荐一首').cards.map(t=>t.id),['slow'])
  assert.equal(parseAnswer(response,tracks,'推荐一首').playId,null)
  assert.equal(parseAnswer(response,tracks,'播第一首').playId,'slow')
  assert.equal(parseAnswer(response,tracks,'推荐一首，不要播放').playId,null)
  assert.equal(parseAnswer(JSON.stringify({reply:'试试 Slow',trackIds:['slow']}),tracks,'并直接播放').playId,'slow')
})
test('subscription inference uses approved public endpoint and stateless streamed requests',async()=>{
  let called=false
  const got=await chat({provider:'subscription',model:'model',token:'test',instructions:'i',text:'hello',history:[]},async(url,opts)=>{
    called=true
    assert.equal(url,'https://api.openai.com/v1/responses')
    assert.equal(opts.headers.Authorization,'Bearer test')
    const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert.ok(Array.isArray(body.input))
    return new Response('data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed"}\n\n')
  })
  assert.equal(got,'ok');assert.ok(called)
})

test('prose from small models can name only existing unambiguous candidates and autoplay requires consent',()=>{
  const tracks=[{id:'id-1',title:'Quiet (night)'},{id:'id-2',title:'Echo'},{id:'id-3',title:'Echo'}]
  const raw='推荐《Quiet (night)》。\nplayId: `id-1`'
  const chosen=parseAnswer(raw,tracks,'直接播放')
  assert.deepEqual(chosen,{text:'推荐《Quiet (night)》。',cards:[tracks[0]],playId:'id-1'})
  assert.equal(parseAnswer(raw,tracks,'不要播放').playId,null)
  assert.deepEqual(parseAnswer('推荐《Echo》。\nplayId: invented',tracks,'请播放').cards,[])
  assert.deepEqual(parseAnswer('听听《Quiet (night)》',tracks,'推荐一首').cards,[tracks[0]])
  assert.equal(parseAnswer('播放 Quiet (night)\nplayId: invented',tracks,'请播放').playId,null)
  assert.equal(parseAnswer('null',tracks,'你好').playId,null)
})
