import { describe, expect, test } from 'vitest'
import { classifyMusicApiError, togglePlanetTrack, validatePlanetDraft } from '../src/music-app-domain'

describe('planet track selection', () => {
  test('prevents choosing a fourth song and keeps the three existing selections intact', () => {
    expect(togglePlanetTrack(['a', 'b', 'c'], 'd')).toEqual({
      trackIds: ['a', 'b', 'c'],
      limitReached: true,
    })
  })

  test('removing a selected song frees one slot for another song', () => {
    const removed = togglePlanetTrack(['a', 'b', 'c'], 'b')
    expect(removed).toEqual({ trackIds: ['a', 'c'], limitReached: false })
    expect(togglePlanetTrack(removed.trackIds, 'd')).toEqual({
      trackIds: ['a', 'c', 'd'],
      limitReached: false,
    })
  })
})

describe('new planet draft validation', () => {
  test('requires a nonblank name and exactly three distinct tracks', () => {
    expect(validatePlanetDraft('   ', ['a', 'b', 'c'])).toEqual({ ok: false, reason: 'name-required' })
    expect(validatePlanetDraft('夜航者', ['a', 'b'])).toEqual({ ok: false, reason: 'three-tracks-required' })
    expect(validatePlanetDraft('夜航者', ['a', 'a', 'c'])).toEqual({ ok: false, reason: 'three-tracks-required' })
    expect(validatePlanetDraft('夜航者', ['a', 'b', 'c'])).toEqual({ ok: true })
  })

  test('rejects names that exceed the API character limit', () => {
    expect(validatePlanetDraft('夜'.repeat(41), ['a', 'b', 'c'])).toEqual({ ok: false, reason: 'name-too-long' })
  })
})

describe('music API errors', () => {
  test('recognizes missing Cloudflare Access identity separately from service failures', () => {
    expect(classifyMusicApiError(401, 'UNAUTHENTICATED')).toBe('access-required')
    expect(classifyMusicApiError(503, 'AI_GATEWAY_NOT_CONFIGURED')).toBe('ai-unavailable')
    expect(classifyMusicApiError(503, 'SERVICE_UNAVAILABLE')).toBe('request-failed')
  })
})
