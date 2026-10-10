import type { MusicApi } from '../music-api'
import { useEffect, useState } from 'react'
import { MAX_GALAXY_SELECTIONS, type GalaxyOptionsPage, type GalaxySelectionKind, type GalaxySelectionOption } from './galaxy-preferences'
import { DitherButton, DitherTitle } from './dither/components'
import { Paginated } from './Pagination'
export type GalaxySelectionSettingsProps = { api: Pick<MusicApi, 'searchGalaxyOptions'>; kind: GalaxySelectionKind; selectedOptions: GalaxySelectionOption[]; disabled: boolean; onSave: (ids: string[]) => Promise<boolean> }
export function GalaxySelectionSettings({ api, kind, selectedOptions, disabled, onSave }: GalaxySelectionSettingsProps) {
  const label = kind === 'artist' ? '艺人' : '歌曲'
  const [draft, setDraft] = useState(selectedOptions)
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; data: GalaxyOptionsPage } | null>(null)
  const [error, setError] = useState(''), [feedback, setFeedback] = useState(''), [saving, setSaving] = useState(false)
  const key = JSON.stringify([kind, query, offset])
  const data = result?.key === key ? result.data : null
  useEffect(() => { setDraft(selectedOptions) }, [selectedOptions])
  useEffect(() => {
    const controller = new AbortController()
    setError(''); setResult(null)
    const timer = window.setTimeout(() => {
      void api.searchGalaxyOptions(kind, query, offset, controller.signal).then(data => {
        if (!controller.signal.aborted) setResult({ key, data })
      }).catch(() => { if (!controller.signal.aborted) setError('暂时无法读取候选，已保留你的选择。') })
    }, query ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [api, kind, query, offset, retry])
  const busy = disabled || saving
  const changed = JSON.stringify(draft.map(o => o.id)) !== JSON.stringify(selectedOptions.map(o => o.id))
  const remove = (id: string) => { setDraft(current => current.filter(o => o.id !== id)); setFeedback('') }
  const save = async () => {
    if (busy || !changed) return
    setSaving(true); setFeedback('')
    try { setFeedback(await onSave(draft.map(o => o.id)) ? `Galaxy ${label}设置已保存。` : '未保存，已保留你的选择，请重试。') }
    catch { setFeedback('未保存，已保留你的选择，请重试。') }
    finally { setSaving(false) }
  }
  return <section className="music-settings-section" aria-label={`Galaxy ${label}`}>
    <div className="music-section-heading"><DitherTitle level={3}>Galaxy {label}</DitherTitle></div>
    <p>未选择时自动随机。手动候选最多 {MAX_GALAXY_SELECTIONS} 项，超过 8 项时每日随机展示其中 8 项，00:00（UTC+8）更新；不会改变星球选歌或主旋律。</p>
    <p aria-live="polite">{draft.length ? `已选择 ${draft.length} 项候选` : '当前候选：自动随机'}</p>
    {draft.length > 0 && <Paginated items={draft} label={`已选${label}`} pageSize={8}>{option => <div key={option.id} className="music-galaxy-choice">
      <span>{option.label}</span><DitherButton disabled={busy} aria-label={`移除${label} ${option.label}`} onClick={() => remove(option.id)}>移除</DitherButton>
    </div>}</Paginated>}
    <DitherButton disabled={busy || !draft.length} aria-label={`${label}恢复自动随机`} onClick={() => { setDraft([]); setFeedback('') }}>恢复自动随机</DitherButton>
    <label className="music-galaxy-choice-search">搜索{label}<input aria-label={`搜索 Galaxy ${label}`} value={query} maxLength={120} disabled={busy}
      onChange={e => { setQuery(e.target.value); setOffset(0) }} placeholder={kind === 'artist' ? '输入艺人名字' : '输入歌名或艺人'} /></label>
    {error ? <p role="alert">{error}<DitherButton onClick={() => setRetry(n => n + 1)}>重试候选</DitherButton></p>
      : !data ? <p role="status">正在查找{label}…</p> : <>
        {!data.options.length && <p>当前曲库未找到匹配{label}，可以换个关键词。</p>}
        <div className="music-genre-preferences">{data.options.map(option => <label key={option.id}>
          <input type="checkbox" aria-label={`选择${label} ${option.label}`} checked={draft.some(o => o.id === option.id)}
            disabled={busy || draft.length >= MAX_GALAXY_SELECTIONS && !draft.some(o => o.id === option.id)}
            onChange={e => { if (e.target.checked) setDraft(current => [...current, option]); else remove(option.id); setFeedback('') }} />{option.label}
        </label>)}</div>
      </>}
    <nav className="music-pagination" aria-label={`${label}候选分页`}>
      <DitherButton disabled={busy || !data || offset === 0} aria-label={`${label}候选 上一页`} onClick={() => setOffset(n => Math.max(0,n - 12))}>上一页</DitherButton>
      <span>第 {Math.floor(offset / 12) + 1} 页</span>
      <DitherButton disabled={busy || !data?.hasMore} aria-label={`${label}候选 下一页`} onClick={() => { if (data?.nextOffset != null) setOffset(data.nextOffset) }}>下一页</DitherButton>
    </nav>
    <DitherButton disabled={busy || !changed} onClick={() => { void save() }}>{saving ? '正在保存…' : `保存 Galaxy ${label}`}</DitherButton>
    {feedback && <p role="status">{feedback}</p>}
  </section>
}
