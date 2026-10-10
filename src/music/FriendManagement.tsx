import { useCallback, useEffect, useRef, useState } from 'react'
import type { MusicApi, MusicSocialSnapshot, MusicUserBlock } from '../music-api'
import { DitherButton, DitherTitle } from './dither/components'
import { Paginated } from './Pagination'

export type FriendChange = { action: 'delete' | 'block' | 'unblock'; userId: string; planetId: string | null }
type Friend = MusicSocialSnapshot['friends'][number]
type Target = { userId: string; planetId: string | null; displayName: string }

export function FriendManagement({ api, friends, onChanged, onRefresh }: {
  api: MusicApi; friends: Friend[] | undefined
  onChanged: (change: FriendChange) => Promise<void>; onRefresh: () => Promise<void>
}) {
  const [blocks, setBlocks] = useState<MusicUserBlock[] | null>(null)
  const [readError, setReadError] = useState(''), [error, setError] = useState(''), [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(''), [confirm, setConfirm] = useState<(Target & { action: 'delete' | 'block' }) | null>(null)
  const [removed, setRemoved] = useState<string[]>([])
  const alive = useRef(true), locked = useRef(false), readGeneration = useRef(0)
  const reload = useCallback(async (afterWrite = false) => {
    if (locked.current && !afterWrite) return
    const generation = ++readGeneration.current
    setReadError('')
    try {
      const next = await api.loadBlocks()
      if (alive.current && generation === readGeneration.current) setBlocks(next)
    } catch {
      if (alive.current && generation === readGeneration.current) setReadError('暂时无法读取屏蔽名单，请重试；已有屏蔽不会被取消。')
    }
  }, [api])
  useEffect(() => {
    alive.current = true; void reload()
    const resume = () => { if (document.visibilityState !== 'hidden') void reload() }
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    return () => { alive.current = false; readGeneration.current++; window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume) }
  }, [reload])
  useEffect(() => {
    if (friends) setRemoved(previous => previous.filter(id => friends.some(friend => friend.userId === id)))
  }, [friends])

  const perform = async (target: Target, action: FriendChange['action']) => {
    if (locked.current) return
    locked.current = true; setBusy(target.userId); setError(''); setFeedback('')
    let committed = false
    readGeneration.current++ // A pre-write list must not overwrite the confirmed result.
    try {
      const result = action === 'block' ? await api.blockUser(target.userId)
        : action === 'unblock' ? await api.unblockUser(target.userId) : await api.unfriend(target.userId)
      if (!result.ok) throw new Error('Unconfirmed relationship change')
      committed = true; readGeneration.current++
      if (alive.current) {
        setConfirm(null)
        if (action !== 'unblock') setRemoved(previous => [...new Set([...previous, target.userId])])
        setBlocks(previous => action === 'block'
          ? [...(previous ?? []).filter(block => block.userId !== target.userId), { ...target, createdAt: '' }]
          : action === 'unblock' ? (previous ?? []).filter(block => block.userId !== target.userId) : previous)
        setFeedback(action === 'block' ? `已屏蔽「${target.displayName}」，好友关系已删除，双方不会再互相发现或联系。`
          : action === 'unblock' ? `已解除屏蔽「${target.displayName}」，不会自动恢复好友；对方设置的屏蔽仍然有效。`
            : `已删除好友「${target.displayName}」。未设置屏蔽，之后仍可能相遇或重新添加好友。`)
      }
      await onChanged({ action, userId: target.userId, planetId: target.planetId })
      if (alive.current) await reload(true)
    } catch {
      if (alive.current) setError(committed ? '操作已保存，但列表同步未完成。请重新读取好友与屏蔽名单。'
        : '操作未完成，请检查连接后重试。当前显示保留上次已确认的状态。')
    } finally {
      locked.current = false
      if (alive.current) setBusy('')
    }
  }
  const blockedIds = new Set(blocks?.map(block => block.userId))
  const rows = [
    ...(friends ?? []).filter(friend => !blockedIds.has(friend.userId) && !removed.includes(friend.userId)).map(friend => ({ ...friend, blocked: false })),
    ...(blocks ?? []).map(block => ({ ...block, blocked: true })),
  ]
  return <section className="music-settings-section" aria-label="好友管理">
    <div className="music-section-heading"><DitherTitle level={3}>好友管理</DitherTitle><span>{rows.length} 人</span></div>
    <p className="music-panel-note">删除只解除好友关系；屏蔽会同时删除好友，并阻止双方在漫游、撞歌、Galaxy 和推荐中相遇、互访或联系。解除屏蔽不会自动恢复好友。</p>
    {readError && <div role="alert"><p>{readError}</p><DitherButton disabled={Boolean(busy)} onClick={() => { void reload(); void onRefresh() }}>重读好友与屏蔽名单</DitherButton></div>}
    {(!friends || blocks === null && !readError) && <p role="status">正在读取好友与屏蔽名单…</p>}
    {!friends && <DitherButton disabled={Boolean(busy)} onClick={() => { void onRefresh() }}>重读好友</DitherButton>}
    {error && <p role="alert" className="music-form-error">{error}</p>}
    {feedback && <p role="status" className="music-feedback">{feedback}</p>}
    {friends && blocks && rows.length === 0 && <p className="music-moments-empty">暂无好友或已屏蔽用户。</p>}
    <Paginated items={rows} label="好友与屏蔽名单" pageSize={8}>{row => <article className="music-friend-management-row" key={row.userId}>
      <div className="music-friend-management-copy"><strong>{row.displayName}</strong><small>{row.blocked ? '已屏蔽 · 已解除好友关系' : '好友'}</small></div>
      <div className="music-friend-management-actions">
        {row.blocked ? <DitherButton disabled={Boolean(busy)} aria-label={`解除屏蔽 ${row.displayName}`} onClick={() => { void perform(row, 'unblock') }}>{busy === row.userId ? '处理中…' : '解除屏蔽'}</DitherButton>
          : <>
            <DitherButton disabled={Boolean(busy)} aria-label={`删除好友 ${row.displayName}`} onClick={() => { setConfirm({ ...row, action: 'delete' }); setError(''); setFeedback('') }}>删除好友</DitherButton>
            <DitherButton disabled={Boolean(busy)} aria-label={`屏蔽 ${row.displayName}`} onClick={() => { setConfirm({ ...row, action: 'block' }); setError(''); setFeedback('') }}>屏蔽此人</DitherButton>
          </>}
      </div>
      {confirm?.userId === row.userId && <div className="music-friend-management-confirm" role="group" aria-label={`确认${confirm.action === 'block' ? '屏蔽' : '删除好友'} ${row.displayName}`}>
        <p>{confirm.action === 'block' ? '屏蔽后会删除好友关系，并阻止双方再次相遇或联系。可在这里解除屏蔽。' : '删除后将无法继续私信；此人仍可能出现在发现中，也可以重新发送好友请求。'}</p>
        <DitherButton disabled={Boolean(busy)} onClick={() => { void perform(confirm, confirm.action) }}>{busy === row.userId ? '处理中…' : confirm.action === 'block' ? '确认屏蔽' : '确认删除好友'}</DitherButton>
        <DitherButton disabled={Boolean(busy)} onClick={() => { setConfirm(null); setError('') }}>取消</DitherButton>
      </div>}
    </article>}</Paginated>
  </section>
}
