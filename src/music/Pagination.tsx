import { useState, type ReactNode } from 'react'
import { DitherButton } from './dither/components'
import './pagination.css'

/** Bounded native choices; the selected option remains available across pages. */
export function PagedSelect<T extends { id: string }>({ id, items, value, onChange, itemLabel, label, pageSize = 20 }: {
  id: string; items: readonly T[]; value: string; onChange: (value: string) => void
  itemLabel: (item: T) => string; label: string; pageSize?: number
}) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / pageSize)), current = Math.min(page, pages - 1)
  const visible = items.slice(current * pageSize, (current + 1) * pageSize)
  const selected = items.find(item => item.id === value)
  return <>
    <select id={id} value={value} onChange={event => onChange(event.target.value)} required>
      {selected && !visible.some(item => item.id === value) && <option value={selected.id}>{itemLabel(selected)}（已选择）</option>}
      {visible.map(item => <option key={item.id} value={item.id}>{itemLabel(item)}</option>)}
    </select>
    {pages > 1 && <PageControls page={current} pages={pages} label={label} onPage={setPage} />}
  </>
}

export function PageControls({ page, pages, label, onPage, disabled = false }: {
  page: number; pages: number; label: string; onPage: (page: number) => void; disabled?: boolean
}) {
  return <nav className="music-pagination" aria-label={`${label} 分页`}>
    <DitherButton disabled={disabled || page <= 0} aria-label={`${label} 上一页`} onClick={() => onPage(page - 1)}>← 上一页</DitherButton>
    <span aria-live="polite">{page + 1} / {Math.max(1, pages)}</span>
    <DitherButton disabled={disabled || page + 1 >= pages} aria-label={`${label} 下一页`} onClick={() => onPage(page + 1)}>下一页 →</DitherButton>
  </nav>
}

/** Render callbacks run for the current page only: hidden canvases/photos never mount. */
export function Paginated<T>({ items, pageSize = 10, label, resetKey, children }: {
  items: readonly T[]; pageSize?: number; label: string; resetKey?: string | number
  children: (item: T, index: number) => ReactNode
}) {
  const identity = resetKey ?? items.map(item => {
    if (typeof item !== 'object' || !item) return String(item)
    const row = item as Record<string, unknown>
    return String(row.id ?? row.planetId ?? row.key ?? '')
  }).join('|')
  const [state, setState] = useState({ key: identity, page: 0 })
  const size = Math.max(1, Math.floor(pageSize)), pages = Math.max(1, Math.ceil(items.length / size))
  const page = state.key === identity ? Math.min(state.page, pages - 1) : 0
  if (!items.length) return null
  return <>
    {items.slice(page * size, (page + 1) * size).map((item, index) => children(item, page * size + index))}
    <PageControls page={page} pages={pages} label={label} onPage={next => setState({ key: identity, page: next })} />
  </>
}
