import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MAX_TRACKS_PER_IMPORT = 500

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredText(value, field, maxLength = 500) {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required`)
  if (normalized.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters`)
  if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${field} contains control characters`)
  return normalized
}

function optionalText(value, field, maxLength = 500) {
  if (value === undefined || value === null || value === '') return null
  return requiredText(value, field, maxLength)
}

function textList(value, field) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 24) throw new Error(`${field} must be an array of at most 24 strings`)
  const normalized = value.map((item) => requiredText(item, field, 64))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${field} must not contain duplicates`)
  return normalized
}

function safeHttpsUrl(value, field, optional = false) {
  const text = optional ? optionalText(value, field, 2048) : requiredText(value, field, 2048)
  if (text === null) return null
  let url
  try {
    url = new URL(text)
  } catch {
    throw new Error(`${field} must be a valid HTTPS URL`)
  }
  if (url.protocol !== 'https:') throw new Error(`${field} must use HTTPS`)
  if (!url.hostname || url.username || url.password) throw new Error(`${field} must not contain credentials`)
  return url.href
}

export function normalizeMusicCatalogPayload(payload) {
  if (!isRecord(payload) || payload.version !== 1 || !Array.isArray(payload.tracks)) {
    throw new Error('catalog file must be an object with version: 1 and a tracks array')
  }
  if (payload.tracks.length === 0 || payload.tracks.length > MAX_TRACKS_PER_IMPORT) {
    throw new Error(`tracks must contain between 1 and ${MAX_TRACKS_PER_IMPORT} entries per import`)
  }

  const ids = new Set()
  const providerIds = new Set()
  return payload.tracks.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`tracks[${index}] must be an object`)
    const id = requiredText(raw.id, `tracks[${index}].id`, 160)
    const provider = requiredText(raw.provider, `tracks[${index}].provider`, 80)
    const providerTrackId = requiredText(raw.providerTrackId, `tracks[${index}].providerTrackId`, 200)
    const providerKey = `${provider}\u0000${providerTrackId}`
    if (ids.has(id) || providerIds.has(providerKey)) throw new Error(`duplicate track id or provider track id: ${id}`)
    ids.add(id)
    providerIds.add(providerKey)

    const isActive = raw.isActive === undefined ? true : raw.isActive
    if (typeof isActive !== 'boolean') throw new Error(`tracks[${index}].isActive must be a boolean`)
    const durationSeconds = raw.durationSeconds === undefined || raw.durationSeconds === null ? null : raw.durationSeconds
    if (durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 0)) {
      throw new Error(`tracks[${index}].durationSeconds must be a non-negative integer or null`)
    }

    return {
      id,
      title: requiredText(raw.title, `tracks[${index}].title`, 300),
      artistId: requiredText(raw.artistId, `tracks[${index}].artistId`, 160),
      artistName: requiredText(raw.artistName, `tracks[${index}].artistName`, 300),
      versionLabel: optionalText(raw.versionLabel, `tracks[${index}].versionLabel`, 160) ?? '',
      genres: textList(raw.genres, `tracks[${index}].genres`),
      moodTags: textList(raw.moodTags, `tracks[${index}].moodTags`),
      provider,
      providerTrackId,
      officialUrl: safeHttpsUrl(raw.officialUrl, `tracks[${index}].officialUrl`),
      coverUrl: safeHttpsUrl(raw.coverUrl, `tracks[${index}].coverUrl`, true),
      durationSeconds,
      isActive,
    }
  })
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlJson(value) {
  return sqlText(JSON.stringify(value))
}

export function buildMusicCatalogUpsertSql(tracks, now = new Date()) {
  const normalizedTracks = normalizeMusicCatalogPayload({ version: 1, tracks })
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('now must be a valid Date')
  const timestamp = now.toISOString()
  const values = normalizedTracks.map((track) => `  (${[
    sqlText(track.id),
    sqlText(track.title),
    sqlText(track.artistId),
    sqlText(track.artistName),
    sqlText(track.versionLabel),
    sqlJson(track.genres),
    sqlJson(track.moodTags),
    sqlText(track.provider),
    sqlText(track.providerTrackId),
    sqlText(track.officialUrl),
    track.coverUrl === null ? 'NULL' : sqlText(track.coverUrl),
    track.durationSeconds === null ? 'NULL' : String(track.durationSeconds),
    track.isActive ? '1' : '0',
    sqlText(timestamp),
    sqlText(timestamp),
  ].join(', ')})`).join(',\n')

  return `-- Generated by scripts/music-catalog-import.mjs. Review before applying to a staging D1 database.\nINSERT INTO music_track_catalog (\n  id, title, artist_id, artist_name, version_label, genres_json, mood_tags_json,\n  provider, provider_track_id, official_url, cover_url, duration_seconds, is_active, created_at, updated_at\n) VALUES\n${values}\nON CONFLICT(id) DO UPDATE SET\n  title = excluded.title,\n  artist_id = excluded.artist_id,\n  artist_name = excluded.artist_name,\n  version_label = excluded.version_label,\n  genres_json = excluded.genres_json,\n  mood_tags_json = excluded.mood_tags_json,\n  provider = excluded.provider,\n  provider_track_id = excluded.provider_track_id,\n  official_url = excluded.official_url,\n  cover_url = excluded.cover_url,\n  duration_seconds = excluded.duration_seconds,\n  is_active = excluded.is_active,\n  updated_at = excluded.updated_at;\n`
}

async function main(inputPath) {
  if (!inputPath || inputPath === '--help' || inputPath === '-h') {
    process.stderr.write('Usage: node scripts/music-catalog-import.mjs <versioned-catalog.json>\n')
    return
  }
  const payload = JSON.parse(await readFile(resolve(inputPath), 'utf8'))
  const tracks = normalizeMusicCatalogPayload(payload)
  process.stdout.write(buildMusicCatalogUpsertSql(tracks))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch((error) => {
    process.stderr.write(`Catalog import failed: ${error instanceof Error ? error.message : 'invalid input'}\n`)
    process.exitCode = 1
  })
}
