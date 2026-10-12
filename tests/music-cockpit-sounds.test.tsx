// @vitest-environment jsdom
import React, { useReducer, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CockpitShell } from '../src/music/cockpit/CockpitShell'
import { cockpitReducer, initialCockpitState } from '../src/music/cockpit/state'
import type { GalaxyGroupBy } from '../src/music-api'
import type { CockpitFlight } from '../src/music/cockpit/flight'

// Only replace the browser's audio output/decoder. The real shell, routing,
// loading and sound lifetime all run, including the caller's border actions.
class Source {
  buffer: { url: string; duration: number } | null = null
  onended: (() => void) | null = null
  stopped = false
  loop = false
  startArgs: number[] | null = null
  output: { gain: { value: number } } | null = null
  connect(node: { gain: { value: number } }) { this.output = node }
  disconnect() {}
  start(...args: number[]) { this.startArgs = args }
  stop() { this.stopped = true; this.onended?.() }
}
class Context {
  static instances: Context[] = []
  sources: Source[] = []
  state = 'suspended'
  destination = {}
  closed = false
  constructor() { Context.instances.push(this) }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} } }
  async decodeAudioData(bytes: ArrayBuffer) {
    const url = new TextDecoder().decode(bytes)
    return { url, duration: url.includes('mechanical-reload') ? 1.176 : 34.416 }
  }
  async resume() { this.state = 'running' }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source }
  async close() { this.closed = true; this.state = 'closed' }
}
beforeEach(() => {
  Context.instances = []
  vi.stubGlobal('AudioContext', Context)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(new TextEncoder().encode(url))))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function Harness({ disabled = false, flight = null, playing = false }: { disabled?: boolean; flight?: CockpitFlight | null; playing?: boolean }) {
  const [state, dispatch] = useReducer(cockpitReducer, initialCockpitState)
  const [by, setBy] = useState<GalaxyGroupBy>('genre')
  return <CockpitShell state={state} flight={flight} reducedMotion crtEnabled signal="idle" heading={0} planetName="音效验证"
    by={by} onClassify={setBy} classifying={disabled} scene={<span>宇宙</span>}
    onOpen={page => dispatch({ type: 'open', page })} onOverview={() => dispatch({ type: 'overview' })}
    onBack={() => dispatch({ type: 'back' })} onHome={() => {}} onGalaxy={() => {}}
    musicPlayer={{ playing, blocked: false, canSkip: !disabled, toggle() {}, previous() {}, next() {} }}
    terminalActions={<button>边框扩展按钮</button>}>
    <button>屏幕内操作</button>
  </CockpitShell>
}
const output = () => Context.instances.flatMap(context => context.sources).filter(source => source.startArgs)
const settle = () => act(async () => {})
async function click(name: string) { await act(async () => { fireEvent.click(screen.getByRole('button', { name, exact: true })) }) }

test('only the left/middle keys and expanded border controls use the first sound', async () => {
  render(<Harness />)
  await settle()
  expect(output()).toHaveLength(0)
  await click('我的星球')
  expect(output().at(-1)?.buffer?.url).toBe('/audio/dragon-studio-button-press-2-386176.mp3')
  const count = output().length
  await click('屏幕内操作')
  expect(output()).toHaveLength(count)
  await click('Orbit')
  await click('边框扩展按钮')
  await click('返回驾驶舱')
  await click('撞歌')
  expect(output()).toHaveLength(5)
  expect(output().every(source => source.buffer?.url === '/audio/dragon-studio-button-press-2-386176.mp3')).toBe(true)
})

test('the Galaxy knob plays one short turn only when classification changes', async () => {
  render(<Harness />)
  await settle()
  await click('GENRE')
  expect(output()).toHaveLength(0)
  await click('SONG')
  expect(output()).toHaveLength(1)
  expect(output()[0].buffer?.url).toBe('/audio/freesound_community-clicking-dial-on-toy-76265.mp3')
  expect(output()[0].startArgs).toEqual([0, .125, .9])
  expect(screen.getByRole('button', { name: '查看 Galaxy 星球列表' }).textContent).toBe('Galaxy 分类：歌曲')
  await click('SONG')
  expect(output()).toHaveLength(1)
})

test('all three radio controls use the third sound without sounding disabled keys', async () => {
  const view = render(<Harness />)
  await settle()
  await click('上一首')
  await click('播放 Cosmos · The_mountain')
  await click('下一首')
  expect(output()).toHaveLength(3)
  expect(output().every(source => source.buffer?.url === '/audio/freesound_community-old-radio-button-click-97549.mp3')).toBe(true)
  view.rerender(<Harness disabled />)
  await click('上一首')
  await click('下一首')
  await click('ARTIST')
  expect(output()).toHaveLength(3)
})

