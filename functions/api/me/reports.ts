import { authenticatedMusicUser, json, type Env } from '../../_shared'
import { isSocialRecord, pairIsBlocked, socialResponse } from '../../_music-social'

const TARGET_TYPES = ['planet', 'moment', 'drift_bottle', 'drift_comment', 'direct_message'] as const
const REASONS = ['spam', 'harassment', 'inappropriate', 'privacy', 'copyright', 'other'] as const
type TargetType = typeof TARGET_TYPES[number]
type ReportReason = typeof REASONS[number]
type ReportInput = { target: { type: TargetType; id: string }; reason: ReportReason; detail: string }

function parseReport(value: unknown): ReportInput | null {
  if (!isSocialRecord(value)) return null
  const bodyKeys = Object.keys(value).sort()
  if (bodyKeys.some((key) => !['target', 'reason', 'detail'].includes(key))
    || !bodyKeys.includes('target') || !bodyKeys.includes('reason')) return null

  const target = value.target
  if (!isSocialRecord(target) || Object.keys(target).sort().join(',') !== 'id,type'
    || typeof target.id !== 'string' || !target.id.trim() || target.id.trim().length > 128
    || typeof target.type !== 'string' || !TARGET_TYPES.includes(target.type as TargetType)) return null
  if (typeof value.reason !== 'string' || !REASONS.includes(value.reason as ReportReason)) return null
  if (value.detail !== undefined && typeof value.detail !== 'string') return null
  const detail = typeof value.detail === 'string' ? value.detail.trim() : ''
  if (Array.from(detail).length > 500) return null

  return {
    target: { type: target.type as TargetType, id: target.id.trim() },
    reason: value.reason as ReportReason,
    detail,
  }
}

async function reportable(env: Env, userId: string, target: ReportInput['target']) {
  switch (target.type) {
    case 'planet': {
      const row = await env.DB.prepare(`
        SELECT owner_user_id FROM music_planets p
        WHERE p.id = ?1 AND p.visibility = 'public' AND p.owner_user_id <> ?2
      `).bind(target.id, userId).first<{ owner_user_id: string }>()
      return Boolean(row && !(await pairIsBlocked(env, userId, row.owner_user_id)))
    }
    case 'moment': {
      const row = await env.DB.prepare(`
        SELECT p.owner_user_id FROM music_moments m
        JOIN music_planets p ON p.id = m.planet_id
        WHERE m.id = ?1 AND m.visibility = 'public' AND m.published_at IS NOT NULL
          AND p.visibility = 'public' AND p.owner_user_id <> ?2
      `).bind(target.id, userId).first<{ owner_user_id: string }>()
      return Boolean(row && !(await pairIsBlocked(env, userId, row.owner_user_id)))
    }
    case 'drift_bottle': {
      const row = await env.DB.prepare(`
        SELECT b.sender_user_id FROM music_drift_bottles b
        WHERE b.id = ?1 AND b.sender_user_id <> ?2 AND (
          EXISTS (SELECT 1 FROM music_drift_deliveries d WHERE d.bottle_id = b.id AND d.recipient_user_id = ?2)
          OR EXISTS (SELECT 1 FROM music_drift_comments c WHERE c.bottle_id = b.id AND c.author_user_id = ?2)
        )
      `).bind(target.id, userId).first<{ sender_user_id: string }>()
      return Boolean(row)
    }
    case 'drift_comment': {
      const row = await env.DB.prepare(`
        SELECT c.author_user_id, b.sender_user_id FROM music_drift_comments c
        JOIN music_drift_bottles b ON b.id = c.bottle_id
        WHERE c.id = ?1 AND c.author_user_id <> ?2 AND (
          EXISTS (SELECT 1 FROM music_drift_deliveries d WHERE d.bottle_id = b.id AND d.recipient_user_id = ?2)
          OR EXISTS (SELECT 1 FROM music_drift_comments own WHERE own.bottle_id = b.id AND own.author_user_id = ?2)
        )
      `).bind(target.id, userId).first<{ author_user_id: string; sender_user_id: string }>()
      return Boolean(row)
    }
    case 'direct_message': {
      const row = await env.DB.prepare(`
        SELECT sender_user_id FROM music_direct_messages
        WHERE id = ?1 AND recipient_user_id = ?2 AND sender_user_id <> ?2
      `).bind(target.id, userId).first<{ sender_user_id: string }>()
      return Boolean(row)
    }
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return socialResponse({ error: 'UNAUTHENTICATED' }, 401)
  const input = parseReport(await json<unknown>(request))
  if (!input) return socialResponse({ error: 'INVALID_REPORT' }, 400)
  if (!(await reportable(env, identity.userId, input.target))) return socialResponse({ error: 'REPORT_TARGET_NOT_FOUND' }, 404)

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  try {
    const result = await env.DB.prepare(`
      INSERT INTO music_content_reports
        (id, reporter_user_id, target_type, target_id, reason, detail, status, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7)
      ON CONFLICT (reporter_user_id, target_type, target_id) DO NOTHING
    `).bind(id, identity.userId, input.target.type, input.target.id, input.reason, input.detail, createdAt).run()
    if (!result.meta.changes) return socialResponse({ error: 'REPORT_ALREADY_EXISTS' }, 409)
  } catch (error) {
    if (error instanceof Error && error.message.includes('MUSIC_REPORT_DAILY_LIMIT')) {
      return socialResponse({ error: 'REPORT_DAILY_LIMIT' }, 429)
    }
    return socialResponse({ error: 'REPORT_UNAVAILABLE' }, 500)
  }

  return socialResponse({ report: { id, targetType: input.target.type, reason: input.reason, status: 'open', createdAt } }, 201)
}
