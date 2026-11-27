// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import RealMusicApp from '../src/music/MusicApp'
import { createDitherSpec } from '../src/music/dither/appearance'

// Established-user features exercise the normal remembered-entry policy.
function MusicApp() { return <RealMusicApp replayFirstRunOnEntry={false} /> }

beforeEach(() => {
  // These are established-user feature tests; first-visit coverage has its own fixture.
  localStorage.setItem('mosic-first-run-v1', 'completed')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  // jsdom has no media playback; keep the real app/player while replacing that browser boundary.
  vi.stubGlobal('Audio', class extends EventTarget {
    paused = true; src = ''; loop = false; volume = 0; preload = ''; currentTime = 0
    play() { this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
    load() {} removeAttribute() { this.src = '' }
  })
})

afterEach(() => {
  cleanup()
  localStorage.removeItem('mosic-first-run-v1')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function openPersonal() {
  await waitFor(() => expect(document.querySelector('main[aria-busy="true"]')).toBeNull())
  fireEvent.click(await screen.findByRole('button', { name: '打开个人终端' }))
}
function openSettings() {
  const back = screen.queryByRole('button', { name: '返回驾驶舱' })
  if (back) fireEvent.click(back)
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
}
async function renderCockpit() {
  render(<MusicApp />)
  await waitFor(() => expect(document.querySelector('.music-app:not([aria-busy="true"]) .cockpit[data-focus="overview"]') || screen.queryByRole('button', { name: '重新连接' })).toBeTruthy())
  if (!screen.queryByRole('button', { name: '重新连接' })) await openPersonal()
}
async function openGalaxyList() {
  if (screen.queryByRole('button', { name: '返回驾驶舱' })) fireEvent.click(screen.getByRole('button', { name: '返回驾驶舱' }))
  if (document.querySelector('.cockpit')?.getAttribute('data-exterior') !== 'galaxy') {
    fireEvent.click(screen.getByRole('button', { name: 'Galaxy', exact: true }))
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
  expect(document.querySelector('.cockpit')?.getAttribute('data-page')).toBe('visitor')
  expect(document.querySelector('.cockpit')?.getAttribute('data-focus')).toBe('overview')
  fireEvent.click(screen.getByRole('button', { name: /^查看星球：/ }))
}

const tracks = [
  { id: 'song-a', title: '夜航', artistId: 'artist-a', artistName: '星际旅人', versionLabel: '', genres: ['ambient'], moodTags: ['calm'], officialUrl: 'https://music.example/a', coverUrl: null, durationSeconds: 215 },
  { id: 'song-b', title: '潮汐之间', artistId: 'artist-b', artistName: '潮汐', versionLabel: '', genres: ['indie'], moodTags: ['reflective'], officialUrl: 'https://music.example/b', coverUrl: null, durationSeconds: 203 },
  { id: 'song-c', title: '雾灯', artistId: 'artist-c', artistName: '雨季', versionLabel: '', genres: ['dream pop'], moodTags: ['hopeful'], officialUrl: 'https://music.example/c', coverUrl: null, durationSeconds: 198 },
  { id: 'song-d', title: '远岸', artistId: 'artist-d', artistName: '远岸', versionLabel: '', genres: ['folk'], moodTags: ['warm'], officialUrl: 'https://music.example/d', coverUrl: null, durationSeconds: 180 },
  { id: 'song-e', title: '月面信号', artistId: 'artist-e', artistName: '月面', versionLabel: '', genres: ['electronic'], moodTags: ['curious'], officialUrl: 'https://music.example/e', coverUrl: null, durationSeconds: 190 },
]

test('opening the site warms every Galaxy classification and offscreen star image before navigation', async () => {
  const images: string[] = [], charts: string[] = []
  vi.stubGlobal('Image', class { crossOrigin=''; referrerPolicy=''; onload=null; onerror=null; set src(url:string) { images.push(url) } })
  vi.stubGlobal('fetch', async (input:RequestInfo|URL) => {
    const url=new URL(String(input),'https://mosic.test')
    if(url.pathname==='/api/music/catalog') return Response.json({tracks})
    if(url.pathname==='/api/me/music-planet') return Response.json({planet:null})
    if(url.pathname==='/api/music/galaxy') {
      const by=url.searchParams.get('by')!;charts.push(by)
      return Response.json({by,groups:Array.from({length:4},(_,i)=>({key:`${by}-${i}`,label:`${by} ${i}`,planetCount:0,planets:[],artwork:{url:`https://covers.example/${by}-${i}.jpg`,source:'song-cover',label:'Cover'}}))})
    }
    return Response.json({groups:[],incoming:[],outgoing:[],friends:[]})
  })
  render(<MusicApp />)
  await screen.findByRole('button',{name:'打开个人终端'})
  await waitFor(()=>expect(new Set(charts)).toEqual(new Set(['genre','song','artist'])))
  for(const by of ['genre','song','artist']) expect(images).toContain(`https://covers.example/${by}-3.jpg`)
  expect(new Set(images).size).toBeGreaterThanOrEqual(47+12)
  await screen.findByRole('button',{name:'前往星系 genre 0',exact:true})
  fireEvent.click(screen.getByRole('button',{name:'SONG',exact:true}))
  await screen.findByRole('button',{name:'前往星系 song 0',exact:true})
  expect(charts.filter(by=>by==='song')).toHaveLength(1)
})

test('the cockpit is usable while secondary Moments are still loading', async () => {
  let finish!: (r:Response)=>void
  const owner={id:'fast-home',displayName:'先显示星球',tagline:'',visibility:'public',tracks:tracks.slice(0,1),visual:createDitherSpec({planetId:'fast-home',tracks})}
  vi.stubGlobal('fetch',vi.fn(async(request:RequestInfo|URL)=>{
    const path=new URL(String(request),'https://moodverse.test').pathname
    if(path==='/api/music/catalog') return Response.json({tracks})
    if(path==='/api/me/music-planet') return Response.json({planet:owner})
    if(path==='/api/me/music-planet/moments') return new Promise<Response>(resolve=>{finish=resolve})
    return Response.json({groups:[],incoming:[],outgoing:[],friends:[]})
  }))
  render(<MusicApp />)
  expect(await screen.findByRole('button',{name:'打开个人终端'})).toBeTruthy()
  await act(async()=>finish(Response.json({moments:[]})))
})

test.each([0, 1, 4])('Moment heading always has a quick publish shortcut with %i existing Moments', async (count) => {
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
  expect(document.querySelectorAll('.music-moment-item')).toHaveLength(Math.min(count, 3))
  if (count > 3) {
    fireEvent.click(screen.getByRole('button', { name: '我的 Moment 下一页' }))
    expect(document.querySelectorAll('.music-moment-item')).toHaveLength(1)
  }
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

test.each(['public', 'private'] as const)('Moment visibility radios are exclusive and save %s visibility', async (visibility) => {
  const owner = { id: 'privacy-owner', displayName: '手机星球', tagline: '', visibility: 'public', visualSchemaVersion: 3,
    visual: createDitherSpec({ planetId: 'privacy-owner', tracks }), tracks: tracks.slice(0, 3) }
  const submissions: Array<{ visibility: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: owner })
    if (path === '/api/me/music-planet/moments' && init?.method === 'POST') {
      const draft = JSON.parse(String(init.body))
      submissions.push(draft)
      return Response.json({ moment: { ...draft, id: 'privacy-saved', track: tracks[0], photoUrl: null,
        publishedAt: draft.visibility === 'public' ? '2026-10-10' : null, createdAt: '2026-10-10', updatedAt: '2026-10-10' } })
    }
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    return Response.json({ groups: [], incoming: [], outgoing: [] })
  }))
  await renderCockpit()
  fireEvent.click(screen.getByRole('button', { name: 'Moment' }))
  const choices = within(screen.getByRole('radiogroup', { name: 'Moment 可见范围' }))
  const publish = choices.getByRole('radio', { name: '公开给访客' }) as HTMLInputElement
  const privateOnly = choices.getByRole('radio', { name: '仅自己可见' }) as HTMLInputElement
  expect(publish.checked).toBe(true)
  expect(privateOnly.checked).toBe(false)
  fireEvent.click(publish)
  expect(publish.checked).toBe(true)
  fireEvent.click(privateOnly)
  expect(publish.checked).toBe(false)
  expect(privateOnly.checked).toBe(true)
  if (visibility === 'public') fireEvent.click(publish)
  expect(publish.checked).toBe(visibility === 'public')
  expect(privateOnly.checked).toBe(visibility === 'private')
  fireEvent.change(screen.getByRole('textbox', { name: 'Moment 内容' }), { target: { value: '来自手机的片刻' } })
  fireEvent.click(screen.getByRole('button', { name: visibility === 'public' ? /公开发布 Moment/ : /保存私密 Moment/ }))
  await screen.findByText(visibility === 'public' ? 'Moment 已公开。' : '已保存为仅自己可见。')
  expect(submissions).toEqual([expect.objectContaining({ visibility })])
  expect(document.querySelector('.music-moment-meta')?.textContent).toContain(visibility === 'public' ? '公开' : '仅自己')
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
  fireEvent.click(screen.getByRole('button',{name:/公开发布 Moment/}))
  await screen.findByText('照片暂时无法上传，已保留所选照片，请稍后重试。')
  expect(screen.getByAltText('待发布照片预览')).toBeTruthy()
  expect((screen.getByRole('textbox',{name:'Moment 内容'}) as HTMLTextAreaElement).value).toBe('照片记忆')
  fail = false
  fireEvent.click(screen.getByRole('button',{name:/公开发布 Moment/}))
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
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
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
  await waitFor(()=>expect(document.querySelector<HTMLButtonElement>('.music-app.has-planet .cockpit-flight-lever')?.disabled).toBe(false),{timeout:10000,onTimeout:()=>new Error('Navigation key did not become ready')})
  const jump=screen.getByRole('button',{name:'回星球'})
  expect(document.querySelector('.cockpit')!.getAttribute('data-exterior')).toBe('galaxy')
  fireEvent.click(jump)
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="home"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000,onTimeout:()=>new Error('Home arrival did not finish')})
  expect(jump.getAttribute('aria-label')).toBe('Galaxy')
  expect(jump.querySelector('small')?.textContent).toBe('Galaxy')
  expect(document.querySelector('.cockpit')!.getAttribute('data-focus')).toBe('overview')
  expect(screen.getByRole('img',{name:'航速：0%'})).toBeTruthy()
  fireEvent.click(jump)
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="galaxy"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000,onTimeout:()=>new Error('Galaxy arrival did not finish')})
  expect(jump.getAttribute('aria-label')).toBe('回星球')
  expect(document.querySelector('.cockpit')!.getAttribute('data-focus')).toBe('overview')
},30000)

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
  fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' }))
  fireEvent.click(screen.getByRole('button', { name: '潮汐之间 · 潮汐' }))
  fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' }))
  fireEvent.click(screen.getByRole('button', { name: '雾灯 · 雨季' }))
  fireEvent.click(screen.getByRole('button', { name: '+ 收入 CD 架' }))
  // A full rack blocks adding songs, not browsing the remaining artwork.
  fireEvent.click(screen.getByRole('button', { name: '远岸 · 远岸' }))
  expect((screen.getByRole('button', { name: 'CD 架已满' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '生成我的星球' }))

  expect(await screen.findByRole('heading', { name: /夜航者/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: '编辑星球外观' })).toBeTruthy()
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('ai-tasks') || String(url).endsWith('/compose'))).toBe(false)
  expect(screen.queryByRole('link', { name: /在官方平台打开/ })).toBeNull()
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
  expect((await screen.findByRole('alert')).textContent).toContain('暂时连接不上')
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
  await screen.findByText(/暂时连接不上/)
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
  await screen.findByText(/暂时连接不上/)
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
    if (path === '/api/me/galaxy-preferences') return Response.json({ genres: ['Pop'], availableGenres: ['Pop'], artists: [], songs: [] })
    if (path === '/api/music/galaxy-options') return Response.json({ options: [], hasMore: false, nextOffset: null })
    throw new Error(`Unexpected request: ${path}`)
  }))

  await renderCockpit()
  await screen.findByRole('button', { name: '我的星球' })
  openSettings()
  await screen.findByRole('heading', { name: '设置', level: 2 })

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
  await screen.findByText(/设置没有保存/)
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
  await screen.findByRole('heading', { name: '设置', level: 2 })
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
  await screen.findByRole('heading', { name: '设置', level: 2 })
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
  fireEvent.click(screen.getByRole('button', { name: '我的 Moment 下一页' }))
  expect(await screen.findByText('第 6 条 Moment 内容。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '我的 Moment 上一页' }))
  fireEvent.click(screen.getByRole('button', { name: '删除 Moment：第 2 条 Moment 内容。' }))
  expect(screen.getByText('删除后，这条 Moment 会从访客页面和发现入口移除。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '取消删除 Moment：第 2 条 Moment 内容。' }))
  expect(screen.getByText('第 2 条 Moment 内容。')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '删除 Moment：第 2 条 Moment 内容。' }))
  fireEvent.click(screen.getByRole('button', { name: '确认删除 Moment：第 2 条 Moment 内容。' }))
  await waitFor(() => expect(screen.queryByText('第 2 条 Moment 内容。')).toBeNull())
  expect(requests).toContainEqual({ path: '/api/me/music-planet/moments/moment-2', method: 'DELETE' })
  fireEvent.click(screen.getByRole('button', { name: '我的 Moment 下一页' }))
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
  await screen.findByRole('heading', { name: '设置', level: 2 })
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
  fireEvent.click(screen.getByRole('button', { name: '远岸 · 远岸' }))
  fireEvent.click(screen.getByRole('button', { name: '月面信号 · 月面' }))
  fireEvent.click(screen.getByRole('radio', { name: '星球主旋律：远岸 · 远岸' }))
  fireEvent.click(screen.getByRole('button', { name: '保存星球资料' }))

  expect(await screen.findByText('星球资料与外观已保存。')).toBeTruthy()
  expect(state.patch).toEqual({
    displayName: '新的名字', tagline: '新的简介',
    trackIds: ['song-a', 'song-b', 'song-c', 'song-d', 'song-e'], primaryTrackId: 'song-d',
  })
  expect(screen.getByRole('button', { name: '远岸 · 远岸' }).getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByLabelText('星球主旋律：远岸 · 远岸') as HTMLInputElement).checked).toBe(true)
  for (const track of tracks.slice(1)) {
    fireEvent.click(screen.getByRole('button', { name: `取消选择《${track.title}》` }))
  }
  const lastSong = screen.getByRole('button', { name: '取消选择《夜航》' }) as HTMLButtonElement
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
  await screen.findByRole('heading', { name: '设置', level: 2 })
  expect((await screen.findByRole('alert')).textContent).toContain('当前显示的内容不代表没有记录')
  expect(screen.queryByText('还没有 Moment。写下之后，你可以在这里决定每条内容是否公开。')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
  expect(await screen.findByRole('checkbox', { name: '公开 Moment：夜航' })).toBeTruthy()
})

