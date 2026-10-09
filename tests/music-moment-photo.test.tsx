// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MomentContent, MomentPhotoPicker, ditherMomentPhoto } from '../src/music/MomentPhoto'
import { MOMENT_PHOTO_MAX_BYTES, validateMomentPhoto, momentPhotoContentType } from '../src/music/moment-photo'

beforeEach(() => {
  vi.stubGlobal('React',React)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  URL.createObjectURL = vi.fn(() => 'blob:photo-preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('Moment rows put artwork and song details before copy and photo, with a record fallback for unavailable covers', () => {
  const track = { id: 'cosmos', title: 'Cosmos', artistId: 'the-mountain', artistName: 'The_mountain', versionLabel: '',
    genres: ['ambient'], moodTags: [], officialUrl: null, coverUrl: '/cover.png', durationSeconds: null }
  const { container, rerender } = render(<MomentContent track={track} contentText="星际记忆" photoUrl="/photo.png" />)
  const body = container.querySelector('.music-moment-body')!
  expect(Array.from(body.children, child => child.className)).toEqual(['music-moment-song', 'music-moment-copy', 'music-moment-photo'])
  const song = body.querySelector('.music-moment-song')!
  expect(within(song as HTMLElement).getByText('Cosmos')).toBeTruthy()
  expect(within(song as HTMLElement).getByText('The_mountain')).toBeTruthy()
  const cover = screen.getByAltText('《Cosmos》封面')
  expect(cover.getAttribute('src')).toBe('/cover.png')
  expect(cover.closest('figure')?.dataset.photoFilter).toBe('ordered-dither-crt')
  fireEvent.error(cover)
  expect(screen.getByRole('img', { name: '《Cosmos》唱片图案' })).toBeTruthy()
  rerender(<MomentContent track={{ ...track, coverUrl: null }} contentText="星际记忆" />)
  expect(screen.getByRole('img', { name: '《Cosmos》唱片图案' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '放大查看Moment 照片' })).toBeNull()
})

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

test('Moment thumbnails sit to the right of the copy and expand inside the same CRT without leaving the channel', () => {
  const back = vi.fn()
  const { container } = render(<div className="cockpit-terminal" onKeyDown={back}>
    <header className="cockpit-terminal-header"><button>Moment</button></header>
    <div className="crt-image"><div className="cockpit-terminal-content">
      <MomentContent contentText="一段长条记录" photoUrl="/photo.png" />
    </div></div>
    <footer className="cockpit-terminal-footer"><button>返回驾驶舱</button></footer>
  </div>)
  const body = container.querySelector('.music-moment-body')!
  expect(body.firstElementChild?.className).toBe('music-moment-copy')
  expect(body.lastElementChild?.className).toBe('music-moment-photo')
  const thumbnail = screen.getByRole('button', {name:'放大查看Moment 照片'})
  expect(thumbnail.getAttribute('aria-haspopup')).toBe('dialog')
  fireEvent.click(thumbnail)
  const viewer = screen.getByRole('dialog', {name:'照片大图'})
  expect(viewer.parentElement?.className).toBe('crt-image')
  expect(container.querySelector('.cockpit-terminal-content')?.hasAttribute('inert')).toBe(true)
  expect(within(viewer).getByAltText('Moment 照片').getAttribute('src')).toBe('/photo.png')
  expect(viewer.querySelector('[data-photo-filter="ordered-dither-crt"]')).toBeTruthy()
  const close = within(viewer).getByRole('button', {name:'返回 Moment'})
  expect(document.activeElement).toBe(close)
  fireEvent.keyDown(close, {key:'Tab',shiftKey:true})
  expect(document.activeElement).toBe(close)
  fireEvent.keyDown(close, {key:'Escape'})
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(back).not.toHaveBeenCalled()
  expect(container.querySelector('.cockpit-terminal-content')?.hasAttribute('inert')).toBe(false)
  expect(document.activeElement).toBe(thumbnail)
  fireEvent.click(thumbnail)
  fireEvent.click(screen.getByRole('button', {name:'返回 Moment'}))
  expect(screen.queryByRole('dialog')).toBeNull()
})
