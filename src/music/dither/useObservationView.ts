import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IDENTITY_ORIENTATION, type Orientation } from './arcball'
import { DEFAULT_OBSERVATION, type ObservationCamera } from './observation'

type Pose = { camera: ObservationCamera; orientation: Orientation; rotation: number }
const DEFAULT_POSE: Pose = {camera:DEFAULT_OBSERVATION,orientation:IDENTITY_ORIENTATION,rotation:0}
export function useObservationView(destination: string, reducedMotion: boolean) {
  const [pose,setPose]=useState(DEFAULT_POSE), current=useRef(pose), animation=useRef(0)
  const stop=useCallback(()=>{cancelAnimationFrame(animation.current);animation.current=0},[])
  const update=useCallback((next:Pose)=>{current.current=next;setPose(next)},[])
  useLayoutEffect(()=>{stop();update(DEFAULT_POSE)},[destination,stop,update])
  useEffect(()=>stop,[stop])
  const camera=useCallback((change:(value:ObservationCamera)=>ObservationCamera)=>{stop();update({...current.current,camera:change(current.current.camera)})},[stop,update])
  const orientation=useCallback((value:Orientation)=>{stop();update({...current.current,orientation:value})},[stop,update])
  const rotation=useCallback((change:(value:number)=>number)=>{stop();update({...current.current,rotation:change(current.current.rotation)})},[stop,update])
  const reset=useCallback(()=>{
    stop()
    const start=current.current, target={...start,camera:DEFAULT_OBSERVATION}
    if(reducedMotion){update(target);return}
    const began=performance.now()
    const tick=(now:number)=>{
      const p=Math.min(1,Math.max(0,(now-began)/300)), t=1-(1-p)**3
      if(p===1){update(target);animation.current=0;return}
      update({...start,camera:{zoom:start.camera.zoom+(1-start.camera.zoom)*t,x:start.camera.x*(1-t),y:start.camera.y*(1-t)}})
      animation.current=requestAnimationFrame(tick)
    }
    animation.current=requestAnimationFrame(tick)
  },[reducedMotion,stop,update])
  return {pose,camera,orientation,rotation,reset,stop}
}
