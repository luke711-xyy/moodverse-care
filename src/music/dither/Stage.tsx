import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MusicFriendSatellite, MusicPlanet, PublicMusicPlanet } from '../../music-api'
import type { MusicTrackSummary } from '../../music-domain'
import type { MusicGalaxySceneSystem, MusicScenePlanet } from '../galaxy-scene'
import { createDitherSpec, effectiveDitherParameters, resolveDitherSpec, stableHash, type DitherPlanetSpec } from './appearance'
import { DitherCanvas } from './DitherCanvas'
import { DitherOrbit } from './components'
import { hitTestDitherAssets } from './layout'
import { buildDitherStageFrame, sampleHomeTransition, type StageFrame } from './stage-layout'
import { TOUR_END } from '../../universe'
import { buildCockpitFlightFrame } from '../cockpit/flight-frame'
import type { CockpitFlight } from '../cockpit/flight'
import { clientPoint, logicalSize } from '../viewport'
import type { DitherFrame } from './renderer'
import { dragOrientation, type Orientation } from './arcball'
import { DEFAULT_OBSERVATION, OBSERVATION_OVERSCAN, clampObservation, observationScenePoint, zoomObservation } from './observation'
import { useObservationView } from './useObservationView'

type Props = { planet: MusicPlanet | null; friendSatellites: MusicFriendSatellite[]; visitedPlanet: PublicMusicPlanet | null; previewSeed: string; previewTracks?: MusicTrackSummary[]; appearancePreview?: DitherPlanetSpec | null; reducedMotion: boolean; productView: string; focusedGalaxy?: string; galaxySystems: MusicGalaxySceneSystem[]; galaxyRotation: number; routeJourney: number; regrouping: boolean; onSelectGalaxy: (id: string)=>void; onOpenPlanet: (planet: MusicScenePlanet, galaxyId: string)=>void; onRotate: (delta: number)=>void; onTourMove: (delta: number)=>void; onMusicSelect: (id: string)=>void; onFriendSelect: (id: string)=>void }
export function Stage(props: Props & { exteriorView?: 'home' | 'galaxy'; interactive?: boolean; flight?: CockpitFlight | null; managedTravel?: boolean; onPlanetSelect?: (kind: 'home' | 'visitor') => void }) {
  const inGalaxy = props.exteriorView ? props.exteriorView === 'galaxy' : props.productView === 'galaxy'
  const desiredHome = inGalaxy ? 0 : 1
  const [home, setHome] = useState(desiredHome), [traveling, setTraveling] = useState(false)
  const homeRef = useRef(home)
  const wrap = useRef<HTMLDivElement>(null), latestFrame = useRef<StageFrame | null>(null)
  const [bounds, setBounds] = useState({ width: 1000, height: 700 })
  const observation = useObservationView(`${inGalaxy ? 'galaxy' : props.visitedPlanet?.id ?? props.planet?.id ?? 'preview'}:${props.flight?.token ?? ''}`, props.reducedMotion)
  const { orientation, rotation:ownRotation } = observation.pose
  const setOrientation=observation.orientation, setOwnRotation=observation.rotation
  const [renderMode, setRenderMode] = useState<'webgl2' | 'canvas2d'>('webgl2')
  const drag = useRef<{ mode:'rotate'|'pan'; x: number; y: number; travel: number; pointerId: number; anchor: { x: number; y: number }; orientation: Orientation; center: { x: number; y: number }; radius: number } | null>(null)
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
    const input = { width, height, phase, owner, visitor, orientation, systems:props.galaxySystems, home, journey:Math.min(1,props.routeJourney/TOUR_END), rotation:home < 1 && props.focusedGalaxy && !visitor ? props.galaxyRotation : ownRotation, focusedGalaxy:props.focusedGalaxy, friends:props.friendSatellites, music:props.planet?.tracks ?? props.previewTracks ?? [] }
    // Render the original picture at its original scale. Zoom must not change
    // particle density, blend in a second surface, or rescale sky layers alone.
    const frame = props.flight ? buildCockpitFlightFrame(input, props.flight) : buildDitherStageFrame({ ...input, visitorFriends: props.visitedPlanet?.friendSatellites ?? [], music:(props.visitedPlanet ?? props.planet)?.tracks ?? props.previewTracks ?? [] })
    if (!latestFrame.current) latestFrame.current=frame
    return frame
  }, [owner,visitor,orientation,props.galaxySystems,home,props.routeJourney,props.galaxyRotation,ownRotation,props.focusedGalaxy,props.friendSatellites,props.visitedPlanet,props.planet,props.previewTracks,props.flight])
  const rememberFrame = useCallback((frame: DitherFrame) => { latestFrame.current = frame as StageFrame }, [])
  const frame = getFrame(bounds.width,bounds.height,0)
  const cloud = props.flight ? Math.sin(props.flight.progress * Math.PI) : sampleHomeTransition(home).cloudOpacity
  const busy = traveling || Boolean(props.flight)
  const viewCamera = !inGalaxy && !busy ? clampObservation(observation.pose.camera,bounds.width,bounds.height) : DEFAULT_OBSERVATION
  const scenePoint = (point: {x:number;y:number}) => observationScenePoint(point,viewCamera,bounds.width,bounds.height)
  // Use the actual canvas rectangle for both picking and hover, including
  // overscan margins, CSS magnification and the app's portrait rotation.
  const renderedPoint = (clientX:number,clientY:number) => {
    const canvas=wrap.current?.querySelector<HTMLCanvasElement>('[data-dither-renderer]')
    return canvas ? clientPoint(canvas,clientX,clientY) : scenePoint(clientPoint(wrap.current!,clientX,clientY))
  }
  useEffect(() => { if (busy || props.interactive === false) drag.current = null }, [busy, props.interactive])
  useEffect(()=>{
    const element=wrap.current
    if(!element || inGalaxy || busy || props.interactive===false) return
    let gestureScale=0
    const zoom=(factor:number,clientX:number,clientY:number)=>{
      const size=logicalSize(element), anchor=clientPoint(element,clientX,clientY)
      observation.camera(camera=>zoomObservation(camera,factor,anchor,size.width,size.height))
    }
    const wheel=(event:WheelEvent)=>{
      event.preventDefault()
      if(gestureScale) return
      const unit=event.deltaMode===1?16:event.deltaMode===2?logicalSize(element).height:1
      zoom(Math.exp(-Math.max(-500,Math.min(500,event.deltaY*unit))*(event.ctrlKey ? .008 : .002)),event.clientX,event.clientY)
    }
    const gesture=(raw:Event)=>{
      const event=raw as Event & {scale:number;clientX:number;clientY:number}
      event.preventDefault()
      if(event.type==='gesturestart'){gestureScale=event.scale||1;observation.stop();return}
      if(event.type==='gestureend'){gestureScale=0;return}
      if(gestureScale && event.scale>0){zoom(event.scale/gestureScale,event.clientX,event.clientY);gestureScale=event.scale}
    }
    element.addEventListener('wheel',wheel,{passive:false})
    for(const name of ['gesturestart','gesturechange','gestureend']) element.addEventListener(name,gesture,{passive:false})
    return ()=>{element.removeEventListener('wheel',wheel);for(const name of ['gesturestart','gesturechange','gestureend']) element.removeEventListener(name,gesture)}
  },[inGalaxy,busy,props.interactive,observation.camera,observation.stop])
  const activate = (clientX:number, clientY:number)=> {
    if (busy || props.interactive === false) return
    const { x, y }=renderedPoint(clientX,clientY), frame=latestFrame.current!
    const canvas=wrap.current!.querySelector<HTMLCanvasElement>('[data-dither-renderer]')
    const hit=hitTestDitherAssets(frame.assets.filter(a=>a.id !== 'nebula'),x,y,{mode:renderMode,pointer:frame.pointer,bodyTargets:true,pixelRatio:canvas ? canvas.width/logicalSize(canvas).width : 1})
    if (hit?.id.startsWith('home:')) { props.onPlanetSelect?.('home'); return }
    if (hit?.id.startsWith('visitor:')) { props.onPlanetSelect?.('visitor'); return }
    if (hit?.id.startsWith('music:')) { props.onMusicSelect(hit.id.slice(6)); return }
    if (hit?.id.startsWith('friend:')) { props.onFriendSelect(hit.id.slice(7)); return }
    if (hit?.id.startsWith('system:')) { props.onSelectGalaxy(hit.id.slice(7)); return }
    if (hit?.id.startsWith('planet:')) {
      const planetId = hit.id.slice(7)
      const system=props.galaxySystems.find(s=>(!props.focusedGalaxy || s.id===props.focusedGalaxy) && s.planets.some(p=>p.id===planetId)), planet=system?.planets.find(p=>p.id===planetId)
      if (planet && system) props.onOpenPlanet(planet,system.id)
      return
    }
    if(!hit && !inGalaxy) observation.reset()
  }
  return <div ref={wrap} className={`dither-stage${props.regrouping ? ' is-regrouping' : ''}`} data-traveling={busy} data-flight-progress={props.flight?.progress} data-flight-ready={props.flight?.ready} data-flight-token={props.flight?.token} role="region" tabIndex={props.interactive === false ? -1 : 0} aria-label="二维音乐宇宙"
    onKeyDown={event=>{ if(busy || props.interactive === false || event.target !== event.currentTarget || !['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); const step=event.key==='ArrowRight' ? .15 : -.15; if(inGalaxy && !visitor) { if(props.focusedGalaxy) props.onRotate(step); else props.onTourMove(step) } else setOwnRotation(r=>r+step) }}
    onPointerDown={event=> {
      if((event.button!==0 && (event.button!==2 || inGalaxy)) || drag.current || busy || props.interactive === false || (event.target as Element).closest('button')) return
      observation.stop()
      if(event.button===2) event.preventDefault()
      const point=clientPoint(event.currentTarget,event.clientX,event.clientY)
      const body=latestFrame.current?.assets.find(asset=>asset.id.startsWith(visitor ? 'visitor:' : 'home:'))
      const anchor=renderedPoint(event.clientX,event.clientY)
      drag.current={mode:event.button===2?'pan':'rotate',...point,anchor,orientation,travel:0,pointerId:event.pointerId,center:body ?? anchor,radius:body ? body.radius*effectiveDitherParameters(body.spec).size*.85 : 1}
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }}
    onPointerMove={event=> {
      const current=drag.current
      if (!current || current.pointerId!==event.pointerId || busy || props.interactive === false) return
      const point=clientPoint(event.currentTarget,event.clientX,event.clientY), dx=point.x-current.x, dy=point.y-current.y
      current.travel+=Math.hypot(dx,dy); current.x=point.x; current.y=point.y
      if(current.mode==='pan') observation.camera(camera=>clampObservation({...camera,x:camera.x+dx,y:camera.y+dy},bounds.width,bounds.height))
      else if(inGalaxy && !visitor) { if(props.focusedGalaxy) props.onRotate(dx*.006); else props.onTourMove(-dx*.0014) }
      else setOrientation(dragOrientation(current.orientation,current.anchor,renderedPoint(event.clientX,event.clientY),current.center,current.radius))
    }}
    onContextMenu={event=>{if(!inGalaxy && !busy && props.interactive!==false)event.preventDefault()}}
    onPointerUp={event=> { const current=drag.current; if(!current || current.pointerId!==event.pointerId) return; drag.current=null; event.currentTarget.releasePointerCapture?.(event.pointerId); if(current.mode==='rotate' && current.travel<6) activate(event.clientX,event.clientY) }}
    onPointerCancel={event=>{if(drag.current?.pointerId===event.pointerId) drag.current=null}} onLostPointerCapture={event=>{if(drag.current?.pointerId===event.pointerId) drag.current=null}}>
    <div className="dither-stage-scene" style={{transform:`translate(${viewCamera.x}px, ${viewCamera.y}px) scale(${viewCamera.zoom})`}}>
    <svg className="dither-stage-lines" viewBox={`0 0 ${bounds.width} ${bounds.height}`} aria-hidden="true">
      <g>
        {home>0 && Array.from({length:80},(_,i)=><rect key={i} x={stableHash('star-x'+i)%1000/1000*bounds.width} y={stableHash('star-y'+i)%1000/1000*bounds.height} width={i%9===0 ? 2 : 1} height={i%9===0 ? 2 : 1} opacity={home*(.15+i%4*.12)} />)}
      </g>
      {frame.orbits.map((orbit,i)=><DitherOrbit key={i} orbit={orbit} />)}
    </svg>
    <DitherCanvas getFrame={getFrame} onFrame={rememberFrame} overscan={!inGalaxy && !busy ? OBSERVATION_OVERSCAN : 1} reducedMotion={props.reducedMotion} paused={props.interactive === false && !busy} interactive={props.interactive !== false && !busy} onModeChange={setRenderMode} />
    </div>
    {busy && <div className="dither-travel-caption" style={{opacity:cloud}} aria-live="polite">穿过星云 · {props.flight?.to === 'visitor' ? '下一颗星球' : desiredHome===0 ? 'Galaxy' : '我的星球'}</div>}
    <div className="dither-stage-accessible" aria-label="场景对象">
      {(home===1 || visitor) && props.onPlanetSelect && <button disabled={busy || props.interactive === false} onClick={()=>props.onPlanetSelect?.(visitor ? 'visitor' : 'home')}>{visitor ? `查看星球：${props.visitedPlanet!.displayName}` : '查看我的星球'}</button>}
      {inGalaxy && !visitor && props.galaxySystems.filter(s => frame.systemTargets.some(target => target.id === s.id)).map(s => <div key={s.id}>
        <button disabled={busy || props.interactive === false} onClick={()=>props.onSelectGalaxy(s.id)}>场景星系：{s.label}</button>
        {s.planets.map(p=><button disabled={busy || props.interactive === false} key={p.id} onClick={()=>props.onOpenPlanet(p,s.id)}>场景星球：{p.alias}</button>)}
      </div>)}
      {(home===1 || visitor) && (props.visitedPlanet ? props.visitedPlanet.friendSatellites ?? [] : props.friendSatellites).filter(f=>frame.assets.some(a=>a.id===`friend:${f.id}`)).map(f=><button disabled={busy || props.interactive === false} key={f.id} onClick={()=>props.onFriendSelect(f.id)}>好友卫星 {f.displayName}</button>)}
      {(!inGalaxy || visitor) && (props.visitedPlanet ?? props.planet)?.tracks.filter((track,index,list)=>list.findIndex(t=>t.id===track.id)===index && frame.assets.some(a=>a.id===`music:${track.id}`)).map(t=><button disabled={busy || props.interactive === false} key={t.id} onClick={()=>props.onMusicSelect(t.id)}>音乐卫星 {t.title}</button>)}
    </div>
  </div>
}
