import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MusicApiError, type MusicApi, type MusicDirectMessage } from '../music-api'
import type { MusicTrackSummary } from '../music-domain'
import type { MusicPlayerControls } from './useMusicPlayer'
import { validateDirectPhoto } from './direct-photo'
import { Paginated } from './Pagination'
import './communicator.css'

function mergeMessages(previous: MusicDirectMessage[], incoming: MusicDirectMessage[]) {
  const map = new Map(previous.map(message => [message.id, message]))
  for (const message of incoming) map.set(message.id, { ...message, readAt: message.readAt ?? map.get(message.id)?.readAt ?? null })
  return [...map.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}
const messageError = (error: unknown) => error instanceof MusicApiError && error.code === 'USER_BLOCKED'
  ? '此好友关系已被屏蔽，无法发送消息。' : error instanceof MusicApiError && error.code === 'FRIENDSHIP_REQUIRED'
    ? '当前无法确认好友关系，暂时不能私信。请刷新好友列表后重试。' : error instanceof MusicApiError && error.code === 'MESSAGE_RATE_LIMITED'
      ? '发送得有些快，请稍等一分钟。' : error instanceof MusicApiError && error.code === 'PHOTO_TOO_LARGE'
        ? '图片必须小于 10 MB。' : '连接暂时中断，内容已保留，请重试。'

export function Communicator({ api, peer, player, tracks, onClose, renderReport }: {
  api: MusicApi; peer: { userId: string; displayName: string }; player: MusicPlayerControls; tracks: MusicTrackSummary[]
  onClose: () => void; renderReport?: (id: string) => ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null), log = useRef<HTMLDivElement>(null), alive = useRef(true)
  const bottom = useRef(true), preserve = useRef<{ height: number; top: number } | null>(null), sending = useRef(false)
  const [messages, setMessages] = useState<MusicDirectMessage[]>([]), [cursor, setCursor] = useState<string | null>(null)
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [olderBusy, setOlderBusy] = useState(false)
  const [draft, setDraft] = useState(''), [photo, setPhoto] = useState<File | null>(null), [preview, setPreview] = useState('')
  const [song, setSong] = useState<MusicTrackSummary | null>(null), [choosing, setChoosing] = useState(false), [query, setQuery] = useState('')
  const [results, setResults] = useState(tracks), [searchBusy, setSearchBusy] = useState(false), [searchError, setSearchError] = useState('')
  useEffect(() => {
    alive.current = true
    const node = dialog.current!, previous = document.activeElement as HTMLElement | null
    if (typeof node.showModal === 'function') node.showModal(); else node.setAttribute('open','')
    return () => { alive.current = false; if (node.open && typeof node.close === 'function') node.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  useEffect(() => {
    if (!photo) { setPreview(''); return }
    const url = URL.createObjectURL(photo); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  useEffect(() => {
    const controller = new AbortController(); let pending = false, initial = true
    const sync = async () => {
      if (pending || (!initial && document.visibilityState === 'hidden') || controller.signal.aborted) return
      pending = true
      try {
        const result = await api.loadDirectMessages(peer.userId, { signal: controller.signal })
        if (controller.signal.aborted) return
        setMessages(previous => mergeMessages(previous, result.messages))
        if (initial) { setCursor(result.nextCursor ?? null); initial = false }
        setReady(true); setError('')
      } catch (cause) { if (!controller.signal.aborted) {
        if (cause instanceof MusicApiError && ['FRIENDSHIP_REQUIRED','USER_BLOCKED'].includes(cause.code)) setReady(false)
        setError(messageError(cause))
      } }
      finally { pending = false }
    }
    void sync()
    const timer = setInterval(() => { void sync() }, 3000)
    const resume = () => { void sync() }
    document.addEventListener('visibilitychange', resume); window.addEventListener('online', resume); window.addEventListener('focus', resume)
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); window.removeEventListener('focus', resume) }
  }, [api, peer.userId])
  useLayoutEffect(() => {
    const node = log.current; if (!node) return
    if (preserve.current) { node.scrollTop = preserve.current.top + node.scrollHeight - preserve.current.height; preserve.current = null }
    else if (bottom.current) node.scrollTop = node.scrollHeight
  }, [messages])
  useEffect(() => {
    if (!choosing) return
    const controller = new AbortController(); setSearchBusy(true); setSearchError('')
    const timer = setTimeout(() => {
      void api.searchCatalog(query, '', 0, controller.signal).then(result => {
        if (controller.signal.aborted) return
        setResults(result.tracks); setSearchBusy(false)
        if (result.status === 'offline') setSearchError('曲库暂不可用，请稍后重试。')
      }).catch(() => { if (!controller.signal.aborted) { setSearchBusy(false); setSearchError('无法搜索歌曲，请稍后重试。') } })
    }, query ? 300 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [api, choosing, query])
  const older = async () => {
    if (!cursor || olderBusy) return
    setOlderBusy(true)
    try {
      const result = await api.loadDirectMessages(peer.userId, { before: cursor })
      if (!alive.current) return
      const node = log.current; if (node) preserve.current = { height: node.scrollHeight, top: node.scrollTop }
      setMessages(previous => mergeMessages(previous, result.messages)); setCursor(result.nextCursor ?? null)
    } catch (cause) { if (alive.current) setError(messageError(cause)) }
    finally { if (alive.current) setOlderBusy(false) }
  }
  const send = async () => {
    if (sending.current || !ready || (!draft.trim() && !song && !photo)) return
    sending.current = true; setBusy(true); setError('')
    try {
      const result = photo ? await api.sendDirectPhoto(peer.userId, photo, draft) : await api.sendDirectMessage(peer.userId, song ? { trackId: song.id, contentText: draft } : draft)
      if (!alive.current) return
      bottom.current = true; setMessages(previous => mergeMessages(previous, [result.message])); setDraft(''); setPhoto(null); setSong(null)
    } catch (cause) { if (alive.current) setError(messageError(cause)) }
    finally { sending.current = false; if (alive.current) setBusy(false) }
  }
  return createPortal(<dialog ref={dialog} className="mosic-communicator" aria-label={`与${peer.displayName}的私信`} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="communicator-hardware"><span>MOSIC / COM-01</span><span aria-hidden="true">▥ ▥ ▥</span></div>
    <header className="communicator-header"><div><span className="communicator-signal">● PRIVATE LINE</span><h2>{peer.displayName}</h2></div><button type="button" autoFocus onClick={onClose} aria-label="关闭通讯器">关闭 ×</button></header>
    <div className="communicator-screen" ref={log} role="log" aria-label="私信记录" aria-live="polite" onScroll={() => { const node = log.current!; bottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 70 }}>
      {cursor && <button type="button" className="communicator-older" disabled={olderBusy} onClick={() => { void older() }}>{olderBusy ? '读取中…' : '更早的消息 ↑'}</button>}
      {!ready && !error && <p className="communicator-empty">正在接通…</p>}
      {ready && !messages.length && <p className="communicator-empty">线路已接通。<br />从一句问候，或一首歌开始。</p>}
      {messages.map(message => <article key={message.id} className={`communicator-message${message.isOwn ? ' is-own' : ''}`}>
        <div className="communicator-bubble">
          {message.kind === 'photo' && message.photoUrl && <a href={message.photoUrl} target="_blank" rel="noreferrer"><img src={message.photoUrl} alt="好友私信图片" loading="lazy" onLoad={() => { if (bottom.current && log.current) log.current.scrollTop = log.current.scrollHeight }} /></a>}
          {message.kind === 'song' && <button className="communicator-song" type="button" disabled={!message.track?.audioUrl} onClick={() => { if (message.track) player.toggle(message.track) }}>
            <span className="communicator-disc" aria-hidden="true">◉</span><span><strong>{message.track?.title ?? '歌曲已不可用'}</strong><small>{message.track?.artistName}</small><small>{player.currentTrackId === message.track?.id && player.playing ? 'Ⅱ 暂停' : '▶ 播放歌曲'}</small></span>
          </button>}
          {message.contentText && !(message.kind === 'photo' && message.contentText === '[图片]') && !(message.kind === 'song' && message.contentText.startsWith('[歌曲] ')) && <p>{message.contentText}</p>}
        </div>
        <footer><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>{message.isOwn ? <span>{message.readAt ? '已读' : '已发送'}</span> : renderReport?.(message.id)}</footer>
      </article>)}
    </div>
    {choosing && <section className="communicator-picker" aria-label="选择私信歌曲"><div><label htmlFor="communicator-song-search">搜索歌曲</label><button type="button" onClick={() => setChoosing(false)}>收起</button></div><input id="communicator-song-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="歌曲或艺人" />{searchBusy && <small role="status">搜索中…</small>}{searchError && <p role="alert">{searchError}</p>}<Paginated items={results} label="私信歌曲" pageSize={3}>{track => <button type="button" key={track.id} onClick={() => { setSong(track); setPhoto(null); setChoosing(false) }}>{track.title} <small>— {track.artistName}</small></button>}</Paginated></section>}
    <form className="communicator-compose" onSubmit={event => { event.preventDefault(); void send() }}>
      <div className="communicator-tools"><button type="button" disabled={busy} onClick={() => setChoosing(value => !value)}>♫ 歌曲</button><label className="communicator-photo-button">▧ 图片<input aria-label="选择私信图片" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
        const invalid = validateDirectPhoto(file)
        if (invalid) { setError(invalid === 'PHOTO_TOO_LARGE' ? '图片必须小于 10 MB。' : '请选择 PNG、JPG、WebP 或 GIF 图片。'); return }
        setPhoto(file); setSong(null); setError(''); setChoosing(false)
      }} /></label><small>图片 &lt; 10 MB</small></div>
      {(song || photo) && <div className="communicator-attachment">{preview && <img src={preview} alt="待发送图片" />}<span>{song ? `♫ ${song.title}` : photo?.name}</span><button type="button" disabled={busy} onClick={() => { setSong(null); setPhoto(null) }} aria-label="移除附件">×</button></div>}
      <label htmlFor="music-direct-message" className="communicator-label">发送私信</label><textarea id="music-direct-message" value={draft} disabled={busy} maxLength={2000} onChange={event => setDraft(event.target.value)} placeholder="写一条消息…" onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() }
      }} />
      {error && <p className="communicator-error" role="alert">{error}</p>}
      <div className="communicator-send"><small>历史自动保存 · Enter 发送</small><button type="submit" disabled={!ready || busy || (!draft.trim() && !song && !photo)}>{busy ? '发送中…' : '发送'}</button></div>
    </form><div className="communicator-base" aria-hidden="true"><span>DIRECT TRANSMISSION</span><i /></div>
  </dialog>, document.body)
}
