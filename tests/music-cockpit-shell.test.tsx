// @vitest-environment jsdom
import React, { useReducer, useState } from 'react'
import type { GalaxyGroupBy } from '../src/music-api'
import { afterEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CockpitShell } from '../src/music/cockpit/CockpitShell'
import { cockpitReducer, initialCockpitState, type ExteriorDestination } from '../src/music/cockpit/state'
afterEach(cleanup)

function Harness({ reduced = false, exterior = 'galaxy', heading = .5, galaxyLabel = '环境音乐', classifying = false }: { reduced?: boolean; exterior?: ExteriorDestination; heading?: number; galaxyLabel?: string; classifying?: boolean }) {
  const [state, dispatch] = useReducer(cockpitReducer, { ...initialCockpitState, exterior })
  const [by, setBy] = useState<GalaxyGroupBy>('genre')
  return <CockpitShell state={state} reducedMotion={reduced} crtEnabled signal="idle" heading={heading}
    planetName="夜航" galaxyLabel={galaxyLabel} scene={<div>真实宇宙</div>} onOpen={page => dispatch({ type: 'open', page })}
    onOverview={() => dispatch({ type: 'overview' })} onBack={() => dispatch({ type: 'back' })}
    onGalaxy={() => dispatch({type:'exterior',destination:'galaxy'})} onHome={() => dispatch({type:'exterior',destination:'home'})} by={by} onClassify={setBy} classifying={classifying}>
    <label>Moment 草稿<input aria-label="Moment 草稿" /></label>
  </CockpitShell>
}
test('Galaxy display tracks all three English selector windows and retains the list entry', () => {
  render(<Harness reduced />)
  const display = screen.getByRole('button', { name: '查看 Galaxy 星球列表' })
  expect(display.textContent).toBe('Galaxy 分类：曲风')
  expect(display.querySelector('.crt-screen[data-crt-enabled="true"]')).toBeTruthy()
  for (const [label, title] of [['SONG', '歌曲'], ['ARTIST', '艺人'], ['GENRE', '曲风']]) {
    const selector = screen.getByRole('button', { name: label, exact: true })
    fireEvent.click(selector)
    expect(display.textContent).toBe(`Galaxy 分类：${title}`)
    expect(selector.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('group', { name: 'Galaxy 分类旋钮' }).querySelectorAll('[aria-pressed="true"]').length).toBe(1)
  }
  fireEvent.click(display)
  expect(screen.getByRole('region', { name: '探索终端' }).dataset.page).toBe('galaxy')
})
test('Galaxy selector windows cannot change the displayed classification while a change is pending', () => {
  render(<Harness reduced classifying />)
  for (const label of ['SONG', 'ARTIST', 'GENRE']) {
    const selector = screen.getByRole('button', { name: label, exact: true }) as HTMLButtonElement
    expect(selector.disabled).toBe(true)
    fireEvent.click(selector)
  }
  expect(screen.getByRole('button', { name: '查看 Galaxy 星球列表' }).textContent).toBe('Galaxy 分类：曲风')
})
test('curved Galaxy labels resolve their own text tracks without losing their visible names', () => {
  const { container } = render(<Harness reduced />)
  const tracks = new Set<string>()
  for (const label of ['SONG', 'ARTIST', 'GENRE']) {
    const selector = screen.getByRole('button', { name: label, exact: true })
    const text = selector.querySelector('textPath')
    expect(text?.textContent).toBe(label)
    const reference = text!.getAttribute('href')!
    const track = container.querySelector(`[id="${reference.slice(1)}"]`)
    expect(track?.tagName.toLowerCase()).toBe('path')
    expect(selector.contains(track)).toBe(true)
    tracks.add(reference)
  }
  expect(tracks.size).toBe(3)
})
test('exploration monitor omits the duplicate channel caption while the collision key still works', () => {
  render(<Harness reduced />)
  expect(screen.getByRole('button', { name: '打开探索终端' }).textContent).not.toContain('撞歌')
  fireEvent.click(screen.getByRole('button', { name: '撞歌', exact: true }))
  expect(screen.getByRole('region', { name: '探索终端' }).dataset.page).toBe('collision')
})
test('current galaxy name updates in the top bar and becomes the planet name when returning home', () => {
  const { container, rerender } = render(<Harness galaxyLabel="环境音乐" />)
  expect(container.querySelector('.window-hud-top [aria-label="当前星系"]')?.textContent).toBe('环境音乐')
  rerender(<Harness galaxyLabel="独立摇滚" />)
  expect(container.querySelector('.window-hud-galaxy')?.textContent).toBe('独立摇滚')
  fireEvent.click(screen.getByRole('button', { name: '跃迁' }))
  expect(container.querySelector('.window-hud-top [aria-label="当前星球"]')?.textContent).toBe('夜航')
})
test('windshield full-turn compass and bounded console gauge track the same journey progress', () => {
  const { container, rerender } = render(<Harness heading={0} />)
  for (const heading of [-.2, 0, .25, .5, .75, 1, 1.2]) {
    rerender(<Harness heading={heading} />)
    const compass = container.querySelector<SVGGElement>('.window-hud-needle')!
    const dial = container.querySelector<SVGGElement>('[data-gauge="航向"] .gauge-needle')!
    expect(compass.style.transform).toBe(`rotate(${Math.max(0, Math.min(1, heading)) * 360}deg)`)
    expect(dial.style.transform).toBe(`rotate(${-110 + Math.max(0, Math.min(1, heading)) * 220}deg)`)
    expect(compass.classList.contains('instrument-needle')).toBe(true)
    expect(dial.classList.contains('instrument-needle')).toBe(true)
  }
})
test('physical monitors approach to a straight-on terminal and return without losing drafts', () => {
  render(<Harness />)
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '打开个人终端' }))
  expect(screen.getByRole('region', { name: '个人终端' })).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '保留这段声音' } })
  fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '打开个人终端' }))
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('保留这段声音')
})
test('settings are available only on the main console and escape returns to the cockpit', () => {
  const { container } = render(<Harness reduced />)
  expect(container.querySelectorAll('button[aria-label="设置"]').length).toBe(1)
  for (const name of ['打开个人终端', '打开探索终端', '查看 Galaxy 星球列表']) {
    fireEvent.click(screen.getByRole('button', { name }))
    expect(screen.queryByRole('button', { name: '设置' })).toBeNull()
    expect(container.querySelector('.cockpit-terminal-header button[aria-label="设置"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  }
  const settings = screen.getByRole('button', { name: '设置' })
  expect(settings.className).toBe('cockpit-settings-key')
  fireEvent.click(settings)
  expect(screen.getByRole('region', { name: '探索终端' }).dataset.page).toBe('settings')
  expect(screen.queryByRole('button', { name: '设置' })).toBeNull()
  expect(screen.queryByRole('navigation', { name: '探索频道' })).toBeNull()
  for (const name of ['撞歌', '漫游', '漂流瓶']) {
    expect(screen.queryByRole('button', { name, exact: true })).toBeNull()
  }
  expect(screen.getByRole('button', { name: '返回驾驶舱' })).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('region', { name: '探索终端' }), { key: 'Escape' })
  expect(screen.queryByRole('region')).toBeNull()
  expect(document.activeElement).toBe(settings)
})
test('monitors always enter their first channel and exiting releases all six physical keys', () => {
  const { container } = render(<Harness reduced />)
  fireEvent.click(screen.getByRole('button', {name:'Orbit'}))
  expect(screen.getByRole('region',{name:'个人终端'}).dataset.page).toBe('orbit')
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  expect(container.querySelectorAll('.cockpit-keys [aria-pressed="true"]').length).toBe(0)
  fireEvent.click(screen.getByRole('button',{name:'打开个人终端'}))
  expect(screen.getByRole('region',{name:'个人终端'}).dataset.page).toBe('planet')
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  fireEvent.click(screen.getByRole('button',{name:'查看 Galaxy 星球列表'}))
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  fireEvent.click(screen.getByRole('button',{name:'打开探索终端'}))
  expect(screen.getByRole('region',{name:'探索终端'}).dataset.page).toBe('collision')
  fireEvent.click(screen.getByRole('button',{name:'漂流瓶'}))
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  expect(container.querySelectorAll('.cockpit-keys [aria-pressed="true"]').length).toBe(0)
  fireEvent.click(screen.getByRole('button',{name:'打开探索终端'}))
  expect(screen.getByRole('region',{name:'探索终端'}).dataset.page).toBe('collision')
})
test('reduced motion disables CRT motion without hiding functional controls', () => {
  const { container } = render(<Harness reduced />)
  expect(container.querySelector('[data-crt="on"][data-crt-motion="false"]')).toBeTruthy()
  expect(container.querySelector('#moodverse-hardware-dither feComponentTransfer')).toBeTruthy()
  expect(container.querySelector('.crt-screen[data-crt-motion="true"]')).toBeNull()
  expect(screen.getByRole('button', { name: '跃迁' })).toBeTruthy()
  expect(screen.getByRole('group', { name: 'Galaxy 分类旋钮' })).toBeTruthy()
})
test('jump control travels both ways instead of opening the Galaxy list channel', () => {
  const { container } = render(<Harness />)
  fireEvent.click(screen.getByRole('button', {name:'跃迁'}))
  expect(container.querySelector('.cockpit')!.getAttribute('data-exterior')).toBe('home')
  expect(screen.queryByRole('region', {name:'探索终端'})).toBeNull()
  fireEvent.click(screen.getByRole('button', {name:'跃迁'}))
  expect(container.querySelector('.cockpit')!.getAttribute('data-exterior')).toBe('galaxy')
  expect(screen.getByRole('img', {name:'航速：0%'})).toBeTruthy()
})
test('casings omit terminal headings and ready text while retaining the Galaxy list entry', () => {
  const { container } = render(<Harness />)
  const console = container.querySelector('.cockpit-console')!
  expect(console.textContent).not.toMatch(/个人终端|探索终端|就绪/)
  fireEvent.click(screen.getByRole('button', {name:'查看 Galaxy 星球列表'}))
  expect(screen.getByRole('region', {name:'探索终端'}).getAttribute('data-page')).toBe('galaxy')
})
test('desk replaces the redundant signal gauge with an honest radio ornament and noninteractive props', () => {
  const { container } = render(<Harness />)
  expect(screen.queryByRole('img', { name: /^信号：/ })).toBeNull()
  expect(screen.getByRole('img', { name: '装饰用复古 FM 电台，未接入音源' })).toBeTruthy()
  const desk = container.querySelector('.cockpit-desk-objects')!
  expect(desk.getAttribute('aria-hidden')).toBe('true')
  expect(desk.querySelectorAll('button, a, input, [tabindex]').length).toBe(0)
  expect(desk.querySelector('.desk-keyboard')).toBeTruthy()
  expect(desk.querySelector('.desk-headphones')).toBeTruthy()
  expect(desk.querySelector('.desk-coffee .coffee-steam')).toBeTruthy()
  expect(container.querySelector('.cockpit-console > .cockpit-center')).toBeTruthy()
  expect(container.querySelectorAll('.cockpit-console > .cockpit-console-side').length).toBe(2)
})
test('signal lights belong only to the central terminal, not the full-width desk', () => {
  const { container } = render(<Harness />)
  const lights = container.querySelectorAll('.desk-signals')
  expect(lights.length).toBe(1)
  expect(container.querySelector('#cockpit-exploration')!.contains(lights[0])).toBe(true)
  expect(lights[0].getAttribute('aria-hidden')).toBe('true')
  expect(lights[0].querySelectorAll('button, [tabindex]').length).toBe(0)
})
test('coffee emits a diffuse, graded pixel plume instead of stroked steam paths', () => {
  const { container } = render(<Harness reduced />)
  const steam = container.querySelector('.coffee-steam')!
  expect(steam.querySelectorAll('path').length).toBe(0)
  const pixels = [...steam.querySelectorAll('rect')]
  expect(pixels.length).toBeGreaterThan(300)
  expect(pixels.length).toBeLessThan(1200)
  expect(new Set(pixels.map(pixel => pixel.getAttribute('fill'))).size).toBeGreaterThan(10)
  const band = (from: number, to: number) => pixels.filter(pixel => {
    const y = Number(pixel.getAttribute('y'))
    return y >= from && y < to
  })
  const near = band(0, 20), far = band(-65, -45)
  const width = (items: Element[]) => Math.max(...items.map(pixel => Number(pixel.getAttribute('x')))) - Math.min(...items.map(pixel => Number(pixel.getAttribute('x'))))
  const alpha = (items: Element[]) => items.reduce((sum, pixel) => sum + Number(pixel.getAttribute('opacity')), 0) / items.length
  expect(near.length).toBeGreaterThan(20)
  expect(far.length).toBeGreaterThan(20)
  expect(width(far)).toBeGreaterThan(width(near))
  expect(alpha(near)).toBeGreaterThan(alpha(far))
  const layers = [...steam.querySelectorAll('.coffee-steam-layer')]
  expect(layers.length).toBeGreaterThan(1)
  // A dither threshold must not put almost all cells into one animation phase:
  // that would make the entire plume vanish whenever that cohort fades out.
  const counts = layers.map(layer => layer.childElementCount)
  expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(2)
})
