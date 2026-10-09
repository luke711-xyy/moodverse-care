// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Stage } from '../src/music/dither/Stage'
import type { DitherFrame } from '../src/music/dither/renderer'
import { createDitherSpec } from '../src/music/dither/appearance'
import { buildDitherStageFrame } from '../src/music/dither/stage-layout'
import { hitTestDitherAssets } from '../src/music/dither/layout'
import * as ditherLayout from '../src/music/dither/layout'
const capture = vi.hoisted(() => ({ frame: null as DitherFrame | null }))
vi.mock('../src/music/dither/DitherCanvas', () => ({ DitherCanvas: (props: { getFrame: (w: number, h: number, phase: number) => DitherFrame; onFrame?: (frame: DitherFrame) => void }) => { capture.frame = props.getFrame(1000, 700, 0); props.onFrame?.(capture.frame); return <canvas /> } }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('the own planet and its orbit are 85% of the unchanged visitor display scale', () => {
  const owner = createDitherSpec({ planetId: 'owner', tracks: [] })
  const input = { width: 1000, height: 700, phase: 0, owner, systems: [], home: 1, journey: 0, rotation: 0, friends: [], music: [] }
  const own = buildDitherStageFrame(input)
  const visitor = buildDitherStageFrame({ ...input, visitor: owner })
  expect(own.assets[0].radius).toBeCloseTo(visitor.assets[0].radius * .85)
  expect(own.assets[0].x).toBe(visitor.assets[0].x)
  expect(own.assets[0].y).toBe(visitor.assets[0].y)
  expect(own.orbits[0].rx).toBeCloseTo(visitor.orbits[0].rx * .85)
  expect(own.orbits[0].ry).toBeCloseTo(visitor.orbits[0].ry * .85)
})

test('rear satellites are painted and picked behind the owner; front satellites stay visible', () => {
  const frame = buildDitherStageFrame({ width: 1000, height: 700, phase: 0, owner: createDitherSpec({ planetId: 'owner', tracks: [], overrides: { form: 'particles', size: 1, pulse: 0, pointer: 'off' } }), systems: [], home: 1, journey: 0, rotation: 0, friends: [], music: [{ id: 'right' }, { id: 'front' }, { id: 'left' }, { id: 'rear' }] })
  const ownerIndex = frame.assets.findIndex(a => a.id.startsWith('home:'))
  const rearIndex = frame.assets.findIndex(a => a.id === 'music:rear')
  const frontIndex = frame.assets.findIndex(a => a.id === 'music:front')
  expect(rearIndex).toBeLessThan(ownerIndex)
  expect(frontIndex).toBeGreaterThan(ownerIndex)
  const rear = frame.assets[rearIndex], front = frame.assets[frontIndex]
  expect(hitTestDitherAssets(frame.assets, rear.x, rear.y)?.id).toMatch(/^home:/)
  expect(hitTestDitherAssets(frame.assets, front.x, front.y)?.id).toBe('music:front')
  expect(front.radius).toBeGreaterThan(rear.radius)
})

test('foreground nebula travel shrinks the owner to a point and grows it back on the reciprocal route', () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(performance, 'now').mockReturnValue(0)
  let nextId = 0, now = 0
  const pending = new Map<number, FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending.set(++nextId, callback); return nextId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id))
  const advance = (frames: number) => {
    for (let i = 0; i < frames; i++) act(() => { now += 50; const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(now)) })
  }
  const props: React.ComponentProps<typeof Stage> = {
    planet: { id: 'owner', tracks: [], visual: createDitherSpec({ planetId: 'owner', tracks: [] }) } as React.ComponentProps<typeof Stage>['planet'],
    friendSatellites: [], visitedPlanet: null, previewSeed: 'owner', reducedMotion: false, productView: 'planet',
    galaxySystems: [], galaxyRotation: 0, routeJourney: 0, regrouping: false,
    onSelectGalaxy: vi.fn(), onOpenPlanet: vi.fn(), onRotate: vi.fn(), onTourMove: vi.fn(), onMusicSelect: vi.fn(), onFriendSelect: vi.fn(),
  }
  const view = render(<Stage {...props} />)
  const initialRadius = capture.frame!.assets.find(a => a.id.startsWith('home:'))!.radius
  view.rerender(<Stage {...props} productView="galaxy" />)
  advance(21)
  expect(capture.frame!.assets.find(a => a.id.startsWith('home:'))!.radius).toBeCloseTo(initialRadius * .26875)
  expect(capture.frame!.assets.find(a => a.id === 'nebula')!.opacity).toBeCloseTo(.92)
  expect(capture.frame!.assets.find(a => a.id === 'nebula')!.kind).toBe('nebula')
  advance(21)
  expect(capture.frame!.assets.some(a => a.id.startsWith('home:') || a.id === 'nebula')).toBe(false)
  expect(screen.getByRole('region').dataset.traveling).toBe('false')
  now = 0
  view.rerender(<Stage {...props} />)
  advance(21)
  expect(capture.frame!.assets.find(a => a.id.startsWith('home:'))!.radius).toBeCloseTo(initialRadius * .26875)
  expect(capture.frame!.assets.find(a => a.id === 'nebula')!.opacity).toBeCloseTo(.92)
  advance(21)
  expect(capture.frame!.assets.find(a => a.id.startsWith('home:'))!.radius).toBe(initialRadius)
  expect(capture.frame!.assets.some(a => a.id === 'nebula')).toBe(false)
  expect(screen.getByRole('region').dataset.traveling).toBe('false')
})
test('own planet rotation still responds after returning from a focused galaxy', () => {
  const props: React.ComponentProps<typeof Stage> = {
    planet: { id: 'owner', tracks: [], visual: createDitherSpec({ planetId: 'owner', tracks: [] }) } as React.ComponentProps<typeof Stage>['planet'],
    friendSatellites: [], visitedPlanet: null, previewSeed: 'owner', reducedMotion: true, productView: 'planet',
    focusedGalaxy: 'previous', galaxySystems: [], galaxyRotation: 2, routeJourney: 0, regrouping: false,
    onSelectGalaxy: vi.fn(), onOpenPlanet: vi.fn(), onRotate: vi.fn(), onTourMove: vi.fn(), onMusicSelect: vi.fn(), onFriendSelect: vi.fn(),
  }
  render(<Stage {...props} />)
  const initial = capture.frame!.assets[0].rotation
  fireEvent.keyDown(screen.getByRole('region', { name: '二维音乐宇宙' }), { key: 'ArrowRight' })
  expect(capture.frame!.assets[0].rotation).toBeCloseTo((initial ?? 0) + .15 * .25)
  expect(props.onRotate).not.toHaveBeenCalled()
})

