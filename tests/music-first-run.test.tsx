// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FirstRun, type FirstRunProps } from '../src/music/onboarding/FirstRun'
import type { MusicApi, MusicPlanet } from '../src/music-api'
import type { MusicTrackSummary } from '../src/music-domain'
import type { GalaxyPreferences } from '../src/music/galaxy-preferences'

const tracks: MusicTrackSummary[] = Array.from({ length: 4 }, (_, i) => ({ id: `song-${i}`, title: `歌曲 ${i}`, artistId: `artist-${i}`,
  artistName: `艺人 ${i}`, genres: ['Jazz'], moodTags: [], versionLabel: '', coverUrl: null, officialUrl: null,
  durationSeconds: 180, audioUrl: `/audio/song-${i}`, visualFeatures: { source: 'curated', tempoBpm: 100 } }))
const preferences: GalaxyPreferences = { genres: ['Jazz'], availableGenres: ['Jazz', 'Electronic'],
  artists: [{ id: 'artist-0', label: '艺人 0' }], songs: [{ id: 'song-0', label: '歌曲 0' }] }
const planet: MusicPlanet = { id: 'owned-planet', displayName: '夜航', tagline: '慢慢听', visibility: 'private',
  visualSchemaVersion: 3, visual: {}, createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z',
  tracks: tracks.slice(0, 3).map((track, i) => ({ ...track, position: i, isPrimary: i === 0, selectedAt: '2026-10-13T00:00:00Z' })) }
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function setup(overrides: Partial<FirstRunProps> = {}) {
  const api = { loadGalaxyPreferences: vi.fn().mockResolvedValue(preferences), searchGalaxyOptions: vi.fn().mockResolvedValue({
    options: [{ id: 'artist-1', label: '艺人 1' }], hasMore: false, nextOffset: null }),
    searchCatalog: vi.fn().mockResolvedValue({ tracks, status: 'live', hasMore: false, nextOffset: null }) } as unknown as MusicApi
  const props: FirstRunProps = { api, tracks, player: { playing: false, toggle: vi.fn() }, reducedMotion: true,
    crtEnabled: false, status: 'ready', planet: null, onTracks: vi.fn(), onRetry: vi.fn(),
    onSavePreferences: vi.fn().mockResolvedValue(preferences), onCreatePlanet: vi.fn().mockResolvedValue(planet),
    onFinishRequested: vi.fn(), onFinish: vi.fn(), ...overrides }
  const view = render(<FirstRun {...props} />)
  return { ...view, props, api }
}
async function tune() {
  fireEvent.click(screen.getByRole('button', { name: '开始调频' }))
  await screen.findByRole('checkbox', { name: '偏好曲风 Jazz' })
}
async function choosePlanet() {
  await tune()
  fireEvent.click(screen.getByRole('button', { name: '偏好频道 歌曲' }))
  fireEvent.click(screen.getByRole('button', { name: '保存偏好，继续' }))
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
}
function selectThree() {
  for (let i = 0; i < 3; i++) {
    fireEvent.click(screen.getByRole('button', { name: `歌曲 ${i} · 艺人 ${i}` }))
    fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' }))
  }
  fireEvent.click(screen.getByRole('button', { name: '三首已选，继续' }))
  fireEvent.change(screen.getByRole('textbox', { name: '星球名称' }), { target: { value: '  夜航  ' } })
}

test('loading identity cannot read or save preferences and always permits leaving', async () => {
  const { props, api, rerender } = setup({ status: 'loading' })
  fireEvent.click(screen.getByRole('button', { name: '开始调频' }))
  expect(screen.queryByRole('button', { name: '保存偏好，继续' })).toBeNull()
  expect(api.loadGalaxyPreferences).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '跳过首次调频' }))
  await waitFor(() => expect(props.onFinish).toHaveBeenCalledTimes(1))
  rerender(<FirstRun {...props} status="ready" />)
  await screen.findByRole('checkbox', { name: '偏好曲风 Jazz' })
  expect(api.loadGalaxyPreferences).toHaveBeenCalledTimes(1)
})

