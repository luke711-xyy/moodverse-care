import { useEffect, useRef, type ReactNode } from 'react'
import type { CopilotPhase } from '../copilot/CopilotPanel'
import { IntercomKey } from './IntercomKey'
import { ProjectionCore } from './ProjectionCore'
import './copilot-projection.css'

const phaseReadout = {
  idle: ['STANDBY', '待命'],
  listening: ['LISTEN', '聆听中'],
  thinking: ['PROCESS', '思考中'],
  speaking: ['TRANSMIT', '播报中'],
  error: ['CHECK LINK', '检查连接'],
} as const

type Props = {
  active: boolean
  compact: boolean
  visible: boolean
  name: string
  phase: CopilotPhase
  reducedMotion: boolean
  open(): void
  close(): void
  begin(): void
  end(): void
  cancel(): void
  toggle(): void
  notice: string
  onDismiss(): void
  onNotice(): void
  children: ReactNode
}

export function CopilotProjection(props: Props) {
  const { active, compact, visible, phase } = props
  const station = useRef<HTMLElement>(null)
  const wasOpen = useRef(false)
  const wasCompact = useRef(false)
  useEffect(() => {
    if (active && !wasOpen.current && !station.current?.contains(document.activeElement)) station.current?.focus({ preventScroll: true })
    if (visible && ((compact && !wasCompact.current) || (!active && wasOpen.current))) station.current?.querySelector<HTMLButtonElement>('.intercom-key')?.focus({ preventScroll: true })
    wasOpen.current = active
    wasCompact.current = compact
  }, [active, visible, compact])
  return <section className="copilot-projection" data-open={active && !compact} data-mode={compact ? 'compact' : active ? 'expanded' : 'idle'} data-phase={phase} hidden={!visible}
    aria-label="观察窗副驾投影" tabIndex={-1} ref={station}
    onKeyDown={event => {
      if (active && event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
        event.preventDefault(); props.close()
      }
    }}>
    <div className="projection-visual">
      <IntercomKey open={active && !compact ? props.toggle : props.open} begin={props.begin} end={props.end} cancel={props.cancel}
        reveal={active ? undefined : props.open} expanded={active && !compact} compact={compact} enabled={visible}
        notice={compact ? '' : props.notice} onDismiss={props.onDismiss} onNotice={props.onNotice}>
        <ProjectionCore phase={phase} active={active && visible && (!compact || phase !== 'idle')} animate={!props.reducedMotion} />
        <span className="projection-ident">
          <span className="projection-callsign">MOSIC <b>/</b> COPILOT</span>
          <strong title={props.name}>{props.name}</strong>
          <span className="projection-phase"><i aria-hidden="true" />{phaseReadout[phase][0]}<span>{phaseReadout[phase][1]}</span></span>
        </span>
      </IntercomKey>
      {compact && props.notice && <button type="button" className="projection-notice-light" aria-label={props.notice} title={props.notice}
        onClick={props.onNotice}>✦</button>}
      {compact && <button type="button" className="projection-off" aria-label="关闭副驾观察窗" title="关闭副驾" onClick={props.close}>×</button>}
    </div>
    <div className="projection-channel" hidden={!active}>{props.children}</div>
  </section>
}
