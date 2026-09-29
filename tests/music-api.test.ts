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

    await expect(api.loadHome()).resolves.toEqual({ tracks: [track], planet: null })
  })

  test('surfaces an absent Cloudflare Access identity as a typed authorization error', async () => {
    const api = createMusicApi(async () => Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 }))

    await expect(api.loadHome()).rejects.toMatchObject({
      name: 'MusicApiError', status: 401, code: 'UNAUTHENTICATED',
    })
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
})
