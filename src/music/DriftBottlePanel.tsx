import { useCallback, useEffect, useRef, useState, type ComponentType, type FormEvent } from 'react'
import type { MusicApi, MusicDriftBottleDetail, MusicDriftBottlesResponse, MusicDriftBottleJourney, MusicDriftBottleTopic, MusicMoment, MusicReportTarget, MusicSocialSettings } from '../music-api'
import type { MusicTrackSummary } from '../music-domain'
import { Paginated, PagedSelect } from './Pagination'
import { MomentContent } from './MomentPhoto'
import { DitherButton, DitherLoadingRing, DitherTitle } from './dither/components'
import type { MusicPlayerControls } from './useMusicPlayer'
import './drift-bottles.css'

const channels = { inbox: '收件箱', compose: '写一只', sent: '已寄出' } as const
type Channel = keyof typeof channels
const localTime = (iso: string) => new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function BottleAttachment({ topic, player }: { topic: MusicDriftBottleTopic; player?: MusicPlayerControls }) {
  if (topic.type === 'info') return <div className="music-bottle-topic-card"><strong>{topic.title}</strong>{topic.summary && <p>{topic.summary}</p>}<a href={topic.url} target="_blank" rel="noreferrer">阅读原文 ↗</a></div>
  if (topic.type === 'song' && !topic.track) return <p>这首歌暂时无法播放。</p>
  return <MomentContent player={player} track={topic.track ?? undefined} contentText={topic.type === 'moment' ? topic.contentText : null} photoUrl={topic.type === 'moment' ? topic.photoUrl : null} />
}

function BottleMark() {
  return <svg className="bottle-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <g transform="rotate(34 24 24)" stroke="currentColor" strokeWidth="2">
      <path d="M19 4h10v5H19z" fill="currentColor"/><path d="M18 10h12v4h-2v6l6 7v11l-3 4H17l-3-4V27l6-7v-6h-2z"/>
      <path d="M19 33h10v5H19zM23 17v4l-5 7"/>
    </g>
  </svg>
}

function driftBottleStatus(status: string) {
  if (status === 'unread') return '待打开 · 一小时内未打开会重新投递'
  if (status === 'read') return '已打开 · 读后可选择继续放流'
  if (status === 'delivered') return '正在漂流'
  if (status === 'waiting_for_release') return '已读 · 等待收件人主动放流'
  if (status === 'waiting') return '暂时没有合适的接收人，系统会继续寻找'
  if (status === 'unavailable') return '内容已不可用，漂流已停止'
  if (status === 'stopped') return '漂流已停止'
  return status
}

