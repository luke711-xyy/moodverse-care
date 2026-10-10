import { useEffect, useRef } from 'react'
import type { GalaxyGroup, GalaxyGroupBy, MusicApi } from '../music-api'
import type { MusicPlayerControls } from './useMusicPlayer'
import { GalaxyContent } from './GalaxyContent'
import { CrtScreen } from './cockpit/CrtScreen'
import './galaxy-window.css'

export function GalaxyWindow({ api, by, group, player, onClose, crtEnabled = true, reducedMotion = false }: {
  api: Pick<MusicApi, 'loadGalaxyContent'>; by: GalaxyGroupBy; group: GalaxyGroup; player: MusicPlayerControls; onClose: () => void
  crtEnabled?: boolean; reducedMotion?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef(document.activeElement as HTMLElement | null)
  useEffect(() => {
    const dialog = ref.current!, previous = returnFocus.current
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => { if (dialog.open && typeof dialog.close === 'function') dialog.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className="music-galaxy-dialog" aria-label={`${group.label} 星系`}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
    }}>
    <header className="music-galaxy-dialog-bar"><div><span className="music-galaxy-terminal-brand">MOSIC</span><span className="music-galaxy-terminal-mode">{by === 'genre' ? '曲风' : by === 'artist' ? '艺人' : '歌曲'}星系</span></div><button type="button" autoFocus aria-label="关闭星系窗口" onClick={onClose}>关闭 ×</button></header>
    <div className="music-galaxy-dialog-glass"><CrtScreen active motion={!reducedMotion} enabled={crtEnabled}>
      <div className="music-galaxy-dialog-body"><GalaxyContent api={api} by={by} group={group} player={player} /></div>
    </CrtScreen></div>
    <footer className="music-galaxy-dialog-footer"><span>GALAXY TERMINAL</span><span className="music-galaxy-terminal-lamp" aria-hidden="true" /></footer>
  </dialog>
}
