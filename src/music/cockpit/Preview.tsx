/** Development-only, deterministic visual fixture. Never a production route or real-user data. */
import { useState } from 'react'
import { createMusicApi, type MusicFriendSatellite, type PublicMusicPlanet } from '../../music-api'
import { validateTrackSelection, type MusicTrackSummary } from '../../music-domain'
import { createDitherSpec, validateDitherOverrides, type DitherPlanetSpec } from '../dither/appearance'
import { genreArtwork } from '../genre-artwork'
import { AUDIUS_GENRES, DEFAULT_GALAXY_GENRES, normalizeGalaxyGenres } from '../genres'
import { normalizeGalaxySelections, type GalaxyPreferences } from '../galaxy-preferences'
import MusicApp from '../MusicApp'

const titles = ['夜航', '潮汐之间', '月面信号', '远岸', '午后的风', '纸飞机', '城市睡了', '小行星', '雨后', '日落慢车', '白噪声', '长街', '凌晨三点', '夏日来信', '回声之间', '蓝色出口']
const artistNames = ['星际旅人', '潮汐', '月面', '远岸', '树影', '飞行日记', '晚安电台', '银河漫步', '窗台', '落日信号', '空白频率', '路灯', '慢速列车', '海边来客', '山谷', '蓝鲸']
const previewGenres = ['Ambient', 'Alternative', 'Electronic', 'Folk', 'Jazz', 'Rock', 'Pop', 'Classical']
const timestamp = '2026-10-13T00:00:00.000Z'
const tracks: MusicTrackSummary[] = titles.map((title, i) => ({ id: `preview-song-${i}`, title,
  artistId: `preview-artist-${i}`, artistName: artistNames[i], versionLabel: '', genres: [previewGenres[i % previewGenres.length]], moodTags: ['calm'],
  officialUrl: null, coverUrl: null, durationSeconds: 180, visualFeatures: { source: 'demo' } }))
const artistOptions = tracks.map(track => ({ id: track.artistId, label: track.artistName }))
const songOptions = tracks.map(track => ({ id: track.id, label: `${track.title} · ${track.artistName}` }))
const makePlanet = (i: number): PublicMusicPlanet => ({ id: `preview-planet-${i}`, displayName: i === 0 ? '夜航者' : `回声 ${i}`,
  tagline: '把声音留在星球。', visibility: 'public', visualSchemaVersion: 3, appearanceRevision: 0,
  visual: createDitherSpec({ planetId: `preview-planet-${i}`, tracks: [tracks[i % tracks.length]], overrides: { motif: i % 2 ? 'flower' : 'flow' } }),
  tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: timestamp })),
  moments: [], createdAt: timestamp, updatedAt: timestamp })
const planets = Array.from({ length: 9 }, (_, i) => makePlanet(i + 1))
const friendSatellites: MusicFriendSatellite[] = Array.from({ length: 3 }, (_, i) => ({ id: `preview-friend-${i}`, displayName: `演示好友 ${i + 1}`,
  tagline: '只存在于本地预览。', visualSeed: `preview-friend-${i}`, orbitRadius: .24 + i * .06, orbitPhase: i * 2,
  isVirtual: true, canRemove: true, color: '#9d87ea' }))

