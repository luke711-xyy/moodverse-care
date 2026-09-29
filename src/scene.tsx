import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { billboardTextParts, planetBillboards } from './billboards'
import { placeBillboards } from './billboard-placement'
import { drawDoodleStrokes } from './doodle'
import { orientationForDragAnchor, resolveSelfPlanet } from './scene-state'
import { generatePlanetRivers, generatePlanetTextureData, hashString32, isPlanetLand, largestLandFocus, planetLandReliefScale, planetRiverDepth, planetSeaLine, planetVisualProfile, samplePlanetElevation, type PlanetVisualProfile } from './planet-visuals'
import { derivePlanetClimate } from './climate'
import { weatherAccent } from './weather'
import { generateLightningPath } from './lightning'
import { DEFAULT_FOCUSED_THEMES, moodById, themeById, THEME_IDS, type Billboard, type DoodleStroke, type MoodId, type Planet, type StarAppearance, type ThemeId } from './types'
import {
  advanceJourney,
  buildGalaxyAnchors,
  buildPlanetSlots,
  galaxyOrbitAngle,
  galaxyOrbitalPlaneNormal,
  GALAXY_ARM_DEPTH_SCALE,
  GALAXY_ARM_HALF_THICKNESS_BASE,
  GALAXY_ARM_HALF_THICKNESS_SCALE,
  GALAXY_CLUSTER_RADIUS,
  GALAXY_SELECTION_RADIUS,
  homeGalaxyEntranceScale,
  getGalaxyFocusPose,
  getPlanetFocusPose,
  planetPickRadiusWorld,
  projectedRadiusPx,
  PORTAL_CLOUD_CROSSING_PROGRESS,
  rotateGalaxyPosition,
  sampleTourPose,
  TOUR_OVERSHOOT,
  type GalaxyAnchor,
  type Vec3,
} from './universe'

type SceneProps = {
  view: 'universe' | 'galaxy' | 'planet' | 'home-galaxy' | 'self'
  focusedTheme?: ThemeId
  focusedThemes?: ThemeId[]
  publicPlanets?: Planet[]
  ownPlanet?: Planet
  ownPlanets?: Planet[]
  starAppearance?: StarAppearance
  ownPlanetGrowthToken?: number
  selectedPlanet?: Planet
  galaxyRotation: number
  selfRotation?: number
  selfReturning: boolean
  selectedBillboardId?: string
  onBillboardClick: (id?: string) => void
  onPublicBillboardClick: (planet: Planet, billboardId: string, rotation: number) => void
  journey: number
  reducedMotion?: boolean
  onArriveSelf: () => void
  onThemeClick: (theme: ThemeId) => void
  onPlanetClick: (planet: Planet) => void
  onOwnPlanetClick: (planet: Planet, rotation: number) => void
  onOwnEmbryoClick: (slotIndex: number) => void
  onStarClick: () => void
}

type MotionState = {
  journey: number
  tourProgress: number
  portalProgress: number
  universeOpacity: number
  selfBlend: number
}

type DebugSnapshot = {
  view: SceneProps['view']
  phase: 'tour' | 'portal' | 'self'
  journey: number
  journeyTarget: number
  tourProgress: number
  portalProgress: number
  focusedTheme?: ThemeId
  camera: { position: number[]; quaternion: number[]; fov: number }
  galaxies: Array<{ theme: ThemeId; position: number[]; scale: number; planetCount: number }>
  lod: { far: number; mid: number; near: number }
  drawCalls: number
}

declare global {
  interface Window {
    __MOODVERSE_DEBUG__?: { snapshot: () => DebugSnapshot }
  }
}

const PLANET_RADIUS = 0.16
const SELF_PLANET_NEAR_CACHE_LIMIT = 12
const HOME_GALAXY_CENTER_DISTANCE = 22
// Halving the overview distance makes the home system appear about twice as large
// after the portal while keeping the galaxy itself and its orbit layout unchanged.
const HOME_GALAXY_FOCUS_DISTANCE = 5.25
const COMPACT_HOME_GALAXY_FOCUS_DISTANCE = 5.6
const HOME_GALAXY_ANCHORS = buildGalaxyAnchors(THEME_IDS, 22)
const SELF_PLANET_DIRECTION = sampleTourPose(1 + TOUR_OVERSHOOT, HOME_GALAXY_ANCHORS).direction
const GALAXY_DISPLAY_SCALE = 1.26
const OWN_PLANET_GROWTH_MS = 2400

const planetAppearanceSeed = (planet: Planet) => planet.visualSeed ?? planet.id
type PlanetTexturePair = { color: THREE.DataTexture; relief: THREE.DataTexture }
const selfPlanetNearTextureCache = new Map<string, PlanetTexturePair>()
const selfPlanetNearGeometryCache = new Map<string, THREE.BufferGeometry>()

const homeGalaxyFocusDistance = (viewportWidth: number) =>
  viewportWidth < 560 ? COMPACT_HOME_GALAXY_FOCUS_DISTANCE : HOME_GALAXY_FOCUS_DISTANCE

const homeGalaxyTravelDistance = (viewportWidth: number) =>
  HOME_GALAXY_CENTER_DISTANCE - homeGalaxyFocusDistance(viewportWidth)

const portalTravelDistance = (viewportWidth: number) => homeGalaxyTravelDistance(viewportWidth)

const seeded = (seed: number) => {
  const x = Math.sin(seed * 97.13) * 43758.5453
  return x - Math.floor(x)
}

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

const toVector3 = ([x, y, z]: Vec3) => new THREE.Vector3(x, y, z)

const galaxyPlaneQuaternion = (viewerDirection: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  toVector3(galaxyOrbitalPlaneNormal(viewerDirection.toArray() as Vec3)),
)

function buildOwnGalaxyPlanetAssets(planets: Planet[] = []) {
  const positions = buildPlanetSlots('home-galaxy', 6, 2.2)
  return planets
    .filter((planet) => !planet.archivedAt)
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .slice(0, 6)
    .map((planet, index) => ({ ...planet, position: positions[index], orbit: index * 0.5 }))
}

function sampleFocusedTourPose(progress: number, anchors: readonly GalaxyAnchor[]) {
  if (progress <= 1) return sampleTourPose(progress, anchors)
  const lastDirection = anchors.length ? toVector3(anchors[anchors.length - 1].position).normalize() : new THREE.Vector3(0, 0, -1)
  const destination = toVector3(SELF_PLANET_DIRECTION)
  const progressToHome = smoothstep(1, 1 + TOUR_OVERSHOOT, progress)
  const turn = new THREE.Quaternion().setFromUnitVectors(lastDirection, destination)
  const direction = lastDirection.clone().applyQuaternion(new THREE.Quaternion().slerp(turn, progressToHome)).normalize()
  return { position: [0, 0, 0] as Vec3, direction: direction.toArray() as Vec3 }
}

function Starfield() {
  const material = useRef<THREE.ShaderMaterial>(null)
  const geometry = useMemo(() => {
    const count = 13500
    const values = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const colors = new Float32Array(count * 3)
    const alphas = new Float32Array(count)
    const phases = new Float32Array(count)
    const starTints = ['#d9eaff', '#ffffff', '#a7c7ff', '#ffe0b8', '#d3bcff'].map((value) => new THREE.Color(value))
    for (let index = 0; index < count; index += 1) {
      const radius = 8 + Math.pow(seeded(index + 4), 0.62) * 62
      const theta = seeded(index + 32) * Math.PI * 2
      const phi = Math.acos(2 * seeded(index + 62) - 1)
      values[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
      values[index * 3 + 1] = radius * Math.cos(phi)
      values[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
      const tint = starTints[Math.floor(seeded(index + 82) * starTints.length)]
      const highlight = Math.pow(seeded(index + 92), 5) * .55
      const color = tint.clone().lerp(new THREE.Color('#ffffff'), highlight)
      color.toArray(colors, index * 3)
      sizes[index] = .35 + Math.pow(seeded(index + 102), 3.2) * 2.2
      alphas[index] = .32 + Math.pow(seeded(index + 112), 1.35) * .68
      phases[index] = seeded(index + 122) * Math.PI * 2
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(values, 3))
    next.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    next.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    next.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
    next.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    return next
  }, [])
  const points = useRef<THREE.Points>(null)
  const shader = useMemo(() => ({
    uniforms: { uTime: { value: 0 }, uPixelScale: { value: 92 }, uOpacity: { value: 1 } },
    vertexShader: `attribute float aSize; attribute vec3 aColor; attribute float aAlpha; attribute float aPhase;
      uniform float uTime; uniform float uPixelScale; uniform float uOpacity;
      varying vec3 vColor; varying float vAlpha; varying float vPhase;
      void main(){ vec4 viewPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*viewPosition;
        gl_PointSize=clamp(aSize*uPixelScale/max(1.0,-viewPosition.z),1.0,7.0); vColor=aColor; vAlpha=aAlpha*uOpacity; vPhase=aPhase; }`,
    fragmentShader: `uniform float uTime; varying vec3 vColor; varying float vAlpha; varying float vPhase;
      void main(){ float d=length(gl_PointCoord-vec2(.5)); float core=1.0-smoothstep(.22,.5,d); float halo=(1.0-smoothstep(.03,.5,d))*.18;
        float twinkle=.82+.18*sin(uTime*.72+vPhase); float alpha=(core*.86+halo)*vAlpha*twinkle; if(alpha<.012) discard;
        gl_FragColor=vec4(vColor*(.82+core*.35),alpha); }`,
  }), [])
  useFrame(({ clock }, delta) => {
    if (points.current) points.current.rotation.y += delta * 0.0015
    if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime
  })
  return <points ref={points} geometry={geometry} frustumCulled={false}>
    <shaderMaterial ref={material} args={[shader]} transparent depthWrite={false} depthTest={true} blending={THREE.AdditiveBlending} toneMapped={false} />
  </points>
}

const METEOR_POOL_SIZE = 6
const METEOR_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const METEOR_FRAGMENT_SHADER = `
  uniform vec3 uTint;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float across = abs(vUv.y - 0.5) * 2.0;
    float softEdge = 1.0 - smoothstep(0.08, 1.0, across);
    float tail = pow(max(vUv.x, 0.0), 1.15) * smoothstep(0.0, 0.2, vUv.x);
    float core = exp(-across * across * 22.0) * tail;
    float halo = exp(-across * across * 5.0) * tail * 0.24;
    float head = exp(-pow((1.0 - vUv.x) * 30.0, 2.0)) * exp(-across * across * 12.0);
    float alpha = (core + halo + head * 0.62) * softEdge * uOpacity;
    gl_FragColor = vec4(uTint * (0.86 + head * 1.9), alpha);
  }
`

type MeteorFlight = {
  active: boolean
  age: number
  startX: number
  startY: number
  depth: number
  speed: number
  length: number
  width: number
  tint: THREE.Color
}

function MeteorField({ reducedMotion, themeId }: { reducedMotion?: boolean; themeId?: ThemeId }) {
  const { camera, size } = useThree()
  const group = useRef<THREE.Group>(null)
  const meshes = useRef<Array<THREE.Mesh | null>>([])
  const flights = useMemo<MeteorFlight[]>(() => Array.from({ length: METEOR_POOL_SIZE }, () => ({
    active: false, age: 0, startX: 0, startY: 0, depth: 18, speed: 0.6,
    length: 0.45, width: 0.018, tint: new THREE.Color('#f4f7ff'),
  })), [])
  const geometry = useMemo(() => {
    const shape = new THREE.BufferGeometry()
    shape.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, -1, 0,  0, -1, 0,  0, 1, 0,  -1, 1, 0,
    ], 3))
    shape.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0,  1, 0,  1, 1,  0, 1,
    ], 2))
    shape.setIndex([0, 1, 2, 0, 2, 3])
    return shape
  }, [])
  const materials = useMemo(() => Array.from({ length: METEOR_POOL_SIZE }, () => new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color('#f4f7ff') }, uOpacity: { value: 0 } },
    vertexShader: METEOR_VERTEX_SHADER,
    fragmentShader: METEOR_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })), [])
  const nextSpawn = useRef(5 + Math.random() * 5)
  const themeColor = useMemo(() => new THREE.Color(themeById(themeId ?? 'care').color), [themeId])

  useEffect(() => () => {
    geometry.dispose()
    materials.forEach((material) => material.dispose())
  }, [geometry, materials])

  useFrame(({ clock }, delta) => {
    const root = group.current
    if (!root) return
    root.position.copy(camera.position)
    root.quaternion.copy(camera.quaternion)
    if (reducedMotion || !(camera instanceof THREE.PerspectiveCamera)) {
      flights.forEach((flight, index) => {
        flight.active = false
        if (meshes.current[index]) meshes.current[index]!.visible = false
      })
      return
    }

    const frameDelta = Math.min(delta, 0.08)
    nextSpawn.current -= frameDelta
    if (nextSpawn.current <= 0) {
      const roll = Math.random()
      const count = roll < 0.1 ? 3 : roll < 0.24 ? 2 : 1
      const fromRight = Math.random() < 0.52
      const originX = fromRight ? 1.12 : -0.62 + Math.random() * 1.85
      const originY = fromRight ? -0.32 + Math.random() * 1.48 : 1.12
      let launched = 0
      for (const flight of flights) {
        if (flight.active) continue
        flight.active = true
        flight.age = -launched * (0.1 + Math.random() * 0.11)
        flight.startX = originX + (fromRight ? Math.random() * 0.1 : 0)
        flight.startY = originY + (fromRight ? 0 : Math.random() * 0.08)
        flight.depth = 10 + Math.random() * 34
        flight.speed = 0.48 + Math.random() * 0.52
        flight.length = 0.2 + Math.random() * 0.7
        flight.width = 0.009 + Math.random() * 0.022
        flight.tint.set('#f4f7ff').lerp(themeColor, 0.07 + Math.random() * 0.15)
        const material = materials[flights.indexOf(flight)]
        material.uniforms.uTint.value.copy(flight.tint)
        launched += 1
        if (launched >= count) break
      }
      nextSpawn.current = 5 + Math.random() * 5
    }

    const aspect = size.width / Math.max(1, size.height)
    const slope = Math.tan(0.48) * aspect
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
    const travelAngle = Math.atan2(-Math.sin(0.48), -Math.cos(0.48))
    flights.forEach((flight, index) => {
      const mesh = meshes.current[index]
      if (!mesh) return
      if (!flight.active) {
        mesh.visible = false
        return
      }
      flight.age += frameDelta
      const x = flight.startX - flight.speed * flight.age
      const y = flight.startY - flight.speed * slope * flight.age
      if (x < -1.3 || y < -1.3) {
        flight.active = false
        mesh.visible = false
        return
      }
      const halfHeight = flight.depth * tanHalfFov
      const halfWidth = halfHeight * camera.aspect
      mesh.position.set(x * halfWidth, y * halfHeight, -flight.depth)
      mesh.rotation.z = travelAngle
      mesh.scale.set(flight.length, flight.width, 1)
      const fadeRight = 1 - smoothstep(1.02, 1.3, x)
      const fadeTop = 1 - smoothstep(1.02, 1.3, y)
      const fadeLeft = smoothstep(-1.3, -0.78, x)
      const fadeBottom = smoothstep(-1.3, -0.78, y)
      materials[index].uniforms.uOpacity.value = Math.min(fadeRight, fadeTop, fadeLeft, fadeBottom)
      mesh.visible = materials[index].uniforms.uOpacity.value > 0.01
    })
  })

  return <group ref={group}>
    {materials.map((material, index) => <mesh
      key={index}
      ref={(mesh) => { meshes.current[index] = mesh }}
      geometry={geometry}
      material={material}
      visible={false}
      frustumCulled={false}
      renderOrder={2}
    />)}
  </group>
}

