import type { Env } from './_shared'

export const socialResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
})

export const isSocialRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Pages route params retain URL escapes, including ':' in demo identities. */
export function decodeSocialRouteId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const id = decodeURIComponent(value.trim())
    return !id || id.length > 128 || /[\/\\\u0000-\u001f]/.test(id) ? null : id
  } catch {
    return null
  }
}

export async function pairIsBlocked(env: Env, firstUserId: string, secondUserId: string) {
  const row = await env.DB.prepare(`
    SELECT 1 AS blocked FROM music_user_blocks
    WHERE (blocker_user_id = ?1 AND blocked_user_id = ?2)
       OR (blocker_user_id = ?2 AND blocked_user_id = ?1)
    LIMIT 1
  `).bind(firstUserId, secondUserId).first<{ blocked: number }>()
  return Boolean(row)
}

export async function pairIsFriends(env: Env, firstUserId: string, secondUserId: string) {
  const userA = firstUserId < secondUserId ? firstUserId : secondUserId
  const userB = firstUserId < secondUserId ? secondUserId : firstUserId
  const row = await env.DB.prepare(`
    SELECT 1 AS friends FROM music_friendships WHERE user_a_id = ?1 AND user_b_id = ?2
  `).bind(userA, userB).first<{ friends: number }>()
  return Boolean(row)
}

export function normalizedPair(firstUserId: string, secondUserId: string) {
  return firstUserId < secondUserId ? [firstUserId, secondUserId] as const : [secondUserId, firstUserId] as const
}