test('an owner can visit an exact-song match and keep its public profile when opening and closing private messages', async () => {
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
  const friends = [{ userId: 'remote-user', planetId: 'planet-remote', displayName: '潮汐边', tagline: remotePlanet.tagline,
    occurredAt: '2026-09-29T09:00:00.000Z', canVisit: true, unreadCount: 0 }]
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    requested.push(url.pathname)
    if (url.pathname === '/api/music/catalog') return Response.json({ tracks })
    if (url.pathname === '/api/me/music-planet') return Response.json({ planet: ownerPlanet })
    if (url.pathname === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (url.pathname === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [], friends })
    if (url.pathname === '/api/me/orbit') return Response.json({ date: '2026-10-10', groups: {
      songEncounters: [], friends, visitedByMe: [], visitorsToMe: [], dailyRoam: [],
    } })
    if (url.pathname === '/api/me/friends/remote-user/messages') return Response.json({ messages: [], nextCursor: null })
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
  expect(screen.queryByRole('link', { name: /在官方平台打开/ })).toBeNull()
  expect(requested).toContain('/api/music/song-portal')
  expect(requested).toContain('/api/music/planets/planet-remote/visit')
  expect(visitPayloads).toEqual([{ isIncognito: true, source: 'song_portal', trackId: 'song-a' }])

  for (const closeWith of ['button', 'cancel']) {
    fireEvent.click(await screen.findByRole('button', { name: '私信 潮汐边' }))
    const conversation = await screen.findByRole('dialog', { name: '与潮汐边的私信' })
    expect(document.querySelector('.cockpit')?.getAttribute('data-page')).toBe('visitor')
    expect(screen.getByRole('complementary', { name: '公开星球 潮汐边' })).toBeTruthy()
    if (closeWith === 'button') fireEvent.click(within(conversation).getByRole('button', { name: '关闭通讯器' }))
    else fireEvent(conversation, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '与潮汐边的私信' })).toBeNull())
    expect(document.querySelector('.cockpit')?.getAttribute('data-page')).toBe('visitor')
    expect(screen.getByRole('heading', { name: '潮汐边' })).toBeTruthy()
    expect(screen.getByText('夜色把路照亮了一点。')).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: '同歌搜索' })).toBeNull()
  }

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
  expect(await screen.findByRole('button', { name: 'indie · 1 颗星球' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '前往星系 indie', hidden: true })).toBeTruthy()
  expect(screen.getByRole('button', { name: '穿过星云回到我的星球', hidden: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'indie · 1 颗星球' }))
  expect(await screen.findByRole('region', { name: '星系内容' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '← 回到宇宙', hidden: true })).toBeNull()
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
  expect(await screen.findByRole('button', { name: '访问星球 潮汐边' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '访问星球 潮汐边' }))
  expect(await screen.findByRole('region', { name: /要访问/ })).toBeTruthy()
  await confirmVisit()
  expect(await screen.findByRole('heading', { name: '潮汐边' })).toBeTruthy()
  const publicSongs = screen.getByRole('region', { name: '对方公开选择的歌曲' })
  expect(within(publicSongs).getByRole('group', { name: '星球 CD' })).toBeTruthy()
  expect(within(publicSongs).getByRole('button', { name: '下一张 CD' })).toBeTruthy()
  expect(within(publicSongs).queryByRole('radio')).toBeNull()
  expect(within(publicSongs).queryByRole('searchbox')).toBeNull()
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

