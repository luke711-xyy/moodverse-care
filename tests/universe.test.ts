import { describe, expect, it } from 'vitest'

import {
  advanceJourney,
  aimCameraAtScreenX,
  buildGalaxyAnchors,
  buildPlanetSlots,
  choosePlanetLod,
  galaxyOrbitAngle,
  galaxyOrbitalPlaneNormal,
  GALAXY_ARM_DEPTH_SCALE,
  GALAXY_ARM_HALF_THICKNESS_BASE,
  GALAXY_ARM_HALF_THICKNESS_SCALE,
  GALAXY_CLUSTER_RADIUS,
  GALAXY_SELECTION_RADIUS,
  getCurrentTourAnchorIndex,
  getSelfArrivalJourneyDuration,
  getSelfArrivalJourneyProgress,
  getSelfReturnJourneyProgress,
  getGalaxyFocusPose,
  getPlanetFocusPose,
  getSelfPlanetFocusPose,
  homeGalaxyEntranceScale,
  getTourAnchorProgress,
  getTourTrackProgress,
  hasReachedTourAnchor,
  GALAXY_ARM_ROTATION_SPEED,
  GALAXY_PLANE_VIEW_ANGLE,
  normalizeWheelDelta,
  PORTAL_START,
  projectedRadiusPx,
  planetPickRadiusWorld,
  reachesTourHomeEndpoint,
  rotateGalaxyPosition,
  sampleTourPose,
  SELF_ARRIVAL_CLOUD_DURATION_MS,
  SELF_ARRIVAL_LANDING_DURATION_MS,
  SELF_ARRIVAL_OVERSHOOT_DURATION_MS,
  SELF_ARRIVAL_TOUR_DURATION_MS,
  SELF_START,
  SELF_RETURN_CLOUD_DURATION_MS,
  SELF_RETURN_TOUR_DURATION_MS,
  TOUR_END,
  TOUR_OVERSHOOT,
} from '../src/universe.ts'
import { THEME_IDS } from '../src/types.ts'

const GALAXY_RADIUS = 26
const CLUSTER_RADIUS = 3.2

type Vec3 = readonly [number, number, number]

const magnitude = ([x, y, z]: Vec3) => Math.hypot(x, y, z)

const subtract = (left: Vec3, right: Vec3): [number, number, number] => [
  left[0] - right[0],
  left[1] - right[1],
  left[2] - right[2],
]

const dot = (left: Vec3, right: Vec3) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2]

const cross = (left: Vec3, right: Vec3): [number, number, number] => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
]

const normalized = (value: Vec3): [number, number, number] => {
  const length = magnitude(value)
  return [value[0] / length, value[1] / length, value[2] / length]
}

const expectVectorClose = (actual: Vec3, expected: Vec3, precision = 8) => {
  expect(actual).toHaveLength(3)
  for (let index = 0; index < 3; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], precision)
  }
}

