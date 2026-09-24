import type { MoodId, WeatherId, WeatherSample } from './types'
import { WEATHER_CATALOG, resolveWeatherId, weatherLabel } from './weather'

export type PlanetClimateState = {
  coldness: number
  cloudCoverage: number
  cloudSpeed: number
  rain: number
  snow: number
  seaLevel: number
  vegetationHealth: number
  cloudyStreak: number
  sunnyStreak: number
  weatherStreak: number
  currentWeather: WeatherId
  lightning: number
  strikeRisk: number
  fire: boolean
  fireSeed: number
  wind: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function hash32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  return hash >>> 0
}

function newestPerDay(history: WeatherSample[]): WeatherSample[] {
  const perDay = new Map<string, WeatherSample>()
  for (const sample of history) {
    if (sample?.date && sample.mood && Number.isFinite(sample.intensity)) perDay.set(sample.date, sample)
  }
  return [...perDay.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-365)
}

function consecutiveTail(
  samples: WeatherSample[],
  planetId: string,
  predicate: (weather: ReturnType<typeof weatherAt>) => boolean,
): number {
  let count = 0
  let newerDate: string | undefined
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index]
    if (newerDate) {
      const gap = (Date.parse(`${newerDate}T00:00:00Z`) - Date.parse(`${sample.date}T00:00:00Z`)) / 86400000
      if (gap !== 1) break
    }
    const weather = weatherAt(planetId, sample)
    if (!predicate(weather)) break
    count += 1
    newerDate = sample.date
  }
  return count
}

function weatherAt(planetId: string, sample: WeatherSample) {
  return WEATHER_CATALOG[resolveWeatherId(planetId, sample.date, sample.mood)].features
}

function weatherIdAt(planetId: string, sample: WeatherSample): WeatherId {
  return resolveWeatherId(planetId, sample.date, sample.mood)
}

function sameWeatherStreak(samples: WeatherSample[], planetId: string, latestWeather: WeatherId): number {
  let count = 0
  let newerDate: string | undefined
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const sample = samples[index]
    if (newerDate) {
      const gap = (Date.parse(`${newerDate}T00:00:00Z`) - Date.parse(`${sample.date}T00:00:00Z`)) / 86400000
      if (gap !== 1) break
    }
    if (weatherIdAt(planetId, sample) !== latestWeather) break
    count += 1
    newerDate = sample.date
  }
  return count
}

export function derivePlanetClimate(
  planetId: string,
  currentMood: MoodId,
  intensity: number,
  history: WeatherSample[] = [],
): PlanetClimateState {
  const fallbackDate = new Date().toISOString().slice(0, 10)
  const samples = newestPerDay(history.length ? history : [{ date: fallbackDate, mood: currentMood, intensity }])
  const latest = samples.at(-1) ?? { date: fallbackDate, mood: currentMood, intensity }
  const currentWeather = weatherIdAt(planetId, latest)
  const current = WEATHER_CATALOG[currentWeather].features
  const normalizedIntensity = (Math.min(5, Math.max(1, intensity)) - 1) / 4
  const coldness = .38 + (hash32(`${planetId}:biome-temperature`) / 0xffff_ffff) * .58
  const coldFactor = clamp01((coldness - .48) / .5)
  const cloudyStreak = consecutiveTail(samples, planetId, (weather) => weather.clouds >= .7)
  const sunnyStreak = consecutiveTail(samples, planetId, (weather) => weather.sunshine >= .62)
  const weatherStreak = sameWeatherStreak(samples, planetId, currentWeather)

  let rainLoad = 0
  let weightTotal = 0
  let snowpack = 0
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[samples.length - 1 - index]
    const weather = weatherAt(planetId, sample)
    const weight = 0.78 ** index
    const sampleIntensity = (Math.min(5, Math.max(1, sample.intensity)) - 1) / 4
    rainLoad += weather.rain * (.62 + sampleIntensity * .38) * weight
    weightTotal += weight
  }
  rainLoad = weightTotal ? rainLoad / weightTotal : current.rain

  for (const sample of samples) {
    const weather = weatherAt(planetId, sample)
    const sampleIntensity = (Math.min(5, Math.max(1, sample.intensity)) - 1) / 4
    const dailySnow = (weather.snow + weather.rain * .16) * coldFactor * (.64 + sampleIntensity * .36)
    const melt = weather.sunshine >= .62 ? .12 : .025
    snowpack = clamp01(snowpack * (1 - melt) + dailySnow * .28)
  }

  const rain = current.rain * (.58 + normalizedIntensity * .42)
  const snow = clamp01(snowpack + current.snow * coldFactor * .11)
  const seaLevel = clamp01(rainLoad * .22 + rain * .06)
  const vegetationHealth = clamp01(
    .57 + Math.min(sunnyStreak, 5) * .075 - cloudyStreak * .105 - current.clouds * .045,
  )
  const lightning = current.lightning * (.52 + normalizedIntensity * .48)
  const strikeRisk = clamp01(lightning * .28)
  const fireSeed = hash32(`${planetId}:${latest.date}:lightning-strike`)

  return {
    coldness,
    cloudCoverage: clamp01(current.clouds * (.72 + normalizedIntensity * .28) + cloudyStreak * .018),
    cloudSpeed: clamp01(current.cloudSpeed * (.66 + normalizedIntensity * .48)),
    rain,
    snow,
    seaLevel: seaLevel * .28,
    vegetationHealth,
    cloudyStreak,
    sunnyStreak,
    weatherStreak,
    currentWeather,
    lightning,
    strikeRisk,
    // Lightning is only a short-lived light event. It never scorches the surface.
    fire: false,
    fireSeed,
    wind: clamp01(current.wind * (.7 + normalizedIntensity * .5)),
  }
}

export function summarizePlanetWeather(
  planetId: string,
  mood: MoodId,
  intensity: number,
  history: WeatherSample[] = [],
) {
  const climate = derivePlanetClimate(planetId, mood, intensity, history)
  const name = weatherLabel(climate.currentWeather)
  const title = climate.weatherStreak >= 2 ? `连续${name} ${climate.weatherStreak} 日` : name
  let detail = '微风与云层缓缓变化。'

  if (climate.snow > .12) detail = '高处的雪线仍在慢慢积累。'
  else if (climate.seaLevel > .075 && climate.rain < .16) detail = '河水还记得前几天的雨，正一点点回落。'
  else if (climate.rain > .25) detail = '雨水落在地表，水面留下轻柔的回响。'
  else if (climate.vegetationHealth > .76) detail = '光线落回地表，枝叶慢慢舒展。'
  else if (climate.vegetationHealth < .38) detail = '枝叶安静下来，地表仍保留着变化。'
  else if (climate.cloudCoverage > .72) detail = '云层缓缓移动，远处轮廓仍然清晰。'
  else if (climate.wind > .56) detail = '风沿着地表掠过，云层也跟着移动。'
  else if (climate.currentWeather === 'night_glow' || climate.currentWeather === 'misty_clear') detail = '淡雾在星球边缘停留了一会儿。'

  return { title, detail, climate }
}
