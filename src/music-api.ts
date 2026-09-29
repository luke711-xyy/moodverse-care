import type { MusicTrackSummary, MomentVisibility } from './music-domain'

export type MusicPlanetVisual = {
  schemaVersion: number
  summary: string
  palette: { surface: string; ocean: string; accent: string }
  atmosphere: 'clear' | 'mist' | 'nebula' | 'starlit'
  motion: 'still' | 'drift' | 'flow' | 'pulse'
  particleDensity: number
}

export type MusicPlanetTrack = MusicTrackSummary & {
  position: number
  isPrimary: boolean
  selectedAt: string
}

export type MusicPlanet = {
  id: string
  displayName: string
  tagline: string
  visibility: 'public' | 'private'
  visualSchemaVersion: number
  visual: MusicPlanetVisual | Record<string, unknown>
  createdAt: string
  updatedAt: string
  tracks: MusicPlanetTrack[]
}

export type MusicMoment = {
  id: string
  trackId: string
  track: MusicTrackSummary
  contentText: string
  photoUrl: string | null
  visibility: MomentVisibility
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PlanetComposerTask = {
  id: string
  kind?: 'planet_composer'
  status: 'queued' | 'running' | 'succeeded' | 'failed'
}

export type MusicPlanetDraft = {
  displayName: string
  tagline: string
  trackIds: string[]
  visibility: 'public' | 'private'
}

export type MusicMomentDraft = {
  trackId: string
  contentText: string
  visibility: MomentVisibility
}

export class MusicApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
    this.name = 'MusicApiError'
  }
}

function errorCode(value: unknown) {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
    ? value.error
    : 'REQUEST_FAILED'
}

export function createMusicApi(fetcher: typeof fetch = fetch) {
  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(url, {
      ...init,
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    if (!response.ok) throw new MusicApiError(response.status, errorCode(payload))
    return payload as T
  }

  return {
    async loadHome() {
      const [catalog, owned] = await Promise.all([
        request<{ tracks: MusicTrackSummary[] }>('/api/music/catalog'),
        request<{ planet: MusicPlanet | null }>('/api/me/music-planet'),
      ])
      return { tracks: catalog.tracks, planet: owned.planet }
    },
    async loadMoments() {
      const response = await request<{ moments: MusicMoment[] }>('/api/me/music-planet/moments')
      return response.moments
    },
    createPlanet(draft: MusicPlanetDraft) {
      return request<{ planet: MusicPlanet; compositionTask?: PlanetComposerTask }>('/api/me/music-planet', {
        method: 'POST', body: JSON.stringify(draft),
      })
    },
    createMoment(draft: MusicMomentDraft) {
      return request<{ moment: MusicMoment | null; compositionTask?: PlanetComposerTask }>('/api/me/music-planet/moments', {
        method: 'POST', body: JSON.stringify(draft),
      })
    },
    composePlanet() {
      return request<{ task: PlanetComposerTask }>('/api/me/music-planet/compose', { method: 'POST' })
    },
    getComposerTask(taskId: string) {
      return request<{ task: PlanetComposerTask & {
        model: { name: string; version: string }
        result: MusicPlanetVisual | null
        errorCode: string | null
      } }>(`/api/me/music-planet/ai-tasks/${encodeURIComponent(taskId)}`)
    },
  }
}

export type MusicApi = ReturnType<typeof createMusicApi>
