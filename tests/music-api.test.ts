import { describe, expect, test } from 'vitest'
import { createMusicApi, MusicApiError } from '../src/music-api'

const track = {
  id: 'track-a', title: '夜航', artistId: 'artist-a', artistName: '星际旅人', versionLabel: '',
  genres: ['ambient'], moodTags: ['calm'], officialUrl: 'https://music.example/a', coverUrl: null, durationSeconds: 215,
}

describe('music API client', () => {
  test('photo Moments use one multipart file without overriding its browser-generated boundary', async () => {
    const photo = new File(['photo'],'a.jpg',{type:'image/jpeg'})
    const api = createMusicApi(async (_input, init) => {
      expect(init?.body).toBeInstanceOf(FormData)
      expect(new Headers(init?.headers).has('content-type')).toBe(false)
      const form = init?.body as FormData
      expect(form.getAll('photo')).toHaveLength(1)
      expect((form.get('photo') as File).name).toBe('a.jpg')
      expect(form.get('contentText')).toBe('带照片的片刻')
      expect(init?.credentials).toBe('same-origin')
      return Response.json({moment:{id:'photo-moment'}},{status:201})
    })
    await expect(api.createMoment({trackId:'track-a',contentText:'带照片的片刻',visibility:'private',photo})).resolves.toEqual({moment:{id:'photo-moment'}})
  })
  test('loads the controlled catalog and the anonymous owner planet as separate resources', async () => {
    const api = createMusicApi(async (input) => {
      const path = new URL(input.toString(), 'https://moodverse.test').pathname
      return path === '/api/music/catalog'
        ? Response.json({ tracks: [track] })
        : Response.json({ planet: null, friendSatellites: [] })
    })

    await expect(api.loadHome()).resolves.toEqual({ tracks: [track], planet: null, friendSatellites: [] })
  })

  test('loads and owner-scoped removes a friend satellite', async () => {
    const requests: Array<{ path: string; method?: string }> = []
    const friend = {
      id: 'virtual-friend-0-owner', displayName: '小满', tagline: '沿着旋律散步。', color: '#77dec8',
      visualSeed: 'friend-mint', orbitRadius: .235, orbitPhase: .35, isVirtual: true, canRemove: true,
    }
    const api = createMusicApi(async (input, init) => {
      requests.push({
        path: new URL(input.toString(), 'https://moodverse.test').pathname,
        ...(init?.method ? { method: init.method } : {}),
      })
      return init?.method === 'DELETE'
        ? Response.json({ deleted: true })
        : Response.json({ friendSatellites: [friend] })
    })

    await expect(api.loadFriendSatellites()).resolves.toEqual({ friendSatellites: [friend] })
    await expect(api.deleteFriendSatellite(friend.id)).resolves.toEqual({ deleted: true })
    expect(requests).toEqual([
      { path: '/api/me/friend-satellites' },
      { path: '/api/me/friend-satellites/virtual-friend-0-owner', method: 'DELETE' },
    ])
  })

  test('surfaces an absent Cloudflare Access identity as a typed authorization error', async () => {
    const api = createMusicApi(async () => Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 }))

    await expect(api.loadHome()).rejects.toMatchObject({
      name: 'MusicApiError', status: 401, code: 'UNAUTHENTICATED',
    })
  })

  test('does not expose email login or account-deletion actions in the anonymous demo client', () => {
    const api = createMusicApi(async () => Response.json({}))

    expect('requestEmailCode' in api).toBe(false)
    expect('verifyEmailCode' in api).toBe(false)
    expect('logout' in api).toBe(false)
    expect('requestAccountDeletionCode' in api).toBe(false)
    expect('deleteAccount' in api).toBe(false)
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

  test('loads the moderator report queue with an explicit filter and reviews a report same-origin', async () => {
    const requests: Array<{ path: string; method?: string; body?: unknown }> = []
    const report = {
      id: 'report/a', target: { type: 'moment', id: 'moment-a' }, reason: 'privacy',
      detail: '请检查这条公开内容。', status: 'open', createdAt: '2026-10-01T08:00:00.000Z',
      lastReview: null,
    }
    const api = createMusicApi(async (input, init) => {
      requests.push({
        path: `${new URL(input.toString(), 'https://moodverse.test').pathname}${new URL(input.toString(), 'https://moodverse.test').search}`,
        ...(init?.method ? { method: init.method } : {}),
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
      })
      return init?.method === 'PATCH'
        ? Response.json({ report: { ...report, status: 'reviewing', lastReview: { fromStatus: 'open', toStatus: 'reviewing', reviewerUserId: 'reviewer-a', createdAt: '2026-10-01T08:05:00.000Z' } } })
        : Response.json({ reports: [report], hasMore: false })
    })

    await expect(api.loadReportQueue('open', 20, 40)).resolves.toEqual({ reports: [report], hasMore: false })
    await expect(api.reviewReport('report/a', 'reviewing')).resolves.toMatchObject({ report: { id: 'report/a', status: 'reviewing' } })
    expect(requests).toEqual([
      { path: '/api/admin/music-reports?status=open&limit=20&offset=40' },
      { path: '/api/admin/music-reports/report%2Fa', method: 'PATCH', body: { status: 'reviewing' } },
    ])
  })

  test('deletes a Moment through the owner-scoped endpoint', async () => {
    const requests: Array<{ path: string; method?: string }> = []
    const api = createMusicApi(async (input, init) => {
      requests.push({
        path: new URL(input.toString(), 'https://moodverse.test').pathname,
        ...(init?.method ? { method: init.method } : {}),
      })
      return Response.json({ deleted: true })
    })

    await expect(api.deleteMoment('moment/a')).resolves.toEqual({ deleted: true })
    expect(requests).toEqual([{ path: '/api/me/music-planet/moments/moment%2Fa', method: 'DELETE' }])
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
