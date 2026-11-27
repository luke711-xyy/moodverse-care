import type { Env } from '../../_shared'
import { isSocialRecord, socialResponse } from '../../_music-social'
import { hashDeviceSecret } from '../me/copilot-devices'

// A paired device may resolve public planets around a track. This endpoint never accepts social writes.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const input = await request.json().catch(() => null)
  if (!isSocialRecord(input)) return socialResponse({ error: 'INVALID_REQUEST' },400)
  const now = Date.now()
  if (input.action === 'pair' && typeof input.code === 'string') {
    const code = input.code.replace(/[\s-]/g,'').toUpperCase()
    if (!/^[A-HJ-NP-Z2-9]{16}$/.test(code)) return socialResponse({ error: 'INVALID_CODE' },400)
    const token = crypto.randomUUID() + crypto.randomUUID()
    const paired = await env.DB.prepare('UPDATE music_copilot_devices SET paired_at=?, token_hash=?, code_hash=NULL, expires_at=? WHERE code_hash=? AND paired_at IS NULL AND expires_at>? RETURNING id')
      .bind(now,await hashDeviceSecret(token),now + 90 * 86400000,await hashDeviceSecret(code),now).first()
    return paired ? socialResponse({ token }) : socialResponse({ error: 'EXPIRED_CODE' },404)
  }
  const auth = request.headers.get('Authorization') ?? ''
  if (!/^Bearer [0-9a-f-]{72}$/.test(auth)) return socialResponse({ error: 'UNPAIRED' },401)
  const device = await env.DB.prepare('SELECT id,user_id FROM music_copilot_devices WHERE token_hash=? AND expires_at>?')
    .bind(await hashDeviceSecret(auth.slice(7)),now).first<{ id: string; user_id: string }>()
  if (!device) return socialResponse({ error: 'UNPAIRED' },401)
  if (input.action === 'disconnect') {
    await env.DB.prepare('DELETE FROM music_copilot_devices WHERE id=?').bind(device.id).run()
    return socialResponse({ok:true})
  }
  if (input.action !== 'match' || typeof input.trackId !== 'string' || input.trackId.length > 150) return socialResponse({error:'INVALID_TRACK'},400)
  const { results } = await env.DB.prepare(`SELECT p.id AS planetId, p.display_name AS displayName FROM music_planets p
    JOIN music_planet_tracks t ON t.planet_id=p.id JOIN music_track_catalog c ON c.id=t.track_id AND c.is_active=1
    WHERE p.visibility='public' AND p.owner_user_id<>?1 AND p.owner_user_id NOT GLOB 'demo:*' AND t.track_id=?2
    AND NOT EXISTS (SELECT 1 FROM music_demo_actors a WHERE a.user_id=p.owner_user_id)
    AND NOT EXISTS (SELECT 1 FROM music_user_blocks b WHERE (b.blocker_user_id=?1 AND b.blocked_user_id=p.owner_user_id)
      OR (b.blocker_user_id=p.owner_user_id AND b.blocked_user_id=?1)) ORDER BY p.id LIMIT 5`).bind(device.user_id,input.trackId).all()
  return socialResponse({planets:results})
}
