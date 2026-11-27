// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Stage } from '../src/music/dither/Stage'
import { createDitherSpec, effectiveDitherParameters } from '../src/music/dither/appearance'
import type { DitherFrame } from '../src/music/dither/renderer'

const capture = vi.hoisted(() => ({ frames: [] as DitherFrame[] }))
vi.mock('../src/music/dither/DitherCanvas', () => ({ DitherCanvas: (props: { getFrame: (w:number,h:number,phase:number)=>DitherFrame; onFrame?: (frame:DitherFrame)=>void }) => {
  const frame = props.getFrame(1000,700,0)
  capture.frames.push(frame); props.onFrame?.(frame)
  return <canvas />
} }))
afterEach(() => { cleanup(); capture.frames=[]; vi.restoreAllMocks() })

test.each([{delta:500,zoom:.5},{delta:-500,zoom:Math.exp(1)}])('round trip preserves independent scene cameras at planet zoom $zoom', ({delta,zoom}) => {
  const props: React.ComponentProps<typeof Stage> = {
    planet:{id:'owner',tracks:[],visual:createDitherSpec({planetId:'owner',tracks:[]})} as React.ComponentProps<typeof Stage>['planet'],
    friendSatellites:[], visitedPlanet:null, previewSeed:'owner', reducedMotion:true, productView:'planet', exteriorView:'home', managedTravel:true,
    galaxySystems:[{id:'g',key:'g',label:'g',color:'#ffffff',planets:[]}], galaxyRotation:0, routeJourney:0, regrouping:false,
    onSelectGalaxy:vi.fn(),onOpenPlanet:vi.fn(),onRotate:vi.fn(),onTourMove:vi.fn(),onMusicSelect:vi.fn(),onFriendSelect:vi.fn(),
  }
  const view=render(<Stage {...props} />)
  const region=screen.getByRole('region',{name:'二维音乐宇宙'})
  Object.defineProperty(region,'clientWidth',{value:1000})
  Object.defineProperty(region,'clientHeight',{value:700})
  region.getBoundingClientRect=()=>({left:0,top:0,right:1000,bottom:700,width:1000,height:700} as DOMRect)
  fireEvent.wheel(region,{deltaY:delta,clientX:500,clientY:350})
  const savedTransform=view.container.querySelector<HTMLElement>('.dither-stage-scene')!.style.transform
  expect(savedTransform).toBe(`translate(0px, 0px) scale(${zoom})`)
  const homeBefore=capture.frames.at(-1)!.assets.find(a=>a.id.startsWith('home:'))!
  const trip={token:1,from:'home',to:'galaxy',progress:.85,ready:true,sourceVisitor:null,targetVisitor:null,returning:false} as const

  capture.frames=[]
  view.rerender(<Stage {...props} flight={trip} />)
  const galaxyDuring=view.container.querySelector<HTMLElement>('[data-scene-destination="galaxy"]')
  expect(galaxyDuring).not.toBeNull()
  expect(galaxyDuring!.style.transform).toBe('translate(0px, 0px) scale(1)')
  expect(view.container.querySelector<HTMLElement>('[data-scene-destination="home"]')!.style.transform).toBe(savedTransform)
  const galaxyBody=capture.frames.flatMap(f=>f.assets).find(a=>a.id==='system:g')!
  const cloudLayer=view.container.querySelector<HTMLElement>('.dither-stage-flight-cloud')!
  expect(cloudLayer).not.toBeNull()
  expect(cloudLayer.closest('.dither-stage-scene')).toBeNull()
  expect(cloudLayer.style.transform).toBe('')
  const cloud=capture.frames.find(f=>f.assets.length===1 && f.assets[0].id==='nebula')!.assets[0]
  expect(cloud.radius).toBe(720)
  expect(effectiveDitherParameters(cloud.spec).pixelSize).toBe(4)
  expect(cloud.pixelSize).toBeUndefined()

  capture.frames=[]
  view.rerender(<Stage {...props} exteriorView="galaxy" flight={null} />)
  expect(view.container.querySelector<HTMLElement>('[data-scene-destination="galaxy"]')!.style.transform).toBe(galaxyDuring!.style.transform)
  const arrivedGalaxy=capture.frames.at(-1)!.assets.find(a=>a.id==='system:g')!
  expect([arrivedGalaxy.x,arrivedGalaxy.y,arrivedGalaxy.radius]).toEqual([galaxyBody.x,galaxyBody.y,galaxyBody.radius])

  capture.frames=[]
  view.rerender(<Stage {...props} exteriorView="galaxy" flight={{...trip,token:2,from:'galaxy',to:'home'}} />)
  const returningHome=view.container.querySelector<HTMLElement>('[data-scene-destination="home"]')!
  expect(returningHome.style.transform).toBe(savedTransform)
  const homeDuring=capture.frames.flatMap(f=>f.assets).find(a=>a.id.startsWith('home:'))!
  expect([homeDuring.x,homeDuring.y,homeDuring.radius]).toEqual([homeBefore.x,homeBefore.y,homeBefore.radius])

  view.rerender(<Stage {...props} flight={null} />)
  expect(view.container.querySelector<HTMLElement>('[data-scene-destination="home"]')!.style.transform).toBe(savedTransform)
  expect(view.container.querySelectorAll('.dither-stage-scene')).toHaveLength(1)
  expect(view.container.querySelector('.dither-stage-flight-cloud')).toBeNull()
})
