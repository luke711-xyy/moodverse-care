import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createMusicApi, type MusicApi, type MusicReportReason } from '../../music-api'
import type { MusicTrackSummary } from '../../music-domain'
import type { IntroductionMode, PublicIntroduction, SocialChannel } from './social-types'
import './social-introductions.css'

type Props = {
  onVisitPlanet: (planetId: string) => void
  onPlayTrack: (track: MusicTrackSummary) => void
  api?: Pick<MusicApi, 'createFriendRequest' | 'reportContent' | 'blockPlanet'>
}
const modeNames: Record<IntroductionMode, string> = {
  recommend: '仅推荐给我',
  confirm: '每次出发前确认',
  auto: '允许副驾自动介绍',
}
const defaultApi = createMusicApi()
const endpoint = '/api/me/copilot-social'

async function readChannel(method = 'GET', body?: unknown): Promise<SocialChannel> {
  const result = await fetch(endpoint, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (result.status === 503) throw new Error('副驾对频暂未开放。')
  if (result.status === 409) throw new Error('授权或星球状态已有变化，请刷新对频。')
  if (!result.ok) throw new Error('暂时无法连接对频频道，请重试。')
  return result.json()
}
export function CopilotSocialPanel({ onVisitPlanet, onPlayTrack, api = defaultApi }: Props) {
  const [channel, setChannel] = useState<SocialChannel | null>(null)
  const [draft, setDraft] = useState<PublicIntroduction | null>(null)
  const [momentId, setMomentId] = useState(''),
    [preview, setPreview] = useState(false)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const [report, setReport] = useState(''),
    [reason, setReason] = useState<MusicReportReason>('privacy')
  const [block, setBlock] = useState('')
  const mounted = useRef(false),
    locked = useRef(false),
    generation = useRef(0)
  const load = useCallback(async () => {
    if (locked.current) return
    const token = ++generation.current
    try {
      const data = await readChannel()
      if (mounted.current && token === generation.current) {
        setChannel(data)
        setDraft((old) => old ?? data.profile)
        setError('')
      }
    } catch (e) {
      if (mounted.current && token === generation.current) setError(e instanceof Error ? e.message : '读取失败。')
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    void load()
    const resume = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      mounted.current = false
      generation.current++
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [load])
  async function perform(work: () => Promise<SocialChannel>, message: string, reset = false) {
    if (locked.current) return
    locked.current = true
    generation.current++
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await work()
      if (mounted.current) {
        setChannel(data)
        setNotice(message)
        setReport('')
        setBlock('')
        if (reset) {
          setDraft(data.profile)
          setPreview(false)
        }
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '操作暂未完成。')
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const action = (id: string, kind: string, message: string) =>
    void perform(() => readChannel('POST', { id, action: kind }), message)
  const change = (patch: Partial<PublicIntroduction>) => {
    if (draft) {
      setDraft({ ...draft, ...patch })
      setPreview(false)
      setNotice('')
    }
  }
  const track = channel?.tracks.find((t) => t.id === draft?.trackId)
  return (
    <section className="copilot-social" aria-label="替我认识人">
      <header>
        <h3>替我认识人</h3>
        <button disabled={busy} onClick={() => void load()}>
          刷新对频
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!channel && !error && <p role="status">正在接入对频频道…</p>}
      {channel && draft && (
        <>
          <fieldset disabled={busy}>
            <legend>出航授权</legend>
            <p>双方授权后，后台可用 Cloudflare 模型根据公开名片和选曲生成介绍。</p>
            <label>
              副驾可以做什么
              <select value={draft.mode} onChange={(e) => change({ mode: e.target.value as IntroductionMode })}>
                {Object.entries(modeNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {draft.mode === 'recommend'
                ? '共同曲目推荐仅自己可见。'
                : draft.mode === 'confirm'
                  ? '每次交换前，你会先看到共同点并确认。'
                  : '双方授权后，副驾可以在你离线时交换一轮歌曲和介绍。'}{' '}
              每人每天最多发起一次、接收一次，同一对船长间隔七天。
            </p>
            <label>
              允许分享的歌曲
              <select
                value={track?.id ?? ''}
                onChange={(e) => {
                  change({ trackId: e.target.value || null })
                  setMomentId('')
                }}
              >
                <option value="">选择公开唱片架上的歌</option>
                {channel.tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {t.artistName}
                  </option>
                ))}
              </select>
            </label>
            {!channel.tracks.length && <p>在自己的公开星球放一首歌，即可准备介绍卡。</p>}
            {track && (
              <div className="copilot-social-draft">
                {channel.moments.some((m) => m.trackId === track.id) && (
                  <label>
                    可选的公开 Moment
                    <select value={momentId} onChange={(e) => setMomentId(e.target.value)}>
                      <option value="">只参考歌曲</option>
                      {channel.moments
                        .filter((m) => m.trackId === track.id)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.text}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <button
                  onClick={() => {
                    const source = channel.moments.find((m) => m.id === momentId && m.trackId === track.id)
                    change({
                      introduction: source
                        ? Array.from(source.text).slice(0, 160).join('')
                        : `我的公开唱片架上有《${track.title}》，想跟也听${track.artistName}的人交换一首歌。`,
                    })
                  }}
                >
                  根据已选素材起草
                </button>
              </div>
            )}
            <label>
              对外自我介绍
              <textarea
                value={draft.introduction}
                maxLength={160}
                onChange={(e) => change({ introduction: e.target.value })}
              />
            </label>
            <label>
              固定招呼语
              <input
                value={draft.greeting}
                maxLength={100}
                onChange={(e) => change({ greeting: e.target.value })}
              />
            </label>
            <p>介绍只使用你在此确认的文字、歌曲与公开音乐共同点。</p>
            {!preview ? (
              <button disabled={draft.mode !== 'recommend' && !track} onClick={() => setPreview(true)}>
                预览介绍卡
              </button>
            ) : (
              <div className="copilot-social-preview">
                <strong>{modeNames[draft.mode]}</strong>
                <p>{track ? `《${track.title}》 · ${track.artistName}` : '未选分享歌曲'}</p>
                {draft.introduction && <p>{draft.introduction}</p>}
                {draft.greeting && <p>{draft.greeting}</p>}
                <button
                  onClick={() =>
                    void perform(
                      () => readChannel('PATCH', { ...draft, trackId: track?.id ?? null }),
                      '已保存本次授权。',
                      true,
                    )
                  }
                >
                  确认并保存
                </button>
              </div>
            )}
            {channel.profile.mode !== 'recommend' && (
              <button
                onClick={() =>
                  void perform(
                    () => readChannel('PATCH', { ...channel.profile, mode: 'recommend', trackId: null }),
                    '已撤销对外介绍授权。',
                    true,
                  )
                }
              >
                立即撤销授权
              </button>
            )}
          </fieldset>
          {channel.suggestions.length > 0 && (
            <section>
              <h4>只给你的推荐</h4>
              {channel.suggestions.map((s) => (
                <article key={s.planetId}>
                  <strong>{s.peerName}</strong>
                  <p>{s.common}</p>
                  <button onClick={() => onVisitPlanet(s.planetId)}>访问星球</button>
                </article>
              ))}
            </section>
          )}
          <section>
            <h4>对频收件箱</h4>
            {!channel.cards.length && <p>还没有对频。双方授权并找到公开音乐共同点时，介绍会出现在这里。</p>}
            {channel.cards.map((card) => (
              <article key={card.id}>
                <header>
                  <strong>{card.peerName}</strong>
                  <small>
                    {card.status === 'delivered' ? '已交换歌曲' : card.needsApproval ? '等待你的授权' : '等待对频'}
                  </small>
                </header>
                <p>{card.common}</p>
                {card.messages.map((line, i) => (
                  <p className="copilot-social-line" key={i}>
                    <b>{line.speaker}的副驾</b>
                    {line.source && <small>{line.source === 'platform' ? '平台模型' : '规则生成'}</small>}
                    {line.text}
                  </p>
                ))}
                {card.needsApproval && (
                  <button disabled={busy} onClick={() => action(card.id, 'approve', '已同意这一次交换。')}>
                    同意这次对频
                  </button>
                )}
                {card.status === 'delivered' && (
                  <>
                    <button onClick={() => onPlayTrack(card.received)}>听《{card.received.title}》</button>
                    <button onClick={() => onVisitPlanet(card.planetId)}>访问星球</button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          await api.createFriendRequest(card.planetId)
                          return readChannel()
                        }, '你已发送好友请求。')
                      }
                    >
                      发送好友请求
                    </button>
                  </>
                )}
                <button
                  disabled={busy}
                  onClick={() => action(card.id, 'decline', '已拒绝与这位船长的对频，恢复前双方不会再配对。')}
                >
                  拒绝再对频
                </button>
                <button disabled={busy} onClick={() => action(card.id, 'mute', '已静音这位船长的副驾。')}>
                  静音副驾
                </button>
                <button disabled={busy} onClick={() => setReport(card.id)}>
                  举报星球
                </button>
                <button disabled={busy} onClick={() => setBlock(card.id)}>
                  屏蔽此人
                </button>
                {block === card.id && (
                  <div>
                    <p>屏蔽将阻止双方访问和联系。</p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          await api.blockPlanet(card.planetId)
                          return readChannel()
                        }, '已屏蔽此人。')
                      }
                    >
                      确认屏蔽
                    </button>
                    <button onClick={() => setBlock('')}>取消</button>
                  </div>
                )}
                {report === card.id && (
                  <div>
                    <label>
                      举报原因
                      <select value={reason} onChange={(e) => setReason(e.target.value as MusicReportReason)}>
                        <option value="privacy">隐私</option>
                        <option value="harassment">骚扰</option>
                        <option value="spam">垃圾内容</option>
                        <option value="inappropriate">不当内容</option>
                        <option value="other">其他</option>
                      </select>
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          await api.reportContent(
                            { type: 'planet', id: card.planetId },
                            reason,
                            `副驾对频编号 ${card.id}`,
                          )
                          return readChannel()
                        }, '已提交举报。')
                      }
                    >
                      提交举报
                    </button>
                    <button onClick={() => setReport('')}>取消</button>
                  </div>
                )}
              </article>
            ))}
          </section>
          {channel.pauses.length > 0 && (
            <section>
              <h4>已停止的对频</h4>
              {channel.pauses.map((p) => (
                <article key={p.id}>
                  <span>
                    {p.name} · {p.kind === 'mute' ? '已静音' : '已拒绝'}
                  </span>
                  <button disabled={busy} onClick={() => action(p.id, 'restore', '已恢复未来的对频资格。')}>
                    恢复对频
                  </button>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </section>
  )
}
