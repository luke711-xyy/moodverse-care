import { COSMOS_BEAT } from './default-track'

export const MUSIC_TIDE_BEATS_PER_CYCLE = 2
export type MusicBeatClock = { cycles: number; bpm: number; playing: boolean }
let source: HTMLAudioElement | null = null
export function setMusicClockSource(audio: HTMLAudioElement | null) { source = audio }
export function getMusicBeatClock(): MusicBeatClock | undefined {
  if (!source) return undefined
  // Divide before wrapping the phase so a tide spans two complete song beats.
  const bpm = COSMOS_BEAT.bpm / MUSIC_TIDE_BEATS_PER_CYCLE
  const cycles = (source.currentTime - COSMOS_BEAT.offsetSeconds) * bpm / 60
  return { cycles: ((cycles % 1) + 1) % 1, bpm, playing: !source.paused && !source.ended }
}
