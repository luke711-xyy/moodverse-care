import { composePilotLine, type ExchangeFacts } from './_music-copilot-intro-dialogue'
import type { Env } from './_shared'
import { catalogTrack, CATALOG_VISUAL_COLUMNS, type CatalogTrackRow } from './_music-dither'
import { isSocialRecord } from './_music-social'
import type { PublicIntroduction, SocialChannel, IntroductionCard } from '../src/music/copilot/social-types'

type SocialEnv = Pick<
  Env,
  | 'DB'
  | 'AI'
  | 'MUSIC_COPILOT_MODEL'
  | 'MUSIC_COPILOT_SOCIAL_ENABLED'
  | 'MUSIC_COPILOT_DAILY_LIMIT'
  | 'MUSIC_COPILOT_GLOBAL_DAILY_LIMIT'
>
const day = 86_400_000
const match = `CASE WHEN a.track_id=b.track_id THEN '你们的公开唱片架都有《' || a.title || '》。'
  WHEN trim(a.artist_name)<>'' AND a.artist_id=b.artist_id AND lower(a.artist_name)=lower(b.artist_name)
    THEN '你们选了同一位艺人：' || a.artist_name || '。'
  ELSE (SELECT '两首歌都收录在 ' || ag.value || ' 曲风下。'
    FROM json_each(CASE WHEN json_valid(a.genres_json) THEN a.genres_json ELSE '[]' END) ag
    JOIN json_each(CASE WHEN json_valid(b.genres_json) THEN b.genres_json ELSE '[]' END) bg
    ON lower(ag.value)=lower(bg.value) WHERE ag.type='text' AND bg.type='text' AND trim(ag.value)<>'' ORDER BY ag.key LIMIT 1)
  END`
const pair = `FROM music_copilot_public_pilots a JOIN music_copilot_public_pilots b ON a.user_id<>b.user_id`
const allowed = `NOT EXISTS (SELECT 1 FROM music_user_blocks f WHERE
  (f.blocker_user_id=a.user_id AND f.blocked_user_id=b.user_id) OR (f.blocker_user_id=b.user_id AND f.blocked_user_id=a.user_id))
  AND NOT EXISTS (SELECT 1 FROM music_copilot_social_pauses f WHERE
  (f.owner=a.user_id AND f.peer=b.user_id) OR (f.owner=b.user_id AND f.peer=a.user_id))
  AND NOT EXISTS (SELECT 1 FROM music_friendships f WHERE f.user_a_id=min(a.user_id,b.user_id) AND f.user_b_id=max(a.user_id,b.user_id))
  AND NOT EXISTS (SELECT 1 FROM music_friend_requests f WHERE f.status IN ('rejected','pending') AND
  ((f.requester_user_id=a.user_id AND f.recipient_user_id=b.user_id) OR (f.requester_user_id=b.user_id AND f.recipient_user_id=a.user_id)))`
const contact = `a.mode IN ('confirm','auto') AND b.mode IN ('confirm','auto') AND ${allowed}`
const linked = `JOIN music_copilot_introductions i ON i.sender=a.user_id AND i.recipient=b.user_id
  AND i.sender_revision=a.revision AND i.recipient_revision=b.revision`
const visible = `${contact} AND (${match}) IS NOT NULL`
const emptyProfile: PublicIntroduction = { mode: 'recommend', trackId: null, introduction: '', greeting: '' }
export const socialIntroductionsEnabled = (env: SocialEnv) => env.MUSIC_COPILOT_SOCIAL_ENABLED === 'true'

export function parseIntroductionProfile(value: unknown): PublicIntroduction | null {
  if (
    !isSocialRecord(value) ||
    Object.keys(value).length !== 4 ||
    !['recommend', 'confirm', 'auto'].includes(String(value.mode)) ||
    typeof value.introduction !== 'string' ||
    Array.from(value.introduction).length > 160 ||
    typeof value.greeting !== 'string' ||
    Array.from(value.greeting).length > 100 ||
    !(
      value.trackId === null ||
      (typeof value.trackId === 'string' && value.trackId.trim() && value.trackId.length <= 128)
    ) ||
    (value.mode !== 'recommend' && !value.trackId)
  )
    return null
  return {
    mode: value.mode as PublicIntroduction['mode'],
    trackId: value.trackId as string | null,
    introduction: value.introduction.trim(),
    greeting: value.greeting.trim(),
  }
}