test('an open personal terminal cannot change the Galaxy exterior or its controls', () => {
  const props: React.ComponentProps<typeof Stage> = {
    planet: { id: 'owner', tracks: [], visual: createDitherSpec({ planetId: 'owner', tracks: [] }) } as React.ComponentProps<typeof Stage>['planet'],
    friendSatellites: [], visitedPlanet: null, previewSeed: 'owner', reducedMotion: true,
    productView: 'orbit', exteriorView: 'galaxy', galaxySystems: [], galaxyRotation: 0, routeJourney: 0, regrouping: false,
    onSelectGalaxy: vi.fn(), onOpenPlanet: vi.fn(), onRotate: vi.fn(), onTourMove: vi.fn(), onMusicSelect: vi.fn(), onFriendSelect: vi.fn(),
  }
  render(<Stage {...props} />)
  expect(capture.frame!.assets.some(asset => asset.id.startsWith('home:'))).toBe(false)
  expect(capture.frame!.ambience).toBe(1)
  fireEvent.keyDown(screen.getByRole('region', { name: '二维音乐宇宙' }), { key: 'ArrowRight' })
  expect(props.onTourMove).toHaveBeenCalledWith(.15)
})

test('live nebula ambience is retained behind an own or visited planet', () => {
  const input = {width:1000,height:700,phase:0,owner:createDitherSpec({planetId:'owner',tracks:[]}),systems:[],home:1,journey:0,rotation:0,friends:[],music:[]}
  expect(buildDitherStageFrame(input).ambience).toBeCloseTo(.65)
  expect(buildDitherStageFrame({...input,visitor:createDitherSpec({planetId:'visitor',tracks:[]})}).ambience).toBeCloseTo(.65)
})

