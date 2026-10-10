import { expect, test } from 'vitest'
import { clampObservation, expandObservationFrame, zoomObservation } from '../src/music/dither/observation'
import { createDitherSpec } from '../src/music/dither/appearance'

test('zoom-out stops when the oversized picture exactly fills the viewport and removes pan', () => {
  const camera=zoomObservation({zoom:1,x:200,y:-100},.01,{x:100,y:50},1000,600)
  expect(camera).toEqual({zoom:.5,x:0,y:0})
  expect(zoomObservation(camera,.5,{x:999,y:599},1000,600)).toEqual(camera)
})
test('panning cannot uncover an edge at any zoom', () => {
  expect(clampObservation({zoom:.75,x:999,y:-999},1000,600)).toEqual({zoom:.75,x:250,y:-150})
  expect(clampObservation({zoom:.5,x:999,y:999},1000,600)).toEqual({zoom:.5,x:0,y:0})
})
test('overscan adds background area without enlarging planet geometry or changing material', () => {
  const asset={id:'home:a',x:510,y:294,radius:180,spec:createDitherSpec({planetId:'a',tracks:[]})}
  const source={width:1000,height:600,phase:0,assets:[asset]}
  const result=expandObservationFrame(source,2)
  expect(result).toMatchObject({width:2000,height:1200,assets:[{x:1010,y:594,radius:180}]})
  expect(result.assets[0].spec).toBe(asset.spec)
  expect(source.assets[0]).toBe(asset)
  expect(source.assets[0].x).toBe(510)
})
