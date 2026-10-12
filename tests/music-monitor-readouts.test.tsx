// @vitest-environment jsdom
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { GalaxyTelemetry, PersonalTelemetry, SignalMap, signalMapLayout } from '../src/music/cockpit/MonitorReadouts'

afterEach(cleanup)
test('Galaxy readout follows the current sector and classification instead of personal music metadata', () => {
  const {container,rerender}=render(<GalaxyTelemetry grouping="genre" systemCount={8} status="ready" sector={{label:'Ambient',index:2,visiblePlanets:16,totalPlanets:42}} />)
  const value=(label:string)=>container.querySelector(`[data-metric="${label}"] dd`)?.textContent
  expect(container.querySelector('.telemetry-header')?.textContent).toContain('GALAXY / NAV')
  expect(container.querySelector('.telemetry-callsign')?.textContent).toBe('Ambient')
  expect(value('MAP BY')).toBe('曲风');expect(value('SECTOR')).toBe('03/08')
  expect(value('VISIBLE')).toBe('16');expect(value('IN GROUP')).toBe('42')
  expect(container.querySelector('[aria-label="星系轨道示意图"]')).toBeTruthy()
  expect(container.querySelector('.telemetry-planet-thumbnail')).toBeNull()
  expect(container.textContent).not.toMatch(/SONGS|MOMENTS|BPM|AUDIO/)
  rerender(<GalaxyTelemetry grouping="artist" systemCount={4} status="ready" sector={{label:'星际旅人',index:0,visiblePlanets:3,totalPlanets:7}} />)
  expect(container.querySelector('.telemetry-callsign')?.textContent).toBe('星际旅人')
  expect(value('MAP BY')).toBe('艺人');expect(value('SECTOR')).toBe('01/04')
  expect(value('VISIBLE')).toBe('03');expect(value('IN GROUP')).toBe('07')
  rerender(<GalaxyTelemetry grouping="song" systemCount={4} status="ready" sector={{label:'夜航',index:3,visiblePlanets:0,totalPlanets:0}} />)
  expect(value('MAP BY')).toBe('歌曲');expect(value('SECTOR')).toBe('04/04')
  expect(value('VISIBLE')).toBe('00');expect(value('IN GROUP')).toBe('00')
})
test('Galaxy loading retains the displayed chart basis and distinguishes unknown counts from an empty chart', () => {
  const {container,rerender}=render(<GalaxyTelemetry grouping="genre" systemCount={null} sector={null} status="loading" />)
  const value=(label:string)=>container.querySelector(`[data-metric="${label}"] dd`)?.textContent
  expect(container.querySelector('.telemetry-header')?.textContent).toContain('SYNCING')
  expect(value('SECTOR')).toBe('—');expect(value('VISIBLE')).toBe('—');expect(value('IN GROUP')).toBe('—')
  rerender(<GalaxyTelemetry grouping="genre" systemCount={8} status="loading" sector={{label:'Ambient',index:1,visiblePlanets:2,totalPlanets:20}} />)
  expect(container.querySelector('.telemetry-callsign')?.textContent).toBe('Ambient')
  expect(value('MAP BY')).toBe('曲风');expect(value('SECTOR')).toBe('02/08')
  rerender(<GalaxyTelemetry grouping="song" systemCount={0} sector={null} status="ready" />)
  expect(container.querySelector('.telemetry-callsign')?.textContent).toBe('暂无星系')
  expect(value('SECTOR')).toBe('—/00');expect(value('VISIBLE')).toBe('—')
  rerender(<GalaxyTelemetry grouping="song" systemCount={null} sector={null} status="error" />)
  expect(container.querySelector('.telemetry-header')?.textContent).toContain('LINK FAULT')
  expect(value('SECTOR')).toBe('—')
})
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
