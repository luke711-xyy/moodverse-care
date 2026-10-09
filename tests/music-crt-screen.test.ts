import { expect, test } from 'vitest'
import { displayToSource, sourceToDisplay, screenDepth, crtDisplacementMap } from '../src/music/cockpit/screen-math'
test.each([{width:1400,height:700},{width:300,height:530},{width:260,height:96}])('curved-glass pointer mapping round-trips on $width × $height', size => {
  for (const [u,v] of [[.05,.05],[.95,.05],[.2,.85],[.9,.9],[.5,.5]]) {
    const point = displayToSource(u*size.width,v*size.height,size)
    const inverse = sourceToDisplay(point.x,point.y,size)
    expect(inverse.x).toBeCloseTo(u*size.width,2); expect(inverse.y).toBeCloseTo(v*size.height,2)
  }
  expect(screenDepth(size)).toBeLessThanOrEqual(44)
})
test('lens has a fixed center and increasingly bent corners, with an embedded vector field', () => {
  const size = {width:1000,height:600}
  expect(displayToSource(500,300,size)).toEqual({x:500,y:300})
  expect(displayToSource(900,500,size).x).toBeGreaterThan(900)
  expect(displayToSource(900,500,size,0)).toEqual({x:900,y:500})
  expect(crtDisplacementMap()).toMatch(/^data:image\/svg\+xml,/)
})