describe('galaxy and planet layout', () => {
  it('makes theme galaxies clickable across their spiral-arm footprint', () => {
    expect(GALAXY_SELECTION_RADIUS).toBeGreaterThan(2.65)
    expect(GALAXY_SELECTION_RADIUS).toBeLessThan(GALAXY_CLUSTER_RADIUS * 1.5)
  })

  it('uses the spiral arm rotation direction and shared slow orbital speed', () => {
    const quarterTurn = rotateGalaxyPosition([1, 0, 0], Math.PI / 2)

    expect(quarterTurn[0]).toBeCloseTo(0)
    expect(quarterTurn[1]).toBe(0)
    expect(quarterTurn[2]).toBeCloseTo(-1)
    expect(GALAXY_ARM_ROTATION_SPEED).toBeGreaterThan(0)
    expect(GALAXY_ARM_ROTATION_SPEED).toBeLessThan(0.1)
    expect(galaxyOrbitAngle(5)).toBeCloseTo(5 * GALAXY_ARM_ROTATION_SPEED)
    expect(galaxyOrbitAngle(5, true)).toBe(0)
  })

  it('keeps the galaxy disk moderately inclined to the viewer', () => {
    const viewer = normalized([1.4, 0.6, -2.1])
    const normal = galaxyOrbitalPlaneNormal(viewer)

    expect(magnitude(normal)).toBeCloseTo(1, 8)
    expect(dot(normal, viewer)).toBeCloseTo(Math.cos(GALAXY_PLANE_VIEW_ANGLE), 8)
    expect(galaxyOrbitalPlaneNormal([0, 1, 0]).every(Number.isFinite)).toBe(true)
  })

  it('keeps planetary orbital paths within the spiral-arm particle layer', () => {
    for (const theme of [...THEME_IDS, 'home-galaxy']) {
      for (const [x, y, z] of buildPlanetSlots(theme, 10, CLUSTER_RADIUS)) {
        const radius = Math.hypot(x, y, z / GALAXY_ARM_DEPTH_SCALE)
        const particleLayerHalfThickness = GALAXY_ARM_HALF_THICKNESS_BASE + radius * GALAXY_ARM_HALF_THICKNESS_SCALE

        expect(Math.abs(y)).toBeLessThanOrEqual(particleLayerHalfThickness + 1e-8)
      }
    }
  })

  it('places every theme galaxy on a non-coplanar radius-26 shell without overlap', () => {
    const anchors = buildGalaxyAnchors(THEME_IDS, GALAXY_RADIUS)

    expect(anchors).toHaveLength(THEME_IDS.length)
    expect(anchors.map((anchor) => anchor.theme)).toEqual(THEME_IDS)

    for (const anchor of anchors) {
      expect(anchor.position.every(Number.isFinite)).toBe(true)
      expect(Math.abs(magnitude(anchor.position) - GALAXY_RADIUS)).toBeLessThan(0.26)
      expect(Number.isFinite(anchor.azimuth)).toBe(true)
      expect(Number.isFinite(anchor.elevation)).toBe(true)
    }

    for (let left = 0; left < anchors.length; left += 1) {
      for (let right = left + 1; right < anchors.length; right += 1) {
        expect(magnitude(subtract(anchors[left].position, anchors[right].position))).toBeGreaterThan(
          CLUSTER_RADIUS * 2,
        )
      }
    }

    const origin = anchors[0].position
    let greatestSignedVolume = 0
    for (let first = 1; first < anchors.length - 2; first += 1) {
      for (let second = first + 1; second < anchors.length - 1; second += 1) {
        for (let third = second + 1; third < anchors.length; third += 1) {
          const signedVolume = Math.abs(
            dot(
              subtract(anchors[first].position, origin),
              cross(
                subtract(anchors[second].position, origin),
                subtract(anchors[third].position, origin),
              ),
            ),
          )
          greatestSignedVolume = Math.max(greatestSignedVolume, signedVolume)
        }
      }
    }
    expect(greatestSignedVolume).toBeGreaterThan(1)
  })

  it('builds ten deterministic, unique local slots inside the cluster radius for every theme', () => {
    for (const theme of THEME_IDS) {
      const first = buildPlanetSlots(theme, 10, CLUSTER_RADIUS)
      const repeated = buildPlanetSlots(theme, 10, CLUSTER_RADIUS)

      expect(first).toHaveLength(10)
      expect(repeated).toEqual(first)
      expect(new Set(first.map((position) => position.join(','))).size).toBe(first.length)

      for (const position of first) {
        expect(position).toHaveLength(3)
        expect(position.every(Number.isFinite)).toBe(true)
        expect(magnitude(position)).toBeLessThanOrEqual(CLUSTER_RADIUS + Number.EPSILON * 16)
      }
    }
  })

  it('uses the theme as part of the deterministic planet layout', () => {
    expect(buildPlanetSlots('study', 10, CLUSTER_RADIUS)).not.toEqual(
      buildPlanetSlots('career', 10, CLUSTER_RADIUS),
    )
  })

  it('gives the home galaxy six deterministic 3D slots using the same cluster layout', () => {
    const homeSlots = buildPlanetSlots('home-galaxy', 6, CLUSTER_RADIUS)
    const repeated = buildPlanetSlots('home-galaxy', 6, CLUSTER_RADIUS)

    expect(homeSlots).toHaveLength(6)
    expect(repeated).toEqual(homeSlots)
    expect(new Set(homeSlots.map((position) => position.join(','))).size).toBe(6)
    expect(new Set(homeSlots.map(([, y]) => y)).size).toBeGreaterThan(1)
    expect(homeSlots.every((position) => magnitude(position) <= CLUSTER_RADIUS + Number.EPSILON * 16)).toBe(true)
    expect(homeSlots).not.toEqual(buildPlanetSlots('care', 6, CLUSTER_RADIUS))
  })
})

