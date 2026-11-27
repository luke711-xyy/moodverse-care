import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { onRequestPost as manage, onRequestGet as list } from '../functions/api/me/copilot-devices'
import { onRequestPost as desktop } from '../functions/api/music/copilot-device'
import { createMusicApiFixture } from './helpers/music-api-fixture'
import type { Env } from '../functions/_shared'

test('pairing is single use and account-scoped, and revocation immediately removes match access', async () => {
  const fixture = createMusicApiFixture()
  fixture.sqlite.exec(readFileSync(new URL('../migrations-music-staging/0009_copilot_devices.sql', import.meta.url), 'utf8'))
  const env: Env = { DB: fixture.db, MUSIC_ANON_SESSION_COOKIE: 'mv_music_session' }
  const url = 'https://mosic.test'
  async function invoke(route: PagesFunction<Env>, payload?: object, cookie='', token='', origin=url) {
    const request = new Request(url,{ method:payload ? 'POST' : 'GET', headers: { Origin:origin, Cookie:cookie, Authorization:'Bearer '+token }, body:payload ? JSON.stringify(payload):undefined })
    return route({request,env} as never)
  }
  try {
    const created = await invoke(manage,{action:'create'})
    const cookie = created.headers.get('set-cookie')!.split(';')[0]
    const { code } = await created.json() as {code:string}
    expect(code).toMatch(/^([A-Z2-9]{4}-){3}[A-Z2-9]{4}$/)
    expect((await invoke(manage,{action:'create'},cookie,'','https://elsewhere.test')).status).toBe(403)
    const results = await Promise.all([invoke(desktop,{action:'pair',code}),invoke(desktop,{action:'pair',code})])
    expect(results.map(r=>r.status).sort()).toEqual([200,404])
    const {token}=await results.find(r=>r.ok)!.json() as {token:string}
    expect((await invoke(desktop,{action:'match',trackId:'x'},'',token)).status).toBe(200)
    const {devices}=await (await invoke(list,undefined,cookie)).json() as {devices:{id:string}[]}
    const other=await invoke(list)
    expect(await other.json()).toEqual({devices:[]})
    await invoke(manage,{action:'revoke',id:devices[0].id},other.headers.get('set-cookie')!.split(';')[0])
    expect((await invoke(desktop,{action:'match',trackId:'x'},'',token)).status).toBe(200)
    await invoke(manage,{action:'revoke',id:devices[0].id},cookie)
    expect((await invoke(desktop,{action:'match',trackId:'x'},'',token)).status).toBe(401)
  } finally {fixture.close()}
})
