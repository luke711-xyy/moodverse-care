import type { ThemeId } from './types'

export type Vec3 = [number, number, number]

export type GalaxyAnchor = {
  theme: ThemeId
  position: Vec3
  azimuth: number
  elevation: number
}

export type CameraPose = {
  position: Vec3
  direction: Vec3
}

export type GalaxyFocusPose = CameraPose & {
  target: Vec3
}

export type JourneyPhase = 'tour' | 'portal' | 'self'

export type JourneyState = {
  progress: number
  tourProgress: number
  portalProgress: number
  phase: JourneyPhase
}

export type PlanetLod = 'far' | 'mid' | 'near'

export type PlanetLodOptions = {
  projectedPx: number
  previous?: PlanetLod
  selected?: boolean
  focused?: boolean
}

const DEFAULT_GALAXY_RADIUS = 26
export const GALAXY_CLUSTER_RADIUS = 2.7
export const GALAXY_SELECTION_RADIUS = GALAXY_CLUSTER_RADIUS * 1.24
export const PORTAL_CLOUD_CROSSING_PROGRESS = 0.72
// Shared by the spiral-arm particles and planet orbits so their rotation stays in sync.
export const GALAXY_ARM_ROTATION_SPEED = 0.018
export const GALAXY_PLANE_VIEW_ANGLE = 50 * Math.PI / 180
export const GALAXY_ARM_HALF_THICKNESS_BASE = 0.2
export const GALAXY_ARM_HALF_THICKNESS_SCALE = 0.17
export const GALAXY_ARM_DEPTH_SCALE = 0.72
export const SELF_RETURN_CLOUD_DURATION_MS = 680
export const SELF_RETURN_TOUR_DURATION_MS = 900
export const SELF_ARRIVAL_TOUR_DURATION_MS = 2200
export const SELF_ARRIVAL_OVERSHOOT_DURATION_MS = 300
export const SELF_ARRIVAL_CLOUD_DURATION_MS = 750
export const SELF_ARRIVAL_LANDING_DURATION_MS = 140
const DEFAULT_PLANET_COUNT = 10
const DEFAULT_VIEWPORT_HEIGHT = 800
const LINE_HEIGHT_PX = 16
const MAX_WHEEL_STEP = 0.12
const JOURNEY_WHEEL_DISTANCE_MULTIPLIER = 1.8
export const TOUR_END = 0.72
export const PORTAL_START = 0.8
export const TOUR_OVERSHOOT = 0.1
export const SELF_START = 0.98
const TAU = Math.PI * 2
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const length = ([x, y, z]: Vec3) => Math.hypot(x, y, z)

const normalize = (value: Vec3, fallback: Vec3 = [0, 0, -1]): Vec3 => {
  const magnitude = length(value)
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) return [...fallback]
  return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude]
}

