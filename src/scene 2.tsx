import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { moodById, themeById, type Planet, type ThemeId } from './types'

type Orbit = { yaw: number; pitch: number }

type SceneProps = {
  view: 'universe' | 'galaxy' | 'planet' | 'self'
  focusedTheme?: ThemeId
  publicPlanets?: Planet[]
  selectedPlanet?: Planet
  portal: number
  orbit: Orbit
  onOrbit: (orbit: Orbit) => void
  onOrbitEnd: () => void
  onThemeClick: (theme: ThemeId) => void
  onPlanetClick: (planet: Planet) => void
}

const GALAXY_ANCHORS = [0, 1.08, 2.1, 3.16, 4.2, 5.25]

const seeded = (seed: number) => {
  const x = Math.sin(seed * 97.13) * 43758.5453
  return x - Math.floor(x)
}

function Starfield() {
  const geometry = useMemo(() => {
    const values = new Float32Array(1300 * 3)
    for (let i = 0; i < 1300; i += 1) {
      const radius = 6.5 + seeded(i + 4) * 5.5
      const theta = seeded(i + 32) * Math.PI * 2
      const phi = Math.acos(2 * seeded(i + 62) - 1)
      values[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      values[i * 3 + 1] = radius * Math.cos(phi) * 0.68
      values[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) - 2
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(values, 3))
    return next
  }, [])
  return <points geometry={geometry} frustumCulled={false}><pointsMaterial color="#c8e8ff" size={0.026} sizeAttenuation transparent opacity={0.72} depthWrite={false} /></points>
}

function NebulaBackdrop({ portal }: { portal: number }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  useFrame(({ clock }) => {
    if (material.current) {
      material.current.uniforms.uTime.value = clock.elapsedTime
      material.current.uniforms.uPortal.value = portal
    }
  })
  const shader = useMemo(() => ({
    uniforms: { uTime: { value: 0 }, uPortal: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uPortal;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){vec2 p=vUv-.5;float d=length(p);float n=noise(p*4.0+uTime*.08)+.5*noise(p*9.0-uTime*.05);float veil=smoothstep(.8,.08,d)*(n*.33+.16);float portalVeil=smoothstep(.05,.75,uPortal)*smoothstep(1.0,.2,uPortal);vec3 c=mix(vec3(.015,.025,.07),vec3(.06,.18,.22),n);c=mix(c,vec3(.22,.05,.28),smoothstep(.65,.1,d)*.35);gl_FragColor=vec4(c,veil*.48+portalVeil*.72);}`,
  }), [])
  return <mesh position={[0, 0, -4.8]} scale={[14, 9, 1]} renderOrder={-10}><planeGeometry args={[1, 1]} /><shaderMaterial ref={material} args={[shader]} transparent depthWrite={false} /></mesh>
}

function GalaxyDust({ theme, active }: { theme: ThemeId; active: boolean }) {
  const meta = themeById(theme)
  const geometry = useMemo(() => {
    const count = active ? 520 : 190
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const r = Math.pow(seeded(i + theme.length * 13), 1.5) * (active ? 1.48 : 1.2)
      const arm = Math.floor(seeded(i + 88) * 3)
      const a = r * 2.9 + arm * (Math.PI * 2 / 3) + seeded(i + 108) * 0.42
      positions[i * 3] = Math.cos(a) * r
      positions[i * 3 + 1] = (seeded(i + 203) - .5) * (0.32 + r * .3)
      positions[i * 3 + 2] = Math.sin(a) * r * .62
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return next
  }, [active, theme])
  const group = useRef<THREE.Points>(null)
  useFrame((_, delta) => { if (group.current) group.current.rotation.y += delta * (active ? 0.018 : 0.008) })
  return <points ref={group} geometry={geometry} rotation={[0.2, 0.1, -0.15]}><pointsMaterial color={meta.color} size={active ? 0.034 : 0.024} transparent opacity={active ? .7 : .43} depthWrite={false} blending={THREE.AdditiveBlending} /></points>
}

function PlanetMesh({ planet, onClick, active }: { planet: Planet; onClick: (planet: Planet) => void; active: boolean }) {
  const theme = themeById(planet.theme)
  const mood = moodById(planet.mood)
  const radius = active ? 0.25 : 0.16
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y += Math.sin(clock.elapsedTime * .65 + planet.orbit) * 0.00018
      ref.current.rotation.y += 0.0018
    }
  })
  return <group ref={ref} position={planet.position} onClick={(event) => { event.stopPropagation(); onClick(planet) }}>
    <mesh>
      <sphereGeometry args={[radius, active ? 24 : 14, active ? 16 : 10]} />
      <meshStandardMaterial color={theme.color} roughness={0.65} metalness={0.08} emissive={theme.glow} emissiveIntensity={0.22 + planet.intensity * .045} />
    </mesh>
    <mesh scale={1.17}>
      <sphereGeometry args={[radius, active ? 24 : 14, active ? 16 : 10]} />
      <meshBasicMaterial color={mood.id === 'anxious' ? '#ffb96b' : theme.color} transparent opacity={active ? .18 : .12} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
    {active && <mesh rotation={[Math.PI / 2.4, 0.2, 0]}>
      <torusGeometry args={[radius * 1.55, 0.008, 5, 32]} />
      <meshBasicMaterial color={theme.color} transparent opacity={.5} blending={THREE.AdditiveBlending} />
    </mesh>}
  </group>
}

function Galaxy({ theme, index, active, planets, onThemeClick, onPlanetClick }: { theme: ThemeId; index: number; active: boolean; planets: Planet[]; onThemeClick: (theme: ThemeId) => void; onPlanetClick: (planet: Planet) => void }) {
  const meta = themeById(theme)
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = Math.sin(clock.elapsedTime * .24 + index) * .035
      ref.current.rotation.z = Math.sin(clock.elapsedTime * .14 + index) * .022
    }
  })
  const angle = GALAXY_ANCHORS[index] ?? 0
  const radius = 3.35
  const position: [number, number, number] = [Math.cos(angle) * radius, Math.sin(angle) * radius * .54, -0.4 + (index % 2) * .18]
  return <group ref={ref} position={position}>
    <GalaxyDust theme={theme} active={active} />
    <mesh onClick={(event) => { event.stopPropagation(); onThemeClick(theme) }}>
      <sphereGeometry args={[active ? .34 : .23, 16, 12]} />
      <meshBasicMaterial color={meta.color} transparent opacity={active ? .75 : .58} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
    <mesh onClick={(event) => { event.stopPropagation(); onThemeClick(theme) }}>
      <sphereGeometry args={[active ? .56 : .4, 16, 12]} />
      <meshBasicMaterial color={meta.glow} transparent opacity={.12} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
    {planets.map((planet) => <PlanetMesh key={planet.id} planet={planet} active={active} onClick={onPlanetClick} />)}
  </group>
}

function SelfPlanet({ planet, portal }: { planet?: Planet; portal: number }) {
  const theme = themeById(planet?.theme ?? 'care')
  const mood = moodById(planet?.mood ?? 'calm')
  const ref = useRef<THREE.Group>(null)
  const cloudRef = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * .07
    if (cloudRef.current) cloudRef.current.rotation.y -= delta * .1
  })
  const visible = portal > .78
  return <group ref={ref} visible={visible} scale={visible ? 1 : .3}>
    <mesh>
      <sphereGeometry args={[1.18, 34, 24]} />
      <meshStandardMaterial color={theme.color} roughness={.72} metalness={.12} emissive={theme.glow} emissiveIntensity={.25 + (planet?.intensity ?? 2) * .05} />
    </mesh>
    <mesh ref={cloudRef} scale={1.02}>
      <sphereGeometry args={[1.2, 34, 24]} />
      <meshBasicMaterial color={mood.id === 'sad' ? '#9ab8df' : mood.id === 'anxious' ? '#ffd17d' : '#f5f0d7'} transparent opacity={.13 + (planet?.intensity ?? 2) * .02} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
    <mesh scale={1.12}>
      <sphereGeometry args={[1.2, 34, 24]} />
      <meshBasicMaterial color={theme.color} transparent opacity={.12} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
    <mesh rotation={[Math.PI / 2.8, .14, .22]}>
      <torusGeometry args={[1.5, .018, 6, 64]} />
      <meshBasicMaterial color={theme.color} transparent opacity={.74} blending={THREE.AdditiveBlending} />
    </mesh>
  </group>
}

function OrbitInput({ onOrbit, onOrbitEnd }: { onOrbit: (orbit: Orbit) => void; onOrbitEnd: () => void }) {
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  return <mesh position={[0, 0, -4.2]} onPointerDown={(event) => { event.stopPropagation(); drag.current = { x: event.clientX, y: event.clientY, yaw: 0, pitch: 0 } }} onPointerMove={(event) => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    drag.current.x = event.clientX
    drag.current.y = event.clientY
    drag.current.yaw += dx * .006
    drag.current.pitch += dy * .004
    onOrbit({ yaw: drag.current.yaw, pitch: drag.current.pitch })
  }} onPointerUp={() => { drag.current = null; onOrbitEnd() }} onPointerCancel={() => { drag.current = null; onOrbitEnd() }}>
    <planeGeometry args={[20, 14]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>
}

function CameraRig({ orbit, portal }: { orbit: Orbit; portal: number }) {
  const { camera } = useThree()
  const smooth = useRef(new THREE.Vector2(orbit.yaw, orbit.pitch))
  useFrame(() => {
    const targetDistance = 8.2 - portal * 3.25
    smooth.current.x = THREE.MathUtils.damp(smooth.current.x, orbit.yaw, 3.5, 1 / 60)
    smooth.current.y = THREE.MathUtils.damp(smooth.current.y, orbit.pitch, 3.5, 1 / 60)
    camera.position.set(Math.sin(smooth.current.x) * targetDistance, smooth.current.y * targetDistance * .6, Math.cos(smooth.current.x) * targetDistance)
    camera.lookAt(0, 0, 0)
  })
  return null
}

function SceneContent({ view, focusedTheme, publicPlanets = [], selectedPlanet, portal, orbit, onOrbit, onOrbitEnd, onThemeClick, onPlanetClick }: SceneProps) {
  const scene = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (scene.current && view !== 'self') scene.current.rotation.y += delta * .004
  })
  return <>
    <ambientLight intensity={.18} color="#91b8ff" />
    <pointLight position={[0, 2, 3]} intensity={1.6} distance={12} color="#fff0d2" />
    <NebulaBackdrop portal={portal} />
    <Starfield />
    <CameraRig orbit={orbit} portal={portal} />
    <group ref={scene} visible={view !== 'self'} scale={1 + portal * .18} rotation={[orbit.pitch * .2, 0, 0]}>
      {['study', 'career', 'court', 'lens', 'create', 'care'].map((theme, index) => <Galaxy key={theme} theme={theme as ThemeId} index={index} active={focusedTheme === theme} planets={publicPlanets.filter((planet) => planet.theme === theme)} onThemeClick={onThemeClick} onPlanetClick={onPlanetClick} />)}
      <OrbitInput onOrbit={onOrbit} onOrbitEnd={onOrbitEnd} />
    </group>
    <SelfPlanet planet={selectedPlanet} portal={portal} />
  </>
}

export function UniverseCanvas(props: SceneProps) {
  return <Canvas camera={{ position: [0, 0, 8.2], fov: 47, near: .1, far: 40 }} dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}>
    <SceneContent {...props} />
  </Canvas>
}

export { GALAXY_ANCHORS }
