import type { GalaxyGroupBy, MusicApi, MusicGalaxyResponse } from '../music-api'
import { musicDayKey } from './daily-selection'
import { loadAlbumTexture } from './dither/album-texture'
import { buildMusicGalaxySceneSystems } from './galaxy-scene'
import { genreArtwork } from './genre-artwork'
import { AUDIUS_GENRES } from './genres'

/** Start at app mount, including genres outside the user's current eight sectors. */
export function preloadGalaxyGenres() {
  for (const genre of AUDIUS_GENRES) loadAlbumTexture(genreArtwork(genre)?.url)
}

/** Per-app/account cache: prefetch must not change the visible classification. */
export function createGalaxyPreloader(api: Pick<MusicApi, 'loadGalaxy'>) {
  const charts = new Map<GalaxyGroupBy, { day: string; expires: number; response: Promise<MusicGalaxyResponse> }>()
  const load = (by: GalaxyGroupBy): Promise<MusicGalaxyResponse> => {
    const day = musicDayKey(), cached = charts.get(by)
    if (cached?.day === day && cached.expires > Date.now()) return cached.response
    const response = api.loadGalaxy(by).then(chart => {
      if (!Array.isArray(chart.groups)) throw new Error('Invalid Galaxy response')
      // Warm every central star, not just the two systems currently in the viewport.
      for (const system of buildMusicGalaxySceneSystems(chart.by, chart.groups)) loadAlbumTexture(system.starSpec?.coverTexture?.url)
      return chart
    }).catch(error => {
      if (charts.get(by)?.response === response) charts.delete(by)
      throw error
    })
    charts.set(by, { day, expires: Date.now() + 120_000, response })
    return response
  }
  return {
    load,
    warm() { for (const by of ['genre', 'song', 'artist'] as const) void load(by).catch(() => { /* Foreground retry remains available. */ }) },
    clear(by?: GalaxyGroupBy) { if (by) charts.delete(by); else charts.clear() },
  }
}