test('boot can be skipped without exposing inactive controls or finishing the tour', () => {
  const { props } = setup({ reducedMotion: false })
  expect(screen.queryByRole('button', { name: '开始调频' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '跳过开机动画' }))
  expect(screen.getByRole('button', { name: '开始调频' })).toBeTruthy()
  expect(props.onFinish).not.toHaveBeenCalled()
  expect(props.onFinishRequested).not.toHaveBeenCalled()
})

test('all preference categories save together only after explicit confirmation', async () => {
  const { props } = setup()
  await tune()
  fireEvent.click(screen.getByRole('checkbox', { name: '偏好曲风 Electronic' }))
  fireEvent.click(screen.getByRole('button', { name: '偏好频道 艺人' }))
  fireEvent.click(await screen.findByRole('checkbox', { name: '偏好艺人 艺人 1' }))
  expect(props.onSavePreferences).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '偏好频道 歌曲' }))
  fireEvent.click(screen.getByRole('button', { name: '保存偏好，继续' }))
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  expect(props.onSavePreferences).toHaveBeenCalledWith({ genres: ['Jazz', 'Electronic'], artists: ['artist-0', 'artist-1'], songs: ['song-0'] })
  expect(screen.getByText('0 / 3 首')).toBeTruthy()
})

test('failed preference reads never enable an empty overwrite', async () => {
  const api = { loadGalaxyPreferences: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as MusicApi
  const { props } = setup({ api })
  fireEvent.click(screen.getByRole('button', { name: '开始调频' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '保存偏好，继续' })).toBeNull()
  expect(props.onSavePreferences).not.toHaveBeenCalled()
})

test('empty genre choices cannot be saved as random preferences', async () => {
  const { props } = setup()
  await tune()
  fireEvent.click(screen.getByRole('checkbox', { name: '偏好曲风 Jazz' }))
  fireEvent.click(screen.getByRole('button', { name: '偏好频道 歌曲' }))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存偏好，继续' }).disabled).toBe(true)
  expect(props.onSavePreferences).not.toHaveBeenCalled()
})

test('the genre checklist blocks a seventeenth genre while allowing removal', async () => {
  const value = { ...preferences, genres: Array.from({ length: 16 }, (_, i) => `曲风 ${i}`), availableGenres: Array.from({ length: 17 }, (_, i) => `曲风 ${i}`) }
  const api = { loadGalaxyPreferences: vi.fn().mockResolvedValue(value) } as unknown as MusicApi
  setup({ api })
  fireEvent.click(screen.getByRole('button', { name: '开始调频' }))
  const extra = await screen.findByRole<HTMLInputElement>('checkbox', { name: '偏好曲风 曲风 16' })
  expect(extra.disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: '偏好曲风 曲风 0' }))
  expect(extra.disabled).toBe(false)
  fireEvent.click(extra)
  expect(extra.checked).toBe(true)
})

test('a planet starts with no visible core until its first song is selected', async () => {
  setup()
  await choosePlanet()
  expect(screen.queryByRole('img', { name: '随选歌生长的像素星球' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' }))
  expect(screen.getByRole('img', { name: '随选歌生长的像素星球' })).toBeTruthy()
})

test('planet creation preserves the draft after failure and prevents repeated requests', async () => {
  let resolve!: (planet: MusicPlanet) => void
  const onCreatePlanet = vi.fn().mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(() => new Promise<MusicPlanet>(done => { resolve = done }))
  setup({ onCreatePlanet })
  await choosePlanet()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '三首已选，继续' }).disabled).toBe(true)
  selectThree()
  fireEvent.change(screen.getByRole('textbox', { name: '星球签名' }), { target: { value: '  慢慢听  ' } })
  fireEvent.click(screen.getByRole('radio', { name: '私密星球' }))
  fireEvent.click(screen.getByRole('button', { name: '点亮我的星球' }))
  await screen.findByRole('alert')
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: '星球名称' }).value).toBe('  夜航  ')
  fireEvent.click(screen.getByRole('button', { name: '点亮我的星球' }))
  fireEvent.click(screen.getByRole('button', { name: '正在点亮…' }))
  expect(onCreatePlanet).toHaveBeenCalledTimes(2)
  expect(onCreatePlanet).toHaveBeenLastCalledWith({ displayName: '夜航', tagline: '慢慢听', visibility: 'private', trackIds: ['song-0', 'song-1', 'song-2'] })
  await act(async () => { resolve(planet) })
  expect(screen.getByRole('heading', { name: '夜航，已在这里' })).toBeTruthy()
})

