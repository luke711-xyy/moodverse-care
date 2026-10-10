// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { WindowHud, type WindowTelemetry } from '../src/music/cockpit/WindowHud'
import { cockpitReducer, initialCockpitState } from '../src/music/cockpit/state'
import type { CockpitFlight } from '../src/music/cockpit/flight'
afterEach(() => { cleanup(); vi.useRealTimers() })
const telemetry: WindowTelemetry = {
  ownerId: 'owner', systemCount: 8, sectorPosition: 1.25, grouping: 'genre',
  sector: { id: 'genre:electronic', label: 'electronic', index: 1, visiblePlanets: 16, totalPlanets: 42 },
  orbitRotation: Math.PI / 2, visitor: null, targetName: '远岸',
}
test('top title follows the current destination and shows the owner name at home', () => {
  const { rerender } = render(<WindowHud state={initialCockpitState} connected signal="idle" telemetry={telemetry} galaxyLabel="Rock" planetName="我的远岸" />)
  expect(screen.getByLabelText('当前星系').textContent).toBe('Rock')
  rerender(<WindowHud state={{ ...initialCockpitState, exterior: 'home' }} connected signal="idle" telemetry={telemetry} galaxyLabel="Rock" planetName="我的远岸" />)
  expect(screen.getByLabelText('当前星球').textContent).toBe('我的远岸')
  expect(screen.queryByText('Rock')).toBeNull()
})
test('window HUD keeps MOSIC fixed and shows real sector counts, coordinates and a local clock', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T08:00:00Z'))
  const { container, rerender } = render(<WindowHud state={initialCockpitState} connected signal="idle" telemetry={telemetry} />)
  expect(screen.getByText('MOSIC')).toBeTruthy()
  expect(screen.getByText('SECTOR 02 / 08')).toBeTruthy()
  expect(screen.getByText('16 / 42')).toBeTruthy()
  expect(screen.getByText('001.250')).toBeTruthy()
  expect(screen.getByText('0.0°')).toBeTruthy()
  expect(screen.getByText('IN GALAXY · 跃迁回自己的星球')).toBeTruthy()
  const clock = screen.getByLabelText('当前本地时间')
  const before = clock.dateTime
  act(() => vi.advanceTimersByTime(1000))
  expect(clock.getAttribute('datetime')).not.toBe(before)
  expect(container.querySelectorAll('.window-hud-grid path').length).toBe(9)
  const reticle = container.querySelector('.window-hud-reticle')!
  expect(reticle.tagName.toLowerCase()).toBe('svg')
  expect(reticle.getAttribute('viewBox')).toBe('0 0 40 40')
  expect(reticle.querySelector('path')?.getAttribute('d')).toBe('M4 20h8m16 0h8M20 4v8m0 16v8')
  expect(container.querySelectorAll('button,input,a,[tabindex]').length).toBe(0)
  rerender(<WindowHud state={{...initialCockpitState, exterior:'home'}} connected signal="idle" telemetry={telemetry} />)
  expect(screen.getByText('MOSIC')).toBeTruthy()
  expect(screen.getByText('AT HOME · 跃迁前往 Galaxy')).toBeTruthy()
  expect(screen.getByText('01')).toBeTruthy()
})
test('ANGLE follows the compass heading even when orbit telemetry is absent or unrelated', () => {
  const { container, rerender } = render(<WindowHud state={initialCockpitState} connected signal="idle" heading={.75} telemetry={{...telemetry, orbitRotation:null}} />)
  expect(screen.getByText('ANGLE / θ').nextElementSibling?.textContent).toBe('270.0°')
  expect(container.querySelector<SVGGElement>('.window-hud-needle')?.style.transform).toBe('rotate(270deg)')
  rerender(<WindowHud state={initialCockpitState} connected signal="idle" heading={.25} telemetry={telemetry} />)
  expect(screen.getByText('ANGLE / θ').nextElementSibling?.textContent).toBe('90.0°')
  expect(container.querySelector<SVGGElement>('.window-hud-needle')?.style.transform).toBe('rotate(90deg)')
})
test('ANGLE starts at zero and increases through a full turn before the home node', () => {
  const { rerender } = render(<WindowHud state={initialCockpitState} connected signal="idle" />)
  for (const [heading, expected] of [[-1,'0.0°'], [0,'0.0°'], [.25,'90.0°'], [.5,'180.0°'], [.75,'270.0°'], [1,'360.0°'], [2,'360.0°']] as const) {
    rerender(<WindowHud state={initialCockpitState} connected signal="idle" heading={heading} />)
    expect(screen.getByText('ANGLE / θ').nextElementSibling?.textContent).toBe(expected)
  }
})
test('planet telemetry distinguishes local home from a remote visit and restores galaxy readings', () => {
  const { container, rerender } = render(<WindowHud state={{...initialCockpitState, exterior:'home'}} connected signal="idle" heading={.5} telemetry={telemetry} />)
  for (const label of ['COORD / X', 'ANGLE / θ']) expect(screen.getByText(label).nextElementSibling?.textContent).toBe('LOCAL')
  expect(screen.getByText('LOCAL PLANET')).toBeTruthy()
  rerender(<WindowHud state={{...initialCockpitState, exterior:'visitor'}} connected signal="idle" heading={.5} telemetry={{...telemetry,visitor:{id:'remote',name:'远岸'}}} />)
  for (const label of ['COORD / X', 'ANGLE / θ']) expect(screen.getByText(label).nextElementSibling?.textContent).toBe('REMOTE')
  expect(screen.getByText('REMOTE PLANET')).toBeTruthy()
  expect(screen.getByText('REMOTE LOCK')).toBeTruthy()
  expect(container.querySelector('.window-hud-navigation')?.textContent).not.toContain('LOCAL')
  rerender(<WindowHud state={initialCockpitState} connected signal="idle" heading={.5} telemetry={telemetry} />)
  expect(screen.getByText('COORD / X').nextElementSibling?.textContent).toBe('001.250')
  expect(screen.getByText('ANGLE / θ').nextElementSibling?.textContent).toBe('180.0°')
})
test('HUD progress follows the nebula, holds for data and records only actual arrival without per-frame log spam', () => {
  const departing = cockpitReducer(initialCockpitState,{type:'depart',token:7,target:'visitor'})
  const flight: CockpitFlight = {token:7,from:'galaxy',to:'visitor',progress:.12,ready:false,sourceVisitor:null,targetVisitor:null,returning:false}
  const { container, rerender } = render(<WindowHud state={departing} connected signal="traveling" telemetry={telemetry} flight={flight} />)
  expect(screen.getByText('nebula --progress 012%')).toBeTruthy()
  expect(screen.getByText('jump --to "远岸"')).toBeTruthy()
  rerender(<WindowHud state={departing} connected signal="traveling" telemetry={telemetry} flight={{...flight,progress:.5}} />)
  expect(screen.getByText('nebula --progress 050%')).toBeTruthy()
  expect(screen.getByText('HOLD · WAITING FOR DATA')).toBeTruthy()
  expect(container.querySelectorAll('.window-hud-terminal li').length).toBe(1)
  expect(screen.queryByText('visited "远岸"')).toBeNull()
  const arrived = cockpitReducer(departing,{type:'arrive',token:7})
  rerender(<WindowHud state={arrived} connected signal="idle" telemetry={{...telemetry,visitor:{id:'far-shore',name:'远岸'}}} />)
  expect(screen.getByText('visited "远岸"')).toBeTruthy()
  expect(container.querySelectorAll('.window-hud-terminal li').length).toBe(2)
  expect(container.querySelector('.window-hud-flight-track')).toBeNull()
})
test('HUD logs failed trips honestly, caps session history and clears it for a different account', () => {
  const departing = cockpitReducer(initialCockpitState,{type:'depart',token:8,target:'visitor'})
  const flight: CockpitFlight = {token:8,from:'galaxy',to:'visitor',progress:.5,ready:false,sourceVisitor:null,targetVisitor:null,returning:false}
  const { container, rerender } = render(<WindowHud state={departing} connected signal="traveling" telemetry={telemetry} flight={flight} />)
  rerender(<WindowHud state={initialCockpitState} connected signal="error" telemetry={telemetry} />)
  expect(screen.getByText('jump interrupted; origin retained')).toBeTruthy()
  expect(screen.queryByText('visited "远岸"')).toBeNull()
  for(let i=0;i<8;i++) rerender(<WindowHud state={initialCockpitState} connected signal="idle" telemetry={{...telemetry,sector:{...telemetry.sector!,id:`sector-${i}`,label:`sector ${i}`}}} />)
  expect(container.querySelectorAll('.window-hud-terminal li').length).toBe(5)
  rerender(<WindowHud state={initialCockpitState} connected signal="idle" telemetry={{...telemetry,ownerId:'another-owner'}} />)
  expect(container.querySelectorAll('.window-hud-terminal li').length).toBe(1)
  expect(screen.queryByText('jump interrupted; origin retained')).toBeNull()
})
