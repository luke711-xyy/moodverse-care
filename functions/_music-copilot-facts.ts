import type { Env } from './_shared'
import { audiusCatalog } from './_music-audius'
import { CATALOG_VISUAL_COLUMNS, catalogTrack, type CatalogTrackRow } from './_music-dither'
import type { CopilotCard, CopilotContext, CopilotMemory, CopilotMessage } from '../src/music/copilot/contracts'
import type { MusicTrackSummary } from '../src/music-domain'

const eligible = "c.is_active=1 AND c.provider<>'moodverse-demo'"
const visible = `p.visibility='public' AND p.owner_user_id<>?1 AND p.owner_user_id NOT LIKE 'demo:%'
  AND NOT EXISTS (SELECT 1 FROM music_demo_actors d WHERE d.user_id=p.owner_user_id) AND NOT EXISTS (
  SELECT 1 FROM music_user_blocks b WHERE (b.blocker_user_id=?1 AND b.blocked_user_id=p.owner_user_id)
  OR (b.blocked_user_id=?1 AND b.blocker_user_id=p.owner_user_id))`
const aliases: [RegExp, string[]][] = [
  [/爵士|jazz/i, ['jazz']],
  [/摇滚|rock/i, ['rock']],
  [/电子|electronic/i, ['electronic']],
  [/民谣|folk/i, ['folk']],
  [/嘻哈|说唱|hip.?hop|rap/i, ['hip-hop', 'rap']],
  [/古典|classical/i, ['classical']],
  [/流行|pop/i, ['pop']],
  [/氛围|ambient/i, ['ambient']],
  [/低保真|lo.?fi/i, ['lo-fi', 'lofi']],
  [/金属|metal/i, ['metal']],
  [
    /安静|轻柔|放松|舒缓|睡前|平静|静一静|焦虑|失眠|累|chill|calm/i,
    ['calm', 'peaceful', 'chill', 'relax', 'ambient', 'downtempo', 'acoustic', 'mellow'],
  ],
  [/振奋|运动|提神|有劲|活力|开心|跑步|energetic/i, ['energetic', 'upbeat', 'happy', 'dance', 'electro', 'energi']],
  [/难过|伤心|低落|伤感|悲伤|sad/i, ['sad', 'melanchol', 'reflective', 'mellow']],
]
const tempo = (text: string) =>
  /慢|舒缓|平静|睡前|安静|slower/i.test(text) ? -1 : /快|振奋|运动|提神|跑步|faster/i.test(text) ? 1 : 0
const bpm = (t: MusicTrackSummary) =>
  typeof t.visualFeatures?.tempoBpm === 'number' ? t.visualFeatures.tempoBpm : null
const palette = (text: string) => [...new Set(aliases.flatMap(([pattern, tags]) => (pattern.test(text) ? tags : [])))]
const hasTag = (value: string, needle: string) => value.toLowerCase().includes(needle.toLowerCase())
// Interpret corrections before matching so "不要摇滚，改成爵士" cannot boost the rejected genre.
function listenRequest(text: string) {
  const rejected: string[] = []
  const positive = text.replace(
    /(?:不要再?听?|别再?放?|不想听|不喜欢听?|不爱听|排除|不听|不要推荐)([^，。；、,!?！？\n]{1,32})/g,
    (_, raw: string) => {
      const [negative, ...rest] = raw.split(/(?:改成|改为|换成|换点|换个|想听|来点|还是听)/)
      rejected.push(...palette(negative), negative.trim().toLowerCase())
      return rest.join(' ')
    },
  )
  return { positive, rejected: rejected.filter(Boolean) }
}
const rejectedTrack = (t: MusicTrackSummary, filters: string[]) =>
  [t.title, t.artistName, ...t.genres, ...t.moodTags].some((s) => filters.some((f) => hasTag(s, f)))

