// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useMusicPlayer } from '../src/music/useMusicPlayer'
import { DEFAULT_AUDIO_URL } from '../src/music/default-track'
import { getMusicBeatClock } from '../src/music/audio-clock'
import type { MusicTrackSummary } from '../src/music-domain'
import { StrictMode } from 'react'

type PlayResult = { resolve: () => void; reject: (cause: unknown) => void }
class AudioStub extends EventTarget {
  static instances: AudioStub[] = []
  paused = true
  ended = false
  currentTime = 0
  loop = false
  preload = ''
  volume = 1
  requests: PlayResult[] = []
  constructor(public src: string) { super(); AudioStub.instances.push(this) }
  play = vi.fn(() => new Promise<void>((resolve, reject) => {
    this.requests.push({ resolve: () => {
      this.paused = false
      this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing'))
      resolve()
    }, reject })
  }))
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event('pause')) })
  load = vi.fn()
  removeAttribute(name: string) { if (name === 'src') this.src = '' }
}
let documentListeners: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  AudioStub.instances = []
  vi.stubGlobal('Audio', AudioStub)
  documentListeners = vi.spyOn(document, 'addEventListener')
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function player() { return AudioStub.instances.at(-1)! }
async function rejectPlay(name: string, request = player().requests.at(-1)!) {
  await act(async () => { request.reject(new DOMException('test media failure', name)) })
}
async function resolvePlay() { await act(async () => { player().requests.at(-1)!.resolve() }) }
// jsdom cannot originate a trusted input. Deliver the browser event boundary
// directly while testing the real hook and its installed listener.
function gesture(type = 'pointerdown', target: EventTarget = document.body) {
  const listener = documentListeners.mock.calls.find(([name]) => name === type)![1] as EventListener
  act(() => listener({ isTrusted: true, target } as Event))
}
function track(id: string): MusicTrackSummary {
  return {
    id, title: id, artistId: 'artist', artistName: 'Artist', versionLabel: '', genres: [], moodTags: [],
    officialUrl: null, coverUrl: null, durationSeconds: null,
    audioUrl: `/api/music/tracks/${encodeURIComponent(id)}/stream`,
    visualFeatures: { source: 'audius', tempoBpm: 120 },
  }
}

test('entry and a fresh mount attempt audible playback without a click', async () => {
  const first = renderHook(() => useMusicPlayer())
  expect(player().src).toBe(DEFAULT_AUDIO_URL)
  expect(player().volume).toBe(.5)
  expect(player().play).toHaveBeenCalledTimes(1)
  await resolvePlay()
  expect(first.result.current).toMatchObject({ playing: true, blocked: false, loading: false, error: '' })
  first.unmount()
  const refreshed = renderHook(() => useMusicPlayer())
  expect(player().play).toHaveBeenCalledTimes(1)
  await resolvePlay()
  expect(refreshed.result.current.playing).toBe(true)
})

test('FM skips within saved selections, wraps, carries cover art and preserves a deliberate pause', async () => {
  const first = { ...track('first'), coverUrl: 'https://images.example/first.jpg' }
  const second = { ...track('second'), coverUrl: 'https://images.example/second.jpg' }
  const { result } = renderHook(() => useMusicPlayer({ backgroundTrack: first, playlist: [first, second] }))
  await resolvePlay()
  act(() => result.current.next())
  expect(player().src).toBe(second.audioUrl)
  await resolvePlay()
  expect(result.current.currentTrack.coverUrl).toBe(second.coverUrl)
  act(() => result.current.next())
  expect(player().src).toBe(first.audioUrl)
  await resolvePlay()
  act(() => result.current.toggle())
  const attempts = player().requests.length
  act(() => result.current.previous())
  expect(player().src).toBe(second.audioUrl)
  expect(result.current.playing).toBe(false)
  expect(player().requests).toHaveLength(attempts)
  act(() => result.current.toggle(track('outside')))
  await resolvePlay()
  act(() => result.current.next())
  expect(player().src).toBe(first.audioUrl)
})

