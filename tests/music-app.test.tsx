// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MusicApp from '../src/music/MusicApp'
import { createDitherSpec } from '../src/music/dither/appearance'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function openPersonal() {
  fireEvent.click(await screen.findByRole('button', { name: '打开个人终端' }))
}
function openSettings() {
  const back = screen.queryByRole('button', { name: '返回驾驶舱' })
  if (back) fireEvent.click(back)
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
}
async function renderCockpit() {
  render(<MusicApp />)
  await waitFor(() => expect(document.querySelector('.cockpit[data-focus="overview"]') || screen.queryByRole('heading', { name: /暂时连接不上/ })).toBeTruthy())
  if (screen.queryByRole('button', { name: '打开个人终端' })) await openPersonal()
}
async function openGalaxyList() {
  if (screen.queryByRole('button', { name: '返回驾驶舱' })) fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  if (document.querySelector('.cockpit')?.getAttribute('data-exterior') !== 'galaxy') {
    fireEvent.click(screen.getByRole('button', { name: '跃迁' }))
    await waitFor(() => expect(document.querySelector('.cockpit[data-exterior="galaxy"]:not(.is-in-flight)')).toBeTruthy())
  }
  fireEvent.click(screen.getByRole('button', { name: '查看 Galaxy 星球列表' }))
}
async function openExploration(page: '漫游' | '漂流瓶') {
  if (screen.queryByRole('button', { name: '返回驾驶舱' })) fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  fireEvent.click(screen.getByRole('button', { name: page }))
}
async function confirmVisit() {
  fireEvent.click(await screen.findByRole('button', { name: '继续访问' }))
  await waitFor(() => expect(document.querySelector('.cockpit[data-exterior="visitor"]:not(.is-in-flight)')).toBeTruthy(), { onTimeout: () => new Error(JSON.stringify({ page: document.querySelector('.cockpit')?.outerHTML.slice(0,400), progress: document.querySelector('.dither-stage')?.dataset, alerts: [...document.querySelectorAll('[role=alert]')].map(e=>e.textContent) })) })
  fireEvent.click(screen.getByRole('button', { name: '打开探索终端' }))
}

const tracks = [
  { id: 'song-a', title: '夜航', artistId: 'artist-a', artistName: '星际旅人', versionLabel: '', genres: ['ambient'], moodTags: ['calm'], officialUrl: 'https://music.example/a', coverUrl: null, durationSeconds: 215 },
  { id: 'song-b', title: '潮汐之间', artistId: 'artist-b', artistName: '潮汐', versionLabel: '', genres: ['indie'], moodTags: ['reflective'], officialUrl: 'https://music.example/b', coverUrl: null, durationSeconds: 203 },
  { id: 'song-c', title: '雾灯', artistId: 'artist-c', artistName: '雨季', versionLabel: '', genres: ['dream pop'], moodTags: ['hopeful'], officialUrl: 'https://music.example/c', coverUrl: null, durationSeconds: 198 },
  { id: 'song-d', title: '远岸', artistId: 'artist-d', artistName: '远岸', versionLabel: '', genres: ['folk'], moodTags: ['warm'], officialUrl: 'https://music.example/d', coverUrl: null, durationSeconds: 180 },
  { id: 'song-e', title: '月面信号', artistId: 'artist-e', artistName: '月面', versionLabel: '', genres: ['electronic'], moodTags: ['curious'], officialUrl: 'https://music.example/e', coverUrl: null, durationSeconds: 190 },
]

test.each([0, 1])('Moment heading always has a quick publish shortcut with %i existing Moments', async (count) => {
  const owner = { id: 'moment-shortcut-owner', displayName: '夜航者', tagline: '', visibility: 'public', visualSchemaVersion: 3,
    visual: createDitherSpec({ planetId: 'moment-shortcut-owner', tracks }), tracks: tracks.slice(0, 3) }
  const moments = Array.from({ length: count }, (_, index) => ({ id: `shortcut-${index}`, trackId: 'song-a', track: tracks[0],
    contentText: '一段音乐记忆', photoUrl: null, visibility: 'public', publishedAt: '2026-10-09', createdAt: '2026-10-09', updatedAt: '2026-10-09' }))
  vi.stubGlobal('fetch', vi.fn(async (request: RequestInfo | URL) => {
    const path = new URL(String(request), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: owner })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments })
    return Response.json({ groups: [], incoming: [], outgoing: [] })
  }))
  await renderCockpit()
  const shortcut = screen.getByRole('button', { name: '发布 Moment' })
  expect(shortcut.closest('.music-section-heading')?.textContent).toContain('沿途留下的 Moment')
  if (count) {
    const row = document.querySelector('.music-moment-item')!
    expect(row.querySelector('.music-moment-song strong')?.textContent).toBe('夜航')
    expect(row.querySelector('.music-moment-song small')?.textContent).toBe('星际旅人')
  }
  fireEvent.click(shortcut)
  await screen.findByRole('heading', { name: '留下一个 Moment' })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Moment 内容' })))
  expect(document.querySelector('.cockpit')?.getAttribute('data-page')).toBe('moment')
  expect((screen.getByLabelText('这段 Moment 属于哪首歌') as HTMLSelectElement).value).toBe('song-a')
  fireEvent.click(screen.getByRole('button', { name: '发布 Moment' }))
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Moment 内容' }))
})

test('photo Moment publishing preserves the selected file on failure and clears it only after confirmation', async () => {
  const NativeURL = URL
  vi.stubGlobal('URL',class extends NativeURL {
    static createObjectURL = vi.fn(() => 'blob:moment-test')
    static revokeObjectURL = vi.fn()
  })
  const owner = { id:'photo-owner',displayName:'照片测试',tagline:'',visibility:'public',visualSchemaVersion:3,
    visual:createDitherSpec({planetId:'photo-owner',tracks}),tracks:tracks.slice(0,3) }
  let fail = true
  const submissions: FormData[] = []
  vi.stubGlobal('fetch',vi.fn(async (input:RequestInfo|URL,init?:RequestInit) => {
    const path = new URL(String(input),'https://moodverse.test').pathname
    if(path==='/api/music/catalog') return Response.json({tracks})
    if(path==='/api/me/music-planet') return Response.json({planet:owner})
    if(path==='/api/me/music-planet/moments' && init?.method==='POST') {
      submissions.push(init.body as FormData)
      if(fail) return Response.json({error:'PHOTO_STORAGE_UNAVAILABLE'},{status:503})
      return Response.json({moment:{id:'photo-saved',trackId:'song-a',track:tracks[0],contentText:'照片记忆',photoUrl:'/api/music/moment-photos/00000000-0000-4000-8000-000000000000',visibility:'public',publishedAt:'2026-10-09',createdAt:'2026-10-09',updatedAt:'2026-10-09'}})
    }
    if(path==='/api/me/music-planet/moments') return Response.json({moments:[]})
    return Response.json({groups:[],incoming:[],outgoing:[]})
  }))
  await renderCockpit()
  fireEvent.click(screen.getByRole('button',{name:'Moment'}))
  fireEvent.change(screen.getByRole('textbox',{name:'Moment 内容'}),{target:{value:'照片记忆'}})
  const file = new File(['image'],'memory.png',{type:'image/png'})
  fireEvent.change(screen.getByLabelText(/照片 · 最多/),{target:{files:[file]}})
  fireEvent.click(screen.getByRole('button',{name:/保存 Moment/}))
  await screen.findByText('照片暂时无法上传，已保留所选照片，请稍后重试。')
  expect(screen.getByAltText('待发布照片预览')).toBeTruthy()
  expect((screen.getByRole('textbox',{name:'Moment 内容'}) as HTMLTextAreaElement).value).toBe('照片记忆')
  fail = false
  fireEvent.click(screen.getByRole('button',{name:/保存 Moment/}))
  await screen.findByText('Moment 已公开。')
  expect(screen.queryByAltText('待发布照片预览')).toBeNull()
  expect(screen.getByAltText('Moment 照片')).toBeTruthy()
  const thumbnail = screen.getByRole('button',{name:'放大查看Moment 照片'})
  expect(thumbnail.closest('.music-moment-body')?.querySelector('.music-moment-copy')?.textContent).toBe('照片记忆')
  fireEvent.click(thumbnail)
  expect(screen.getByRole('dialog',{name:'照片大图'})).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('button',{name:'返回 Moment'}),{key:'Escape'})
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.querySelector('.cockpit')?.getAttribute('data-page')).toBe('moment')
  expect(submissions).toHaveLength(2)
  expect((submissions[1].get('photo') as File).name).toBe('memory.png')
})

