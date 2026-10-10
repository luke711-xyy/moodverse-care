// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Stage } from '../src/music/dither/Stage'
import { createDitherSpec } from '../src/music/dither/appearance'
import type { StageFrame } from '../src/music/dither/stage-layout'
const capture = vi.hoisted(() => ({ frame: null as StageFrame | null }))
// Keep Stage's layout, view state and picking real; replace only GPU drawing.
vi.mock('../src/music/dither/DitherCanvas', () => ({ DitherCanvas: (props: { getFrame: (w:number,h:number,p:number)=>StageFrame; onFrame?: (f:StageFrame)=>void }) => {
  capture.frame=props.getFrame(1000,700,0); props.onFrame?.(capture.frame); return <canvas />
} }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function setup(kind: 'home' | 'visitor' | 'galaxy' = 'home') {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const planet = { id:'owner', displayName:'owner', tracks:['a','b'].map(id=>({id,title:id,artistId:id,artistName:id,genres:[],moodTags:[],versionLabel:'',officialUrl:null,coverUrl:null,durationSeconds:180})), visual:createDitherSpec({planetId:'owner',tracks:[],overrides:{size:1,pulse:0,pointer:'off',pixelSize:6}}) }
  const props: React.ComponentProps<typeof Stage> = {
    planet:planet as React.ComponentProps<typeof Stage>['planet'], visitedPlanet:kind==='visitor' ? {...planet,id:'guest'} as React.ComponentProps<typeof Stage>['visitedPlanet'] : null,
    friendSatellites:[],previewSeed:'owner',reducedMotion:false,managedTravel:true,productView:kind==='galaxy'?'galaxy':'planet',
    galaxySystems:[],galaxyRotation:0,routeJourney:0,regrouping:false,onSelectGalaxy:vi.fn(),onOpenPlanet:vi.fn(),onRotate:vi.fn(),onTourMove:vi.fn(),onMusicSelect:vi.fn(),onFriendSelect:vi.fn(),onPlanetSelect:vi.fn(),
  }
  const view=render(<Stage {...props} />), region=screen.getByRole('region')
  Object.defineProperty(region,'clientWidth',{value:1000}); Object.defineProperty(region,'clientHeight',{value:700})
  region.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:700,width:1000,height:700} as DOMRect)
  fireEvent(window,new Event('resize'))
  return { ...view,props,region }
}
function viewPose(region: HTMLElement) {
  const layer = region.querySelector<HTMLElement>('.dither-stage-scene')
  expect(layer, 'the visible scene must share one composited zoom layer').not.toBeNull()
  const values = layer!.style.transform.match(/translate\(([-\d.e]+)px,\s*([-\d.e]+)px\) scale\(([-\d.e]+)\)/)!
  expect(values).not.toBeNull()
  return { x:Number(values[1]),y:Number(values[2]),zoom:Number(values[3]) }
}
function click(region: HTMLElement,x:number,y:number) {
  fireEvent.pointerDown(region,{button:0,clientX:x,clientY:y})
  fireEvent.pointerUp(region,{button:0,clientX:x,clientY:y})
}
test.each(['home','visitor'] as const)('%s wheel and pinch magnify the composited picture without changing its material or scene geometry', kind => {
  const {region,props}=setup(kind), initial=capture.frame!
  const wheel=new WheelEvent('wheel',{deltaY:-160,clientX:500,clientY:350,bubbles:true,cancelable:true})
  fireEvent(region,wheel)
  expect(wheel.defaultPrevented).toBe(true)
  expect(capture.frame!.assets).toEqual(initial.assets)
  expect(capture.frame!.orbits).toEqual(initial.orbits)
  expect(capture.frame!.observation).toBeUndefined()
  const first=viewPose(region)
  expect(first.zoom).toBeCloseTo(1.377127764)
  fireEvent.wheel(region,{deltaY:-20,ctrlKey:true,clientX:500,clientY:350})
  const zoomed=viewPose(region)
  expect(zoomed.zoom).toBeCloseTo(1.616074402)
  fireEvent.pointerDown(region,{button:2,clientX:300,clientY:200})
  fireEvent.pointerMove(region,{buttons:2,clientX:410,clientY:250})
  fireEvent.pointerUp(region,{button:2,clientX:410,clientY:250})
  expect(viewPose(region)).toEqual({...zoomed,x:110,y:50})
  expect(capture.frame!.assets).toEqual(initial.assets)
  expect(props.onPlanetSelect).not.toHaveBeenCalled()
  const layer=region.querySelector('.dither-stage-scene')!
  expect(layer.contains(region.querySelector('canvas'))).toBe(true)
  expect(layer.contains(region.querySelector('.dither-stage-lines'))).toBe(true)
  expect(layer.contains(region.querySelector('.dither-stage-accessible'))).toBe(false)
  const body=initial.assets.find(a=>a.id.startsWith(kind+':'))!
  click(region,500+(body.x-500)*zoomed.zoom+110,350+(body.y-350)*zoomed.zoom+50)
  expect(props.onPlanetSelect).toHaveBeenCalledWith(kind)
})
test('blank click eases only the screen view home while keeping a planets own rotation', () => {
  vi.spyOn(performance,'now').mockReturnValue(0)
  let id=0
  const callbacks=new Map<number,FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{callbacks.set(++id,cb);return id})
  vi.stubGlobal('cancelAnimationFrame',(key:number)=>callbacks.delete(key))
  const advance=(now:number)=>act(()=>{const next=[...callbacks.values()];callbacks.clear();next.forEach(cb=>cb(now))})
  const {region}=setup(), original=capture.frame!.assets[0]
  fireEvent.wheel(region,{deltaY:-200,clientX:500,clientY:350})
  fireEvent.pointerDown(region,{button:2,clientX:200,clientY:200});fireEvent.pointerMove(region,{clientX:300,clientY:230});fireEvent.pointerUp(region,{button:2,clientX:300,clientY:230})
  fireEvent.pointerDown(region,{button:0,clientX:500,clientY:350});fireEvent.pointerMove(region,{clientX:530,clientY:410});fireEvent.pointerUp(region,{button:0,clientX:530,clientY:410})
  const zoomed=viewPose(region), orientation=capture.frame!.assets[0].orientation
  click(region,2,2)
  expect(viewPose(region)).toEqual(zoomed)
  advance(150)
  expect(viewPose(region).zoom).toBeGreaterThan(1)
  expect(viewPose(region).zoom).toBeLessThan(zoomed.zoom)
  advance(300)
  expect(viewPose(region)).toEqual({zoom:1,x:0,y:0})
  expect(capture.frame!.assets[0].radius).toBeCloseTo(original.radius)
  expect(orientation).not.toEqual([0,0,0,1])
  expect(capture.frame!.assets[0].orientation).toEqual(orientation)
})
test('Galaxy controls are unchanged and destinations clear the magnification', () => {
  const {region,props,rerender}=setup()
  fireEvent.wheel(region,{deltaY:-500,clientX:500,clientY:350})
  rerender(<Stage {...props} productView="galaxy" />)
  expect(viewPose(region)).toEqual({zoom:1,x:0,y:0})
  const wheel=new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true})
  fireEvent(region,wheel);expect(wheel.defaultPrevented).toBe(false)
  fireEvent.pointerDown(region,{button:2,clientX:100,clientY:100});fireEvent.pointerMove(region,{clientX:150,clientY:130});fireEvent.pointerUp(region,{button:2,clientX:150,clientY:130})
  expect(props.onTourMove).not.toHaveBeenCalled()
  rerender(<Stage {...props} />)
  expect(viewPose(region)).toEqual({zoom:1,x:0,y:0})
})
test('native Mac gestures anchor the screen picture and never double-apply or modify particle detail', () => {
  const {region,props,rerender}=setup(), before=capture.frame!.assets
  const gesture=(type:string,scale:number)=>{
    const event=new Event(type,{bubbles:true,cancelable:true})
    Object.assign(event,{scale,clientX:200,clientY:100});fireEvent(region,event);return event
  }
  expect(gesture('gesturestart',1).defaultPrevented).toBe(true)
  gesture('gesturechange',2)
  expect(viewPose(region)).toEqual({zoom:2,x:300,y:250})
  fireEvent.wheel(region,{deltaY:-100,ctrlKey:true,clientX:200,clientY:100})
  expect(viewPose(region)).toEqual({zoom:2,x:300,y:250})
  gesture('gestureend',2)
  fireEvent.wheel(region,{deltaY:-10000,ctrlKey:true,clientX:200,clientY:100})
  expect(viewPose(region).zoom).toBe(6)
  expect(capture.frame!.assets).toEqual(before)
  expect(capture.frame!.assets.every(a=>!a.detail && a.pixelSize===undefined)).toBe(true)
  rerender(<Stage {...props} interactive={false} />)
  const wheel=new WheelEvent('wheel',{deltaY:1000,bubbles:true,cancelable:true})
  fireEvent(region,wheel);expect(wheel.defaultPrevented).toBe(false)
  expect(viewPose(region).zoom).toBe(6)
})
