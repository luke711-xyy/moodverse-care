import { afterEach, beforeEach, expect, test } from 'vitest'
import { authenticatedMusicUser } from '../functions/_shared'
import { onRequestPatch } from '../functions/api/me/music-planet'
import { onRequestGet as galaxy } from '../functions/api/music/galaxy'
import { onRequestGet as orbit } from '../functions/api/me/orbit'
import { onRequestGet as portal } from '../functions/api/music/song-portal'
import { discoverPublicPlanets } from '../functions/api/music/discovery'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

let f: ReturnType<typeof createMusicApiFixture>, cookie: string, userId: string
const env = () => createMusicApiEnv(f.db, { MUSIC_ALLOW_LEGACY_ACCESS_AUTH: 'false' })
const request = (path: string) => new Request(`https://music.test${path}`, { headers: { cookie } })
beforeEach(async () => {
  f = createMusicApiFixture()
  cookie = ''
  const identity = (await authenticatedMusicUser(request('/'), env()))!
  cookie = identity.setCookie!.split(';')[0]; userId = identity.userId
  for (const id of ['first','middle','last']) insertCatalogTrack(f.sqlite, { id })
  f.sqlite.exec(`UPDATE music_track_catalog SET genres_json='["Pop"]';
    INSERT INTO users(id,token_hash,created_at,updated_at) VALUES('peer','peer-hash','now','now');`)
  for (const [id, owner] of [['own',userId],['other','peer']]) {
    f.sqlite.prepare("INSERT INTO music_planets(id,owner_user_id,display_name,visibility,created_at,updated_at) VALUES(?,?,?,'public','now','now')").run(id,owner,id)
    for (const [position,track] of ['first','middle','last'].entries()) f.sqlite.prepare('INSERT INTO music_planet_tracks(planet_id,track_id,position,is_primary,selected_at) VALUES(?,?,?,?,?)').run(id,track,position,position===2?1:0,'original-time')
  }
})

test('failed primary assignment rolls back the cleared flag and planet revision together', async () => {
  const before=f.sqlite.prepare("SELECT visual_revision,visual_json FROM music_planets WHERE id='own'").get()
  f.sqlite.exec(`CREATE TRIGGER fail_primary BEFORE UPDATE OF is_primary ON music_planet_tracks
    WHEN NEW.planet_id='own' AND NEW.track_id='first' AND NEW.is_primary=1
    BEGIN SELECT RAISE(ABORT,'injected write failure'); END;`)
  await expect(onRequestPatch({request:new Request('https://music.test/api/me/music-planet',{method:'PATCH',headers:{cookie,Origin:'https://music.test'},body:JSON.stringify({primaryTrackId:'first'})}),env:env()} as never)).rejects.toThrow('injected write failure')
  expect(f.sqlite.prepare("SELECT track_id FROM music_planet_tracks WHERE planet_id='own' AND is_primary=1").all()).toEqual([{track_id:'last'}])
  expect(f.sqlite.prepare("SELECT visual_revision,visual_json FROM music_planets WHERE id='own'").get()).toEqual(before)
})
afterEach(() => f.close())

test('primary-only switches work in both row directions and preserve track positions and timestamps', async () => {
  for (const id of ['first','last','middle']) {
    const response = await onRequestPatch({ request: new Request('https://music.test/api/me/music-planet', { method:'PATCH',headers:{cookie,Origin:'https://music.test'},body:JSON.stringify({primaryTrackId:id}) }),env:env() } as never)
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.planet.tracks.filter((t:any)=>t.isPrimary).map((t:any)=>t.id)).toEqual([id])
    expect(f.sqlite.prepare("SELECT track_id,position,selected_at FROM music_planet_tracks WHERE planet_id='own' ORDER BY position").all()).toEqual([
      {track_id:'first',position:0,selected_at:'original-time'}, {track_id:'middle',position:1,selected_at:'original-time'}, {track_id:'last',position:2,selected_at:'original-time'},
    ])
    expect(f.sqlite.prepare("SELECT track_id FROM music_planet_tracks WHERE planet_id='other' AND is_primary=1").get()).toEqual({track_id:'last'})
  }
})

test('Galaxy excludes self in all classifications while retaining the same planet for another viewer', async () => {
  for (const by of ['genre','artist','song']) {
    const response = await galaxy({request:request(`/api/music/galaxy?by=${by}`),env:env()} as never)
    const body = await response.json() as any
    const ids=body.groups.flatMap((g:any)=>g.planets.map((p:any)=>p.planetId))
    expect(ids).toContain('other'); expect(ids).not.toContain('own')
  }
  const second=(await authenticatedMusicUser(new Request('https://music.test/'),env()))!
  const response=await galaxy({request:new Request('https://music.test/api/music/galaxy?by=song',{headers:{cookie:second.setCookie!.split(';')[0]}}),env:env()} as never)
  expect(JSON.stringify(await response.json())).toContain('own')
})

test('roam and song matching exclude self; stale Orbit self-cards are filtered on read', async () => {
  const discovery=await discoverPublicPlanets(env(),userId)
  expect(discovery.recommendations.map(p=>p.planetId)).toEqual(['other'])
  const matched=await portal({request:request('/api/music/song-portal?trackId=first'),env:env()} as never)
  const body=await matched.json() as any
  expect(body.matches.map((p:any)=>p.planetId)).toEqual(['other'])
  const date=new Date().toISOString().slice(0,10)
  for(const [position,id] of ['own','other'].entries()) {
    f.sqlite.prepare("INSERT INTO music_daily_roam(user_id,recommendation_date,planet_id,position,reason_code,match_score,created_at) VALUES(?,?,?,?, 'random',0,'now')").run(userId,date,id,position)
    f.sqlite.prepare("INSERT INTO music_song_encounters(visitor_user_id,planet_id,track_id,first_encountered_at,last_encountered_at) VALUES(?,?,'first','now','now')").run(userId,id)
  }
  const result=await orbit({request:request('/api/me/orbit'),env:env()} as never)
  const saved=await result.json() as any
  expect(saved.groups.dailyRoam).toEqual([])
  expect(saved.groups.songEncounters.map((p:any)=>p.planetId)).toEqual(['other'])
})
