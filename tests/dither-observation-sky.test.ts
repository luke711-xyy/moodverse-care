import { expect, test } from 'vitest'
import { createDitherMotion } from '../src/music/dither/motion'
import type { DitherFrame } from '../src/music/dither/renderer'

test('the observation camera moves the sky with the scene without accumulating offsets between frames', () => {
  const engine=createDitherMotion()
  const base: DitherFrame={width:1000,height:700,phase:0,assets:[],ambience:.65}
  engine.apply(base,0,0,false,false)
  const original=base.background!.stars.points.slice()
  const view={zoom:2,x:120,y:-40}
  const next=():DitherFrame=>({...base,background:undefined,observation:view})
  const first=next();engine.apply(first,0,0,false,false)
  expect(first.background!.stars.points[0]).toBeCloseTo(500+(original[0]-500)*2+120,3)
  expect(first.background!.stars.points[1]).toBeCloseTo(350+(original[1]-350)*2-40,3)
  expect(first.background!.clouds[0].backgroundView).toEqual(view)
  const second=next();engine.apply(second,0,0,false,false)
  expect(second.background!.stars.points).toEqual(first.background!.stars.points)
  const reset={...base,background:undefined};engine.apply(reset,0,0,false,false)
  expect(reset.background!.stars.points).toEqual(original)
})
