import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { readFriendSatellites } from '../functions/_music-friend-satellites'
import { readPublicPlanet } from '../functions/api/music/planets/[id]'
import { createDitherSpec } from '../src/music/dither/appearance'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'
import { readMusicSocialState } from '../functions/_music-social-state'

let fixture: ReturnType<typeof createMusicApiFixture>
beforeEach(() => {
  fixture = createMusicApiFixture()
  for (const id of ['owner', 'peer', 'pending']) {
    fixture.sqlite.prepare("INSERT INTO users (id,token_hash,created_at,updated_at) VALUES (?,?,'now','now')").run(id,id)
    fixture.sqlite.prepare("INSERT INTO music_planets (id,owner_user_id,display_name,visibility,created_at,updated_at) VALUES (?, ?, ?, 'public','now','now')").run(`planet-${id}`,id,id)
  }
})
afterEach(() => { fixture.close(); vi.useRealTimers() })

function addFriends(count: number) {
  for(let i=0;i<count;i++) {
    const id=`peer-${i}`
    fixture.sqlite.prepare("INSERT INTO users(id,token_hash,created_at,updated_at) VALUES(?,?,'now','now')").run(id,id)
    fixture.sqlite.prepare("INSERT INTO music_planets(id,owner_user_id,display_name,visibility,created_at,updated_at) VALUES(?,?,?,'public','now','now')").run(`planet-${id}`,id,id)
    fixture.sqlite.prepare("INSERT INTO music_friendships(user_a_id,user_b_id,created_at) VALUES('owner',?,'now')").run(id)
  }
}
function message(id: string, sender: string, recipient: string, date: string) {
  fixture.sqlite.prepare('INSERT INTO music_direct_messages(id,sender_user_id,recipient_user_id,content_text,created_at) VALUES(?,?,?,?,?)').run(id,sender,recipient,'hello',date)
}

test('satellite candidates rank both directions of recent chat before unchatted friends without truncating the friend list', async () => {
  addFriends(8)
  message('older','owner','peer-6','2026-10-09T02:00:00Z')
  message('latest','peer-7','owner','2026-10-10T03:00:00Z')
  const env=createMusicApiEnv(fixture.db)
  const friends=await readFriendSatellites(env,'owner')
  expect(friends).toHaveLength(8)
  expect(friends.slice(0,2).map(f=>f.id)).toEqual(['friend-peer-7','friend-peer-6'])
  const publicFriends=await readFriendSatellites(env,'owner',{publicOnly:true,viewerUserId:'peer'})
  expect(publicFriends.slice(0,2).map(f=>f.planetId)).toEqual(['planet-peer-7','planet-peer-6'])
  expect(JSON.stringify(publicFriends)).not.toMatch(/lastMessage|last_message|2026-10-10T03/)
  message('newest','owner','peer-5','2026-10-10T04:00:00Z')
  expect((await readFriendSatellites(env,'owner'))[0].id).toBe('friend-peer-5')
  const state=await readMusicSocialState(env,'owner')
  expect(state.friends.find(f=>f.userId==='peer-5')).toMatchObject({lastMessageAt:'2026-10-10T04:00:00Z'})
})

test('unchatted satellite candidates shuffle across days but remain stable within a day', async () => {
  vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-10-10T04:00:00Z'))
  addFriends(12)
  const env=createMusicApiEnv(fixture.db), ids=async()=>(await readFriendSatellites(env,'owner')).slice(0,5).map(f=>f.id)
  const today=await ids()
  expect(await ids()).toEqual(today)
  vi.setSystemTime(new Date('2026-10-10T16:00:00Z'))
  expect(await ids()).not.toEqual(today)
})

test('public song satellites retain the exact selected songs even when a catalog entry was retired', async () => {
  for (const [position, id] of ['song-a','song-b','song-c'].entries()) {
    insertCatalogTrack(fixture.sqlite,{id,active:position===0})
    fixture.sqlite.prepare("INSERT INTO music_planet_tracks (planet_id,track_id,position,is_primary,selected_at) VALUES ('planet-owner',?,?,?,'now')").run(id,position,position===0?1:0)
  }
  const planet = await readPublicPlanet(createMusicApiEnv(fixture.db),'planet-owner','peer')
  expect(planet?.tracks.map(track=>track.id)).toEqual(['song-a','song-b','song-c'])
})

test('only accepted, unblocked friends become satellites and use their own public planet appearance', async () => {
  fixture.sqlite.prepare("INSERT INTO music_friend_satellites (id,owner_user_id,friend_slot,display_name,tagline,color,visual_seed,orbit_radius,orbit_phase,created_at) VALUES ('legacy-virtual','owner',0,'fake','','#ffffff','fake',.2,0,'now')").run()
  fixture.sqlite.prepare("INSERT INTO music_friendships (user_a_id,user_b_id,created_at) VALUES ('owner','peer','now')").run()
  fixture.sqlite.prepare("INSERT INTO music_friend_requests (id,requester_user_id,recipient_user_id,status,created_at,updated_at) VALUES ('pending-request','pending','owner','pending','now','now')").run()
  const visual = createDitherSpec({planetId:'planet-peer',tracks:[],overrides:{blue:0,violet:0,pink:1}})
  fixture.sqlite.prepare("UPDATE music_planets SET visual_json=? WHERE id='planet-peer'").run(JSON.stringify(visual))
  const env = createMusicApiEnv(fixture.db)
  const friends = await readFriendSatellites(env,'owner')
  expect(friends).toHaveLength(1)
  expect(friends[0]).toMatchObject({id:'friend-peer',isVirtual:false,visual})
  fixture.sqlite.prepare("INSERT INTO music_user_blocks (blocker_user_id,blocked_user_id,created_at) VALUES ('peer','owner','now')").run()
  expect(await readFriendSatellites(env,'owner')).toEqual([])
  // Old demonstration rows are ignored, not destructively removed.
  expect(fixture.sqlite.prepare("SELECT count(*) AS n FROM music_friend_satellites").get()).toEqual({n:1})
})

test('a private friend planet never exposes its name, ID or appearance through satellites', async () => {
  fixture.sqlite.prepare("INSERT INTO music_friendships (user_a_id,user_b_id,created_at) VALUES ('owner','peer','now')").run()
  fixture.sqlite.prepare("UPDATE music_planets SET visibility='private',display_name='private-name',visual_json=? WHERE id='planet-peer'").run(JSON.stringify(createDitherSpec({planetId:'secret-seed',tracks:[]})))
  const result = await readFriendSatellites(createMusicApiEnv(fixture.db),'owner')
  expect(result).toHaveLength(1)
  expect(result[0].displayName).toBe('好友星球')
  expect(JSON.stringify(result)).not.toMatch(/private-name|planet-peer|secret-seed/)
})
