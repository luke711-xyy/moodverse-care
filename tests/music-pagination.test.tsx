// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Paginated, PagedSelect } from '../src/music/Pagination'
import { OrbitGrid } from '../src/music/OrbitGrid'

afterEach(cleanup)
test.each([[900, 6], [500, 4], [320, 2]])('Orbit at %s px never displays more than two rows', (width, expected) => {
  const size = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
  render(<OrbitGrid items={items} label="好友">{item => <article key={item.id}>{item.name}</article>}</OrbitGrid>)
  expect(document.querySelectorAll('article')).toHaveLength(expected)
  fireEvent.click(screen.getByRole('button', { name: '好友 下一页' }))
  expect(screen.queryByText('星球 0')).toBeNull()
  expect(screen.getByText(`星球 ${expected}`)).toBeTruthy()
  size.mockRestore()
})
const items = Array.from({ length: 13 }, (_, i) => ({ id: String(i), name: `星球 ${i}` }))
test('paged select keeps the selected value while only mounting one page of choices', () => {
  render(<PagedSelect id="choice" items={items} value="0" onChange={() => {}} label="选择" pageSize={6} itemLabel={item => item.name} />)
  expect(document.querySelectorAll('option')).toHaveLength(6)
  fireEvent.click(screen.getByRole('button', { name: '选择 下一页' }))
  expect(document.querySelectorAll('option')).toHaveLength(7)
  expect((document.querySelector('select') as HTMLSelectElement).value).toBe('0')
  expect(screen.queryByRole('option', { name: '星球 1' })).toBeNull()
  expect(screen.getByRole('option', { name: '星球 6' })).toBeTruthy()
})
test('only mounts the current page and reaches the last item without duplicates', () => {
  const seen: string[] = []
  render(<Paginated items={items} pageSize={6} label="测试星球">{item => { seen.push(item.id); return <article key={item.id}>{item.name}</article> }}</Paginated>)
  expect(document.querySelectorAll('article')).toHaveLength(6)
  expect(seen).toEqual(['0', '1', '2', '3', '4', '5'])
  fireEvent.click(screen.getByRole('button', { name: '测试星球 下一页' }))
  expect(screen.queryByText('星球 0')).toBeNull()
  expect(screen.getByText('星球 6')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '测试星球 下一页' }))
  expect(document.querySelectorAll('article')).toHaveLength(1)
  expect(screen.getByText('星球 12')).toBeTruthy()
  expect((screen.getByRole('button', { name: '测试星球 下一页' }) as HTMLButtonElement).disabled).toBe(true)
})
test('a new filter resets pagination and shorter data cannot leave an empty page', () => {
  const row = (item: typeof items[number]) => <article key={item.id}>{item.name}</article>
  const view = render(<Paginated items={items} pageSize={6} label="测试星球" resetKey="a">{row}</Paginated>)
  fireEvent.click(screen.getByRole('button', { name: '测试星球 下一页' }))
  view.rerender(<Paginated items={items} pageSize={6} label="测试星球" resetKey="b">{row}</Paginated>)
  expect(screen.getByText('星球 0')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '测试星球 下一页' }))
  view.rerender(<Paginated items={items.slice(0, 2)} pageSize={6} label="测试星球" resetKey="b">{row}</Paginated>)
  expect(document.querySelectorAll('article')).toHaveLength(2)
})
