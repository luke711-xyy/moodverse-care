import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes } from 'node:crypto'
import { createDitherSpec } from '../src/music/dither/appearance'
import { catalogTrack, type CatalogTrackRow } from '../functions/_music-dither'
import { DEFAULT_TRACK_ID } from '../src/music/default-track'
import { DEFAULT_GALAXY_GENRES } from '../src/music/genres'

type Row = Record<string, string | number | null>
type Scope = { table: string; where: string; columns: string[]; before: Row[]; after: Row[]; writable?: boolean }
const quote = (value: unknown): string => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`
const ident = (value: string) => `"${value.replaceAll('"', '""')}"`
const list = (ids: string[]) => ids.length ? ids.map(quote).join(',') : 'NULL'
const rows = (db: DatabaseSync, table: string, where = '1') => db.prepare(`SELECT * FROM ${ident(table)} WHERE ${where} ORDER BY 1`).all() as Row[]
const columns = (db: DatabaseSync, table: string) => (db.prepare(`PRAGMA table_info(${ident(table)})`).all() as Row[]).map(r => String(r.name))
const insert = (table: string, row: Row) => `INSERT INTO ${ident(table)}(${Object.keys(row).map(ident).join(',')}) VALUES(${Object.values(row).map(quote).join(',')});`
const canonical = (data: Row[]) => JSON.stringify(data.map(r => JSON.stringify(r)).sort())
const tableNames = (db: DatabaseSync) => (db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Row[]).map(r => String(r.name))
const open = (snapshot: string) => { const db = new DatabaseSync(':memory:'); db.exec(snapshot); db.exec('PRAGMA foreign_keys=ON; PRAGMA defer_foreign_keys=OFF;'); return db }

function assertValid(db: DatabaseSync) {
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key check failed')
  const bad = db.prepare(`SELECT p.id FROM music_planets p LEFT JOIN music_planet_tracks t ON t.planet_id=p.id
    GROUP BY p.id HAVING count(t.track_id) NOT BETWEEN 1 AND 5 OR sum(t.is_primary)<>1 OR count(DISTINCT t.track_id)<>count(t.track_id)`).all()
  if (bad.length) throw new Error(`Invalid planet track counts or primary songs (${bad.length} planets)`)
}

