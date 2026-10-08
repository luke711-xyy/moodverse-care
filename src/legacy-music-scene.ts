/** Archived 3D scene contract. Not reachable from the music application entry. */
import type { Planet } from './types'
import type { GalaxyAnchor } from './universe'
export type MusicGalaxySceneSystem = { id: string; key: string; label: string; color: string; anchor: GalaxyAnchor; planets: Planet[] }
