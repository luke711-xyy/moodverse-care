// @vitest-environment jsdom
import React, { useReducer } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CockpitShell } from '../src/music/cockpit/CockpitShell'
import { cockpitReducer, initialCockpitState } from '../src/music/cockpit/state'
afterEach(cleanup)

function Harness({ reduced = false }: { reduced?: boolean }) {
  const [state, dispatch] = useReducer(cockpitReducer, initialCockpitState)
  return <CockpitShell state={state} reducedMotion={reduced} crtEnabled signal="idle" heading={.5}
    planetName="夜航" scene={<div>真实宇宙</div>} onOpen={page => dispatch({ type: 'open', page })}
    onOverview={() => dispatch({ type: 'overview' })} onBack={() => dispatch({ type: 'back' })}
    onGalaxy={vi.fn()} onHome={vi.fn()} by="genre" onClassify={vi.fn()}>
    <label>Moment 草稿<input aria-label="Moment 草稿" /></label>
  </CockpitShell>
}
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
test('settings and escape restore the originating personal channel', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: '打开个人终端' }))
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  expect(screen.getByRole('region', { name: '探索终端' }).dataset.page).toBe('settings')
  fireEvent.keyDown(screen.getByRole('region', { name: '探索终端' }), { key: 'Escape' })
  expect(screen.getByRole('region', { name: '个人终端' }).dataset.page).toBe('planet')
})
test('reduced motion disables CRT motion without hiding functional controls', () => {
  const { container } = render(<Harness reduced />)
  expect(container.querySelector('[data-crt="on"][data-crt-motion="false"]')).toBeTruthy()
  expect(container.querySelector('#moodverse-hardware-dither feComponentTransfer')).toBeTruthy()
  expect(container.querySelector('.crt-screen[data-crt-motion="true"]')).toBeNull()
  expect(screen.getByRole('button', { name: 'Galaxy' })).toBeTruthy()
  expect(screen.getByRole('group', { name: 'Galaxy 分类旋钮' })).toBeTruthy()
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
