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
  expect(container.querySelector('[data-crt="off"]')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Galaxy' })).toBeTruthy()
  expect(screen.getByRole('group', { name: 'Galaxy 分类旋钮' })).toBeTruthy()
})
