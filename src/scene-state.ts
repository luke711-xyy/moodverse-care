import { Quaternion, Vector3 } from 'three'
import type { Planet } from './types'

export function resolveSelfPlanet(ownPlanet?: Planet, selectedPlanet?: Planet): Planet | undefined {
  if (ownPlanet?.owner) return ownPlanet
  if (selectedPlanet?.owner) return selectedPlanet
  return undefined
}

export type SelfPlanetWheelAction = 'exit' | 'next' | 'previous' | 'ignore'

export function selfPlanetWheelAction(deltaY: number, currentIndex = 0): SelfPlanetWheelAction {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 'ignore'
  if (deltaY > 0) return 'next'
  return Number.isFinite(currentIndex) && currentIndex > 0 ? 'previous' : 'exit'
}

export function adjacentPlanetIndex(currentIndex: number, direction: -1 | 1, count: number): number | undefined {
  if (!Number.isInteger(currentIndex) || !Number.isFinite(count) || count <= 0) return undefined
  const nextIndex = currentIndex + direction
  return nextIndex >= 0 && nextIndex < count ? nextIndex : undefined
}

export function adjacentOwnPlanetIndex(
  currentIndex: number,
  direction: -1 | 1,
  activePlanetCount: number,
  maxSlots = 6,
): number | undefined {
  if (!Number.isInteger(activePlanetCount) || activePlanetCount < 0 || !Number.isInteger(maxSlots) || maxSlots < 1) return undefined
  const slotCount = activePlanetCount + (activePlanetCount < maxSlots ? 1 : 0)
  return adjacentPlanetIndex(currentIndex, direction, slotCount)
}

export function earliestActivePlanetId(planets: Planet[]): string | undefined {
  return planets
    .filter((planet) => !planet.archivedAt)
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))[0]?.id
}

export function orientationForDragAnchor(
  currentOrientation: Quaternion,
  anchorLocal: Vector3,
  targetDirection: Vector3,
): Quaternion {
  const currentAnchorDirection = anchorLocal.clone().applyQuaternion(currentOrientation)
  const target = targetDirection.clone()
  if (currentAnchorDirection.lengthSq() < 1e-12 || target.lengthSq() < 1e-12) return currentOrientation.clone()

  currentAnchorDirection.normalize()
  target.normalize()
  const delta = new Quaternion().setFromUnitVectors(currentAnchorDirection, target)
  return delta.multiply(currentOrientation).normalize()
}
