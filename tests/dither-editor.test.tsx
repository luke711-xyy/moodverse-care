// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppearanceEditor } from '../src/music/dither/AppearanceEditor'
import { createDitherSpec, DITHER_LIMITS } from '../src/music/dither/appearance'
import type { DitherFrame } from '../src/music/dither/renderer'
vi.mock('../src/music/dither/DitherCanvas', () => ({
  DitherCanvas: ({ getFrame }: { getFrame: (width: number, height: number, phase: number) => DitherFrame }) => <canvas data-frame={JSON.stringify(getFrame(320,240,0))} />,
}))
afterEach(cleanup)
test('controls preview without saving; reset and cancel are explicit', () => {
  const spec = createDitherSpec({ planetId: 'owner', tracks: [] })
  spec.overrides = { motif: 'flower' }
  const preview = vi.fn(), apply = vi.fn(), close = vi.fn()
  render(<AppearanceEditor spec={spec} onPreview={preview} onApply={apply} onClose={close} busy={false} error="" />)
  expect(screen.queryByRole('button', { name: '关闭外观编辑' })).toBeNull()
  expect(screen.getAllByRole('slider')).toHaveLength(Object.keys(DITHER_LIMITS).length)
  fireEvent.change(screen.getByLabelText('纹理'), { target: { value: 'score' } })
  expect(preview.mock.lastCall?.[0].overrides).toMatchObject({ motif: 'score' })
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '恢复歌曲生成' }))
  fireEvent.click(screen.getByRole('button', { name: '应用外观' }))
  expect(apply).toHaveBeenCalledWith({})
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(close).toHaveBeenCalledOnce()
})

test('embedded previews compare saved appearance with only the current draft', () => {
  const spec = createDitherSpec({ planetId: 'owner', tracks: [] })
  spec.overrides = { motif: 'flower' }
  const apply = vi.fn()
  render(<AppearanceEditor embedded spec={spec} onPreview={vi.fn()} onApply={apply} onClose={vi.fn()} busy={false} error="" />)
  expect(screen.queryByRole('button', { name: '关闭外观编辑' })).toBeNull()
  const frame = (label: string): DitherFrame => JSON.parse(screen.getByRole('img', { name: label }).querySelector('canvas')!.dataset.frame!)
  expect(frame('当前外观').assets[0].spec).toEqual(frame('调整后').assets[0].spec)
  fireEvent.change(screen.getByLabelText('纹理'), { target: { value: 'score' } })
  expect(frame('当前外观').assets[0].spec.overrides).toEqual({ motif: 'flower' })
  expect(frame('调整后').assets[0].spec.overrides).toEqual({ motif: 'score' })
  expect(frame('当前外观').assets[0].radius).toBe(frame('调整后').assets[0].radius)
  fireEvent.click(screen.getByRole('button', { name: '恢复歌曲生成' }))
  expect(frame('当前外观').assets[0].spec.overrides).toEqual({ motif: 'flower' })
  expect(frame('调整后').assets[0].spec.overrides).toEqual({})
  expect(apply).not.toHaveBeenCalled()
})
