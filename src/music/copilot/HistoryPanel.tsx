import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CopilotMessage } from './contracts'

export type HistoryRange = { start: string; end: string }
export type HistoryPage = { messages: CopilotMessage[]; nextCursor: string | null }
export type ReadHistory = (
  range: HistoryRange,
  cursor: string | undefined,
  signal: AbortSignal,
) => Promise<HistoryPage>
type Period = 'day' | 'week' | 'month' | 'year'
const periodNames = { day: '日', week: '周', month: '月', year: '年' } as const

export function localDay(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function periodStart(day: string, period: Period) {
  const [y, m, d] = day.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  if (period === 'week') start.setDate(d - ((start.getDay() + 6) % 7))
  if (period === 'month') start.setDate(1)
  if (period === 'year') start.setMonth(0, 1)
  return start
}

function shift(start: Date, period: Period, step: number) {
  const next = new Date(start)
  if (period === 'year') next.setFullYear(start.getFullYear() + step)
  else if (period === 'month') next.setMonth(start.getMonth() + step)
  else next.setDate(start.getDate() + (period === 'week' ? 7 : 1) * step)
  return next
}

export function rangeFor(day: string, period: Period = 'day'): HistoryRange {
  const start = periodStart(day, period)
  return { start: start.toISOString(), end: shift(start, period, 1).toISOString() }
}

export function useLocalDay(active: boolean) {
  const [day, setDay] = useState(() => localDay())
  useEffect(() => {
    if (!active) return
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const now = new Date()
      setDay(localDay(now))
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight.getTime() - now.getTime())
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [active])
  return day
}

type EntriesProps = {
  range: HistoryRange
  read: ReadHistory
  renderMessage(message: CopilotMessage): ReactNode
  initialCursor?: string
}

// The latest page is chronological. Each cursor points to the preceding page.
// In the live chat we already have the latest page and only fetch on demand.
export function ArchiveEntries({ range, read, renderMessage, initialCursor }: EntriesProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(initialCursor ?? null)
  const [loading, setLoading] = useState(!initialCursor)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const { start, end } = range

  async function fetchPage(before?: string) {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const page = await read({ start, end }, before, controller.signal)
      if (!controller.signal.aborted) {
        setMessages((current) => [...page.messages, ...current])
        setCursor(page.nextCursor)
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '读取通讯记录失败。')
    } finally {
      if (request.current === controller) {
        request.current = null
        setLoading(false)
      }
    }
  }
  useEffect(() => {
    if (!initialCursor) void fetchPage()
    return () => {
      request.current?.abort()
      request.current = null
    }
    // The parent keys this list by the source, interval and initial cursor.
  }, [])
  return (
    <>
      {loading && (
        <p className="cp-history-note" role="status">
          正在读取记录…
        </p>
      )}
      {error && (
        <p className="cp-error" role="alert">
          {error}
        </p>
      )}
      {!loading && (cursor || error) && (
        <button className="cp-history-more" type="button" onClick={() => void fetchPage(cursor ?? undefined)}>
          {error ? '重新读取' : '查看更早记录'}
        </button>
      )}
      {!initialCursor && !loading && !error && messages.length === 0 && (
        <p className="cp-history-note">这段时间没有通讯记录。</p>
      )}
      {messages.map((message, i) => {
        const date = new Date(message.createdAt)
        const newDay =
          !initialCursor && (i === 0 || localDay(date) !== localDay(new Date(messages[i - 1].createdAt)))
        return (
          <Fragment key={message.id}>
            {newDay && (
              <h3 className="cp-history-date">
                {date.toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })}
              </h3>
            )}
            {renderMessage(message)}
          </Fragment>
        )
      })}
    </>
  )
}

export function HistoryPanel({
  today,
  read,
  renderMessage,
  revision,
}: Omit<EntriesProps, 'range'> & { today: string; revision: number }) {
  const [period, setPeriod] = useState<Period>('day')
  const [selected, setSelected] = useState('')
  const day = selected || today
  const start = periodStart(day, period)
  const end = shift(start, period, 1)
  const range = { start: start.toISOString(), end: end.toISOString() }
  let label = localDay(start)
  if (period === 'week') label += ' 至 ' + localDay(new Date(end.getTime() - 1))
  if (period === 'month') label = start.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
  if (period === 'year') label = start.getFullYear() + '年'

  return (
    <div className="cp-aux-scroll cp-history" aria-label="通讯记录">
      <div className="cp-history-tools">
        <div role="group" aria-label="历史视图" className="cp-periods">
          {(Object.keys(periodNames) as Period[]).map((p) => (
            <button type="button" key={p} aria-pressed={p === period} onClick={() => setPeriod(p)}>
              {periodNames[p]}
            </button>
          ))}
        </div>
        <label className="cp-jump-date">
          <span className="cp-visually-hidden">选择历史日期</span>
          <input
            aria-label="选择历史日期"
            type="date"
            value={day}
            max={today}
            onChange={(e) => {
              const value = e.currentTarget.value
              if (value && value <= today && e.currentTarget.validity.valid) setSelected(value)
            }}
          />
        </label>
      </div>
      <div className="cp-history-range">
        <button
          type="button"
          aria-label={'上一' + periodNames[period]}
          onClick={() => setSelected(localDay(shift(start, period, -1)))}
        >
          ‹
        </button>
        <span>{label}</span>
        <button
          type="button"
          aria-label={'下一' + periodNames[period]}
          disabled={localDay(end) > today}
          onClick={() => setSelected(localDay(end))}
        >
          ›
        </button>
      </div>
      <ArchiveEntries
        key={range.start + range.end + revision}
        range={range}
        read={read}
        renderMessage={renderMessage}
      />
    </div>
  )
}
