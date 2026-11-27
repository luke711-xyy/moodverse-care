import { useEffect, useRef, type ReactNode } from 'react'
import type { CopilotPhase } from '../copilot/CopilotPanel'
import { ProjectionCore } from './ProjectionCore'
import './copilot-projection.css'

const phaseReadout = {
  idle: ['STANDBY', '待命'],
  listening: ['LISTEN', '聆听中'],
  thinking: ['PROCESS', '思考中'],
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
  hasNotice: boolean
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
  const signature = <>
    <ProjectionCore phase={phase} active={active && visible && (!compact || phase !== 'idle')} animate={!props.reducedMotion} />
    <span className="projection-ident">
      <span className="projection-callsign">MOSIC <b>/</b> COPILOT</span>
      <strong title={props.name}>{props.name}</strong>
      <span className="projection-phase"><i aria-hidden="true" />{phaseReadout[phase][0]}<span>{phaseReadout[phase][1]}</span></span>
    </span>
  </>
  return <section className="copilot-projection" data-open={active && !compact} data-mode={compact ? 'compact' : active ? 'expanded' : 'idle'} data-phase={phase} hidden={!visible}
    aria-label="观察窗副驾投影" tabIndex={-1} ref={station}
    onKeyDown={event => {
      if (active && event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
        event.preventDefault(); props.close()
      }
    }}>
    <div className="projection-visual">
      <div className="copilot-intercom">
        {active && !compact ? <div className="projection-signature">{signature}</div> :
          <button type="button" className="intercom-key projection-signature" aria-expanded={false}
            aria-label={props.hasNotice ? '查看副驾提示' : compact ? '展开舰载副驾' : '舰载副驾，点按打开'} onClick={props.open}>
            {signature}<span className="intercom-instruction" data-notice={props.hasNotice}>{props.hasNotice ? '查看提示 ↗' : compact ? '展开 ↗' : '唤醒 ↗'}</span>
          </button>}
      </div>
      {compact && <button type="button" className="projection-off" aria-label="关闭副驾观察窗" title="关闭副驾" onClick={props.close}>×</button>}
    </div>
    <div className="projection-channel" hidden={!active}>{props.children}</div>
  </section>
}
