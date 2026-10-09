/** Development-only, deterministic visual fixture. Never a production route or real-user data. */
import { createMusicApi } from '../../music-api'
import { createDitherSpec } from '../dither/appearance'
import MusicApp from '../MusicApp'
const tracks = ['夜航', '潮汐之间', '月面信号', '远岸'].map((title, i) => ({ id: `preview-song-${i}`, title,
  artistId: `preview-artist-${i}`, artistName: ['星际旅人', '潮汐', '月面', '远岸'][i], versionLabel: '',
  genres: [['ambient'], ['indie'], ['electronic'], ['folk']][i], moodTags: ['calm'],
  officialUrl: null, coverUrl: null, durationSeconds: 180, source: 'demo' }))
const makePlanet = (i: number) => ({ id: `preview-planet-${i}`, displayName: i === 0 ? '夜航者' : `回声 ${i}`,
  tagline: '把声音留在星球。', visibility: 'public', visualSchemaVersion: 3, appearanceRevision: 0,
  visual: createDitherSpec({ planetId: `preview-planet-${i}`, tracks: [tracks[i % 4]], overrides: { motif: i % 2 ? 'flower' : 'flow' } }),
  tracks: tracks.slice(0, 3).map((t, position) => ({ ...t, position, isPrimary: position === 0, selectedAt: '' })),
  moments: [], createdAt: '', updatedAt: '' })
let owner = makePlanet(0)
const planets = Array.from({ length: 9 }, (_, i) => makePlanet(i + 1))
const api = createMusicApi(async (request, init) => {
  const url = new URL(String(request), 'https://preview.test'), path = url.pathname
  if (path === '/api/music/catalog') return Response.json({ tracks })
  if (path === '/api/me/music-planet') {
    if (init?.method === 'PATCH') { const patch = JSON.parse(String(init.body)); owner = { ...owner, ...patch, visual: { ...owner.visual, overrides: patch.appearanceOverrides ?? owner.visual.overrides } } }
    return Response.json({ planet: owner, friendSatellites: Array.from({ length: 3 }, (_, i) => ({ id: `preview-friend-${i}`, displayName: `演示好友 ${i + 1}`, isVirtual: true, canRemove: true, color: '#9d87ea' })) })
  }
  if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
  if (path === '/api/music/galaxy') return Response.json({ by: url.searchParams.get('by') ?? 'genre', groups: tracks.map((t, i) => ({ key: t.id, label: t.genres[0], planetCount: 3,
    planets: planets.slice(i * 2, i * 2 + 3).map(p => ({ planetId: p.id, displayName: p.displayName, tagline: p.tagline, visualSchemaVersion: 3, visual: p.visual, tracks: p.tracks })) })) })
  if (path.endsWith('/visit')) return Response.json({ planet: planets.find(p => path.includes(p.id)) ?? planets[0] })
  if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true, updatedAt: '' })
  if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
  if (path === '/api/me/orbit') return Response.json({ date: '2026-10-09', groups: { songEncounters: [], friends: [], visitedByMe: [], visitorsToMe: [], dailyRoam: [] } })
  if (path === '/api/music/discovery') return Response.json({ recommendations: planets.slice(0,3).map(p=>({ planetId:p.id,displayName:p.displayName,tagline:p.tagline,reasonCode:'similar_genre',matchScore:.5,visual:p.visual })), ranking: { mode: 'rule', status: 'fallback' } })
  if (path === '/api/music/song-portal') return Response.json({ trackId:url.searchParams.get('trackId'),matches:planets.slice(0,3).map(p=>({ planetId:p.id,displayName:p.displayName,tagline:p.tagline,matchSource:'active_selection',reasonCode:'shared_song_selection',visual:p.visual })),ranking:{ mode:'rule',status:'fallback' } })
  return Response.json({ error: 'PREVIEW_NOT_IMPLEMENTED' }, { status: 404 })
})
export default function CockpitPreview() { return <MusicApp apiOverride={api} /> }