const hashString32 = (value: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const fractional = (value: number) => value - Math.floor(value)

export function buildGalaxyAnchors(
  themeIds: readonly ThemeId[],
  radius = DEFAULT_GALAXY_RADIUS,
): GalaxyAnchor[] {
  if (themeIds.length === 0) return []

  const shellRadius = Number.isFinite(radius) ? Math.max(0, radius) : DEFAULT_GALAXY_RADIUS
  const elevationBands = [0.16, -0.22, 0.27, -0.15, 0.21, -0.28]

  return themeIds.map((theme, index) => {
    const azimuth = (index / themeIds.length) * TAU
    const elevation = elevationBands[index % elevationBands.length]
    const horizontalRadius = Math.cos(elevation) * shellRadius
    const position: Vec3 = [
      Math.cos(azimuth) * horizontalRadius,
      Math.sin(elevation) * shellRadius,
      Math.sin(azimuth) * horizontalRadius,
    ]

    return { theme, position, azimuth, elevation }
  })
}

export function buildPlanetSlots(
  theme: ThemeId | string,
  count = DEFAULT_PLANET_COUNT,
  clusterRadius = GALAXY_CLUSTER_RADIUS,
): Vec3[] {
  const slotCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : DEFAULT_PLANET_COUNT
  const radius = Number.isFinite(clusterRadius)
    ? Math.max(0, clusterRadius)
    : GALAXY_CLUSTER_RADIUS
  if (slotCount === 0) return []

  const seed = hashString32(theme)
  const phase = (seed / 0x1_0000_0000) * TAU
  const verticalPhase = fractional(seed * 0.000_000_119_209_289_6)

  return Array.from({ length: slotCount }, (_, index) => {
    const sequence = (index + 0.5) / slotCount
    const radialDistance = radius * (0.24 + 0.68 * Math.sqrt(sequence))
    const azimuth = phase + index * GOLDEN_ANGLE
    const verticalSequence = fractional(verticalPhase + index * 0.618_033_988_749_894_9)
    if (radialDistance <= Number.EPSILON) return [0, 0, 0]
    const armHalfThickness = GALAXY_ARM_HALF_THICKNESS_BASE + radialDistance * GALAXY_ARM_HALF_THICKNESS_SCALE
    const vertical = (verticalSequence * 2 - 1) * armHalfThickness
    const verticalRatio = vertical / radialDistance
    const horizontal = Math.sqrt(Math.max(0, 1 - verticalRatio * verticalRatio))

    return [
      Math.cos(azimuth) * horizontal * radialDistance,
      vertical,
      Math.sin(azimuth) * horizontal * radialDistance * GALAXY_ARM_DEPTH_SCALE,
    ]
  })
}

export function rotateGalaxyPosition([x, y, z]: Vec3, angle: number): Vec3 {
  const safeAngle = Number.isFinite(angle) ? angle : 0
  const cosine = Math.cos(safeAngle)
  const sine = Math.sin(safeAngle)
  return [x * cosine + z * sine, y, -x * sine + z * cosine]
}

export function galaxyOrbitAngle(elapsedTime: number, reducedMotion = false): number {
  if (reducedMotion || !Number.isFinite(elapsedTime)) return 0
  return elapsedTime * GALAXY_ARM_ROTATION_SPEED
}

export function galaxyOrbitalPlaneNormal(
  viewerDirection: Vec3,
  viewAngle = GALAXY_PLANE_VIEW_ANGLE,
): Vec3 {
  const view = normalize(viewerDirection, [0, 0, 1])
  const safeAngle = Number.isFinite(viewAngle)
    ? clamp(viewAngle, 0, Math.PI)
    : GALAXY_PLANE_VIEW_ANGLE
  const worldUp: Vec3 = [0, 1, 0]
  const upProjection: Vec3 = [
    worldUp[0] - view[0] * view[1],
    worldUp[1] - view[1] * view[1],
    worldUp[2] - view[2] * view[1],
  ]
  const projectedUp = length(upProjection) > 1e-6
    ? normalize(upProjection)
    : normalize([1 - view[0] * view[0], -view[0] * view[1], -view[0] * view[2]], [1, 0, 0])
  return normalize([
    view[0] * Math.cos(safeAngle) + projectedUp[0] * Math.sin(safeAngle),
    view[1] * Math.cos(safeAngle) + projectedUp[1] * Math.sin(safeAngle),
    view[2] * Math.cos(safeAngle) + projectedUp[2] * Math.sin(safeAngle),
  ])
}

export function normalizeWheelDelta(
  deltaY: number,
  deltaMode = 0,
  viewportHeight = DEFAULT_VIEWPORT_HEIGHT,
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0

  const safeViewportHeight = Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportHeight
    : DEFAULT_VIEWPORT_HEIGHT
  const modeScale = deltaMode === 1
    ? LINE_HEIGHT_PX
    : deltaMode === 2
      ? safeViewportHeight
      : 1
  const pixelDelta = deltaY * modeScale

  return clamp(-pixelDelta / safeViewportHeight * .38, -MAX_WHEEL_STEP * .4, MAX_WHEEL_STEP * .4)
    / JOURNEY_WHEEL_DISTANCE_MULTIPLIER
}

export function reachesTourHomeEndpoint(progress: number, wheelStep: number): boolean {
  return Number.isFinite(progress)
    && Number.isFinite(wheelStep)
    && wheelStep > 0
    && progress + wheelStep >= TOUR_END
}

export function advanceJourney(progress: number, wheelStep: number): JourneyState {
  const safeProgress = Number.isFinite(progress) ? progress : 0
  const safeStep = Number.isFinite(wheelStep) ? wheelStep : 0
  const nextProgress = clamp(safeProgress + safeStep, 0, 1)
  const tourProgress = nextProgress <= TOUR_END
    ? clamp(nextProgress / TOUR_END, 0, 1)
    : 1 + clamp((nextProgress - TOUR_END) / (PORTAL_START - TOUR_END), 0, 1) * TOUR_OVERSHOOT
  const portalProgress = clamp((nextProgress - PORTAL_START) / (SELF_START - PORTAL_START), 0, 1)
  const phase: JourneyPhase = nextProgress < PORTAL_START
    ? 'tour'
    : nextProgress < SELF_START
      ? 'portal'
      : 'self'

  return {
    progress: nextProgress,
    tourProgress,
    portalProgress,
    phase,
  }
}

export function getSelfReturnJourneyProgress(startProgress: number, elapsedMs: number): number {
  const start = clamp(Number.isFinite(startProgress) ? startProgress : 1, 0, 1)
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0)
  const ease = (value: number) => {
    const t = clamp(value, 0, 1)
    return t * t * (3 - 2 * t)
  }

  if (start <= PORTAL_START) {
    return start * (1 - ease(elapsed / SELF_RETURN_TOUR_DURATION_MS))
  }

  if (elapsed < SELF_RETURN_CLOUD_DURATION_MS) {
    const phase = ease(elapsed / SELF_RETURN_CLOUD_DURATION_MS)
    return start + (PORTAL_START - start) * phase
  }

  const tourPhase = ease((elapsed - SELF_RETURN_CLOUD_DURATION_MS) / SELF_RETURN_TOUR_DURATION_MS)
  return PORTAL_START * (1 - tourPhase)
}

