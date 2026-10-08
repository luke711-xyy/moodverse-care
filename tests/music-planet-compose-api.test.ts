import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { onRequestPost } from '../functions/api/me/music-planet/compose'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'
import { isDitherSpec } from '../src/music/dither/appearance'

let fixture: ReturnType<typeof createMusicApiFixture>
beforeEach(() => { fixture = createMusicApiFixture() })
afterEach(() => { fixture.close(); vi.unstubAllGlobals() })
const env = () => createMusicApiEnv(fixture.db, { MUSIC_ALLOW_LEGACY_ACCESS_AUTH: 'false', MUSIC_AI_GATEWAY_URL: 'https://ai.example/v1/planet/compose' })

test('compatibility compose returns a deterministic spec without calling a model or scheduling work', async () => {
  fixture.sqlite.exec(`INSERT INTO users(id,token_hash,created_at,updated_at) VALUES('owner','hash','now','now');
    INSERT INTO music_planets(id,owner_user_id,display_name,created_at,updated_at) VALUES('planet','owner','旧星球','now','now');`)
  insertCatalogTrack(fixture.sqlite, { id: 'song' })
  fixture.sqlite.exec(`INSERT INTO music_planet_tracks(planet_id,track_id,position,is_primary,selected_at) VALUES('planet','song',0,1,'now')`)
  // Identity is supplied through the existing anonymous-cookie session contract.
  const { authenticatedMusicUser } = await import('../functions/_shared')
  const identity = await authenticatedMusicUser(new Request('https://moodverse.test/'), env())
  fixture.sqlite.prepare('UPDATE music_planets SET owner_user_id=? WHERE id=?').run(identity!.userId, 'planet')
  const pending = vi.fn(), fetch = vi.fn(() => { throw new Error('no network allowed') })
  vi.stubGlobal('fetch', fetch)
  const response = await onRequestPost({ request: new Request('https://moodverse.test/api/me/music-planet/compose', { method: 'POST', headers: { cookie: identity!.setCookie!.split(';')[0], Origin: 'https://moodverse.test' } }), env: env(), waitUntil: pending } as never)
  const body = await response.json() as any
  expect(response.status).toBe(200)
  expect(body.mode).toBe('deterministic')
  expect(isDitherSpec(body.visual)).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
  expect(pending).not.toHaveBeenCalled()
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_ai_tasks').get()).toEqual({ count: 0 })
})

test('legacy appearance workers cannot replace an already saved v3 visual', () => {
  fixture.sqlite.exec(`INSERT INTO users(id,token_hash,created_at,updated_at) VALUES('owner','hash','now','now');
    INSERT INTO music_planets(id,owner_user_id,display_name,visual_schema_version,visual_json,created_at,updated_at)
    VALUES('planet','owner','星球',3,'{"schemaVersion":3,"sentinel":"new"}','now','now');`)
  const result = fixture.sqlite.prepare('UPDATE music_planets SET visual_schema_version=2,visual_json=? WHERE id=?').run('{"summary":"late result"}', 'planet')
  expect(result.changes).toBe(0)
  expect(fixture.sqlite.prepare('SELECT visual_schema_version,visual_json FROM music_planets').get()).toEqual({ visual_schema_version: 3, visual_json: '{"schemaVersion":3,"sentinel":"new"}' })
})

test('compatibility endpoint does not mutate another user planet', async () => {
  fixture.sqlite.exec(`INSERT INTO users(id,token_hash,created_at,updated_at) VALUES('owner','hash','now','now');
    INSERT INTO music_planets(id,owner_user_id,display_name,created_at,updated_at) VALUES('planet','owner','旧星球','now','now');`)
  const response = await onRequestPost({ request: new Request('https://moodverse.test/api/me/music-planet/compose', { method: 'POST', headers: { Origin: 'https://moodverse.test' } }), env: env() } as never)
  expect(response.status).toBe(404)
  expect(fixture.sqlite.prepare('SELECT visual_json FROM music_planets').get()).toEqual({ visual_json: '{}' })
})
