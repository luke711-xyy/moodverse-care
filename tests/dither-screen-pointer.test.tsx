// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { DitherCanvas } from '../src/music/dither/DitherCanvas'
import type { DitherFrame } from '../src/music/dither/renderer'
import { createDitherSpec } from '../src/music/dither/appearance'

// Only replace the GPU boundary; exercise real input mapping and render frames.
vi.mock('../src/music/dither/renderer', () => ({createDitherRenderer:()=>({draw:()=>{},dispose:()=>{}})}))
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
test('state changes coalesce into the next frame without resetting the animation clock', () => {
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}))
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
  vi.spyOn(performance,'now').mockReturnValue(100)
  const pending = new Map<number, FrameRequestCallback>(); let id=0
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{pending.set(++id,callback);return id})
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>pending.delete(key))
  const makeFrame=(width:number,height:number,phase:number)=>({width,height,phase,assets:[]})
  const seen:DitherFrame[]=[]
  const view=render(<DitherCanvas getFrame={makeFrame} onFrame={frame=>seen.push(frame)} />)
  const initial=seen.length
  for(let i=0;i<5;i++) view.rerender(<DitherCanvas getFrame={(...args)=>makeFrame(...args)} onFrame={frame=>seen.push(frame)} />)
  expect(seen.length).toBe(initial)
  expect(pending.size).toBe(1)
  act(()=>{const callbacks=[...pending.values()];pending.clear();callbacks.forEach(callback=>callback(120))})
  expect(seen.length).toBe(initial+1)
  expect(seen.at(-1)!.phase).toBeGreaterThan(0)
})
test.each([60,120,144])('a %i Hz display caps expensive frames near 60 Hz and hiding stops animation', refreshRate => {
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}))
  let hidden=false
  vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden)
  vi.spyOn(performance,'now').mockReturnValue(100)
  const pending=new Map<number,FrameRequestCallback>();let id=0
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{pending.set(++id,callback);return id})
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>pending.delete(key))
  const frames:DitherFrame[]=[]
  render(<DitherCanvas getFrame={(width,height,phase)=>({width,height,phase,assets:[]})} onFrame={frame=>frames.push(frame)} />)
  for(let i=1;i<=refreshRate;i++) act(()=>{const callbacks=[...pending.values()];pending.clear();callbacks.forEach(callback=>callback(100+i*1000/refreshRate))})
  expect(frames.length).toBeGreaterThanOrEqual(59);expect(frames.length).toBeLessThanOrEqual(62)
  expect(frames.at(-1)!.phase).toBeCloseTo(.2,2)
  hidden=true;fireEvent(document,new Event('visibilitychange'))
  expect(pending.size).toBe(0)
})
test('captured pointer events on the fixed window still map into the magnified canvas', () => {
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}))
  vi.spyOn(document,'hidden','get').mockReturnValue(true)
  let frame: DitherFrame | undefined
  const view=render(<div className="dither-stage"><div className="dither-stage-scene">
    <DitherCanvas getFrame={(width,height)=>({width,height,phase:0,assets:[]})} onFrame={value=>{frame=value}} />
  </div></div>)
  const stage=view.container.querySelector('.dither-stage')!,canvas=view.container.querySelector('canvas')!
  Object.defineProperty(canvas,'clientWidth',{value:1000});Object.defineProperty(canvas,'clientHeight',{value:700})
  canvas.getBoundingClientRect=()=>({x:-400,y:-300,left:-400,top:-300,right:1600,bottom:1100,width:2000,height:1400} as DOMRect)
  // Pointer capture retargets to the fixed Stage, not the inner scene wrapper.
  fireEvent(stage,new MouseEvent('pointermove',{clientX:800,clientY:400,bubbles:true}))
  expect(frame!.pointer).toEqual({x:600,y:350})
  expect(frame!.width).toBe(1000)
  expect(frame!.height).toBe(700)
  fireEvent(stage,new MouseEvent('pointerleave'))
  expect(frame!.pointer).toBeUndefined()
})

test('overscanned canvas keeps foreground size and maps a half-scale screen click into the padded frame', () => {
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}))
  vi.spyOn(document,'hidden','get').mockReturnValue(true)
  let frame: DitherFrame | undefined
  const spec=createDitherSpec({planetId:'pointer',tracks:[],overrides:{pixelSize:6,pointer:'off'}})
  const view=render(<div className="dither-stage"><div className="dither-stage-scene">
    <DitherCanvas overscan={2} getFrame={(width,height)=>({width,height,phase:0,assets:[{id:'home',spec,x:width/2,y:height/2,radius:100}]})} onFrame={value=>{frame=value}} />
  </div></div>)
  const stage=view.container.querySelector('.dither-stage')!,canvas=view.container.querySelector('canvas')!
  Object.defineProperty(canvas,'clientWidth',{value:2000});Object.defineProperty(canvas,'clientHeight',{value:1400})
  // At the 50% floor the 200% canvas exactly covers the 1000×700 window.
  canvas.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:700,width:1000,height:700} as DOMRect)
  fireEvent(stage,new MouseEvent('pointermove',{clientX:500,clientY:350,bubbles:true}))
  expect(frame!.width).toBe(2000);expect(frame!.height).toBe(1400)
  expect(frame!.pointer).toEqual({x:1000,y:700})
  expect(frame!.assets[0]).toMatchObject({x:1000,y:700,radius:100})
  expect(frame!.assets[0].detail).toBeUndefined()
  expect(frame!.assets[0].spec).toBe(spec)
})