type SelfArrivalSegment = { from: number; to: number; duration: number }

function selfArrivalSegments(start: number): SelfArrivalSegment[] {
  return [
    {
      from: start,
      to: TOUR_END,
      duration: start < TOUR_END ? ((TOUR_END - start) / TOUR_END) * SELF_ARRIVAL_TOUR_DURATION_MS : 0,
    },
    {
      from: Math.max(start, TOUR_END),
      to: PORTAL_START,
      duration: start < PORTAL_START
        ? ((PORTAL_START - Math.max(start, TOUR_END)) / (PORTAL_START - TOUR_END)) * SELF_ARRIVAL_OVERSHOOT_DURATION_MS
        : 0,
    },
    {
      from: Math.max(start, PORTAL_START),
      to: SELF_START,
      duration: start < SELF_START
        ? ((SELF_START - Math.max(start, PORTAL_START)) / (SELF_START - PORTAL_START)) * SELF_ARRIVAL_CLOUD_DURATION_MS
        : 0,
    },
    {
      from: Math.max(start, SELF_START),
      to: 1,
      duration: ((1 - Math.max(start, SELF_START)) / (1 - SELF_START)) * SELF_ARRIVAL_LANDING_DURATION_MS,
    },
  ]
}

export function getSelfArrivalJourneyDuration(startProgress: number, reducedMotion = false): number {
  const start = clamp(Number.isFinite(startProgress) ? startProgress : 0, 0, 1)
  if (reducedMotion || start >= 1) return 0

  // Keep the scripted arrival aligned with advanceJourney: tour ends at .72,
  // cloud entry starts at .8, and the cloud crossing completes at .98.
  return selfArrivalSegments(start).reduce((duration, segment) => duration + segment.duration, 0)
}