const PORTAL_CLOUD_LOBES = [
  { position: [0, 0, 0] as const, scale: [1.42, 0.82, 0.96] as const, opacity: 0.58, seed: 0.17 },
  { position: [-0.3, 0.08, -0.03] as const, scale: [0.83, 0.7, 0.82] as const, opacity: 0.43, seed: 1.91 },
  { position: [0.33, -0.08, 0.1] as const, scale: [0.84, 0.67, 0.8] as const, opacity: 0.4, seed: 3.27 },
  { position: [0.02, 0.2, -0.12] as const, scale: [0.76, 0.69, 0.73] as const, opacity: 0.34, seed: 4.63 },
]

const PORTAL_CLOUD_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uSeed;
  varying vec3 vCloudPosition;
  varying vec3 vCloudNormal;
  varying vec3 vViewDirection;
  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                   mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                   mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 4; octave++) {
      value += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }
  void main() {
    vec3 p = position;
    float billow = fbm(p * 2.7 + vec3(uSeed, uSeed * 0.61, -uSeed));
    float ripple = fbm(p * 7.2 - vec3(uTime * 0.014, uSeed * 1.7, uTime * 0.01));
    p *= 0.93 + billow * 0.12 + ripple * 0.014;
    vCloudPosition = p;
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vCloudNormal = normalize(normalMatrix * normal);
    vViewDirection = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const PORTAL_CLOUD_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform vec3 uThemeColor;
  uniform vec3 uGlowColor;
  varying vec3 vCloudPosition;
  varying vec3 vCloudNormal;
  varying vec3 vViewDirection;
  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                   mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                   mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 4; octave++) {
      value += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }
  void main() {
    vec3 drift = vec3(uTime * 0.008, -uTime * 0.006, uTime * 0.007);
    float broad = fbm(vCloudPosition * 2.4 + drift + vec3(uSeed, -uSeed * 0.7, 0.0));
    float softTexture = fbm(vCloudPosition * 5.8 - drift * 1.3 + vec3(-uSeed, uSeed * 0.7, uSeed * 0.3));
    float fineTexture = fbm(vCloudPosition * 10.4 + drift * 1.8 + vec3(uSeed * 0.4, 0.0, -uSeed));
    float field = broad * 0.57 + softTexture * 0.34 + fineTexture * 0.09;
    float billows = smoothstep(0.29, 0.69, field);
    float facing = abs(dot(normalize(vCloudNormal), normalize(vViewDirection)));
    float softEdge = smoothstep(0.02, 0.62, facing);
    float density = mix(0.22, 0.72, billows) * softEdge;
    float alpha = density * 0.13 * uOpacity;
    if (alpha < 0.004) discard;
    vec3 tintedMist = mix(uGlowColor, uThemeColor, 0.42 + billows * 0.34);
    vec3 paleMist = mix(tintedMist, vec3(0.78, 0.82, 0.94), 0.55 + billows * 0.08);
    vec3 color = paleMist;
    gl_FragColor = vec4(color, alpha);
  }
`

function PortalCloud({ motion, planet, selfDirection }: { motion: React.MutableRefObject<MotionState>; planet?: Planet; selfDirection: Vec3 }) {
  const { size } = useThree()
  const group = useRef<THREE.Group>(null)
  const materials = useRef<Array<THREE.ShaderMaterial | null>>([])
  const theme = themeById(planet?.theme ?? 'care')
  const themeColor = useMemo(() => new THREE.Color(theme.color), [theme.color])
  const glowColor = useMemo(() => new THREE.Color(theme.glow), [theme.glow])
  const cloudCenter = useMemo(() => {
    const direction = toVector3(selfDirection)
    return direction.multiplyScalar(portalTravelDistance(size.width) * PORTAL_CLOUD_CROSSING_PROGRESS)
  }, [selfDirection, size.width])
  const shaders = useMemo(() => PORTAL_CLOUD_LOBES.map(({ seed }) => ({
    uniforms: {
      uTime: { value: 0 },
      uSeed: { value: seed },
      uOpacity: { value: 0 },
      uThemeColor: { value: themeColor.clone() },
      uGlowColor: { value: glowColor.clone() },
    },
    vertexShader: PORTAL_CLOUD_VERTEX_SHADER,
    fragmentShader: PORTAL_CLOUD_FRAGMENT_SHADER,
  })), [])

  useFrame(({ clock }, delta) => {
    const progress = motion.current.portalProgress
    if (group.current) {
      group.current.position.copy(cloudCenter)
      group.current.scale.setScalar(0.02 + smoothstep(0, 0.78, progress) * 1.12)
      group.current.visible = progress > 0.005 && progress < 0.995
    }
    const forming = smoothstep(0.005, 0.28, progress)
    const dispersing = 1 - smoothstep(PORTAL_CLOUD_CROSSING_PROGRESS + 0.04, 0.99, progress)
    const opacity = forming * dispersing
    materials.current.forEach((material, index) => {
      if (!material) return
      material.uniforms.uTime.value = clock.elapsedTime
      material.uniforms.uOpacity.value = opacity * PORTAL_CLOUD_LOBES[index].opacity
      material.uniforms.uThemeColor.value.copy(themeColor)
      material.uniforms.uGlowColor.value.copy(glowColor)
    })
  })

  return <group ref={group} position={cloudCenter}>
    {PORTAL_CLOUD_LOBES.map((lobe, index) => <mesh key={lobe.seed} position={lobe.position} scale={lobe.scale} frustumCulled={false}>
      <sphereGeometry args={[1, 48, 32]} />
      <shaderMaterial
        ref={(material) => { materials.current[index] = material }}
        args={[shaders[index]]}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>)}
  </group>
}

function GalaxyDust({ seedKey, tint, active }: { seedKey: string; tint: string; active: boolean }) {
  const geometry = useMemo(() => {
    const count = 1160
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const colors = new Float32Array(count * 3)
    const alphas = new Float32Array(count)
    const phases = new Float32Array(count)
    const seed = hashString32(seedKey) % 997
    const galaxyColor = new THREE.Color(tint)
    const white = new THREE.Color('#fff2dc')
    for (let index = 0; index < count; index += 1) {
      const radius = Math.pow(seeded(index + seed), 1.6) * 2.65
      const arm = Math.floor(seeded(index + seed + 88) * 3)
      const angle = radius * 1.85 + arm * (Math.PI * 2 / 3) + seeded(index + seed + 108) * 0.48
      positions[index * 3] = Math.cos(angle) * radius
      positions[index * 3 + 1] = (seeded(index + seed + 203) - 0.5) * 2 * (GALAXY_ARM_HALF_THICKNESS_BASE + radius * GALAXY_ARM_HALF_THICKNESS_SCALE)
      positions[index * 3 + 2] = Math.sin(angle) * radius * GALAXY_ARM_DEPTH_SCALE
      const color = galaxyColor.clone().lerp(white, Math.pow(seeded(index + seed + 218), 3) * .74)
      color.toArray(colors, index * 3)
      const sizeRoll = seeded(index + seed + 228)
      sizes[index] = sizeRoll > .992
        ? 4.8 + seeded(index + seed + 229) * 5.8
        : sizeRoll > .94
          ? 1.6 + seeded(index + seed + 230) * 2.4
          : .42 + Math.pow(sizeRoll, 2.8) * 1.75
      alphas[index] = .22 + Math.pow(seeded(index + seed + 238), 1.4) * .76
      phases[index] = seeded(index + seed + 248) * Math.PI * 2
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    next.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    next.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    next.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
    next.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    return next
  }, [seedKey, tint])
  const material = useRef<THREE.ShaderMaterial>(null)
  const shader = useMemo(() => ({
    uniforms: { uTime: { value: 0 }, uPixelScale: { value: 25 }, uOpacity: { value: .5 } },
    vertexShader: `attribute float aSize; attribute vec3 aColor; attribute float aAlpha; attribute float aPhase;
      uniform float uTime; uniform float uPixelScale; uniform float uOpacity;
      varying vec3 vColor; varying float vAlpha; varying float vPhase;
      void main(){ vec4 viewPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*viewPosition;
        gl_PointSize=clamp(aSize*uPixelScale/max(1.0,-viewPosition.z),1.0,20.0); vColor=aColor; vAlpha=aAlpha*uOpacity; vPhase=aPhase; }`,
    fragmentShader: `uniform float uTime; varying vec3 vColor; varying float vAlpha; varying float vPhase;
      void main(){ float d=length(gl_PointCoord-vec2(.5)); float core=1.0-smoothstep(.2,.5,d); float halo=(1.0-smoothstep(.02,.5,d))*.2;
        float twinkle=.78+.22*sin(uTime*.85+vPhase); float alpha=(core*.82+halo)*vAlpha*twinkle; if(alpha<.012) discard;
        gl_FragColor=vec4(vColor*(.8+core*.42),alpha); }`,
  }), [])
  useFrame(({ clock }, delta) => {
    if (material.current) {
      material.current.uniforms.uTime.value = clock.elapsedTime
      material.current.uniforms.uOpacity.value = THREE.MathUtils.damp(material.current.uniforms.uOpacity.value, active ? .92 : .64, 4, delta)
    }
  })
  return <points geometry={geometry}>
    <shaderMaterial ref={material} args={[shader]} transparent depthWrite={false} depthTest={true} blending={THREE.AdditiveBlending} toneMapped={false} />
  </points>
}

function FarPlanet({ planet, radius }: { planet: Planet; radius: number }) {
  const theme = themeById(planet.theme)
  const mood = moodById(planet.mood)
  const planetColor = useMemo(() => new THREE.Color(theme.color).offsetHSL(0, .08, .06), [theme.color])
  const glowColor = useMemo(() => new THREE.Color(theme.glow).offsetHSL(0, .06, .08), [theme.glow])
  return <>
    <mesh>
      <icosahedronGeometry args={[radius, 1]} />
      <meshStandardMaterial color={planetColor} roughness={0.76} metalness={0.06} emissive={glowColor} emissiveIntensity={0.4 + planet.intensity * 0.04} />
    </mesh>
    <mesh scale={1.26}>
      <icosahedronGeometry args={[radius, 1]} />
      <meshBasicMaterial color={mood.id === 'anxious' ? '#ffc56b' : theme.color} transparent opacity={0.13} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  </>
}

function usePlanetTextures(planet: Planet, profile: PlanetVisualProfile, detail: 'mid' | 'near') {
  const climate = useMemo(
    () => derivePlanetClimate(planet.id, planet.mood, planet.intensity, planet.weatherHistory),
    [planet.id, planet.visualSeed, planet.mood, planet.intensity, planet.weatherHistory],
  )
  const cacheKey = planet.owner && detail === 'near'
    ? JSON.stringify([planet.id, planetAppearanceSeed(planet), profile, climate])
    : undefined
  const textures = useMemo(() => {
    if (cacheKey) {
      const cached = selfPlanetNearTextureCache.get(cacheKey)
      if (cached) {
        selfPlanetNearTextureCache.delete(cacheKey)
        selfPlanetNearTextureCache.set(cacheKey, cached)
        return cached
      }
    }
    const width = detail === 'near' ? 192 : 96
    const height = detail === 'near' ? 96 : 48
    const data = generatePlanetTextureData(hashString32(planetAppearanceSeed(planet)), profile, width, height, climate)
    const color = new THREE.DataTexture(data.color, width, height, THREE.RGBAFormat)
    color.colorSpace = THREE.SRGBColorSpace
    color.wrapS = THREE.RepeatWrapping
    color.minFilter = THREE.LinearMipmapLinearFilter
    // Keep the source map resolution unchanged, but interpolate neighbouring
    // elevation colours when the globe is close enough to magnify its texels.
    color.magFilter = THREE.LinearFilter
    color.needsUpdate = true
    const relief = new THREE.DataTexture(data.height, width, height, THREE.RedFormat)
    relief.wrapS = THREE.RepeatWrapping
    relief.minFilter = THREE.LinearMipmapLinearFilter
    relief.magFilter = THREE.LinearFilter
    relief.needsUpdate = true
    const next = { color, relief }
    if (cacheKey) {
      selfPlanetNearTextureCache.set(cacheKey, next)
      while (selfPlanetNearTextureCache.size > SELF_PLANET_NEAR_CACHE_LIMIT) {
        const oldestKey = selfPlanetNearTextureCache.keys().next().value
        if (oldestKey === undefined) break
        const oldest = selfPlanetNearTextureCache.get(oldestKey)
        oldest?.color.dispose()
        oldest?.relief.dispose()
        selfPlanetNearTextureCache.delete(oldestKey)
      }
    }
    return next
  }, [cacheKey, climate, detail, planet.id, planet.visualSeed, profile])
  useEffect(() => () => {
    if (!cacheKey) {
      textures.color.dispose()
      textures.relief.dispose()
    }
  }, [cacheKey, textures])
  return { textures, climate }
}

function CloudLayer({ radius, profile }: { radius: number; profile: PlanetVisualProfile }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const shader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uCoverage: { value: profile.cloudCoverage },
      uSpeed: { value: profile.cloudSpeed },
      uColor: { value: new THREE.Color(profile.palette.cloud) },
      uPlanetRevealOpacity: { value: 1 },
    },
    vertexShader: `varying vec3 vNormalW; varying vec3 vPos; void main(){vNormalW=normalize(normalMatrix*normal);vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec3 vNormalW; varying vec3 vPos; uniform float uTime; uniform float uCoverage; uniform float uSpeed; uniform vec3 uColor; uniform float uPlanetRevealOpacity;
      float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float noise3(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      float fbm(vec3 p){float n=0.0;float a=.56;for(int i=0;i<4;i++){n+=noise3(p)*a;p=p*2.03+vec3(3.1,1.7,2.4);a*=.5;}return n/.93;}
      void main(){
        vec3 p=normalize(vPos)*3.4+vec3(uTime*uSpeed*.035,uTime*uSpeed*.012,-uTime*uSpeed*.021);
        float cloud=fbm(p);
        float edge=.78-uCoverage*.36;
        float alpha=smoothstep(edge,edge+.13,cloud)*(.025+uCoverage*.24);
        float rim=pow(1.0-max(0.0,dot(normalize(vNormalW),vec3(0.0,0.0,1.0))),2.0);
        gl_FragColor=vec4(uColor,(alpha+rim*.045)*uPlanetRevealOpacity);
      }`,
  }), [profile.cloudCoverage, profile.cloudSpeed, profile.palette.cloud])
  useFrame(({ clock }) => { if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime })
  return <mesh scale={1.045} rotation={[0.07, 0.3, 0]}>
    <sphereGeometry args={[radius, 36, 24]} />
    <shaderMaterial ref={material} args={[shader]} transparent depthWrite={false} />
  </mesh>
}

function OceanSurface({ radius, profile, climate, detail }: { radius: number; profile: PlanetVisualProfile; climate: ReturnType<typeof derivePlanetClimate>; detail: 'mid' | 'near' }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const shader = useMemo(() => {
    // Keep the ocean recognizably blue across every planet theme. Theme color
    // only adds a restrained undertone so purple/brown palettes cannot crush it
    // into near-black water.
    const deep = new THREE.Color('#08285a').lerp(new THREE.Color(profile.palette.ocean), .12)
    const surface = new THREE.Color('#0b65a8').lerp(new THREE.Color(profile.palette.atmosphere), .08)
    const glint = new THREE.Color(profile.palette.atmosphere).lerp(new THREE.Color('#d6f4ff'), .64)
    return {
      uniforms: {
        uTime: { value: 0 },
        uFlowSpeed: { value: .08 + profile.wind * .2 },
        uDeep: { value: deep },
        uSurface: { value: surface },
        uGlint: { value: glint },
        uPlanetRevealOpacity: { value: 1 },
      },
      vertexShader: `varying vec3 vNormalW; varying vec3 vPos; void main(){vNormalW=normalize(normalMatrix*normal);vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `
        varying vec3 vNormalW; varying vec3 vPos;
        uniform float uTime; uniform float uFlowSpeed; uniform vec3 uDeep; uniform vec3 uSurface; uniform vec3 uGlint; uniform float uPlanetRevealOpacity;
        float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
        float noise3(vec3 p){
          vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
        }
        void main(){
          vec3 n=normalize(vPos);
          float t=uTime*uFlowSpeed;
          float broad=noise3(n*5.2+vec3(t*.22,-t*.08,t*.13));
          float fine=noise3(n*13.0+vec3(-t*.35,t*.18,t*.24));
          float current=sin(dot(n,vec3(18.0,11.0,21.0))+t*2.1+broad*3.8+fine*1.4);
          float streak=smoothstep(.56,.96,current+fine*.32);
          float shimmer=smoothstep(.75,.97,fine*.62+broad*.38);
          vec3 viewNormal=normalize(vNormalW);
          float facing=max(0.0,dot(viewNormal,vec3(0.0,0.0,1.0)));
          float fresnel=pow(1.0-facing,2.4);
          vec3 color=mix(uDeep,uSurface,.16+broad*.3+fine*.11);
          color+=uGlint*(streak*.075+shimmer*.045+fresnel*.10);
          gl_FragColor=vec4(color,uPlanetRevealOpacity);
        }`,
    }
  }, [profile.palette.atmosphere, profile.palette.ocean, profile.wind])
  useFrame(({ clock }) => { if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime })
  return <mesh>
    <sphereGeometry args={[radius, detail === 'near' ? 64 : 44, detail === 'near' ? 44 : 30]} />
    {/* Ocean is opaque at rest; only the planet reveal hook disables depth writes while fading. */}
    <shaderMaterial ref={material} args={[shader]} transparent depthWrite />
  </mesh>
}