describe('wheel-driven journey', () => {
  it('normalizes wheel direction and delta modes while making deltaY < 0 move forward', () => {
    const pixelStep = normalizeWheelDelta(-48, 0, 800)
    const lineStep = normalizeWheelDelta(-3, 1, 800)
    const pageStep = normalizeWheelDelta(-1, 2, 800)

    expect(pixelStep).toBeGreaterThan(0)
    expect(normalizeWheelDelta(48, 0, 800)).toBeLessThan(0)
    expect(normalizeWheelDelta(0, 0, 800)).toBe(0)
    expect(pixelStep).toBeCloseTo((48 / 800 * .38) / 1.8, 10)
    expect(lineStep).toBeCloseTo(pixelStep, 10)
    expect(pageStep).toBeCloseTo(normalizeWheelDelta(-800, 0, 800), 10)

    expect(normalizeWheelDelta(-100_000, 0, 800)).toBeCloseTo((0.12 * 0.4) / 1.8, 10)

    expect(advanceJourney(0.2, pixelStep).progress).toBeGreaterThan(0.2)
  })

  it('returns to the user planet when forward wheel movement reaches the final axis node', () => {
    expect(reachesTourHomeEndpoint(TOUR_END - 0.01, 0.01)).toBe(true)
    expect(reachesTourHomeEndpoint(TOUR_END, 0.001)).toBe(true)
    expect(reachesTourHomeEndpoint(TOUR_END - 0.01, -0.02)).toBe(false)
    expect(reachesTourHomeEndpoint(TOUR_END - 0.01, 0.005)).toBe(false)
    expect(reachesTourHomeEndpoint(Number.NaN, 1)).toBe(false)
  })

  it('uses the final wheel buffer to rotate beyond the full tour before opening the portal', () => {
    const stillTouring = advanceJourney(0.78, 0.019)

    expect(stillTouring.progress).toBeCloseTo(0.799, 10)
    expect(stillTouring.phase).toBe('tour')
    expect(stillTouring.tourProgress).toBeGreaterThan(1)
    expect(stillTouring.tourProgress).toBeLessThan(1 + TOUR_OVERSHOOT)
    expect(stillTouring.portalProgress).toBe(0)

    const enteredPortal = advanceJourney(stillTouring.progress, 0.002)
    expect(enteredPortal.progress).toBeCloseTo(0.801, 10)
    expect(enteredPortal.phase).toBe('portal')
    expect(enteredPortal.tourProgress).toBeCloseTo(1 + TOUR_OVERSHOOT, 10)
    expect(enteredPortal.portalProgress).toBeCloseTo((0.801 - 0.8) / (0.98 - 0.8), 10)
  })

  it('clamps total progress and enters self phase at 0.98', () => {
    const arrived = advanceJourney(0.97, 0.011)
    const clampedAtEnd = advanceJourney(0.99, 0.5)
    const clampedAtStart = advanceJourney(0.01, -0.5)

    expect(arrived.phase).toBe('self')
    expect(arrived.portalProgress).toBe(1)
    expect(clampedAtEnd.progress).toBe(1)
    expect(clampedAtEnd.phase).toBe('self')
    expect(clampedAtStart.progress).toBe(0)
    expect(clampedAtStart.phase).toBe('tour')
  })

  it('reveals the home galaxy as a distant point and smoothly scales it up through the portal', () => {
    const start = homeGalaxyEntranceScale(0)
    const quarter = homeGalaxyEntranceScale(0.25)
    const middle = homeGalaxyEntranceScale(0.5)
    const nearArrival = homeGalaxyEntranceScale(0.9)
    const arrived = homeGalaxyEntranceScale(1)

    expect(start).toBeCloseTo(0.018)
    expect(quarter).toBeGreaterThan(start)
    expect(quarter).toBeLessThan(0.1)
    expect(middle).toBeGreaterThan(quarter)
    expect(middle).toBeLessThan(0.3)
    expect(homeGalaxyEntranceScale(0.72)).toBeLessThan(0.55)
    expect(nearArrival).toBeGreaterThan(middle)
    expect(arrived).toBe(1)
    expect(homeGalaxyEntranceScale(-1)).toBe(start)
    expect(homeGalaxyEntranceScale(2)).toBe(arrived)
    expect(homeGalaxyEntranceScale(Number.NaN)).toBe(start)
  })

  it('reverses the home-galaxy entrance scale while leaving through the portal', () => {
    const returningPortalProgress = [1, 0.75, 0.5, 0.25, 0]
    const returningScales = returningPortalProgress.map(homeGalaxyEntranceScale)

    expect(returningScales[0]).toBe(1)
    expect(returningScales.at(-1)).toBeCloseTo(0.018)
    expect(returningScales.every((scale, index) => index === 0 || scale < returningScales[index - 1])).toBe(true)
  })

  it('returns through the nebula before quickly rotating back to the first galaxy', () => {
    const start = 1
    const cloudExit = getSelfReturnJourneyProgress(start, SELF_RETURN_CLOUD_DURATION_MS)
    const halfwayThroughTour = getSelfReturnJourneyProgress(start, SELF_RETURN_CLOUD_DURATION_MS + SELF_RETURN_TOUR_DURATION_MS / 2)
    const returned = getSelfReturnJourneyProgress(start, SELF_RETURN_CLOUD_DURATION_MS + SELF_RETURN_TOUR_DURATION_MS)

    expect(getSelfReturnJourneyProgress(start, 0)).toBe(1)
    expect(cloudExit).toBeCloseTo(0.8, 10)
    expect(halfwayThroughTour).toBeCloseTo(0.4, 10)
    expect(returned).toBe(0)
    expect(getSelfReturnJourneyProgress(0.7, SELF_RETURN_TOUR_DURATION_MS)).toBe(0)
  })

  it('uses the original tour-then-nebula sequence when arriving at the home planet', () => {
    const duration = getSelfArrivalJourneyDuration(0)
    const tourEnd = SELF_ARRIVAL_TOUR_DURATION_MS
    const cloudStart = tourEnd + SELF_ARRIVAL_OVERSHOOT_DURATION_MS
    const cloudEnd = cloudStart + SELF_ARRIVAL_CLOUD_DURATION_MS

    expect(getSelfArrivalJourneyProgress(0, 0)).toBe(0)
    expect(getSelfArrivalJourneyProgress(0, tourEnd)).toBeCloseTo(0.72, 10)
    expect(getSelfArrivalJourneyProgress(0, cloudStart)).toBe(PORTAL_START)
    expect(advanceJourney(getSelfArrivalJourneyProgress(0, cloudStart), 0).portalProgress).toBe(0)
    expect(getSelfArrivalJourneyProgress(0, cloudStart + SELF_ARRIVAL_CLOUD_DURATION_MS / 2)).toBeCloseTo(0.89, 10)
    expect(advanceJourney(getSelfArrivalJourneyProgress(0, cloudStart + SELF_ARRIVAL_CLOUD_DURATION_MS / 2), 0).portalProgress).toBeCloseTo(0.5, 10)
    expect(getSelfArrivalJourneyProgress(0, cloudEnd)).toBe(SELF_START)
    expect(advanceJourney(getSelfArrivalJourneyProgress(0, cloudEnd), 0).portalProgress).toBe(1)
    const selectedGalaxyProgress = 0.64
    const selectedGalaxyTourTime = ((TOUR_END - selectedGalaxyProgress) / TOUR_END) * SELF_ARRIVAL_TOUR_DURATION_MS
    const selectedGalaxyCloudStart = selectedGalaxyTourTime + SELF_ARRIVAL_OVERSHOOT_DURATION_MS
    expect(getSelfArrivalJourneyProgress(selectedGalaxyProgress, selectedGalaxyCloudStart)).toBe(PORTAL_START)
    expect(getSelfArrivalJourneyDuration(selectedGalaxyProgress) - selectedGalaxyCloudStart).toBeCloseTo(
      SELF_ARRIVAL_CLOUD_DURATION_MS + SELF_ARRIVAL_LANDING_DURATION_MS,
      10,
    )
    expect(getSelfArrivalJourneyProgress(0, duration)).toBe(1)
    expect(getSelfArrivalJourneyProgress(0.9, 0)).toBeCloseTo(0.9, 10)
    expect(getSelfArrivalJourneyDuration(1)).toBe(0)
    expect(getSelfArrivalJourneyProgress(1, 0)).toBe(1)
    expect(getSelfArrivalJourneyDuration(0.3, true)).toBe(0)
    expect(getSelfArrivalJourneyProgress(0.3, 0, true)).toBe(1)
    expect(duration).toBe(tourEnd + SELF_ARRIVAL_OVERSHOOT_DURATION_MS + SELF_ARRIVAL_CLOUD_DURATION_MS + SELF_ARRIVAL_LANDING_DURATION_MS)
  })

  it('aligns galaxy stops with the progress track and reserves its end for the final turn', () => {
    const purpleStop = getTourAnchorProgress(4, THEME_IDS.length)
    const finalStop = getTourAnchorProgress(THEME_IDS.length - 1, THEME_IDS.length)

    expect(purpleStop).toBeCloseTo(4 / (THEME_IDS.length - 1), 10)
    expect(getTourTrackProgress(purpleStop)).toBeCloseTo(purpleStop / (1 + TOUR_OVERSHOOT), 10)
    expect(getTourTrackProgress(finalStop)).toBeCloseTo(1 / (1 + TOUR_OVERSHOOT), 10)
    expect(getTourTrackProgress(1 + TOUR_OVERSHOOT)).toBe(1)
    expect(getCurrentTourAnchorIndex(finalStop, THEME_IDS.length)).toBe(THEME_IDS.length - 1)
    expect(getCurrentTourAnchorIndex(1 + TOUR_OVERSHOOT, THEME_IDS.length)).toBe(THEME_IDS.length - 1)
    expect(getCurrentTourAnchorIndex(purpleStop - 1e-12, THEME_IDS.length)).toBe(4)
    expect(hasReachedTourAnchor(purpleStop - 1e-12, 4, THEME_IDS.length)).toBe(true)
  })
})