export function getSelfArrivalJourneyProgress(startProgress: number, elapsedMs: number, reducedMotion = false): number {
  const start = clamp(Number.isFinite(startProgress) ? startProgress : 0, 0, 1)
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0)
  if (reducedMotion || start >= 1) return 1

  const ease = (value: number) => {
    const t = clamp(value, 0, 1)
    return t * t * (3 - 2 * t)
  }
  let remaining = elapsed
  for (const segment of selfArrivalSegments(start)) {
    if (segment.duration <= 0) continue
    if (remaining < segment.duration) {
      return segment.from + (segment.to - segment.from) * ease(remaining / segment.duration)
    }
    remaining -= segment.duration
  }
  return 1
}

export function homeGalaxyEntranceScale(portalProgress: number): number {
  const progress = Number.isFinite(portalProgress) ? clamp(portalProgress, 0, 1) : 0
  const eased = progress * progress
  return 0.018 + (1 - 0.018) * eased
}

export function getTourAnchorProgress(index: number, anchorCount: number): number {
  if (anchorCount <= 1) return 0
  const safeIndex = Number.isFinite(index) ? clamp(Math.floor(index), 0, anchorCount - 1) : 0
  return safeIndex / (anchorCount - 1)
}

export function hasReachedTourAnchor(tourProgress: number, index: number, anchorCount: number): boolean {
  const safeProgress = Number.isFinite(tourProgress) ? tourProgress : 0
  return safeProgress + 1e-9 >= getTourAnchorProgress(index, anchorCount)
}

export function getTourTrackProgress(tourProgress: number): number {
  const safeProgress = Number.isFinite(tourProgress) ? tourProgress : 0
  return clamp(safeProgress / (1 + TOUR_OVERSHOOT), 0, 1)
}

function tourSegmentAt(tourProgress: number, anchorCount: number) {
  if (anchorCount <= 1) return { currentIndex: 0, nextIndex: 0, segmentProgress: 0 }
  const safeProgress = clamp(Number.isFinite(tourProgress) ? tourProgress : 0, 0, 1 + TOUR_OVERSHOOT)
  const lastAnchorIndex = anchorCount - 1
  if (safeProgress > 1) {
    const extraSegments = (safeProgress - 1) * anchorCount
    const completedSegments = Math.floor(extraSegments + 1e-9)
    return {
      currentIndex: (lastAnchorIndex + completedSegments) % anchorCount,
      nextIndex: (lastAnchorIndex + completedSegments + 1) % anchorCount,
      segmentProgress: clamp(extraSegments - completedSegments, 0, 1),
    }
  }

  const scaledProgress = safeProgress * lastAnchorIndex
  const currentIndex = Math.min(lastAnchorIndex, Math.floor(scaledProgress + 1e-9))
  return {
    currentIndex,
    nextIndex: currentIndex === lastAnchorIndex ? lastAnchorIndex : currentIndex + 1,
    segmentProgress: clamp(scaledProgress - currentIndex, 0, 1),
  }
}

export function getCurrentTourAnchorIndex(tourProgress: number, anchorCount: number): number {
  if (anchorCount <= 1) return 0

  // Theme ownership changes halfway between adjacent galaxy anchors. The
  // first anchor starts at the beginning of the tour, while progress beyond
  // the final anchor (the overshoot toward the nebula) remains with the last.
  const safeProgress = clamp(Number.isFinite(tourProgress) ? tourProgress : 0, 0, 1)
  const nearestAnchor = Math.floor(safeProgress * (anchorCount - 1) + 0.5)
  return clamp(nearestAnchor, 0, anchorCount - 1)
}