test('jump lever switches the persistent windshield between Galaxy and home without opening a terminal', async () => {
  const owner = { id:'jump-owner', displayName:'跃迁测试', tagline:'', visibility:'public', visualSchemaVersion:3,
    visual:createDitherSpec({planetId:'jump-owner',tracks}), tracks:tracks.slice(0,3) }
  vi.stubGlobal('fetch', vi.fn(async (request:RequestInfo|URL) => {
    const path=new URL(String(request),'https://moodverse.test').pathname
    if(path==='/api/music/catalog') return Response.json({tracks})
    if(path==='/api/me/music-planet') return Response.json({planet:owner})
    if(path==='/api/me/music-planet/moments') return Response.json({moments:[]})
    if(path==='/api/music/galaxy') return Response.json({by:'genre',groups:[]})
    throw Error(path)
  }))
  render(<MusicApp />)
  const jump=await screen.findByRole('button',{name:'跃迁'})
  expect(document.querySelector('.cockpit')!.getAttribute('data-exterior')).toBe('galaxy')
  fireEvent.click(jump)
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="home"]:not(.is-in-flight)')).toBeTruthy())
  expect(document.querySelector('.cockpit')!.getAttribute('data-focus')).toBe('overview')
  expect(screen.getByRole('img',{name:'航速：0%'})).toBeTruthy()
  fireEvent.click(jump)
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="galaxy"]:not(.is-in-flight)')).toBeTruthy())
  expect(document.querySelector('.cockpit')!.getAttribute('data-focus')).toBe('overview')
})

test.each(['keyboard', 'drag', 'wheel'] as const)('Galaxy journey endpoint returns home with %s input', async (input) => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const owner = { id: 'journey-owner', displayName: '旅程的终点', tagline: '', visibility: 'public',
    visualSchemaVersion: 3, visual: createDitherSpec({ planetId: 'journey-owner', tracks }), tracks: tracks.slice(0, 3) }
  vi.stubGlobal('fetch', vi.fn(async (request: RequestInfo | URL) => {
    const path = new URL(String(request), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: owner })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/music/galaxy') return Response.json({ by: 'genre', groups: [{ key: 'ambient', label: 'ambient', planetCount: 1, planets: [] }] })
    throw Error(path)
  }))
  await renderCockpit()
  await screen.findByRole('button', { name: '编辑星球外观' })
  await openGalaxyList()
  fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  await screen.findByRole('button', { name: '前往星系 ambient' })
  const stage = screen.getByRole('region', { name: '二维音乐宇宙' })
  expect(screen.queryByRole('button', { name: '编辑星球外观' })).toBeNull()
  if (input === 'keyboard') for (let n = 0; n < 5; n++) fireEvent.keyDown(stage, { key: 'ArrowRight' })
  if (input === 'drag') {
    fireEvent.pointerDown(stage, { button: 0, clientX: 800, clientY: 300 })
    fireEvent.pointerMove(stage, { clientX: 200, clientY: 300 })
    fireEvent.pointerUp(stage, { clientX: 200, clientY: 300 })
  }
  if (input === 'wheel') for (let n = 0; n < 100; n++) fireEvent.wheel(stage, { deltaY: -10000 })
  await waitFor(() => expect(document.querySelector('.cockpit[data-exterior="home"]:not(.is-in-flight)')).toBeTruthy())
  await openPersonal()
  expect(screen.getByRole('button', { name: '编辑星球外观' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '前往星系 ambient' })).toBeNull()
})

test('appearance preview cancels locally; apply saves overrides with the confirmed revision', async () => {
  const spec = createDitherSpec({ planetId: 'editor-owner', tracks })
  let owner = { id: 'editor-owner', displayName: '参数星球', tagline: '', visibility: 'public', visualSchemaVersion: 3, appearanceRevision: 4, visual: spec, tracks: tracks.slice(0,3), createdAt: '', updatedAt: '' }
  const updates: Record<string,unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit)=> {
    const path = new URL(String(input),'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/music-planet' && init?.method === 'PATCH') { const patch=JSON.parse(String(init.body)); updates.push(patch); owner={...owner,appearanceRevision:5,visual:{...spec,overrides:patch.appearanceOverrides}}; return Response.json({ planet:owner }) }
    if (path === '/api/me/music-planet') return Response.json({ planet:owner })
    throw Error(path)
  }))
  await renderCockpit()
  fireEvent.click(await screen.findByRole('button',{name:'编辑星球外观'}))
  fireEvent.change(screen.getByLabelText('纹理'),{target:{value:'flower'}})
  fireEvent.click(screen.getByRole('button',{name:'取消'}))
  expect(updates).toHaveLength(0)
  fireEvent.click(screen.getByRole('button',{name:'编辑星球外观'}))
  fireEvent.change(screen.getByLabelText('纹理'),{target:{value:'score'}})
  fireEvent.click(screen.getByRole('button',{name:'应用外观'}))
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'星球外观'})).toBeNull())
  expect(updates).toEqual([{appearanceOverrides:{motif:'score'},appearanceRevision:4}])
})

test('a new user can choose exactly three songs, create a public planet and see deterministic 2D visuals without AI polling', async () => {
  let createdPayload: Record<string, unknown> | undefined
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet' && !init?.method) return Response.json({ planet: null })
    if (path === '/api/me/music-planet' && init?.method === 'POST') {
      createdPayload = JSON.parse(String(init.body)) as Record<string, unknown>
      return Response.json({
        planet: {
          id: 'planet-a', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public',
          visualSchemaVersion: 1, visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
          tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
        },
        compositionTask: { id: 'task-a', status: 'queued' },
      }, { status: 201 })
    }
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/music-planet/ai-tasks/task-a') return Response.json({ task: {
      id: 'task-a', kind: 'planet_composer', status: 'succeeded', model: { name: 'qwen-local', version: '4b-q4' },
      result: { schemaVersion: 1, summary: '被三首歌照亮的星球。', palette: { surface: '#8d4772', ocean: '#071529', accent: '#8edfc9' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .42 },
      errorCode: null,
    } })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.change(screen.getByLabelText('星球名称'), { target: { value: '夜航者' } })
  fireEvent.change(screen.getByLabelText('一句星球简介（可选）'), { target: { value: '慢慢靠岸' } })

  fireEvent.click(screen.getByRole('button', { name: '夜航 · 星际旅人' }))
  fireEvent.click(screen.getByRole('button', { name: '潮汐之间 · 潮汐' }))
  fireEvent.click(screen.getByRole('button', { name: '雾灯 · 雨季' }))
  expect((screen.getByRole('button', { name: '远岸 · 远岸' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '生成我的星球' }))

  expect(await screen.findByRole('heading', { name: /夜航者/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: '编辑星球外观' })).toBeTruthy()
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('ai-tasks') || String(url).endsWith('/compose'))).toBe(false)
  expect(screen.getByRole('link', { name: '夜航 · 星际旅人 · 在官方平台打开' }).getAttribute('href')).toBe('https://music.example/a')
  expect(createdPayload).toEqual({ displayName: '夜航者', tagline: '慢慢靠岸', trackIds: ['song-a', 'song-b', 'song-c'], visibility: 'public' })
})

test('clearly identifies the fictional non-playable staging catalog', async () => {
  const demoTracks = tracks.slice(0, 3).map((track) => ({ ...track, id: `demo:${track.id}`, isDemo: true, officialUrl: null }))
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks: demoTracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: null })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()

  expect(await screen.findByRole('heading', { name: '为你的星球选三首歌' })).toBeTruthy()
  expect(screen.getByRole('note').textContent).toContain('虚构示例')
  expect(screen.getAllByText(/演示曲目（不可播放）/).length).toBeGreaterThan(0)
  expect(screen.queryByRole('link', { name: /在官方平台打开/ })).toBeNull()
})

test('keeps song selection and social navigation usable with the Canvas2D visual fallback', async () => {
  vi.stubGlobal('WebGL2RenderingContext', class WebGL2RenderingContext {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: null })
    if (path === '/api/me/orbit') return Response.json({ date: '2026-10-01', groups: {
      songEncounters: [], friends: [], visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()

  expect(await screen.findByRole('heading', { name: '为你的星球选三首歌' })).toBeTruthy()
  await waitFor(()=>expect(document.querySelector('[data-dither-renderer="canvas2d"]')).toBeTruthy())
  expect(screen.getByRole('button', { name: '夜航 · 星际旅人' }).disabled).toBe(false)
  expect(screen.queryByText(/3D 星球/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Orbit' }))
  expect(await screen.findByRole('heading', { name: 'My Orbit' })).toBeTruthy()
})

test('clearly labels the automatically created anonymous account', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: null, isDemoAccount: true })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  expect(await screen.findByRole('heading', { name: '为你的星球选三首歌' })).toBeTruthy()
  openSettings()
  expect(await screen.findByRole('heading', { name: '匿名体验身份' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '退出登录' })).toBeNull()
})

test('an API 401 shows a retry state and never asks for email login', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  }))

  await renderCockpit()
  expect(await screen.findByRole('heading', { name: /暂时连接不上/ })).toBeTruthy()
  expect(screen.queryByLabelText('邮箱地址')).toBeNull()
  expect(screen.queryByRole('button', { name: '发送验证码' })).toBeNull()
  expect(screen.getByRole('button', { name: '重新连接' })).toBeTruthy()
})

