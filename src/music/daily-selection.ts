const DAY_MS = 86_400_000
const UTC8_MS = 8 * 60 * 60 * 1000

/** One shared calendar for the server and browser: Beijing/Singapore midnight. */
export function musicDayKey(now = Date.now()): string {
  return new Date(now + UTC8_MS).toISOString().slice(0, 10)
}

export function nextMusicDayAt(now = Date.now()): number {
  return (Math.floor((now + UTC8_MS) / DAY_MS) + 1) * DAY_MS - UTC8_MS
}

/** Seeded PRNG for selection only; never used for authentication or secrets. */
export function dailyRandom(seed: string): () => number {
  let state = 2166136261
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619)
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
