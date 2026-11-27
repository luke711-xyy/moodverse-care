import { useEffect, useRef, useState, type ReactNode } from 'react'

export function IntercomKey({ open, reveal, expanded, compact, enabled, children, begin, end, cancel, notice, onDismiss, onNotice }: {
  open: () => void
  reveal?: () => void
  expanded?: boolean
  compact?: boolean
  enabled: boolean
  children?: ReactNode
  begin: () => void
  end: () => void
  cancel: () => void
  notice: string
  onDismiss: () => void
  onNotice: () => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false)
  const suppressClick = useRef(false)
  const cancelAction = useRef(cancel)
  cancelAction.current = cancel
  const [transmitting, setTransmitting] = useState(false)
  const abort = () => {
    clearTimeout(timer.current)
    timer.current = undefined
    if (held.current) cancelAction.current()
    held.current = false
    setTransmitting(false)
  }
  useEffect(() => {
    if (!enabled) abort()
  }, [enabled])
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) abort() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', abort)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', abort)
      clearTimeout(timer.current)
      if (held.current) cancelAction.current()
    }
  }, [])
  const press = () => {
    if (!enabled || timer.current || held.current) return
    suppressClick.current = false
    timer.current = setTimeout(() => {
      held.current = true
      suppressClick.current = true
      setTransmitting(true)
      reveal?.()
      begin()
    }, 300)
  }
  const release = () => {
    clearTimeout(timer.current)
    timer.current = undefined
    if (!held.current) return
    held.current = false
    setTransmitting(false)
    end()
  }
  return <aside className="copilot-intercom" aria-label="舰载通讯">
    {notice && <div className="intercom-notice" role="status"><button onClick={onNotice}>{notice} ↗</button><button onClick={onDismiss} aria-label="忽略这条副驾提示">×</button></div>}
    <button type="button" className="intercom-key" data-transmitting={transmitting} aria-expanded={expanded} aria-label={compact ? "展开舰载副驾" : expanded ? "与舰载副驾对讲" : "舰载副驾，点按打开，长按对讲"}
      title={compact ? "点击展开，长按对讲" : expanded ? "点按开始或结束对讲，亦可长按" : "点按唤醒副驾，长按对讲"} onContextMenu={event => event.preventDefault()}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return
        event.currentTarget.setPointerCapture?.(event.pointerId)
        press()
      }}
      onPointerUp={release} onPointerCancel={abort} onLostPointerCapture={() => { if (held.current) abort() }}
      onKeyDown={event => { if (event.key === ' ' && !event.repeat) press(); if (event.key === 'Escape' && held.current) { event.preventDefault(); abort() } }}
      onKeyUp={event => { if (event.key === ' ') release() }}
      onClick={() => { if (!suppressClick.current) open(); suppressClick.current = false }}>
      {children}
      <span className="intercom-instruction">{transmitting ? '松开发送' : compact ? '展开 ↗' : expanded ? '点按或长按对讲' : '唤醒 ↗'}</span>
    </button>
  </aside>
}