test('My Orbit shares planet cards across its lists and omits song encounters and daily passing planets', async () => {
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
    if (url.pathname === '/api/me/friend-requests') return Response.json({
      incoming: [{ id: 'incoming-card', userId: 'incoming-user', planetId: 'incoming-planet', displayName: '请求星球', tagline: '请求简介', status: 'pending', createdAt: '2026-09-30' }],
      outgoing: [{ id: 'outgoing-card', userId: 'outgoing-user', planetId: 'outgoing-planet', displayName: '等待星球', tagline: '', status: 'pending', createdAt: '2026-09-30' }],
      friends: [{ userId: 'friend-1', planetId: null, displayName: '好友星球', tagline: '', occurredAt: '2026-09-28T00:00:00.000Z', canVisit: false, unreadCount: 0 }],
    })
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
  await screen.findByText('隐身访问 · 仅你可见')
  expect(screen.queryByText('撞歌遇见')).toBeNull()
  expect(screen.queryByText('同歌星球')).toBeNull()
  expect(screen.getByText('好友')).toBeTruthy()
  expect(screen.getAllByText('我访问过')).toHaveLength(2)
  expect(screen.getByText('访问过我')).toBeTruthy()
  expect(screen.queryByText('路过的星球')).toBeNull()
  const groups = screen.getByRole('complementary', { name: 'My Orbit' }).querySelectorAll('.music-orbit-group')
  expect(groups[0].getAttribute('aria-label')).toBe('好友')
  expect(screen.getByText('隐身访问 · 仅你可见')).toBeTruthy()
  await screen.findByText('等待星球')
  const orbitPanel = screen.getByRole('complementary', { name: 'My Orbit' })
  expect(orbitPanel.querySelectorAll('.music-planet-card')).toHaveLength(5)
  expect(orbitPanel.querySelectorAll('.music-orbit-entry')).toHaveLength(0)
  expect(screen.getByRole('button', { name: '接受 请求星球' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '再次访问' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '回访星球' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '私信 好友星球' })).toBeTruthy()
  expect(requested).toContain('/api/me/orbit')
  expect(visitBodies).toEqual([])

  expect(screen.queryByRole('button', { name: '访问星球 潮声' })).toBeNull()
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
      if (accepted) friendSatelliteReloads += 1
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
      friends: accepted ? [{ userId: 'friend-a', planetId: 'friend-planet', displayName: '海边的人', tagline: '今晚听潮', occurredAt: '2026-09-30T09:00:00.000Z', canVisit: true, unreadCount: 1 }] : [],
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
  expect(screen.getByRole('dialog', { name: '与海边的人的私信' })).toBeTruthy()
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
  let requested = false
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
    if (url.pathname === '/api/music/discovery') return Response.json({ ranking: { mode: 'rule', status: 'fallback' }, recommendations: [
      { planetId: 'public-planet', displayName: '雨声收集者', tagline: remotePlanet.tagline, reasonCode: 'similar_genre', matchScore: .8 },
    ] })
    if (url.pathname === '/api/music/planets/public-planet/visit') return Response.json({ planet: remotePlanet })
    if (url.pathname === '/api/me/friend-requests' && init?.method === 'POST') {
      requested = true
      return Response.json({ request: { id: 'request-out', status: 'pending', planetId: 'public-planet' } }, { status: 201 })
    }
    if (url.pathname === '/api/me/friend-requests') return Response.json({ incoming: [], friends: [], outgoing: requested ? [{ id: 'request-out', userId: 'owner-b', planetId: 'public-planet', displayName: '雨声收集者', tagline: '', status: 'pending', createdAt: '2026-09-30T10:00:00.000Z' }] : [] })
    if (url.pathname === '/api/me/friend-satellites') return Response.json({ friendSatellites: [] })
    if (url.pathname === '/api/me/blocks' && init?.method === 'POST') { requested = false; return Response.json({ ok: true }) }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))

  await renderCockpit()
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  await openExploration('漫游')
  fireEvent.click(await screen.findByRole('button', { name: '访问星球 雨声收集者' }))
  await confirmVisit()
  expect(await screen.findByRole('heading', { name: '雨声收集者' })).toBeTruthy()
  const returnToOrigin = screen.getByRole('button', { name: '返回出发地', exact: true })
  expect(returnToOrigin.closest('.cockpit-terminal-footer')).toBeTruthy()
  expect(returnToOrigin.previousElementSibling).toBe(screen.getByRole('button', { name: '返回驾驶舱' }))
  expect(screen.getByRole('button', { name: '发送好友请求' }).closest('.music-public-profile')?.contains(screen.getByRole('heading', { name: '雨声收集者' }))).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '发送好友请求' }))
  expect(await screen.findByText('好友请求已发送；对方接受后，你们会出现在彼此的好友 Orbit 中。')).toBeTruthy()
  expect((screen.getByRole('button', { name: '好友请求已发送' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '屏蔽此人' }))
  expect(socialCalls.filter(call => call.method === 'POST')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '确认屏蔽' }))
  await waitFor(() => expect(document.querySelector('.cockpit[data-exterior="home"]')).toBeTruthy())
  expect(socialCalls.filter(call => call.method === 'POST')).toEqual([
    { path: '/api/me/friend-requests', method: 'POST', body: { planetId: 'public-planet' } },
    { path: '/api/me/blocks', method: 'POST', body: { planetId: 'public-planet' } },
  ])
})

