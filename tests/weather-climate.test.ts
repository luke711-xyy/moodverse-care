import { expect, test } from 'vitest'

import { derivePlanetClimate, summarizePlanetWeather } from '../src/climate.ts'
import { resolveWeatherId, weatherLabel } from '../src/weather.ts'
import type { MoodId, WeatherSample } from '../src/types.ts'

function dateOffset(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function findDatePair(mood: MoodId, gap: number) {
  const start = '2026-01-01'
  for (let offset = 0; offset < 360; offset += 1) {
    const first = dateOffset(start, offset)
    const second = dateOffset(first, gap)
    if (resolveWeatherId('weather-test-planet', first, mood) === resolveWeatherId('weather-test-planet', second, mood)) {
      return { first, second, weather: resolveWeatherId('weather-test-planet', second, mood) }
    }
  }
  throw new Error(`No same-weather pair found for ${mood} at ${gap}-day gap`)
}

test('weather is deterministic per planet, date, and mood, independent of intensity', () => {
  const date = '2026-09-24'
  const first = resolveWeatherId('planet-42', date, 'anxious')
  expect(resolveWeatherId('planet-42', date, 'anxious')).toBe(first)
  const history = [{ date, mood: 'anxious' as const, intensity: 1 }]
  expect(derivePlanetClimate('planet-42', 'anxious', 1, history).currentWeather).toBe(first)
  expect(derivePlanetClimate('planet-42', 'anxious', 5, history).currentWeather).toBe(first)
})

test('a named weather streak is shown only after the same weather on adjacent days', () => {
  const { first, second, weather } = findDatePair('joy', 1)
  const history: WeatherSample[] = [
    { date: first, mood: 'joy', intensity: 2 },
    { date: second, mood: 'joy', intensity: 4 },
  ]

  const summary = summarizePlanetWeather('weather-test-planet', 'joy', 3, history)
  expect(summary.climate.weatherStreak).toBe(2)
  expect(summary.title).toBe(`连续${weatherLabel(weather)} 2 日`)
  expect(summary.detail).toBeTruthy()
})

test('a missing day resets the same-weather streak', () => {
  const { first, second, weather } = findDatePair('calm', 2)
  const history: WeatherSample[] = [
    { date: first, mood: 'calm', intensity: 3 },
    { date: second, mood: 'calm', intensity: 3 },
  ]

  const climate = derivePlanetClimate('weather-test-planet', 'calm', 3, history)
  expect(climate.currentWeather).toBe(weather)
  expect(climate.weatherStreak).toBe(1)
  expect(summarizePlanetWeather('weather-test-planet', 'calm', 3, history).title).toBe(weatherLabel(weather))
})