export async function saveIntroductionProfile(env: SocialEnv, userId: string, profile: PublicIntroduction) {
  // Permission and current track ownership are checked inside the write, including on retries.
  const result = await env.DB.prepare(
    `INSERT INTO music_copilot_social_profiles (user_id, mode, track_id, introduction, greeting)
    SELECT ?1,?2,?3,?4,?5 WHERE (?3 IS NULL OR EXISTS (
      SELECT 1 FROM music_planets p JOIN music_planet_tracks t ON t.planet_id=p.id
      JOIN music_track_catalog c ON c.id=t.track_id AND c.is_active=1
      WHERE p.owner_user_id=?1 AND p.visibility='public' AND t.track_id=?3))
    AND (?2='recommend' OR NOT EXISTS(SELECT 1 FROM music_social_preferences f WHERE f.user_id=?1 AND f.allow_friend_requests=0))
    ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode, track_id=excluded.track_id,
    introduction=excluded.introduction,greeting=excluded.greeting,revision=revision+
    (mode<>excluded.mode OR track_id IS NOT excluded.track_id OR introduction<>excluded.introduction OR greeting<>excluded.greeting)`,
  )
    .bind(userId, profile.mode, profile.trackId, profile.introduction, profile.greeting)
    .run()
  return Boolean(result.meta.changes)
}

const cardProjection = (alias: 'a' | 'b') => `json_object('trackId',${alias}.track_id,'title',${alias}.title,
  'artist',${alias}.artist_name,'introduction',${alias}.introduction,'greeting',${alias}.greeting)`
// Comparing this allowlisted JSON again inside the final transaction also catches catalog edits
// which keep both profile revisions and track IDs unchanged.
const exchangeProjection = `json_object('common',(${match}),'sender',${cardProjection('a')},'recipient',${cardProjection('b')})`
const eligibleExchange = `${pair} ${linked} WHERE i.id=?1 AND i.status='pending' AND i.sender_ok=1 AND i.recipient_ok=1
  AND i.due_at<=?2 AND ${visible} AND NOT EXISTS (SELECT 1 FROM music_copilot_introductions used
  WHERE substr(used.delivered_at,1,10)=substr(?2,1,10) AND (used.sender=i.sender OR used.recipient=i.recipient))`