function mockDriftBottleMailbox() {
  let sentToday = false
  let receiving = true
  let opened = false
  let released = false
  const bottlePayloads: unknown[] = []
  const commentPayloads: unknown[] = []
  const bottleRequests: string[] = []
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://moodverse.test')
    if (url.pathname.startsWith('/api/me/drift-bottles')) {
      bottleRequests.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    }
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
      inbox: released ? [] : [{ id: 'incoming-bottle', topicType: 'song', topicLabel: '歌曲 · 夜航', status: opened ? 'read' : 'unread', deliveredAt: new Date().toISOString(), expiresAt }],
      sent: sentToday ? [{ id: 'sent-bottle', topicType: 'song', topicLabel: '歌曲 · 夜航', status: 'delivered', deliveryCount: 1, createdAt: '2026-09-30T10:00:00.000Z' }] : [],
    })
    if (url.pathname === '/api/me/social-settings' && init?.method === 'PATCH') {
      receiving = (JSON.parse(String(init.body)) as { allowDriftBottles: boolean }).allowDriftBottles
      return Response.json({ allowFriendRequests: true, allowDriftBottles: receiving })
    }
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle' && init?.method === 'PATCH') {
      const action = (JSON.parse(String(init.body)) as { action: string }).action
      if (action === 'open') opened = true
      if (action === 'release') released = true
      return Response.json(action === 'open' ? { delivery: { status: 'read' }, alreadyOpened: false } : { released: true, status: 'waiting' })
    }
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle') return Response.json({
      bottle: { id: 'incoming-bottle', topic: { type: 'song', track: tracks[0] }, messageText: '沿着这首歌继续漂流。', sender: null },
      delivery: { id: 'delivery-a', status: 'read', deliveredAt: new Date().toISOString(), expiresAt, canRelease: true },
      comments: [],
    })
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle/comments' && init?.method === 'POST') {
      const payload = JSON.parse(String(init.body)) as { contentText: string; shareWithSender?: boolean }
      const { contentText } = payload
      commentPayloads.push(payload)
      return Response.json({ comment: { id: 'comment-a', contentText, createdAt: '2026-09-30T09:30:00.000Z', authorName: '你', isOwn: true, likeCount: 0, likedByMe: false } }, { status: 201 })
    }
    if (url.pathname === '/api/me/drift-bottles/incoming-bottle/comments/comment-a/like' && init?.method === 'POST') {
      return Response.json({ liked: true, likeCount: 1 })
    }
    if (url.pathname === '/api/me/drift-bottles/sent-bottle/journey' && (!init?.method || init.method === 'GET')) {
      return Response.json({
        bottle: { id: 'sent-bottle', status: 'waiting_for_release', createdAt: '2026-09-30T10:00:00.000Z', topic: { type: 'song', track: tracks[0] }, messageText: '沿着这首歌继续漂流。' },
        journey: { deliveryCount: 1, openedCount: 1, releasedCount: 0, commentCount: 1, lastActivityAt: '2026-09-30T10:15:00.000Z' },
        comments: [{ id: 'echo-1', authorName: '听众', isOwn: false, contentText: '这段前奏好像雨声。', createdAt: '2026-09-30T10:15:00.000Z', likedByMe: false, likeCount: 0 }],
      })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }))
  return { bottleRequests, bottlePayloads, commentPayloads, isReceiving: () => receiving, isReleased: () => released }
}

async function openBottleMailbox() {
  await renderCockpit()
  await openExploration('漂流瓶')
  await screen.findByRole('button', { name: '打开漂流瓶' })
}

test('sending a drift bottle opens the outbox and its echoes without recipient permissions', async () => {
  const mailbox = mockDriftBottleMailbox()
  await openBottleMailbox()
  expect(screen.queryByLabelText(/附上一句话/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^写一只/ }))
  fireEvent.change(screen.getByLabelText(/附上一句话/), { target: { value: '沿着这首歌继续漂流。' } })
  fireEvent.click(screen.getByRole('button', { name: '放出漂流瓶 ↗' }))
  fireEvent.click(await screen.findByRole('button', { name: /查看回声/ }))
  expect(await screen.findByText('这段前奏好像雨声。')).toBeTruthy()
  expect(mailbox.bottlePayloads).toEqual([{ topic: { type: 'song', trackId: 'song-a' }, messageText: '沿着这首歌继续漂流。' }])
  expect(mailbox.bottleRequests.filter(request => request.includes('/sent-bottle'))).toEqual(['GET /api/me/drift-bottles/sent-bottle/journey'])
  expect(screen.queryByRole('button', { name: /继续放流/ })).toBeNull()
  expect(screen.queryByRole('button', { name: '留下评论' })).toBeNull()
  expect(screen.queryByRole('checkbox', { name: '匿名寄一份给瓶主' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /^写一只/ }))
  expect(screen.getByRole('button', { name: '去看已寄出' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '放出漂流瓶 ↗' })).toBeNull()
})