test('the anonymous account can use its private Orbit without login controls', async () => {
  const privatePlanet = {
    id: 'planet-first', displayName: '第一颗星球', tagline: '', visibility: 'public', visualSchemaVersion: 1,
    visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'https://moodverse.test')
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: privatePlanet })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [],
      friends: [{ userId: 'friend-first', planetId: null, displayName: '第一位好友', tagline: '', occurredAt: '2026-09-30T09:00:00.000Z', canVisit: false }],
      visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (url.pathname === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (url.pathname === '/api/me/friends/friend-first/messages') return Response.json({ peerUserId: 'friend-first', messages: [
      { id: 'private-first', contentText: '只属于本机匿名账号的私信。', createdAt: '2026-09-30T09:30:00.000Z', readAt: null, isOwn: false },
    ] })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: /第一颗星球/ })
  fireEvent.click(screen.getByRole('button', { name: 'Orbit' }))
  fireEvent.click(await screen.findByRole('button', { name: /私信 第一位好友/ }))
  expect(await screen.findByText('只属于本机匿名账号的私信。')).toBeTruthy()
  expect(screen.getByText('匿名体验账号')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '退出登录' })).toBeNull()
})

test('an auth change from another tab clears this tab and reloads the shared session', async () => {
  vi.stubGlobal('BroadcastChannel', undefined)
  let authenticated = true
  let activeEmail = 'first@example.com'
  const planet = {
    id: 'planet-first', displayName: '第一颗星球', tagline: '', visibility: 'public', visualSchemaVersion: 1,
    visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (!authenticated) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
    if (path === '/api/me/music-planet') return Response.json({ planet: activeEmail === 'first@example.com' ? planet : null })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [],
      friends: activeEmail === 'first@example.com' ? [{ userId: 'friend-first', planetId: null, displayName: '第一位好友', tagline: '', occurredAt: '2026-09-30T09:00:00.000Z', canVisit: false }] : [],
      visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (path === '/api/me/friends/friend-first/messages') return Response.json({ peerUserId: 'friend-first', messages: [
      { id: 'private-first', contentText: '另一个标签页里缓存的私信。', createdAt: '2026-09-30T09:30:00.000Z', readAt: null, isOwn: false },
    ] })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: /第一颗星球/ })
  fireEvent.click(screen.getByRole('button', { name: 'Orbit' }))
  fireEvent.click(await screen.findByRole('button', { name: /私信 第一位好友/ }))
  expect(await screen.findByText('另一个标签页里缓存的私信。')).toBeTruthy()

  authenticated = false
  window.dispatchEvent(new StorageEvent('storage', { key: 'moodverse-music-auth-change', newValue: JSON.stringify({ type: 'session-changed', sourceId: 'other-tab', eventId: 'logout-event' }) }))
  await screen.findByRole('heading', { name: /暂时连接不上/ })
  expect(screen.queryByText('另一个标签页里缓存的私信。')).toBeNull()

  activeEmail = 'second@example.com'
  authenticated = true
  window.dispatchEvent(new StorageEvent('storage', { key: 'moodverse-music-auth-change', newValue: JSON.stringify({ type: 'session-changed', sourceId: 'other-tab', eventId: 'login-event' }) }))
  await openPersonal()
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.click(screen.getByRole('button', { name: 'Orbit' }))
  await screen.findByRole('heading', { name: 'My Orbit' })
  expect(screen.queryByText('第一位好友')).toBeNull()
  expect(screen.queryByLabelText('私信记录')).toBeNull()
})

test('legacy cross-tab session notifications deduplicate without exposing another account\'s state', async () => {
  class FakeBroadcastChannel extends EventTarget {
    static openChannels = new Set<FakeBroadcastChannel>()
    static messages: unknown[] = []
    constructor(readonly name: string) {
      super()
      FakeBroadcastChannel.openChannels.add(this)
    }
    postMessage(data: unknown) {
      FakeBroadcastChannel.messages.push(data)
      for (const channel of FakeBroadcastChannel.openChannels) {
        if (channel !== this && channel.name === this.name) channel.dispatchEvent(new MessageEvent('message', { data }))
      }
    }
    close() { FakeBroadcastChannel.openChannels.delete(this) }
    static fromOtherTab(data: unknown) {
      const sender = new FakeBroadcastChannel('moodverse-music-auth')
      sender.postMessage(data)
      sender.close()
    }
  }
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  let authenticated = true
  let activeEmail = 'first@example.com'
  let privatePlanetReads = 0
  const planet = {
    id: 'planet-first', displayName: '第一颗星球', tagline: '', visibility: 'public', visualSchemaVersion: 1,
    visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') {
      privatePlanetReads += 1
      if (!authenticated) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
      return Response.json({ planet: activeEmail === 'first@example.com' ? planet : null })
    }
    if (path === '/api/auth/logout') {
      authenticated = false
      return Response.json({ ok: true })
    }
    if (!authenticated) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [],
      friends: activeEmail === 'first@example.com' ? [{ userId: 'friend-first', planetId: null, displayName: '第一位好友', tagline: '', occurredAt: '2026-09-30T09:00:00.000Z', canVisit: false }] : [],
      visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (path === '/api/me/friends/friend-first/messages') return Response.json({ peerUserId: 'friend-first', messages: [
      { id: 'private-first', contentText: '广播通道中的旧私信。', createdAt: '2026-09-30T09:30:00.000Z', readAt: null, isOwn: false },
    ] })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: /第一颗星球/ })
  fireEvent.click(screen.getByRole('button', { name: 'Orbit' }))
  fireEvent.click(await screen.findByRole('button', { name: /私信 第一位好友/ }))
  expect(await screen.findByText('广播通道中的旧私信。')).toBeTruthy()

  authenticated = false
  const logoutEvent = { type: 'session-changed', sourceId: 'remote-tab', eventId: 'remote-logout-1' }
  // Simulate a sender whose BroadcastChannel is unavailable while this tab's is active.
  window.dispatchEvent(new StorageEvent('storage', { key: 'moodverse-music-auth-change', newValue: JSON.stringify(logoutEvent) }))
  await screen.findByRole('heading', { name: /暂时连接不上/ })
  await waitFor(() => expect(privatePlanetReads).toBe(2))
  expect(screen.queryByText('广播通道中的旧私信。')).toBeNull()

  activeEmail = 'second@example.com'
  authenticated = true
  const loginEvent = { type: 'session-changed', sourceId: 'remote-tab', eventId: 'remote-login-1' }
  FakeBroadcastChannel.fromOtherTab(loginEvent)
  window.dispatchEvent(new StorageEvent('storage', { key: 'moodverse-music-auth-change', newValue: JSON.stringify(loginEvent) }))
  await openPersonal()
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  await waitFor(() => expect(privatePlanetReads).toBe(3))

  expect(FakeBroadcastChannel.messages).toEqual([loginEvent])
  expect(screen.queryByText('广播通道中的旧私信。')).toBeNull()
})

test('an empty catalog explains that the controlled catalog must be populated before planet creation', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    return path === '/api/music/catalog' ? Response.json({ tracks: [] }) : Response.json({ planet: null })
  }))

  await renderCockpit()
  expect(await screen.findByText('曲库还没有可选歌曲')).toBeTruthy()
  expect(screen.getByText(/添加曲目后，你就可以开始创建星球/)).toBeTruthy()
})