test('waits for saved planet data and starts its primary song without briefly playing Cosmos', async () => {
  const saved = track('audius:saved')
  const view = renderHook(({ ready, backgroundTrack }) => useMusicPlayer({ ready, backgroundTrack }), {
    initialProps: { ready: false, backgroundTrack: null as MusicTrackSummary | null },
  })
  expect(player().src).toBe('')
  expect(player().play).not.toHaveBeenCalled()
  gesture()
  expect(player().play).not.toHaveBeenCalled()
  view.rerender({ ready: true, backgroundTrack: saved })
  expect(player().src).toBe('/api/music/tracks/audius%3Asaved/stream')
  await resolvePlay()
  expect(view.result.current).toMatchObject({ currentTrackId: 'audius:saved', playing: true })
  view.unmount()
  const refreshed = renderHook(() => useMusicPlayer({ ready: true, backgroundTrack: saved }))
  expect(player().src).toBe(saved.audioUrl)
  await resolvePlay()
  expect(refreshed.result.current.currentTrackId).toBe('audius:saved')
})

test('a confirmed primary change switches immediately while ordinary updates preserve auditions and pauses', async () => {
  const saved = track('audius:one')
  const view = renderHook(({ backgroundTrack }) => useMusicPlayer({ ready: true, backgroundTrack }), { initialProps: { backgroundTrack: saved } })
  await resolvePlay()
  act(() => view.result.current.toggle(track('audius:audition')))
  await resolvePlay()
  view.rerender({ backgroundTrack: { ...saved } })
  expect(view.result.current.currentTrackId).toBe('audius:audition')
  act(() => view.result.current.toggle())
  view.rerender({ backgroundTrack: { ...saved } })
  expect(view.result.current.playing).toBe(false)
  view.rerender({ backgroundTrack: track('audius:two') })
  expect(player().src).toBe('/api/music/tracks/audius%3Atwo/stream')
  await resolvePlay()
  expect(view.result.current).toMatchObject({ currentTrackId: 'audius:two', playing: true })
})

test('account reload stops the previous song until the next account data is ready', async () => {
  const view = renderHook(({ ready, backgroundTrack }) => useMusicPlayer({ ready, backgroundTrack }), {
    initialProps: { ready: true, backgroundTrack: track('audius:private') as MusicTrackSummary | null },
  })
  await resolvePlay()
  view.rerender({ ready: false, backgroundTrack: null })
  expect(player().paused).toBe(true)
  expect(player().src).toBe('')
  gesture()
  expect(player().requests).toHaveLength(1)
  view.rerender({ ready: true, backgroundTrack: null })
  expect(player().src).toBe(DEFAULT_AUDIO_URL)
})

test('strict effect remount still assigns the saved source to the surviving audio element', async () => {
  const view = renderHook(() => useMusicPlayer({ backgroundTrack: track('audius:strict') }), { wrapper: StrictMode })
  expect(player().src).toBe('/api/music/tracks/audius%3Astrict/stream')
  await resolvePlay()
  expect(view.result.current.currentTrackId).toBe('audius:strict')
})

test.each(['pointerdown', 'pointerup', 'keydown'])('policy denial retries on trusted %s, but synthetic events do not unlock it', async type => {
  const { result } = renderHook(() => useMusicPlayer())
  await rejectPlay('NotAllowedError')
  expect(result.current).toMatchObject({ blocked: true, error: '', loading: false })
  act(() => document.dispatchEvent(new Event('pointerdown')))
  expect(player().play).toHaveBeenCalledTimes(1)
  gesture(type)
  expect(player().play).toHaveBeenCalledTimes(2)
  await resolvePlay()
  expect(result.current).toMatchObject({ playing: true, blocked: false, error: '' })
})