/** A fresh in-memory identity per fixture; every request stays inside this fetcher. */
export function createCockpitPreviewApi(search = '') {
  const params = new URLSearchParams(search), firstRun = params.get('first-run') === '1'
  const rawDelay = Number(params.get('home-delay') ?? 0)
  const homeDelay = Number.isFinite(rawDelay) ? Math.max(0, Math.min(10000, rawDelay)) : 0
  let owner: PublicMusicPlanet | null = firstRun ? null : makePlanet(0)
  let preferences: GalaxyPreferences = { genres: [...DEFAULT_GALAXY_GENRES], availableGenres: [...AUDIUS_GENRES],
    artists: firstRun ? [] : artistOptions.slice(0, 4), songs: firstRun ? [] : songOptions.slice(0, 4) }
  return createMusicApi(async (request, init) => {
    const url = new URL(String(request), 'https://preview.test'), path = url.pathname, method = init?.method ?? 'GET'
    const error = (code: string, status = 400) => Response.json({ error: code }, { status })
    const readBody = (): Record<string, unknown> | null => {
      try {
        const body: unknown = JSON.parse(String(init?.body))
        return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null
      } catch { return null }
    }
    if (path === '/api/music/catalog' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase(), genre = url.searchParams.get('genre') ?? ''
      const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0)
      const matches = tracks.filter(track => (!q || `${track.title} ${track.artistName}`.toLowerCase().includes(q))
        && (!genre || track.genres.some(value => value.toLowerCase() === genre.toLowerCase())))
      const hasMore = offset + 24 < matches.length
      return Response.json({ tracks: matches.slice(offset, offset + 24), status: 'local', hasMore, nextOffset: hasMore ? offset + 24 : null })
    }
    if (path === '/api/me/music-planet') {
      if (method === 'GET' && homeDelay) await new Promise(resolve => setTimeout(resolve, homeDelay))
      if (method === 'POST') {
        if (owner) return error('PLANET_ALREADY_EXISTS', 409)
        const body = readBody(), selection = validateTrackSelection(body?.trackIds, 'create')
        if (!body || typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.trim().length > 40
          || typeof body.tagline !== 'string' || body.tagline.length > 120 || !['public', 'private'].includes(String(body.visibility))
          || !selection.ok || selection.trackIds.some(id => !tracks.some(track => track.id === id))) return error('INVALID_PLANET_DRAFT')
        if (params.get('create-fail') === '1') return error('PREVIEW_CREATE_FAILED', 503)
        const selected = selection.trackIds.map((id, position) => ({ ...tracks.find(track => track.id === id)!, position, isPrimary: position === 0, selectedAt: timestamp }))
        owner = { id: 'preview-planet-created', displayName: body.displayName.trim(), tagline: body.tagline.trim(), visibility: body.visibility as 'public' | 'private',
          visualSchemaVersion: 3, appearanceRevision: 0, visual: createDitherSpec({ planetId: 'preview-planet-created', tracks: selected }),
          tracks: selected, moments: [], createdAt: timestamp, updatedAt: timestamp }
        return Response.json({ planet: owner }, { status: 201 })
      }
      if (method === 'PATCH') {
        if (!owner) return error('PLANET_NOT_FOUND', 404)
        const patch = readBody()
        if (!patch) return error('INVALID_PLANET_DRAFT')
        const currentVisual = owner.visual as DitherPlanetSpec
        if (patch.appearanceOverrides) {
          const overrides = validateDitherOverrides(patch.appearanceOverrides)
          if (!overrides.ok) return error('INVALID_APPEARANCE_OVERRIDES')
          if (patch.appearanceRevision !== owner.appearanceRevision) return error('APPEARANCE_CONFLICT', 409)
          owner = { ...owner, visual: { ...currentVisual, overrides: overrides.value }, appearanceRevision: (owner.appearanceRevision ?? 0) + 1 }
        }
        if (typeof patch.displayName === 'string') owner.displayName = patch.displayName.trim()
        if (typeof patch.tagline === 'string') owner.tagline = patch.tagline.trim()
        if (patch.visibility === 'public' || patch.visibility === 'private') owner.visibility = patch.visibility
      }
      if (method === 'GET' || method === 'PATCH') return Response.json({ planet: owner, friendSatellites })
    }
    if (path === '/api/me/galaxy-preferences') {
      if (method === 'PATCH') {
        const body = readBody()
        if (!body || !Object.keys(body).length || Object.keys(body).some(key => !['genres', 'artists', 'songs'].includes(key))) return error('INVALID_GALAXY_PREFERENCES')
        const genres = 'genres' in body ? normalizeGalaxyGenres(body.genres) : preferences.genres
        const artists = 'artists' in body ? normalizeGalaxySelections(body.artists) : preferences.artists.map(option => option.id)
        const songs = 'songs' in body ? normalizeGalaxySelections(body.songs) : preferences.songs.map(option => option.id)
        if (!genres || !artists || !songs || artists.some(id => !artistOptions.some(option => option.id === id))
          || songs.some(id => !songOptions.some(option => option.id === id))) return error('INVALID_GALAXY_SELECTIONS')
        preferences = { genres, availableGenres: [...AUDIUS_GENRES], artists: artists.map(id => artistOptions.find(option => option.id === id)!), songs: songs.map(id => songOptions.find(option => option.id === id)!) }
      }
      if (method === 'GET' || method === 'PATCH') return Response.json(preferences)
    }
    if (path === '/api/music/galaxy-options' && method === 'GET') {
      const by = url.searchParams.get('by'), q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
      const rawOffset = url.searchParams.get('offset') ?? '0', offset = Number(rawOffset)
      if (!['artist', 'song'].includes(by ?? '') || q.length > 120 || /[\u0000-\u001f\u007f]/.test(q)
        || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > 10000) return error('INVALID_GALAXY_OPTIONS_QUERY')
      const options = (by === 'artist' ? artistOptions : songOptions).filter(option => !q || option.label.toLowerCase().includes(q))
      const hasMore = offset + 12 < options.length
      return Response.json({ options: options.slice(offset, offset + 12), hasMore, nextOffset: hasMore ? offset + 12 : null })
    }
    if (path === '/api/me/music-planet/moments' && method === 'GET') return Response.json({ moments: owner?.moments ?? [] })
    if (path === '/api/me/friend-satellites' && method === 'GET') return Response.json({ friendSatellites })
    if (path === '/api/music/galaxy' && method === 'GET') {
      const by = url.searchParams.get('by') ?? 'genre'
      const options = by === 'genre' ? preferences.genres.map(genre => ({ id: genre.toLowerCase(), label: genre })) : by === 'artist' ? preferences.artists : preferences.songs
      return Response.json({ by, groups: options.slice(0, 8).map((option, i) => ({ key: option.id, label: option.label, planetCount: 3,
        artwork: { ...genreArtwork(by === 'genre' ? option.label : previewGenres[i % previewGenres.length]), source: by === 'genre' ? 'genre-image' : by === 'artist' ? 'artist-album' : 'song-cover' },
        planets: planets.slice(i % 7, i % 7 + 3).map(planet => ({ planetId: planet.id, displayName: planet.displayName, tagline: planet.tagline, reasonCode: by === 'genre' ? 'same_genre' : by === 'artist' ? 'same_artist' : 'same_song', visualSchemaVersion: 3, visual: planet.visual, tracks: planet.tracks })) })) })
    }
    const planetRoute = path.match(/^\/api\/music\/planets\/([^/]+)(\/visit)?$/)
    if (planetRoute && (method === 'GET' && !planetRoute[2] || method === 'POST' && planetRoute[2])) {
      const planet = planets.find(value => value.id === decodeURIComponent(planetRoute[1]))
      return planet ? Response.json({ planet }) : error('PLANET_NOT_FOUND', 404)
    }
    if (path === '/api/me/social-settings' && method === 'GET') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    if (path === '/api/me/friend-requests' && method === 'GET') return Response.json({ incoming: [], outgoing: [], friends: [] })
    if (path === '/api/me/orbit' && method === 'GET') return Response.json({ date: '2026-10-13', groups: { songEncounters: [], friends: [], visitedByMe: [], visitorsToMe: [], dailyRoam: [] } })
    if (path === '/api/music/galaxy-content' && method === 'GET') return Response.json({ by: url.searchParams.get('by'), key: url.searchParams.get('key'), label: '演示星系', description: '用于验证星系内容面板的演示介绍。', tracks, hasMore: false, nextOffset: null, status: 'local' })
    if (path === '/api/music/discovery' && method === 'GET') return Response.json({ recommendations: planets.map(planet => ({ planetId: planet.id, displayName: planet.displayName, tagline: planet.tagline, reasonCode: 'similar_genre', matchScore: .5, visual: planet.visual })), ranking: { mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null } })
    if (path === '/api/music/song-portal' && method === 'GET') return Response.json({ trackId: url.searchParams.get('trackId'), matches: planets.slice(0, 3).map(planet => ({ planetId: planet.id, displayName: planet.displayName, tagline: planet.tagline, matchSource: 'active_selection', reasonCode: 'shared_song_selection', selectedAt: timestamp, latestPublicMomentAt: null, rankScore: null, visual: planet.visual })), ranking: { mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null } })
    return error('PREVIEW_NOT_IMPLEMENTED', 404)
  }, { liveSocial: false })
}

export default function CockpitPreview() {
  const [api] = useState(() => createCockpitPreviewApi(window.location.search))
  return <MusicApp apiOverride={api} firstRunStorageKey="mosic-preview-first-run-v1" />
}
