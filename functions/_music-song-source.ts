import type { Env } from './_shared'

/** A public song already visible on the planet the listener is visiting. */
export async function readPublicSongSource(env: Env, planetId: string, trackId: string, viewerUserId: string) {
  return env.DB.prepare(`
    SELECT p.id AS planet_id FROM music_planets p
    WHERE p.id = ?1 AND p.visibility = 'public'
      AND EXISTS (SELECT 1 FROM music_planet_tracks t WHERE t.planet_id = p.id AND t.track_id = ?2)
      AND NOT EXISTS (
        SELECT 1 FROM music_user_blocks b
        WHERE (b.blocker_user_id = ?3 AND b.blocked_user_id = p.owner_user_id)
           OR (b.blocker_user_id = p.owner_user_id AND b.blocked_user_id = ?3)
      )
  `).bind(planetId, trackId, viewerUserId).first<{planet_id: string}>()
}
