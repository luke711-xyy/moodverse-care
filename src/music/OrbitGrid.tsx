import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Paginated } from './Pagination'
import './orbit-grid.css'
export function OrbitGrid<T>({ items, label, children }: { items: readonly T[]; label: string; children: (item: T, index: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), [columns, setColumns] = useState(3)
  useLayoutEffect(() => {
    const node = ref.current!
    const measure = () => { const width = node.clientWidth; if (width) setColumns(width < 380 ? 1 : width < 620 ? 2 : 3) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure); observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className="music-orbit-grid" style={{ '--orbit-columns': columns } as CSSProperties}>
    <Paginated items={items} label={label} pageSize={columns * 2}>{children}</Paginated>
  </div>
}