async function deliverIntroduction(env: SocialEnv, id: string, clock: () => Date) {
  const now = clock(),
    lease = crypto.randomUUID()
  const claimed = await env.DB.prepare(
    `INSERT INTO music_copilot_social_generation(introduction_id,lease_id,lease_until)
    SELECT i.id,?3,?4 ${eligibleExchange}
    ON CONFLICT(introduction_id) DO UPDATE SET lease_id=excluded.lease_id,lease_until=excluded.lease_until
    WHERE music_copilot_social_generation.lease_until<=?5`,
  )
    .bind(id, now.toISOString(), lease, +now + 60_000, +now)
    .run()
  if (!claimed.meta.changes) return 0
  const owner = `EXISTS(SELECT 1 FROM music_copilot_social_generation g WHERE g.introduction_id=i.id AND g.lease_id=?3)`
  const snapshot = () =>
    env.DB.prepare(`SELECT i.sender,i.recipient,${exchangeProjection} AS facts ${eligibleExchange} AND ${owner}`)
      .bind(id, clock().toISOString(), lease)
      .first<{ sender: string; recipient: string; facts: string }>()
  const first = await snapshot()
  if (!first) return 0
  const facts: ExchangeFacts = JSON.parse(first.facts)
  const opening = await composePilotLine(env, first.sender, facts)
  if ((await snapshot())?.facts !== first.facts) return 0
  const reply = await composePilotLine(env, first.recipient, facts, opening.text)
  const completedAt = clock().toISOString()
  const [delivered] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE OR IGNORE music_copilot_introductions SET status='delivered',delivered_at=?2,opening=?5,reply=?6
      WHERE id=?1 AND EXISTS(SELECT 1 ${eligibleExchange} AND ${owner} AND ${exchangeProjection}=?4)`,
    ).bind(id, completedAt, lease, first.facts, opening.text, reply.text),
    env.DB.prepare(
      `UPDATE music_copilot_social_generation SET opening_source=?4,reply_source=?5
      WHERE introduction_id=?1 AND lease_id=?3 AND EXISTS(SELECT 1 FROM music_copilot_introductions
      WHERE id=?1 AND status='delivered' AND delivered_at=?2)`,
    ).bind(id, completedAt, lease, opening.source, reply.source),
  ])
  return delivered.meta.changes
}

export async function processCopilotSocialQueue(env: SocialEnv, date = new Date(), limit = 12) {
  if (!socialIntroductionsEnabled(env)) return { proposed: 0, delivered: 0 }
  const now = date.toISOString(),
    today = now.slice(0, 10),
    cutoff = new Date(+date - 7 * day).toISOString()
  const due = new Date(+date + 300_000).toISOString(),
    expires = new Date(+date - 3 * day).toISOString()
  await env.DB.prepare(
    `UPDATE music_copilot_introductions SET status='closed' WHERE status='pending' AND
    (created_at<=?1 OR NOT EXISTS(SELECT 1 ${pair} WHERE a.user_id=sender AND b.user_id=recipient
      AND a.revision=sender_revision AND b.revision=recipient_revision AND ${visible}))`,
  )
    .bind(expires)
    .run()
  let delivered = 0,
    proposed = 0
  const ready = await env.DB.prepare(
    `SELECT i.id FROM music_copilot_introductions i
    LEFT JOIN music_copilot_social_generation g ON g.introduction_id=i.id
    WHERE i.status='pending' AND i.due_at<=?1 AND i.sender_ok=1 AND i.recipient_ok=1 AND (g.lease_until IS NULL OR g.lease_until<=?2)
    ORDER BY i.due_at,i.id LIMIT ?3`,
  )
    .bind(now, +date, limit)
    .all<{ id: string }>()
  const startedAt = Date.now()
  const clock = () => new Date(+date + (Date.now() - startedAt))
  for (const { id } of ready.results) delivered += await deliverIntroduction(env, id, clock)
  for (let n = 0; n < limit; n++) {
    const created = await env.DB.prepare(
      `INSERT OR IGNORE INTO music_copilot_introductions
      (id,sender,recipient,sender_revision,recipient_revision,sender_ok,recipient_ok,status,created_at,due_at)
      SELECT ?1,a.user_id,b.user_id,a.revision,b.revision,a.mode='auto',b.mode='auto','pending',?2,?3
      ${pair} WHERE ${visible}
      AND NOT EXISTS (SELECT 1 FROM music_copilot_introductions h WHERE
        (h.sender=a.user_id AND (h.status='pending' OR substr(h.created_at,1,10)=?4 OR substr(h.delivered_at,1,10)=?4))
        OR (h.recipient=b.user_id AND (h.status='pending' OR substr(h.created_at,1,10)=?4 OR substr(h.delivered_at,1,10)=?4)))
      AND NOT EXISTS (SELECT 1 FROM music_copilot_introductions h WHERE
        ((h.sender=a.user_id AND h.recipient=b.user_id) OR (h.sender=b.user_id AND h.recipient=a.user_id))
        AND (h.created_at>?5 OR h.delivered_at>?5))
      ORDER BY (a.track_id=b.track_id) DESC,(a.artist_id=b.artist_id) DESC,a.user_id,b.user_id LIMIT 1`,
    )
      .bind(crypto.randomUUID(), now, due, today, cutoff)
      .run()
    if (!created.meta.changes) break
    proposed++
  }
  return { proposed, delivered }
}

export async function actOnIntroduction(
  env: SocialEnv,
  userId: string,
  id: string,
  action: 'approve' | 'decline' | 'mute' | 'restore',
) {
  if (action === 'restore')
    return Boolean(
      (
        await env.DB.prepare('DELETE FROM music_copilot_social_pauses WHERE owner=?1 AND id=?2')
          .bind(userId, id)
          .run()
      ).meta.changes,
    )
  const canAct = `SELECT i.id ${pair} ${linked} WHERE i.id=?2 AND ?1 IN (i.sender,i.recipient) AND ${visible}`
  if (action === 'approve') {
    const updated = await env.DB.prepare(
      `UPDATE music_copilot_introductions SET sender_ok=CASE WHEN sender=?1 THEN 1 ELSE sender_ok END,
      recipient_ok=CASE WHEN recipient=?1 THEN 1 ELSE recipient_ok END WHERE status='pending' AND id IN (${canAct})`,
    )
      .bind(userId, id)
      .run()
    return Boolean(updated.meta.changes)
  }
  const [paused] = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO music_copilot_social_pauses(owner,peer,id,kind)
      SELECT ?1,CASE WHEN sender=?1 THEN recipient ELSE sender END,?3,?4 FROM music_copilot_introductions
      WHERE status IN ('pending','delivered') AND id IN (${canAct})`,
    ).bind(userId, id, crypto.randomUUID(), action),
    env.DB.prepare(
      `UPDATE music_copilot_introductions SET status='closed',opening=NULL,reply=NULL
      WHERE id=?2 AND ?1 IN (sender,recipient) AND EXISTS(SELECT 1 FROM music_copilot_social_pauses
      WHERE owner=?1 AND peer=CASE WHEN sender=?1 THEN recipient ELSE sender END)`,
    ).bind(userId, id),
  ])
  return Boolean(paused.meta.changes)
}

