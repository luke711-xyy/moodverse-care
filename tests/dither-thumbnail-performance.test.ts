import { afterEach, expect, test, vi } from 'vitest'
import * as appearance from '../src/music/dither/appearance'
import { renderDitherImage, sampleDitherPixel } from '../src/music/dither/sampler'
afterEach(()=>vi.restoreAllMocks())
test('thumbnail work scales with material cells, not the number of display pixels',()=>{
  const spec=appearance.createDitherSpec({planetId:'thumbnail-budget',tracks:[],overrides:{pixelSize:12}})
  const parameters=vi.spyOn(appearance,'effectiveDitherParameters')
  const pixels=renderDitherImage(spec,160)
  // 8px cells: only 20x20 material samples should be needed, not 160x160.
  expect(parameters.mock.calls.length).toBeLessThan(500)
  expect(pixels.some((value,index)=>index%4===3&&value>0)).toBe(true)
})
test('cell reuse preserves exact pixels, transparent rims and partial edge cells',()=>{
  for(const motif of ['flow','flower','score'] as const){
    const spec=appearance.createDitherSpec({planetId:'partial-cell',tracks:[],overrides:{pixelSize:12,motif}})
    const size=65,cell=3,image=renderDitherImage(spec,size,.4)
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const gx=Math.floor(x/cell),gy=Math.floor(y/cell)
      const expected=sampleDitherPixel(spec,((gx+.5)*cell/size-.5)*2.4,((gy+.5)*cell/size-.5)*2.4,.4,gx,gy)
      expect([...image.subarray((y*size+x)*4,(y*size+x)*4+4)]).toEqual(expected)
    }
  }
})
