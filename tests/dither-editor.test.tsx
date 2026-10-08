// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppearanceEditor } from '../src/music/dither/AppearanceEditor'
import { createDitherSpec, DITHER_LIMITS } from '../src/music/dither/appearance'
afterEach(cleanup)
test('controls preview without saving; reset and cancel are explicit', () => {
  const spec = createDitherSpec({ planetId: 'owner', tracks: [] })
  spec.overrides = { motif: 'flower' }
  const preview = vi.fn(), apply = vi.fn(), close = vi.fn()
  render(<AppearanceEditor spec={spec} onPreview={preview} onApply={apply} onClose={close} busy={false} error="" />)
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