test('settings load server privacy preferences and only show confirmed planet and Moment visibility changes', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public' as const,
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '沿着三首歌长成。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  const moment = {
    id: 'moment/a', trackId: 'song-a', track: tracks[0], contentText: '今天想起这首歌。', photoUrl: null,
    visibility: 'public' as const, publishedAt: '2026-09-29T10:00:00.000Z',
    createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
  }
  const state = {
    planet: ownerPlanet,
    moment,
    social: { allowFriendRequests: false, allowDriftBottles: true },
    failNextPlanetPatch: false,
    requests: [] as Array<{ path: string; method?: string; body?: unknown }>,
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    const path = url.pathname
    state.requests.push({ path, ...(init?.method ? { method: init.method } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet' && init?.method === 'PATCH') {
      if (state.failNextPlanetPatch) {
        state.failNextPlanetPatch = false
        return Response.json({ error: 'TEMPORARY_FAILURE' }, { status: 503 })
      }
      state.planet = { ...state.planet, visibility: (JSON.parse(String(init.body)) as { visibility: 'public' | 'private' }).visibility }
      return Response.json({ planet: state.planet })
    }
    if (path === '/api/me/music-planet') return Response.json({ planet: state.planet })
    if (path === '/api/me/music-planet/moments/moment%2Fa' && init?.method === 'PATCH') {
      state.moment = { ...state.moment, visibility: (JSON.parse(String(init.body)) as { visibility: 'public' | 'private' }).visibility }
      return Response.json({ moment: state.moment })
    }
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [state.moment] })
    if (path === '/api/me/social-settings' && init?.method === 'PATCH') {
      state.social = { ...state.social, ...JSON.parse(String(init.body)) as typeof state.social }
      return Response.json(state.social)
    }
    if (path === '/api/me/social-settings') return Response.json(state.social)
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('button', { name: '我的星球' })
  openSettings()
  await screen.findByRole('heading', { name: '账户与隐私设置' })

  const friendRequests = screen.getByRole('checkbox', { name: /接收好友请求/ }) as HTMLInputElement
  const driftBottles = screen.getByRole('checkbox', { name: /接收漂流瓶/ }) as HTMLInputElement
  const planetVisibility = screen.getByRole('checkbox', { name: /允许在 Galaxy 中访问/ }) as HTMLInputElement
  const momentVisibility = screen.getByRole('checkbox', { name: /公开 Moment：夜航/ }) as HTMLInputElement
  expect(friendRequests.checked).toBe(false)
  expect(driftBottles.checked).toBe(true)
  expect(planetVisibility.checked).toBe(true)
  expect(momentVisibility.checked).toBe(true)

  fireEvent.click(friendRequests)
  await waitFor(() => expect(friendRequests.checked).toBe(true))
  fireEvent.click(driftBottles)
  await waitFor(() => expect(driftBottles.checked).toBe(false))
  fireEvent.click(planetVisibility)
  await waitFor(() => expect(planetVisibility.checked).toBe(false))
  fireEvent.click(momentVisibility)
  await waitFor(() => expect(momentVisibility.checked).toBe(false))
  expect(state.requests).toContainEqual({ path: '/api/me/social-settings', method: 'PATCH', body: { allowFriendRequests: true } })
  expect(state.requests).toContainEqual({ path: '/api/me/social-settings', method: 'PATCH', body: { allowDriftBottles: false } })
  expect(state.requests).toContainEqual({ path: '/api/me/music-planet', method: 'PATCH', body: { visibility: 'private' } })
  expect(state.requests).toContainEqual({ path: '/api/me/music-planet/moments/moment%2Fa', method: 'PATCH', body: { visibility: 'private' } })

  state.failNextPlanetPatch = true
  fireEvent.click(planetVisibility)
  expect((await screen.findByRole('alert')).textContent).toContain('设置没有保存')
  expect(planetVisibility.checked).toBe(false)
})

test('a moderator can review report metadata from settings without exposing target content', async () => {
  let reportStatus: 'open' | 'reviewing' = 'open'
  const requests: Array<{ path: string; method?: string; body?: unknown }> = []
  const report = {
    id: 'report-a', target: { type: 'moment', id: 'moment-a' }, reason: 'privacy', detail: '请检查公开范围。',
    status: 'open' as const, createdAt: '2026-10-01T08:00:00.000Z', lastReview: null,
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    const path = url.pathname
    requests.push({ path, ...(init?.method ? { method: init.method } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
    if (path === '/api/music/catalog') return Response.json({ tracks: [] })
    if (path === '/api/me/music-planet') return Response.json({ planet: null })
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    if (path === '/api/admin/music-reports/report-a' && init?.method === 'PATCH') {
      reportStatus = (JSON.parse(String(init.body)) as { status: 'reviewing' }).status
      return Response.json({ report: { ...report, status: reportStatus, lastReview: { fromStatus: 'open', toStatus: reportStatus, reviewerUserId: 'reviewer-a', createdAt: '2026-10-01T08:05:00.000Z' } } })
    }
    if (path === '/api/admin/music-reports') {
      return Response.json({ reports: reportStatus === 'open' ? [report] : [], hasMore: false })
    }
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('button', { name: '我的星球' })
  openSettings()
  await screen.findByRole('heading', { name: '账户与隐私设置' })
  const openReviewEntry = await screen.findByRole('button', { name: '打开审核队列' })
  fireEvent.click(openReviewEntry)
  await screen.findByRole('heading', { name: '举报审核' })
  expect(await screen.findByText('请检查公开范围。')).toBeTruthy()
  expect(screen.queryByText(/目标正文|target-private-content/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '开始处理 report-a' }))
  await screen.findByText('当前筛选下没有待审核记录。')
  expect(reportStatus).toBe('reviewing')
  expect(requests).toContainEqual({ path: '/api/admin/music-reports/report-a', method: 'PATCH', body: { status: 'reviewing' } })
})

test('a non-moderator does not see an internal report-review entry in settings', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks: [] })
    if (path === '/api/me/music-planet') return Response.json({ planet: null })
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    if (path === '/api/admin/music-reports') return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('button', { name: '我的星球' })
  openSettings()
  await screen.findByRole('heading', { name: '账户与隐私设置' })
  await waitFor(() => expect(screen.queryByRole('button', { name: '打开审核队列' })).toBeNull())
})

test('a planet owner can edit a Moment and only sees the saved version after the server confirms it', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public' as const,
    visualSchemaVersion: 1, visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  const state = {
    moment: {
      id: 'moment-owner-edit', trackId: 'song-a', track: tracks[0], contentText: '今天想起这首歌。', photoUrl: null,
      visibility: 'public' as 'public' | 'private', publishedAt: '2026-09-29T10:00:00.000Z',
      createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
    },
    failNextMomentUpdate: true,
    requests: [] as Array<{ path: string; method?: string; body?: unknown }>,
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    state.requests.push({ path, ...(init?.method ? { method: init.method } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [state.moment] })
    if (path === '/api/me/music-planet/moments/moment-owner-edit' && init?.method === 'PATCH') {
      if (state.failNextMomentUpdate) {
        state.failNextMomentUpdate = false
        return Response.json({ error: 'TEMPORARY_FAILURE' }, { status: 503 })
      }
      state.moment = { ...state.moment, ...JSON.parse(String(init.body)) as Partial<typeof state.moment> }
      return Response.json({ moment: state.moment })
    }
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByText('今天想起这首歌。')
  fireEvent.click(screen.getByRole('button', { name: '编辑 Moment：今天想起这首歌。' }))
  fireEvent.change(screen.getByRole('textbox', { name: '编辑 Moment 文本' }), { target: { value: '改写后仍然属于这首歌。' } })
  fireEvent.click(screen.getByRole('checkbox', { name: '编辑 Moment：公开给访客' }))
  fireEvent.click(screen.getByRole('button', { name: '保存 Moment 修改' }))

  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByText('今天想起这首歌。')).toBeTruthy()
  expect((screen.getByRole('textbox', { name: '编辑 Moment 文本' }) as HTMLTextAreaElement).value).toBe('改写后仍然属于这首歌。')
  fireEvent.click(screen.getByRole('button', { name: '保存 Moment 修改' }))

  expect(await screen.findByText('改写后仍然属于这首歌。')).toBeTruthy()
  expect(screen.getByText(/仅自己 ·/)).toBeTruthy()
  expect(state.requests).toContainEqual({
    path: '/api/me/music-planet/moments/moment-owner-edit', method: 'PATCH',
    body: { contentText: '改写后仍然属于这首歌。', visibility: 'private' },
  })
  expect(screen.queryByRole('textbox', { name: '编辑 Moment 文本' })).toBeNull()
})