test('the play button owns its gesture and a deliberate pause survives further gestures', async () => {
  const { result } = renderHook(() => useMusicPlayer())
  await rejectPlay('NotAllowedError')
  const button = document.createElement('button')
  button.dataset.musicToggle = ''
  const icon = document.createElement('span'); button.append(icon)
  gesture('pointerdown', icon)
  gesture('keydown', button)
  expect(player().play).toHaveBeenCalledTimes(1)
  act(() => result.current.toggle())
  expect(player().play).toHaveBeenCalledTimes(2)
  await resolvePlay()
  act(() => result.current.toggle())
  gesture(); gesture('keydown')
  act(() => player().dispatchEvent(new Event('canplay')))
  expect(player().play).toHaveBeenCalledTimes(2)
  expect(result.current).toMatchObject({ playing: false, blocked: false, loading: false })
})

test('aborted playback is not a policy or source error and retries when media becomes ready', async () => {
  const { result } = renderHook(() => useMusicPlayer())
  await rejectPlay('AbortError')
  expect(result.current).toMatchObject({ playing: false, blocked: false, error: '', loading: false })
  act(() => player().dispatchEvent(new Event('canplay')))
  expect(player().play).toHaveBeenCalledTimes(2)
  await resolvePlay()
  expect(result.current.playing).toBe(true)
})

test.each(['NotSupportedError', 'NetworkError'])('a %s is shown as a playback failure without a false policy warning', async name => {
  const { result } = renderHook(() => useMusicPlayer())
  await rejectPlay(name)
  expect(result.current.blocked).toBe(false)
  expect(result.current.error).not.toBe('')
  gesture()
  expect(player().play).toHaveBeenCalledTimes(1)
  act(() => result.current.toggle())
  expect(result.current.error).toBe('')
  await resolvePlay()
  expect(result.current.playing).toBe(true)
})

test('a media error clears an earlier policy denial and invalidates the pending play request', async () => {
  const { result } = renderHook(() => useMusicPlayer())
  await rejectPlay('NotAllowedError')
  act(() => player().dispatchEvent(new Event('error')))
  expect(result.current).toMatchObject({ blocked: false, playing: false, loading: false })
  const sourceError = result.current.error
  expect(sourceError).not.toBe('')
  act(() => result.current.toggle())
  const pending = player().requests.at(-1)!
  act(() => player().dispatchEvent(new Event('error')))
  await rejectPlay('NotAllowedError', pending)
  expect(result.current).toMatchObject({ blocked: false, error: sourceError })
})

test('stale errors from entry and previous tracks cannot override the latest track', async () => {
  const { result } = renderHook(() => useMusicPlayer())
  const entry = player().requests[0]
  act(() => result.current.toggle(track('first')))
  const previousTrack = player().requests.at(-1)!
  act(() => result.current.toggle(track('latest')))
  await resolvePlay()
  await rejectPlay('NotAllowedError', entry)
  await rejectPlay('NetworkError', previousTrack)
  expect(result.current).toMatchObject({ currentTrackId: 'latest', playing: true, blocked: false, loading: false, error: '' })
  expect(getMusicBeatClock()?.bpm).toBe(60)
})

test('pausing a pending start invalidates its rejection and prevents automatic recovery', async () => {
  const { result } = renderHook(() => useMusicPlayer())
  act(() => result.current.toggle())
  await rejectPlay('NotAllowedError')
  gesture()
  expect(player().play).toHaveBeenCalledTimes(1)
  expect(result.current).toMatchObject({ playing: false, blocked: false, loading: false, error: '' })
})

test('invalid external sources do not cancel the legitimate pending play request', async () => {
  const { result } = renderHook(() => useMusicPlayer())
  act(() => result.current.toggle({ ...track('external'), audioUrl: 'https://untrusted.example/audio.mp3' }))
  expect(player().src).toBe(DEFAULT_AUDIO_URL)
  await rejectPlay('NotAllowedError')
  expect(result.current.blocked).toBe(true)
})

