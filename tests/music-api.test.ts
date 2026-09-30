import { describe, expect, test } from 'vitest'
import { createMusicApi, MusicApiError } from '../src/music-api'

const track = {
  id: 'track-a', title: '夜航', artistId: 'artist-a', artistName: '星际旅人', versionLabel: '',
  genres: ['ambient'], moodTags: ['calm'], officialUrl: 'https://music.example/a', coverUrl: null, durationSeconds: 215,
}

describe('music API client', () => {
  test('loads the controlled catalog and the Access-owned planet as separate resources', async () => {
    const api = createMusicApi(async (input) => {
      const path = new URL(input.toString(), 'https://moodverse.test').pathname
      return path === '/api/music/catalog'
        ? Response.json({ tracks: [track] })
        : Response.json({ planet: null })
    })

    await expect(api.loadHome()).resolves.toEqual({ tracks: [track], planet: null, isDemoAccount: false })
  })

  test('surfaces an absent Cloudflare Access identity as a typed authorization error', async () => {
    const api = createMusicApi(async () => Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 }))

    await expect(api.loadHome()).rejects.toMatchObject({
      name: 'MusicApiError', status: 401, code: 'UNAUTHENTICATED',
    })
  })

  test('sends an email code and verifies it through same-origin requests that retain the session cookie', async () => {
    const requests: Array<{ path: string; init?: RequestInit }> = []
    const api = createMusicApi(async (input, init) => {
      requests.push({ path: new URL(input.toString(), 'https://moodverse.test').pathname, init })
      return requests.at(-1)?.path.endsWith('/verify')
        ? Response.json({ authenticated: true, email: 'luna@example.com' })
        : Response.json({ ok: true })
    })

    await expect(api.requestEmailCode(' Luna@Example.com ')).resolves.toEqual({ ok: true })
    await expect(api.verifyEmailCode('Luna@example.com', '123456')).resolves.toEqual({
      authenticated: true, email: 'luna@example.com',
    })
    expect(requests.map(({ path }) => path)).toEqual(['/api/auth/email/request', '/api/auth/email/verify'])
    expect(requests.map(({ init }) => init?.credentials)).toEqual(['same-origin', 'same-origin'])
    expect(requests.map(({ init }) => JSON.parse(String(init?.body)))).toEqual([
      { email: ' Luna@Example.com ' }, { email: 'Luna@example.com', code: '123456' },
    ])
  })

  test('requests a step-up code and confirms irreversible account deletion with DELETE', async () => {
    const requests: Array<{ path: string; init?: RequestInit }> = []
    const api = createMusicApi(async (input, init) => {
      requests.push({ path: new URL(input.toString(), 'https://moodverse.test').pathname, init })
      return Response.json({ ok: true })
    })

    await expect(api.requestAccountDeletionCode()).resolves.toEqual({ ok: true })
    await expect(api.deleteAccount('123456', 'DELETE')).resolves.toEqual({ ok: true })
    expect(requests.map(({ path }) => path)).toEqual(['/api/me/account/deletion-code', '/api/me/account'])
    expect(requests.map(({ init }) => init?.method)).toEqual(['POST', 'DELETE'])
    expect(requests[1]?.init?.body).toBe(JSON.stringify({ code: '123456', confirmation: 'DELETE' }))
    expect(requests.every(({ init }) => init?.credentials === 'same-origin')).toBe(true)
  })

  test('creates a planet with three track IDs and preserves the queued composer task', async () => {
    const api = createMusicApi(async (input, init) => {
      expect(new URL(input.toString(), 'https://moodverse.test').pathname).toBe('/api/me/music-planet')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        displayName: '夜航者', tagline: '慢慢靠岸', trackIds: ['a', 'b', 'c'], visibility: 'public',
      })
      return Response.json({ planet: { id: 'planet-a' }, compositionTask: { id: 'task-a', status: 'queued' } }, { status: 201 })
    })

    await expect(api.createPlanet({
      displayName: '夜航者', tagline: '慢慢靠岸', trackIds: ['a', 'b', 'c'], visibility: 'public',
    })).resolves.toEqual({ planet: { id: 'planet-a' }, compositionTask: { id: 'task-a', status: 'queued' } })
  })

  test('loads and updates account preferences, planet visibility, and a Moment visibility', async () => {
    const requests: Array<{ path: string; method?: string; body?: unknown }> = []
    const api = createMusicApi(async (input, init) => {
      const path = new URL(input.toString(), 'https://moodverse.test').pathname
      requests.push({ path, ...(init?.method ? { method: init.method } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
      if (path === '/api/me/social-settings' && init?.method === 'PATCH') {
        return Response.json({ allowFriendRequests: false, allowDriftBottles: true })
      }
      if (path === '/api/me/social-settings') {
        return Response.json({ allowFriendRequests: true, allowDriftBottles: false })
      }
      if (path === '/api/me/music-planet/moments/moment%2Fa') {
        return Response.json({ moment: { id: 'moment/a', visibility: 'private' } })
      }
      return Response.json({ planet: { id: 'planet-a', visibility: 'private' } })
    })

    await expect(api.loadSocialSettings()).resolves.toEqual({ allowFriendRequests: true, allowDriftBottles: false })
    await expect(api.updateSocialSettings({ allowFriendRequests: false })).resolves.toEqual({ allowFriendRequests: false, allowDriftBottles: true })
    await expect(api.updateMusicPlanet({ visibility: 'private' })).resolves.toEqual({ planet: { id: 'planet-a', visibility: 'private' } })
    await expect(api.updateMoment('moment/a', { visibility: 'private' })).resolves.toEqual({ moment: { id: 'moment/a', visibility: 'private' } })
    expect(requests).toEqual([
      { path: '/api/me/social-settings' },
      { path: '/api/me/social-settings', method: 'PATCH', body: { allowFriendRequests: false } },
      { path: '/api/me/music-planet', method: 'PATCH', body: { visibility: 'private' } },
      { path: '/api/me/music-planet/moments/moment%2Fa', method: 'PATCH', body: { visibility: 'private' } },
    ])
  })

  test('posts a Moment with its chosen visibility and exposes an unavailable local-AI gateway code', async () => {
    const api = createMusicApi(async (input, init) => {
      const path = new URL(input.toString(), 'https://moodverse.test').pathname
      if (path === '/api/me/music-planet/moments' && JSON.parse(String(init?.body)).contentText === '今天想起这首歌') {
        return Response.json({ moment: { id: 'moment-a' } }, { status: 201 })
      }
      return Response.json({ error: 'AI_GATEWAY_NOT_CONFIGURED' }, { status: 503 })
    })

    await expect(api.createMoment({ trackId: 'a', contentText: '今天想起这首歌', visibility: 'public' }))
      .resolves.toEqual({ moment: { id: 'moment-a' } })
    await expect(api.composePlanet()).rejects.toBeInstanceOf(MusicApiError)
    await expect(api.composePlanet()).rejects.toMatchObject({ status: 503, code: 'AI_GATEWAY_NOT_CONFIGURED' })
  })

  test('loads exact-song matches and a public planet using encoded resource identifiers', async () => {
    const requested: string[] = []
    const api = createMusicApi(async (input) => {
      const url = new URL(input.toString(), 'https://moodverse.test')
      requested.push(`${url.pathname}${url.search}`)
      if (url.pathname === '/api/music/song-portal') {
        return Response.json({ trackId: 'track/a', ranking: { mode: 'stable_fallback', status: 'not_configured', model: null, taskId: null }, matches: [] })
      }
      return Response.json({ planet: { id: 'planet/a', tracks: [track], moments: [] } })
    })

    await expect(api.findSongMatches('track/a')).resolves.toMatchObject({ trackId: 'track/a', matches: [] })
    await expect(api.loadPublicPlanet('planet/a')).resolves.toMatchObject({ id: 'planet/a', moments: [] })
    expect(requested).toEqual([
      '/api/music/song-portal?trackId=track%2Fa',
      '/api/music/planets/planet%2Fa',
    ])
  })

  test('loads a public Galaxy using the requested discovery dimension', async () => {
    const requested: string[] = []
    const api = createMusicApi(async (input) => {
      const url = new URL(input.toString(), 'https://moodverse.test')
      requested.push(`${url.pathname}${url.search}`)
      return Response.json({ by: 'genre', groups: [{ key: 'ambient', label: 'ambient', planetCount: 1, planets: [] }] })
    })

    await expect(api.loadGalaxy('genre')).resolves.toMatchObject({ by: 'genre', groups: [{ key: 'ambient' }] })
    expect(requested).toEqual(['/api/music/galaxy?by=genre'])
  })

  test('loads all My Orbit groups and records visit origin without inferring a visit from discovery', async () => {
    const requested: Array<{ path: string; body?: unknown }> = []
    const api = createMusicApi(async (input, init) => {
      const url = new URL(input.toString(), 'https://moodverse.test')
      requested.push({ path: `${url.pathname}${url.search}`, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
      return url.pathname === '/api/me/orbit'
        ? Response.json({ date: '2026-09-30', groups: { songEncounters: [], friends: [], visitedByMe: [], visitorsToMe: [], dailyRoam: [] } })
        : Response.json({ planet: { id: 'planet-a' } })
    })

    await expect(api.loadOrbit()).resolves.toMatchObject({ date: '2026-09-30', groups: { songEncounters: [] } })
    await expect(api.visitPublicPlanet('planet-a', true, 'song_portal', 'track/a')).resolves.toEqual({ id: 'planet-a' })
    expect(requested).toEqual([
      { path: '/api/me/orbit' },
      { path: '/api/music/planets/planet-a/visit', body: { isIncognito: true, source: 'song_portal', trackId: 'track/a' } },
    ])
  })

  test('supports friend requests, blocking, and friend-only direct message API paths', async () => {
    const requested: Array<{ path: string; method?: string; body?: unknown }> = []
    const api = createMusicApi(async (input, init) => {
      const url = new URL(input.toString(), 'https://moodverse.test')
      requested.push({ path: `${url.pathname}${url.search}`, ...(init?.method ? { method: init.method } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
      if (url.pathname === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
      if (url.pathname === '/api/me/friend-requests/request-a') return Response.json({ requestId: 'request-a', status: 'accepted' })
      if (url.pathname === '/api/me/blocks') return Response.json({ ok: true })
      if (url.pathname === '/api/me/friends/friend%2Fa/messages' && init?.method === 'POST') return Response.json({ message: { id: 'message-a' } }, { status: 201 })
      if (url.pathname === '/api/me/friends/friend%2Fa/messages') return Response.json({ peerUserId: 'friend-a', messages: [] })
      return Response.json({ ok: true })
    })

    await expect(api.loadFriendRequests()).resolves.toEqual({ incoming: [], outgoing: [] })
    await api.createFriendRequest('planet/a')
    await api.respondFriendRequest('request-a', 'accept')
    await api.blockPlanet('planet/a')
    await expect(api.loadDirectMessages('friend/a')).resolves.toEqual({ peerUserId: 'friend-a', messages: [] })
    await api.sendDirectMessage('friend/a', '你好')
    expect(requested).toEqual([
      { path: '/api/me/friend-requests' },
      { path: '/api/me/friend-requests', method: 'POST', body: { planetId: 'planet/a' } },
      { path: '/api/me/friend-requests/request-a', method: 'PATCH', body: { action: 'accept' } },
      { path: '/api/me/blocks', method: 'POST', body: { planetId: 'planet/a' } },
      { path: '/api/me/friends/friend%2Fa/messages' },
      { path: '/api/me/friends/friend%2Fa/messages', method: 'POST', body: { contentText: '你好' } },
    ])
  })

  test('submits a bounded content report to the authenticated report endpoint', async () => {
    let submitted: unknown
    const api = createMusicApi(async (input, init) => {
      expect(new URL(input.toString(), 'https://moodverse.test').pathname).toBe('/api/me/reports')
      expect(init?.method).toBe('POST')
      submitted = JSON.parse(String(init?.body))
      return Response.json({ report: { id: 'report-a', status: 'open' } }, { status: 201 })
    })

    await expect(api.reportContent({ type: 'moment', id: 'moment/a' }, 'privacy', '请核查图片中的个人信息。'))
      .resolves.toMatchObject({ report: { id: 'report-a', status: 'open' } })
    expect(submitted).toEqual({ target: { type: 'moment', id: 'moment/a' }, reason: 'privacy', detail: '请核查图片中的个人信息。' })
  })
})
