// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { clientPoint, logicalSize, localToScreen, screenToLocal } from '../src/music/viewport'
import { displayToSource, sourceToDisplay } from '../src/music/cockpit/screen-math'

test.each([false, true])('landscape coordinates round-trip, quarter turn = %s', rotated => {
  const size = { width: 844, height: 390 }
  const rect = { left: 13, top: 27, width: rotated ? 390 : 844, height: rotated ? 844 : 390, right: rotated ? 403 : 857 }
  for (const [x, y] of [[0,0], [844,390], [422,195], [31,300]]) {
    const point = { x, y }
    const client = localToScreen(point, rect, size, rotated)
    expect(screenToLocal(client, rect, size, rotated)).toEqual(point)
    // Compose both transforms: rotating the app must not break curved CRT input.
    const displayed = sourceToDisplay(x,y,size)
    const pixel = localToScreen(displayed,rect,size,rotated)
    const local = screenToLocal(pixel,rect,size,rotated)
    const source = displayToSource(local.x,local.y,size)
    expect(source.x).toBeCloseTo(x, 2); expect(source.y).toBeCloseTo(y, 2)
  }
})
test('a portrait bounding box is not used as the landscape canvas resolution', () => {
  const element = document.createElement('div')
  document.body.append(element)
  element.style.setProperty('--music-viewport-rotation','90')
  Object.defineProperty(element, 'clientWidth', { value: 844 })
  Object.defineProperty(element, 'clientHeight', { value: 390 })
  element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 390, width: 390, height: 844 } as DOMRect)
  expect(logicalSize(element)).toEqual({ width: 844, height: 390 })
  expect(clientPoint(element, 195, 422)).toEqual({ x: 422, y: 195 })
  expect(clientPoint(element, 90, 31)).toEqual({ x: 31, y: 300 })
  element.remove()
})