test('recipients can open a drift bottle, leave a comment, like it and pass the bottle on', async () => {
  const mailbox = mockDriftBottleMailbox()
  await openBottleMailbox()
  fireEvent.click(screen.getByRole('button', { name: '打开漂流瓶' }))
  expect(await screen.findByText('沿着这首歌继续漂流。')).toBeTruthy()
  const shareWithSender = screen.getByRole('checkbox', { name: /匿名寄一份给瓶主/ }) as HTMLInputElement
  expect(shareWithSender.checked).toBe(false)
  fireEvent.change(screen.getByLabelText('添加评论'), { target: { value: '我也把这首歌放进今晚。' } })
  fireEvent.click(shareWithSender)
  fireEvent.click(screen.getByRole('button', { name: '留下评论' }))
  expect(await screen.findByText('我也把这首歌放进今晚。')).toBeTruthy()
  expect(mailbox.commentPayloads).toEqual([{ contentText: '我也把这首歌放进今晚。', shareWithSender: true }])
  expect((screen.getByRole('checkbox', { name: /匿名寄一份给瓶主/ }) as HTMLInputElement).checked).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: /^点赞/ }))
  await screen.findByRole('button', { name: /^已赞.*1/, pressed: true })
  fireEvent.click(screen.getByRole('button', { name: '继续放流 ↗' }))
  await waitFor(() => {
    expect(mailbox.isReleased()).toBe(true)
    expect(screen.queryByRole('button', { name: /继续放流|打开漂流瓶/ })).toBeNull()
  })

  const receiveToggle = screen.getByRole('checkbox', { name: /接收漂流瓶/ }) as HTMLInputElement
  expect(receiveToggle.checked).toBe(true)
  fireEvent.click(receiveToggle)
  await waitFor(() => expect(receiveToggle.checked).toBe(false))
  expect(mailbox.isReceiving()).toBe(false)
})

test('a drift bottle reply stays with the relay by default', async () => {
  const mailbox = mockDriftBottleMailbox()
  await openBottleMailbox()
  fireEvent.click(screen.getByRole('button', { name: '打开漂流瓶' }))
  const shareWithSender = await screen.findByRole('checkbox', { name: /匿名寄一份给瓶主/ }) as HTMLInputElement
  expect(shareWithSender.checked).toBe(false)
  fireEvent.change(screen.getByLabelText('添加评论'), { target: { value: '留给下一位听众' } })
  fireEvent.click(screen.getByRole('button', { name: '留下评论' }))
  await screen.findByText('留给下一位听众')
  expect(mailbox.commentPayloads).toHaveLength(1)
  expect(mailbox.commentPayloads[0]).toMatchObject({ contentText: '留给下一位听众' })
  expect(mailbox.commentPayloads[0]).not.toMatchObject({ shareWithSender: true })
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

function installCockpitFixture(onVisit?: (init?: RequestInit) => Promise<Response>, onRead?: () => Promise<Response>, galaxyGroups = [{key:'ambient',label:'ambient',planetCount:0,planets:[]}], matchCount = 1) {
  const owner = { id: 'cockpit-owner', displayName: '驾驶舱测试星球', tagline: '', visibility: 'public', visualSchemaVersion: 3,
    visual: createDitherSpec({ planetId: 'cockpit-owner', tracks }), tracks: tracks.slice(0,3) }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    if (path === '/api/music/catalog') return Response.json({ tracks })
    if (path === '/api/me/music-planet') return Response.json({ planet: owner })
    if (path === '/api/me/music-planet/moments') return Response.json({ moments: [] })
    if (path === '/api/me/orbit') return Response.json({ date: '2026-10-09', groups: { songEncounters: [], friends: [], visitedByMe: [], visitorsToMe: [], dailyRoam: [] } })
    if (path === '/api/me/friend-requests') return Response.json({ incoming: [], outgoing: [] })
    if (path === '/api/music/galaxy') return Response.json({ by: 'genre', groups: galaxyGroups })
    if (path === '/api/music/galaxy-content') return Response.json({ by: 'genre', key: 'ambient', label: 'Ambient', description: null, tracks: [], hasMore: false, nextOffset: null, status: 'local' })
    if (path === '/api/music/song-portal') return Response.json({ trackId: 'song-a', ranking: { mode: 'rule', status: 'ready' }, matches: [{ planetId: 'cockpit-target', displayName: '下一站', matchSource: 'active_selection', reasonCode: 'shared_song_selection' }].slice(0,matchCount) })
    if (path === '/api/music/planets/cockpit-target/visit' && onVisit) return onVisit(init)
    if (path === '/api/music/planets/cockpit-target' && onRead) return onRead()
    throw Error(path)
  }))
  return owner
}

test('personal monitor is a ship telemetry panel with equal song and Moment counters plus sourced playback BPM', async () => {
  const owner = installCockpitFixture()
  render(<MusicApp />)
  await waitFor(() => expect(document.querySelector('.cockpit[data-focus="overview"]')).toBeTruthy(), {timeout:10000})
  const panel=document.querySelector('.cockpit-personal-telemetry')
  expect(panel).toBeTruthy()
  const thumbnail = panel?.querySelector('.telemetry-identity [role="img"]')
  expect(thumbnail?.getAttribute('aria-label')).toBe(`${owner.displayName}的星球缩略图`)
  expect(thumbnail?.querySelector('canvas.dither-thumb')).toBeTruthy()
  expect(panel?.querySelector('svg[aria-label="飞船框架示意图"]')).toBeTruthy()
  expect(panel?.querySelector('[data-metric="SONGS"] dd')?.textContent).toBe('03')
  expect(panel?.querySelector('[data-metric="MOMENTS"] dd')?.textContent).toBe('00')
  expect(panel?.querySelector('[data-metric="BPM"] dd')?.textContent).toBe('105.1')
  expect(panel?.querySelector('[data-metric="LENGTH"] dd')?.textContent).toBe('—')
},20000)

test('personal telemetry follows the selected song metadata and clears BPM for a song without a measured tempo', async () => {
  const owner=installCockpitFixture()
  owner.tracks[0]=Object.assign({},owner.tracks[0],{audioUrl:'/api/music/tracks/song-a/stream',visualFeatures:{source:'audius',tempoBpm:128.4}})
  owner.tracks[1]=Object.assign({},owner.tracks[1],{audioUrl:'/api/music/tracks/song-b/stream'})
  await renderCockpit()
  const value=(label:string)=>document.querySelector(`[data-metric="${label}"] dd`)?.textContent
  // The existing player starts the first playable owned song automatically.
  await waitFor(()=>expect(value('BPM')).toBe('128.4'))
  expect(value('LENGTH')).toBe('3:35')
  expect(document.querySelector('.telemetry-audio')?.textContent).toContain('夜航')
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="播放 潮汐之间"]')!)
  await waitFor(()=>expect(value('BPM')).toBe('—'))
  expect(value('LENGTH')).toBe('3:23')
  expect(document.querySelector('.telemetry-audio')?.textContent).toContain('潮汐之间')
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="播放 夜航"]')!)
  await waitFor(()=>expect(value('BPM')).toBe('128.4'))
},20000)

