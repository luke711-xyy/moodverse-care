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
  visible: boolean
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
  const { active, visible, phase } = props
  const station = useRef<HTMLElement>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (active && !wasOpen.current && !station.current?.contains(document.activeElement)) station.current?.focus({ preventScroll: true })
    if (!active && wasOpen.current && visible) station.current?.querySelector<HTMLButtonElement>('.intercom-key')?.focus({ preventScroll: true })
    wasOpen.current = active
  }, [active, visible])
  return <section className="copilot-projection" data-open={active} data-phase={phase} hidden={!visible}
    aria-label="观察窗副驾投影" tabIndex={-1} ref={station}
    onKeyDown={event => {
      if (active && event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
        event.preventDefault(); props.close()
      }
    }}>
    <div className="projection-visual">
      <IntercomKey open={active ? props.toggle : props.open} begin={props.begin} end={props.end} cancel={props.cancel}
        reveal={props.open} expanded={active} enabled={visible}
        notice={props.notice} onDismiss={props.onDismiss} onNotice={props.onNotice}>
        <ProjectionCore phase={phase} active={active && visible} animate={!props.reducedMotion} />
        <span className="projection-ident">
          <span className="projection-callsign">MOSIC <b>/</b> COPILOT</span>
          <strong>舰载副驾</strong>
          <span className="projection-phase"><i aria-hidden="true" />{phaseReadout[phase][0]}<span>{phaseReadout[phase][1]}</span></span>
        </span>
      </IntercomKey>
    </div>
    <div className="projection-channel" hidden={!active}>{props.children}</div>
  </section>
}
