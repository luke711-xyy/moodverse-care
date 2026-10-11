import { expect, test } from 'vitest'
import { visibleObservationRect } from '../src/music/dither/observation'
import { framebufferScissor } from '../src/music/dither/renderer'

test('visible rectangle follows the CSS camera without changing world extent', () => {
  expect(visibleObservationRect(1000,700,2,{zoom:1,x:0,y:0})).toEqual({x:500,y:350,width:1000,height:700})
  expect(visibleObservationRect(1000,700,2,{zoom:.5,x:0,y:0})).toEqual({x:0,y:0,width:2000,height:1400})
  expect(visibleObservationRect(1000,700,2,{zoom:2,x:100,y:-50})).toEqual({x:700,y:550,width:500,height:350})
  expect(visibleObservationRect(1000,700,1,{zoom:1,x:0,y:0})).toEqual({x:0,y:0,width:1000,height:700})
})
test('pan limits expose canvas edges and raster clipping rounds outwards', () => {
  expect(visibleObservationRect(1000,700,2,{zoom:1,x:500,y:-350})).toEqual({x:0,y:700,width:1000,height:700})
  expect(framebufferScissor({x:10.2,y:20.4,width:30.1,height:40.2},100,100,150,150)).toEqual({x:15,y:59,width:46,height:61})
})
