import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'

const migrationSql = readFileSync(new URL('../migrations/0007_music_mvp_core.sql', import.meta.url), 'utf8')
const identityMigrationSql = readFileSync(new URL('../migrations/0008_music_access_identity.sql', import.meta.url), 'utf8')
const visitMigrationSql = readFileSync(new URL('../migrations/0009_music_planet_visits.sql', import.meta.url), 'utf8')
const orbitMigrationSql = readFileSync(new URL('../migrations/0010_music_orbit.sql', import.meta.url), 'utf8')
const emailAuthMigrationSql = readFileSync(new URL('../migrations/0011_music_email_auth.sql', import.meta.url), 'utf8')
const socialMigrationSql = readFileSync(new URL('../migrations/0012_music_social.sql', import.meta.url), 'utf8')
const driftBottleMigrationSql = readFileSync(new URL('../migrations/0013_music_drift_bottles.sql', import.meta.url), 'utf8')
const contentReportMigrationSql = readFileSync(new URL('../migrations/0014_music_content_reports.sql', import.meta.url), 'utf8')
const accountDeletionMigrationSql = readFileSync(new URL('../migrations/0015_music_account_deletion.sql', import.meta.url), 'utf8')
const schemaSql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')

function database() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

function createPreMusicDatabase() {
  const db = database()
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE planets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      theme TEXT NOT NULL,
      public_mood TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO users (id, token_hash, created_at, updated_at)
      VALUES ('owner-1', 'legacy-token-hash', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
    INSERT INTO planets (user_id, alias, theme, public_mood, updated_at)
      VALUES ('owner-1', '旧星球', 'study', 'calm', '2026-09-01T00:00:00Z');
  `)
  return db
}

function insertTrack(db: DatabaseSync, id: string) {
  db.prepare(`
    INSERT INTO music_track_catalog
      (id, title, artist_id, artist_name, provider, provider_track_id, official_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'catalog', ?, 'https://music.example/track', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')
  `).run(id, `歌曲 ${id}`, 'artist-1', '艺人', id)
}

function insertPlanet(db: DatabaseSync, id = 'music-planet-1', ownerId = 'owner-1') {
  db.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, created_at, updated_at)
    VALUES (?, ?, '我的音乐星球', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')
  `).run(id, ownerId)
}

function insertPlanetTrack(db: DatabaseSync, planetId: string, trackId: string, position: number, isPrimary = 0) {
  db.prepare(`
    INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
    VALUES (?, ?, ?, ?, '2026-09-01T00:00:00Z')
  `).run(planetId, trackId, position, isPrimary)
}

function tableNames(db: DatabaseSync) {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
    .map(({ name }) => name)
}

function musicSchemaObjects(db: DatabaseSync) {
  return db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_master
    WHERE name LIKE 'music_%'
    ORDER BY type, name
  `).all()
}

test('migration adds the music core without changing legacy user or planet records', () => {
  const db = createPreMusicDatabase()
  db.exec(migrationSql)
  db.exec(identityMigrationSql)
  db.exec(visitMigrationSql)
  db.exec(orbitMigrationSql)
  db.exec(emailAuthMigrationSql)
  db.exec(socialMigrationSql)
  db.exec(driftBottleMigrationSql)
  db.exec(contentReportMigrationSql)
  db.exec(accountDeletionMigrationSql)

  expect(tableNames(db)).toEqual(expect.arrayContaining([
    'users', 'planets', 'music_track_catalog', 'music_planets', 'music_planet_tracks', 'music_moments', 'music_ai_tasks',
    'music_access_identities',
    'music_planet_visits',
    'music_song_encounters', 'music_friendships', 'music_daily_roam',
    'music_auth_challenges', 'music_email_identities', 'music_auth_sessions',
    'music_social_preferences', 'music_friend_requests', 'music_user_blocks', 'music_direct_messages',
    'music_drift_preferences', 'music_drift_bottles', 'music_drift_deliveries', 'music_drift_comments', 'music_drift_comment_likes',
    'music_content_reports',
  ]))
  expect(db.prepare('SELECT alias, theme FROM planets WHERE user_id = ?').get('owner-1')).toEqual({
    alias: '旧星球',
    theme: 'study',
  })

  db.close()
})

test('music schema enforces one planet per owner, catalog references, five ordered tracks, and one primary track', () => {
  const db = createPreMusicDatabase()
  db.exec(migrationSql)
  insertPlanet(db)
  expect(() => insertPlanet(db, 'music-planet-2')).toThrow(/UNIQUE constraint failed/)

  for (let index = 1; index <= 6; index += 1) insertTrack(db, `track-${index}`)
  insertPlanetTrack(db, 'music-planet-1', 'track-1', 0, 1)
  expect(() => insertPlanetTrack(db, 'music-planet-1', 'track-1', 1)).toThrow(/UNIQUE constraint failed/)
  for (let index = 2; index <= 5; index += 1) {
    insertPlanetTrack(db, 'music-planet-1', `track-${index}`, index - 1)
  }
  expect(() => insertPlanetTrack(db, 'music-planet-1', 'track-6', 0)).toThrow(/MUSIC_TRACK_LIMIT/)
  expect(() => db.prepare(`
    UPDATE music_planet_tracks SET is_primary = 1 WHERE planet_id = 'music-planet-1' AND track_id = 'track-2'
  `).run()).toThrow(/UNIQUE constraint failed/)

  const missingTrackDb = createPreMusicDatabase()
  missingTrackDb.exec(migrationSql)
  insertPlanet(missingTrackDb)
  expect(() => insertPlanetTrack(missingTrackDb, 'music-planet-1', 'missing-track', 0)).toThrow(/FOREIGN KEY constraint failed/)

  db.close()
  missingTrackDb.close()
})

test('new planet and Moment visibility default to public while private Moments remain representable', () => {
  const db = createPreMusicDatabase()
  db.exec(migrationSql)
  insertTrack(db, 'track-1')
  insertPlanet(db)

  expect(db.prepare('SELECT visibility FROM music_planets WHERE id = ?').get('music-planet-1')).toEqual({ visibility: 'public' })

  db.prepare(`
    INSERT INTO music_moments (id, planet_id, track_id, content_text, created_at, updated_at)
    VALUES ('moment-public', 'music-planet-1', 'track-1', '今天的一刻', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')
  `).run()
  db.prepare(`
    INSERT INTO music_moments (id, planet_id, track_id, content_text, visibility, created_at, updated_at)
    VALUES ('moment-private', 'music-planet-1', 'track-1', '留给自己的文字', 'private', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')
  `).run()
  expect(db.prepare('SELECT id, visibility FROM music_moments ORDER BY id').all()).toEqual([
    { id: 'moment-private', visibility: 'private' },
    { id: 'moment-public', visibility: 'public' },
  ])

  db.close()
})

test('schema.sql mirrors the migration and deleting a music planet cascades through its dependent data', () => {
  const migratedDb = createPreMusicDatabase()
  migratedDb.exec(migrationSql)
  migratedDb.exec(identityMigrationSql)
  migratedDb.exec(visitMigrationSql)
  migratedDb.exec(orbitMigrationSql)
  migratedDb.exec(emailAuthMigrationSql)
  migratedDb.exec(socialMigrationSql)
  migratedDb.exec(driftBottleMigrationSql)
  migratedDb.exec(contentReportMigrationSql)
  migratedDb.exec(accountDeletionMigrationSql)

  const db = database()
  db.exec(schemaSql)
  expect(musicSchemaObjects(db)).toEqual(musicSchemaObjects(migratedDb))
  const names = tableNames(db)
  expect(names).toEqual(expect.arrayContaining([
    'music_track_catalog', 'music_planets', 'music_planet_tracks', 'music_moments', 'music_ai_tasks', 'music_access_identities', 'music_planet_visits',
    'music_song_encounters', 'music_friendships', 'music_daily_roam',
    'music_auth_challenges', 'music_email_identities', 'music_auth_sessions',
    'music_social_preferences', 'music_friend_requests', 'music_user_blocks', 'music_direct_messages',
    'music_drift_preferences', 'music_drift_bottles', 'music_drift_deliveries', 'music_drift_comments', 'music_drift_comment_likes',
    'music_content_reports', 'music_account_deletion_codes',
  ]))

  db.prepare(`
    INSERT INTO users (id, token_hash, created_at, updated_at)
    VALUES ('owner-1', 'hash', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')
  `).run()
  db.prepare(`
    INSERT INTO planets (user_id, theme, public_mood, updated_at)
    VALUES ('owner-1', 'study', 'calm', '2026-09-01T00:00:00Z')
  `).run()
  for (let index = 1; index <= 6; index += 1) insertTrack(db, `track-${index}`)
  insertPlanet(db)
  expect(() => insertPlanetTrack(db, 'music-planet-1', 'missing-track', 0)).toThrow(/FOREIGN KEY constraint failed/)
  for (let index = 1; index <= 5; index += 1) {
    insertPlanetTrack(db, 'music-planet-1', `track-${index}`, index - 1, index === 1 ? 1 : 0)
  }
  expect(() => insertPlanetTrack(db, 'music-planet-1', 'track-6', 5)).toThrow(/MUSIC_TRACK_LIMIT/)
  expect(() => db.prepare(`
    UPDATE music_planet_tracks SET is_primary = 1 WHERE planet_id = 'music-planet-1' AND track_id = 'track-2'
  `).run()).toThrow(/UNIQUE constraint failed/)
  db.prepare(`
    INSERT INTO music_moments (id, planet_id, track_id, content_text, created_at, updated_at)
    VALUES ('moment-1', 'music-planet-1', 'track-1', '今天的一刻', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')
  `).run()
  db.prepare(`
    INSERT INTO music_ai_tasks
      (id, requester_user_id, planet_id, kind, status, model_name, model_version, schema_version, input_hash, created_at, updated_at)
    VALUES ('task-1', 'owner-1', 'music-planet-1', 'planet_composer', 'queued', 'qwen', '4b-q4', 1, 'hash', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')
  `).run()

  db.prepare('DELETE FROM music_planets WHERE id = ?').run('music-planet-1')
  expect(db.prepare('SELECT count(*) AS count FROM music_planet_tracks').get()).toEqual({ count: 0 })
  expect(db.prepare('SELECT count(*) AS count FROM music_moments').get()).toEqual({ count: 0 })
  expect(db.prepare('SELECT count(*) AS count FROM music_ai_tasks').get()).toEqual({ count: 0 })
  expect(db.prepare('SELECT count(*) AS count FROM music_planet_visits').get()).toEqual({ count: 0 })
  expect(db.prepare('SELECT count(*) AS count FROM music_song_encounters').get()).toEqual({ count: 0 })
  expect(db.prepare('SELECT count(*) AS count FROM music_daily_roam').get()).toEqual({ count: 0 })
  expect(db.prepare('SELECT count(*) AS count FROM music_friendships').get()).toEqual({ count: 0 })
  expect(db.prepare('SELECT alias FROM planets WHERE user_id = ?').get('owner-1')).toEqual({ alias: '我的星球' })

  db.close()
  migratedDb.close()
})
