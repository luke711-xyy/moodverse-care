import { authenticatedMusicUser, type Env } from '../../_shared'
import type { GalaxyGroup, GalaxyGroupBy, GalaxyPlanetCard } from '../../../src/music-api'
import { readPlanetDitherVisuals } from '../../_music-dither'
import { galaxySelectionOptions, readGalaxyGenres, readGalaxySelectionIds } from '../../_music-galaxy-preferences'
import { sampleGalaxyNodes } from '../../../src/music/galaxy-preferences'
import { dailyRandom, musicDayKey } from '../../../src/music/daily-selection'

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
  visual_json: string
}

type GroupAccumulator = {
  key: string
  label: string
  planets: Map<string, GalaxyPlanetCard>
}

const PLANETS_PER_GROUP = 16
export function sampleGalaxyPlanets<T>(values: T[], limit = PLANETS_PER_GROUP, random = Math.random): T[] {
  const sampled = [...values]
  // Uniform sampling without replacement; keep the sample for this response.
  for (let i = sampled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[sampled[i], sampled[j]] = [sampled[j], sampled[i]]
  }
  return sampled.slice(0, limit)
}
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
  const card: GalaxyPlanetCard = {
    planetId: row.planet_id,
    displayName: row.display_name,
    tagline: row.tagline,
    reasonCode,
  }
  group.planets.set(row.planet_id, card)
}

function groupRows(rows: PublicMusicRow[], by: GalaxyGroupBy, seed: string): GalaxyGroup[] {
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
    .map((group) => ({
      key: group.key,
      label: group.label,
      planetCount: group.planets.size,
      planets: sampleGalaxyPlanets([...group.planets.values()].sort((a, b) => a.planetId.localeCompare(b.planetId)), PLANETS_PER_GROUP, dailyRandom(`${seed}:planets:${group.key}`))
        .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.planetId.localeCompare(b.planetId)),
    }))
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  const byValue = new URL(request.url).searchParams.get('by') ?? 'genre'
  if (!['song', 'artist', 'genre'].includes(byValue)) return respond({ error: 'INVALID_GROUPING' }, 400)
  const by = byValue as GalaxyGroupBy
  const seed = `${musicDayKey()}:${identity?.userId ?? 'public'}:galaxy:${by}`

  const query = `
    SELECT * FROM (
    SELECT DISTINCT p.id AS planet_id, p.display_name, p.tagline, p.visual_json,
           c.id AS track_id, c.title, c.version_label, c.artist_id, c.artist_name, c.genres_json
    FROM music_planets p
    JOIN music_planet_tracks pt ON pt.planet_id = p.id
    JOIN music_track_catalog c ON c.id = pt.track_id
    WHERE p.visibility = 'public' AND c.is_active = 1
      AND (?1 IS NULL OR p.owner_user_id <> ?1)
      AND (?1 IS NULL OR NOT EXISTS (
        SELECT 1 FROM music_user_blocks b
        WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = p.owner_user_id)
           OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?1)
      ))
    UNION
    SELECT DISTINCT p.id AS planet_id, p.display_name, p.tagline, p.visual_json,
           c.id AS track_id, c.title, c.version_label, c.artist_id, c.artist_name, c.genres_json
    FROM music_moments m
    JOIN music_planets p ON p.id = m.planet_id
    JOIN music_track_catalog c ON c.id = m.track_id
    WHERE p.visibility = 'public' AND m.visibility = 'public'
      AND m.published_at IS NOT NULL AND c.is_active = 1
      AND (?1 IS NULL OR p.owner_user_id <> ?1)
      AND (?1 IS NULL OR NOT EXISTS (
        SELECT 1 FROM music_user_blocks b
        WHERE (b.blocker_user_id = ?1 AND b.blocked_user_id = p.owner_user_id)
           OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?1)
      ))
    ) ORDER BY planet_id, track_id LIMIT 5000 OFFSET ?2
  `
  const results: PublicMusicRow[] = []
  // Page the source pool instead of randomly truncating it before daily sampling.
  for (let offset = 0; ; offset += 5000) {
    const page = await env.DB.prepare(query).bind(identity?.userId ?? null, offset).all<PublicMusicRow>()
    results.push(...page.results)
    if (page.results.length < 5000) break
  }

  let groups = groupRows(results, by, seed)
  if (by === 'genre') {
    const genres = await readGalaxyGenres(env, identity?.userId)
    const map = new Map(groups.map(g => [g.key, g]))
    // Empty public sectors remain navigable; private planets are never manufactured to fill them.
    groups = genres.map(label => map.get(label.toLowerCase()) ?? { key: label.toLowerCase(), label, planetCount: 0, planets: [] })
  } else {
    const ids = await readGalaxySelectionIds(env, by, identity?.userId)
    if (ids.length) {
      const options = await galaxySelectionOptions(env, by, ids)
      const map = new Map(groups.map(g => [g.key, g]))
      groups = options.map(option => map.get(option.id) ?? { key: option.id, label: option.label, planetCount: 0, planets: [] })
    }
  }
  groups = sampleGalaxyNodes(groups, dailyRandom(`${seed}:nodes`))
  const shown = new Set(groups.flatMap((g) => g.planets.map((p) => p.planetId)))
  const rows = [...new Map(results.filter((r) => shown.has(r.planet_id)).map((r) => [r.planet_id, { id: r.planet_id, visual_json: r.visual_json }])).values()]
  const visuals = await readPlanetDitherVisuals(env, rows)
  for (const group of groups) for (const planet of group.planets) planet.visual = visuals.get(planet.planetId)
  const response = respond({ by, groups })
  if (identity?.setCookie) response.headers.set('set-cookie', identity.setCookie)
  return response
}
