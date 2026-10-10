// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { DitherCanvas } from '../src/music/dither/DitherCanvas'
import type { DitherFrame } from '../src/music/dither/renderer'
import { createDitherSpec } from '../src/music/dither/appearance'

// Only replace the GPU boundary; exercise real input mapping and render frames.
vi.mock('../src/music/dither/renderer', () => ({createDitherRenderer:()=>({draw:()=>{},dispose:()=>{}})}))
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
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
