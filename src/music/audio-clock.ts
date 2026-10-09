import { COSMOS_BEAT } from './default-track'

export type MusicBeatClock = { cycles: number; bpm: number; playing: boolean }
let source: HTMLAudioElement | null = null
export function setMusicClockSource(audio: HTMLAudioElement | null) { source = audio }
export function getMusicBeatClock(): MusicBeatClock | undefined {
  if (!source) return undefined
  const cycles = (source.currentTime - COSMOS_BEAT.offsetSeconds) * COSMOS_BEAT.bpm / 60
  return { cycles: ((cycles % 1) + 1) % 1, bpm: COSMOS_BEAT.bpm, playing: !source.paused && !source.ended }
}
