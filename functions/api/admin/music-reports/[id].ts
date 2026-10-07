import { type Env } from '../../../_shared'
import { hasSameOrigin } from '../../../_music-email-auth'
import { socialResponse } from '../../../_music-social'
import { moderator, parseReportReview, reportDto, type ReportStatus, type ReportRow } from '../music-reports'

export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const access = await moderator(request, env)
  if ('response' in access) return access.response
  if (!hasSameOrigin(request)) return socialResponse({ error: 'ORIGIN_NOT_ALLOWED' }, 403)

  const id = String(params.id ?? '').trim()
  if (!id || id.length > 128) return socialResponse({ error: 'INVALID_REPORT_ID' }, 400)
  const input = await parseReportReview(request)
  if (!input) return socialResponse({ error: 'INVALID_REPORT_REVIEW' }, 400)

  const current = await env.DB.prepare(`
    SELECT id, target_type, target_id, reason, detail, status, created_at,
      (SELECT from_status FROM music_report_reviews WHERE report_id = music_content_reports.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_from_status,
      (SELECT to_status FROM music_report_reviews WHERE report_id = music_content_reports.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_to_status,
      (SELECT reviewer_user_id FROM music_report_reviews WHERE report_id = music_content_reports.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_reviewer_user_id,
      (SELECT created_at FROM music_report_reviews WHERE report_id = music_content_reports.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_created_at
    FROM music_content_reports WHERE id = ?1
  `).bind(id).first<ReportRow>()
  if (!current) return socialResponse({ error: 'REPORT_NOT_FOUND' }, 404)
  if (current.status === input.status) return socialResponse({ report: reportDto(current) })
  if (current.status !== 'open' && current.status !== 'reviewing') {
    return socialResponse({ error: 'REPORT_STATUS_CONFLICT' }, 409)
  }

  const reviewedAt = new Date().toISOString()
  const reviewId = crypto.randomUUID()
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE music_content_reports SET status = ?1
      WHERE id = ?2 AND status = ?3
    `).bind(input.status, id, current.status),
    env.DB.prepare(`
      INSERT INTO music_report_reviews (id, report_id, reviewer_user_id, from_status, to_status, created_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6
      WHERE changes() = 1
    `).bind(reviewId, id, access.identity.userId, current.status as Extract<ReportStatus, 'open' | 'reviewing'>, input.status, reviewedAt),
  ])
  if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) {
    return socialResponse({ error: 'REPORT_STATUS_CONFLICT' }, 409)
  }

  const updated = await env.DB.prepare(`
    SELECT id, target_type, target_id, reason, detail, status, created_at,
      ?1 AS review_from_status, ?2 AS review_to_status, ?3 AS review_reviewer_user_id, ?4 AS review_created_at
    FROM music_content_reports WHERE id = ?5
  `).bind(current.status, input.status, access.identity.userId, reviewedAt, id).first<ReportRow>()
  if (!updated) return socialResponse({ error: 'REPORT_NOT_FOUND' }, 404)
  return socialResponse({ report: reportDto(updated) })
}

export type { ReportStatus, ReportRow }