test('the brand and skip control stay inside the television with no outside copy', async () => {
  const { container, props } = setup()
  const television = container.querySelector('.first-run-tv')!
  expect(television.contains(screen.getByText('MOSIC', { selector: '.first-run-brand' }))).toBe(true)
  const skip = screen.getByRole('button', { name: '跳过首次调频' })
  expect(television.contains(skip)).toBe(true)
  expect(container.querySelector('.mosic-first-run')?.textContent).toBe(television.textContent)
  fireEvent.click(skip)
  await waitFor(() => expect(props.onFinish).toHaveBeenCalledWith())
})

test('an existing planet must complete the simulated collision lesson before the normal exit', async () => {
  const { props, container } = setup({ planet, reducedMotion: false })
  fireEvent.click(screen.getByRole('button', { name: '跳过开机动画' }))
  await tune()
  fireEvent.click(screen.getByRole('button', { name: '偏好频道 歌曲' }))
  fireEvent.click(screen.getByRole('button', { name: '保存偏好，继续' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: '夜航，已在这里' })).toBeTruthy())
  expect(screen.queryByRole('button', { name: '去我的星球' })).toBeNull()
  expect(screen.queryByRole('button', { name: '试试几个频道' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '继续：撞歌教学' }))
  expect(screen.queryByRole('navigation', { name: '试用频道' })).toBeNull()
  const finish = screen.getByRole<HTMLButtonElement>('button', { name: '完成教学，进入驾驶舱' })
  expect(finish.disabled).toBe(true)
  fireEvent.click(finish)
  expect(props.onFinish).not.toHaveBeenCalled()
  expect(props.onFinishRequested).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '撞歌 ↗' }))
  expect(screen.getByRole('region', { name: '模拟撞歌结果' })).toBeTruthy()
  expect(finish.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '看看示例星球' }))
  expect(screen.getByRole('region', { name: '示例星球预览' })).toBeTruthy()
  expect(screen.getByText('歌曲 0', { selector: '.first-run-demo-collection > div > strong' })).toBeTruthy()
  expect(props.onFinish).not.toHaveBeenCalled()
  expect(finish.disabled).toBe(false)
  vi.useFakeTimers()
  const skip = screen.getByRole('button', { name: '跳过首次调频' })
  fireEvent.click(finish)
  fireEvent.click(finish)
  fireEvent.click(skip)
  expect(props.onFinishRequested).toHaveBeenCalledExactlyOnceWith()
  expect(props.onFinish).not.toHaveBeenCalled()
  expect(container.querySelector('.first-run-tv')?.hasAttribute('inert')).toBe(true)
  await act(async () => { vi.advanceTimersByTime(500) })
  expect(props.onFinish).not.toHaveBeenCalled()
  await act(async () => { vi.advanceTimersByTime(480) })
  expect(props.onFinish).toHaveBeenCalledExactlyOnceWith()
  expect(props.onCreatePlanet).not.toHaveBeenCalled()
})

test('the browser reduced-motion preference uses a short exit without the collapse', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.useFakeTimers()
  const { props, container } = setup({ reducedMotion: false })
  fireEvent.click(screen.getByRole('button', { name: '跳过首次调频' }))
  expect(container.querySelector('.mosic-first-run')?.getAttribute('data-closing')).toBe('reduced')
  expect(props.onFinish).not.toHaveBeenCalled()
  await act(async () => { vi.advanceTimersByTime(159) })
  expect(props.onFinish).not.toHaveBeenCalled()
  await act(async () => { vi.advanceTimersByTime(1) })
  expect(props.onFinish).toHaveBeenCalledExactlyOnceWith()
})

test('unmounting during television shutdown cancels the deferred exit', async () => {
  vi.useFakeTimers()
  const { props, unmount } = setup({ reducedMotion: false })
  fireEvent.click(screen.getByRole('button', { name: '跳过首次调频' }))
  expect(props.onFinishRequested).toHaveBeenCalledExactlyOnceWith()
  unmount()
  await act(async () => { vi.advanceTimersByTime(1000) })
  expect(props.onFinish).not.toHaveBeenCalled()
})