export function sampleTourPose(
  tourProgress: number,
  anchors: readonly GalaxyAnchor[],
): CameraPose {
  if (anchors.length === 0) return { position: [0, 0, 0], direction: [0, 0, -1] }

  const { currentIndex, nextIndex, segmentProgress } = tourSegmentAt(tourProgress, anchors.length)
  const easedProgress = segmentProgress * segmentProgress * (3 - 2 * segmentProgress)
  const currentDirection = normalize(anchors[currentIndex].position)
  const nextDirection = normalize(anchors[nextIndex].position)
  const direction = normalize([
    currentDirection[0] + (nextDirection[0] - currentDirection[0]) * easedProgress,
    currentDirection[1] + (nextDirection[1] - currentDirection[1]) * easedProgress,
    currentDirection[2] + (nextDirection[2] - currentDirection[2]) * easedProgress,
  ])

  return { position: [0, 0, 0], direction }
}

export function getGalaxyFocusPose(
  anchor: GalaxyAnchor,
  clusterRadius = GALAXY_CLUSTER_RADIUS,
): GalaxyFocusPose {
  const target: Vec3 = [...anchor.position]
  const direction = normalize(target)
  const safeClusterRadius = Number.isFinite(clusterRadius)
    ? Math.max(0, clusterRadius)
    : GALAXY_CLUSTER_RADIUS
  const originDistance = length(target)
  const desiredDistance = Math.max(safeClusterRadius * 2.08, safeClusterRadius + 0.5)
  const focusDistance = originDistance > 0
    ? Math.min(desiredDistance, Math.max(safeClusterRadius + 0.01, originDistance * 0.75))
    : desiredDistance
  const position: Vec3 = [
    target[0] - direction[0] * focusDistance,
    target[1] - direction[1] * focusDistance,
    target[2] - direction[2] * focusDistance,
  ]

  return { position, target, direction }
}

export function getSelfPlanetFocusPose(
  planetPosition: Vec3,
  approachDirection: Vec3,
  requestedFocusDistance = 3.1,
): GalaxyFocusPose {
  const target: Vec3 = [...planetPosition]
  const direction = normalize(approachDirection)
  const focusDistance = Number.isFinite(requestedFocusDistance) && requestedFocusDistance > 0
    ? requestedFocusDistance
    : 3.1
  const position: Vec3 = [
    target[0] - direction[0] * focusDistance,
    target[1] - direction[1] * focusDistance,
    target[2] - direction[2] * focusDistance,
  ]

  return { position, target, direction }
}

export function getPlanetFocusPose(
  anchor: GalaxyAnchor,
  localPosition: Vec3,
  planetRadius = 0.105,
  clusterRotation = 0,
  clusterScale = 1,
  requestedFocusDistance?: number,
): GalaxyFocusPose {
  const rotation = Number.isFinite(clusterRotation) ? clusterRotation : 0
  const scale = Number.isFinite(clusterScale) ? Math.max(0, clusterScale) : 1
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const localOffset: Vec3 = [
    (localPosition[0] * cosine + localPosition[2] * sine) * scale,
    localPosition[1] * scale,
    (-localPosition[0] * sine + localPosition[2] * cosine) * scale,
  ]
  const target: Vec3 = [
    anchor.position[0] + localOffset[0],
    anchor.position[1] + localOffset[1],
    anchor.position[2] + localOffset[2],
  ]
  const radialDirection = normalize(localOffset, normalize(anchor.position))
  const referenceUp: Vec3 = Math.abs(radialDirection[1]) > 0.96 ? [1, 0, 0] : [0, 1, 0]
  const cameraDirection = normalize([
    radialDirection[1] * referenceUp[2] - radialDirection[2] * referenceUp[1],
    radialDirection[2] * referenceUp[0] - radialDirection[0] * referenceUp[2],
    radialDirection[0] * referenceUp[1] - radialDirection[1] * referenceUp[0],
  ], [0, 0, 1])
  const safeRadius = Number.isFinite(planetRadius) ? Math.max(0.01, planetRadius) : 0.105
  const defaultFocusDistance = clamp(safeRadius * 8.5, 0.82, 1.65)
  const customFocusDistance = requestedFocusDistance ?? Number.NaN
  const focusDistance = Number.isFinite(customFocusDistance) && customFocusDistance > 0
    ? customFocusDistance
    : defaultFocusDistance
  const position: Vec3 = [
    target[0] + cameraDirection[0] * focusDistance,
    target[1] + cameraDirection[1] * focusDistance,
    target[2] + cameraDirection[2] * focusDistance,
  ]
  const direction = normalize([
    target[0] - position[0],
    target[1] - position[1],
    target[2] - position[2],
  ])

  return { position, target, direction }
}