test('a planet owner can view all Moments and confirm deletion before a Moment is removed', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '', visibility: 'public' as const,
    visualSchemaVersion: 1, visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  const state = { moments: Array.from({ length: 6 }, (_, index) => ({
    id: `moment-${index + 1}`, trackId: 'song-a', track: tracks[0], contentText: `第 ${index + 1} 条 Moment 内容。`, photoUrl: null,
    visibility: 'public' as const, publishedAt: `2026-09-29T10:0${index}:00.000Z`,
    createdAt: `2026-09-29T10:0${index}:00.000Z`, updatedAt: `2026-09-29T10:0${index}:00.000Z`,
  })) }
  const requests: Array<{ path: string; method?: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    requests.push({ path, ...(init?.method ? { method: init.method } : {}) })
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: state.moments })
    if (path === '/api/me/music-planet/moments/moment-2' && init?.method === 'DELETE') {
      state.moments = state.moments.filter((moment) => moment.id !== 'moment-2')
      return Response.json({ deleted: true })
    }
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  expect(await screen.findByText('第 6 条 Moment 内容。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '删除 Moment：第 2 条 Moment 内容。' }))
  expect(screen.getByText('删除后，这条 Moment 会从访客页面和发现入口移除。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '取消删除 Moment：第 2 条 Moment 内容。' }))
  expect(screen.getByText('第 2 条 Moment 内容。')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '删除 Moment：第 2 条 Moment 内容。' }))
  fireEvent.click(screen.getByRole('button', { name: '确认删除 Moment：第 2 条 Moment 内容。' }))
  await waitFor(() => expect(screen.queryByText('第 2 条 Moment 内容。')).toBeNull())
  expect(requests).toContainEqual({ path: '/api/me/music-planet/moments/moment-2', method: 'DELETE' })
  expect(screen.getByText('第 6 条 Moment 内容。')).toBeTruthy()
})

test('settings explain the anonymous browser identity and omit email account controls', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public' as const,
    visualSchemaVersion: 1, visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('button', { name: '我的星球' })
  openSettings()
  await screen.findByRole('heading', { name: '账户与隐私设置' })
  expect(screen.getByText(/账号已保存在这个浏览器中/)).toBeTruthy()
  expect(screen.getByText(/换浏览器或清除本站点数据后，会生成新的随机账号/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /发送账号删除验证码/ })).toBeNull()
  expect(screen.queryByLabelText('邮箱地址')).toBeNull()
})

test('an owner can edit planet details, manage one to five selected songs, and choose a primary song', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public' as const,
    visualSchemaVersion: 1, visual: {},
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  const state = { planet: ownerPlanet, patch: null as Record<string, unknown> | null }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet' && init?.method === 'PATCH') {
      state.patch = JSON.parse(String(init.body)) as Record<string, unknown>
      const update = state.patch
      const trackIds = update.trackIds as string[]
      state.planet = {
        ...state.planet,
        displayName: update.displayName as string,
        tagline: update.tagline as string,
        tracks: trackIds.map((id, position) => ({ ...tracks.find((track) => track.id === id)!, position, isPrimary: id === update.primaryTrackId, selectedAt: '2026-09-30T00:00:00.000Z' })),
      }
      return Response.json({ planet: state.planet })
    }
    if (path === '/api/me/music-planet') return Response.json({ planet: state.planet })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('button', { name: '我的星球' })
  fireEvent.click(screen.getByRole('button', { name: '星球资料与歌曲' }))
  await screen.findByRole('heading', { name: '星球资料与歌曲' })

  fireEvent.change(screen.getByLabelText('星球名称'), { target: { value: '新的名字' } })
  fireEvent.change(screen.getByLabelText('星球简介'), { target: { value: '新的简介' } })
  fireEvent.click(screen.getByRole('checkbox', { name: '星球歌曲：远岸 · 远岸' }))
  fireEvent.click(screen.getByRole('checkbox', { name: '星球歌曲：月面信号 · 月面' }))
  fireEvent.click(screen.getByRole('radio', { name: '星球主旋律：远岸 · 远岸' }))
  fireEvent.click(screen.getByRole('button', { name: '保存星球资料' }))

  expect(await screen.findByText('星球资料与外观已保存。')).toBeTruthy()
  expect(state.patch).toEqual({
    displayName: '新的名字', tagline: '新的简介',
    trackIds: ['song-a', 'song-b', 'song-c', 'song-d', 'song-e'], primaryTrackId: 'song-d',
  })
  expect((screen.getByLabelText('星球歌曲：远岸 · 远岸') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('星球主旋律：远岸 · 远岸') as HTMLInputElement).checked).toBe(true)
  for (const track of tracks.slice(1)) {
    fireEvent.click(screen.getByRole('checkbox', { name: `星球歌曲：${track.title} · ${track.artistName}` }))
  }
  const lastSong = screen.getByRole('checkbox', { name: '星球歌曲：夜航 · 星际旅人' }) as HTMLInputElement
  expect(lastSong.checked).toBe(true)
  expect(lastSong.disabled).toBe(true)
})

test('settings distinguish a failed Moment read from an empty Moment list and allow retry', async () => {
  let failMomentRead = true
  const planet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '', visibility: 'public' as const,
    visualSchemaVersion: 1, visual: {}, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', tracks: [],
  }
  const moment = {
    id: 'moment-a', trackId: 'song-a', track: tracks[0], contentText: '一段记录。', photoUrl: null,
    visibility: 'public' as const, publishedAt: '2026-09-29T10:00:00.000Z',
    createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet })
    if (path === '/api/me/music-planet/moments') {
      if (failMomentRead) {
        failMomentRead = false
        return Response.json({ error: 'TEMPORARY_FAILURE' }, { status: 503 })
      }
      return Response.json({ moments: [moment] })
    }
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('button', { name: '我的星球' })
  openSettings()
  await screen.findByRole('heading', { name: '账户与隐私设置' })
  expect((await screen.findByRole('alert')).textContent).toContain('当前显示的内容不代表没有记录')
  expect(screen.queryByText('还没有 Moment。写下之后，你可以在这里决定每条内容是否公开。')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
  expect(await screen.findByRole('checkbox', { name: '公开 Moment：夜航' })).toBeTruthy()
})

test('an owner can open an exact-song portal and visit a matching public planet', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '沿着三首歌长成。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  const remotePlanet = {
    ...ownerPlanet,
    id: 'planet-remote', displayName: '潮汐边', tagline: '风把相似的歌吹到一起。',
    tracks: [tracks[0], tracks[3]].map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
    moments: [{
      id: 'remote-moment', trackId: 'song-a', track: tracks[0], contentText: '夜色把路照亮了一点。',
      photoUrl: null, visibility: 'public', publishedAt: '2026-09-29T10:00:00.000Z',
      createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z',
    }],
  }
  const requested: string[] = []
  const visitPayloads: unknown[] = []
  const reportPayloads: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    requested.push(url.pathname)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/music/song-portal') return Response.json({
      trackId: 'song-a',
      ranking: { mode: 'model', status: 'ready', model: { name: 'qwen3-embedding-local', version: '0.6b-ml' }, taskId: 'rank-task' },
      matches: [{
        planetId: 'planet-remote', displayName: '潮汐边', tagline: remotePlanet.tagline,
        matchSource: 'active_selection', selectedAt: '2026-09-29T09:00:00.000Z', latestPublicMomentAt: null,
        rankScore: .91, reasonCode: 'shared_song_selection',
      }],
    })
    if (url.pathname === '/api/music/planets/planet-remote/visit') {
      visitPayloads.push(JSON.parse(String(init?.body)))
      return Response.json({ planet: remotePlanet })
    }
    if (url.pathname === '/api/me/reports' && init?.method === 'POST') {
      reportPayloads.push(JSON.parse(String(init.body)))
      return Response.json({ report: { id: 'report-a', status: 'open' } }, { status: 201 })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: '留在这里的歌' })
  fireEvent.click(screen.getByRole('button', { name: '寻找与《夜航》同歌的星球' }))
  expect(await screen.findByText('AI 已在精确同歌候选中排序')).toBeTruthy()
  expect(screen.getByText('潮汐边')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '访问星球 潮汐边' }))
  expect(await screen.findByRole('region', { name: /要访问/ })).toBeTruthy()
  const incognito = screen.getByRole('checkbox', { name: /隐身访问/ }) as HTMLInputElement
  expect(incognito.checked).toBe(false)
  fireEvent.click(incognito)
  await confirmVisit()
  expect(await screen.findByRole('heading', { name: '潮汐边' })).toBeTruthy()
  expect(screen.getByText('夜色把路照亮了一点。')).toBeTruthy()
  expect(screen.getByRole('link', { name: '夜航 · 星际旅人 · 在官方平台打开' }).getAttribute('href'))
    .toBe('https://music.example/a')
  expect(requested).toContain('/api/music/song-portal')
  expect(requested).toContain('/api/music/planets/planet-remote/visit')
  expect(visitPayloads).toEqual([{ isIncognito: true, source: 'song_portal', trackId: 'song-a' }])

  fireEvent.click(screen.getByRole('button', { name: '举报这条 Moment' }))
  fireEvent.change(screen.getByLabelText('举报原因'), { target: { value: 'privacy' } })
  fireEvent.change(screen.getByLabelText('补充说明（可选）'), { target: { value: '请核查这段公开内容。' } })
  fireEvent.click(screen.getByRole('button', { name: '提交举报' }))
  expect(await screen.findByText('举报已提交，感谢提醒。')).toBeTruthy()
  expect(reportPayloads).toEqual([{
    target: { type: 'moment', id: 'remote-moment' }, reason: 'privacy', detail: '请核查这段公开内容。',
  }])
})