test('rotated touch dragging uses landscape X, not the physical screen X', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const props: React.ComponentProps<typeof Stage> = {
    planet:null, friendSatellites:[],visitedPlanet:null,previewSeed:'landscape',reducedMotion:true,
    productView:'galaxy',galaxySystems:[],galaxyRotation:0,routeJourney:0,regrouping:false,
    onSelectGalaxy:vi.fn(),onOpenPlanet:vi.fn(),onRotate:vi.fn(),onTourMove:vi.fn(),onMusicSelect:vi.fn(),onFriendSelect:vi.fn(),
  }
  render(<Stage {...props} />)
  const region=screen.getByRole('region',{name:'二维音乐宇宙'})
  Object.defineProperty(region,'clientWidth',{value:844})
  Object.defineProperty(region,'clientHeight',{value:390})
  region.getBoundingClientRect=()=>({left:0,top:0,right:390,width:390,height:844} as DOMRect)
  region.style.setProperty('--music-viewport-rotation','90')
  fireEvent.pointerDown(region,{button:0,clientX:300,clientY:100})
  fireEvent.pointerMove(region,{clientX:300,clientY:140})
  expect(props.onTourMove).toHaveBeenCalledWith(-40*.0014)
  fireEvent.pointerUp(region,{clientX:300,clientY:140})
  expect(props.onSelectGalaxy).not.toHaveBeenCalled()
})

test('a visible satellite is picked at its rotated screen location', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const planet = {id:'owner',tracks:[{id:'right'},{id:'front'},{id:'left'},{id:'rear'}],visual:createDitherSpec({planetId:'owner',tracks:[],overrides:{form:'particles',pointer:'off',pulse:0}})} as React.ComponentProps<typeof Stage>['planet']
  const onMusicSelect = vi.fn()
  render(<Stage planet={planet} friendSatellites={[]} visitedPlanet={null} previewSeed="owner" reducedMotion productView="planet"
    galaxySystems={[]} galaxyRotation={0} routeJourney={0} regrouping={false}
    onSelectGalaxy={vi.fn()} onOpenPlanet={vi.fn()} onRotate={vi.fn()} onTourMove={vi.fn()} onMusicSelect={onMusicSelect} onFriendSelect={vi.fn()} />)
  const region=screen.getByRole('region',{name:'二维音乐宇宙'})
  Object.defineProperty(region,'clientWidth',{value:1000})
  Object.defineProperty(region,'clientHeight',{value:700})
  region.getBoundingClientRect=()=>({left:0,top:0,right:700,width:700,height:1000} as DOMRect)
  region.style.setProperty('--music-viewport-rotation','90')
  fireEvent(window, new Event('resize'))
  const front=capture.frame!.assets.find(asset=>asset.id==='music:front')!
  // Music satellites have a perforated dither silhouette: pick a painted cell,
  // not the transparent center of their ring.
  let painted: {x:number;y:number} | undefined
  const range=Math.ceil(front.radius)
  for(let dx=-range;dx<range && !painted;dx++) for(let dy=-range;dy<range;dy++) {
    const x=Math.round(front.x)+dx,y=Math.round(front.y)+dy
    if(hitTestDitherAssets(capture.frame!.assets,x,y,{mode:'webgl2'})?.id==='music:front') { painted={x,y}; break }
  }
  expect(painted).toBeTruthy()
  const event={button:0,clientX:700-painted!.y,clientY:painted!.x}
  const picking = vi.spyOn(ditherLayout,'hitTestDitherAssets')
  fireEvent.pointerDown(region,event); fireEvent.pointerUp(region,event)
  expect(picking).toHaveBeenCalledWith(expect.any(Array),painted!.x,painted!.y,expect.any(Object))
  expect(picking.mock.calls.at(-1)?.[0].find(asset=>asset.id==='music:front')).toEqual(front)
  expect(picking.mock.results.at(-1)?.value?.id).toBe('music:front')
  expect(onMusicSelect).toHaveBeenCalledWith('front')
})
test('clicking a visible galaxy planet opens the visitor flow, rather than just disturbing pixels', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const onOpenPlanet=vi.fn()
  render(<Stage planet={null} friendSatellites={[]} visitedPlanet={null} previewSeed="owner" reducedMotion productView="galaxy"
    focusedGalaxy="g" galaxySystems={[{id:'g',key:'g',label:'test',color:'#ddd',planets:[{id:'p',alias:'visitor',tagline:'',spec:createDitherSpec({planetId:'p',tracks:[],overrides:{size:1}})}]}]} galaxyRotation={0} routeJourney={0} regrouping={false}
    onSelectGalaxy={vi.fn()} onOpenPlanet={onOpenPlanet} onRotate={vi.fn()} onTourMove={vi.fn()} onMusicSelect={vi.fn()} onFriendSelect={vi.fn()} />)
  const body=capture.frame!.assets.find(a=>a.id==='planet:p')!
  const region=screen.getByRole('region',{name:'二维音乐宇宙'})
  const event={button:0,clientX:body.x,clientY:body.y}
  fireEvent.pointerDown(region,event);fireEvent.pointerUp(region,event)
  expect(onOpenPlanet).toHaveBeenCalledWith(expect.objectContaining({id:'p'}),'g')
})