function useTerrainGeometry(planet: Planet, radius: number, detail: 'mid' | 'near', seaLevel: number) {
  const cacheKey = planet.owner && detail === 'near'
    ? JSON.stringify([planet.id, planetAppearanceSeed(planet), radius, detail, seaLevel])
    : undefined
  return useMemo(() => {
    if (cacheKey) {
      const cached = selfPlanetNearGeometryCache.get(cacheKey)
      if (cached) {
        selfPlanetNearGeometryCache.delete(cacheKey)
        selfPlanetNearGeometryCache.set(cacheKey, cached)
        return cached
      }
    }
    const sphere = new THREE.SphereGeometry(1, detail === 'near' ? 96 : 56, detail === 'near' ? 64 : 36).toNonIndexed()
    const positions = sphere.attributes.position as THREE.BufferAttribute
    const uvs = sphere.attributes.uv as THREE.BufferAttribute
    const elevationSeed = hashString32(planetAppearanceSeed(planet))
    const shoreline = planetSeaLine(elevationSeed, seaLevel)
    const waterRadius = radius * (.982 + seaLevel * .03)
    type TerrainVertex = { normal: THREE.Vector3; u: number; v: number; elevation: number }
    const landVertices: number[] = []
    const landUvs: number[] = []
    const landNormals: number[] = []
    const terrainNormalCache = new Map<string, [number, number, number]>()
    const terrainReliefCache = new Map<string, number>()
    const reliefLongitudeStep = detail === 'near' ? 1 / 96 : 1 / 56
    const reliefLatitudeStep = detail === 'near' ? 1 / 64 : 1 / 36
    const reliefElevationAt = (u: number, v: number, elevation = samplePlanetElevation(elevationSeed, u, v, seaLevel)) => {
      const wrappedU = (u % 1 + 1) % 1
      const clampedV = THREE.MathUtils.clamp(v, 0, 1)
      const key = `${wrappedU.toFixed(6)}:${clampedV.toFixed(6)}`
      const cached = terrainReliefCache.get(key)
      if (cached !== undefined) return cached
      // Preserve the exact shoreline while softly averaging only the height
      // field across existing mesh vertices. This rounds small triangulated
      // ridges without adding subdivisions or changing coast placement.
      const result = elevation <= shoreline + .0005 ? shoreline : Math.max(shoreline, elevation * .62 + (
        samplePlanetElevation(elevationSeed, wrappedU + reliefLongitudeStep, clampedV, seaLevel)
        + samplePlanetElevation(elevationSeed, wrappedU - reliefLongitudeStep, clampedV, seaLevel)
        + samplePlanetElevation(elevationSeed, wrappedU, clampedV + reliefLatitudeStep, seaLevel)
        + samplePlanetElevation(elevationSeed, wrappedU, clampedV - reliefLatitudeStep, seaLevel)
      ) * .095)
      terrainReliefCache.set(key, result)
      return result
    }
    const makeVertex = (index: number): TerrainVertex => ({
      normal: new THREE.Vector3().fromBufferAttribute(positions, index).normalize(),
      u: uvs.getX(index),
      v: uvs.getY(index),
      elevation: samplePlanetElevation(elevationSeed, uvs.getX(index), uvs.getY(index), seaLevel),
    })
    const coastIntersection = (start: TerrainVertex, end: TerrainVertex): TerrainVertex => {
      const amount = THREE.MathUtils.clamp((shoreline - start.elevation) / (end.elevation - start.elevation), 0, 1)
      let endU = end.u
      if (Math.abs(start.u - endU) > .5) endU += start.u < .5 ? 1 : -1
      const normal = start.normal.clone().lerp(end.normal, amount).normalize()
      const u = start.u + (endU - start.u) * amount
      return { normal, u, v: start.v + (end.v - start.v) * amount, elevation: shoreline }
    }
    const appendLandVertex = (vertex: TerrainVertex) => {
      const altitude = THREE.MathUtils.clamp((reliefElevationAt(vertex.u, vertex.v, vertex.elevation) - shoreline) / Math.max(.08, .94 - shoreline), 0, 1)
      const surface = waterRadius * (1.008 + Math.pow(altitude, .84) * planetLandReliefScale)
      landVertices.push(vertex.normal.x * surface, vertex.normal.y * surface, vertex.normal.z * surface)
      landUvs.push(vertex.u, vertex.v)
      const normalKey = `${vertex.u.toFixed(6)}:${vertex.v.toFixed(6)}`
      const cachedNormal = terrainNormalCache.get(normalKey)
      if (cachedNormal) {
        landNormals.push(...cachedNormal)
        return
      }
      const latitudeAngle = (vertex.v - .5) * Math.PI
      const longitudeAngle = vertex.u * Math.PI * 2
      const east = new THREE.Vector3(Math.sin(longitudeAngle), 0, Math.cos(longitudeAngle))
      const north = new THREE.Vector3(Math.sin(latitudeAngle) * Math.cos(longitudeAngle), Math.cos(latitudeAngle), -Math.sin(latitudeAngle) * Math.sin(longitudeAngle))
      const radiusAt = (u: number, v: number) => {
        const elevation = samplePlanetElevation(elevationSeed, u, THREE.MathUtils.clamp(v, 0, 1), seaLevel)
        const height = THREE.MathUtils.clamp((reliefElevationAt(u, v, elevation) - shoreline) / Math.max(.08, .94 - shoreline), 0, 1)
        return waterRadius * (1.008 + Math.pow(height, .84) * planetLandReliefScale)
      }
      // The mesh intentionally keeps its existing triangle count. Estimate the
      // lighting normal over a slightly wider footprint than one terrain texel
      // so high-frequency ridges do not make each triangle read as a hard plane.
      const longitudeStep = detail === 'near' ? 1 / 72 : 1 / 40
      const latitudeStep = detail === 'near' ? 1 / 48 : 1 / 24
      const eastSlope = (radiusAt(vertex.u + longitudeStep, vertex.v) - radiusAt(vertex.u - longitudeStep, vertex.v))
        / Math.max(.0001, Math.PI * 4 * longitudeStep * Math.cos(latitudeAngle))
      const northSlope = (radiusAt(vertex.u, vertex.v + latitudeStep) - radiusAt(vertex.u, vertex.v - latitudeStep))
        / (Math.PI * 2 * latitudeStep)
      const surfaceNormal = vertex.normal.clone()
        .addScaledVector(east, -eastSlope / surface)
        .addScaledVector(north, -northSlope / surface)
        .normalize()
        .lerp(vertex.normal, .16)
        .normalize()
      const normal: [number, number, number] = [surfaceNormal.x, surfaceNormal.y, surfaceNormal.z]
      terrainNormalCache.set(normalKey, normal)
      landNormals.push(...normal)
    }
    for (let index = 0; index < positions.count; index += 3) {
      const triangle = [makeVertex(index), makeVertex(index + 1), makeVertex(index + 2)]
      const clipped: TerrainVertex[] = []
      for (let edge = 0; edge < triangle.length; edge += 1) {
        const current = triangle[edge]
        const next = triangle[(edge + 1) % triangle.length]
        const currentLand = current.elevation >= shoreline
        const nextLand = next.elevation >= shoreline
        if (currentLand && nextLand) clipped.push(next)
        else if (currentLand && !nextLand) clipped.push(coastIntersection(current, next))
        else if (!currentLand && nextLand) clipped.push(coastIntersection(current, next), next)
      }
      for (let vertex = 1; vertex < clipped.length - 1; vertex += 1) {
        appendLandVertex(clipped[0])
        appendLandVertex(clipped[vertex])
        appendLandVertex(clipped[vertex + 1])
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(landVertices, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(landUvs, 2))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(landNormals, 3))
    sphere.dispose()
    if (cacheKey) {
      selfPlanetNearGeometryCache.set(cacheKey, geometry)
      while (selfPlanetNearGeometryCache.size > SELF_PLANET_NEAR_CACHE_LIMIT) {
        const oldestKey = selfPlanetNearGeometryCache.keys().next().value
        if (oldestKey === undefined) break
        selfPlanetNearGeometryCache.get(oldestKey)?.dispose()
        selfPlanetNearGeometryCache.delete(oldestKey)
      }
    }
    return geometry
  }, [cacheKey, detail, planet.id, planet.visualSeed, radius, seaLevel])
}

function TreeInstances({ radius, planet, climate }: { radius: number; planet: Planet; climate: ReturnType<typeof derivePlanetClimate> }) {
  const count = Math.round(20 + climate.vegetationHealth * 32)
  const trunkMesh = useRef<THREE.InstancedMesh>(null)
  const lowerMesh = useRef<THREE.InstancedMesh>(null)
  const upperMesh = useRef<THREE.InstancedMesh>(null)
  const seed = hashString32(`${planetAppearanceSeed(planet)}:trees`)
  const terrainSeed = hashString32(planetAppearanceSeed(planet))
  const trees = useMemo(() => {
    const candidates: Array<{ normal: THREE.Vector3; surface: number }> = []
    const shoreline = planetSeaLine(terrainSeed, climate.seaLevel)
    for (let attempt = 0; candidates.length < count && attempt < count * 48; attempt += 1) {
      const longitude = seeded(seed + attempt * 17.3)
      const latitude = Math.asin(seeded(seed + attempt * 31.7) * 2 - 1) / Math.PI + .5
      if (!isPlanetLand(terrainSeed, longitude, latitude, climate.seaLevel)) continue
      if (planetRiverDepth(terrainSeed, longitude, latitude, climate.seaLevel) > .012) continue
      const elevation = samplePlanetElevation(terrainSeed, longitude, latitude, climate.seaLevel)
      const altitude = THREE.MathUtils.clamp((elevation - shoreline) / Math.max(.08, .94 - shoreline), 0, 1)
      const latAngle = (latitude - .5) * Math.PI
      const lonAngle = longitude * Math.PI * 2
      const normal = new THREE.Vector3(-Math.cos(latAngle) * Math.cos(lonAngle), Math.sin(latAngle), Math.cos(latAngle) * Math.sin(lonAngle))
      candidates.push({ normal, surface: radius * (.982 + climate.seaLevel * .03) * (1.008 + Math.pow(altitude, .84) * planetLandReliefScale) })
    }
    return candidates
  }, [climate.seaLevel, count, planet.id, planet.visualSeed, radius, seed, terrainSeed])
  const fireTransform = useMemo(() => {
    const firstTree = trees[0]
    if (!firstTree) return undefined
    return {
      position: firstTree.normal.clone().multiplyScalar(firstTree.surface),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), firstTree.normal),
    }
  }, [trees])
  const healthy = useMemo(() => new THREE.Color('#42b85f'), [])
  const upperGreen = useMemo(() => new THREE.Color('#71d878'), [])
  const withered = useMemo(() => new THREE.Color('#93815b'), [])
  const foliageColor = useMemo(() => healthy.clone().lerp(withered, 1 - climate.vegetationHealth), [climate.vegetationHealth, healthy, withered])
  const upperColor = useMemo(() => foliageColor.clone().lerp(upperGreen, .32), [foliageColor, upperGreen])
  useEffect(() => {
    if (!trunkMesh.current || !lowerMesh.current || !upperMesh.current) return
    const dummy = new THREE.Object3D()
    const up = new THREE.Vector3(0, 1, 0)
    for (let index = 0; index < trees.length; index += 1) {
      const tree = trees[index]
      const height = radius * (.18 + climate.vegetationHealth * .06)
      const scale = .72 + seeded(seed + index * 51.3) * .46
      const setPart = (mesh: THREE.InstancedMesh, offset: number) => {
        dummy.position.copy(tree.normal).multiplyScalar(tree.surface + height * offset)
        dummy.quaternion.setFromUnitVectors(up, tree.normal)
        dummy.scale.setScalar(scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
      }
      setPart(trunkMesh.current!, .28)
      setPart(lowerMesh.current!, .62)
      setPart(upperMesh.current!, .79)
    }
    for (const mesh of [trunkMesh.current, lowerMesh.current, upperMesh.current]) {
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [radius, seed, trees])
  return <>
    <instancedMesh ref={trunkMesh} args={[undefined, undefined, trees.length]}>
      <cylinderGeometry args={[radius * .009, radius * .014, radius * .12, 5]} />
      <meshStandardMaterial color="#9b6e3f" roughness={.92} />
    </instancedMesh>
    <instancedMesh ref={lowerMesh} args={[undefined, undefined, trees.length]}>
      <coneGeometry args={[radius * .062, radius * .17, 6]} />
      <meshStandardMaterial color={foliageColor} roughness={.88} />
    </instancedMesh>
    <instancedMesh ref={upperMesh} args={[undefined, undefined, trees.length]}>
      <coneGeometry args={[radius * .043, radius * .13, 6]} />
      <meshStandardMaterial color={upperColor} roughness={.84} />
    </instancedMesh>
    {climate.fire && fireTransform && <group position={fireTransform.position} quaternion={fireTransform.quaternion}>
      <mesh position={[0, radius * .1, 0]}>
        <coneGeometry args={[radius * .055, radius * .2, 5]} />
        <meshBasicMaterial color="#ff7b32" toneMapped={false} />
      </mesh>
      <mesh position={[0, radius * .1, radius * .006]}>
        <coneGeometry args={[radius * .028, radius * .13, 5]} />
        <meshBasicMaterial color="#ffe28a" toneMapped={false} />
      </mesh>
      <mesh position={[0, radius * .015, 0]}>
        <sphereGeometry args={[radius * .055, 8, 6]} />
        <meshBasicMaterial color="#ff4a1f" transparent opacity={.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>}
  </>
}

function LightningBolt({ radius, planet, climate }: { radius: number; planet: Planet; climate: ReturnType<typeof derivePlanetClimate> }) {
  const camera = useThree((state) => state.camera)
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshStandardMaterial>(null)
  const geometry = useMemo(() => new THREE.BufferGeometry(), [])
  const activeGeometry = useRef(geometry)
  const nextStrikeAt = useRef<number | null>(null)
  const strikeStartedAt = useRef(-Infinity)
  const strikeIndex = useRef(0)
  const [seed] = useState(() => hashString32(`${planetAppearanceSeed(planet)}:${climate.fireSeed}:${Math.random()}:lightning`))
  const worldCenter = useMemo(() => new THREE.Vector3(), [])
  const worldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const facingNormal = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => () => activeGeometry.current.dispose(), [])
  useFrame(({ clock }) => {
    const now = clock.elapsedTime
    if (nextStrikeAt.current === null) {
      nextStrikeAt.current = now + 1.1 + seeded(seed + 3.7) * 1.8
    }
    if (mesh.current && now >= nextStrikeAt.current) {
      mesh.current.getWorldPosition(worldCenter)
      mesh.current.getWorldQuaternion(worldQuaternion)
      facingNormal.copy(camera.position).sub(worldCenter).normalize()
      worldQuaternion.invert()
      facingNormal.applyQuaternion(worldQuaternion).normalize()

      const path = generateLightningPath(seed, strikeIndex.current, [facingNormal.x, facingNormal.y, facingNormal.z], radius)
      const curve = new THREE.CatmullRomCurve3(path.map((point) => new THREE.Vector3(...point)), false, 'centripetal')
      const nextGeometry = new THREE.TubeGeometry(curve, 36, radius * .013, 5, false)
      const previousGeometry = activeGeometry.current
      activeGeometry.current = nextGeometry
      mesh.current.geometry = nextGeometry
      previousGeometry.dispose()

      const intervalNoise = seeded(seed + (strikeIndex.current + 1) * 31.7)
      const averageInterval = THREE.MathUtils.lerp(8.2, 2.8, climate.lightning)
      strikeStartedAt.current = now
      strikeIndex.current += 1
      nextStrikeAt.current = now + averageInterval * (.72 + intervalNoise * .7)
    }

    if (material.current) {
      const age = now - strikeStartedAt.current
      const primary = age >= 0 && age < .075 ? 1 - age / .075 : 0
      const echoAge = age - .095
      const echo = echoAge >= 0 && echoAge < .075 ? .36 * (1 - echoAge / .075) : 0
      const pulse = Math.max(primary, echo)
      material.current.opacity = pulse * (.58 + climate.lightning * .36)
      material.current.emissiveIntensity = 1.2 + pulse * 5.2
    }
  })

  return <mesh ref={mesh} geometry={geometry}>
    <meshStandardMaterial ref={material} color="#fff8d0" emissive="#ffd56f" transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
  </mesh>
}

function WeatherSystem({ radius, planet, climate, profile }: { radius: number; planet: Planet; climate: ReturnType<typeof derivePlanetClimate>; profile: PlanetVisualProfile }) {
  const points = useRef<THREE.Points>(null)
  const material = useRef<THREE.PointsMaterial>(null)
  const count = Math.round(24 + profile.particleDensity * 96)
  const isHail = climate.currentWeather === 'hail'
  const isDust = climate.currentWeather === 'sandstorm'
  const geometry = useMemo(() => {
    const seed = hashString32(`${planetAppearanceSeed(planet)}:weather`)
    const positions = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      const spread = radius * (1.15 + seeded(seed + index * 8.3) * 1.3)
      positions[index * 3] = (seeded(seed + index * 3.1) - 0.5) * spread * 2
      positions[index * 3 + 1] = (seeded(seed + index * 5.7) - 0.5) * spread * 2
      positions[index * 3 + 2] = (seeded(seed + index * 7.9) - 0.5) * spread * 2
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return next
  }, [count, planet.id, planet.visualSeed, radius])
  const weatherColor = weatherAccent(climate.currentWeather)
  useFrame(({ clock }, delta) => {
    if (points.current) {
      points.current.rotation.y += delta * (0.08 + profile.wind * 0.45)
      if (climate.rain > 0.12 || climate.snow > 0.12 || isHail) {
        const positions = points.current.geometry.attributes.position as THREE.BufferAttribute
        for (let index = 0; index < positions.count; index += 1) {
          const flakes = !isHail && climate.snow > climate.rain
          const fallSpeed = isHail ? 1.05 : flakes ? .32 + climate.snow * .34 : 1.25 + climate.rain * 2.2
          let y = positions.getY(index) - delta * radius * fallSpeed
          if (y < -radius * 1.5) y = radius * 1.5
          positions.setY(index, y)
          if (flakes || isHail) positions.setX(index, positions.getX(index) + Math.sin(clock.elapsedTime * .8 + index) * delta * radius * (isHail ? .28 : .18))
        }
        positions.needsUpdate = true
      }
      if (isDust) {
        const positions = points.current.geometry.attributes.position as THREE.BufferAttribute
        for (let index = 0; index < positions.count; index += 1) {
          let x = positions.getX(index) + delta * radius * (.18 + profile.wind * .3)
          if (x > radius * 1.5) x = -radius * 1.5
          positions.setX(index, x)
          positions.setY(index, positions.getY(index) + Math.sin(clock.elapsedTime * .45 + index) * delta * radius * .035)
        }
        positions.needsUpdate = true
      }
    }
    if (material.current) material.current.opacity = isDust
      ? .1 + profile.wind * .16
      : .08 + Math.max(climate.rain, climate.snow, isHail ? .42 : 0, profile.wind * .28) * .56
  })
  const particleColor = isHail ? '#dceaf0' : climate.snow > climate.rain ? '#eaf8ff' : weatherColor
  return <>
    <points ref={points} geometry={geometry}>
      <pointsMaterial ref={material} color={particleColor} size={radius * (isDust ? .026 : isHail ? .042 : climate.snow > climate.rain ? .036 : .052)} transparent opacity={.3} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
    {profile.cloudCoverage > .54 && <mesh scale={1.18}>
      <sphereGeometry args={[radius, 24, 14]} />
      <meshBasicMaterial color={climate.snow > .18 ? '#b9dced' : profile.palette.cloud} transparent opacity={isDust ? .018 + profile.cloudCoverage * .025 : .025 + profile.cloudCoverage * .08} side={THREE.BackSide} depthWrite={false} />
    </mesh>}
    {climate.lightning > .25 && <LightningBolt radius={radius} planet={planet} climate={climate} />}
  </>
}

function createDoodleTexture(strokes: DoodleStroke[], themeColor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return undefined
  const inset = 24
  const side = canvas.width - inset * 2
  const corner = 28
  context.beginPath()
  context.moveTo(inset + corner, inset)
  context.lineTo(inset + side - corner, inset)
  context.quadraticCurveTo(inset + side, inset, inset + side, inset + corner)
  context.lineTo(inset + side, inset + side - corner)
  context.quadraticCurveTo(inset + side, inset + side, inset + side - corner, inset + side)
  context.lineTo(inset + corner, inset + side)
  context.quadraticCurveTo(inset, inset + side, inset, inset + side - corner)
  context.lineTo(inset, inset + corner)
  context.quadraticCurveTo(inset, inset, inset + corner, inset)
  context.closePath()
  context.fillStyle = 'rgba(5, 13, 25, 0.72)'
  context.fill()
  context.strokeStyle = `${themeColor}cc`
  context.lineWidth = 5
  context.stroke()
  context.save()
  context.translate(inset, inset)
  drawDoodleStrokes(context, strokes, side, side)
  context.restore()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function createDoodleSurfaceGeometry(planet: Planet, radius: number, seaLevel: number, focus: ReturnType<typeof largestLandFocus>) {
  const segments = 28
  const seed = hashString32(planetAppearanceSeed(planet))
  const shoreline = planetSeaLine(seed, seaLevel)
  const waterRadius = radius * (.982 + seaLevel * .03)
  const latitudeAngle = (focus.latitude - .5) * Math.PI
  const longitudeAngle = focus.longitude * Math.PI * 2
  const center = new THREE.Vector3(-Math.cos(latitudeAngle) * Math.cos(longitudeAngle), Math.sin(latitudeAngle), Math.cos(latitudeAngle) * Math.sin(longitudeAngle))
  const east = new THREE.Vector3(Math.sin(longitudeAngle), 0, Math.cos(longitudeAngle))
  const north = new THREE.Vector3(Math.sin(latitudeAngle) * Math.cos(longitudeAngle), Math.cos(latitudeAngle), -Math.sin(latitudeAngle) * Math.sin(longitudeAngle))
  const side = radius * .52
  const positions = new Float32Array((segments + 1) * (segments + 1) * 3)
  const uvs = new Float32Array((segments + 1) * (segments + 1) * 2)
  const indices: number[] = []
  for (let y = 0; y <= segments; y += 1) {
    const v = y / segments
    for (let x = 0; x <= segments; x += 1) {
      const u = x / segments
      const tangentPoint = center.clone().multiplyScalar(radius)
        .addScaledVector(east, (u - .5) * side)
        .addScaledVector(north, (v - .5) * side)
      const normal = tangentPoint.normalize()
      const latitude = Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1)) / Math.PI + .5
      const longitude = ((Math.atan2(normal.z, -normal.x) / (Math.PI * 2)) + 1) % 1
      const elevation = samplePlanetElevation(seed, longitude, latitude, seaLevel)
      const altitude = THREE.MathUtils.clamp((elevation - shoreline) / Math.max(.08, .94 - shoreline), 0, 1)
      const surface = elevation >= shoreline ? waterRadius * (1.008 + Math.pow(altitude, .84) * planetLandReliefScale) : waterRadius
      const offset = (y * (segments + 1) + x) * 3
      positions[offset] = normal.x * (surface + radius * .008)
      positions[offset + 1] = normal.y * (surface + radius * .008)
      positions[offset + 2] = normal.z * (surface + radius * .008)
      const uvOffset = (y * (segments + 1) + x) * 2
      uvs[uvOffset] = u
      uvs[uvOffset + 1] = v
    }
  }
  for (let y = 0; y < segments; y += 1) {
    for (let x = 0; x < segments; x += 1) {
      const bottomLeft = y * (segments + 1) + x
      const bottomRight = bottomLeft + 1
      const topLeft = bottomLeft + segments + 1
      const topRight = topLeft + 1
      indices.push(bottomLeft, bottomRight, topLeft, bottomRight, topRight, topLeft)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function DoodleSurface({ planet, radius, seaLevel }: { planet: Planet; radius: number; seaLevel: number }) {
  const strokes = planet.doodle ?? []
  const seed = useMemo(() => hashString32(planetAppearanceSeed(planet)), [planet.id, planet.visualSeed])
  const focus = useMemo(() => largestLandFocus(seed, seaLevel), [seed, seaLevel])
  const geometry = useMemo(() => createDoodleSurfaceGeometry(planet, radius, seaLevel, focus), [focus, planet.id, planet.visualSeed, radius, seaLevel])
  const themeColor = themeById(planet.theme).color
  const texture = useMemo(() => createDoodleTexture(strokes, themeColor), [strokes, themeColor])
  useEffect(() => () => { geometry.dispose(); texture?.dispose() }, [geometry, texture])
  if (!texture) return null
  return <mesh geometry={geometry} renderOrder={4}>
    <meshBasicMaterial map={texture} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} toneMapped={false} />
  </mesh>
}

function createRiverGeometry(planet: Planet, radius: number, seaLevel: number, climate: ReturnType<typeof derivePlanetClimate>) {
  const seed = hashString32(planetAppearanceSeed(planet))
  const shoreline = planetSeaLine(seed, seaLevel)
  const waterRadius = radius * (.982 + seaLevel * .03)
  const rivers = generatePlanetRivers(seed, seaLevel)
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (const river of rivers) {
    const centers: THREE.Vector3[] = []
    for (const point of river.points) {
      const latitudeAngle = (point.latitude - .5) * Math.PI
      const longitudeAngle = point.longitude * Math.PI * 2
      const normal = new THREE.Vector3(
        -Math.cos(latitudeAngle) * Math.cos(longitudeAngle),
        Math.sin(latitudeAngle),
        Math.cos(latitudeAngle) * Math.sin(longitudeAngle),
      )
      const elevation = samplePlanetElevation(seed, point.longitude, point.latitude, seaLevel)
      const altitude = THREE.MathUtils.clamp((elevation - shoreline) / Math.max(.08, .94 - shoreline), 0, 1)
      const surface = waterRadius * (1.008 + Math.pow(altitude, .84) * planetLandReliefScale) + radius * .0025
      centers.push(normal.multiplyScalar(surface))
    }
    if (centers.length < 2) continue

    const base = positions.length / 3
    const halfWidth = radius * river.width * (.46 + climate.rain * .18)
    const distanceAlong = [0]
    for (let index = 1; index < centers.length; index += 1) distanceAlong.push(distanceAlong[index - 1] + centers[index].distanceTo(centers[index - 1]))
    const totalLength = Math.max(.0001, distanceAlong.at(-1) ?? 0)
    for (let index = 0; index < centers.length; index += 1) {
      const center = centers[index]
      const normal = center.clone().normalize()
      const before = centers[Math.max(0, index - 1)]
      const after = centers[Math.min(centers.length - 1, index + 1)]
      const tangent = after.clone().sub(before).normalize()
      const side = tangent.cross(normal).normalize()
      const taper = Math.min(1, index / 3, (centers.length - 1 - index) / 3)
      const width = halfWidth * Math.max(.22, taper)
      const left = center.clone().addScaledVector(side, width)
      const right = center.clone().addScaledVector(side, -width)
      positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
      const along = distanceAlong[index] / totalLength
      uvs.push(0, along, 1, along)
      if (index > 0) {
        const row = base + index * 2
        indices.push(row - 2, row - 1, row, row - 1, row + 1, row)
      }
    }
  }

  if (!positions.length) return undefined
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function RiverSystem({ planet, radius, profile, climate }: { planet: Planet; radius: number; profile: PlanetVisualProfile; climate: ReturnType<typeof derivePlanetClimate> }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const seaLevel = climate.seaLevel
  const geometry = useMemo(() => createRiverGeometry(planet, radius, seaLevel, climate), [climate, planet.id, planet.visualSeed, radius, seaLevel])
  const shader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: .55 + profile.wind * .9 },
      uColor: { value: new THREE.Color('#348ed2').lerp(new THREE.Color(profile.palette.atmosphere), .1) },
      uPlanetRevealOpacity: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uSpeed; uniform vec3 uColor; uniform float uPlanetRevealOpacity;
      void main(){
        float bank=smoothstep(0.0,.2,vUv.x)*(1.0-smoothstep(.8,1.0,vUv.x));
        float current=pow(max(0.0,sin(vUv.y*82.0-uTime*uSpeed+sin(vUv.y*13.0)*.8)),9.0);
        float ripple=pow(max(0.0,sin(vUv.y*37.0-uTime*uSpeed*.55+vUv.x*2.0)),7.0);
        vec3 color=uColor*(.62+current*.34+ripple*.12);
        gl_FragColor=vec4(color,(.19+current*.22+ripple*.08)*bank*uPlanetRevealOpacity);
      }`,
  }), [profile.palette.atmosphere, profile.wind])
  useFrame(({ clock }) => { if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime })
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return <mesh geometry={geometry} renderOrder={2}>
    <shaderMaterial ref={material} args={[shader]} transparent depthWrite={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
  </mesh>
}

function DetailedPlanet({ planet, radius, detail, warmup = false }: { planet: Planet; radius: number; detail: 'mid' | 'near'; warmup?: boolean }) {
  const profile = useMemo(() => planetVisualProfile(planet.theme, planet.mood, planet.intensity, planet.visualOverride), [planet.intensity, planet.mood, planet.theme, planet.visualOverride])
  const { textures, climate } = usePlanetTextures(planet, profile, detail)
  const geometry = useTerrainGeometry(planet, radius, detail, climate.seaLevel)
  const renderer = useThree((state) => state.gl)
  useLayoutEffect(() => {
    if (!warmup) return
    // Upload the deterministic surface maps before the incoming planet starts moving.
    // Otherwise WebGL defers both texture upload and mipmap creation until its first visible frame.
    renderer.initTexture(textures.color)
    renderer.initTexture(textures.relief)
  }, [renderer, textures, warmup])
  const waterRadius = radius * (.982 + climate.seaLevel * .03)
  return <>
    <OceanSurface radius={waterRadius} profile={profile} climate={climate} detail={detail} />
    <mesh geometry={geometry}>
      <meshStandardMaterial map={textures.color} bumpMap={textures.relief} bumpScale={detail === 'near' ? radius * 0.02 : radius * 0.011} roughness={0.84} metalness={0.04} flatShading={false} emissive={profile.palette.atmosphere} emissiveIntensity={0.06 + profile.glow * 0.11} />
    </mesh>
    {detail === 'near' && <RiverSystem planet={planet} radius={radius} profile={profile} climate={climate} />}
    <CloudLayer radius={radius} profile={profile} />
    <mesh scale={1.11 + profile.fog * .025}>
      <sphereGeometry args={[radius, 28, 18]} />
      <meshBasicMaterial color={profile.palette.atmosphere} transparent opacity={0.08 + profile.glow * 0.08 + profile.fog * 0.1} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
    {detail === 'near' && <>
      <TreeInstances radius={radius} planet={planet} climate={climate} />
      <WeatherSystem radius={radius} planet={planet} climate={climate} profile={profile} />
      {planet.doodle?.length ? <DoodleSurface planet={planet} radius={radius} seaLevel={climate.seaLevel} /> : null}
    </>}
  </>
}

function PlanetPickTarget({ radius }: { radius: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const camera = useThree((state) => state.camera)
  const viewportHeight = useThree((state) => state.size.height)
  const scratch = useMemo(() => ({ center: new THREE.Vector3(), closest: new THREE.Vector3(), offset: new THREE.Vector3(), scale: new THREE.Vector3() }), [])
  const raycast = useMemo(() => (raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) => {
    const target = ref.current
    if (!target) return
    target.updateWorldMatrix(true, false)
    target.getWorldPosition(scratch.center)
    const depth = scratch.offset.subVectors(scratch.center, raycaster.ray.origin).dot(raycaster.ray.direction)
    if (depth < raycaster.near || depth > raycaster.far) return

    raycaster.ray.at(depth, scratch.closest)
    const cameraFov = camera instanceof THREE.PerspectiveCamera ? camera.getEffectiveFOV() : 50
    target.getWorldScale(scratch.scale)
    const visibleRadius = radius * Math.max(scratch.scale.x, scratch.scale.y, scratch.scale.z)
    const pickRadius = planetPickRadiusWorld(visibleRadius, depth, cameraFov, viewportHeight)
    if (scratch.center.distanceTo(scratch.closest) > pickRadius) return

    intersections.push({ distance: depth, point: scratch.closest.clone(), object: target })
  }, [camera, radius, scratch, viewportHeight])

  return <mesh ref={ref} visible={false} raycast={raycast} name="planet-pick-target"><sphereGeometry args={[radius, 8, 6]} /></mesh>
}

function PlanetBillboards({ planet, selectedBillboardId, onBillboardClick, cameraToPlanet: cameraDirection }: { planet: Planet; selectedBillboardId?: string; onBillboardClick: (planet: Planet, billboardId: string) => void; cameraToPlanet?: THREE.Vector3 }) {
  const billboards = useMemo(() => planetBillboards(planet), [planet])
  const climate = useMemo(() => derivePlanetClimate(planet.id, planet.mood, planet.intensity, planet.weatherHistory), [planet.id, planet.mood, planet.intensity, planet.weatherHistory])
  const cameraToPlanet = useMemo(() => cameraDirection?.clone() ?? new THREE.Vector3(...planet.position).negate().normalize(), [cameraDirection, planet.position])
  const signs = useMemo(() => placeBillboards(cameraToPlanet, billboards, planetAppearanceSeed(planet), PLANET_RADIUS, climate.seaLevel), [billboards, cameraToPlanet, climate.seaLevel, planet])
  return <>{signs.map((sign) => <BillboardSign key={sign.billboard.id} {...sign}
    selected={selectedBillboardId === sign.billboard.id}
    accent={themeById(planet.theme).color}
    onSelect={(id) => onBillboardClick(planet, id)}
  />)}</>
}

type PlanetActorLayout = {
  key: string
  position: Vec3
  scale: number
  opacity: number
  growth?: boolean
}

type PlanetActorMotion = {
  from: THREE.Vector3
  to: THREE.Vector3
  fromScale: number
  toScale: number
  fromOpacity: number
  toOpacity: number
  startedAt: number
  duration: number
  growth: boolean
}

function PlanetActor({ planet, detail, interactive, selectedBillboardId, onBillboardClick, onClick, reducedMotion, layout }: { planet: Planet; detail: 'far' | 'mid' | 'near'; interactive: boolean; selectedBillboardId?: string; onBillboardClick: (planet: Planet, billboardId: string) => void; onClick: (planet: Planet) => void; reducedMotion?: boolean; layout?: PlanetActorLayout }) {
  const orbit = useRef<THREE.Group>(null)
  const ref = useRef<THREE.Group>(null)
  const rotationGroup = useRef<THREE.Group>(null)
  const { gl } = useThree()
  const { camera, scene } = useThree()
  const orientation = useRef(planet.owner ? storedOwnOrientation(planet.id) : new THREE.Quaternion())
  const motion = useRef<PlanetActorMotion | null>(null)
  const currentPosition = useRef(new THREE.Vector3(...planet.position))
  const currentScale = useRef(layout?.growth ? .58 : layout?.scale ?? 1)
  const currentOpacity = useRef(layout?.growth ? .28 : layout?.opacity ?? 1)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const lastLayoutKey = useRef(layout?.growth ? undefined : layout?.key)
  const baseOpacity = useRef(new WeakMap<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>())
  const fadingMaterials = useRef(false)
  const drag = useRef<{ pointerId: number; anchorLocal: THREE.Vector3; radiusLocal: number } | null>(null)
  const dragSphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(), PLANET_RADIUS), [])
  const dragWorldScale = useMemo(() => new THREE.Vector3(), [])
  const dragRootInverseRotation = useMemo(() => new THREE.Quaternion(), [])
  const dragIntersection = useMemo(() => new THREE.Vector3(), [])
  const base = planet.position
  const draggable = detail === 'near'
  useEffect(() => () => {
    if (planet.owner) saveOwnOrientation(planet.id, orientation.current)
  }, [planet.id, planet.owner])
  useEffect(() => {
    const nextLayout = layoutRef.current
    if (!nextLayout || nextLayout.key === lastLayoutKey.current) return
    lastLayoutKey.current = nextLayout.key
    const from = currentPosition.current.clone()
    const to = new THREE.Vector3(...nextLayout.position)
    const fromScale = currentScale.current
    const fromOpacity = currentOpacity.current
    const noVisualChange = from.distanceToSquared(to) < 1e-8
      && Math.abs(fromScale - nextLayout.scale) < 1e-5
      && Math.abs(fromOpacity - nextLayout.opacity) < 1e-5
    const duration = reducedMotion || noVisualChange ? 0 : nextLayout.growth ? OWN_PLANET_GROWTH_MS : 0
    motion.current = {
      from: nextLayout.growth ? to.clone() : from,
      to,
      fromScale: nextLayout.growth ? Math.min(fromScale, .58) : fromScale,
      toScale: nextLayout.scale,
      fromOpacity: nextLayout.growth ? Math.min(fromOpacity, .28) : fromOpacity,
      toOpacity: nextLayout.opacity,
      startedAt: performance.now(),
      duration,
      growth: Boolean(nextLayout.growth),
    }
    if (duration === 0) {
      currentPosition.current.copy(to)
      currentScale.current = nextLayout.scale
      currentOpacity.current = nextLayout.opacity
      motion.current = null
    }
  }, [layout?.key, reducedMotion])
  useLayoutEffect(() => {
    if (detail !== 'near' || !orbit.current) return
    void gl.compileAsync(orbit.current, camera, scene).catch(() => undefined)
  }, [camera, detail, gl, planet.id, scene])
  useEffect(() => () => {
    if (gl.domElement.style.cursor === 'grab' || gl.domElement.style.cursor === 'grabbing') gl.domElement.style.cursor = ''
  }, [gl])
  useEffect(() => {
    if (!draggable && (gl.domElement.style.cursor === 'grab' || gl.domElement.style.cursor === 'grabbing')) gl.domElement.style.cursor = ''
  }, [draggable, gl])
  const pointerDirection = (ray: THREE.Ray, radiusLocal: number) => {
    const root = ref.current
    if (!root) return null
    root.updateWorldMatrix(true, false)
    root.getWorldPosition(dragSphere.center)
    root.getWorldScale(dragWorldScale)
    const scale = Math.max(Math.abs(dragWorldScale.x), Math.abs(dragWorldScale.y), Math.abs(dragWorldScale.z))
    if (!Number.isFinite(scale) || scale <= 0) return null
    dragSphere.radius = radiusLocal * scale
    const intersection = ray.intersectSphere(dragSphere, dragIntersection)
    if (!intersection) ray.closestPointToPoint(dragSphere.center, dragIntersection)
    dragIntersection.sub(dragSphere.center).normalize()
    root.getWorldQuaternion(dragRootInverseRotation).invert()
    return dragIntersection.applyQuaternion(dragRootInverseRotation).normalize().clone()
  }
  const startDrag = (event: ThreeEvent<PointerEvent>) => {
    if (!draggable || event.button !== 0 || !event.isPrimary) return
    const root = ref.current
    if (!root) return
    root.updateWorldMatrix(true, false)
    root.getWorldPosition(dragSphere.center)
    root.getWorldScale(dragWorldScale)
    const scale = Math.max(Math.abs(dragWorldScale.x), Math.abs(dragWorldScale.y), Math.abs(dragWorldScale.z))
    if (!Number.isFinite(scale) || scale <= 0) return
    const anchorDirection = event.point.clone().sub(dragSphere.center)
    const anchorRadius = anchorDirection.length()
    const baseRadius = PLANET_RADIUS * scale
    if (anchorRadius < baseRadius * .78 || anchorRadius > baseRadius * 1.25) return
    anchorDirection.normalize()
    root.getWorldQuaternion(dragRootInverseRotation).invert()
    anchorDirection.applyQuaternion(dragRootInverseRotation).applyQuaternion(orientation.current.clone().invert()).normalize()
    event.stopPropagation()
    drag.current = { pointerId: event.pointerId, anchorLocal: anchorDirection, radiusLocal: anchorRadius / scale }
    gl.domElement.style.cursor = 'grabbing'
    const pointerTarget = event.target as unknown as { setPointerCapture: (pointerId: number) => void }
    pointerTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ThreeEvent<PointerEvent>) => {
    const activeDrag = drag.current
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const targetDirection = pointerDirection(event.ray, activeDrag.radiusLocal)
    if (!targetDirection) return
    orientation.current.copy(orientationForDragAnchor(orientation.current, activeDrag.anchorLocal, targetDirection))
    rotationGroup.current?.quaternion.copy(orientation.current)
  }
  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    if (planet.owner) saveOwnOrientation(planet.id, orientation.current)
    gl.domElement.style.cursor = 'grab'
    const pointerTarget = event.target as unknown as { hasPointerCapture: (pointerId: number) => boolean; releasePointerCapture: (pointerId: number) => void }
    if (pointerTarget.hasPointerCapture(event.pointerId)) pointerTarget.releasePointerCapture(event.pointerId)
  }
  useFrame(({ clock }, delta) => {
    if (!ref.current) return
    const currentLayout = layoutRef.current
    const activeMotion = motion.current
    if (currentLayout && orbit.current) {
      if (activeMotion) {
        const raw = activeMotion.duration <= 0 ? 1 : THREE.MathUtils.clamp((performance.now() - activeMotion.startedAt) / activeMotion.duration, 0, 1)
        const eased = raw * raw * (3 - 2 * raw)
        const nextPosition = activeMotion.from.clone().lerp(activeMotion.to, eased)
        orbit.current.position.set(0, 0, 0)
        ref.current.position.copy(nextPosition)
        const scale = THREE.MathUtils.lerp(activeMotion.fromScale, activeMotion.toScale, eased)
        ref.current.scale.setScalar(scale)
        currentOpacity.current = THREE.MathUtils.lerp(activeMotion.fromOpacity, activeMotion.toOpacity, eased)
        currentPosition.current.copy(nextPosition)
        currentScale.current = scale
        if (raw >= 1) {
          motion.current = null
          orbit.current.position.set(0, 0, 0)
          ref.current.position.set(base[0], base[1] + Math.sin(clock.elapsedTime * 0.52 + planet.orbit) * 0.026, base[2])
          ref.current.scale.setScalar(currentLayout.scale)
          currentPosition.current.set(...base)
          currentScale.current = currentLayout.scale
          currentOpacity.current = currentLayout.opacity
        }
      } else {
        orbit.current.position.set(0, 0, 0)
        ref.current.position.set(base[0], base[1] + Math.sin(clock.elapsedTime * 0.52 + planet.orbit) * 0.026, base[2])
        ref.current.scale.setScalar(currentLayout.scale)
        currentPosition.current.set(...base)
        currentScale.current = currentLayout.scale
        currentOpacity.current = currentLayout.opacity
      }
      const opacity = THREE.MathUtils.clamp(currentOpacity.current, 0, 1)
      const isFading = opacity < .9999
      if (isFading || fadingMaterials.current) {
        ref.current.traverse((object) => {
          const renderable = object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] }
          if (!renderable.material) return
          const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material]
          materials.forEach((material) => {
            const shaderReveal = (material as THREE.ShaderMaterial).uniforms?.uPlanetRevealOpacity as { value: number } | undefined
            if (shaderReveal) shaderReveal.value = opacity
            if (isFading) {
              if (!baseOpacity.current.has(material)) baseOpacity.current.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite })
              const original = baseOpacity.current.get(material)!
              if (!material.transparent) { material.transparent = true; material.needsUpdate = true }
              material.opacity = original.opacity * opacity
              material.depthWrite = opacity > .97 ? original.depthWrite : false
            } else {
              const original = baseOpacity.current.get(material)
              if (!original) return
              material.opacity = original.opacity
              material.transparent = original.transparent
              material.depthWrite = original.depthWrite
              material.needsUpdate = true
              baseOpacity.current.delete(material)
            }
          })
        })
        fadingMaterials.current = isFading
      }
      ref.current.visible = opacity > .002
    } else {
      ref.current.position.set(base[0], base[1] + Math.sin(clock.elapsedTime * 0.52 + planet.orbit) * 0.026, base[2])
      if (!draggable) ref.current.rotation.y += delta * 0.12
    }
    rotationGroup.current?.quaternion.copy(orientation.current)
  })
  return <group ref={orbit} name={`planet-orbit-${planet.id}`}>
    <group ref={ref} position={base} name={`planet-${planet.id}`} onClick={interactive ? (event) => { event.stopPropagation(); onClick(planet) } : undefined}>
      <group ref={rotationGroup} onPointerDown={draggable ? startDrag : undefined} onPointerMove={draggable ? moveDrag : undefined} onPointerUp={draggable ? endDrag : undefined} onPointerCancel={draggable ? endDrag : undefined} onLostPointerCapture={draggable ? () => { drag.current = null; if (planet.owner) saveOwnOrientation(planet.id, orientation.current); gl.domElement.style.cursor = 'grab' } : undefined} onPointerOver={draggable ? () => { if (!drag.current) gl.domElement.style.cursor = 'grab' } : undefined} onPointerOut={draggable ? () => { if (!drag.current) gl.domElement.style.cursor = '' } : undefined}>
        {detail === 'far' ? <FarPlanet planet={planet} radius={PLANET_RADIUS} /> : <DetailedPlanet planet={planet} radius={PLANET_RADIUS} detail={detail} />}
        {detail !== 'far' && <PlanetBillboards planet={planet} selectedBillboardId={selectedBillboardId} onBillboardClick={onBillboardClick} />}
        {interactive && <PlanetPickTarget radius={PLANET_RADIUS} />}
      </group>
    </group>
  </group>
}

function Galaxy({ anchor, active, planets, selectedPlanet, selectedBillboardId, view, rotationTarget, onThemeClick, onPlanetClick, onBillboardClick, reducedMotion }: {
  anchor: GalaxyAnchor
  active: boolean
  planets: Planet[]
  selectedPlanet?: Planet
  selectedBillboardId?: string
  view: SceneProps['view']
  rotationTarget: number
  onThemeClick: (theme: ThemeId) => void
  onPlanetClick: (planet: Planet, rotation: number) => void
  onBillboardClick: (planet: Planet, billboardId: string, rotation: number) => void
  reducedMotion?: boolean
}) {
  const meta = themeById(anchor.theme)
  const planeQuaternion = useMemo(
    () => galaxyPlaneQuaternion(new THREE.Vector3(...anchor.position).negate()),
    [anchor.position],
  )
  return <group position={anchor.position} name={`galaxy-${anchor.theme}`} scale={[GALAXY_DISPLAY_SCALE, GALAXY_DISPLAY_SCALE, GALAXY_DISPLAY_SCALE]}>
    {view === 'universe' && <mesh
      name={`galaxy-select-area-${anchor.theme}`}
      onClick={(event) => { event.stopPropagation(); onThemeClick(anchor.theme) }}
    >
      <sphereGeometry args={[GALAXY_SELECTION_RADIUS, 20, 14]} />
      <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
    </mesh>}
    <GalaxyPhysicalGroup
      seedKey={anchor.theme} tint={meta.color} active={active} planets={planets}
      selectedPlanet={selectedPlanet} selectedBillboardId={selectedBillboardId} view={view}
      rotationTarget={rotationTarget} planeQuaternion={planeQuaternion} starAppearance={{ color: meta.color }}
      onStarClick={view === 'universe' ? () => onThemeClick(anchor.theme) : undefined}
      onPlanetClick={onPlanetClick} onBillboardClick={onBillboardClick} reducedMotion={reducedMotion}
    />
  </group>
}

const BILLBOARD_PLANKS = [
  { width: .32, y: .11, angle: -.018, color: '#a87948', highlight: '#d1a56d' },
  { width: .39, y: .165, angle: .012, color: '#c18c50', highlight: '#edc27e' },
  { width: .35, y: .22, angle: -.01, color: '#95663b', highlight: '#c6935e' },
  { width: .29, y: .275, angle: .02, color: '#ce9a5c', highlight: '#f0ca8a' },
] as const

function createBillboardTexture(billboard: Billboard, accent: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 400
  const context = canvas.getContext('2d')
  if (!context) return null

  const { title, body } = billboardTextParts(billboard)
  context.beginPath()
  context.roundRect(12, 12, canvas.width - 24, canvas.height - 24, 28)
  context.fillStyle = 'rgba(6, 13, 21, .94)'
  context.fill()
  context.lineWidth = 4
  context.strokeStyle = accent
  context.globalAlpha = .82
  context.stroke()
  context.globalAlpha = 1
  context.fillStyle = accent
  context.shadowColor = accent
  context.shadowBlur = 16
  context.fillRect(38, 43, 54, 5)
  context.shadowBlur = 0
  context.font = '600 28px system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
  context.fillStyle = '#a9b8c7'
  context.fillText(title.slice(0, 24), 38, 91)
  const message = body.trim() || '留在星球上的一份心意。'
  const messageLength = Array.from(message).length
  const messageFontSize = Math.max(11, 31 - Math.max(0, messageLength - 24) * .045)
  const messageLineHeight = Math.max(19, messageFontSize * 1.42)
  const maxLines = Math.min(10, Math.max(5, Math.floor(218 / messageLineHeight) + 1))
  context.font = `500 ${messageFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  context.fillStyle = '#f1f5f8'

  const lines: string[] = []
  let line = ''
  for (const character of Array.from(message.replace(/\s*\n\s*/g, '  '))) {
    const next = line + character
    if (line && context.measureText(next).width > 550) {
      lines.push(line)
      line = character
    } else line = next
  }
  if (line) lines.push(line)
  const shownLines = lines.slice(0, maxLines)
  if (lines.length > shownLines.length) shownLines[shownLines.length - 1] = `${shownLines[shownLines.length - 1].slice(0, -1)}…`
  shownLines.forEach((text, index) => context.fillText(text, 38, 147 + index * messageLineHeight))
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function BillboardDetailCard({ billboard, accent, scale, signGroup }: { billboard: Billboard; accent: string; scale: number; signGroup: RefObject<THREE.Group | null> }) {
  const cardGroup = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const texture = useMemo(() => createBillboardTexture(billboard, accent), [accent, billboard])
  const signPosition = useMemo(() => new THREE.Vector3(), [])
  const screenPosition = useMemo(() => new THREE.Vector3(), [])
  const cameraRight = useMemo(() => new THREE.Vector3(), [])
  const cameraUp = useMemo(() => new THREE.Vector3(), [])
  const towardCamera = useMemo(() => new THREE.Vector3(), [])
  const cameraWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const cardWorldPosition = useMemo(() => new THREE.Vector3(), [])
  const cameraWorldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const signWorldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  useFrame(() => {
    const sign = signGroup.current
    const card = cardGroup.current
    if (!sign || !card) return
    sign.updateWorldMatrix(true, false)
    sign.getWorldPosition(signPosition)
    screenPosition.copy(signPosition).project(camera)
    camera.getWorldQuaternion(cameraWorldQuaternion)
    cameraRight.set(1, 0, 0).applyQuaternion(cameraWorldQuaternion)
    cameraUp.set(0, 1, 0).applyQuaternion(cameraWorldQuaternion)
    towardCamera.set(0, 0, 1).applyQuaternion(cameraWorldQuaternion)
    const side = screenPosition.x >= 0 ? -1 : 1
    cardWorldPosition.copy(signPosition)
      .addScaledVector(cameraRight, side * .33)
      .addScaledVector(cameraUp, .06)
      .addScaledVector(towardCamera, .17)
    camera.getWorldPosition(cameraWorldPosition)
    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = Math.max(.1, cameraWorldPosition.distanceTo(cardWorldPosition))
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov * .5))
      const marginX = (.48 * .5) / (distance * tangent * camera.aspect) + .04
      const marginY = (.3 * .5) / (distance * tangent) + .04
      const safeX = Math.max(.1, 1 - marginX)
      const safeY = Math.max(.1, 1 - marginY)
      screenPosition.copy(cardWorldPosition).project(camera)
      if (screenPosition.x > safeX) cardWorldPosition.addScaledVector(cameraRight, (safeX - screenPosition.x) * distance * tangent * camera.aspect)
      else if (screenPosition.x < -safeX) cardWorldPosition.addScaledVector(cameraRight, (-safeX - screenPosition.x) * distance * tangent * camera.aspect)
      if (screenPosition.y > safeY) cardWorldPosition.addScaledVector(cameraUp, (safeY - screenPosition.y) * distance * tangent)
      else if (screenPosition.y < -safeY) cardWorldPosition.addScaledVector(cameraUp, (-safeY - screenPosition.y) * distance * tangent)
    }
    card.position.copy(sign.worldToLocal(cardWorldPosition))
    sign.getWorldQuaternion(signWorldQuaternion)
    card.quaternion.copy(signWorldQuaternion.invert().multiply(cameraWorldQuaternion))
  })
  useEffect(() => () => texture?.dispose(), [texture])
  if (!texture) return null
  return <group ref={cardGroup} scale={1 / scale}>
    <mesh renderOrder={8}>
      <planeGeometry args={[.48, .3]} />
      <meshBasicMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  </group>
}

function BillboardSign({ billboard, position, quaternion, scale, selected, accent, onSelect }: {
  billboard: Billboard
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: number
  selected: boolean
  accent: string
  onSelect: (id: string) => void
}) {
  const displayScale = scale * (selected ? 1.12 : 1)
  const signGroup = useRef<THREE.Group>(null)
  return <group ref={signGroup} position={position} quaternion={quaternion} scale={displayScale} name={`billboard-${billboard.id}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelect(billboard.id) }}>
    <mesh position={[0, .11, .018]} castShadow receiveShadow>
      <cylinderGeometry args={[.019, .03, .5, 5]} />
      <meshBasicMaterial color={selected ? '#d9b77d' : '#875a32'} toneMapped={false} />
    </mesh>
    {BILLBOARD_PLANKS.map((plank) => <group key={plank.y} position={[0, plank.y, .02]} rotation={[0, 0, plank.angle]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[plank.width, .058, .04]} />
        <meshBasicMaterial color={selected ? plank.highlight : plank.color} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, .022]}>
        <dodecahedronGeometry args={[.006, 0]} />
        <meshStandardMaterial color={selected ? '#fff0c8' : '#d3ac76'} metalness={.32} roughness={.7} />
      </mesh>
    </group>)}
    <mesh position={[0, .197, .037]} castShadow receiveShadow>
      <boxGeometry args={[.284, .152, .018]} />
      <meshStandardMaterial color={selected ? '#b98553' : '#80532f'} roughness={.9} />
    </mesh>
    <mesh position={[0, .197, .052]} castShadow receiveShadow>
      <boxGeometry args={[.254, .122, .01]} />
      <meshBasicMaterial color={selected ? '#f4d5a1' : '#d0a66e'} toneMapped={false} />
    </mesh>
    {[-1, 1].flatMap((x) => [-1, 1].map((y) => <mesh key={`${x}-${y}`} position={[x * .12, .197 + y * .05, .059]}>
      <dodecahedronGeometry args={[.007, 0]} />
      <meshStandardMaterial color={selected ? '#fff0c8' : '#e1bd8b'} metalness={.24} roughness={.62} />
    </mesh>))}
    <mesh position={[0, .197, .09]}>
      <planeGeometry args={[.53, .31]} />
      <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
    </mesh>
    {selected && <BillboardDetailCard billboard={billboard} accent={accent} scale={displayScale} signGroup={signGroup} />}
  </group>
}

const OWN_ORIENTATION_KEY = 'moodverse-own-planet-orientations-v1'
const ownOrientations = new Map<string, THREE.Quaternion>()
let ownOrientationsLoaded = false

function storedOwnOrientation(id: string) {
  if (!ownOrientationsLoaded && typeof window !== 'undefined') {
    ownOrientationsLoaded = true
    try {
      const saved = JSON.parse(window.localStorage.getItem(OWN_ORIENTATION_KEY) || '{}') as Record<string, number[]>
      for (const [key, values] of Object.entries(saved)) {
        if (Array.isArray(values) && values.length === 4 && values.every(Number.isFinite)) {
          ownOrientations.set(key, new THREE.Quaternion().fromArray(values).normalize())
        }
      }
    } catch { /* Storage is optional when the browser blocks it. */ }
  }
  return ownOrientations.get(id)?.clone() ?? new THREE.Quaternion()
}

function saveOwnOrientation(id: string, quaternion: THREE.Quaternion) {
  ownOrientations.set(id, quaternion.clone())
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(OWN_ORIENTATION_KEY, JSON.stringify(Object.fromEntries(
      [...ownOrientations.entries()].map(([key, value]) => [key, value.toArray()]),
    )))
  } catch { /* A storage quota failure must not interrupt dragging. */ }
}

function PlanetEmbryo() {
  const shell = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!shell.current) return
    shell.current.rotation.y = clock.elapsedTime * .035
    shell.current.rotation.z = Math.sin(clock.elapsedTime * .4) * .035
  })
  return <group ref={shell}>
    <mesh>
      <icosahedronGeometry args={[PLANET_RADIUS, 3]} />
      <meshPhysicalMaterial color="#77b5be" emissive="#1a6673" emissiveIntensity={.38} metalness={.17} roughness={.43} transparent opacity={.24} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    <mesh scale={.87}>
      <icosahedronGeometry args={[PLANET_RADIUS, 1]} />
      <meshBasicMaterial color="#c5e5e7" transparent opacity={.075} wireframe depthWrite={false} />
    </mesh>
    <mesh scale={1.035}>
      <icosahedronGeometry args={[PLANET_RADIUS, 2]} />
      <meshBasicMaterial color="#8ee2df" transparent opacity={.2} wireframe depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    <mesh rotation={[Math.PI / 2.8, 0.14, 0.22]}>
      <torusGeometry args={[PLANET_RADIUS * 1.22, PLANET_RADIUS * .035, 4, 72]} />
      <meshBasicMaterial color="#75c9bf" transparent opacity={.34} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  </group>
}

function PersonalStar({ appearance, onClick }: { appearance: StarAppearance; onClick?: () => void }) {
  const [texture, setTexture] = useState<THREE.Texture>()
  useEffect(() => {
    if (!appearance.texture) { setTexture(undefined); return }
    let active = true
    let loaded: THREE.Texture | undefined
    loaded = new THREE.TextureLoader().load(appearance.texture, (value) => {
      value.colorSpace = THREE.SRGBColorSpace
      if (active) setTexture(value)
      else value.dispose()
    }, undefined, () => { if (active) setTexture(undefined) })
    return () => { active = false; loaded?.dispose() }
  }, [appearance.texture])
  return <group>
    <mesh onClick={onClick ? (event) => { event.stopPropagation(); onClick() } : undefined}>
      <sphereGeometry args={[.28, 32, 24]} />
      <meshStandardMaterial color={texture ? '#ffffff' : appearance.color} map={texture} emissive={texture ? '#ffffff' : appearance.color} emissiveMap={texture} emissiveIntensity={texture ? .62 : 1.28} roughness={.42} metalness={.08} toneMapped={false} />
    </mesh>
    <mesh scale={1.18}>
      <sphereGeometry args={[.28, 24, 18]} />
      <meshBasicMaterial color={appearance.color} transparent opacity={.16} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh rotation={[Math.PI / 2.5, .05, -.12]}>
      <torusGeometry args={[.43, .008, 4, 64]} />
      <meshBasicMaterial color={appearance.color} transparent opacity={.68} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
    <pointLight color={appearance.color} intensity={6} distance={6.8} decay={2} />
  </group>
}

function GalaxyEmbryoActor({ index, position, onClick }: {
  index: number
  position: Vec3
  onClick: () => void
}) {
  return <group name={`galaxy-embryo-orbit-${index}`} position={position} onClick={(event) => { event.stopPropagation(); onClick() }}>
    <PlanetEmbryo />
    <mesh>
      <sphereGeometry args={[.28, 10, 8]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  </group>
}

function GalaxyPhysicalGroup({ seedKey, tint, active, planets, selectedPlanet, selectedBillboardId, view, rotationTarget, planeQuaternion, starAppearance, onStarClick, onPlanetClick, onBillboardClick, embryoPositions = [], onEmbryoClick, reducedMotion, planetLayouts, interactive }: {
  seedKey: string
  tint: string
  active: boolean
  planets: Planet[]
  selectedPlanet?: Planet
  selectedBillboardId?: string
  view: SceneProps['view']
  rotationTarget: number
  planeQuaternion: THREE.Quaternion
  starAppearance: StarAppearance
  onStarClick?: () => void
  onPlanetClick: (planet: Planet, rotation: number) => void
  onBillboardClick: (planet: Planet, billboardId: string, rotation: number) => void
  embryoPositions?: Vec3[]
  onEmbryoClick?: (index: number) => void
  reducedMotion?: boolean
  planetLayouts?: Record<string, PlanetActorLayout>
  interactive?: boolean
}) {
  const clusterRotation = useRef<THREE.Group>(null)
  const orbitalRotation = useRef<THREE.Group>(null)
  useFrame(({ clock }, delta) => {
    if (clusterRotation.current) clusterRotation.current.rotation.y = THREE.MathUtils.damp(clusterRotation.current.rotation.y, rotationTarget, 16, delta)
    if (orbitalRotation.current) orbitalRotation.current.rotation.y = galaxyOrbitAngle(clock.elapsedTime, reducedMotion)
  })
  return <group ref={clusterRotation}>
    <group quaternion={planeQuaternion}>
      <group ref={orbitalRotation}>
        <GalaxyDust seedKey={seedKey} tint={tint} active={active} />
        <PersonalStar appearance={starAppearance} onClick={onStarClick} />
        {planets.map((planet) => {
          const selected = (view === 'planet' || view === 'self') && selectedPlanet?.id === planet.id
          const detail = selected ? 'near' : active ? 'mid' : 'far'
          return <PlanetActor key={planet.id} planet={planet} detail={detail} interactive={(interactive ?? active) && !selected}
            reducedMotion={reducedMotion}
            layout={planetLayouts?.[planet.id]}
            selectedBillboardId={selected ? selectedBillboardId : undefined}
            onBillboardClick={(item, billboardId) => onBillboardClick(item, billboardId, clusterRotation.current?.rotation.y ?? rotationTarget)}
            onClick={(item) => onPlanetClick(item, clusterRotation.current?.rotation.y ?? rotationTarget)} />
        })}
        {embryoPositions.map((position, index) => <GalaxyEmbryoActor
          key={`embryo-${index}`} index={index + planets.length} position={position}
          onClick={() => onEmbryoClick?.(index + planets.length)}
        />)}
      </group>
    </group>
  </group>
}

function OwnGalaxyDisplay({ props, motion, selfDirection }: { props: SceneProps; motion: React.MutableRefObject<MotionState>; selfDirection: Vec3 }) {
  const galaxy = useRef<THREE.Group>(null)
  const seenGrowthToken = useRef(props.ownPlanetGrowthToken ?? 0)
  const [growingPlanetId, setGrowingPlanetId] = useState<string>()
  const center = useMemo(() => toVector3(selfDirection).multiplyScalar(HOME_GALAXY_CENTER_DISTANCE), [selfDirection])
  const toCamera = useMemo(() => toVector3(selfDirection).negate().normalize(), [selfDirection])
  const orientation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toCamera), [toCamera])
  const planeQuaternion = useMemo(() => galaxyPlaneQuaternion(new THREE.Vector3(0, 0, 1)), [])
  const appearance = props.starAppearance ?? { color: '#ffd166' }
  const positionedPlanets = useMemo(() => buildOwnGalaxyPlanetAssets(props.ownPlanets), [props.ownPlanets])
  const selectedOwnPlanet = resolveSelfPlanet(props.ownPlanet, props.selectedPlanet)
  const active = props.view === 'home-galaxy' || props.view === 'self'
    || (props.view === 'universe' && advanceJourney(props.journey, 0).portalProgress > 0)
  const positions = useMemo(() => buildPlanetSlots('home-galaxy', 6, 2.2), [])
  useEffect(() => {
    const token = props.ownPlanetGrowthToken ?? 0
    if (token === seenGrowthToken.current) return
    seenGrowthToken.current = token
    const planetId = selectedOwnPlanet?.id
    if (!planetId) return
    setGrowingPlanetId(planetId)
    const timeout = window.setTimeout(() => setGrowingPlanetId((current) => current === planetId ? undefined : current), OWN_PLANET_GROWTH_MS)
    return () => window.clearTimeout(timeout)
  }, [props.ownPlanetGrowthToken, selectedOwnPlanet?.id])
  const planetLayouts = useMemo(() => Object.fromEntries(positionedPlanets.map((planet, index) => [planet.id, {
    key: growingPlanetId === planet.id ? `growth:${props.ownPlanetGrowthToken ?? 0}` : `orbit:${planet.id}`,
    position: positions[index],
    scale: 1,
    opacity: 1,
    growth: growingPlanetId === planet.id,
  }])) as Record<string, PlanetActorLayout>, [positionedPlanets, positions, growingPlanetId, props.ownPlanetGrowthToken])
  const embryoPositions = positions.slice(positionedPlanets.length)
  useFrame(() => {
    if (!galaxy.current) return
    const isStableHomeView = (props.view === 'home-galaxy' || props.view === 'self') && !props.selfReturning
    const isEnteringFromUniverse = props.view === 'universe' && motion.current.portalProgress > 0
    const isExitingHomeGalaxy = props.view === 'home-galaxy' && props.selfReturning
    const isPortalTransition = isEnteringFromUniverse || isExitingHomeGalaxy
    galaxy.current.visible = isStableHomeView || isPortalTransition
    galaxy.current.scale.setScalar(isPortalTransition ? homeGalaxyEntranceScale(motion.current.portalProgress) : 1)
  })
  const enteringFromUniverse = props.view === 'universe' && advanceJourney(props.journey, 0).portalProgress > 0
  const exitingHomeGalaxy = props.view === 'home-galaxy' && props.selfReturning
  return <group ref={galaxy} visible={props.view === 'home-galaxy' && !props.selfReturning || props.view === 'self' || enteringFromUniverse || exitingHomeGalaxy} position={center} quaternion={orientation} name="home-galaxy-assets">
    <group scale={[GALAXY_DISPLAY_SCALE, GALAXY_DISPLAY_SCALE, GALAXY_DISPLAY_SCALE]}>
      <GalaxyPhysicalGroup
        seedKey="home-galaxy" tint={appearance.color} active={active} planets={positionedPlanets}
        selectedPlanet={selectedOwnPlanet} selectedBillboardId={props.selectedBillboardId}
        view={props.view} rotationTarget={props.galaxyRotation} planeQuaternion={planeQuaternion} starAppearance={appearance} onStarClick={props.onStarClick}
        onPlanetClick={(planet, rotation) => props.onOwnPlanetClick(planet, rotation)}
        onBillboardClick={(_, billboardId) => props.onBillboardClick(billboardId)}
        embryoPositions={embryoPositions} planetLayouts={planetLayouts}
        interactive={!props.selfReturning && (props.view === 'home-galaxy' || props.view === 'self')}
        onEmbryoClick={props.onOwnEmbryoClick} reducedMotion={props.reducedMotion}
      />
    </group>
  </group>
}

function CameraDirector({ props, motion, debug, anchors, anchorByTheme, selfDirection }: { props: SceneProps; motion: React.MutableRefObject<MotionState>; debug: React.MutableRefObject<DebugSnapshot>; anchors: GalaxyAnchor[]; anchorByTheme: Partial<Record<ThemeId, GalaxyAnchor>>; selfDirection: Vec3 }) {
  const { camera, gl, size } = useThree()
  const targetCamera = useMemo(() => new THREE.PerspectiveCamera(), [])
  const targetPosition = useMemo(() => new THREE.Vector3(), [])
  const targetPoint = useMemo(() => new THREE.Vector3(), [])
  const ownGalaxyPlanets = useMemo(() => buildOwnGalaxyPlanetAssets(props.ownPlanets), [props.ownPlanets])
  const homeGalaxyCenter = useMemo(() => toVector3(selfDirection).multiplyScalar(HOME_GALAXY_CENTER_DISTANCE), [selfDirection])
  const focusedAnchor = props.focusedTheme ? anchorByTheme[props.focusedTheme] : undefined
  const focusedPlaneQuaternion = useMemo(
    () => focusedAnchor ? galaxyPlaneQuaternion(new THREE.Vector3(...focusedAnchor.position).negate()) : new THREE.Quaternion(),
    [focusedAnchor],
  )
  const homePlaneQuaternion = useMemo(() => galaxyPlaneQuaternion(new THREE.Vector3(0, 0, 1)), [])
  const homeGalaxyOrientation = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toVector3(selfDirection).negate().normalize()),
    [selfDirection],
  )
  const focusSubject = useMemo(() => new THREE.Vector3(), [])
  const projectedSubject = useMemo(() => new THREE.Vector3(), [])
  const targetScreenRight = useMemo(() => new THREE.Vector3(), [])
  const targetScreenUp = useMemo(() => new THREE.Vector3(), [])
  const arrived = useRef(false)
  const focusPlanetInDetail = (
    pose: ReturnType<typeof getPlanetFocusPose>,
    viewportFov: number,
    zoomFactor = 1,
    centerXRatio = 0.34,
    centerYRatio = 0.6,
  ) => {
    const viewportWidth = window.innerWidth || size.width
    const viewportHeight = window.innerHeight || size.height
    const canvasLeft = (viewportWidth - size.width) / 2
    const canvasTop = (viewportHeight - size.height) / 2
    const leftViewportWidth = Math.max(1, viewportWidth - Math.min(460, viewportWidth))
    const baseRadiusPx = Math.max(26, Math.min(size.height * 0.14, leftViewportWidth * 0.39))
    const desiredRadiusPx = Math.min(
      baseRadiusPx * zoomFactor,
      Math.max(26, Math.min(size.height * 0.42, leftViewportWidth * 0.43, (leftViewportWidth - 40) / 2)),
    )
    const preferredCenterX = Math.min(viewportWidth * centerXRatio, leftViewportWidth * 0.68)
    const minimumCenterX = desiredRadiusPx + 20
    const maximumCenterX = leftViewportWidth - desiredRadiusPx - 20
    const centerX = THREE.MathUtils.clamp(
      preferredCenterX,
      minimumCenterX,
      Math.max(minimumCenterX, maximumCenterX),
    )
    const screenNdcX = size.width > 0 ? 2 * ((centerX - canvasLeft) / size.width) - 1 : -0.32
    const preferredCenterY = viewportHeight * centerYRatio
    const screenNdcY = size.height > 0 ? 1 - 2 * ((preferredCenterY - canvasTop) / size.height) : -0.2
    focusSubject.set(...pose.target)
    targetPosition.set(...pose.position)
    targetScreenRight.subVectors(targetPosition, focusSubject).multiplyScalar(baseRadiusPx / desiredRadiusPx)
    targetPosition.copy(focusSubject).add(targetScreenRight)
    targetPoint.copy(focusSubject)
    targetCamera.position.copy(targetPosition)
    targetCamera.up.set(0, 1, 0)
    targetCamera.fov = viewportFov
    targetCamera.aspect = size.width / Math.max(1, size.height)
    targetCamera.updateProjectionMatrix()
    const cameraDistance = targetPosition.distanceTo(focusSubject)
    const viewScale = cameraDistance * Math.tan((viewportFov * Math.PI) / 360)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      targetCamera.lookAt(targetPoint)
      targetCamera.updateMatrixWorld(true)
      projectedSubject.copy(focusSubject).project(targetCamera)
      const errorX = screenNdcX - projectedSubject.x
      const errorY = screenNdcY - projectedSubject.y
      if (Math.abs(errorX) + Math.abs(errorY) < 0.0005) break
      targetScreenRight.set(1, 0, 0).applyQuaternion(targetCamera.quaternion)
      targetScreenUp.set(0, 1, 0).applyQuaternion(targetCamera.quaternion)
      targetPoint.addScaledVector(targetScreenRight, -errorX * viewScale * targetCamera.aspect)
      targetPoint.addScaledVector(targetScreenUp, -errorY * viewScale)
    }
  }
  useFrame(({ clock }, delta) => {
    const journeyLambda = props.reducedMotion ? 18 : props.selfReturning ? 18 : 4.8
    motion.current.journey = THREE.MathUtils.damp(motion.current.journey, props.journey, journeyLambda, delta)
    const journeyState = advanceJourney(motion.current.journey, 0)
    motion.current.tourProgress = journeyState.tourProgress
    motion.current.portalProgress = journeyState.portalProgress
    motion.current.universeOpacity = 1 - smoothstep(0.12, 0.92, journeyState.portalProgress)
    motion.current.selfBlend = smoothstep(0.28, 0.94, journeyState.portalProgress)

    let fov = 47
    if ((props.view === 'galaxy' || props.view === 'planet') && props.focusedTheme && focusedAnchor) {
      const selectedPlanet = props.view === 'planet' ? props.selectedPlanet : undefined
      const detailView = Boolean(selectedPlanet)
      fov = 50
      if (detailView) {
        const subjectRadius = PLANET_RADIUS * GALAXY_DISPLAY_SCALE
        const viewportWidth = window.innerWidth || size.width
        const leftViewportWidth = Math.max(1, viewportWidth - Math.min(460, viewportWidth))
        const desiredRadiusPx = Math.max(26, Math.min(size.height * 0.14, leftViewportWidth * 0.39))
        const focalLengthPx = size.height / (2 * Math.tan((fov * Math.PI) / 360))
        const focusDistance = subjectRadius * focalLengthPx / desiredRadiusPx
        const orbitalAngle = galaxyOrbitAngle(clock.elapsedTime, props.reducedMotion)
        const orbitingPosition = rotateGalaxyPosition(selectedPlanet!.position, orbitalAngle)
        orbitingPosition[1] += Math.sin(clock.elapsedTime * 0.52 + selectedPlanet!.orbit) * 0.026
        const planePosition = toVector3(orbitingPosition).applyQuaternion(focusedPlaneQuaternion).toArray() as Vec3
        const pose = getPlanetFocusPose(
          focusedAnchor,
          planePosition,
          subjectRadius,
          props.galaxyRotation,
          GALAXY_DISPLAY_SCALE,
          focusDistance,
        )
        focusPlanetInDetail(pose, fov)
      } else {
        const pose = getGalaxyFocusPose(focusedAnchor, GALAXY_CLUSTER_RADIUS)
        targetPosition.set(...pose.position)
        targetPoint.set(...pose.target)
      }
    } else if (props.view === 'self' && !props.selfReturning) {
      const selectedOwnerPlanet = resolveSelfPlanet(props.ownPlanet, props.selectedPlanet)
      const selectedOwnPlanet = ownGalaxyPlanets.find((planet) => planet.id === selectedOwnerPlanet?.id)
      if (selectedOwnPlanet) {
        fov = 50
        const viewportWidth = window.innerWidth || size.width
        const leftViewportWidth = Math.max(1, viewportWidth - Math.min(460, viewportWidth))
        const desiredRadiusPx = Math.max(26, Math.min(size.height * 0.14, leftViewportWidth * 0.39))
        const subjectRadius = PLANET_RADIUS * GALAXY_DISPLAY_SCALE
        const focalLengthPx = size.height / (2 * Math.tan((fov * Math.PI) / 360))
        const focusDistance = subjectRadius * focalLengthPx / desiredRadiusPx
        const orbitalAngle = galaxyOrbitAngle(clock.elapsedTime, props.reducedMotion)
        const orbitingPosition = rotateGalaxyPosition(selectedOwnPlanet.position, orbitalAngle)
        orbitingPosition[1] += Math.sin(clock.elapsedTime * 0.52 + selectedOwnPlanet.orbit) * 0.026
        const planePosition = toVector3(orbitingPosition).applyQuaternion(homePlaneQuaternion).toArray() as Vec3
        const clusterPosition = rotateGalaxyPosition(planePosition, props.galaxyRotation)
        const orientedPosition = toVector3(clusterPosition)
          .multiplyScalar(GALAXY_DISPLAY_SCALE)
          .applyQuaternion(homeGalaxyOrientation)
          .toArray() as Vec3
        const ownGalaxyAnchor: GalaxyAnchor = {
          theme: selectedOwnPlanet.theme,
          position: homeGalaxyCenter.toArray() as Vec3,
          azimuth: 0,
          elevation: 0,
        }
        const pose = getPlanetFocusPose(
          ownGalaxyAnchor,
          orientedPosition,
          subjectRadius,
          0,
          1,
          focusDistance,
        )
        focusPlanetInDetail(pose, fov, 1.8, 0.48, 0.52)
      } else {
        targetPosition.copy(homeGalaxyCenter).addScaledVector(toVector3(selfDirection), -homeGalaxyFocusDistance(size.width))
        targetPoint.copy(homeGalaxyCenter)
        fov = size.width < 560 ? 51 : 47
      }
    } else if (props.view === 'home-galaxy' && !props.selfReturning) {
      const focusDistance = homeGalaxyFocusDistance(size.width)
      targetPosition.copy(homeGalaxyCenter).addScaledVector(toVector3(selfDirection), -focusDistance)
      targetPoint.copy(homeGalaxyCenter)
      fov = size.width < 560 ? 51 : 47
    } else {
      const pose = sampleFocusedTourPose(journeyState.tourProgress, anchors)
      const compact = size.width < 560
      const travel = journeyState.portalProgress * portalTravelDistance(size.width)
      targetPosition.set(pose.direction[0] * travel, pose.direction[1] * travel, pose.direction[2] * travel)
      if (journeyState.portalProgress > 0) {
        targetPoint.copy(targetPosition).addScaledVector(toVector3(pose.direction), Math.max(2.3, 3.1 - travel))
        targetPoint.lerp(homeGalaxyCenter, smoothstep(PORTAL_CLOUD_CROSSING_PROGRESS + 0.08, 0.98, journeyState.portalProgress))
        if (compact) targetPoint.y += journeyState.portalProgress * 0.4
      }
      else targetPoint.copy(targetPosition).add(toVector3(pose.direction))
      fov = compact ? 51 : 47
    }

    const cameraLambda = props.reducedMotion ? 20 : props.selfReturning ? 11 : props.view === 'planet' ? 4.8 : 3.75
    camera.position.x = THREE.MathUtils.damp(camera.position.x, targetPosition.x, cameraLambda, delta)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, targetPosition.y, cameraLambda, delta)
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetPosition.z, cameraLambda, delta)
    targetCamera.position.copy(targetPosition)
    targetCamera.up.set(0, 1, 0)
    targetCamera.lookAt(targetPoint)
    const alpha = 1 - Math.exp(-(props.reducedMotion ? 20 : props.selfReturning ? 11 : 4.25) * delta)
    camera.quaternion.slerp(targetCamera.quaternion, alpha)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.damp(camera.fov, fov, cameraLambda, delta)
      camera.updateProjectionMatrix()
    }
    gl.toneMappingExposure = THREE.MathUtils.damp(gl.toneMappingExposure, 0.82 + motion.current.selfBlend * 0.16, 3, delta)

    if (journeyState.phase === 'self' && props.journey >= 0.999 && motion.current.journey >= 0.998 && !arrived.current) {
      arrived.current = true
      props.onArriveSelf()
    }
    if (props.journey < 0.94) arrived.current = false

    const activeCount = props.publicPlanets?.filter((planet) => planet.theme === props.focusedTheme).length ?? 0
    const selectedCount = props.view === 'planet' && props.selectedPlanet ? 1 : 0
    debug.current = {
      view: props.view, phase: journeyState.phase, journey: motion.current.journey, journeyTarget: props.journey,
      tourProgress: journeyState.tourProgress, portalProgress: journeyState.portalProgress, focusedTheme: props.focusedTheme,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : 47 },
      galaxies: anchors.map((anchor) => ({
        theme: anchor.theme, position: [...anchor.position], scale: GALAXY_DISPLAY_SCALE,
        planetCount: props.publicPlanets?.filter((planet) => planet.theme === anchor.theme).length ?? 0,
      })),
      lod: props.view === 'universe'
        ? { far: props.publicPlanets?.length ?? 0, mid: 0, near: 0 }
        : { far: (props.publicPlanets?.length ?? 0) - activeCount, mid: Math.max(0, activeCount - selectedCount), near: selectedCount },
      drawCalls: gl.info.render.calls,
    }
  })
  return null
}

function SceneContent(props: SceneProps) {
  const focusedThemes = props.focusedThemes ?? DEFAULT_FOCUSED_THEMES
  const anchors = useMemo(() => buildGalaxyAnchors(focusedThemes, 22), [focusedThemes])
  const anchorByTheme = useMemo(() => Object.fromEntries(anchors.map((anchor) => [anchor.theme, anchor])) as Partial<Record<ThemeId, GalaxyAnchor>>, [anchors])
  const selfDirection = SELF_PLANET_DIRECTION
  const motion = useRef<MotionState>({ journey: 0, tourProgress: 0, portalProgress: 0, universeOpacity: 1, selfBlend: 0 })
  const debug = useRef<DebugSnapshot>({
    view: props.view, phase: 'tour', journey: 0, journeyTarget: props.journey, tourProgress: 0, portalProgress: 0,
    camera: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], fov: 47 }, galaxies: [], lod: { far: 0, mid: 0, near: 0 }, drawCalls: 0,
  })
  useEffect(() => {
    window.__MOODVERSE_DEBUG__ = { snapshot: () => structuredClone(debug.current) }
    return () => { delete window.__MOODVERSE_DEBUG__ }
  }, [])
  const publicPlanets = props.publicPlanets ?? []
  const ownPlanet = resolveSelfPlanet(props.ownPlanet, props.selectedPlanet)
  return <>
    <color attach="background" args={["#010207"]} />
    <fog attach="fog" args={["#02040c", 18, 76]} />
    <ambientLight intensity={0.34} color="#91b8ff" />
    <hemisphereLight args={["#bfe4ff", "#1b1028", 0.62]} />
    <directionalLight position={[4, 7, 5]} intensity={1.18} color="#fff0d2" />
    <Starfield />
    <MeteorField reducedMotion={props.reducedMotion} themeId={ownPlanet?.theme} />
    <CameraDirector props={props} motion={motion} debug={debug} anchors={anchors} anchorByTheme={anchorByTheme} selfDirection={selfDirection} />
    {anchors.map((anchor) => <Galaxy
      key={anchor.theme} anchor={anchor}
      active={props.focusedTheme === anchor.theme && (props.view === 'galaxy' || props.view === 'planet')}
      rotationTarget={props.focusedTheme === anchor.theme ? props.galaxyRotation : 0}
      planets={publicPlanets.filter((planet) => planet.theme === anchor.theme)}
      selectedPlanet={props.selectedPlanet} selectedBillboardId={props.selectedBillboardId} view={props.view}
      reducedMotion={props.reducedMotion}
      onThemeClick={props.onThemeClick} onPlanetClick={props.onPlanetClick} onBillboardClick={props.onPublicBillboardClick}
    />)}
    <OwnGalaxyDisplay props={props} motion={motion} selfDirection={selfDirection} />
    <PortalCloud motion={motion} planet={ownPlanet} selfDirection={selfDirection} />
  </>
}

export function UniverseCanvas(props: SceneProps) {
  return <Canvas
    camera={{ position: [0, 0, 0], fov: 47, near: 0.02, far: 96 }}
    dpr={[1, 1.5]}
    gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
    onPointerMissed={() => { if ((props.view === 'self' || props.view === 'planet') && props.selectedBillboardId) props.onBillboardClick(undefined) }}
    onCreated={({ gl }) => {
      gl.outputColorSpace = THREE.SRGBColorSpace
      gl.toneMapping = THREE.ACESFilmicToneMapping
      gl.toneMappingExposure = 0.82
    }}
  >
    <SceneContent {...props} />
  </Canvas>
}
