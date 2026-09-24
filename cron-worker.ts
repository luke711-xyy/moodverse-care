import { careCardInsert, makeCareCard } from './functions/_care'

type Env = { DB: D1Database }
type CheckInRow = {
  user_id: string
  planet_id: string
  record_date: string
  theme: string
  mood: string
  intensity: number
  triggers_json: string
  timezone: string | null
}

const localDate = (at: Date, timezone?: string | null) => {
  const format = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
    const value = (type: string) => parts.find((part) => part.type === type)?.value || ''
    return `${value('year')}-${value('month')}-${value('day')}`
  }
  try { return format(timezone || 'Asia/Shanghai') } catch { return format('Asia/Shanghai') }
}

async function generateMissing(env: Env) {
  const now = new Date()
  const rows = await env.DB.prepare(`SELECT p.user_id, p.id AS planet_id, e.date AS record_date,
      p.theme, e.mood, e.intensity, e.triggers_json, u.timezone
    FROM user_planets p
    JOIN users u ON u.id = p.user_id
    JOIN mood_entries e ON e.planet_id = p.id
    WHERE p.archived_at IS NULL
      AND e.created_at >= datetime('now', '-2 day')
      AND e.id = (SELECT latest.id FROM mood_entries latest
        WHERE latest.planet_id = p.id AND latest.date = e.date
        ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM care_cards c
        WHERE c.planet_id = p.id AND c.record_date = e.date)
    LIMIT 500`).all<CheckInRow>()

  let generated = 0
  for (const row of rows.results) {
    if (row.record_date !== localDate(now, row.timezone)) continue
    let triggers: string[] = []
    try {
      const parsed: unknown = JSON.parse(row.triggers_json || '[]')
      if (Array.isArray(parsed)) triggers = parsed.filter((value): value is string => typeof value === 'string').slice(0, 8)
    } catch { /* A malformed historical trigger list must not block a care card. */ }
    const card = makeCareCard({
      userId: row.user_id, planetId: row.planet_id, date: row.record_date,
      theme: row.theme, mood: row.mood, intensity: row.intensity, triggers,
    }, now)
    const result = await env.DB.batch([careCardInsert(env.DB, card)])
    generated += result[0]?.meta.changes ?? 0
  }
  return { checked: rows.results.length, generated }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env) {
    await generateMissing(env)
  },
  async fetch(request: Request) {
    if (new URL(request.url).pathname === '/health') return Response.json({ ok: true })
    return new Response('Moodverse care worker', { status: 200 })
  },
}
