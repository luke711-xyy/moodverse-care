type DemoEnv = { DB: D1Database; MUSIC_DEMO_SOCIAL_ENABLED?: string }
const enabled = (env: DemoEnv) => env.MUSIC_DEMO_SOCIAL_ENABLED === 'true'

// Enrollment is part of the planet creation transaction, never a GET side effect.
// Keep the enrollment when a planet is deleted so recreation cannot reset the cap.
export function demoWelcomeStatements(env: DemoEnv, userId: string, planetId: string, now: string): D1PreparedStatement[] {
  if (!enabled(env)) return []
  const first = new Date(Date.parse(now) + (5 + Math.random() * 10) * 60_000).toISOString()
  const second = new Date(Date.parse(now) + (30 + Math.random() * 30) * 60_000).toISOString()
  return [
    env.DB.prepare(`INSERT OR IGNORE INTO music_demo_welcome_enrollments (user_id, planet_id, created_at)
      SELECT u.id, p.id, ?3 FROM users u JOIN music_planets p ON p.owner_user_id = u.id
      WHERE u.id = ?1 AND p.id = ?2 AND u.token_hash NOT LIKE 'demo-disabled:%'
        AND NOT EXISTS (SELECT 1 FROM music_demo_actors WHERE user_id = u.id)`
    ).bind(userId, planetId, now),
    env.DB.prepare(`INSERT OR IGNORE INTO music_demo_welcome_jobs (user_id, slot, actor_user_id, due_at, request_id)
      SELECT ?1, slot, user_id, CASE slot WHEN 1 THEN ?3 ELSE ?4 END, 'demo-welcome:' || ?1 || ':' || slot
      FROM (SELECT user_id, ROW_NUMBER() OVER (ORDER BY user_id) AS slot FROM (
        SELECT a.user_id FROM music_demo_actors a JOIN users u ON u.id = a.user_id
        JOIN music_planets p ON p.owner_user_id = a.user_id
        WHERE u.token_hash = a.identity_marker AND u.token_hash LIKE 'demo-disabled:%' AND p.visibility = 'public'
          AND a.user_id <> ?1
        ORDER BY random() LIMIT 2
      )) WHERE EXISTS (SELECT 1 FROM music_demo_welcome_enrollments WHERE user_id = ?1 AND planet_id = ?2)
        AND NOT EXISTS (SELECT 1 FROM music_demo_welcome_jobs WHERE user_id = ?1)`
    ).bind(userId, planetId, first, second),
  ]
}

export function demoGreetingStatements(env: DemoEnv, actor: string, recipient: string, requestId: string, now: string): D1PreparedStatement[] {
  if (!enabled(env)) return []
  const messageId = `demo-hello:${actor}:${recipient}`
  return [
    env.DB.prepare(`INSERT OR IGNORE INTO music_direct_messages (id, sender_user_id, recipient_user_id, content_text, created_at)
      SELECT ?3, a.user_id, ?2, a.greeting, ?4 FROM music_demo_actors a JOIN users u ON u.id = a.user_id
      JOIN users recipient ON recipient.id = ?2
      WHERE a.user_id = ?1 AND u.token_hash = a.identity_marker AND u.token_hash LIKE 'demo-disabled:%'
        AND recipient.token_hash NOT LIKE 'demo-disabled:%'
        AND NOT EXISTS (SELECT 1 FROM music_demo_greetings WHERE actor_user_id = ?1 AND recipient_user_id = ?2)
        AND EXISTS (SELECT 1 FROM music_friendships WHERE user_a_id = MIN(?1, ?2) AND user_b_id = MAX(?1, ?2))
        AND EXISTS (SELECT 1 FROM music_friend_requests WHERE id = ?5 AND status = 'accepted'
          AND ((requester_user_id = ?1 AND recipient_user_id = ?2) OR (requester_user_id = ?2 AND recipient_user_id = ?1)))
        AND NOT EXISTS (SELECT 1 FROM music_user_blocks WHERE (blocker_user_id = ?1 AND blocked_user_id = ?2) OR (blocker_user_id = ?2 AND blocked_user_id = ?1))`
    ).bind(actor, recipient, messageId, now, requestId),
    env.DB.prepare(`INSERT OR IGNORE INTO music_demo_greetings (actor_user_id, recipient_user_id, message_id, created_at)
      SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM music_direct_messages WHERE id = ?3 AND sender_user_id = ?1 AND recipient_user_id = ?2)`
    ).bind(actor, recipient, messageId, now),
  ]
}

const eligibleAcceptance = `r.status = 'pending'
  AND EXISTS (SELECT 1 FROM music_demo_actors a JOIN users u ON u.id = a.user_id
    JOIN music_planets p ON p.owner_user_id = a.user_id
    WHERE a.user_id = r.recipient_user_id AND u.token_hash = a.identity_marker AND u.token_hash LIKE 'demo-disabled:%' AND p.visibility = 'public')
  AND EXISTS (SELECT 1 FROM users WHERE id = r.requester_user_id AND token_hash NOT LIKE 'demo-disabled:%')
  AND COALESCE((SELECT allow_friend_requests FROM music_social_preferences WHERE user_id = r.recipient_user_id), 1) = 1
  AND NOT EXISTS (SELECT 1 FROM music_user_blocks WHERE (blocker_user_id = r.requester_user_id AND blocked_user_id = r.recipient_user_id)
    OR (blocker_user_id = r.recipient_user_id AND blocked_user_id = r.requester_user_id))`