describe('camera poses', () => {
  it('samples an origin-centred tour that visits galaxy anchors in progress-track order', () => {
    const anchors = buildGalaxyAnchors(THEME_IDS, GALAXY_RADIUS)

    for (let index = 0; index < anchors.length; index += 1) {
      const pose = sampleTourPose(index / (anchors.length - 1), anchors)
      expect(pose.position).toEqual([0, 0, 0])
      expect(magnitude(pose.direction)).toBeCloseTo(1, 8)
      expect(dot(pose.direction, normalized(anchors[index].position))).toBeGreaterThan(0.999)
    }

    const start = sampleTourPose(0, anchors)
    const halfway = sampleTourPose(0.5, anchors)
    const finalGalaxy = sampleTourPose(1, anchors)

    expect(finalGalaxy.position).toEqual([0, 0, 0])
    expectVectorClose(finalGalaxy.direction, normalized(anchors[anchors.length - 1].position))
    expect(magnitude(subtract(halfway.direction, start.direction))).toBeGreaterThan(0.1)
  })

  it('continues turning past the final galaxy during the final wheel buffer', () => {
    const anchors = buildGalaxyAnchors(THEME_IDS, GALAXY_RADIUS)
    const fullTour = sampleTourPose(1, anchors)
    const overshotTour = sampleTourPose(1 + TOUR_OVERSHOOT, anchors)
    const overshootTarget = normalized(anchors[(anchors.length - 1 + Math.floor(TOUR_OVERSHOOT * anchors.length)) % anchors.length].position)

    expectVectorClose(fullTour.direction, normalized(anchors[anchors.length - 1].position))
    expect(magnitude(subtract(overshotTour.direction, fullTour.direction))).toBeGreaterThan(0.1)
    expectVectorClose(overshotTour.direction, overshootTarget)
  })

  it('moves the focus camera closer while preserving the anchor and aiming at its centre', () => {
    const anchor = buildGalaxyAnchors(THEME_IDS, GALAXY_RADIUS)[2]
    const originalAnchor = {
      ...anchor,
      position: [...anchor.position] as [number, number, number],
    }
    const pose = getGalaxyFocusPose(anchor, CLUSTER_RADIUS)

    expect(anchor).toEqual(originalAnchor)
    expect(pose.target).toEqual(anchor.position)

    const focusDistance = magnitude(subtract(pose.target, pose.position))
    expect(focusDistance).toBeGreaterThan(CLUSTER_RADIUS)
    expect(focusDistance).toBeLessThan(magnitude(anchor.position))
    expect(magnitude(pose.direction)).toBeCloseTo(1, 8)
    expectVectorClose(pose.direction, normalized(subtract(pose.target, pose.position)))
  })

  it('places the self-planet camera on the approach side and targets the selected planet', () => {
    const pose = getSelfPlanetFocusPose([0, 0, 4.8], [0, 0, 1], 3.1)

    expectVectorClose(pose.position, [0, 0, 1.7])
    expect(pose.target).toEqual([0, 0, 4.8])
    expectVectorClose(pose.direction, [0, 0, 1])
  })

  it('frames a planet from the star-facing side angle without changing its galaxy-local coordinates', () => {
    const anchor = buildGalaxyAnchors(THEME_IDS, GALAXY_RADIUS)[1]
    const localPosition: [number, number, number] = [1.1, -0.4, 0.7]
    const originalLocal = [...localPosition]
    const pose = getPlanetFocusPose(anchor, localPosition, 0.105)
    const planetRadial = [...localPosition] as [number, number, number]

    expect(localPosition).toEqual(originalLocal)
    expectVectorClose(pose.target, [
      anchor.position[0] + localPosition[0],
      anchor.position[1] + localPosition[1],
      anchor.position[2] + localPosition[2],
    ])
    expect(magnitude(subtract(pose.target, pose.position))).toBeGreaterThan(0.8)
    expect(magnitude(subtract(pose.target, pose.position))).toBeLessThan(2.4)
    expect(dot(subtract(pose.position, pose.target), planetRadial)).toBeCloseTo(0, 8)
    expectVectorClose(pose.direction, normalized(subtract(pose.target, pose.position)))
  })

  it('aims at the selected planet after galaxy rotation and display scaling', () => {
    const anchor = buildGalaxyAnchors(THEME_IDS, GALAXY_RADIUS)[1]
    const localPosition: [number, number, number] = [1.1, -0.4, 0.7]
    const originalLocal = [...localPosition]
    const pose = getPlanetFocusPose(anchor, localPosition, 0.2, Math.PI / 2, 2, 1.25)

    expect(localPosition).toEqual(originalLocal)
    expectVectorClose(pose.target, [
      anchor.position[0] + 1.4,
      anchor.position[1] - 0.8,
      anchor.position[2] - 2.2,
    ])
    expect(magnitude(subtract(pose.target, pose.position))).toBeCloseTo(1.25, 8)
    expect(dot(subtract(pose.position, pose.target), [1.4, -0.8, -2.2])).toBeCloseTo(0, 8)
  })

  it('keeps the side-view camera direction stable for planets above or below the galaxy plane', () => {
    const anchor = buildGalaxyAnchors(THEME_IDS, GALAXY_RADIUS)[0]
    const localPosition: [number, number, number] = [0, 1.2, 0.02]
    const pose = getPlanetFocusPose(anchor, localPosition, 0.2, 0, 1, 1.25)

    expect(magnitude(subtract(pose.position, pose.target))).toBeCloseTo(1.25, 8)
    expect(dot(subtract(pose.position, pose.target), localPosition)).toBeCloseTo(0, 8)
    expectVectorClose(pose.direction, normalized(subtract(pose.target, pose.position)))
  })

  it('keeps different selected planets at the same apparent size with a shared focus distance', () => {
    const anchor = buildGalaxyAnchors(THEME_IDS, GALAXY_RADIUS)[1]
    const first = getPlanetFocusPose(anchor, [1.1, -0.4, 0.7], 0.2, 0, 1.26, 1.4)
    const second = getPlanetFocusPose(anchor, [-1.6, 0.2, 0.9], 0.2, 1.1, 1.26, 1.4)
    const firstSize = projectedRadiusPx(0.2, magnitude(subtract(first.target, first.position)), 50, 800)
    const secondSize = projectedRadiusPx(0.2, magnitude(subtract(second.target, second.position)), 50, 800)

    expect(firstSize).toBeCloseTo(secondSize, 8)
  })
})