export async function readIntroductionChannel(env: SocialEnv, userId: string): Promise<SocialChannel> {
  const [profile, tracks, moments, suggestions, rows, pauses] = await Promise.all([
    env.DB.prepare(
      'SELECT mode,track_id AS trackId,introduction,greeting FROM music_copilot_social_profiles WHERE user_id=?1',
    )
      .bind(userId)
      .first<PublicIntroduction>(),
    env.DB.prepare(
      `SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_planets p JOIN music_planet_tracks t ON t.planet_id=p.id
      JOIN music_track_catalog c ON c.id=t.track_id AND c.is_active=1 WHERE p.owner_user_id=?1 AND p.visibility='public' ORDER BY t.position`,
    )
      .bind(userId)
      .all<CatalogTrackRow>(),
    env.DB.prepare(
      `SELECT m.id,substr(m.content_text,1,160) AS text,m.track_id AS trackId FROM music_planets p JOIN music_moments m ON m.planet_id=p.id
      WHERE p.owner_user_id=?1 AND p.visibility='public' AND m.visibility='public' AND m.published_at IS NOT NULL AND trim(m.content_text)<>''
      ORDER BY m.published_at DESC LIMIT 12`,
    )
      .bind(userId)
      .all<SocialChannel['moments'][number]>(),
    env.DB.prepare(
      `WITH own AS (
      SELECT t.* FROM music_copilot_public_shelves t LEFT JOIN music_copilot_social_profiles s ON s.user_id=t.user_id
      WHERE t.user_id=?1 AND coalesce(s.mode,'recommend')='recommend'
      ORDER BY (t.track_id IS s.track_id) DESC,t.is_primary DESC,t.position LIMIT 1
    ), matches AS (
      SELECT b.planet_id AS planetId,b.display_name AS peerName,(${match}) AS common,
        (a.track_id=b.track_id) AS same_track,(a.artist_id=b.artist_id) AS same_artist,b.position
      FROM own a JOIN music_copilot_public_shelves b ON a.user_id<>b.user_id WHERE ${allowed}
    ), ranked AS (
      SELECT *,row_number() OVER(PARTITION BY planetId ORDER BY same_track DESC,same_artist DESC,position) AS rank
      FROM matches WHERE common IS NOT NULL
    ) SELECT planetId,peerName,common FROM ranked WHERE rank=1 ORDER BY same_track DESC,same_artist DESC,planetId LIMIT 3`,
    )
      .bind(userId)
      .all<SocialChannel['suggestions'][number]>(),
    env.DB.prepare(
      `SELECT i.id,i.status,i.opening,i.reply,g.opening_source,g.reply_source,i.sender_ok,i.recipient_ok,a.user_id=?1 AS is_sender,
      a.planet_id AS from_planet,b.planet_id AS to_planet,a.display_name AS from_name,b.display_name AS to_name,
      a.track_id AS from_track,b.track_id AS to_track,(${match}) AS common
      ${pair} ${linked} LEFT JOIN music_copilot_social_generation g ON g.introduction_id=i.id WHERE ?1 IN (i.sender,i.recipient) AND i.status IN ('pending','delivered') AND ${visible}
      ORDER BY i.created_at DESC LIMIT 20`,
    )
      .bind(userId)
      .all<{
        id: string
        status: 'pending' | 'delivered'
        opening: string | null
        reply: string | null
        opening_source: 'platform' | 'rules' | null
        reply_source: 'platform' | 'rules' | null
        sender_ok: number
        recipient_ok: number
        is_sender: number
        from_planet: string
        to_planet: string
        from_name: string
        to_name: string
        from_track: string
        to_track: string
        common: string
      }>(),
    env.DB.prepare(
      `SELECT s.id,s.kind,coalesce(p.display_name,'已隐藏的星球') AS name FROM music_copilot_social_pauses s
      LEFT JOIN music_planets p ON p.owner_user_id=s.peer AND p.visibility='public' AND NOT EXISTS(
      SELECT 1 FROM music_user_blocks b WHERE (b.blocker_user_id=s.owner AND b.blocked_user_id=s.peer) OR (b.blocker_user_id=s.peer AND b.blocked_user_id=s.owner))
      WHERE s.owner=?1 ORDER BY s.rowid DESC`,
    )
      .bind(userId)
      .all<SocialChannel['pauses'][number]>(),
  ])
  const ids = [...new Set(rows.results.flatMap((r) => [r.from_track, r.to_track]))]
  const metadata = ids.length
    ? await env.DB.prepare(
        `SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c WHERE c.is_active=1 AND c.id IN (${ids.map(() => '?').join(',')})`,
      )
        .bind(...ids)
        .all<CatalogTrackRow>()
    : { results: [] }
  const byId = new Map(metadata.results.map((row) => [row.id, catalogTrack(row)]))
  const cards: IntroductionCard[] = []
  for (const r of rows.results) {
    const fromTrack = byId.get(r.from_track),
      toTrack = byId.get(r.to_track)
    if (!fromTrack || !toTrack) continue
    cards.push({
      id: r.id,
      status: r.status,
      needsApproval: r.status === 'pending' && !(r.is_sender ? r.sender_ok : r.recipient_ok),
      peerName: r.is_sender ? r.to_name : r.from_name,
      planetId: r.is_sender ? r.to_planet : r.from_planet,
      common: r.common,
      offered: r.is_sender ? fromTrack : toTrack,
      received: r.is_sender ? toTrack : fromTrack,
      messages:
        r.status === 'delivered' && r.opening && r.reply
          ? [
              { speaker: r.from_name, text: r.opening, source: r.opening_source ?? 'rules' },
              { speaker: r.to_name, text: r.reply, source: r.reply_source ?? 'rules' },
            ]
          : [],
    })
  }
  return {
    profile: profile ?? emptyProfile,
    tracks: tracks.results.map(catalogTrack),
    moments: moments.results,
    suggestions: suggestions.results,
    cards,
    pauses: pauses.results,
  }
}