export function DriftBottlePanel({ api, active, tracks, moments, onVisitPlanet, onSettingsChange, player, ReportControl, copilotDraft }: {
  copilotDraft?: { text: string; trackId?: string } | null
  active: boolean
  ReportControl: ComponentType<{ api: MusicApi; target: MusicReportTarget; ariaLabel: string }>
  api: MusicApi
  tracks: MusicTrackSummary[]
  moments: MusicMoment[]
  onVisitPlanet: (planetId: string, displayName: string) => void
  onSettingsChange: (settings: MusicSocialSettings) => void
  player?: MusicPlayerControls
}) {
  const [snapshot, setSnapshot] = useState<MusicDriftBottlesResponse | null>(null)
  const [channel, setChannel] = useState<Channel>('inbox')
  const [journey, setJourney] = useState<MusicDriftBottleJourney | null>(null)
  const [shareEcho, setShareEcho] = useState(false)
  const [detail, setDetail] = useState<MusicDriftBottleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [topicType, setTopicType] = useState<'song' | 'info' | 'moment'>('song')
  const [trackId, setTrackId] = useState('')
  const [momentId, setMomentId] = useState('')
  const [infoTitle, setInfoTitle] = useState('')
  const [infoUrl, setInfoUrl] = useState('')
  const [infoSummary, setInfoSummary] = useState('')
  const [messageText, setMessageText] = useState('')
  const [commentText, setCommentText] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!copilotDraft) return
    setChannel('compose')
    setMessageText(copilotDraft.text.slice(0, 500))
    if (copilotDraft.trackId) {
      setTopicType('song')
      setTrackId(copilotDraft.trackId)
    }
  }, [copilotDraft])

  const ticket = useRef(0)
  const reload = useCallback(async () => {
    const id = ++ticket.current
    setLoading(true)
    try {
      const next = await api.loadDriftBottles()
      if (id === ticket.current) {
        setSnapshot(next)
        setDetail(current => current && next.inbox.some(row => row.id === current.bottle.id) ? current : null)
      }
    } catch { if (id === ticket.current) setError('暂时无法读取漂流瓶，请刷新重试。') }
    finally { if (id === ticket.current) setLoading(false) }
  }, [api])

  useEffect(() => {
    if (!active) return
    void reload()
    const refresh = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', refresh)
    return () => { ticket.current++; document.removeEventListener('visibilitychange', refresh) }
  }, [active, reload])
  useEffect(() => {
    if (!trackId && tracks[0]) setTrackId(tracks[0].id)
    if (!momentId) setMomentId(moments.find((moment) => moment.visibility === 'public' && moment.publishedAt)?.id ?? '')
  }, [tracks, moments, trackId, momentId])

  const createBottle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!snapshot || snapshot.sentToday || sending) return
    let topic: { type: 'song'; trackId: string } | { type: 'info'; title: string; url: string; summary: string } | { type: 'moment'; momentId: string }
    if (topicType === 'song') topic = { type: 'song', trackId }
    else if (topicType === 'moment') topic = { type: 'moment', momentId }
    else topic = { type: 'info', title: infoTitle, url: infoUrl, summary: infoSummary }
    setSending(true)
    setError('')
    setFeedback('')
    try {
      const result = await api.createDriftBottle(topic, messageText)
      setSnapshot(current => current && { ...current, sentToday: true })
      setChannel('sent')
      setMessageText('')
      setInfoTitle('')
      setInfoUrl('')
      setInfoSummary('')
      setFeedback(result.bottle.status === 'waiting'
        ? '漂流瓶已保存，暂时没有合适的接收人；系统会继续寻找。'
        : '漂流瓶已寄出。有人拆开后，你可以在这里查看回声。')
      await reload()
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'DAILY_BOTTLE_LIMIT') void reload()
      setError(cause instanceof Error && 'code' in cause && cause.code === 'DAILY_BOTTLE_LIMIT'
        ? '今天已经发过一只漂流瓶了，明天可以再发。'
        : '漂流瓶没有发出，请确认内容后重试。')
    } finally { setSending(false) }
  }

  const openBottle = async (bottleId: string) => {
    setBusy(true)
    setError('')
    try {
      await api.updateDriftBottle(bottleId, 'open')
      setDetail(await api.getDriftBottle(bottleId))
      setCommentText('')
      setShareEcho(false)
      await reload()
    } catch {
      setError('这只漂流瓶已过期、停止传播或暂时无法打开。')
      setDetail(null)
      await reload()
    } finally { setBusy(false) }
  }

  const releaseBottle = async () => {
    if (!detail || busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api.updateDriftBottle(detail.bottle.id, 'release')
      setDetail(null)
      setFeedback(result.status === 'waiting'
        ? '你已放流；系统暂时没有找到下一位，会继续寻找。'
        : '你已放流，漂流瓶正在寻找下一位。')
      await reload()
    } catch { setError('放流没有完成，请刷新后重试。') }
    finally { setBusy(false) }
  }

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail || !commentText.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const { comment } = await api.addDriftBottleComment(detail.bottle.id, commentText, shareEcho)
      setDetail({ ...detail, comments: [...detail.comments, comment] })
      setCommentText('')
      setShareEcho(false)
    } catch { setError('评论没有保存，请稍后重试。') }
    finally { setBusy(false) }
  }

  const toggleLike = async (commentId: string, liked: boolean) => {
    if (!detail || busy) return
    setBusy(true)
    try {
      const result = await api.setDriftBottleCommentLike(detail.bottle.id, commentId, !liked)
      setDetail({ ...detail, comments: detail.comments.map((comment) => comment.id === commentId
        ? { ...comment, likedByMe: result.liked, likeCount: result.likeCount } : comment) })
    } catch { setError('点赞没有更新，请重试。') }
    finally { setBusy(false) }
  }

  const deleteComment = async (commentId: string) => {
    if (!detail || busy) return
    setBusy(true)
    try {
      await api.deleteDriftBottleComment(detail.bottle.id, commentId)
      setDetail({ ...detail, comments: detail.comments.filter((comment) => comment.id !== commentId) })
    } catch { setError('评论没有删除，请稍后重试。') }
    finally { setBusy(false) }
  }

  const toggleReceiving = async (allowDriftBottles: boolean) => {
    setPreferenceBusy(true)
    setError('')
    try {
      const confirmed = await api.updateSocialSettings({ allowDriftBottles })
      setSnapshot((current) => current ? { ...current, allowReceiving: confirmed.allowDriftBottles } : current)
      onSettingsChange(confirmed)
    } catch { setError('接收偏好没有保存，请稍后重试。') }
    finally { setPreferenceBusy(false) }
  }

  const momentOptions = moments.filter((moment) => moment.visibility === 'public' && Boolean(moment.publishedAt))
  const selectChannel = (next: Channel) => {
    setChannel(next); setDetail(null); setJourney(null); setError(''); setFeedback('')
  }
  const openJourney = async (id: string) => {
    setBusy(true); setError(''); setFeedback('')
    try { setJourney(await api.getDriftBottleJourney(id)) }
    catch { setError('暂时无法读取这只瓶的回声，请再试一次。') }
    finally { setBusy(false) }
  }
  const unread = snapshot?.inbox.filter(row => row.status === 'unread').length
  const chosenSong = tracks.find(item => item.id === trackId)

  return <aside className="music-panel music-drift-panel" aria-label="漂流瓶">
    <header className="bottle-header"><BottleMark/><div><DitherTitle level={2}>漂流瓶</DitherTitle><p>每天可以寄出一只，下一站由系统投递。</p></div></header>
    <nav className="bottle-channels" aria-label="漂流瓶信箱">
      {(Object.keys(channels) as Channel[]).map(key => <button key={key} type="button" aria-pressed={key === channel} disabled={busy || sending}
        onClick={() => selectChannel(key)}>{channels[key]}{key === 'inbox' && !!unread && <span className="bottle-unread">{unread} 未读</span>}</button>)}
    </nav>
    {error && <p className="music-form-error" role="alert">{error}</p>}
    {feedback && <p className="music-feedback" role="status">{feedback}</p>}

    {channel === 'compose' && (snapshot?.sentToday ? <section className="bottle-rest"><h3>今天的瓶已经寄出了</h3><p>可以去看看，它漂到了哪一站。</p><DitherButton onClick={() => selectChannel('sent')}>去看已寄出</DitherButton></section> :
    <form className="music-bottle-form" onSubmit={createBottle}>
      <div className="music-section-heading"><DitherTitle level={3}>装进瓶里</DitherTitle></div>
      <label htmlFor="music-bottle-topic">漂流主题</label>
      <select id="music-bottle-topic" value={topicType} onChange={(event) => setTopicType(event.target.value as typeof topicType)}>
        <option value="song">一首歌曲</option><option value="info">一则资讯</option><option value="moment">一篇 Moment</option>
      </select>
      {topicType === 'song' && <>
        <label htmlFor="music-bottle-song">选择曲目</label>
        <PagedSelect id="music-bottle-song" items={tracks} value={trackId} onChange={setTrackId} label="漂流瓶歌曲" itemLabel={track => `${track.title} · ${track.artistName}`} />
        {!tracks.length && <p className="music-moments-empty">曲库暂时没有可用歌曲。</p>}
        {chosenSong && <BottleAttachment topic={{ type: 'song', track: chosenSong }} player={player} />}
      </>}
      {topicType === 'info' && <>
        <label htmlFor="music-bottle-info-title">资讯标题</label><input id="music-bottle-info-title" value={infoTitle} onChange={(event) => setInfoTitle(event.target.value)} maxLength={160} required />
        <label htmlFor="music-bottle-info-url">来源链接（HTTPS）</label><input id="music-bottle-info-url" type="url" pattern="https://.+" maxLength={2048} value={infoUrl} onChange={(event) => setInfoUrl(event.target.value)} placeholder="https://…" required />
        <label htmlFor="music-bottle-info-summary">简单介绍一下这篇内容</label><textarea id="music-bottle-info-summary" value={infoSummary} onChange={(event) => setInfoSummary(event.target.value)} maxLength={800} />
      </>}
      {topicType === 'moment' && <>
        <label htmlFor="music-bottle-moment">选择一篇已公开 Moment</label>
        <PagedSelect id="music-bottle-moment" items={momentOptions} value={momentId} onChange={setMomentId} label="漂流瓶 Moment" itemLabel={moment => `${moment.track.title} · ${moment.contentText.slice(0, 42) || '公开 Moment'}`} />
        {!momentOptions.length && <p className="music-moments-empty">还没有可分享的公开 Moment；私密内容不会通过漂流瓶传播。</p>}
      </>}
      <label htmlFor="music-bottle-message">附上一句话 <span>{messageText.length}/500</span></label>
      <textarea id="music-bottle-message" value={messageText} onChange={(event) => setMessageText(event.target.value)} maxLength={500} placeholder="留一小段给下一个遇见的人……" />
      <DitherButton className="music-primary-button" type="submit" disabled={sending || !snapshot || snapshot.sentToday || (topicType === 'song' && !trackId) || (topicType === 'moment' && !momentId)}>
        {sending ? '正在放流…' : '放出漂流瓶 ↗'}
      </DitherButton>
    </form>)}

    {channel === 'inbox' && !detail && <div className="bottle-inbox-tools"><label className="music-visit-incognito music-bottle-preference">
      <input type="checkbox" checked={snapshot?.allowReceiving ?? true} disabled={preferenceBusy || !snapshot} onChange={(event) => { void toggleReceiving(event.target.checked) }} />
      <span><strong>接收漂流瓶</strong></span>
    </label><DitherButton disabled={loading || busy || preferenceBusy} onClick={() => { setError(''); void reload() }}>刷新收件箱</DitherButton></div>}

    {channel === 'inbox' && (detail ? <section className="music-bottle-detail" aria-label="漂流瓶内容">
      <div className="music-section-heading"><div><span className="music-kicker">瓶中来信 · 已打开</span><DitherTitle level={3}>{detail.bottle.topic.type === 'song' ? '一首歌曲' : detail.bottle.topic.type === 'info' ? '一则资讯' : '一篇 Moment'}</DitherTitle></div>
        <DitherButton className="music-close-inline" type="button" aria-label="关闭漂流瓶详情" disabled={busy} onClick={() => setDetail(null)}>×</DitherButton></div>
      <BottleAttachment topic={detail.bottle.topic} player={player}/>
      {detail.bottle.messageText && <blockquote>{detail.bottle.messageText}</blockquote>}
      {detail.bottle.sender && <DitherButton className="music-text-button" type="button" onClick={() => onVisitPlanet(detail.bottle.sender!.planetId, detail.bottle.sender!.displayName)}>访问瓶主星球 · {detail.bottle.sender.displayName} ↗</DitherButton>}
      <ReportControl api={api} target={{ type: 'drift_bottle', id: detail.bottle.id }} ariaLabel="举报这只漂流瓶" />
      <section className="music-bottle-comments" aria-label="漂流瓶评论">
        <div className="music-section-heading"><h4>接力留言</h4><span>{detail.comments.length}</span></div>
        {!detail.comments.length ? <p className="music-moments-empty">还没有评论，你可以留下一句回应。</p> : <Paginated items={detail.comments} label="漂流瓶评论">{(comment) => <article className="music-bottle-comment" key={comment.id}>
          <div><strong>{comment.authorName}</strong><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('zh-CN')}</time></div>
          <p>{comment.contentText}</p>
          <div className="music-bottle-comment-actions">
            <DitherButton className="music-text-button" type="button" disabled={busy} aria-pressed={comment.likedByMe} onClick={() => { void toggleLike(comment.id, comment.likedByMe) }}>{comment.likedByMe ? '已赞' : '点赞'} · {comment.likeCount}</DitherButton>
            {comment.isOwn && <DitherButton className="music-text-button" type="button" disabled={busy} onClick={() => { void deleteComment(comment.id) }}>删除</DitherButton>}
          </div>
          {!comment.isOwn && <ReportControl api={api} target={{ type: 'drift_comment', id: comment.id }} ariaLabel="举报这条漂流瓶评论" />}
        </article>}</Paginated>}
        <form className="music-bottle-comment-form" onSubmit={(event) => { void submitComment(event) }}>
          <label htmlFor="music-bottle-comment">添加评论</label>
          <textarea id="music-bottle-comment" value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={500} placeholder="你想把什么留给下一个人？" />
          <label className="bottle-echo-opt"><input type="checkbox" checked={shareEcho} disabled={busy} onChange={event => setShareEcho(event.target.checked)} />匿名寄一份给瓶主</label>
          <DitherButton className="music-secondary-button" type="submit" disabled={busy || !commentText.trim()}>留下评论</DitherButton>
        </form>
      </section>
      <DitherButton className="music-primary-button music-release-button" type="button" disabled={busy || !!commentText.trim()} onClick={() => { void releaseBottle() }}>{busy ? '正在处理…' : '继续放流 ↗'}</DitherButton>
      <p className="music-panel-note">{commentText.trim() ? '先寄出或清空留言，再把瓶子传给下一位。' : '放流后，下一位收到这只瓶的人也能读到沿途的留言。'}</p>
    </section> : <>
      {loading && <DitherLoadingRing label="正在寻找传来的漂流瓶…" />}
      {!loading && snapshot?.inbox.length === 0 && <div className="bottle-rest"><h3>{snapshot.allowReceiving ? '收件箱暂时是空的' : '已暂停接收新瓶'}</h3><p>{snapshot.allowReceiving ? '下一只瓶抵达时会出现在这里。' : '重新打开接收开关，就可以等下一封来信。'}</p><DitherButton onClick={() => selectChannel(snapshot.sentToday ? 'sent' : 'compose')}>{snapshot.sentToday ? '看看我寄出的瓶' : '先寄出一只瓶'}</DitherButton></div>}
      {<Paginated items={snapshot?.inbox ?? []} label="收到的漂流瓶">{(bottle) => <article className="music-bottle-inbox-card" key={bottle.id}>
        <div><strong>{bottle.topicLabel}</strong><small>{bottle.status === 'unread' ? `请在 ${localTime(bottle.expiresAt)} 前拆开` : `${localTime(bottle.deliveredAt)} 收到 · 已拆阅`}</small></div>
        <DitherButton className="music-secondary-button" type="button" disabled={busy} onClick={() => { void openBottle(bottle.id) }}>{bottle.status === 'read' ? '继续阅读' : '打开漂流瓶'}</DitherButton>
      </article>}</Paginated>}
    </>)}
    {channel === 'sent' && (journey ? <section className="bottle-journey" aria-label="漂流回声">
        <div className="music-section-heading"><DitherTitle level={3}>沿途的回声</DitherTitle><DitherButton onClick={() => setJourney(null)}>返回已寄出</DitherButton></div>
        <p>{driftBottleStatus(journey.bottle.status)}</p>
        <dl className="bottle-route">{([['投递', journey.journey.deliveryCount], ['拆阅', journey.journey.openedCount], ['放流', journey.journey.releasedCount]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value} 次</dd></div>)}</dl>
        {journey.bottle.topic && <BottleAttachment topic={journey.bottle.topic} player={player}/>}
        {journey.bottle.messageText && <blockquote>{journey.bottle.messageText}</blockquote>}
        <h4>寄给你的回声 · {journey.journey.commentCount}</h4>
        {!journey.bottle.topic ? <p>这只瓶的内容已停止分享。</p> : journey.comments.length === 0 ? <p>还没有收到回声。拆瓶的人可以选择留一句话给你。</p> :
          <Paginated items={journey.comments} label="漂流回声">{item => <article className="music-bottle-comment" key={item.id}><div><strong>{item.authorName}</strong><time dateTime={item.createdAt}>{localTime(item.createdAt)}</time></div><p>{item.contentText}</p><ReportControl api={api} target={{ type: 'drift_comment', id: item.id }} ariaLabel="举报这条回声"/></article>}</Paginated>}
      </section> : <section className="music-bottle-sent">
        <div className="music-section-heading"><DitherTitle level={3}>我放出的瓶</DitherTitle><span>{snapshot?.sent.length ?? 0}</span></div>
        {snapshot?.sent.length === 0 ? <p className="music-moments-empty">你放出的瓶及接力状态会显示在这里。</p> : <Paginated items={snapshot?.sent ?? []} label="放出的漂流瓶">{(bottle) => <article className="music-bottle-sent-item" key={bottle.id}>
          <div><strong>{bottle.topicLabel}</strong><small>{localTime(bottle.createdAt)} · {driftBottleStatus(bottle.status)}</small><small>投递 {bottle.deliveryCount} 次{bottle.commentCount !== undefined && ` · ${bottle.commentCount} 条回声`}</small></div>
          <DitherButton disabled={busy} onClick={() => void openJourney(bottle.id)}>查看回声</DitherButton>
        </article>}</Paginated>}
      </section>)}
    {!snapshot && !loading && <DitherButton className="music-text-button" type="button" onClick={() => { void reload() }}>重新加载</DitherButton>}
  </aside>
}
