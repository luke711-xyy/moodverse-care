import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { oneSqlStatementPerLine } from '../functions/_music-demo-seed'

function applyOneLineStatements(database: DatabaseSync, path: URL) {
  const source = readFileSync(path, 'utf8')
  for (const statement of oneSqlStatementPerLine(source).split('\n').filter(Boolean)) database.exec(statement)
}

describe('staging demo SQL bootstrap', () => {
  it('removes standalone comments and puts each complete SQL statement on one line', () => {
    const result = oneSqlStatementPerLine(`
      -- staging-only note
      INSERT INTO demo_planets (
        id, tagline
      ) VALUES ('demo:one', 'quiet; and safe');
      UPDATE demo_planets
        SET tagline = 'still quiet'
        WHERE id = 'demo:one';
    `)

    expect(result.split('\n')).toEqual([
      "INSERT INTO demo_planets ( id, tagline ) VALUES ('demo:one', 'quiet; and safe')",
      "UPDATE demo_planets SET tagline = 'still quiet' WHERE id = 'demo:one'",
    ])
  })

  it('applies the entire fictional world to a fresh schema and adds real-account fixtures', () => {
    const database = new DatabaseSync(':memory:')
    database.exec('PRAGMA foreign_keys = ON')
    database.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
    applyOneLineStatements(database, new URL('../scripts/seed-music-demo-tracks.sql', import.meta.url))

    database.exec(`
      INSERT INTO users (id, token_hash, timezone, star_color, star_texture_webp, created_at, updated_at)
      VALUES ('fixture-owner', 'fixture-token', 'Asia/Shanghai', '#fff', '', datetime('now'), datetime('now'));
      INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, visual_schema_version, visual_json, created_at, updated_at)
      VALUES ('fixture-owner-planet', 'fixture-owner', 'Fixture Owner', 'hello', 'public', 2, '{}', datetime('now'), datetime('now'));
      INSERT INTO music_planet_tracks (planet_id, track_id, position, is_primary, selected_at)
      VALUES ('fixture-owner-planet', 'demo:shoreline-afterglow', 0, 1, datetime('now'));
    `)

    const worldSeed = new URL('../scripts/seed-music-demo-world.sql', import.meta.url)
    applyOneLineStatements(database, worldSeed)
    applyOneLineStatements(database, worldSeed)

    expect(database.prepare("SELECT count(*) AS value FROM music_planets WHERE owner_user_id LIKE 'demo:user:%' AND visibility = 'public'").get()).toMatchObject({ value: 24 })
    expect(database.prepare("SELECT count(*) AS value FROM music_planets WHERE owner_user_id LIKE 'demo:user:%' AND visibility = 'private'").get()).toMatchObject({ value: 2 })
    expect(database.prepare("SELECT count(*) AS value FROM music_planet_tracks WHERE planet_id LIKE 'demo:planet:%'").get()).toMatchObject({ value: 56 })
    expect(database.prepare("SELECT count(*) AS value FROM music_moments WHERE id LIKE 'demo:moment:%'").get()).toMatchObject({ value: 27 })
    expect(database.prepare("SELECT count(*) AS value FROM music_friendships WHERE user_a_id = 'fixture-owner' OR user_b_id = 'fixture-owner'").get()).toMatchObject({ value: 1 })
    expect(database.prepare("SELECT count(*) AS value FROM music_friend_requests WHERE recipient_user_id = 'fixture-owner' AND status = 'pending'").get()).toMatchObject({ value: 1 })
    expect(database.prepare("SELECT count(*) AS value FROM music_daily_roam WHERE user_id = 'fixture-owner'").get()).toMatchObject({ value: 6 })
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
