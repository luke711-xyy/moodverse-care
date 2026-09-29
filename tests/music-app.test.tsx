// @vitest-environment jsdom
import React, { createElement } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MusicApp from '../src/music/MusicApp'

vi.mock('../src/scene', () => ({
  UniverseCanvas: () => createElement('div', { 'aria-label': '星球 3D 场景' }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const tracks = [
  { id: 'song-a', title: '夜航', artistId: 'artist-a', artistName: '星际旅人', versionLabel: '', genres: ['ambient'], moodTags: ['calm'], officialUrl: 'https://music.example/a', coverUrl: null, durationSeconds: 215 },
  { id: 'song-b', title: '潮汐之间', artistId: 'artist-b', artistName: '潮汐', versionLabel: '', genres: ['indie'], moodTags: ['reflective'], officialUrl: 'https://music.example/b', coverUrl: null, durationSeconds: 203 },
  { id: 'song-c', title: '雾灯', artistId: 'artist-c', artistName: '雨季', versionLabel: '', genres: ['dream pop'], moodTags: ['hopeful'], officialUrl: 'https://music.example/c', coverUrl: null, durationSeconds: 198 },
  { id: 'song-d', title: '远岸', artistId: 'artist-d', artistName: '远岸', versionLabel: '', genres: ['folk'], moodTags: ['warm'], officialUrl: 'https://music.example/d', coverUrl: null, durationSeconds: 180 },
]

test('a new user can choose exactly three songs, create a public planet and see the AI-composed world', async () => {
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

  render(<MusicApp />)
  await screen.findByRole('heading', { name: '为你的星球选三首歌' })
  fireEvent.change(screen.getByLabelText('星球名称'), { target: { value: '夜航者' } })
  fireEvent.change(screen.getByLabelText('一句星球简介（可选）'), { target: { value: '慢慢靠岸' } })

  fireEvent.click(screen.getByRole('button', { name: '夜航 · 星际旅人' }))
  fireEvent.click(screen.getByRole('button', { name: '潮汐之间 · 潮汐' }))
  fireEvent.click(screen.getByRole('button', { name: '雾灯 · 雨季' }))
  expect((screen.getByRole('button', { name: '远岸 · 远岸' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '生成我的星球' }))

  expect(await screen.findByRole('heading', { name: /夜航者/ })).toBeTruthy()
  expect(await screen.findByText('被三首歌照亮的星球。')).toBeTruthy()
  expect(screen.getByRole('link', { name: '夜航 · 星际旅人 · 在官方平台打开' }).getAttribute('href')).toBe('https://music.example/a')
  expect(createdPayload).toEqual({ displayName: '夜航者', tagline: '慢慢靠岸', trackIds: ['song-a', 'song-b', 'song-c'], visibility: 'public' })
})

test('an API 401 explains that Cloudflare Access email verification is required', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    return path === '/api/music/catalog'
      ? Response.json({ tracks })
      : Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 })
  }))

  render(<MusicApp />)
  expect(await screen.findByRole('heading', { name: /先验证你的邮箱/ })).toBeTruthy()
  expect(screen.getByText(/邮箱一次性验证码登录/)).toBeTruthy()
})

test('an empty catalog explains that the controlled catalog must be populated before planet creation', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://moodverse.test').pathname
    return path === '/api/music/catalog' ? Response.json({ tracks: [] }) : Response.json({ planet: null })
  }))

  render(<MusicApp />)
  expect(await screen.findByText('曲库还没有可选歌曲')).toBeTruthy()
  expect(screen.getByText(/添加曲目后，你就可以开始创建星球/)).toBeTruthy()
})
