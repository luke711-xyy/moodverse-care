import { expect, test, vi } from 'vitest'
import { createDitherSpec } from '../src/music/dither/appearance'
import { createDitherCellField, stepParticleField } from '../src/music/dither/motion'

const spec=createDitherSpec({planetId:'cached-tide',tracks:[],overrides:{pulse:.7,pointer:'off'}})

test('stable material cells reuse spatial trigonometry instead of recalculating it every frame',()=>{
  const field=createDitherCellField(20),pose={spec,phase:0,rotation:.47,radius:120}
  stepParticleField(field,pose,1/60,.1,undefined,true,{bpm:80,cycles:.2,playing:true})
  const cos=vi.spyOn(Math,'cos'),sin=vi.spyOn(Math,'sin')
  try {
    stepParticleField(field,pose,1/60,.2,undefined,true,{bpm:80,cycles:.3,playing:true})
    expect(cos.mock.calls.length+sin.mock.calls.length).toBeLessThan(20)
  } finally {cos.mockRestore();sin.mockRestore()}
})

test.each([0,.47,1.57])('cached tide retains independent reference motion after rotation and pulse edits (%s)',rotation=>{
  const field=createDitherCellField(4),pose={spec,phase:0,rotation,radius:120}
  // A fresh one-substep spring starts at rest: v=tide*100*dt, offset=v*dt.
  const dt=1/120,cycles=.27,amplitude=.16*Math.sqrt(.7)
  stepParticleField(field,pose,dt,.2,undefined,true,{bpm:80,cycles,playing:true})
  for(let i=0;i<field.count;i++){
    const nx=field.homes[i*3],ny=field.homes[i*3+1],depth=field.homes[i*3+2]
    const x=nx*Math.cos(rotation)-ny*Math.sin(rotation),y=nx*Math.sin(rotation)+ny*Math.cos(rotation)
    const phase=(cycles-(y+1)*.23-(1-depth)*.19)*Math.PI*2
    const wave=((1+Math.cos(phase))*.5)**6-.48*((1+Math.cos(phase-1.65))*.5)**3
    const shear=Math.sin(phase+y*2)*amplitude*.23
    expect(field.offsets[i*2]).toBeCloseTo((x*wave*amplitude-y*shear)*100*dt*dt,8)
    expect(field.offsets[i*2+1]).toBeCloseTo((y*wave*amplitude+x*shear)*100*dt*dt,8)
  }
  // Cached geometry must not retain a stale rotation after an edit.
  const turned={...pose,rotation:rotation+.3,spec:{...spec,overrides:{...spec.overrides,pulse:0}}}
  stepParticleField(field,turned,0,.2,undefined,false)
  expect(field.points[2]).toBeCloseTo(field.homes[0]*Math.cos(turned.rotation)-field.homes[1]*Math.sin(turned.rotation),6)
})
