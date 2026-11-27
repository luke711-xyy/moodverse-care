import { expect, test } from 'vitest'
import { advanceFlight, getFlightSpeed, type CockpitFlight } from '../src/music/cockpit/flight'
import { buildCockpitFlightSceneFrame, buildCockpitFlightNebulaFrame, cockpitFlightBlend } from '../src/music/cockpit/flight-frame'
import { createDitherSpec, effectiveDitherParameters } from '../src/music/dither/appearance'

test('speed accelerates into the cloud, stays high while crossing or awaiting data, and brakes only on arrival', () => {
  expect(getFlightSpeed).toBeTypeOf('function')
  const flight: CockpitFlight = {token:1,from:'galaxy',to:'home',progress:0,ready:true,sourceVisitor:null,targetVisitor:null,returning:false}
  expect(getFlightSpeed(null)).toBe(0)
  expect(getFlightSpeed(flight)).toBe(0)
  expect(getFlightSpeed({...flight,progress:.25})).toBeGreaterThan(.5)
  expect(getFlightSpeed({...flight,progress:.5})).toBeCloseTo(1)
  expect(getFlightSpeed({...flight,progress:.75})).toBeCloseTo(1)
  expect(getFlightSpeed({...flight,progress:.8})).toBeCloseTo(1)
  expect(getFlightSpeed({...flight,progress:.9})).toBeLessThan(getFlightSpeed({...flight,progress:.8}))
  expect(getFlightSpeed({...flight,progress:1})).toBe(0)
  expect(getFlightSpeed({...flight,progress:.5,ready:false})).toBeCloseTo(1)
  expect(getFlightSpeed({...flight,progress:NaN})).toBe(0)
})

test('slow flight holds in the cloud; reduced motion still waits for destination data', () => {
  expect(advanceFlight(.499, 50, false, false)).toBe(.5)
  expect(advanceFlight(.5, 50, false, false)).toBe(.5)
  expect(advanceFlight(.5, 50, true, false)).toBeGreaterThan(.5)
  expect(advanceFlight(0, 50, false, true)).toBe(.5)
  expect(advanceFlight(0, 50, true, true)).toBe(1)
})
test('scene endpoints preserve planet pose while the cloud controls the handoff', () => {
  const orientation = [0, .6, 0, .8] as const
  const input = { width: 1000, height: 700, phase: 0, owner: createDitherSpec({ planetId: 'home', tracks: [] }), systems: [], home: 1, journey: 0, rotation: .8, homeRotation: .8, galaxyRotation: .2, orientation, friends: [], music: [] }
  const planet = buildCockpitFlightSceneFrame(input,'home',null).assets.find(a => a.id.startsWith('home:'))!
  expect([planet.x,planet.y,planet.radius]).toEqual([510,343,218.025])
  expect(planet.rotation).toBeCloseTo(.2)
  expect(planet.orientation).toEqual(orientation)
  expect(cockpitFlightBlend(.1)).toBe(0)
  expect(cockpitFlightBlend(.5)).toBeCloseTo(.5)
  expect(cockpitFlightBlend(.9)).toBe(1)
  expect(buildCockpitFlightNebulaFrame(input,.5).assets[0].opacity).toBe(.92)
  expect(buildCockpitFlightNebulaFrame(input,1).assets).toHaveLength(0)
})

test('flight nebula uses viewport dimensions and the original four-pixel grid', () => {
  const input = { width:1000, height:700, phase:0, owner:createDitherSpec({planetId:'home',tracks:[]}), systems:[], home:1, journey:0, rotation:0, friends:[], music:[] }
  const frame=buildCockpitFlightNebulaFrame(input,.5), cloud=frame.assets[0]
  expect([frame.width,frame.height,cloud.x,cloud.y,cloud.radius]).toEqual([1000,700,500,350,720])
  expect(effectiveDitherParameters(cloud.spec).pixelSize).toBe(4)
  expect(cloud.pixelSize).toBeUndefined()
  expect(cloud.radius).toBeGreaterThan(Math.hypot(1000,700)/2)
  expect(frame.assets).toHaveLength(1)
  expect(frame.ambience).toBe(0)
})

test('visitor flight endpoints keep each destination friend satellites separate from home', () => {
  const visitor = (id: string) => ({ id, displayName: id, tracks: [], visual: createDitherSpec({ planetId: id, tracks: [] }), friendSatellites: [{ id: `${id}-friend`, isVirtual: false }] })
  const input = { width: 1000, height: 700, phase: 0, owner: createDitherSpec({ planetId: 'home', tracks: [] }), systems: [], home: 1, journey: 0, rotation: 0, friends: [{ id: 'home-friend', isVirtual: false }], music: [] }
  const friends = (destination:'home'|'visitor',planet:ReturnType<typeof visitor>|null) => buildCockpitFlightSceneFrame(input,destination,planet as Parameters<typeof buildCockpitFlightSceneFrame>[2]).assets.filter(a => a.id.startsWith('friend:')).map(a => a.id)
  expect(friends('visitor',visitor('first'))).toEqual(['friend:first-friend'])
  expect(friends('visitor',visitor('second'))).toEqual(['friend:second-friend'])
  expect(friends('home',null)).toEqual(['friend:home-friend'])
})