/** Offline only. All randomness is seeded, recorded and replayable; no provider fetches. */
export function generateCleanup(snapshot: string, options: { seed?: string; timestamp?: string } = {}) {
  const seed = options.seed ?? randomBytes(16).toString('hex'), timestamp = options.timestamp ?? new Date().toISOString()
  let counter = 0
  const random = () => createHash('sha256').update(`${seed}:${counter++}`).digest().readUInt32BE(0) / 4294967296
  const shuffle = <T>(values: T[]) => { const out = [...values]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] } return out }
  const db = open(snapshot)
  try {
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Snapshot has foreign key violations')
    const tables = tableNames(db), original = new Map(tables.map(table => [table, canonical(rows(db, table))]))
    const fakeWhere = `provider='moodverse-demo' AND id<>${quote(DEFAULT_TRACK_ID)}`
    const fake = rows(db, 'music_track_catalog', fakeWhere), fakeIds = fake.map(r => String(r.id)), fakeSet = new Set(fakeIds)
    const cosmos = rows(db, 'music_track_catalog', `id=${quote(DEFAULT_TRACK_ID)} AND is_active=1`)[0]
    if (!cosmos) throw new Error('Active Cosmos catalog entry is required')
    const demos = rows(db, 'music_planets', "owner_user_id LIKE 'demo:%' AND visibility='public'")
    const byGenre = new Map(DEFAULT_GALAXY_GENRES.map(genre => [genre, rows(db, 'music_track_catalog', `provider='audius' AND is_active=1 AND id GLOB 'audius:*' AND EXISTS(SELECT 1 FROM json_each(genres_json) WHERE value=${quote(genre)})`)
      .filter(r => /^audius:[a-zA-Z0-9]+$/.test(String(r.id)) && String(r.official_url).startsWith('https://'))]))
    if (demos.length) for (const [genre, candidates] of byGenre) if (candidates.length < 2) throw new Error(`Insufficient cached Audius tracks for ${genre}; need at least two`)
    const affected = rows(db, 'music_planets', `id IN(SELECT planet_id FROM music_planet_tracks WHERE track_id IN(${list(fakeIds)})) OR (owner_user_id LIKE 'demo:%' AND visibility='public')`)
    const ids = affected.map(r => String(r.id)), idSet = new Set(ids), demoSet = new Set(demos.map(r => String(r.id)))
    const unrelatedPlanets = canonical(rows(db, 'music_planets').filter(p => !idSet.has(String(p.id))))
    const scopes: Scope[] = []
    const scope = (table: string, where: string, writable = false) => { const before = rows(db, table, where); const value = { table, where, columns: columns(db, table), before, after: before, writable }; scopes.push(value); return value }
    scope('music_planets', `id IN(${list(ids)})`, true)
    scope('music_planet_tracks', `planet_id IN(${list(ids)}) OR track_id IN(${list(fakeIds)})`, true)
    scope('music_track_catalog', `(${fakeWhere}) OR id IN(${list(fakeIds)})`, true)
    // Schema changes can add cascading relationships. Refuse a snapshot prepared for another schema.
    const schemaScope = scope('sqlite_schema', "type IN('table','trigger','index') AND name NOT LIKE '_music_cleanup_%' AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV'")
    schemaScope.columns = ['type','name','tbl_name','sql']
    const references: { table: string; from: string }[] = []
    for (const table of tables) for (const fk of db.prepare(`PRAGMA foreign_key_list(${ident(table)})`).all() as Row[]) {
      if (fk.table === 'music_track_catalog' && table !== 'music_planet_tracks') {
        if (fk.to !== 'id') throw new Error(`Unsupported catalog foreign key in ${table}`)
        references.push({ table, from: String(fk.from) })
      }
      if (fk.table === 'music_planet_tracks') throw new Error(`Unexpected dependent table ${table}; review before replacing selections`)
    }
    const genreOrder = shuffle(DEFAULT_GALAXY_GENRES), assignments: { planetId: string; genre: string; trackIds: string[]; primaryId: string }[] = []
    const chosenCatalog = new Set<string>([DEFAULT_TRACK_ID])
    const shuffledDemos = shuffle(demos)
    for (const [i, planet] of shuffledDemos.entries()) {
      const genre = genreOrder[i % genreOrder.length], songs = shuffle(byGenre.get(genre)!).slice(0, 2)
      const trackIds = [DEFAULT_TRACK_ID, ...songs.map(r => String(r.id))], primaryId = String(songs[Math.floor(random() * songs.length)].id)
      assignments.push({ planetId: String(planet.id), genre, trackIds, primaryId })
      for (const id of trackIds) chosenCatalog.add(id)
      db.exec(`DELETE FROM music_planet_tracks WHERE planet_id=${quote(planet.id)};`)
      trackIds.forEach((id, position) => db.exec(insert('music_planet_tracks', { planet_id: planet.id, track_id: id, position, is_primary: +(id === primaryId), selected_at: timestamp })))
    }
    for (const planet of affected.filter(p => !demoSet.has(String(p.id)))) {
      db.exec(`DELETE FROM music_planet_tracks WHERE planet_id=${quote(planet.id)} AND track_id IN(${list(fakeIds)});`)
      const retained = rows(db, 'music_planet_tracks', `planet_id=${quote(planet.id)}`).sort((a,b) => Number(a.position) - Number(b.position))
      if (!retained.length) db.exec(insert('music_planet_tracks', { planet_id: planet.id, track_id: DEFAULT_TRACK_ID, position: 0, is_primary: 1, selected_at: timestamp }))
      else if (!retained.some(r => r.is_primary === 1)) db.exec(`UPDATE music_planet_tracks SET is_primary=1 WHERE planet_id=${quote(planet.id)} AND track_id=${quote(retained[0].track_id)};`)
    }
    // Preserve all catalog foreign-key history. Only unreferenced placeholders may be deleted.
    const deletedIds: string[] = [], retiredIds: string[] = []
    for (const track of fake) {
      const referenced = references.some(ref => db.prepare(`SELECT 1 FROM ${ident(ref.table)} WHERE ${ident(ref.from)}=? LIMIT 1`).get(track.id))
      if (referenced) { db.exec(`UPDATE music_track_catalog SET is_active=0,version_label='历史演示曲目（不可播放）',updated_at=${quote(timestamp)} WHERE id=${quote(track.id)};`); retiredIds.push(String(track.id)) }
      else { db.exec(`DELETE FROM music_track_catalog WHERE id=${quote(track.id)};`); deletedIds.push(String(track.id)) }
    }
    // Query-cache entries are metadata only. Invalidate only entries containing placeholder IDs.
    let invalidatedQueries = 0
    if (tables.includes('music_catalog_queries')) {
      const queryColumns = columns(db, 'music_catalog_queries')
      const jsonColumns = queryColumns.filter(c => c.endsWith('_json'))
      const hits = jsonColumns.flatMap(c => fakeIds.map(id => `EXISTS(SELECT 1 FROM json_tree(CASE WHEN json_valid(${ident(c)}) THEN ${ident(c)} ELSE 'null' END) WHERE atom=${quote(id)})`))
      if (hits.length) {
        if (!queryColumns.includes('query_key')) throw new Error('Unrecognized music catalog cache schema')
        const matching = rows(db, 'music_catalog_queries', hits.join(' OR '))
        const where = `query_key IN(${list(matching.map(r => String(r.query_key)))}) OR (${hits.join(' OR ')})`
        const cacheScope = scope('music_catalog_queries', where, true)
        invalidatedQueries = cacheScope.before.length
        if (invalidatedQueries) db.exec(`DELETE FROM music_catalog_queries WHERE ${where};`)
      }
    }
    for (const planet of affected) {
      const tracks = db.prepare('SELECT c.*,t.is_primary FROM music_planet_tracks t JOIN music_track_catalog c ON c.id=t.track_id WHERE t.planet_id=? ORDER BY t.position').all(planet.id) as (Row & CatalogTrackRow)[]
      for (const track of tracks) chosenCatalog.add(String(track.id))
      let previous: any
      try { previous = JSON.parse(String(planet.visual_json)) } catch { throw new Error(`Unreadable visual on affected planet ${planet.id}`) }
      const spec = createDitherSpec({ planetId: String(planet.id), tracks: tracks.map(r => ({ ...catalogTrack(r), isPrimary: r.is_primary === 1 })), previous,
        ...(previous?.overrides ? { overrides: previous.overrides } : {}) })
      const revision = Object.hasOwn(planet,'visual_revision') ? ',visual_revision=visual_revision+1' : ''
      const writeToken = Object.hasOwn(planet,'visual_write_token') ? `,visual_write_token=${quote(`audius-cleanup:${createHash('sha256').update(`${seed}:${timestamp}:${planet.id}`).digest('hex')}`)}` : ''
      db.exec(`UPDATE music_planets SET visual_json=${quote(JSON.stringify(spec))},visual_schema_version=3${revision}${writeToken}${Object.hasOwn(planet,'appearance_revision') ? ',appearance_revision=appearance_revision+1' : ''} WHERE id=${quote(planet.id)};`)
    }
    scope('music_track_catalog', `id IN(${list([...chosenCatalog].filter(id => !fakeSet.has(id)))})`)
    for (const entry of scopes) entry.after = rows(db, entry.table, entry.where)
    assertValid(db)
    for (const table of tables) {
      if (['music_planets','music_planet_tracks','music_track_catalog','music_catalog_queries'].includes(table)) continue
      if (canonical(rows(db, table)) !== original.get(table)) throw new Error(`Unexpected change to ${table}`)
    }
    if (canonical(rows(db, 'music_planets').filter(p => !idSet.has(String(p.id)))) !== unrelatedPlanets) throw new Error('Unrelated planet changed')
    const runId = createHash('sha256').update(`${seed}:${timestamp}:${snapshot}`).digest('hex').slice(0,16)
    const cleanupSql = releaseSql(scopes, references, deletedIds, runId, false)
    const rollbackSql = releaseSql(scopes, references, deletedIds, runId, true)
    // Independently replay exactly the files that will be sent to D1, then prove rollback equality.
    const replay = open(snapshot)
    try {
      replay.exec(cleanupSql); assertValid(replay)
      for (const table of tables) if (canonical(rows(replay, table)) !== canonical(rows(db, table))) throw new Error(`Generated SQL diverged in ${table}`)
      replay.exec(rollbackSql)
      if (replay.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Rollback foreign key check failed')
      for (const table of tables) if (canonical(rows(replay, table)) !== original.get(table)) throw new Error(`Rollback did not restore ${table}`)
    } finally { replay.close() }
    return { cleanupSql, rollbackSql, report: { validated: true, runId, seed, affectedPlanets: affected.length, publicDemoPlanets: demos.length, realOrPrivatePlanets: affected.length - demos.length,
      retiredTrackIds: retiredIds, deletedTrackIds: deletedIds, invalidatedQueries, preservedTables: tables.filter(t => !scopes.some(s => s.table === t && s.writable)),
      genreCounts: Object.fromEntries(DEFAULT_GALAXY_GENRES.map(g => [g, assignments.filter(a => a.genre === g).length])), assignments } }
  } finally { db.close() }
}