test.each([true,false])('left monitor follows the visited planet and restores the owner on return (playable: %s)', async (playable) => {
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
  const visitorTracks=[{...tracks[3],isPrimary:true,
    ...(playable ? {audioUrl:'/api/music/tracks/song-d/stream',visualFeatures:{source:'audius',tempoBpm:135}} : {})},tracks[4]]
  const visitor={id:'cockpit-target',displayName:'客星',tagline:'',visibility:'public',tracks:visitorTracks,
    moments:[{id:'visitor-moment',trackId:'song-d',track:visitorTracks[0],contentText:'远岸的片刻',photoUrl:null,visibility:'public',publishedAt:'2026-10-10',createdAt:'2026-10-10',updatedAt:'2026-10-10'}],
    visual:createDitherSpec({planetId:'cockpit-target',tracks:visitorTracks})}
  const owner=installCockpitFixture(async()=>Response.json({planet:visitor}),async()=>Response.json({planet:visitor}))
  owner.tracks[0]=Object.assign({},owner.tracks[0],{audioUrl:'/api/music/tracks/song-a/stream',visualFeatures:{source:'audius',tempoBpm:128.4}})
  await renderCockpit()
  const panel=()=>document.querySelector('.cockpit-personal-telemetry')!
  const value=(label:string)=>panel().querySelector(`[data-metric="${label}"] dd`)?.textContent
  expect(panel().querySelector('.telemetry-callsign')?.textContent).toBe('驾驶舱测试星球')
  fireEvent.click(screen.getByRole('button',{name:'寻找与《夜航》同歌的星球'}))
  fireEvent.click(await screen.findByRole('button',{name:'访问星球 下一站'}))
  expect(panel().querySelector('.telemetry-callsign')?.textContent).toBe('驾驶舱测试星球')
  fireEvent.click(await screen.findByRole('button',{name:'继续访问'}))
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="visitor"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000,onTimeout:()=>new Error('Visitor arrival did not finish')})
  expect(panel().querySelector('.telemetry-callsign')?.textContent).toBe('客星')
  expect(panel().querySelector('[aria-label="客星的星球缩略图"] canvas')).toBeTruthy()
  expect(panel().querySelector('.telemetry-header')?.textContent).toContain('PUBLIC LINK')
  expect(value('SONGS')).toBe('02');expect(value('MOMENTS')).toBe('01')
  await waitFor(()=>expect(value('BPM')).toBe(playable ? '135' : '—'))
  expect(value('LENGTH')).toBe(playable ? '3:00' : '—')
  expect(panel().querySelector('.telemetry-audio')?.textContent).toContain(playable ? '远岸' : '暂无播放歌曲')
  fireEvent.click(screen.getByRole('button',{name:'回星球'}))
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="home"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000,onTimeout:()=>new Error('Home arrival did not finish')})
  expect(panel().querySelector('.telemetry-callsign')?.textContent).toBe('驾驶舱测试星球')
  expect(panel().querySelector('[aria-label="驾驶舱测试星球的星球缩略图"] canvas')).toBeTruthy()
  expect(panel().querySelector('.telemetry-header')?.textContent).toContain('LOCAL LINK')
  expect(value('SONGS')).toBe('03');expect(value('MOMENTS')).toBe('00')
  await waitFor(()=>expect(value('BPM')).toBe('128.4'))
  expect(value('LENGTH')).toBe('3:35')
},30000)

test('explicitly cancelling collision results clears the named mini-map contacts', async () => {
  installCockpitFixture()
  await renderCockpit()
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="寻找与《夜航》同歌的星球"]')!)
  await waitFor(() => expect(document.querySelector('.cockpit-radar-preview small')?.textContent).toMatch(/1/), {timeout:10000})
  const nodes=document.querySelectorAll('.cockpit-signal-map [data-signal-id]')
  expect(nodes).toHaveLength(1)
  expect(nodes[0].getAttribute('data-signal-id')).toBe('cockpit-target')
  expect(nodes[0].textContent).toContain('下一站')
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="关闭同歌结果"]')!)
  expect(document.querySelectorAll('.cockpit-signal-map [data-signal-id]')).toHaveLength(0)
  expect(document.querySelector('.music-song-portal')).toBeNull()
  expect(document.querySelector('.cockpit')?.getAttribute('data-focus')).toBe('exploration')
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  expect(document.querySelectorAll('.cockpit-signal-map [data-signal-id]')).toHaveLength(0)
},20000)

test.each([0,1])('exploration preview retains %i scan results on ordinary return but clears on explicit cancellation', async (count) => {
  installCockpitFixture(undefined,undefined,undefined,count)
  await renderCockpit()
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="寻找与《夜航》同歌的星球"]')!)
  await waitFor(() => expect(document.querySelector('.music-song-portal .music-close-inline')).toBeTruthy(), {timeout:10000})
  const preview = () => document.querySelector<HTMLElement>('.cockpit-radar-preview')!
  await waitFor(() => expect(preview().querySelector('small')?.textContent).toBe(`${count} SIGNALS`), {timeout:10000})
  expect(preview().querySelector('span')?.textContent).toBe('SCAN RESULTS')
  expect(preview().dataset.scanning).toBe('true')
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="返回驾驶舱"]')!)
  expect(preview().querySelector('span')?.textContent).toBe('SCAN RESULTS')
  expect(preview().dataset.scanning).toBe('true')
  fireEvent.click(document.querySelector<HTMLButtonElement>('.cockpit-exploration-monitor')!)
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="关闭同歌结果"]')!)
  expect(preview().dataset.scanning).toBe('false')
  expect(preview().querySelector('span')?.textContent).toBe('SYSTEM ON')
  expect(preview().querySelector('small')?.textContent).toBe('0 SIGNALS')
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  fireEvent.click(screen.getByRole('button',{name:'打开探索终端'}))
  expect(document.querySelector('.music-song-portal')).toBeNull()
},30000)

test('cancelling an in-flight song search prevents its late response from restoring the results', async () => {
  installCockpitFixture()
  const originalFetch=globalThis.fetch
  let completeSearch!: (response:Response) => void
  vi.stubGlobal('fetch',(input:RequestInfo|URL,init?:RequestInit) => {
    if(new URL(String(input),'https://moodverse.test').pathname==='/api/music/song-portal') return new Promise<Response>(resolve=>{completeSearch=resolve})
    return originalFetch(input,init)
  })
  await renderCockpit()
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="寻找与《夜航》同歌的星球"]')!)
  await waitFor(()=>expect(document.querySelector('.music-song-portal .music-close-inline')).toBeTruthy(),{timeout:10000})
  fireEvent.click(document.querySelector<HTMLButtonElement>('[aria-label="关闭同歌结果"]')!)
  expect(document.querySelector('.music-song-portal')).toBeNull()
  await act(async()=>{
    completeSearch(Response.json({trackId:'song-a',ranking:{mode:'rule',status:'ready'},matches:[{planetId:'late-match',displayName:'不应回来',matchSource:'active_selection',reasonCode:'shared_song_selection'}]}))
  })
  expect(document.querySelector('.music-song-portal')).toBeNull()
  expect(document.querySelectorAll('.cockpit-signal-map [data-signal-id]')).toHaveLength(0)
  expect(document.querySelector('.cockpit-signal-map')?.getAttribute('data-scanning')).toBe('false')
},20000)

