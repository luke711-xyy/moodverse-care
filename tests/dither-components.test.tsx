// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DitherButton, DitherCard, DitherLoadingRing, DitherTitle } from '../src/music/dither/components'
beforeEach(() => vi.stubGlobal('React', React))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

test('dither buttons remain semantic, keyboard focusable and enforce disabled actions', () => {
  const clicked = vi.fn()
  const { rerender } = render(<DitherButton onClick={clicked}>选歌</DitherButton>)
  const button = screen.getByRole('button', { name: '选歌' }) as HTMLButtonElement
  expect(button.type).toBe('button')
  fireEvent.click(button)
  expect(clicked).toHaveBeenCalledTimes(1)
  rerender(<DitherButton onClick={clicked} busy>选歌</DitherButton>)
  expect(button.disabled).toBe(true)
  expect(button.getAttribute('aria-busy')).toBe('true')
  fireEvent.click(button)
  expect(clicked).toHaveBeenCalledTimes(1)
})

test('title and content remain selectable accessible text, not a raster-only UI', () => {
  render(<DitherCard><DitherTitle>音乐星球</DitherTitle><p>这段 Moment 需要保留正文。</p></DitherCard>)
  expect(screen.getByRole('heading', { name: '音乐星球' }).tagName).toBe('H1')
  expect(screen.getByText('这段 Moment 需要保留正文。').tagName).toBe('P')
})

test('indeterminate loading does not claim a fabricated percentage', () => {
  const { rerender } = render(<DitherLoadingRing label="正在读取歌曲" />)
  expect(screen.getByRole('status').textContent).toContain('正在读取歌曲')
  expect(screen.queryByRole('progressbar')).toBeNull()
  rerender(<DitherLoadingRing label="正在读取歌曲" progress={.5} />)
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50')
})