function releaseSql(scopes: Scope[], references: {table: string; from: string}[], deletedIds: string[], runId: string, rollback: boolean) {
  const name = `_music_cleanup_${runId}_${rollback ? 'undo' : 'apply'}`, stage = ident(name), trigger = ident(`${name}_run`)
  const from = rollback ? 'after' : 'before', to = rollback ? 'before' : 'after'
  const setup = [`-- Offline validated music cleanup ${runId}; ${rollback ? 'rollback' : 'apply'}. Treat this file as private.`,
    `CREATE TABLE ${stage}(scope INTEGER NOT NULL,phase TEXT NOT NULL,data TEXT NOT NULL);`]
  for (const [i, scope] of scopes.entries()) for (const phase of ['before','after'] as const) for (const row of scope[phase])
    setup.push(`INSERT INTO ${stage}(scope,phase,data) VALUES(${i},${quote(phase)},${quote(JSON.stringify(scope.columns.map(c => row[c])))});`)
  const body: string[] = []
  const conflict = (test: string) => body.push(`SELECT CASE WHEN ${test} THEN RAISE(ABORT,'CLEANUP_CONFLICT: snapshot changed; export and regenerate') END;`)
  for (const [i, scope] of scopes.entries()) {
    const live = `SELECT json_array(${scope.columns.map(ident).join(',')}) FROM ${ident(scope.table)} WHERE ${scope.where}`
    const expected = `SELECT data FROM ${stage} WHERE scope=${i} AND phase=${quote(from)}`
    conflict(`EXISTS(${live} EXCEPT ${expected}) OR EXISTS(${expected} EXCEPT ${live})`)
  }
  if (!rollback) for (const ref of references) conflict(`EXISTS(SELECT 1 FROM ${ident(ref.table)} WHERE ${ident(ref.from)} IN(${list(deletedIds)}))`)
  const scoped = (table: string) => scopes.map((scope, i) => ({scope,i})).filter(s => s.scope.table === table && s.scope.writable)
  const source = (i: number) => `${stage} WHERE scope=${i} AND phase=${quote(to)}`
  const values = (scope: Scope) => scope.columns.map((_,i) => `json_extract(data,'$[${i}]')`).join(',')
  const update = (scope: Scope, i: number, fields: string[]) => {
    const table = ident(scope.table), key = scope.columns.indexOf('id')
    return `UPDATE ${table} SET ${fields.map(f => `${ident(f)}=(SELECT json_extract(data,'$[${scope.columns.indexOf(f)}]') FROM ${source(i)} AND json_extract(data,'$[${key}]')=${table}.id)`).join(',')} WHERE (${scope.where}) AND EXISTS(SELECT 1 FROM ${source(i)} AND json_extract(data,'$[${key}]')=${table}.id);`
  }
  // Restore removed catalog rows before restoring selections. Never delete/reinsert historical catalog rows.
  for (const {scope,i} of scoped('music_track_catalog')) {
    const key = scope.columns.indexOf('id')
    if (rollback) body.push(`INSERT INTO music_track_catalog(${scope.columns.map(ident).join(',')}) SELECT ${values(scope)} FROM ${source(i)} AND NOT EXISTS(SELECT 1 FROM music_track_catalog WHERE id=json_extract(data,'$[${key}]'));`)
    body.push(update(scope, i, ['is_active','version_label','updated_at']))
  }
  for (const {scope,i} of scoped('music_planet_tracks')) {
    body.push(`DELETE FROM music_planet_tracks WHERE ${scope.where};`)
    body.push(`INSERT INTO music_planet_tracks(${scope.columns.map(ident).join(',')}) SELECT ${values(scope)} FROM ${source(i)};`)
  }
  if (!rollback) body.push(`DELETE FROM music_track_catalog WHERE id IN(${list(deletedIds)});`)
  for (const {scope,i} of scoped('music_planets')) {
    // Existing production trigger ignores a combined v3 -> legacy visual UPDATE.
    // Restore the schema marker first, within this same atomic statement, then the visual.
    if (rollback) body.push(update(scope, i, ['visual_schema_version']))
    body.push(update(scope, i, ['visual_json','visual_schema_version','visual_revision','visual_write_token','appearance_revision'].filter(c => scope.columns.includes(c))))
  }
  for (const {scope,i} of scoped('music_catalog_queries')) {
    body.push(`DELETE FROM music_catalog_queries WHERE ${scope.where};`)
    body.push(`INSERT INTO music_catalog_queries(${scope.columns.map(ident).join(',')}) SELECT ${values(scope)} FROM ${source(i)};`)
  }
  // A single trigger statement is atomic even if a CLI splits the surrounding setup statements.
  setup.push(`CREATE TRIGGER ${trigger} BEFORE INSERT ON ${stage} WHEN NEW.phase='run' BEGIN\n${body.join('\n')}\nEND;`)
  setup.push(`INSERT INTO ${stage}(scope,phase,data) VALUES(-1,'run','[]');`, `DROP TRIGGER ${trigger};`, `DROP TABLE ${stage};`)
  return setup.join('\n') + '\n'
}
