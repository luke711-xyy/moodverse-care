import { effectiveDitherParameters } from './appearance'
import type { StageFrame } from './stage-layout'
import type { ParticleCloud } from './motion'
import type { DitherFrame } from './renderer'

export type ObservationCamera = { zoom: number; x: number; y: number }
export const DEFAULT_OBSERVATION: ObservationCamera = { zoom:1, x:0, y:0 }
export const OBSERVATION_OVERSCAN = 2

/** The same extent controls the canvas border and the zoom/pan limits. */
export function clampObservation(camera: ObservationCamera, width: number, height: number): ObservationCamera {
  const zoom=Math.max(1/OBSERVATION_OVERSCAN,Math.min(6,camera.zoom))
  const extent=(OBSERVATION_OVERSCAN*zoom-1)/2
  const clamp=(value:number,limit:number)=>Math.max(-limit,Math.min(limit,value)) || 0
  return {zoom,x:clamp(camera.x,width*extent),y:clamp(camera.y,height*extent)}
}

/** Add margins around the unchanged foreground; the sky renders across them. */
export function expandObservationFrame<T extends DitherFrame>(frame:T, overscan:number):T {
  if(overscan===1) return frame
  const x=frame.width*(overscan-1)/2,y=frame.height*(overscan-1)/2
  return {...frame,width:frame.width*overscan,height:frame.height*overscan,
    assets:frame.assets.map(asset=>({...asset,x:asset.x+x,y:asset.y+y}))}
}

/** Undo the one screen-layer transform for object picking and arcball input. */
export function observationScenePoint(point: {x:number;y:number}, camera: ObservationCamera, width: number, height: number) {
  return {x:width/2+(point.x-width/2-camera.x)/camera.zoom,y:height/2+(point.y-height/2-camera.y)/camera.zoom}
}

/** Zoom around the cursor, in the same logical coordinates used by picking. */
export function zoomObservation(camera: ObservationCamera, factor: number, anchor: {x:number;y:number}, width: number, height: number): ObservationCamera {
  if (!Number.isFinite(factor) || factor <= 0) return camera
  const zoom=Math.max(1/OBSERVATION_OVERSCAN,Math.min(6,camera.zoom*factor)), ratio=zoom/camera.zoom
  return clampObservation({zoom,x:anchor.x-width/2-(anchor.x-width/2-camera.x)*ratio,y:anchor.y-height/2-(anchor.y-height/2-camera.y)*ratio},width,height)
}

/** View-only data: never alters the saved planet appearance. */
export function observeFrame(frame: StageFrame, camera: ObservationCamera): StageFrame {
  const {zoom,x,y}=camera, cx=frame.width/2, cy=frame.height/2
  const t=Math.max(0,Math.min(1,(zoom-1)/2)), detail=t*t*(3-2*t)
  const point=(p:{x:number;y:number})=>({x:cx+(p.x-cx)*zoom+x,y:cy+(p.y-cy)*zoom+y})
  return {...frame,observation:camera,
    assets:frame.assets.map(asset=>({...asset,...point(asset),radius:asset.radius*zoom,
      pixelSize:effectiveDitherParameters(asset.spec).pixelSize/Math.max(1,zoom),detail})),
    orbits:frame.orbits.map(orbit=>({...orbit,...point(orbit),rx:orbit.rx*zoom,ry:orbit.ry*zoom})),
  }
}

/** A display copy preserves the sky simulation's world coordinates each frame. */
export function observeSkyPoints<T extends ParticleCloud>(cloud:T,camera:ObservationCamera|undefined,width:number,height:number):T {
  if(!camera || camera.zoom===1 && camera.x===0 && camera.y===0) return cloud
  const points=cloud.points.slice()
  for(let i=0;i<cloud.count;i++){
    const n=i*6
    points[n]=width/2+(points[n]-width/2)*camera.zoom+camera.x
    points[n+1]=height/2+(points[n+1]-height/2)*camera.zoom+camera.y
    points[n+4]*=camera.zoom
  }
  return {...cloud,points}
}