test('a visitor can browse public Galaxy planets by genre and open one without a shared-song claim', async () => {
  const ownerPlanet = {
    id: 'planet-owner', displayName: '夜航者', tagline: '慢慢靠岸', visibility: 'public', visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '只属于我的星球视觉摘要。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: tracks.slice(0, 3).map((track, position) => ({ ...track, position, isPrimary: position === 0, selectedAt: '2026-09-29T00:00:00.000Z' })),
  }
  const remotePlanet = {
    id: 'planet-galaxy', displayName: '潮汐边', tagline: '雨后的风吹过这里。', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '云层缓慢移动。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    tracks: [{ ...tracks[1], position: 0, isPrimary: true, selectedAt: '2026-09-29T00:00:00.000Z' }],
    moments: [],
  }
  const requested: string[] = []
  const visitBodies: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    requested.push(`${url.pathname}${url.search}`)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/music/galaxy') return Response.json({
      by: 'genre', groups: [{ key: 'indie', label: 'indie', planetCount: 1, planets: [
        { planetId: 'planet-galaxy', displayName: '潮汐边', tagline: remotePlanet.tagline, reasonCode: 'same_genre' },
      ] }],
    })
    if (url.pathname === '/api/music/planets/planet-galaxy/visit') {
      visitBodies.push(JSON.parse(String(init?.body)))
      return Response.json({ planet: remotePlanet })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: '留在这里的歌' })
  expect(screen.queryByRole('button', { name: 'Galaxy' })).toBeNull()
  await openGalaxyList()
  expect(await screen.findByRole('heading', { name: 'Galaxy' })).toBeTruthy()
  expect(screen.queryByText('只属于我的星球视觉摘要。')).toBeNull()
  expect(await screen.findByRole('button', { name: 'indie · 1' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '前往星系 indie', hidden: true })).toBeTruthy()
  expect(screen.getByRole('button', { name: '穿过星云回到我的星球', hidden: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'indie · 1' }))
  expect(await screen.findByText('星系 · indie')).toBeTruthy()
  expect(screen.getByRole('button', { name: '← 回到宇宙', hidden: true })).toBeTruthy()
  expect(await screen.findByRole('button', { name: '访问星球 潮汐边' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '访问星球 潮汐边' }))
  expect(await screen.findByRole('region', { name: /要访问/ })).toBeTruthy()
  await confirmVisit()
  expect(await screen.findByRole('heading', { name: '潮汐边' })).toBeTruthy()
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('visitor')
  expect(requested).toContain('/api/music/galaxy?by=genre')
  expect(requested).toContain('/api/music/planets/planet-galaxy/visit')
  expect(visitBodies).toEqual([{ isIncognito: false, source: 'galaxy' }])
})

test('homepage random roam shows model-ranked public discoveries and asks before leaving a visible or incognito visit trace', async () => {
  const remotePlanet = {
    id: 'planet-roam', displayName: '寂静河岸', tagline: '夜色和海风留在同一段旋律里。', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '云层缓慢移动。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'starlit', motion: 'drift', particleDensity: .34 },
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', tracks: [], moments: [],
  }
  const visitBodies: unknown[] = []
  const requested: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    requested.push(`${url.pathname}${url.search}`)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/music/discovery') return Response.json({
      ranking: { mode: 'model', status: 'ready', model: { name: 'qwen3-embedding-local', version: '0.6b-mlx' }, taskId: 'discovery-task' },
      recommendations: [{ planetId: 'planet-roam', displayName: '寂静河岸', tagline: remotePlanet.tagline, reasonCode: 'similar_moment', matchScore: .87 }],
    })
    if (url.pathname === '/api/music/planets/planet-roam/visit') {
      visitBodies.push(JSON.parse(String(init?.body)))
      return Response.json({ planet: remotePlanet })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  await openExploration('漫游')
  expect(await screen.findByRole('heading', { name: '随机漫游' })).toBeTruthy()
  expect(await screen.findByText('本地语义模型 · qwen3-embedding-local 已参与排序')).toBeTruthy()
  expect(screen.getByText('公开 Moment 的文字氛围相近')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '访问星球 寂静河岸' }))
  expect(await screen.findByRole('region', { name: /要访问/ })).toBeTruthy()
  expect(screen.getByText(/默认会在对方的 Orbit 留下最近访问足迹/)).toBeTruthy()
  await confirmVisit()
  expect(await screen.findByRole('heading', { name: '寂静河岸' })).toBeTruthy()
  expect(visitBodies).toEqual([{ isIncognito: false, source: 'random_roam' }])
  expect(requested).toContain('/api/music/discovery')
  expect(requested).toContain('/api/music/planets/planet-roam/visit')
})

test('My Orbit separates its five groups and visiting a daily route happens only after explicit confirmation', async () => {
  const remotePlanet = {
    id: 'planet-daily', displayName: '潮声', tagline: '今晚沿着海风走。', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '潮汐缓慢起伏。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'mist', motion: 'flow', particleDensity: .28 },
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', tracks: [], moments: [],
  }
  const visitBodies: unknown[] = []
  const requested: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    requested.push(url.pathname)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [{ planetId: 'planet-song', displayName: '同歌星球', tagline: '', occurredAt: '2026-09-29T00:00:00.000Z' }],
      friends: [{ userId: 'friend-1', planetId: null, displayName: '好友星球', tagline: '', occurredAt: '2026-09-28T00:00:00.000Z', canVisit: false }],
      visitedByMe: [{ planetId: 'planet-visited', displayName: '我访问过', tagline: '', occurredAt: '2026-09-27T00:00:00.000Z', isIncognito: true }],
      visitorsToMe: [{ planetId: 'planet-visitor', displayName: '来访星球', tagline: '', occurredAt: '2026-09-26T00:00:00.000Z', userId: 'visitor-1' }],
      dailyRoam: [{ planetId: 'planet-daily', displayName: '潮声', tagline: remotePlanet.tagline, occurredAt: '2026-09-30T00:00:00.000Z', reasonCode: 'similar_genre', matchScore: .82 }],
    } })
    if (url.pathname === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (url.pathname === '/api/music/planets/planet-daily/visit') {
      visitBodies.push(JSON.parse(String(init?.body)))
      return Response.json({ planet: remotePlanet })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.click(screen.getByRole('button', { name: 'Orbit' }))
  expect(await screen.findByRole('heading', { name: 'My Orbit' })).toBeTruthy()
  expect(await screen.findByText('撞歌遇见')).toBeTruthy()
  expect(screen.getByText('好友')).toBeTruthy()
  expect(screen.getAllByText('我访问过')).toHaveLength(2)
  expect(screen.getByText('访问过我')).toBeTruthy()
  expect(screen.getByText('路过的星球')).toBeTruthy()
  expect(screen.getByText('隐身访问 · 仅你可见')).toBeTruthy()
  expect(requested).toContain('/api/me/orbit')
  expect(visitBodies).toEqual([])

  fireEvent.click(screen.getByRole('button', { name: '访问星球 潮声' }))
  expect(await screen.findByRole('region', { name: /要访问/ })).toBeTruthy()
  await confirmVisit()
  expect(await screen.findByRole('heading', { name: '潮声' })).toBeTruthy()
  expect(visitBodies).toEqual([{ isIncognito: false, source: 'daily_roam' }])
})