export function aimCameraAtScreenX(
  cameraPosition: Vec3,
  subjectPosition: Vec3,
  verticalFovDeg: number,
  aspect: number,
  screenNdcX: number,
): Vec3 {
  const towardSubject: Vec3 = [
    subjectPosition[0] - cameraPosition[0],
    subjectPosition[1] - cameraPosition[1],
    subjectPosition[2] - cameraPosition[2],
  ]
  const distance = length(towardSubject)
  if (
    !Number.isFinite(distance) || distance <= Number.EPSILON
    || !Number.isFinite(verticalFovDeg) || verticalFovDeg <= 0 || verticalFovDeg >= 180
    || !Number.isFinite(aspect) || aspect <= 0
    || !Number.isFinite(screenNdcX)
  ) return [...subjectPosition]

  const forward = normalize(towardSubject)
  const screenRight = normalize([-forward[2], 0, forward[0]], [1, 0, 0])
  const shift = -screenNdcX * distance * Math.tan((verticalFovDeg * Math.PI) / 360) * aspect
  return [
    subjectPosition[0] + screenRight[0] * shift,
    subjectPosition[1] + screenRight[1] * shift,
    subjectPosition[2] + screenRight[2] * shift,
  ]
}

export function projectedRadiusPx(
  radius: number,
  distance: number,
  fovDeg: number,
  viewportHeight: number,
): number {
  if (
    !Number.isFinite(radius)
    || !Number.isFinite(distance)
    || !Number.isFinite(fovDeg)
    || !Number.isFinite(viewportHeight)
    || radius <= 0
    || distance <= 0
    || fovDeg <= 0
    || fovDeg >= 180
    || viewportHeight <= 0
  ) return 0

  const focalLengthPx = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360))
  return (radius / distance) * focalLengthPx
}

export function planetPickRadiusWorld(
  visibleRadius: number,
  distance: number,
  fovDeg: number,
  viewportHeight: number,
  minimumRadiusPx = 13,
): number {
  const safeVisibleRadius = Number.isFinite(visibleRadius) ? Math.max(0, visibleRadius) : 0
  if (
    !Number.isFinite(distance) || distance <= 0
    || !Number.isFinite(fovDeg) || fovDeg <= 0 || fovDeg >= 180
    || !Number.isFinite(viewportHeight) || viewportHeight <= 0
    || !Number.isFinite(minimumRadiusPx) || minimumRadiusPx <= 0
  ) return safeVisibleRadius

  const worldPerPixel = 2 * distance * Math.tan((fovDeg * Math.PI) / 360) / viewportHeight
  return Math.max(safeVisibleRadius, worldPerPixel * minimumRadiusPx)
}

export function choosePlanetLod({
  projectedPx,
  previous,
  selected = false,
  focused = false,
}: PlanetLodOptions): PlanetLod {
  if (selected) return 'near'

  const size = Number.isFinite(projectedPx) ? Math.max(0, projectedPx) : 0
  let next: PlanetLod

  if (previous === 'far') {
    next = size >= 16 ? 'mid' : 'far'
  } else if (previous === 'mid') {
    next = size < 12 ? 'far' : size >= 90 ? 'near' : 'mid'
  } else if (previous === 'near') {
    next = size < 72 ? 'mid' : 'near'
  } else {
    next = size < 14 ? 'far' : size < 80 ? 'mid' : 'near'
  }

  return focused && next === 'far' ? 'mid' : next
}