describe('screen-space planet detail', () => {
  it('moves the camera aim point right to frame the subject left without moving it', () => {
    const cameraPosition: [number, number, number] = [0, 0, 0]
    const subjectPosition: [number, number, number] = [0, 0, -10]
    const originalSubjectPosition = [...subjectPosition]
    const aimPoint = aimCameraAtScreenX(cameraPosition, subjectPosition, 90, 2, -0.2)

    expectVectorClose(aimPoint, [4, 0, -10])
    expect(subjectPosition).toEqual(originalSubjectPosition)
  })

  it('projects world radius into pixels using perspective distance and vertical field of view', () => {
    expect(projectedRadiusPx(1, 10, 90, 1000)).toBeCloseTo(50, 8)
    expect(projectedRadiusPx(2, 10, 90, 1000)).toBeCloseTo(100, 8)
    expect(projectedRadiusPx(1, 20, 90, 1000)).toBeCloseTo(25, 8)
  })

  it('gives small distant planets a minimum screen-space pick radius', () => {
    expect(planetPickRadiusWorld(.2, 10, 90, 1000)).toBeCloseTo(.26, 8)
    expect(planetPickRadiusWorld(.4, 10, 90, 1000)).toBe(.4)
    expect(planetPickRadiusWorld(.2, 20, 90, 1000)).toBeCloseTo(.52, 8)
    expect(planetPickRadiusWorld(.2, 10, 90, 500)).toBeCloseTo(.52, 8)
  })

  it('uses the default far, mid, and near thresholds', () => {
    expect(choosePlanetLod({ projectedPx: 13.99 })).toBe('far')
    expect(choosePlanetLod({ projectedPx: 14 })).toBe('mid')
    expect(choosePlanetLod({ projectedPx: 79.99 })).toBe('mid')
    expect(choosePlanetLod({ projectedPx: 80 })).toBe('near')
  })

  it('applies hysteresis when a previous LOD is available', () => {
    expect(choosePlanetLod({ projectedPx: 15.9, previous: 'far' })).toBe('far')
    expect(choosePlanetLod({ projectedPx: 16.1, previous: 'far' })).toBe('mid')

    expect(choosePlanetLod({ projectedPx: 11.9, previous: 'mid' })).toBe('far')
    expect(choosePlanetLod({ projectedPx: 12.1, previous: 'mid' })).toBe('mid')
    expect(choosePlanetLod({ projectedPx: 89.9, previous: 'mid' })).toBe('mid')
    expect(choosePlanetLod({ projectedPx: 90.1, previous: 'mid' })).toBe('near')

    expect(choosePlanetLod({ projectedPx: 71.9, previous: 'near' })).toBe('mid')
    expect(choosePlanetLod({ projectedPx: 72.1, previous: 'near' })).toBe('near')
  })

  it('keeps focused planets at least mid-detail and selected planets always near', () => {
    expect(choosePlanetLod({ projectedPx: 0, previous: 'far', focused: true })).toBe('mid')
    expect(choosePlanetLod({ projectedPx: 0, previous: 'far', selected: true })).toBe('near')
    expect(choosePlanetLod({ projectedPx: 200, selected: true })).toBe('near')
  })
})