test.each(['home','visitor'])('opening the middle monitor from %s only restores the previous song results', async (destination) => {
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
  const visitorTracks=[{...tracks[3],isPrimary:true,audioUrl:'/api/music/tracks/song-d/stream'},tracks[4]]
  const visitor={id:'cockpit-target',displayName:'客星',tagline:'',visibility:'public',tracks:visitorTracks,moments:[],visual:createDitherSpec({planetId:'cockpit-target',tracks:visitorTracks})}
  installCockpitFixture(async()=>Response.json({planet:visitor}),async()=>Response.json({planet:visitor}))
  await renderCockpit()
  const searches=()=>vi.mocked(fetch).mock.calls.map(([input])=>new URL(String(input),'https://moodverse.test')).filter(url=>url.pathname==='/api/music/song-portal').map(url=>url.searchParams.get('trackId'))
  const preview=()=>document.querySelector('.cockpit-signal-map')!.innerHTML
  fireEvent.click(screen.getByRole('button',{name:'寻找与《潮汐之间》同歌的星球'}))
  await screen.findByRole('button',{name:'访问星球 下一站'})
  const savedPreview=preview()
  expect(searches()).toEqual(['song-b'])
  if(destination==='visitor') {
    fireEvent.click(screen.getByRole('button',{name:'访问星球 下一站'}))
    fireEvent.click(await screen.findByRole('button',{name:'继续访问'}))
    await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="visitor"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000,onTimeout:()=>new Error('Visitor arrival did not finish')})
  } else {
    fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
    fireEvent.click(screen.getByRole('button',{name:'回星球'}))
    await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="home"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000,onTimeout:()=>new Error('Home arrival did not finish')})
  }
  expect(preview()).toBe(savedPreview)
  fireEvent.click(screen.getByRole('button',{name:'打开探索终端'}))
  expect(searches()).toEqual(['song-b'])
  expect(screen.getByRole('heading',{name:'与《潮汐之间》同歌'})).toBeTruthy()
  expect(preview()).toBe(savedPreview)
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  fireEvent.click(screen.getByRole('button',{name:'打开个人终端'}))
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  fireEvent.click(screen.getByRole('button',{name:'撞歌',exact:true}))
  expect(searches()).toEqual(['song-b'])
  expect(preview()).toBe(savedPreview)
},30000)

test('visit confirmation preloads only the destination song without playing it or recording a visit', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const sources: Array<{ src: string; paused: boolean; plays: number }> = []
  vi.stubGlobal('Audio', class extends EventTarget {
    src = ''; paused = true; plays = 0; currentTime = 0; preload = ''; loop = false; volume = 0
    constructor() { super(); sources.push(this) }
    play() { this.plays++; this.paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
    load() {} removeAttribute() { this.src = '' }
  })
  let posts = 0
  installCockpitFixture(async () => { posts++; return Response.json({}) }, async () => Response.json({ planet: {
    id: 'cockpit-target', tracks: [{ ...tracks[0], id: 'audius:target', isPrimary: true, audioUrl: '/api/music/tracks/audius%3Atarget/stream' }],
  } }))
  await renderCockpit()
  fireEvent.click(screen.getByRole('button', { name: '寻找与《夜航》同歌的星球' }))
  fireEvent.click(await screen.findByRole('button', { name: '访问星球 下一站' }))
  await waitFor(() => expect(sources.some(audio => audio.src === '/api/music/tracks/audius%3Atarget/stream')).toBe(true))
  const warmed = sources.find(audio => audio.src === '/api/music/tracks/audius%3Atarget/stream')!
  expect(warmed.paused).toBe(true); expect(warmed.plays).toBe(0); expect(posts).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: '暂不访问' }))
  await waitFor(() => expect(warmed.src).toBe(''))
  expect(posts).toBe(0)
})

test('clicking a Galaxy star opens a dismissible floating window without entering the exploration terminal', async () => {
  installCockpitFixture()
  render(<MusicApp />)
  fireEvent.click(await screen.findByRole('button', { name: '场景星系：ambient' }, { timeout: 15000 }))
  const dialog = await screen.findByRole('dialog', { name: 'ambient 星系' }, { timeout: 5000 })
  expect(document.querySelector('.cockpit')?.getAttribute('data-focus')).toBe('overview')
  expect(within(dialog).queryByRole('group', { name: 'Galaxy 分组方式' })).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭星系窗口' }))
  expect(screen.queryByRole('dialog', { name: 'ambient 星系' })).toBeNull()
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
})

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

test.each([['genre','GENRE'],['artist','ARTIST'],['song','SONG']] as const)('returning from a selected %s Galaxy restores the exploration standby preview', async (by, label) => {
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
  const owner = {id:'preview-owner',displayName:'我的星球',visibility:'public',tagline:'',tracks:tracks.slice(0,3),visual:createDitherSpec({planetId:'preview-owner',tracks})}
  vi.stubGlobal('fetch',vi.fn(async (input:RequestInfo|URL)=>{
    const url=new URL(String(input),'https://moodverse.test')
    if(url.pathname==='/api/me/music-planet') return Response.json({planet:owner})
    if(url.pathname==='/api/music/catalog') return Response.json({tracks})
    if(url.pathname==='/api/music/galaxy') { const dimension=url.searchParams.get('by') ?? 'genre';return Response.json({by:dimension,groups:[{key:'selected',label:`selected-${dimension}`,planetCount:0,planets:[]}]}) }
    if(url.pathname==='/api/music/galaxy-content') return Response.json({by,key:'selected',tracks:[],status:'local',hasMore:false,nextOffset:null})
    return Response.json({moments:[],incoming:[],outgoing:[]})
  }))
  render(<MusicApp />)
  await screen.findByRole('button',{name:'场景星系：selected-genre'},{timeout:10000})
  if(by!=='genre') fireEvent.click(screen.getByRole('button',{name:label,exact:true}))
  fireEvent.click(await screen.findByRole('button',{name:`场景星系：selected-${by}`},{timeout:10000}))
  expect(document.querySelector('.cockpit-radar-preview > span')?.textContent).toBe(`selected-${by}`)
  fireEvent.click(screen.getByRole('button',{name:'关闭星系窗口'}))
  fireEvent.click(screen.getByRole('button',{name:'回星球'}))
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="home"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000})
  expect(document.querySelector('.cockpit-radar-preview > span')?.textContent).toBe('SYSTEM ON')
},30000)

