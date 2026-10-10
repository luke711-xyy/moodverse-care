// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { RetroRadio } from '../src/music/cockpit/DeskObjects'

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.querySelector('[data-radio-test-style]')?.remove() })

test('FM shrinks overflowing labels only to its minimum and grows them again for a short next song', () => {
  const css = document.createElement('style')
  css.dataset.radioTestStyle = ''
  css.textContent = '.cockpit-radio-track strong,.cockpit-radio-track span { font-size: 10px; line-height: 12px; }'
  document.head.append(css)
  // jsdom has no layout engine; model only the browser geometry boundary.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(40)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(26)
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(40)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    const size = parseFloat(getComputedStyle(this).fontSize)
    if (this.textContent?.startsWith('Very long')) return 48
    return (this.textContent?.length ?? 0) > 8 && size > 8 ? 36 : 12
  })
  const player = { playing: true, blocked: false, toggle: vi.fn(), currentTrack: { title: 'A medium song title', artistName: 'Very long artist name that never fits' } }
  const view = render(<RetroRadio player={player} />)
  const title = screen.getByText(player.currentTrack.title)
  const artist = screen.getByText(player.currentTrack.artistName)
  expect(parseFloat(getComputedStyle(title).fontSize)).toBeLessThanOrEqual(8)
  expect(parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThanOrEqual(7.2)
  expect(parseFloat(getComputedStyle(artist).fontSize)).toBeCloseTo(7.2)
  expect(artist.getAttribute('title')).toBe(player.currentTrack.artistName)
  view.rerender(<RetroRadio player={{ ...player, currentTrack: { title: '夜航', artistName: '星河' } }} />)
  expect(parseFloat(getComputedStyle(screen.getByText('夜航')).fontSize)).toBe(10)
})
test('FM presents three transport controls and replaces the tuner with the playing song', () => {
  const player = { playing: true, blocked: false, canSkip: true, previous: vi.fn(), next: vi.fn(), toggle: vi.fn(),
    currentTrack: { title: '夜航', artistName: '星河', coverUrl: 'https://images.example/cover.jpg' } }
  const view = render(<RetroRadio player={player} />)
  fireEvent.click(screen.getByRole('button', { name: '上一首' }))
  fireEvent.click(screen.getByRole('button', { name: '下一首' }))
  expect(player.previous).toHaveBeenCalledOnce()
  expect(player.next).toHaveBeenCalledOnce()
  expect(screen.getByRole('img', { name: '夜航的专辑封面' }).getAttribute('src')).toBe(player.currentTrack.coverUrl)
  expect(screen.getByText('夜航')).toBeTruthy()
  expect(screen.getByText('星河')).toBeTruthy()
  expect(screen.queryByText('88 92 98 104 108')).toBeNull()
  view.rerender(<RetroRadio player={{ ...player, playing: false, canSkip: false }} />)
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByRole('button', { name: '下一首' }).hasAttribute('disabled')).toBe(true)
})
