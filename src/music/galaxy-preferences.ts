export type GalaxySelectionKind = 'artist' | 'song'
export type GalaxySelectionOption = { id: string; label: string }
export type GalaxyPreferences = { genres: string[]; availableGenres: string[]; artists: GalaxySelectionOption[]; songs: GalaxySelectionOption[] }
export type GalaxyPreferencesPatch = { genres?: string[]; artists?: string[]; songs?: string[] }
export type GalaxyOptionsPage = { options: GalaxySelectionOption[]; hasMore: boolean; nextOffset: number | null }
export const MAX_GALAXY_SELECTIONS = 64
export function normalizeGalaxySelections(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_GALAXY_SELECTIONS
    || value.some(id => typeof id !== 'string' || !id.length || id.length > 200 || id !== id.trim() || /[\u0000-\u001f\u007f]/.test(id))
    || new Set(value).size !== value.length) return null
  return value as string[]
}

/** Draw once when a response arrives, never during rendering or axis movement. */
export function sampleGalaxyNodes<T>(values: T[], random = Math.random): T[] {
  const sampled = [...values]
  if (sampled.length <= 8) return sampled
  for (let i = sampled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[sampled[i], sampled[j]] = [sampled[j], sampled[i]]
  }
  return sampled.slice(0, 8)
}