test('screen entry points and unrelated right-side keys do not get the console sound', async () => {
  render(<Harness />)
  await settle()
  await click('打开个人终端')
  expect(output()).toHaveLength(0)
  await click('返回驾驶舱')
  await click('设置')
  expect(output()).toHaveLength(1)
})

test('rapid input restarts bounded effects and unmount releases audio resources', async () => {
  const view = render(<Harness />)
  await settle()
  await click('SONG')
  const first = output()[0]
  await click('ARTIST')
  expect(first?.stopped).toBe(true)
  expect(output().filter(source => !source.stopped)).toHaveLength(1)
  const contexts = [...Context.instances]
  view.unmount()
  expect(output().every(source => source.stopped)).toBe(true)
  expect(contexts.every(context => context.closed)).toBe(true)
})

test('missing audio support or failed downloads never block navigation', async () => {
  vi.stubGlobal('AudioContext', undefined)
  const view = render(<Harness />)
  await click('撞歌')
  expect(screen.getByRole('region', { name: '探索终端' }).dataset.page).toBe('collision')
  view.unmount()
  vi.stubGlobal('AudioContext', Context)
  vi.stubGlobal('fetch', vi.fn(async () => { throw Error('offline') }))
  render(<Harness />)
  await click('我的星球')
  expect(screen.getByRole('region', { name: '个人终端' }).dataset.page).toBe('planet')
  expect(output()).toHaveLength(0)
})

const trip = (token: number, to: CockpitFlight['to'] = 'home'): CockpitFlight => ({
  token, from: 'galaxy', to, progress: 0, ready: false,
  sourceVisitor: null, targetVisitor: null, returning: false,
})
const flightOutput = () => output().filter(source => source.buffer?.url === '/audio/daviddumaisaudio-sci-fi-mechanical-reload-18-316413.mp3')

test('console and radio effects have independent gains while dial and flight stay unchanged', async () => {
  const view = render(<Harness playing />)
  await click('我的星球')
  await click('返回驾驶舱')
  await click('SONG')
  await click('上一首')
  view.rerender(<Harness playing flight={trip(1)} />)
  await settle()
  expect(output()).toHaveLength(5)
  expect(new Set(output().map(source => source.buffer?.url)).size).toBe(4)
  // Observe the signal path configured on each played source, not a constant.
  // Relative to the previous 1.2: console x3, radio x2, others unchanged.
  expect(output().map(source => source.output?.gain.value)).toEqual([3.6, 3.6, 1.2, 2.4, 1.2])
  const flightSource = output().at(-1)!
  await click('上一首')
  expect(output().at(-1)?.output?.gain.value).toBe(2.4)
  expect(flightSource.output?.gain.value).toBe(1.2)
  expect(screen.getByRole('button', { name: '暂停 Cosmos · The_mountain' }).getAttribute('aria-pressed')).toBe('true')
})

test('each nebula crossing plays the entire non-looping clip once, not on progress, holds or arrival', async () => {
  const view = render(<Harness />)
  await settle()
  expect(flightOutput()).toHaveLength(0)
  await click('回星球')
  // Unlock in the initiating gesture, before the flight's state effect runs.
  expect(Context.instances.at(-1)?.state).toBe('running')
  view.rerender(<Harness flight={trip(1)} />)
  await settle()
  expect(flightOutput()).toHaveLength(1)
  expect(flightOutput()[0].startArgs).toEqual([0, 0, 1.176])
  expect(flightOutput()[0].loop).toBe(false)
  view.rerender(<Harness flight={{ ...trip(1), progress: .5 }} />)
  await settle()
  flightOutput()[0].onended?.()
  view.rerender(<Harness flight={{ ...trip(1), progress: .5, ready: true }} />)
  await settle()
  view.rerender(<Harness />)
  await settle()
  expect(flightOutput()).toHaveLength(1)
  view.rerender(<Harness flight={trip(2, 'galaxy')} />)
  await settle()
  view.rerender(<Harness />)
  view.rerender(<Harness flight={trip(3, 'visitor')} />)
  await settle()
  expect(flightOutput()).toHaveLength(3)
})

test('radio clicks and a quick arrival do not truncate the nebula clip', async () => {
  const view = render(<Harness />)
  await click('回星球')
  view.rerender(<Harness flight={trip(1)} />)
  await settle()
  expect(flightOutput()).toHaveLength(1)
  const source = flightOutput()[0]
  await click('播放 Cosmos · The_mountain')
  view.rerender(<Harness />)
  await settle()
  expect(source.stopped).toBe(false)
  expect(flightOutput()).toHaveLength(1)
  view.unmount()
  expect(source.stopped).toBe(true)
})
