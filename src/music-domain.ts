export type TrackSelectionOperation = 'create' | 'update'

export type TrackSelectionError = 'INVALID_TRACK_SELECTION' | 'INVALID_TRACK_COUNT' | 'DUPLICATE_TRACK_ID'

export type TrackSelectionValidation =
  | { ok: true; trackIds: string[] }
  | { ok: false; error: TrackSelectionError }

export type MomentVisibility = 'public' | 'private'

/** Sourced metadata, never inferred from duration or an unauthorized audio stream. */
export type MusicVisualFeatures = {
  source: 'curated' | 'demo' | 'tag-derived' | 'unknown'
  tempoBpm?: number | null
  energy?: number
  hardness?: number
  acousticness?: number
}

export type MusicTrackSummary = {
  id: string
  title: string
  artistId: string
  artistName: string
  versionLabel: string
  genres: string[]
  moodTags: string[]
  officialUrl: string | null
  coverUrl: string | null
  durationSeconds: number | null
  /** True only for fictional, non-playable catalog rows used in isolated staging. */
  isDemo?: boolean
  visualFeatures?: MusicVisualFeatures
}

export function validateTrackSelection(trackIds: unknown, operation: TrackSelectionOperation): TrackSelectionValidation {
  if (!Array.isArray(trackIds)) return { ok: false, error: 'INVALID_TRACK_SELECTION' }

  const normalizedIds: string[] = []
  for (const trackId of trackIds) {
    if (typeof trackId !== 'string') return { ok: false, error: 'INVALID_TRACK_SELECTION' }
    const normalizedId = trackId.trim()
    if (!normalizedId) return { ok: false, error: 'INVALID_TRACK_SELECTION' }
    normalizedIds.push(normalizedId)
  }

  const expectedCount = operation === 'create' ? 3 : null
  const hasValidCount = expectedCount === null
    ? normalizedIds.length >= 1 && normalizedIds.length <= 5
    : normalizedIds.length === expectedCount
  if (!hasValidCount) return { ok: false, error: 'INVALID_TRACK_COUNT' }

  if (new Set(normalizedIds).size !== normalizedIds.length) {
    return { ok: false, error: 'DUPLICATE_TRACK_ID' }
  }

  return { ok: true, trackIds: normalizedIds }
}

export function canReadMoment(visibility: MomentVisibility, isOwner: boolean): boolean {
  if (visibility !== 'public' && visibility !== 'private') return false
  return isOwner || visibility === 'public'
}
