import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MusicFriendSatellite, MusicPlanet, PublicMusicPlanet } from '../../music-api'
import type { MusicTrackSummary } from '../../music-domain'
import type { MusicGalaxySceneSystem, MusicScenePlanet } from '../galaxy-scene'
import { createDitherSpec, resolveDitherSpec, stableHash, type DitherPlanetSpec } from './appearance'
import { DitherCanvas } from './DitherCanvas'
import { DitherOrbit } from './components'
import { hitTestDitherAssets } from './layout'
import { buildDitherStageFrame, sampleHomeTransition, type StageFrame } from './stage-layout'
import { TOUR_END } from '../../universe'
import { buildCockpitFlightFrame } from '../cockpit/flight-frame'
import type { CockpitFlight } from '../cockpit/flight'
import { clientPoint, logicalSize } from '../viewport'
import type { DitherFrame } from './renderer'

type Props = { planet: MusicPlanet | null; friendSatellites: MusicFriendSatellite[]; visitedPlanet: PublicMusicPlanet | null; previewSeed: string; previewTracks?: MusicTrackSummary[]; appearancePreview?: DitherPlanetSpec | null; reducedMotion: boolean; productView: string; focusedGalaxy?: string; galaxySystems: MusicGalaxySceneSystem[]; galaxyRotation: number; routeJourney: number; regrouping: boolean; onSelectGalaxy: (id: string)=>void; onOpenPlanet: (planet: MusicScenePlanet, galaxyId: string)=>void; onRotate: (delta: number)=>void; onTourMove: (delta: number)=>void; onMusicSelect: (id: string)=>void; onFriendSelect: (id: string)=>void }
export function Stage(props: Props & { exteriorView?: 'home' | 'galaxy'; interactive?: boolean; flight?: CockpitFlight | null; managedTravel?: boolean }) {
  const inGalaxy = props.exteriorView ? props.exteriorView === 'galaxy' : props.productView === 'galaxy'
  const desiredHome = inGalaxy ? 0 : 1
  const [home, setHome] = useState(desiredHome), [traveling, setTraveling] = useState(false)
  const homeRef = useRef(home)
  const wrap = useRef<HTMLDivElement>(null), latestFrame = useRef<StageFrame | null>(null)
  const [bounds, setBounds] = useState({ width: 1000, height: 700 })
  const [ownRotation, setOwnRotation] = useState(0)
  const [renderMode, setRenderMode] = useState<'webgl2' | 'canvas2d'>('webgl2')
  const drag = useRef<{ x: number; y: number; travel: number } | null>(null)
  const owner = useMemo(()=>props.appearancePreview ?? (props.planet ? resolveDitherSpec(props.planet.id, props.planet.tracks, props.planet.visual) : createDitherSpec({ planetId: 'preview-' + props.previewSeed, tracks: props.previewTracks ?? [] })), [props.appearancePreview, props.planet, props.previewSeed, props.previewTracks])
  const visitor = useMemo(()=>props.visitedPlanet ? resolveDitherSpec(props.visitedPlanet.id, props.visitedPlanet.tracks, props.visitedPlanet.visual) : undefined, [props.visitedPlanet])
  useLayoutEffect(()=> {
    if (homeRef.current === desiredHome) { setTraveling(false); return }
    if (props.managedTravel || props.reducedMotion || document.hidden || !props.planet) { homeRef.current = desiredHome; setHome(desiredHome); setTraveling(false); return }
    const start = homeRef.current
    let elapsed = 0, last = performance.now()
    let raf = 0
    setTraveling(true)
    const tick = (now: number)=> {
      elapsed += document.hidden ? 0 : Math.min(50, Math.max(0, now-last))
      last = now
      const p = Math.min(1, elapsed / 2100), eased = p*p*(3-2*p)
      const next = start + (desiredHome-start)*eased
      homeRef.current = next; setHome(next)
      if (p < 1) raf = requestAnimationFrame(tick); else setTraveling(false)
    }
    raf = requestAnimationFrame(tick)
    return ()=>cancelAnimationFrame(raf)
  }, [desiredHome, props.reducedMotion, Boolean(props.planet), props.managedTravel])
  useEffect(()=> {
    const resize = ()=> { if (wrap.current) setBounds(logicalSize(wrap.current)) }
    resize(); window.addEventListener('resize',resize)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    if (wrap.current) observer?.observe(wrap.current)
    return ()=>{ window.removeEventListener('resize',resize); observer?.disconnect() }
  }, [])
  const getFrame = useCallback((width:number,height:number,phase:number)=> {
    const input = { width, height, phase, owner, visitor, systems:props.galaxySystems, home, journey:Math.min(1,props.routeJourney/TOUR_END), rotation:home < 1 && props.focusedGalaxy && !visitor ? props.galaxyRotation : ownRotation, focusedGalaxy:props.focusedGalaxy, friends:props.friendSatellites, music:props.planet?.tracks ?? props.previewTracks ?? [] }
    const frame = props.flight ? buildCockpitFlightFrame(input, props.flight) : buildDitherStageFrame({ ...input, music:(props.visitedPlanet ?? props.planet)?.tracks ?? props.previewTracks ?? [] })
    if (!latestFrame.current) latestFrame.current=frame
    return frame
  }, [owner,visitor,props.galaxySystems,home,props.routeJourney,props.galaxyRotation,ownRotation,props.focusedGalaxy,props.friendSatellites,props.visitedPlanet,props.planet,props.previewTracks,props.flight])
  const rememberFrame = useCallback((frame: DitherFrame) => { latestFrame.current = frame as StageFrame }, [])
  const frame = getFrame(bounds.width,bounds.height,0)
  const cloud = props.flight ? Math.sin(props.flight.progress * Math.PI) : sampleHomeTransition(home).cloudOpacity
  const busy = traveling || Boolean(props.flight)
  useEffect(() => { if (busy || props.interactive === false) drag.current = null }, [busy, props.interactive])
  const activate = (clientX:number, clientY:number)=> {
    if (busy || props.interactive === false) return
    const { x, y }=clientPoint(wrap.current!,clientX,clientY), frame=latestFrame.current!
    const canvas=wrap.current!.querySelector<HTMLCanvasElement>('[data-dither-renderer]')
    const hit=hitTestDitherAssets(frame.assets.filter(a=>a.id !== 'nebula'),x,y,{mode:renderMode,pointer:frame.pointer,bodyTargets:true,pixelRatio:canvas ? canvas.width/logicalSize(wrap.current!).width : 1})
    if (hit?.id.startsWith('music:')) { props.onMusicSelect(hit.id.slice(6)); return }
    if (hit?.id.startsWith('friend:')) { props.onFriendSelect(hit.id.slice(7)); return }
    if (hit?.id.startsWith('planet:') && props.focusedGalaxy) {
      const system=props.galaxySystems.find(s=>s.id===props.focusedGalaxy), planet=system?.planets.find(p=>p.id===hit.id.slice(7))
      if (planet && system) props.onOpenPlanet(planet,system.id)
      return
    }
    if (!props.focusedGalaxy && home < .01 && !visitor) {
      const target=frame.systemTargets.filter(s=>Math.hypot(x-s.x,y-s.y)<s.radius).sort((a,b)=>Math.hypot(x-a.x,y-a.y)-Math.hypot(x-b.x,y-b.y))[0]
      if (target) props.onSelectGalaxy(target.id)
    }
  }
  return <div ref={wrap} className={`dither-stage${props.regrouping ? ' is-regrouping' : ''}`} data-traveling={busy} data-flight-progress={props.flight?.progress} data-flight-ready={props.flight?.ready} data-flight-token={props.flight?.token} role="region" tabIndex={props.interactive === false ? -1 : 0} aria-label="二维音乐宇宙"
    onKeyDown={event=>{ if(busy || props.interactive === false || event.target !== event.currentTarget || !['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); const step=event.key==='ArrowRight' ? .15 : -.15; if(inGalaxy && !visitor) { if(props.focusedGalaxy) props.onRotate(step); else props.onTourMove(step) } else setOwnRotation(r=>r+step) }}
    onPointerDown={event=> { if(event.button!==0 || busy || props.interactive === false || (event.target as Element).closest('button')) return; drag.current={...clientPoint(event.currentTarget,event.clientX,event.clientY),travel:0}; event.currentTarget.setPointerCapture?.(event.pointerId) }}
    onPointerMove={event=> { const current=drag.current; if (!current || busy || props.interactive === false) return; const point=clientPoint(event.currentTarget,event.clientX,event.clientY), dx=point.x-current.x, dy=point.y-current.y; current.travel+=Math.hypot(dx,dy); current.x=point.x; current.y=point.y; if(inGalaxy && !visitor) { if(props.focusedGalaxy) props.onRotate(dx*.006); else props.onTourMove(-dx*.0014) } else setOwnRotation(r=>r+dx*.009) }}
    onPointerUp={event=> { const current=drag.current; drag.current=null; event.currentTarget.releasePointerCapture?.(event.pointerId); if(current && current.travel<6) activate(event.clientX,event.clientY) }}
    onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}}>
    <svg className="dither-stage-lines" viewBox={`0 0 ${bounds.width} ${bounds.height}`} aria-hidden="true">
      {home>0 && Array.from({length:80},(_,i)=><rect key={i} x={stableHash('star-x'+i)%1000/1000*bounds.width} y={stableHash('star-y'+i)%1000/1000*bounds.height} width={i%9===0 ? 2 : 1} height={i%9===0 ? 2 : 1} opacity={home*(.15+i%4*.12)} />)}
      {frame.orbits.map((orbit,i)=><DitherOrbit key={i} orbit={orbit} />)}
    </svg>
    <DitherCanvas getFrame={getFrame} onFrame={rememberFrame} reducedMotion={props.reducedMotion} paused={props.interactive === false && !busy} interactive={props.interactive !== false && !busy} onModeChange={setRenderMode} />
    {busy && <div className="dither-travel-caption" style={{opacity:cloud}} aria-live="polite">穿过星云 · {props.flight?.to === 'visitor' ? '下一颗星球' : desiredHome===0 ? 'Galaxy' : '我的星球'}</div>}
    <div className="dither-stage-accessible" aria-label="场景对象">
      {inGalaxy && !visitor && (props.focusedGalaxy ? props.galaxySystems.filter(s=>s.id===props.focusedGalaxy).flatMap(s=>s.planets.map(p=><button disabled={busy || props.interactive === false} key={p.id} onClick={()=>props.onOpenPlanet(p,s.id)}>场景星球：{p.alias}</button>)) : props.galaxySystems.map(s=><button disabled={busy || props.interactive === false} key={s.id} onClick={()=>props.onSelectGalaxy(s.id)}>场景星系：{s.label}</button>))}
      {home===1 && !visitor && props.friendSatellites.map(f=><button disabled={busy || props.interactive === false} key={f.id} onClick={()=>props.onFriendSelect(f.id)}>好友卫星 {f.displayName}</button>)}
      {(!inGalaxy || visitor) && (props.visitedPlanet ?? props.planet)?.tracks.map(t=><button disabled={busy || props.interactive === false} key={t.id} onClick={()=>props.onMusicSelect(t.id)}>音乐卫星 {t.title}</button>)}
    </div>
  </div>
}
