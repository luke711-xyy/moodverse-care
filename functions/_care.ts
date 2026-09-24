import { matchCareTemplate, type CareContext } from '../care-templates'

export type CareCardRecord = {
  id: string
  user_id: string
  planet_id: string
  record_date: string
  title: string
  message: string
  action: string
  published: number
  created_at: string
  expires_at: string
}

export function makeCareCard(context: CareContext & { userId: string; planetId: string; date: string }, at = new Date()): CareCardRecord {
  const copy = matchCareTemplate(context)
  const createdAt = at.toISOString()
  return {
    id: `care_${context.planetId}_${context.date}`,
    user_id: context.userId,
    planet_id: context.planetId,
    record_date: context.date,
    ...copy,
    published: 0,
    created_at: createdAt,
    expires_at: new Date(at.getTime() + 7 * 86400000).toISOString(),
  }
}

export function careCardInsert(db: D1Database, card: CareCardRecord, refreshExisting = false) {
  return db.prepare(`INSERT INTO care_cards
    (id, user_id, planet_id, record_date, title, message, action, published, created_at, expires_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ON CONFLICT(planet_id, record_date) DO ${refreshExisting ? 'UPDATE SET' : 'NOTHING'}
    ${refreshExisting ? `
      title = excluded.title, message = excluded.message, action = excluded.action,
      published = 0, created_at = excluded.created_at, expires_at = excluded.expires_at` : ''}`)
    .bind(card.id, card.user_id, card.planet_id, card.record_date, card.title, card.message,
      card.action, card.published, card.created_at, card.expires_at)
}

export async function readCareCard(db: D1Database, planetId: string, date: string) {
  return db.prepare(`SELECT id, user_id AS userId, planet_id AS planetId, record_date AS recordDate,
    title, message, action, published, created_at AS createdAt, expires_at AS expiresAt
    FROM care_cards WHERE planet_id = ?1 AND record_date = ?2`)
    .bind(planetId, date).first<Record<string, unknown>>()
}
