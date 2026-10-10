// Run with esbuild + node --test; kept outside Vitest's browser-oriented discovery.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { generateCleanup } from '../scripts/music-audius-cleanup'
import { DEFAULT_GALAXY_GENRES } from '../src/music/genres'
import { createDitherSpec } from '../src/music/dither/appearance'

const cosmos = 'local:the-mountain-cosmos'
const q = (x: string) => `'${x.replaceAll("'", "''")}'`
const options = { seed: 'cleanup-fixture', timestamp: '2026-10-09T00:00:00.000Z' }
function fixture() {
  const schema = readFileSync('migrations/0007_music_mvp_core.sql', 'utf8')
  const sql = ["CREATE TABLE users(id TEXT PRIMARY KEY);", schema,
    'ALTER TABLE music_planets ADD COLUMN appearance_revision INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE music_track_catalog ADD COLUMN visual_features_json TEXT;',
    'CREATE TABLE music_drift_bottles(id TEXT PRIMARY KEY, track_id TEXT REFERENCES music_track_catalog(id) ON DELETE CASCADE, content TEXT);']
  const track = (id: string, provider: string, genre = 'Ambient') => sql.push(`INSERT INTO music_track_catalog(id,title,artist_id,artist_name,provider,provider_track_id,official_url,genres_json,created_at,updated_at) VALUES(${q(id)},${q(id)},'artist','Artist',${q(provider)},${q(id)},'https://audius.co/artist/track',${q(JSON.stringify([genre]))},'old','old');`)
  track(cosmos, 'user-supplied')
  for (const id of ['fake:history', 'fake:delete', 'fake:bottle']) track(id, 'moodverse-demo')
  for (let g = 0; g < DEFAULT_GALAXY_GENRES.length; g++) for (let n = 0; n < 4; n++) track(`audius:G${g}N${n}`, 'audius', DEFAULT_GALAXY_GENRES[g])
  const planet = (id: string, owner: string, visibility: string, tracks: string[], primary = 0) => {
    const visual = createDitherSpec({ planetId: id, tracks: [], overrides: { pixelSize: 7, motif: 'flower' } })
    sql.push(`INSERT INTO users VALUES(${q(owner)}); INSERT INTO music_planets(id,owner_user_id,display_name,visibility,visual_json,created_at,updated_at) VALUES(${q(id)},${q(owner)},${q(id)},${q(visibility)},${q(JSON.stringify(visual))},'old','old');`)
    tracks.forEach((track, i) => sql.push(`INSERT INTO music_planet_tracks VALUES(${q(id)},${q(track)},${i},${+(i === primary)},'old');`))
  }
  for (let i = 0; i < 16; i++) planet(`demo${i}`, `demo:user:${i}`, 'public', [cosmos, 'fake:history'])
  planet('private-demo', 'demo:private', 'private', [cosmos, 'audius:G0N0'])
  planet('real-keep', 'real:keep', 'public', ['fake:delete', 'audius:G0N0', 'audius:G1N0'], 2)
  planet('real-promote', 'real:promote', 'public', ['fake:delete', 'audius:G0N1'])
  planet('real-empty', 'real:empty', 'public', ['fake:delete'])
  planet('real-untouched', 'real:untouched', 'public', ['audius:G3N1'])
  sql.push("INSERT INTO music_moments(id,planet_id,track_id,content_text,created_at,updated_at) VALUES('moment','demo0','fake:history','original history','old','old');")
  sql.push("INSERT INTO music_drift_bottles VALUES('bottle','fake:bottle','original bottle');")
  return sql.join('\n')
}
function open(sql: string) { const db = new DatabaseSync(':memory:'); db.exec(sql); db.exec('PRAGMA foreign_keys=ON;'); return db }
function rows(db: DatabaseSync, table: string, where = '1') { return db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY ${table === 'users' ? '1' : '1,2'}`).all() }
function state(db: DatabaseSync) { return ['users','music_planets','music_planet_tracks','music_track_catalog','music_moments','music_drift_bottles'].map(t => [t, rows(db,t)]) }

test('cleanup keeps history and user music, assigns balanced public demos, and exactly rolls back', () => {
  const snapshot = fixture(), db = open(snapshot), original = state(db)
  const untouched = rows(db, 'music_planets', "id IN ('private-demo','real-untouched')")
  const result = generateCleanup(snapshot, options)
  db.exec(result.cleanupSql)
  assert.deepEqual(rows(db, 'music_moments'), original[4][1])
  assert.deepEqual(rows(db, 'music_drift_bottles'), original[5][1])
  assert.deepEqual(rows(db, 'music_planets', "id IN ('private-demo','real-untouched')"), untouched)
  assert.equal(rows(db, 'music_track_catalog', "id='fake:delete'").length, 0)
  assert.equal(rows(db, 'music_track_catalog', "id='fake:history'")[0].is_active, 0)
  assert.equal(rows(db, 'music_track_catalog', "id='fake:bottle'")[0].is_active, 0)
  assert.deepEqual(rows(db, 'music_planet_tracks', "planet_id='real-keep'").map(r => [r.track_id, r.is_primary, r.selected_at]), [['audius:G0N0',0,'old'],['audius:G1N0',1,'old']])
  assert.equal(rows(db, 'music_planet_tracks', "planet_id='real-promote'")[0].is_primary, 1)
  assert.equal(rows(db, 'music_planet_tracks', "planet_id='real-empty'")[0].track_id, cosmos)
  const genreCounts = new Map<string, number>(), primaryTracks = new Set()
  for (let i = 0; i < 16; i++) {
    const tracks = rows(db, 'music_planet_tracks', `planet_id='demo${i}'`)
    assert.equal(tracks.length, 3)
    assert.equal(new Set(tracks.map(t => t.track_id)).size, 3)
    assert.ok(tracks.some(t => t.track_id === cosmos))
    assert.equal(tracks.filter(t => t.is_primary).length, 1)
    assert.notEqual(tracks.find(t => t.is_primary)!.track_id, cosmos)
    primaryTracks.add(tracks.find(t => t.is_primary)!.track_id)
    const audius = tracks.filter(t => t.track_id !== cosmos)
    const genre = JSON.parse(String(rows(db,'music_track_catalog',`id=${q(String(audius[0].track_id))}`)[0].genres_json))[0]
    genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1)
    assert.equal(JSON.parse(String(rows(db,'music_track_catalog',`id=${q(String(audius[1].track_id))}`)[0].genres_json))[0], genre)
    assert.deepEqual(JSON.parse(String(rows(db,'music_planets',`id='demo${i}'`)[0].visual_json)).overrides, { pixelSize: 7, motif: 'flower' })
  }
  assert.equal(genreCounts.size, 8)
  assert.ok([...genreCounts.values()].every(n => n === 2))
  assert.ok(primaryTracks.size > 1)
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
  db.exec(result.rollbackSql)
  assert.deepEqual(state(db), original)
  db.close()
})

test('cleanup atomically refuses changed selections, new fake references, and edited visuals', () => {
  const snapshot = fixture(), result = generateCleanup(snapshot, options)
  for (const edit of [
    "UPDATE music_planet_tracks SET selected_at='new edit' WHERE planet_id='real-keep';",
    "UPDATE music_planets SET visual_json='{}' WHERE id='demo0';",
    "INSERT INTO music_drift_bottles VALUES('new','fake:delete','new history');",
    "INSERT INTO music_planet_tracks VALUES('real-untouched','fake:delete',1,0,'new');",
  ]) {
    const db = open(snapshot); db.exec(edit); const before = state(db)
    assert.throws(() => db.exec(result.cleanupSql), /CLEANUP_CONFLICT/)
    assert.deepEqual(state(db), before)
    db.close()
  }
})

test('rollback refuses post-cleanup user edits and leaves unrelated new content intact', () => {
  const snapshot = fixture(), result = generateCleanup(snapshot, options), db = open(snapshot)
  db.exec(result.cleanupSql)
  db.exec("UPDATE music_planets SET tagline='new edit' WHERE id='demo1';")
  const edited = state(db)
  assert.throws(() => db.exec(result.rollbackSql), /CLEANUP_CONFLICT/)
  assert.deepEqual(state(db), edited)
  db.close()
  const clean = open(snapshot)
  clean.exec(result.cleanupSql)
  clean.exec("UPDATE music_planets SET tagline='unrelated edit' WHERE id='real-untouched';")
  clean.exec(result.rollbackSql)
  assert.equal(rows(clean, 'music_planets', "id='real-untouched'")[0].tagline, 'unrelated edit')
  clean.close()
})

test('insufficient cached genres fails before SQL can be published', () => {
  assert.throws(() => generateCleanup(fixture() + "DELETE FROM music_track_catalog WHERE genres_json='[\"Jazz\"]';", options), /cached.*Jazz/i)
})

test('production schema without appearance_revision still rebuilds visuals and rolls back', () => {
  const snapshot = fixture() + 'ALTER TABLE music_planets DROP COLUMN appearance_revision;'
  const result = generateCleanup(snapshot, options), db = open(snapshot), before = state(db)
  db.exec(result.cleanupSql)
  assert.equal(rows(db, 'music_planets', "id='demo0'")[0].visual_schema_version, 3)
  db.exec(result.rollbackSql)
  assert.deepEqual(state(db), before)
  db.close()
})

test('only fake-song query caches are invalidated and newer cache results block rollback', () => {
  const snapshot = fixture() + `CREATE TABLE music_catalog_queries(query_key TEXT PRIMARY KEY,track_ids_json TEXT NOT NULL,has_more INTEGER NOT NULL,fetched_at INTEGER NOT NULL);
    INSERT INTO music_catalog_queries VALUES('fake','["fake:delete"]',0,1),('real','["audius:G0N0"]',0,1);`
  const result = generateCleanup(snapshot, options), db = open(snapshot)
  db.exec(result.cleanupSql)
  assert.equal(rows(db,'music_catalog_queries').length, 1)
  assert.equal(rows(db,'music_catalog_queries')[0].query_key, 'real')
  db.exec("INSERT INTO music_catalog_queries VALUES('fake','[\"audius:G1N0\"]',0,2);")
  const before = state(db)
  assert.throws(() => db.exec(result.rollbackSql), /CLEANUP_CONFLICT/)
  assert.deepEqual(state(db), before)
  db.close()
})

test('rollback refuses a removed catalog ID recreated by another writer', () => {
  const snapshot = fixture(), result = generateCleanup(snapshot, options), db = open(snapshot)
  db.exec(result.cleanupSql)
  db.exec("INSERT INTO music_track_catalog(id,title,artist_id,artist_name,provider,provider_track_id,official_url,created_at,updated_at) VALUES('fake:delete','new real song','artist','Artist','user-supplied','new','https://example.com/real','new','new');")
  const before = state(db)
  assert.throws(() => db.exec(result.rollbackSql), /CLEANUP_CONFLICT/)
  assert.deepEqual(state(db), before)
  db.close()
})

test('visual writes advance production concurrency fields and rollback passes legacy-overwrite protection', () => {
  const snapshot = fixture() + `ALTER TABLE music_planets ADD COLUMN visual_revision INTEGER NOT NULL DEFAULT 4;
    ALTER TABLE music_planets ADD COLUMN visual_write_token TEXT DEFAULT 'previous';
    CREATE TRIGGER music_reject_legacy_visual_overwrite BEFORE UPDATE OF visual_json ON music_planets
    WHEN OLD.visual_schema_version>=3 AND NEW.visual_schema_version<3 BEGIN SELECT RAISE(IGNORE); END;`
  const result = generateCleanup(snapshot, options), db = open(snapshot), before = state(db)
  db.exec(result.cleanupSql)
  const planet = rows(db,'music_planets',"id='demo0'")[0]
  assert.equal(planet.visual_revision,5)
  assert.notEqual(planet.visual_write_token,'previous')
  db.exec(result.rollbackSql)
  assert.deepEqual(state(db), before)
  db.close()
})

test('schema guard ignores SQLite physical root pages', () => {
  const snapshot = fixture(), result = generateCleanup(snapshot, options)
  const db = open('CREATE TABLE dropped_before_release(x TEXT);' + snapshot)
  db.exec('DROP TABLE dropped_before_release;')
  db.exec(result.cleanupSql)
  assert.equal(rows(db, 'music_track_catalog', "id='fake:delete'").length, 0)
  db.close()
})

test('schema guard permits the D1 internal KV table omitted by exports', () => {
  const snapshot = fixture(), result = generateCleanup(snapshot, options), db = open(snapshot)
  db.exec('CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value BLOB);')
  db.exec("INSERT INTO _cf_KV VALUES('internal','untouched');")
  db.exec(result.cleanupSql)
  db.exec(result.rollbackSql)
  assert.equal(db.prepare("SELECT value FROM _cf_KV WHERE key='internal'").get()!.value, 'untouched')
  db.close()
})
