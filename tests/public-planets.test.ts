import { describe, expect, it } from 'vitest'

import { getVisiblePlanets } from '../src/store.ts'
import { THEME_IDS, type Planet, type ThemeId } from '../src/types.ts'

const makePlanet = (id: string, theme: ThemeId, overrides: Partial<Planet> = {}): Planet => ({
  id,
  alias: id,
  theme,
  mood: 'calm',
  intensity: 3,
  message: '',
  owner: false,
  position: [0, 0, 0],
  orbit: 0,
  ...overrides,
})

describe('database-backed public planets', () => {
  it('does not invent planets when the public database has none', () => {
    expect(getVisiblePlanets()).toEqual([])
    expect(getVisiblePlanets('study', [])).toEqual([])
  })

  it('shows only active public records in followed themes, capped at ten per theme', () => {
    const records = [
      ...Array.from({ length: 12 }, (_, index) => makePlanet(`study-${index}`, 'study')),
      makePlanet('owned', 'study', { owner: true }),
      makePlanet('archived', 'study', { archivedAt: '2026-09-01T00:00:00.000Z' }),
      makePlanet('demo', 'study', { isSeed: true }),
      makePlanet('career-1', 'career'),
    ]

    expect(getVisiblePlanets('study', records).map((planet) => planet.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `study-${index}`),
    )
    expect(getVisiblePlanets(undefined, records, ['career']).map((planet) => planet.id)).toEqual(['career-1'])
    expect(getVisiblePlanets('study', records, ['career'])).toEqual([])
  })

  it('keeps remote planets in the same model across every supported theme', () => {
    const records = THEME_IDS.map((theme) => makePlanet(`${theme}-1`, theme))
    const visible = getVisiblePlanets(undefined, records)

    expect(visible).toEqual(records)
    expect(visible.every((planet) => planet.owner === false && !planet.isSeed)).toBe(true)
  })
})
