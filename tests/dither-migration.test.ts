import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('additive migration archives legacy JSON, cancels only appearance tasks and preserves identities/tracks', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
    db.exec(`INSERT INTO users(id,token_hash,created_at,updated_at) VALUES('owner','hash','now','now');
      INSERT INTO music_planets(id,owner_user_id,display_name,visual_schema_version,visual_json,created_at,updated_at)
        VALUES('planet','owner','旧星球',2,'{"summary":"旧视觉","seed":123}','now','now');
      INSERT INTO music_ai_tasks(id,requester_user_id,planet_id,kind,status,model_name,model_version,schema_version,input_hash,created_at,updated_at)
        VALUES('appearance','owner','planet','planet_composer','running','old','1',2,'hash','now','now'),
              ('discovery','owner','planet','discovery_embedding','queued','match','1',1,'hash','now','now');`)
    db.exec(readFileSync(new URL('../migrations-music-staging/0002_dither_appearance.sql', import.meta.url), 'utf8'))
    expect(db.prepare('SELECT id,owner_user_id,visual_json,legacy_visual_json,visual_revision FROM music_planets').get()).toEqual({ id: 'planet', owner_user_id: 'owner', visual_json: '{"summary":"旧视觉","seed":123}', legacy_visual_json: '{"summary":"旧视觉","seed":123}', visual_revision: 0 })
    expect(db.prepare('SELECT status,error_code FROM music_ai_tasks WHERE id=?').get('appearance')).toEqual({ status: 'failed', error_code: 'DITHER_SUPERSEDED' })
    expect(db.prepare('SELECT status FROM music_ai_tasks WHERE id=?').get('discovery')).toEqual({ status: 'queued' })
  } finally { db.close() }
})
