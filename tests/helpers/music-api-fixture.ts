import { readFileSync, existsSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

type D1Result = {
  success: true
  results: unknown[]
  meta: { changes: number; last_row_id: number | bigint }
}

function createD1Adapter(database: DatabaseSync): D1Database {
  const prepare = (sql: string): D1PreparedStatement => {
    let values: SQLInputValue[] = []
    const statement: Partial<D1PreparedStatement> = {
      bind(...bound: SQLInputValue[]) {
        values = bound
        return statement as D1PreparedStatement
      },
      async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
        const row = database.prepare(sql).get(...values) as Record<string, unknown> | undefined
        if (!row) return null
        if (columnName) return row[columnName] as T
        return row as T
      },
      async all<T = Record<string, unknown>>(): Promise<D1Result & { results: T[] }> {
        const results = database.prepare(sql).all(...values) as T[]
        return { success: true, results, meta: { changes: 0, last_row_id: 0 } }
      },
      async run<T = Record<string, unknown>>(): Promise<D1Result & { results: T[] }> {
        const result = database.prepare(sql).run(...values)
        return {
          success: true,
          results: [],
          meta: { changes: result.changes, last_row_id: result.lastInsertRowid },
        }
      },
      raw<T = unknown[]>(): Promise<T[]> {
        return this.all<T>() as unknown as Promise<T[]>
      },
    }
    return statement as D1PreparedStatement
  }

  return {
    prepare,
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result[]> {
      database.exec('BEGIN')
      try {
        const output: D1Result[] = []
        for (const statement of statements) output.push(await statement.run<T>() as D1Result)
        database.exec('COMMIT')
        return output
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
    async exec(query: string) {
      database.exec(query)
      return { count: 0, duration: 0 }
    },
    async dump() {
      return new ArrayBuffer(0)
    },
  } as D1Database
}

export function createMusicApiFixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'))

  const identityMigration = new URL('../../migrations/0008_music_access_identity.sql', import.meta.url)
  if (existsSync(identityMigration)) sqlite.exec(readFileSync(identityMigration, 'utf8'))
  const visitMigration = new URL('../../migrations/0009_music_planet_visits.sql', import.meta.url)
  if (existsSync(visitMigration)) sqlite.exec(readFileSync(visitMigration, 'utf8'))
  const orbitMigration = new URL('../../migrations/0010_music_orbit.sql', import.meta.url)
  if (existsSync(orbitMigration)) sqlite.exec(readFileSync(orbitMigration, 'utf8'))
  const emailAuthMigration = new URL('../../migrations/0011_music_email_auth.sql', import.meta.url)
  if (existsSync(emailAuthMigration)) sqlite.exec(readFileSync(emailAuthMigration, 'utf8'))
  const socialMigration = new URL('../../migrations/0012_music_social.sql', import.meta.url)
  if (existsSync(socialMigration)) sqlite.exec(readFileSync(socialMigration, 'utf8'))
  const driftBottleMigration = new URL('../../migrations/0013_music_drift_bottles.sql', import.meta.url)
  if (existsSync(driftBottleMigration)) sqlite.exec(readFileSync(driftBottleMigration, 'utf8'))
  const contentReportMigration = new URL('../../migrations/0014_music_content_reports.sql', import.meta.url)
  if (existsSync(contentReportMigration)) sqlite.exec(readFileSync(contentReportMigration, 'utf8'))
  const accountDeletionMigration = new URL('../../migrations/0015_music_account_deletion.sql', import.meta.url)
  if (existsSync(accountDeletionMigration)) sqlite.exec(readFileSync(accountDeletionMigration, 'utf8'))

  return {
    db: createD1Adapter(sqlite),
    sqlite,
    close: () => sqlite.close(),
  }
}

export function createMusicApiEnv(db: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    DB: db,
    CF_ACCESS_TEAM_DOMAIN: 'https://moodverse-test.cloudflareaccess.com',
    CF_ACCESS_AUD: 'music-api-test-audience',
    // Most API suites exercise the explicitly retained, test-only legacy auth
    // path. Production Wrangler config leaves this unset; email sessions are primary.
    MUSIC_ALLOW_LEGACY_ACCESS_AUTH: 'true',
    ...overrides,
  } as Env
}

export function insertCatalogTrack(
  database: DatabaseSync,
  track: { id: string; title?: string; artistName?: string; active?: boolean },
) {
  const now = '2026-09-29T00:00:00.000Z'
  database.prepare(`
    INSERT INTO music_track_catalog
      (id, title, artist_id, artist_name, provider, provider_track_id, official_url, is_active, created_at, updated_at)
    VALUES (?, ?, 'artist-1', ?, 'catalog', ?, ?, ?, ?, ?)
  `).run(
    track.id,
    track.title ?? `歌曲 ${track.id}`,
    track.artistName ?? '艺人',
    track.id,
    `https://music.example/track/${encodeURIComponent(track.id)}`,
    track.active === false ? 0 : 1,
    now,
    now,
  )
}