export async function autoAcceptDemoRequest(env: DemoEnv, requestId: string, now = new Date().toISOString()) {
  if (!enabled(env)) return false
  const pair = await env.DB.prepare(`SELECT r.requester_user_id, r.recipient_user_id FROM music_friend_requests r
    WHERE r.id = ?1 AND ${eligibleAcceptance}`).bind(requestId).first<{ requester_user_id: string; recipient_user_id: string }>()
  if (!pair) return false
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO music_friendships (user_a_id, user_b_id, created_at)
      SELECT MIN(r.requester_user_id, r.recipient_user_id), MAX(r.requester_user_id, r.recipient_user_id), ?2
      FROM music_friend_requests r WHERE r.id = ?1 AND ${eligibleAcceptance}`).bind(requestId, now),
    env.DB.prepare(`UPDATE music_friend_requests AS r SET status = 'accepted', updated_at = ?2, responded_at = ?2
      WHERE r.id = ?1 AND ${eligibleAcceptance}
        AND EXISTS (SELECT 1 FROM music_friendships WHERE user_a_id = MIN(r.requester_user_id, r.recipient_user_id)
          AND user_b_id = MAX(r.requester_user_id, r.recipient_user_id))`).bind(requestId, now),
    env.DB.prepare(`UPDATE music_friend_requests SET status = 'accepted', updated_at = ?3, responded_at = ?3
      WHERE requester_user_id = ?1 AND recipient_user_id = ?2 AND status = 'pending'
        AND EXISTS (SELECT 1 FROM music_friend_requests WHERE id = ?4 AND status = 'accepted')`
    ).bind(pair.recipient_user_id, pair.requester_user_id, now, requestId),
    ...demoGreetingStatements(env, pair.recipient_user_id, pair.requester_user_id, requestId, now),
  ])
  return (await env.DB.prepare('SELECT status FROM music_friend_requests WHERE id = ?1').bind(requestId).first<{ status: string }>())?.status === 'accepted'
}

export async function processDemoSocialQueue(env: DemoEnv, now = new Date().toISOString()) {
  if (!enabled(env)) return { processed: 0 }
  const pending = await env.DB.prepare(`SELECT r.id FROM music_friend_requests r WHERE ${eligibleAcceptance}
    ORDER BY r.created_at, r.id LIMIT 50`).all<{ id: string }>()
  for (const row of pending.results) await autoAcceptDemoRequest(env, row.id, now)
  const jobs = await env.DB.prepare(`SELECT user_id, slot, actor_user_id, request_id FROM music_demo_welcome_jobs
    WHERE status = 'queued' AND due_at <= ?1 ORDER BY due_at, user_id, slot LIMIT 100`).bind(now)
    .all<{ user_id: string; slot: number; actor_user_id: string; request_id: string }>()
  for (const job of jobs.results) {
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO music_friend_requests (id, requester_user_id, recipient_user_id, planet_id, status, created_at, updated_at)
        SELECT j.request_id, j.actor_user_id, j.user_id, p.id, 'pending', ?3, ?3
        FROM music_demo_welcome_jobs j JOIN music_demo_welcome_enrollments e ON e.user_id = j.user_id
        JOIN music_planets p ON p.id = e.planet_id AND p.owner_user_id = j.user_id
        JOIN users recipient ON recipient.id = j.user_id
        JOIN music_demo_actors a ON a.user_id = j.actor_user_id JOIN users actor ON actor.id = a.user_id
        JOIN music_planets ap ON ap.owner_user_id = a.user_id
        WHERE j.user_id = ?1 AND j.slot = ?2 AND j.status = 'queued' AND j.due_at <= ?3
          AND p.visibility = 'public' AND ap.visibility = 'public'
          AND actor.token_hash = a.identity_marker AND actor.token_hash LIKE 'demo-disabled:%' AND recipient.token_hash NOT LIKE 'demo-disabled:%'
          AND COALESCE((SELECT allow_friend_requests FROM music_social_preferences WHERE user_id = j.user_id), 1) = 1
          AND NOT EXISTS (SELECT 1 FROM music_friend_requests WHERE
            (requester_user_id = j.actor_user_id AND recipient_user_id = j.user_id) OR (requester_user_id = j.user_id AND recipient_user_id = j.actor_user_id))
          AND NOT EXISTS (SELECT 1 FROM music_friendships WHERE user_a_id = MIN(j.user_id, j.actor_user_id) AND user_b_id = MAX(j.user_id, j.actor_user_id))
          AND NOT EXISTS (SELECT 1 FROM music_user_blocks WHERE (blocker_user_id = j.user_id AND blocked_user_id = j.actor_user_id)
            OR (blocker_user_id = j.actor_user_id AND blocked_user_id = j.user_id))`
      ).bind(job.user_id, job.slot, now),
      env.DB.prepare(`UPDATE music_demo_welcome_jobs SET status = CASE WHEN EXISTS (
          SELECT 1 FROM music_friend_requests WHERE id = music_demo_welcome_jobs.request_id) THEN 'sent' ELSE 'skipped' END,
        completed_at = ?3 WHERE user_id = ?1 AND slot = ?2 AND status = 'queued'`
      ).bind(job.user_id, job.slot, now),
    ])
  }
  return { processed: pending.results.length + jobs.results.length }
}
