import { afterEach, expect, test } from 'vitest'
import { getMusicBeatClock, setMusicClockSource } from '../src/music/audio-clock'
import { COSMOS_BEAT } from '../src/music/default-track'

afterEach(() => setMusicClockSource(null))

test('the tide follows the currently playing track BPM, still spanning two beats', () => {
  const audio = { currentTime: .5, paused: false, ended: false } as HTMLAudioElement
  setMusicClockSource(audio, { bpm: 120, offsetSeconds: 0 })
  expect(getMusicBeatClock()).toMatchObject({ bpm: 60, cycles: .5, playing: true })
  setMusicClockSource(audio, { bpm: null, offsetSeconds: 0 })
  expect(getMusicBeatClock()).toBeUndefined()
})

test('a music tide completes one cycle every two song beats', () => {
  const audio = { currentTime: COSMOS_BEAT.offsetSeconds, paused: false, ended: false }
  setMusicClockSource(audio as HTMLAudioElement)
  expect(getMusicBeatClock()?.bpm).toBeCloseTo(COSMOS_BEAT.bpm / 2)
  for (const [beats, phase] of [[0, 0], [.5, .25], [1, .5], [1.5, .75], [2, 0], [3, .5], [4, 0]]) {
    audio.currentTime = COSMOS_BEAT.offsetSeconds + beats * 60 / COSMOS_BEAT.bpm
    expect(getMusicBeatClock()?.cycles).toBeCloseTo(phase)
  }
})

test('phase wraps before the beat offset and media playback state is preserved', () => {
  const audio = { currentTime: 0, paused: false, ended: false }
  setMusicClockSource(audio as HTMLAudioElement)
  expect(getMusicBeatClock()?.cycles).toBeCloseTo(1 - COSMOS_BEAT.offsetSeconds * COSMOS_BEAT.bpm / 120)
  expect(getMusicBeatClock()?.playing).toBe(true)
  audio.paused = true
  expect(getMusicBeatClock()?.playing).toBe(false)
  audio.paused = false
  audio.ended = true
  expect(getMusicBeatClock()?.playing).toBe(false)
})

test('no media source uses the scene fallback clock', () => {
  expect(getMusicBeatClock()).toBeUndefined()
})