function ranking(t: MusicTrackSummary, text: string, remembered: string, similar?: MusicTrackSummary) {
  const all = [...t.genres, ...t.moodTags],
    m = text.toLowerCase()
  const exact = [t.title, t.artistName].some((s) => s && m.includes(s.toLowerCase()))
  const selected = palette(text)
  const matched = all.filter((tag) => selected.some((s) => hasTag(tag, s)) || m.includes(tag.toLowerCase()))
  const preference = palette(remembered)
  const rememberedTags = all.filter(
    (tag) => preference.some((s) => hasTag(tag, s)) || remembered.toLowerCase().includes(tag.toLowerCase()),
  )
  const overlap = all.filter(
    (tag) => similar && [...similar.genres, ...similar.moodTags].some((s) => s.toLowerCase() === tag.toLowerCase()),
  )
  const rate = bpm(t),
    direction = tempo(text),
    target = Number(text.match(/(\d{2,3})\s*bpm/i)?.[1]) || 0
  const tempoScore =
    rate && target
      ? Math.max(0, 110 - Math.abs(rate - target) * 4)
      : rate && direction
        ? Math.max(0, Math.min(90, direction < 0 ? 150 - rate : rate - 65))
        : 0
  return {
    score: (exact ? 200 : 0) + matched.length * 100 + tempoScore + rememberedTags.length * 8 + overlap.length * 12,
    reason:
      [
        exact ? '匹配歌名或艺人' : '',
        matched.length
          ? matched.join(' · ')
          : overlap.length
            ? '相同标签 · ' + overlap.join(' · ')
            : rememberedTags.length
              ? '偏好 · ' + rememberedTags.join(' · ')
              : all.slice(0, 2).join(' · '),
        rate ? rate + ' BPM' : '',
      ]
        .filter(Boolean)
        .join(' · ') || '来自 MOSIC 曲库',
  }
}
async function tracksByIds(env: Env, ids: string[]) {
  if (!ids.length) return new Map<string, MusicTrackSummary>()
  const rows = await env.DB.prepare(
    `SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c WHERE ${eligible}
    AND c.id IN (SELECT value FROM json_each(?))`,
  )
    .bind(JSON.stringify(ids))
    .all<CatalogTrackRow>()
  return new Map(rows.results.map((row) => [row.id, catalogTrack(row)]))
}
export async function refreshMessages(env: Env, userId: string, messages: CopilotMessage[]) {
  const old = messages.flatMap((m) => m.cards ?? [])
  if (!old.length) return messages
  const tracks = await tracksByIds(
    env,
    old.flatMap((c) => (c.type === 'track' ? [c.track.id] : [])),
  )
  const planetIds = old.flatMap((c) => (c.type === 'planet' ? [c.planetId] : []))
  const planets = planetIds.length
    ? (
        await env.DB.prepare(
          `SELECT p.id,p.display_name FROM music_planets p
    WHERE ${visible} AND p.id IN (SELECT value FROM json_each(?2))`,
        )
          .bind(userId, JSON.stringify(planetIds))
          .all<{ id: string; display_name: string }>()
      ).results
    : []
  return messages.map((m) => {
    if (!m.cards?.length) return m
    const valid: CopilotCard[] = []
    for (const c of m.cards) {
      if (c.type === 'track') {
        const track = tracks.get(c.track.id)
        if (track) valid.push({ ...c, track })
      } else {
        const p = planets.find((p) => p.id === c.planetId)
        if (p) valid.push({ ...c, displayName: p.display_name })
      }
    }
    if (valid.length !== m.cards.length)
      return { ...m, text: '先前推荐的部分内容已不可用。', cards: valid, playTrackId: undefined }
    return { ...m, cards: valid }
  })
}

