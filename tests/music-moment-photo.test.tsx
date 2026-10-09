// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MomentPhotoPicker, ditherMomentPhoto } from '../src/music/MomentPhoto'
import { MOMENT_PHOTO_MAX_BYTES, validateMomentPhoto, momentPhotoContentType } from '../src/music/moment-photo'

beforeEach(() => {
  vi.stubGlobal('React',React)
  URL.createObjectURL = vi.fn(() => 'blob:photo-preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

test('one file control validates formats and inclusive 10 MB limit', () => {
  const change = vi.fn()
  render(<MomentPhotoPicker file={null} error="" busy={false} onChange={change} />)
  const input = screen.getByLabelText(/照片 · 最多/) as HTMLInputElement
  expect(input.multiple).toBe(false)
  expect(input.accept).toContain('.jpeg')
  const valid = new File(['photo'],'photo.JPG',{type:'image/jpeg'})
  fireEvent.change(input,{target:{files:[valid]}})
  expect(change).toHaveBeenLastCalledWith(valid,'')
  fireEvent.change(input,{target:{files:[valid,valid]}})
  expect(change).toHaveBeenLastCalledWith(null,'每条 Moment 最多上传 1 张照片。')
  fireEvent.change(input,{target:{files:[new File(['gif'],'a.gif',{type:'image/gif'})]}})
  expect(change).toHaveBeenLastCalledWith(null,'请选择 PNG、JPG 或 JPEG 照片。')
  expect(validateMomentPhoto({name:'a.png',type:'image/png',size:MOMENT_PHOTO_MAX_BYTES})).toBeNull()
  expect(validateMomentPhoto({name:'a.jpeg',type:'image/jpeg',size:MOMENT_PHOTO_MAX_BYTES+1})).toBe('PHOTO_TOO_LARGE')
  expect(momentPhotoContentType(new TextEncoder().encode('<script>fake png</script>'))).toBeNull()
})

test('preview shares the photo filter, removal is explicit and blob URLs are released', () => {
  const file = new File(['photo'],'photo.png',{type:'image/png'}), change = vi.fn()
  const { unmount } = render(<MomentPhotoPicker file={file} error="" busy={false} onChange={change} />)
  expect(screen.getByAltText('待发布照片预览').closest('figure')?.dataset.photoFilter).toBe('ordered-dither-crt')
  fireEvent.click(screen.getByRole('button',{name:'移除照片'}))
  expect(change).toHaveBeenCalledWith(null,'')
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-preview')
})

test('photo dithering quantizes color with opaque pixels and different ordered thresholds', () => {
  const pixels = new Uint8ClampedArray(4*64)
  for(let i=0;i<pixels.length;i+=4) pixels.set([128,128,128,255],i)
  ditherMomentPhoto(pixels,8)
  expect(new Set(Array.from(pixels).filter((_,i)=>i%4===0)).size).toBeGreaterThan(1)
  for(let i=0;i<pixels.length;i+=4) { expect(pixels[i]%51).toBe(0); expect(pixels[i+3]).toBe(255) }
  const transparent = new Uint8ClampedArray([255,255,255,0])
  ditherMomentPhoto(transparent,1)
  expect(transparent[3]).toBe(255)
  expect(transparent[0]).toBeLessThan(52)
})
