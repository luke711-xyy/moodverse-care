import { describe, expect, test } from 'vitest'
import { canReadMoment, validateTrackSelection } from '../src/music-domain'

describe('validateTrackSelection', () => {
  test('creation accepts exactly three unique canonical IDs and trims surrounding whitespace', () => {
    expect(validateTrackSelection([' track-a ', 'track-b', 'track-c'], 'create')).toEqual({
      ok: true,
      trackIds: ['track-a', 'track-b', 'track-c'],
    })
  })

  test.each([['track-a', 'track-b'], ['track-a', 'track-b', 'track-c', 'track-d']])(
    'creation rejects a selection with the wrong number of tracks',
    (...trackIds) => {
      expect(validateTrackSelection(trackIds, 'create')).toEqual({ ok: false, error: 'INVALID_TRACK_COUNT' })
    },
  )

  test('updates accept both ends of the one-to-five active track range', () => {
    expect(validateTrackSelection(['track-a'], 'update')).toEqual({ ok: true, trackIds: ['track-a'] })
    expect(validateTrackSelection(['a', 'b', 'c', 'd', 'e'], 'update')).toEqual({
      ok: true,
      trackIds: ['a', 'b', 'c', 'd', 'e'],
    })
  })

  test.each([{ trackIds: [] }, { trackIds: ['a', 'b', 'c', 'd', 'e', 'f'] }])(
    'updates reject zero or more than five tracks',
    ({ trackIds }) => {
      expect(validateTrackSelection(trackIds, 'update')).toEqual({ ok: false, error: 'INVALID_TRACK_COUNT' })
    },
  )

  test.each([
    { trackIds: null },
    { trackIds: 'track-a' },
    { trackIds: ['track-a', '  ', 'track-c'] },
    { trackIds: ['track-a', 42, 'track-c'] },
  ])(
    'rejects malformed track ID input',
    ({ trackIds }) => {
      expect(validateTrackSelection(trackIds, 'create')).toEqual({ ok: false, error: 'INVALID_TRACK_SELECTION' })
    },
  )

  test('rejects duplicate IDs even when their surrounding whitespace differs', () => {
    expect(validateTrackSelection(['track-a', ' track-a ', 'track-c'], 'create')).toEqual({
      ok: false,
      error: 'DUPLICATE_TRACK_ID',
    })
  })
})

describe('canReadMoment', () => {
  test('owners can read both public and private Moments', () => {
    expect(canReadMoment('public', true)).toBe(true)
    expect(canReadMoment('private', true)).toBe(true)
  })

  test('visitors can read public Moments but never private Moments', () => {
    expect(canReadMoment('public', false)).toBe(true)
    expect(canReadMoment('private', false)).toBe(false)
  })
})
