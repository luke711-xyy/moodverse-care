export type PlanetDraftValidation =
  | { ok: true }
  | { ok: false; reason: 'name-required' | 'name-too-long' | 'three-tracks-required' }

export type PlanetTrackToggle = { trackIds: string[]; limitReached: boolean }

export function togglePlanetTrack(trackIds: string[], trackId: string, limit = 3): PlanetTrackToggle {
  if (trackIds.includes(trackId)) {
    return { trackIds: trackIds.filter((id) => id !== trackId), limitReached: false }
  }
  if (trackIds.length >= limit) return { trackIds, limitReached: true }
  return { trackIds: [...trackIds, trackId], limitReached: false }
}

export function validatePlanetDraft(displayName: string, trackIds: string[]): PlanetDraftValidation {
  const name = displayName.trim()
  if (!name) return { ok: false, reason: 'name-required' }
  if (Array.from(name).length > 40) return { ok: false, reason: 'name-too-long' }
  if (trackIds.length !== 3 || new Set(trackIds).size !== 3 || trackIds.some((id) => !id.trim())) {
    return { ok: false, reason: 'three-tracks-required' }
  }
  return { ok: true }
}

export type MusicApiErrorKind = 'auth-required' | 'ai-unavailable' | 'request-failed'

export function classifyMusicApiError(status: number, code?: string): MusicApiErrorKind {
  if (status === 401 || code === 'UNAUTHENTICATED') return 'auth-required'
  if (status === 503 && code === 'AI_GATEWAY_NOT_CONFIGURED') return 'ai-unavailable'
  return 'request-failed'
}
