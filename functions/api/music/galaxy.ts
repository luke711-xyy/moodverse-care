import { authenticatedMusicUser, type Env } from '../../_shared'
import type { GalaxyGroup, GalaxyGroupBy, GalaxyPlanetCard } from '../../../src/music-api'

type PublicMusicRow = {
  planet_id: string
  display_name: string
  tagline: string
  track_id: string
  title: string
  version_label: string
  artist_id: string
  artist_name: string
  genres_json: string
}

type GroupAccumulator = {
  key: string
  label: string
  planets: Map<string, GalaxyPlanetCard>
}

const GROUP_LIMIT = 40
const PLANETS_PER_GROUP = 20

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

function parsedGenres(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    return parsed.flatMap((item) => {
      if (typeof item !== 'string') return []
      const label = item.trim().slice(0, 48)
      const key = label.toLocaleLowerCase().replace(/\s+/g, ' ')
      if (!label || seen.has(key)) return []
      seen.add(key)
      return [{ key, label }]
    })
  } catch {
    return []
  }
}

function addPlanet(group: GroupAccumulator, row: PublicMusicRow, reasonCode: GalaxyPlanetCard['reasonCode']) {
  group.planets.set(row.planet_id, {
    planetId: row.planet_id,
    displayName: row.display_name,
    tagline: row.tagline,
    reasonCode,
  })
}

function groupRows(rows: PublicMusicRow[], by: GalaxyGroupBy): GalaxyGroup[] {
  const groups = new Map<string, GroupAccumulator>()
  for (const row of rows) {
    const targets: Array<{ key: string; label: string }> = by === 'song'
      ? [{ key: row.track_id, label: `${row.title}${row.version_label ? ` · ${row.version_label}` : ` · ${row.artist_name}`}` }]
      : by === 'artist'
        ? (row.artist_id.trim() && row.artist_name.trim() ? [{ key: row.artist_id, label: row.artist_name.trim() }] : [])
        : parsedGenres(row.genres_json)

    for (const target of targets) {
      if (!target.key.trim() || !target.label.trim()) continue
      let group = groups.get(target.key)
      if (!group) {
        group = { key: target.key, label: target.label, planets: new Map() }
        groups.set(target.key, group)
      }
      addPlanet(group, row, by === 'song' ? 'same_song' : by === 'artist' ? 'same_artist' : 'same_genre')
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.planets.size - a.planets.size || a.label.localeCompare(b.label) || a.key.localeCompare(b.key))
    .slice(0, GROUP_LIMIT)
    .map((group) => ({
      key: group.key,
      label: group.label,
      planetCount: group.planets.size,
      planets: [...group.planets.values()]
        .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.planetId.localeCompare(b.planetId))
        .slice(0, PLANETS_PER_GROUP),
    }))
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  const byValue = new URL(request.url).searchParams.get('by') ?? 'genre'
  if (!['song', 'artist', 'genre'].includes(byValue)) return respond({ error: 'INVALID_GROUPING' }, 400)
  const by = byValue as GalaxyGroupBy

  const { results } = await env.DB.prepare(`
    SELECT DISTINCT p.id AS planet_id, p.display_name, p.tagline,
           c.id AS track_id, c.title, c.version_label, c.artist_id, c.artist_name, c.genres_json
    FROM music_planets p
    JOIN music_planet_tracks pt ON pt.planet_id = p.id
    JOIN music_track_catalog c ON c.id = pt.track_id
    WHERE p.visibility = 'public' AND c.is_active = 1
      AND (?1 IS NULL OR NOT EXISTS (
        SELECT 1 FROM music_user_blocks b
        WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = p.owner_user_id)
           OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?1)
      ))
    UNION
    SELECT DISTINCT p.id AS planet_id, p.display_name, p.tagline,
           c.id AS track_id, c.title, c.version_label, c.artist_id, c.artist_name, c.genres_json
    FROM music_moments m
    JOIN music_planets p ON p.id = m.planet_id
    JOIN music_track_catalog c ON c.id = m.track_id
    WHERE p.visibility = 'public' AND m.visibility = 'public'
      AND m.published_at IS NOT NULL AND c.is_active = 1
      AND (?1 IS NULL OR NOT EXISTS (
        SELECT 1 FROM music_user_blocks b
        WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = p.owner_user_id)
           OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?1)
      ))
    LIMIT 5000
  `).bind(identity?.userId ?? null).all<PublicMusicRow>()

  return respond({ by, groups: groupRows(results, by) })
}