export async function copilotFacts(
  env: Env,
  uid: string,
  text: string,
  context: CopilotContext,
  history: CopilotMessage[],
  memories: CopilotMemory[],
) {
  const prev =
    [...history]
      .reverse()
      .find((m) => m.cards?.some((c) => c.type === 'track'))
      ?.cards?.filter((c) => c.type === 'track') ?? []
  const index = text.match(/第\s*([1-9一二两三四五六七八九])\s*[首个]/)?.[1]
  const n = index ? Number(index) || '一二三四五六七八九'.indexOf(index.replace('两', '二')) + 1 : 0
  const explicitPlay =
    /播放|播一下|放一下|放一首|来放|听第|play\b/i.test(text) &&
    !/不(要|用|想)?(播|放|听)|别(播|放)|暂停|停止/i.test(text)
  const isPlanet = /星球|星系|同好|听众|同频|拜访|遇见|planet/i.test(text)
  const weekly = /热门|热榜|人气|流行榜|趋势|本周|最近很火|trending/i.test(text)
  const change = /换一|换些|换个|换几|不要这|别这|另外|其他|再来|不同|慢一点|快一点/.test(text)
  const focusId = n ? prev[n - 1]?.track.id : context.trackId
  const focused = focusId ? (await tracksByIds(env, [focusId])).get(focusId) : undefined
  const prior = [...history].reverse().find((m) => m.role === 'user')?.text ?? ''
  const request = listenRequest(text)
  const asked =
    request.positive +
    (change && !palette(request.positive).length && !tempo(text) && !request.rejected.length
      ? ' ' + listenRequest(prior).positive
      : '')
  const prefs = memories.map((m) => listenRequest(m.text))
  const remembered = prefs.map((p) => p.positive).join(' ')
  const declined = new Set([
    ...request.rejected,
    ...prefs.flatMap((p) => p.rejected).filter((f) => !palette(request.positive).includes(f)),
  ])
  const excluded = [...declined]
  let cards: CopilotCard[] = []
  let weeklyVerified = false
  const reference =
    (!!n || /这首|当前|正在听|正在播|这支|这曲/.test(text)) && !change && !isPlanet && !/类似|相似|同风格/.test(text)
  if (reference) {
    if (focused)
      cards = [{ type: 'track', track: focused, reason: ranking(focused, asked, remembered).reason, source: 'catalog' }]
  } else if (isPlanet) {
    const rows = await env.DB.prepare(
      `SELECT ${CATALOG_VISUAL_COLUMNS}, p.id AS planet_id,p.display_name
      FROM music_planets p JOIN music_planet_tracks t ON t.planet_id=p.id JOIN music_track_catalog c ON t.track_id=c.id
      WHERE ${visible} AND ${eligible}
      ORDER BY (c.id=?2) DESC, p.updated_at DESC, p.id,t.position LIMIT 300`,
    )
      .bind(uid, focused?.id ?? '')
      .all<CatalogTrackRow & { planet_id: string; display_name: string }>()
    const seen = new Set<string>()
    for (const row of rows.results
      .map((r) => ({ ...r, rank: ranking(catalogTrack(r), asked, remembered, focused) }))
      .sort(
        (a, b) => (b.id === focused?.id ? 300 : 0) + b.rank.score - ((a.id === focused?.id ? 300 : 0) + a.rank.score),
      )) {
      if (seen.has(row.planet_id) || rejectedTrack(catalogTrack(row), excluded)) continue
      seen.add(row.planet_id)
      cards.push({
        type: 'planet',
        planetId: row.planet_id,
        displayName: row.display_name,
        source: 'public_planet',
        reason: '星球收藏了《' + row.title + '》 · ' + row.rank.reason,
      })
      if (cards.length === 3) break
    }
  } else if (
    weekly ||
    explicitPlay ||
    change ||
    /推荐|听|曲|歌|音乐|节奏|风格|bpm|来点|来一|摇滚|爵士|民谣|安静|放松|类似|相似|music|track|song/i.test(text) ||
    palette(text).length
  ) {
    let tracks: MusicTrackSummary[] = []
    if (weekly && env.AUDIUS_API_KEY) {
      const result = await audiusCatalog(env, '', '', 0)
      if (result.status === 'live' || result.status === 'cached') {
        tracks = result.tracks
        weeklyVerified = tracks.length > 0
      }
    }
    if (!weeklyVerified) {
      const terms = [...palette(asked), ...(asked.toLowerCase().match(/[a-z0-9][a-z0-9 -]{1,30}/g) ?? [])]
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
      const rows = await env.DB.prepare(
        `SELECT ${CATALOG_VISUAL_COLUMNS} FROM music_track_catalog c WHERE ${eligible}
        ORDER BY (instr(lower(?1),lower(c.title))>0 OR instr(lower(?1),lower(c.artist_name))>0) DESC,
        (SELECT count(*) FROM json_each(?2) term WHERE instr(lower(c.genres_json || ' ' || c.mood_tags_json),lower(term.value))>0) DESC,
        c.updated_at DESC,c.id LIMIT 240`,
      )
        .bind(asked, JSON.stringify(terms))
        .all<CatalogTrackRow>()
      tracks = rows.results.map(catalogTrack)
    }
    const exclude = new Set(change ? prev.map((c) => c.track.id) : [])
    const ordered = tracks
      .filter((t) => !exclude.has(t.id) && !rejectedTrack(t, excluded))
      .map((t) => ({ t, ...ranking(t, asked, remembered, focused) }))
    if (!weeklyVerified) ordered.sort((a, b) => b.score - a.score)
    cards = ordered
      .slice(0, 3)
      .map(({ t, reason }) => ({
        type: 'track',
        track: t,
        source: weeklyVerified ? 'audius_weekly' : 'catalog',
        reason: weeklyVerified ? 'Audius 本周热榜 · ' + reason : reason,
      }))
  }
  const found = cards.find((c) => c.type === 'track' && c.track.audioUrl)
  return {
    cards,
    playTrackId: explicitPlay && found?.type === 'track' ? found.track.id : undefined,
    detail:
      weekly && !weeklyVerified
        ? '无法核实本周热榜，仅能查询本地曲库。'
        : reference && !focused
          ? '当前引用的歌曲不可用。'
          : !cards.length && (isPlanet || change || explicitPlay)
            ? '当前没有找到符合条件的可用候选。'
            : '',
    focused,
    contextPlanet: context.planetId
      ? await env.DB.prepare(
          `SELECT p.display_name AS name FROM music_planets p
      WHERE p.id=?2 AND (p.owner_user_id=?1 OR (${visible}))`,
        )
          .bind(uid, context.planetId)
          .first<{ name: string }>()
      : null,
  }
}
