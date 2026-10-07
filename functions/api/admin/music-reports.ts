import { authenticatedMusicUser, type Env } from '../../_shared'
import { isSocialRecord, socialResponse } from '../../_music-social'

export const statuses = ['open', 'reviewing', 'actioned', 'dismissed'] as const
export type ReportStatus = typeof statuses[number]

export type ReportRow = {
  id: string
  target_type: string
  target_id: string
  reason: string
  detail: string
  status: ReportStatus
  created_at: string
  review_from_status: string | null
  review_to_status: string | null
  review_reviewer_user_id: string | null
  review_created_at: string | null
}

const moderatorEmails = (env: Env) => new Set(
  (env.MUSIC_MODERATOR_EMAILS ?? '')
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
)

export const reportDto = (row: ReportRow) => ({
  id: row.id,
  target: { type: row.target_type, id: row.target_id },
  reason: row.reason,
  detail: row.detail,
  status: row.status,
  createdAt: row.created_at,
  lastReview: row.review_created_at ? {
    fromStatus: row.review_from_status,
    toStatus: row.review_to_status,
    reviewerUserId: row.review_reviewer_user_id,
    createdAt: row.review_created_at,
  } : null,
})

export async function moderator(request: Request, env: Env) {
  const allowed = moderatorEmails(env)
  if (!allowed.size) return { response: socialResponse({ error: 'NOT_FOUND' }, 404) } as const
  const identity = await authenticatedMusicUser(request, env)
  if (!identity) return { response: socialResponse({ error: 'UNAUTHENTICATED' }, 401) } as const
  if (!identity.email || !allowed.has(identity.email.trim().toLowerCase())) return { response: socialResponse({ error: 'NOT_FOUND' }, 404) } as const
  return { identity } as const
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const access = await moderator(request, env)
  if ('response' in access) return access.response

  const url = new URL(request.url)
  if ([...url.searchParams.keys()].some((key) => !['status', 'limit', 'offset'].includes(key))
    || url.searchParams.getAll('status').length > 1 || url.searchParams.getAll('limit').length > 1 || url.searchParams.getAll('offset').length > 1) {
    return socialResponse({ error: 'INVALID_REPORT_QUERY' }, 400)
  }
  const status = url.searchParams.get('status') ?? 'open'
  if (status !== 'all' && !statuses.includes(status as ReportStatus)) {
    return socialResponse({ error: 'INVALID_REPORT_QUERY' }, 400)
  }
  const limitValue = url.searchParams.get('limit') ?? '50'
  if (!/^\d{1,3}$/.test(limitValue)) return socialResponse({ error: 'INVALID_REPORT_QUERY' }, 400)
  const limit = Number(limitValue)
  if (limit < 1 || limit > 100) return socialResponse({ error: 'INVALID_REPORT_QUERY' }, 400)
  const offsetValue = url.searchParams.get('offset') ?? '0'
  if (!/^\d{1,7}$/.test(offsetValue)) return socialResponse({ error: 'INVALID_REPORT_QUERY' }, 400)
  const offset = Number(offsetValue)
  if (offset > 1_000_000) return socialResponse({ error: 'INVALID_REPORT_QUERY' }, 400)

  const result = status === 'all'
    ? await env.DB.prepare(`
        SELECT r.id, r.target_type, r.target_id, r.reason, r.detail, r.status, r.created_at,
          (SELECT from_status FROM music_report_reviews WHERE report_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_from_status,
          (SELECT to_status FROM music_report_reviews WHERE report_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_to_status,
          (SELECT reviewer_user_id FROM music_report_reviews WHERE report_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_reviewer_user_id,
          (SELECT created_at FROM music_report_reviews WHERE report_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_created_at
        FROM music_content_reports r
        ORDER BY r.created_at ASC, r.id ASC LIMIT ?1 OFFSET ?2
      `).bind(limit + 1, offset).all<ReportRow>()
    : await env.DB.prepare(`
        SELECT r.id, r.target_type, r.target_id, r.reason, r.detail, r.status, r.created_at,
          (SELECT from_status FROM music_report_reviews WHERE report_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_from_status,
          (SELECT to_status FROM music_report_reviews WHERE report_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_to_status,
          (SELECT reviewer_user_id FROM music_report_reviews WHERE report_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_reviewer_user_id,
          (SELECT created_at FROM music_report_reviews WHERE report_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) AS review_created_at
        FROM music_content_reports r WHERE r.status = ?1
        ORDER BY r.created_at ASC, r.id ASC LIMIT ?2 OFFSET ?3
      `).bind(status, limit + 1, offset).all<ReportRow>()

  const rows = result.results
  return socialResponse({
    reports: rows.slice(0, limit).map(reportDto),
    hasMore: rows.length > limit,
  })
}

export async function parseReportReview(request: Request): Promise<{ status: 'reviewing' | 'actioned' | 'dismissed' } | null> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 1024) return null
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 1024) {
        await reader.cancel()
        return null
      }
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!isSocialRecord(value) || Object.keys(value).length !== 1 || typeof value.status !== 'string'
      || !['reviewing', 'actioned', 'dismissed'].includes(value.status)) return null
    return { status: value.status as 'reviewing' | 'actioned' | 'dismissed' }
  } catch {
    return null
  }
}

export { moderatorEmails }
