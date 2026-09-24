import { afterEach, expect, test } from 'vitest'

import { useAppStore } from '../src/store.ts'

const checkIn = (privacy: 'private' | 'mood_theme_public' | 'billboard_public', publicMessage = '') => ({
  theme: 'care' as const,
  mood: 'calm' as const,
  intensity: 3,
  triggers: [],
  privateNote: '',
  publicMessage,
  privacy,
  musicUrl: '',
  doodle: [{ points: [[.2, .3]] as Array<[number, number]>, color: '#ffd36b', width: .012, coordinateSpace: 'normalized' as const }],
})

afterEach(() => useAppStore.getState().reset())

const create = async (privacy: 'private' | 'mood_theme_public' | 'billboard_public', publicMessage = '留给路过的一句话') => {
  useAppStore.setState({ serverAvailable: false })
  return useAppStore.getState().createPlanetAndFirstCheckIn({ ...checkIn(privacy, publicMessage), name: '照顾自己', tagline: '', theme: 'care' })
}

test('a public doodle stays on the planet surface without creating a billboard', async () => {
  expect((await create('billboard_public', '')).ok).toBe(true)

  expect(useAppStore.getState().planet?.doodle).toHaveLength(1)
  expect(useAppStore.getState().planet?.billboard).toBeUndefined()
  expect(useAppStore.getState().planet?.billboards).toHaveLength(0)
})

test('private doodles are not attached to the public billboard', async () => {
  expect((await create('private')).ok).toBe(true)

  expect(useAppStore.getState().planet?.billboard).toBeUndefined()
})

test('a successful first-day weather record immediately gets a private matched care card', async () => {
  expect((await create('private')).ok).toBe(true)
  const planetId = useAppStore.getState().planet?.id
  const card = useAppStore.getState().careCards[0]

  expect(card).toMatchObject({ planetId, published: false, title: '留住这段安静的半径' })
  expect(card.action).toContain('舒服')
  expect(useAppStore.getState().panel).toBe('care')
  expect(useAppStore.getState().planet?.billboards).toHaveLength(0)
})

test('publishing a care card adds it without replacing a user billboard', async () => {
  await create('billboard_public')
  const originalBillboard = useAppStore.getState().planet?.billboards?.[0]
  const card = useAppStore.getState().careCards[0]
  useAppStore.getState().publishCareCard(card.id)

  expect(useAppStore.getState().planet?.billboard?.kind).toBe('ai')
  expect(useAppStore.getState().planet?.billboards).toHaveLength(2)
  expect(useAppStore.getState().planet?.billboards?.map((item) => item.id)).toContain(originalBillboard?.id)
  expect(useAppStore.getState().planet?.billboards?.find((item) => item.kind === 'ai')?.title).toBe(card.title)
})

test('deleting one planet billboard removes only that sign and unpublishes its care card', async () => {
  await create('billboard_public')
  const userBillboardId = useAppStore.getState().planet?.billboards?.[0]?.id
  const card = useAppStore.getState().careCards[0]
  useAppStore.getState().publishCareCard(card.id)
  useAppStore.getState().deleteBillboard(card.id)

  expect(useAppStore.getState().planet?.billboards).toHaveLength(1)
  expect(useAppStore.getState().planet?.billboards?.[0]?.id).toBe(userBillboardId)
  expect(useAppStore.getState().careCards.find((item) => item.id === card.id)?.published).toBe(false)
})