test('collision on a visited planet uses its songs and carries its source into the onward search', async () => {
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
  const visitor = {id:'cockpit-target',displayName:'客星',tagline:'',visibility:'public',tracks:[{...tracks[3],isPrimary:true},{...tracks[4],audioUrl:'/api/music/tracks/song-e/stream'}],moments:[],visual:createDitherSpec({planetId:'cockpit-target',tracks:tracks.slice(3)})}
  installCockpitFixture(async()=>Response.json({planet:visitor}),async()=>Response.json({planet:visitor}))
  await renderCockpit()
  fireEvent.click(screen.getByRole('button',{name:'寻找与《夜航》同歌的星球'}))
  fireEvent.click(await screen.findByRole('button',{name:'访问星球 下一站'}))
  fireEvent.click(await screen.findByRole('button',{name:'继续访问'}))
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="visitor"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000,onTimeout:()=>new Error('Visitor arrival did not finish')})
  fireEvent.click(screen.getByRole('button',{name:'查看星球：客星'}))
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  fireEvent.click(screen.getByRole('button',{name:'撞歌',exact:true}))
  const collision=screen.getByRole('complementary',{name:'同歌搜索'})
  expect(within(collision).getAllByText('远岸').length).toBeGreaterThan(0)
  expect(within(collision).getAllByText('月面信号').length).toBeGreaterThan(0)
  expect(within(collision).queryByText('雾灯')).toBeNull()
  let requested=vi.mocked(fetch).mock.calls.map(([input])=>new URL(String(input),'https://moodverse.test'))
  expect(requested.filter(u=>u.pathname==='/api/music/song-portal')).toHaveLength(1)
  fireEvent.click(within(collision).getByRole('button',{name:'下一张 CD'}))
  requested=vi.mocked(fetch).mock.calls.map(([input])=>new URL(String(input),'https://moodverse.test'))
  expect(requested.filter(u=>u.pathname==='/api/music/song-portal')).toHaveLength(1)
  fireEvent.click(within(collision).getByRole('button',{name:'播放 月面信号'}))
  requested=vi.mocked(fetch).mock.calls.map(([input])=>new URL(String(input),'https://moodverse.test'))
  expect(requested.filter(u=>u.pathname==='/api/music/song-portal')).toHaveLength(1)
  expect(screen.getByRole('heading',{name:'与《夜航》同歌'})).toBeTruthy()
  fireEvent.click(within(collision).getByRole('button',{name:'撞歌 ↗'}))
  requested=vi.mocked(fetch).mock.calls.map(([input])=>new URL(String(input),'https://moodverse.test'))
  expect(requested.filter(u=>u.pathname==='/api/music/song-portal').at(-1)?.searchParams.get('trackId')).toBe('song-e')
  expect(requested.filter(u=>u.pathname==='/api/music/song-portal').at(-1)?.searchParams.get('sourcePlanetId')).toBe('cockpit-target')
  await waitFor(()=>expect(document.querySelector('.signal-map-heading')?.textContent).toBe('SCAN RESULTS'))
  const savedPreview=document.querySelector('.cockpit-signal-map')!.innerHTML
  fireEvent.click(screen.getByRole('button',{name:'返回驾驶舱'}))
  fireEvent.click(screen.getByRole('button',{name:'回星球'}))
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="home"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000,onTimeout:()=>new Error('Home arrival did not finish')})
  fireEvent.click(screen.getByRole('button',{name:'打开探索终端'}))
  expect(screen.getByRole('heading',{name:'与《月面信号》同歌'})).toBeTruthy()
  expect(document.querySelector('.cockpit-signal-map')!.innerHTML).toBe(savedPreview)
  requested=vi.mocked(fetch).mock.calls.map(([input])=>new URL(String(input),'https://moodverse.test'))
  expect(requested.filter(u=>u.pathname==='/api/music/song-portal')).toHaveLength(2)
  expect(requested.filter(u=>u.pathname==='/api/music/song-portal').at(-1)?.searchParams.get('sourcePlanetId')).toBe('cockpit-target')
},30000)

test('wheel fills the final axis leg before the shorter separate home approach enters flight', async () => {
  vi.spyOn(document,'hidden','get').mockReturnValue(false)
  installCockpitFixture(undefined,undefined,Array.from({length:8},(_,index)=>({key:index?`sector-${index}`:'ambient',label:index?`sector-${index}`:'ambient',planetCount:0,planets:[]})))
  render(<MusicApp />)
  await waitFor(()=>expect(document.querySelector('[aria-label="前往星系 ambient"]')).toBeTruthy(),{timeout:30000})
  const stage=document.querySelector('.dither-stage')!
  fireEvent.click(document.querySelector('[aria-label="前往星系 ambient"]')!)
  const axisFill=()=>Number(document.querySelector<HTMLElement>('.music-galaxy-axis-track > i')?.style.transform.match(/scaleX\(([^)]+)\)/)?.[1])
  for(let n=0;n<28;n++) fireEvent.wheel(stage,{deltaY:-10000})
  expect(axisFill(),JSON.stringify({connected:stage.isConnected,exterior:document.querySelector('.cockpit')?.getAttribute('data-exterior'),focus:document.querySelector('.cockpit')?.getAttribute('data-focus')})).toBeCloseTo(.875)
  fireEvent.wheel(stage,{deltaY:-10000})
  expect(axisFill()).toBeGreaterThan(.875)
  expect(axisFill()).toBeLessThan(1)
  for(let n=0;n<3;n++) fireEvent.wheel(stage,{deltaY:-10000})
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
  expect(document.querySelector('.cockpit.is-in-flight')).toBeNull()
  fireEvent.wheel(stage,{deltaY:-10000})
  expect(axisFill()).toBe(1)
  expect(document.querySelector('.cockpit.is-in-flight')).toBeTruthy()
  await waitFor(()=>expect(document.querySelector('.cockpit[data-exterior="home"]:not(.is-in-flight)')).toBeTruthy(),{timeout:10000,onTimeout:()=>new Error('Home arrival did not finish')})
},30000)

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
  render(<MusicApp />)
  await waitFor(()=>expect(document.querySelector('[aria-label="前往星系 ambient"]')).toBeTruthy(),{timeout:30000})
  await openGalaxyList()
  const before = document.querySelector('.cockpit-viewport .music-galaxy-axis')?.innerHTML
  for (let i = 0; i < 100; i++) fireEvent.wheel(document.querySelector('.cockpit-terminal-content')!, { deltaY: -10000 })
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
  expect(document.querySelector('.cockpit-viewport .music-galaxy-axis')?.innerHTML).toBe(before)
  expect(document.querySelector('.cockpit.is-in-flight')).toBeNull()
},60000)

test('a slow visit holds in the nebula without a cancel button, double confirmation posts once, and arrival resumes when ready', async () => {
  // Navigation is exercised in a visible page; jsdom defaults to hidden.
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const responses: Array<(value: Response) => void> = []
  let posts = 0
  const owner = installCockpitFixture(async () => { posts++; return new Promise<Response>(resolve => responses.push(resolve)) })
  await renderCockpit()
  fireEvent.click(screen.getByRole('button', { name: '寻找与《夜航》同歌的星球' }))
  fireEvent.click(await screen.findByRole('button', { name: '访问星球 下一站' }))
  const confirm = screen.getByRole('button', { name: '继续访问' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  await waitFor(() => expect(document.querySelector('.dither-stage')?.getAttribute('data-flight-progress')).toBe('0.5'), { timeout: 10000, onTimeout: () => new Error(`Flight did not reach hold: ${document.querySelector('.dither-stage')?.getAttribute('data-flight-progress')}; hidden=${document.hidden}`) })
  expect(posts).toBe(1)
  expect(document.querySelector('.cockpit')?.getAttribute('data-exterior')).toBe('galaxy')
  expect(screen.queryByRole('button', { name: '取消航行' })).toBeNull()
  expect(responses).toHaveLength(1)
  await act(async () => responses[0](Response.json({ planet: { ...owner, id: 'cockpit-target', displayName: '当前结果', moments: [] } })))
  await waitFor(() => expect(document.querySelector('.cockpit[data-exterior="visitor"]:not(.is-in-flight)')).toBeTruthy(), { timeout: 10000, onTimeout: () => new Error(JSON.stringify({ page: document.querySelector('.cockpit')?.outerHTML.slice(0,400), progress: { ...document.querySelector<HTMLElement>('.dither-stage')?.dataset }, alerts: [...document.querySelectorAll('[role=alert]')].map(e=>e.textContent) })) })
  expect(document.querySelector('.cockpit')?.getAttribute('data-page')).toBe('visitor')
  expect(document.querySelector('.cockpit')?.getAttribute('data-focus')).toBe('overview')
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