test('My Orbit lets users answer friend requests and open a friend-only text conversation', async () => {
  let accepted = false
  let blocked = false
  let friendSatelliteReloads = 0
  const sentMessages: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/me/orbit') return Response.json({ date: '2026-09-30', groups: {
      songEncounters: [],
      friends: accepted ? [{ userId: 'friend-a', planetId: 'friend-planet', displayName: '海边的人', tagline: '今晚听潮', occurredAt: '2026-09-30T09:00:00.000Z', canVisit: true, unreadCount: 1 }] : [],
      visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (url.pathname === '/api/me/friend-satellites') {
      friendSatelliteReloads += 1
      return Response.json({ friendSatellites: accepted ? [
        { id: 'friend-friend-a', displayName: '海边的人', tagline: '今晚听潮', color: '#8dcfff', visualSeed: 'friend-a', orbitRadius: .34, orbitPhase: 1.1, isVirtual: false, canRemove: false },
      ] : [] })
    }
    if (url.pathname === '/api/me/friend-requests/request-a' && init?.method === 'PATCH') {
      accepted = true
      return Response.json({ requestId: 'request-a', status: 'accepted' })
    }
    if (url.pathname === '/api/me/friend-requests') return Response.json({
      incoming: accepted ? [] : [{ id: 'request-a', userId: 'friend-a', planetId: 'friend-planet', displayName: '海边的人', tagline: '今晚听潮', status: 'pending', createdAt: '2026-09-30T09:00:00.000Z' }],
      outgoing: [],
    })
    if (url.pathname === '/api/me/friends/friend-a/messages' && init?.method === 'POST') {
      if (blocked) return Response.json({ error: 'USER_BLOCKED' }, { status: 403 })
      const contentText = (JSON.parse(String(init.body)) as { contentText: string }).contentText
      sentMessages.push(contentText)
      return Response.json({ message: { id: 'message-new', contentText, createdAt: '2026-09-30T10:00:00.000Z', readAt: null, isOwn: true } }, { status: 201 })
    }
    if (url.pathname === '/api/me/friends/friend-a/messages') return Response.json({ peerUserId: 'friend-a', messages: [
      { id: 'message-old', contentText: '海面今天很安静。', createdAt: '2026-09-30T09:30:00.000Z', readAt: null, isOwn: false },
    ] })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.click(screen.getByRole('button', { name: 'Orbit' }))
  expect(await screen.findByText('收到的好友请求')).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: '接受 海边的人' }))

  expect(await screen.findByRole('button', { name: /私信 海边的人/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /私信 海边的人/ }))
  expect(await screen.findByText('海面今天很安静。')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('发送私信'), { target: { value: '我也在听。' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(await screen.findByText('我也在听。')).toBeTruthy()
  blocked = true
  fireEvent.change(screen.getByLabelText('发送私信'), { target: { value: '这条会被服务端拒绝。' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(await screen.findByText('此好友关系已被屏蔽，无法发送消息。')).toBeTruthy()
  expect(sentMessages).toEqual(['我也在听。'])
  expect(friendSatelliteReloads).toBe(1)
})

test('a visitor can send a friend request from a public planet and block its owner', async () => {
  vi.stubGlobal('confirm', vi.fn(() => true))
  const socialCalls: Array<{ path: string; method?: string; body?: unknown }> = []
  const remotePlanet = {
    id: 'public-planet', displayName: '雨声收集者', tagline: '把今晚的歌留在这里。', visibility: 'public',
    visualSchemaVersion: 1,
    visual: { schemaVersion: 1, summary: '沿着音乐生长。', palette: { surface: '#3b6f80', ocean: '#071d31', accent: '#72dac0' }, atmosphere: 'mist', motion: 'drift', particleDensity: .3 },
    createdAt: '2026-09-30T00:00:00.000Z', updatedAt: '2026-09-30T00:00:00.000Z', tracks: [], moments: [],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    if (url.pathname.startsWith('/api/me/friend-requests') || url.pathname === '/api/me/blocks') {
      socialCalls.push({ path: url.pathname, ...(init?.method ? { method: init.method } : {}), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) })
    }
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/music/galaxy') return Response.json({ by: 'genre', groups: [{ key: 'ambient', label: 'ambient', planetCount: 1, planets: [
      { planetId: 'public-planet', displayName: '雨声收集者', tagline: remotePlanet.tagline, reasonCode: 'same_genre' },
    ] }] })
    if (url.pathname === '/api/music/planets/public-planet/visit') return Response.json({ planet: remotePlanet })
    if (url.pathname === '/api/me/friend-requests' && init?.method === 'POST') return Response.json({ request: { id: 'request-out', status: 'pending', planetId: 'public-planet' } }, { status: 201 })
    if (url.pathname === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [{ id: 'request-out', userId: 'owner-b', planetId: 'public-planet', displayName: '雨声收集者', tagline: '', status: 'pending', createdAt: '2026-09-30T10:00:00.000Z' }] })
    if (url.pathname === '/api/me/blocks' && init?.method === 'POST') return Response.json({ ok: true })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  await openGalaxyList()
  fireEvent.click(await screen.findByRole('button', { name: 'ambient · 1' }))
  fireEvent.click(await screen.findByRole('button', { name: '访问星球 雨声收集者' }))
  await confirmVisit()
  expect(await screen.findByRole('heading', { name: '雨声收集者' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '发送好友请求' }))
  expect(await screen.findByText('好友请求已发送；对方接受后，你们会出现在彼此的好友 Orbit 中。')).toBeTruthy()
  expect((screen.getByRole('button', { name: '好友请求已发送' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '屏蔽此人' }))
  expect(socialCalls).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: '确认屏蔽' }))
  await waitFor(() => expect(document.querySelector('.cockpit[data-exterior="home"]')).toBeTruthy())
  expect(socialCalls).toEqual([
    { path: '/api/me/friend-requests', method: 'POST', body: { planetId: 'public-planet' } },
    { path: '/api/me/friend-requests' },
    { path: '/api/me/blocks', method: 'POST', body: { planetId: 'public-planet' } },
  ])
})

test('a visitor can send, receive, open, comment on and release a drift bottle', async () => {
  let sentToday = false
  let receiving = true
  let released = false
  const bottlePayloads: unknown[] = []
  const commentPayloads: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: null })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/me/drift-bottles' && init?.method === 'POST') {
      bottlePayloads.push(JSON.parse(String(init.body)))
      sentToday = true
      return Response.json({ sentToday: true, bottle: { id: 'sent-bottle', status: 'delivered', topic: { type: 'song' }, createdAt: '2026-09-30T10:00:00.000Z' } }, { status: 201 })
    }
    if (url.pathname === '/api/me/drift-bottles') return Response.json({
      date: '2026-09-30', allowReceiving: receiving, sentToday,
      inbox: released ? [] : [{ id: 'incoming-bottle', topicType: 'song', topicLabel: '歌曲 · 夜航', status: 'unread', deliveredAt: '2026-09-30T09:00:00.000Z', expiresAt: '2026-09-30T10:00:00.000Z' }],
      sent: sentToday ? [{ id: 'sent-bottle', topicType: 'song', topicLabel: '歌曲 · 夜航', status: 'delivered', deliveryCount: 1, createdAt: '2026-09-30T10:00:00.000Z' }] : [],
    })
    if (url.pathname === '/api/me/social-settings' && init?.method === 'PATCH') {
      receiving = (JSON.parse(String(init.body)) as { allowDriftBottles: boolean }).allowDriftBottles
      return Response.json({ allowFriendRequests: true, allowDriftBottles: receiving })
    }
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle' && init?.method === 'PATCH') {
      const action = (JSON.parse(String(init.body)) as { action: string }).action
      if (action === 'release') released = true
      return Response.json(action === 'open' ? { delivery: { status: 'read' }, alreadyOpened: false } : { released: true, status: 'waiting' })
    }
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle') return Response.json({
      bottle: { id: 'incoming-bottle', topic: { type: 'song', track: { id: 'song-a', title: '夜航', artistName: '星际旅人', versionLabel: '', officialUrl: 'https://music.example/a', coverUrl: null } }, messageText: '沿着这首歌继续漂流。', sender: null },
      delivery: { id: 'delivery-a', status: 'read', deliveredAt: '2026-09-30T09:00:00.000Z', expiresAt: '2026-09-30T10:00:00.000Z', canRelease: true },
      comments: [],
    })
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle/comments' && init?.method === 'POST') {
      const contentText = (JSON.parse(String(init.body)) as { contentText: string }).contentText
      commentPayloads.push(contentText)
      return Response.json({ comment: { id: 'comment-a', contentText, createdAt: '2026-09-30T09:30:00.000Z', authorName: '你', isOwn: true, likeCount: 0, likedByMe: false } }, { status: 201 })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  await openExploration('漂流瓶')
  expect(await screen.findByRole('heading', { name: '漂流瓶' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/附上一句话/), { target: { value: '沿着这首歌继续漂流。' } })
  fireEvent.click(screen.getByRole('button', { name: '放出漂流瓶 ↗' }))
  expect(await screen.findByRole('button', { name: '今日已放流' })).toBeTruthy()
  expect(bottlePayloads).toEqual([{ topic: { type: 'song', trackId: 'song-a' }, messageText: '沿着这首歌继续漂流。' }])

  fireEvent.click(screen.getByRole('button', { name: '打开漂流瓶' }))
  expect(await screen.findByText('沿着这首歌继续漂流。')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('添加评论'), { target: { value: '我也把这首歌放进今晚。' } })
  fireEvent.click(screen.getByRole('button', { name: '留下评论' }))
  expect(await screen.findByText('我也把这首歌放进今晚。')).toBeTruthy()
  expect(commentPayloads).toEqual(['我也把这首歌放进今晚。'])
  fireEvent.click(screen.getByRole('button', { name: '继续放流 ↗' }))
  expect(await screen.findByText('你已放流；系统暂时没有找到下一位，会继续寻找。')).toBeTruthy()

  const receiveToggle = screen.getByRole('checkbox', { name: /接收漂流瓶/ }) as HTMLInputElement
  expect(receiveToggle.checked).toBe(true)
  fireEvent.click(receiveToggle)
  expect(await screen.findByText('关闭后不会收到新的投递；已收到的瓶仍可处理。')).toBeTruthy()
  expect(receiving).toBe(false)
})

