import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyCockpitLink, cockpitOrigin, cockpitReply, filtersFor, safeCockpitPage } from '../src/cockpit.mjs'

const origin='https://moodverse-care.pages.dev'
const track={type:'track',source:'catalog',reason:'曲库曲目',track:{id:'id-1',title:'Night',artistName:'Nightwave',audioUrl:'/api/music/tracks/id-1/stream'}}
const config={provider:'local',endpoint:'http://127.0.0.1:18374/v1',model:'local',personality:'简洁'}

test('packaged cockpit is pinned and links retain the appropriate viewing session',()=>{
  assert.equal(cockpitOrigin(true,'http://127.0.0.1:5196'),origin)
  assert.equal(cockpitOrigin(false,'http://127.0.0.1:5196'),'http://127.0.0.1:5196')
  assert.throws(()=>cockpitOrigin(false,'https://example.com'))
  assert.ok(safeCockpitPage(origin+'/?visitPlanet=1',origin))
  assert.equal(classifyCockpitLink(origin+'/desktop/',origin),'external')
  assert.equal(classifyCockpitLink(origin+'/desktop/mosic-copilot-macos-arm64.zip',origin),'external')
  assert.equal(classifyCockpitLink('https://audius.co/example/song',origin),'external')
  assert.equal(classifyCockpitLink(origin+'/api/me/messages/id/photo',origin),'photo')
  assert.equal(classifyCockpitLink('file:///tmp/example',origin),'blocked')
})

test('remote catalogue receives coarse music filters and the local model returns playable validated cards',async()=>{
  const input={text:'给我播放一首夜航时听的爵士。我今晚的心事不想外传。',requestId:'a-1',context:{trackId:'id-1'}}
  let outside,inside
  const reply=await cockpitReply({input,origin,config,signal:new AbortController().signal,
    fetcher:async(url,options)=>{assert.equal(url,origin+'/api/me/copilot/candidates');outside=JSON.parse(options.body);return Response.json({cards:[track]})},
    generate:async arg=>{inside=arg;return JSON.stringify({reply:'已选 Night。',trackIds:['id-1'],playId:null})}})
  assert.deepEqual(outside,JSON.parse(JSON.stringify(filtersFor(input.text,input.context))))
  assert.ok(!JSON.stringify(outside).includes('心事'))
  assert.equal(inside.text,input.text)
  assert.equal(reply.messages[1].source,'desktop')
  assert.equal(reply.messages[1].playTrackId,'id-1')
  assert.equal(reply.messages[1].cards[0].track.title,'Night')
  assert.equal(reply.messages.length,2)
})

test('a planet made private during local inference cannot reappear in returned text or cards',async()=>{
  const planet={type:'planet',planetId:'p1',displayName:'曾经公开的星球',reason:'共同音乐',source:'public_planet'}
  let reads=0
  const result=await cockpitReply({input:{text:'拜访星球',requestId:'b-1'},origin,config,signal:new AbortController().signal,
    fetcher:async()=>Response.json({cards:++reads===1?[planet]:[]}),
    generate:async()=>JSON.stringify({reply:planet.displayName,trackIds:['p1']})})
  assert.equal(reads,2);assert.deepEqual(result.messages[1].cards,[])
  assert.ok(!result.messages[1].text.includes(planet.displayName))
})
