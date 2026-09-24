import * as THREE from 'three'
import { hashString32, planetLandReliefScale, planetSeaLine, samplePlanetElevation } from './planet-visuals'
import type { Billboard } from './types'

export type BillboardPlacement = {
  billboard: Billboard
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: number
}

type SurfaceCandidate = {
  normal: THREE.Vector3
  radius: number
  clearance: number
}

const seeded = (seed: number) => {
  const value = Math.sin(seed * 97.13) * 43758.5453
  return value - Math.floor(value)
}

function sampleVisibleSurface(
  seed: number,
  attempt: number,
  facing: THREE.Vector3,
  tangentRight: THREE.Vector3,
  tangentUp: THREE.Vector3,
) {
  const capRadius = 1.18
  const radialRoll = seeded(seed + attempt * 31.7 + 0.17)
  const azimuth = seeded(seed + attempt * 53.9 + 11.3) * Math.PI * 2
  const cosAngle = 1 - radialRoll * (1 - Math.cos(capRadius))
  const sinAngle = Math.sqrt(Math.max(0, 1 - cosAngle * cosAngle))
  return facing.clone().multiplyScalar(cosAngle)
    .addScaledVector(tangentRight, Math.cos(azimuth) * sinAngle)
    .addScaledVector(tangentUp, Math.sin(azimuth) * sinAngle)
    .normalize()
}

function surfaceCoordinates(normal: THREE.Vector3) {
  return {
    longitude: ((Math.atan2(normal.z, -normal.x) / (Math.PI * 2)) + 1) % 1,
    latitude: Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1)) / Math.PI + 0.5,
  }
}

export function placeBillboards(
  direction: THREE.Vector3,
  billboards: Billboard[],
  planetId: string,
  radius: number,
  seaLevel: number,
): BillboardPlacement[] {
  const visible = billboards.slice(0, 9)
  const count = visible.length
  if (!count) return []

  const facing = direction.clone().negate().normalize()
  const referenceUp = Math.abs(facing.y) > 0.88 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const tangentUp = referenceUp.clone().addScaledVector(facing, -referenceUp.dot(facing)).normalize()
  const tangentRight = tangentUp.clone().cross(facing).normalize()
  tangentUp.copy(facing).cross(tangentRight).normalize()
  const planetSeed = hashString32(planetId)
  const shoreline = planetSeaLine(planetSeed, seaLevel)
  const waterRadius = radius * (0.982 + seaLevel * 0.03)
  const chosenNormals: THREE.Vector3[] = []
  const minSpacing = 0.34
  const scale = count === 1 ? 0.3 : count <= 3 ? 0.27 : count <= 6 ? 0.25 : 0.23

  return visible.map((billboard) => {
    const boardSeed = hashString32(`${planetId}:${billboard.id}`)
    const pick = (surface: 'land' | 'water' | 'any'): SurfaceCandidate | undefined => {
      let best: SurfaceCandidate | undefined
      for (let attempt = 0; attempt < 160; attempt += 1) {
        const normal = sampleVisibleSurface(boardSeed, attempt, facing, tangentRight, tangentUp)
        const { longitude, latitude } = surfaceCoordinates(normal)
        const elevation = samplePlanetElevation(planetSeed, longitude, latitude, seaLevel)
        const land = elevation >= shoreline
        if ((surface === 'land' && !land) || (surface === 'water' && land)) continue

        const clearance = chosenNormals.length
          ? Math.min(...chosenNormals.map((chosen) => chosen.angleTo(normal)))
          : Math.PI
        const altitude = THREE.MathUtils.clamp((elevation - shoreline) / Math.max(0.08, 0.94 - shoreline), 0, 1)
        const candidate = {
          normal,
          radius: land ? waterRadius * (1.008 + Math.pow(altitude, .84) * planetLandReliefScale) : waterRadius,
          clearance,
        }
        if (!best || candidate.clearance > best.clearance) best = candidate
        if (clearance >= minSpacing && attempt > 3) return candidate
      }
      return best
    }

    let candidate = pick('land')
    if (!candidate || candidate.clearance < minSpacing) {
      const waterCandidate = pick('water')
      if (waterCandidate && (!candidate || waterCandidate.clearance >= minSpacing)) candidate = waterCandidate
    }
    candidate ??= pick('any')
    if (!candidate) {
      const normal = facing.clone()
      candidate = { normal, radius: waterRadius, clearance: Math.PI }
    }
    chosenNormals.push(candidate.normal)

    const boardUp = candidate.normal.clone()
    const boardNormal = facing.clone().addScaledVector(boardUp, -facing.dot(boardUp))
    if (boardNormal.lengthSq() < 0.04) boardNormal.copy(tangentRight).addScaledVector(boardUp, -tangentRight.dot(boardUp))
    boardNormal.normalize()
    const boardRight = boardUp.clone().cross(boardNormal).normalize()
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(boardRight, boardUp, boardNormal),
    )
    const position = candidate.normal.clone().multiplyScalar(candidate.radius)
    return { billboard, position, quaternion, scale }
  })
}