test('unmount removes gesture recovery and prevents stale rejections reaching the next player', async () => {
  const first = renderHook(() => useMusicPlayer())
  const oldAudio = player()
  first.unmount()
  expect(oldAudio.src).toBe('')
  expect(oldAudio.load).toHaveBeenCalledOnce()
  expect(getMusicBeatClock()).toBeUndefined()
  const next = renderHook(() => useMusicPlayer())
  await resolvePlay()
  await rejectPlay('NotAllowedError', oldAudio.requests[0])
  expect(next.result.current).toMatchObject({ playing: true, blocked: false, error: '' })
})

test('visits follow each planet primary and restore the original audition with its position only on exit', async () => {
  const own = track('own'), audition = track('audition'), a = track('visitor-a'), b = track('visitor-b')
  const view = renderHook(({ visit }) => useMusicPlayer({ backgroundTrack: own, playlist: [own], visit }), {
    initialProps: { visit: null as null | { planetId: string; tracks: Array<MusicTrackSummary & { isPrimary?: boolean }> } },
  })
  await resolvePlay()
  act(() => view.result.current.toggle(audition))
  await resolvePlay()
  player().currentTime = 37.5
  view.rerender({ visit: { planetId: 'a', tracks: [b, { ...a, isPrimary: true }] } })
  expect(view.result.current.currentTrackId).toBe('visitor-a')
  await resolvePlay()
  player().currentTime = 12
  view.rerender({ visit: { planetId: 'a', tracks: [b, { ...a, isPrimary: true }] } })
  expect(player().currentTime).toBe(12)
  act(() => view.result.current.next())
  expect(view.result.current.currentTrackId).toBe('visitor-b')
  await resolvePlay()
  view.rerender({ visit: { planetId: 'b', tracks: [{ ...b, isPrimary: true }] } })
  await resolvePlay()
  view.rerender({ visit: { planetId: 'a', tracks: [{ ...a, isPrimary: true }] } })
  await resolvePlay()
  view.rerender({ visit: null })
  expect(view.result.current.currentTrackId).toBe('audition')
  act(() => player().dispatchEvent(new Event('loadedmetadata')))
  expect(player().currentTime).toBe(37.5)
  await resolvePlay()
  expect(view.result.current.playing).toBe(true)
})

test('visiting the same song still restores the pre-visit deliberate pause and position', async () => {
  const own = track('own')
  const view = renderHook(({ visit }) => useMusicPlayer({ backgroundTrack: own, visit }), {
    initialProps: { visit: null as null | { planetId: string; tracks: Array<MusicTrackSummary & { isPrimary?: boolean }> } },
  })
  await resolvePlay()
  act(() => view.result.current.toggle())
  player().currentTime = 29
  view.rerender({ visit: { planetId: 'same', tracks: [{ ...own, isPrimary: true }] } })
  await resolvePlay()
  player().currentTime = 60
  view.rerender({ visit: null })
  expect(player().paused).toBe(true)
  expect(player().currentTime).toBe(29)
  gesture()
  expect(view.result.current.playing).toBe(false)
})

test('changing accounts during a visit discards the old account restoration snapshot', async () => {
  const visit = { planetId: 'a', tracks: [{ ...track('visitor'), isPrimary: true }] }
  const view = renderHook(({ ready, backgroundTrack, visit }) => useMusicPlayer({ ready, backgroundTrack, visit }), {
    initialProps: { ready: true, backgroundTrack: track('old'), visit: null as typeof visit | null },
  })
  await resolvePlay()
  view.rerender({ ready: true, backgroundTrack: track('old'), visit })
  expect(view.result.current.currentTrackId).toBe('visitor')
  view.rerender({ ready: false, backgroundTrack: track('old'), visit: null })
  expect(player().src).toBe('')
  view.rerender({ ready: true, backgroundTrack: track('new'), visit: null })
  expect(view.result.current.currentTrackId).toBe('new')
})
