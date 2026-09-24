import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import type { Planet } from '../src/types'
import {
  adjacentOwnPlanetIndex,
  adjacentPlanetIndex,
  earliestActivePlanetId,
  orientationForDragAnchor,
  resolveSelfPlanet,
  selfPlanetWheelAction,
} from '../src/scene-state'

const selfPlanet = (theme: Planet['theme']): Planet => ({
  id: 'self', alias: '我的星球', theme, mood: 'calm', intensity: 3,
  message: '', owner: true, position: [0, 0, 0], orbit: 0,
})

describe('resolveSelfPlanet', () => {
  it('uses the current own-planet state throughout the journey before selection changes', () => {
    const updatedPlanet = selfPlanet('court')

    expect(resolveSelfPlanet(updatedPlanet)).toBe(updatedPlanet)
  })

  it('prefers current own-planet data over an older selected snapshot', () => {
    const updatedPlanet = selfPlanet('court')
    const staleSelection = selfPlanet('care')

    expect(resolveSelfPlanet(updatedPlanet, staleSelection)).toBe(updatedPlanet)
  })

  it('can fall back to a selected owner planet but never a visitor planet', () => {
    const owner = selfPlanet('study')
    const visitor = { ...owner, id: 'visitor', owner: false }

    expect(resolveSelfPlanet(undefined, owner)).toBe(owner)
    expect(resolveSelfPlanet(undefined, visitor)).toBeUndefined()
  })
})

describe('self planet navigation and drag input', () => {
  it('enters the oldest active planet rather than the last visited one', () => {
    const oldest = { ...selfPlanet('study'), id: 'oldest', createdAt: '2026-01-01T00:00:00Z' }
    const later = { ...selfPlanet('care'), id: 'later', createdAt: '2026-02-01T00:00:00Z' }
    const archived = { ...selfPlanet('court'), id: 'archived', createdAt: '2025-01-01T00:00:00Z', archivedAt: '2026-03-01T00:00:00Z' }

    expect(earliestActivePlanetId([later, archived, oldest])).toBe('oldest')
    expect(earliestActivePlanetId([])).toBeUndefined()
  })

  it('uses down to advance and up to return one planet at a time, exiting only from the oldest', () => {
    expect(selfPlanetWheelAction(80, 2)).toBe('next')
    expect(selfPlanetWheelAction(-80, 2)).toBe('previous')
    expect(selfPlanetWheelAction(-80, 1)).toBe('previous')
    expect(selfPlanetWheelAction(-80, 0)).toBe('exit')
    expect(selfPlanetWheelAction(0)).toBe('ignore')
    expect(selfPlanetWheelAction(Number.NaN)).toBe('ignore')
  })

  it('steps through planets within a galaxy without wrapping at either end', () => {
    expect(adjacentPlanetIndex(0, 1, 3)).toBe(1)
    expect(adjacentPlanetIndex(2, -1, 3)).toBe(1)
    expect(adjacentPlanetIndex(0, -1, 3)).toBeUndefined()
    expect(adjacentPlanetIndex(2, 1, 3)).toBeUndefined()
    expect(adjacentPlanetIndex(-1, 1, 3)).toBe(0)
    expect(adjacentPlanetIndex(0, 1, 0)).toBeUndefined()
  })

  it('steps from the last created planet into the first embryo slot', () => {
    expect(adjacentOwnPlanetIndex(2, 1, 3)).toBe(3)
    expect(adjacentOwnPlanetIndex(3, -1, 3)).toBe(2)
    expect(adjacentOwnPlanetIndex(3, 1, 3)).toBeUndefined()
    expect(adjacentOwnPlanetIndex(5, 1, 6)).toBeUndefined()
  })

  it('keeps the grabbed surface point aligned with the pointer', () => {
    const startOrientation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.73)
    const anchorLocal = new Vector3(0.24, 0.51, 0.82).normalize()
    const targetDirection = new Vector3(-0.32, 0.84, 0.43).normalize()
    const nextOrientation = orientationForDragAnchor(startOrientation, anchorLocal, targetDirection)
    const movedAnchor = anchorLocal.clone().applyQuaternion(nextOrientation)

    expect(movedAnchor.distanceTo(targetDirection)).toBeLessThan(1e-10)
  })
})
