import type { MusicVisualFeatures } from '../../music-domain'
export function validateMusicFeatures(value: unknown): { ok: true; value: MusicVisualFeatures } | { ok: false }
