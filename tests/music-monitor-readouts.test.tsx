// @vitest-environment jsdom
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { PersonalTelemetry, SignalMap, signalMapLayout } from '../src/music/cockpit/MonitorReadouts'

afterEach(cleanup)
test('visitor telemetry identifies the public planet link instead of showing personal request counts', () => {
  const {container}=render(<PersonalTelemetry context="visitor" planetName="客星" songs={2} moments={1} trackTitle="远岸" requests={3} />)
  expect(container.querySelector('.telemetry-header')?.textContent).toContain('VISITOR / NAV')
  expect(container.querySelector('.telemetry-header')?.textContent).toContain('PUBLIC LINK')
  expect(container.querySelector('.telemetry-header')?.textContent).not.toContain('REQUESTS')
})
test('telemetry treats songs and Moments as peer data and never substitutes a tempo for missing or invalid metadata', () => {
  const {container,rerender}=render(<PersonalTelemetry planetName="远岸" songs={5} moments={2} bpm={127.6} durationSeconds={203} trackTitle="Between Tides" requests={3} />)
  const value=(label:string)=>container.querySelector(`[data-metric="${label}"] dd`)?.textContent
  expect([...container.querySelectorAll('.telemetry-metrics dt')].map(el=>el.textContent)).toEqual(['SONGS','MOMENTS','BPM','LENGTH'])
  expect(value('SONGS')).toBe('05');expect(value('MOMENTS')).toBe('02');expect(value('BPM')).toBe('127.6');expect(value('LENGTH')).toBe('3:23')
  expect(container.querySelector('.telemetry-header')?.textContent).toContain('3 REQUESTS')
  for(const bpm of [undefined,null,NaN,Infinity,0,-1]) {
    rerender(<PersonalTelemetry planetName="远岸" songs={0} moments={null} bpm={bpm} durationSeconds={null} trackTitle="Unknown Tempo" />)
    expect(value('BPM')).toBe('—');expect(value('LENGTH')).toBe('—');expect(value('MOMENTS')).toBe('—')
    expect(value('SONGS')).toBe('00')
  }
})
test('relative signal chart retains every real name and ID even when more than nine contacts require a taller map', () => {
  const signals=Array.from({length:25},(_,index)=>({planetId:`planet-${index}`,displayName:`第${index}颗有很长名字的音乐星球`}))
  const layout=signalMapLayout(signals)
  expect(layout).toEqual(signalMapLayout(signals))
  expect(layout.height).toBeGreaterThan(300)
  for(const node of layout.nodes) { expect(node.x).toBeGreaterThanOrEqual(54);expect(node.x).toBeLessThanOrEqual(306);expect(node.y).toBeLessThan(layout.height-13) }
  const {container}=render(<SignalMap signals={signals} title="SCAN RESULTS" scanning />)
  expect(container.querySelector('small')?.textContent).toBe('25 SIGNALS')
  expect(container.querySelectorAll('[data-signal-id]')).toHaveLength(25)
  for(const signal of signals) expect(container.querySelector(`[data-signal-id="${signal.planetId}"] title`)?.textContent).toBe(signal.displayName)
  expect(container.querySelector('.cockpit-signal-map')?.getAttribute('data-dense')).toBe('true')
  expect(container.querySelectorAll('button,a,input')).toHaveLength(0)
})
test('clearing contacts removes all named map nodes without inventing replacements and stops the scan state', () => {
  const {container,rerender}=render(<SignalMap signals={[{planetId:'real-a',displayName:'ALTAIR'}]} title="SCAN RESULTS" scanning />)
  expect(container.querySelector('[data-signal-id="real-a"] text')?.textContent).toBe('ALTAIR')
  rerender(<SignalMap signals={[]} title="SYSTEM ON" scanning={false} />)
  expect(container.querySelectorAll('[data-signal-id]')).toHaveLength(0)
  expect(container.querySelector('small')?.textContent).toBe('0 SIGNALS')
  expect(container.querySelector('.signal-no-contacts')?.textContent).toBe('NO CONTACTS')
  expect(container.querySelector('.cockpit-signal-map')?.getAttribute('data-scanning')).toBe('false')
})
