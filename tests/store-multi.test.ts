import { afterEach, expect, test, vi } from 'vitest'
import { useAppStore } from '../src/store.ts'
import { THEMES, todayKey, type ThemeId } from '../src/types.ts'

const firstDay = (theme: ThemeId) => ({
  name: '星球-' + theme,
  tagline: '今天先走一步',
  theme,
  mood: 'hope' as const,
  intensity: 4,
  triggers: ['学习/工作'],
  privateNote: '只属于我的记录',
  publicMessage: '',
  privacy: 'private' as const,
  musicUrl: '',
  doodle: [],
})

afterEach(() => { useAppStore.getState().reset(); vi.unstubAllGlobals() })

test('an HTML fallback is not mistaken for a working API', async () => {
  useAppStore.setState({ serverAvailable: null })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } })))
  await useAppStore.getState().hydrate()
  expect(useAppStore.getState().serverAvailable).toBe(false)
})

test('a first day creates a separate planet and fixes its theme', async () => {
  useAppStore.setState({ serverAvailable: false })
  const result = await useAppStore.getState().createPlanetAndFirstCheckIn(firstDay('study'))
  expect(result.ok).toBe(true)
  const planet = useAppStore.getState().planet
  expect(planet?.alias).toBe('星球-study')
  expect(planet?.tagline).toBe('今天先走一步')
  expect(planet?.theme).toBe('study')
  expect(useAppStore.getState().entries[0].planetId).toBe(planet?.id)
  expect(useAppStore.getState().entries[0].privacy).toBe('private')

  const next = await useAppStore.getState().saveCheckIn({ ...firstDay('study'), planetId: planet?.id, theme: 'study' })
  expect(next.ok).toBe(false)
  expect(next.error).toContain('今天已经记录过天气了')
  expect(useAppStore.getState().planet?.theme).toBe('study')
  expect(useAppStore.getState().entries[0].theme).toBe('study')
  expect(useAppStore.getState().entries.filter((entry) => entry.planetId === planet?.id)).toHaveLength(1)
})

test('active themes are unique, six active planets are the limit, and archive frees a slot', async () => {
  useAppStore.setState({ serverAvailable: false })
  for (const theme of THEMES.slice(0, 6)) expect((await useAppStore.getState().createPlanetAndFirstCheckIn(firstDay(theme.id))).ok).toBe(true)
  expect(useAppStore.getState().planets).toHaveLength(6)
  expect((await useAppStore.getState().createPlanetAndFirstCheckIn(firstDay('study'))).ok).toBe(false)
  const archivedId = useAppStore.getState().planets[0].id
  expect((await useAppStore.getState().setPlanetArchived(archivedId, true)).ok).toBe(true)
  expect(useAppStore.getState().planets.find((planet) => planet.id === archivedId)?.archivedAt).toBeTruthy()
  expect((await useAppStore.getState().createPlanetAndFirstCheckIn(firstDay('study'))).ok).toBe(true)
  expect((await useAppStore.getState().setPlanetArchived(archivedId, false)).ok).toBe(false)
  expect(useAppStore.getState().planets).toHaveLength(7)
})

test('focused themes are a separate preference and do not constrain owned planet themes', async () => {
  useAppStore.setState({ serverAvailable: false })
  const focused = await useAppStore.getState().updateFocusedThemes(['career', 'lens'])

  expect(focused.ok).toBe(true)
  expect(useAppStore.getState().focusedThemes).toEqual(['career', 'lens'])
  expect(useAppStore.getState().remotePlanets).toHaveLength(0)

  const creation = await useAppStore.getState().createPlanetAndFirstCheckIn(firstDay('study'))
  expect(creation.ok).toBe(true)
  expect(useAppStore.getState().planet?.theme).toBe('study')
  expect(useAppStore.getState().focusedThemes).toEqual(['career', 'lens'])
})

test('focused topic selection cannot exceed six or contain duplicates', async () => {
  useAppStore.setState({ serverAvailable: false })
  const tooMany = await useAppStore.getState().updateFocusedThemes(THEMES.slice(0, 7).map((theme) => theme.id))
  const duplicate = await useAppStore.getState().updateFocusedThemes(['study', 'study'])

  expect(tooMany.ok).toBe(false)
  expect(duplicate.ok).toBe(false)
  expect(useAppStore.getState().focusedThemes).toEqual(THEMES.slice(0, 6).map((theme) => theme.id))
})

test('archived planet stays readable but cannot receive a new entry', async () => {
  useAppStore.setState({ serverAvailable: false })
  await useAppStore.getState().createPlanetAndFirstCheckIn(firstDay('lens'))
  const planetId = useAppStore.getState().planet!.id
  const entry = useAppStore.getState().entries[0]
  expect(entry.date).toBe(todayKey())
  await useAppStore.getState().setPlanetArchived(planetId, true)
  expect(useAppStore.getState().planet).toBeUndefined()
  expect(useAppStore.getState().entries.find((item) => item.planetId === planetId)?.privateNote).toBe('只属于我的记录')
  expect((await useAppStore.getState().saveCheckIn({ ...firstDay('lens'), planetId })).ok).toBe(false)
})
