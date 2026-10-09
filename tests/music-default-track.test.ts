import { readFileSync } from 'node:fs'
import { expect,test } from 'vitest'
import { createMusicApiFixture,insertCatalogTrack } from './helpers/music-api-fixture'
import { catalogTrack } from '../functions/_music-dither'
import { DEFAULT_AUDIO_URL,DEFAULT_TRACK_ID } from '../src/music/default-track'
test('default recording import is idempotent and preserves real users and existing demo songs', () => {
  const fixture=createMusicApiFixture()
  try {
    insertCatalogTrack(fixture.sqlite,{id:'original',title:'original',artistName:'artist'})
    fixture.sqlite.exec(`INSERT INTO users(id,token_hash,created_at,updated_at) VALUES('demo:u','demo:h','now','now'),('real:u','real:h','now','now');
      INSERT INTO music_planets(id,owner_user_id,display_name,created_at,updated_at) VALUES('demo:planet:a','demo:u','demo','now','now'),('real:p','real:u','real','now','now');
      INSERT INTO music_planet_tracks(planet_id,track_id,position,is_primary,selected_at) VALUES('demo:planet:a','original',0,1,'now'),('real:p','original',0,1,'now');`)
    const sql=readFileSync(new URL('../scripts/seed-default-music.sql',import.meta.url),'utf8')
    fixture.sqlite.exec(sql);fixture.sqlite.exec(sql)
    expect(fixture.sqlite.prepare(`SELECT count(*) AS n FROM music_planet_tracks WHERE planet_id='demo:planet:a'`).get()).toMatchObject({n:2})
    expect(fixture.sqlite.prepare(`SELECT track_id FROM music_planet_tracks WHERE planet_id='demo:planet:a' AND is_primary=1`).get()).toMatchObject({track_id:DEFAULT_TRACK_ID})
    expect(fixture.sqlite.prepare(`SELECT track_id FROM music_planet_tracks WHERE planet_id='real:p' AND is_primary=1`).get()).toMatchObject({track_id:'original'})
    const row=fixture.sqlite.prepare(`SELECT * FROM music_track_catalog WHERE id=?`).get(DEFAULT_TRACK_ID)
    expect(catalogTrack(row as any)).toMatchObject({title:'Cosmos',artistName:'The_mountain',audioUrl:DEFAULT_AUDIO_URL,visualFeatures:{tempoBpm:105.1}})
    expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {fixture.close()}
})