test('settings can remove a virtual friend satellite without treating it as a real friendship', async () => {
  const state = {
    friends: [
      { id: 'friend-real', displayName: '真实好友', tagline: '', color: '#8dcfff', visualSeed: 'real', orbitRadius: .34, orbitPhase: .1, isVirtual: false, canRemove: false },
      { id: 'friend-virtual-a', displayName: '小满', tagline: '喜欢沿着熟悉的旋律散步。', color: '#77dec8', visualSeed: 'mint', orbitRadius: .235, orbitPhase: .35, isVirtual: true, canRemove: true },
      { id: 'friend-virtual-b', displayName: '星野', tagline: '把晚风收藏进歌里。', color: '#b39aff', visualSeed: 'lilac', orbitRadius: .265, orbitPhase: 2.42, isVirtual: true, canRemove: true },
      { id: 'friend-virtual-c', displayName: '阿澄', tagline: '每一条河都有自己的节奏。', color: '#ffc47d', visualSeed: 'amber', orbitRadius: .295, orbitPhase: 4.53, isVirtual: true, canRemove: true },
    ],
    deleted: [] as string[],
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: null, friendSatellites: state.friends })
    if (path === '/api/me/social-settings') return Response.json({ allowFriendRequests: true, allowDriftBottles: true })
    if (path === '/api/admin/music-reports') return Response.json({ error: 'NOT_AVAILABLE' }, { status: 404 })
    if (path.startsWith('/api/me/friend-satellites/') && init?.method === 'DELETE') {
      const id = decodeURIComponent(path.split('/').at(-1)!)
      state.deleted.push(id)
      state.friends = state.friends.filter((friend) => friend.id !== id)
      return Response.json({ deleted: true })
    }
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  openSettings()
  await screen.findByText('真实好友')
  expect(screen.getByText('真实好友').parentElement?.parentElement?.querySelector('button')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '移除好友卫星 小满' }))

  expect(await screen.findByText('已将「小满」移出星球轨道。')).toBeTruthy()
  expect(screen.queryByText('小满')).toBeNull()
  expect(screen.getByText('星野')).toBeTruthy()
  expect(screen.getByText('阿澄')).toBeTruthy()
  expect(screen.getByText('真实好友')).toBeTruthy()
  expect(state.deleted).toEqual(['friend-virtual-a'])
})

function installCockpitFixture(onVisit?: (init?: RequestInit) => Promise<Response>) {
  const owner = { id: 'cockpit-owner', displayName: '驾驶舱测试星球', tagline: '', visibility: 'public', visualSchemaVersion: 3,
    visual: createDitherSpec({ planetId: 'cockpit-owner', tracks }), tracks: tracks.slice(0,3) }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: owner })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/orbit') return Response.json({ date: '2026-10-09', groups: { songEncounters: [], friends: [], visitedByMe: [], visitorsToMe: [], dailyRoam: [] } })
    if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (path === '/api/music/galaxy') return Response.json({ by: 'genre', groups: [{ key: 'ambient', label: 'ambient', planetCount: 0, planets: [] }] })
    if (path === '/api/music/song-portal') return Response.json({ trackId: 'song-a', ranking: { mode: 'rule', status: 'ready' }, matches: [{ planetId: 'cockpit-target', displayName: '下一站', matchSource: 'active_selection', reasonCode: 'shared_song_selection' }] })
    if (path === '/api/music/planets/cockpit-target/visit' && onVisit) return onVisit(init)
    throw Error(path)
  }))
  return owner
}

test('the cockpit boots directly into Galaxy; opening my planet never replaces its windshield', async () => {
  installCockpitFixture()
  render(<MusicApp />)
  await screen.findByRole('button', {name:'场景星系：ambient'})
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
  expect(screen.queryByRole('button', {name:'音乐卫星 夜航'})).toBeNull()
  const renderer = document.querySelector('.cockpit-viewport [data-dither-renderer]')
  await openPersonal()
  expect(await screen.findByRole('button', {name:'编辑星球外观'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name:'返回驾驶舱'}))
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
  expect(document.querySelector('.cockpit-viewport [data-dither-renderer]')).toBe(renderer)
  expect(screen.getByRole('button', {name:'场景星系：ambient'})).toBeTruthy()
})

test('cockpit channels keep the same world renderer and preserve a Moment draft across Orbit and overview', async () => {
  installCockpitFixture()
  await renderCockpit()
  const renderer = document.querySelector('.cockpit-viewport [data-dither-renderer]')
  fireEvent.click(screen.getByRole('button', { name: 'Moment', exact: true }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Moment 内容' }), { target: { value: '还没发送的片刻' } })
  fireEvent.change(screen.getByLabelText('这段 Moment 属于哪首歌'), { target: { value: 'song-b' } })
  fireEvent.click(screen.getByRole('button', { name: 'Orbit', exact: true }))
  await screen.findByRole('heading', { name: 'My Orbit' })
  fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  fireEvent.click(screen.getByRole('button', { name: 'Moment', exact: true }))
  expect((screen.getByRole('textbox', { name: 'Moment 内容' }) as HTMLTextAreaElement).value).toBe('还没发送的片刻')
  expect((screen.getByLabelText('这段 Moment 属于哪首歌') as HTMLSelectElement).value).toBe('song-b')
  expect(document.querySelector('.cockpit-viewport [data-dither-renderer]')).toBe(renderer)
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
})

test('terminal wheel scrolling never advances the exterior Galaxy journey', async () => {
  installCockpitFixture()
  await renderCockpit()
  await openGalaxyList()
  const before = document.querySelector('.cockpit-viewport .music-galaxy-axis')?.innerHTML
  for (let i = 0; i < 100; i++) fireEvent.wheel(document.querySelector('.cockpit-terminal-content')!, { deltaY: -10000 })
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
  expect(document.querySelector('.cockpit-viewport .music-galaxy-axis')?.innerHTML).toBe(before)
  expect(document.querySelector('.cockpit.is-in-flight')).toBeNull()
})

test('a slow visit holds in the nebula without a cancel button, double confirmation posts once, and arrival resumes when ready', async () => {
  const responses: Array<(value: Response) => void> = []
  let posts = 0
  const owner = installCockpitFixture(async () => { posts++; return new Promise<Response>(resolve => responses.push(resolve)) })
  await renderCockpit()
  fireEvent.click(screen.getByRole('button', { name: '寻找与《夜航》同歌的星球' }))
  fireEvent.click(await screen.findByRole('button', { name: '访问星球 下一站' }))
  const confirm = screen.getByRole('button', { name: '继续访问' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  await waitFor(() => expect(document.querySelector('.dither-stage')?.getAttribute('data-flight-progress')).toBe('0.5'))
  expect(posts).toBe(1)
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
  expect(screen.queryByRole('button', { name: '取消航行' })).toBeNull()
  expect(responses).toHaveLength(1)
  responses[0](Response.json({ planet: { ...owner, id: 'cockpit-target', displayName: '当前结果', moments: [] } }))
  await waitFor(() => expect(document.querySelector('.cockpit[data-exterior="visitor"]:not(.is-in-flight)')).toBeTruthy(), { onTimeout: () => new Error(JSON.stringify({ page: document.querySelector('.cockpit')?.outerHTML.slice(0,400), progress: { ...document.querySelector<HTMLElement>('.dither-stage')?.dataset }, alerts: [...document.querySelectorAll('[role=alert]')].map(e=>e.textContent) })) })
  fireEvent.click(screen.getByRole('button', { name: '查看星球：当前结果' }))
  expect(await screen.findByRole('heading', { name: '当前结果' })).toBeTruthy()
  expect(posts).toBe(1)
})

test('Escape inside visit confirmation returns only one channel and never records a visit', async () => {
  let posts = 0
  installCockpitFixture(async () => { posts++; return Response.json({}) })
  await renderCockpit()
  fireEvent.click(screen.getByRole('button', { name: '寻找与《夜航》同歌的星球' }))
  fireEvent.click(await screen.findByRole('button', { name: '访问星球 下一站' }))
  fireEvent.keyDown(screen.getByRole('region', { name: /要访问/ }), { key: 'Escape' })
  expect(document.querySelector('.cockpit')?.getAttribute('data-page')).toBe('collision')
  expect(document.querySelector('.cockpit')?.getAttribute('data-focus')).toBe('exploration')
  expect(posts).toBe(0)
})
