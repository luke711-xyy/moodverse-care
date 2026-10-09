import { useEffect, useRef, useState } from 'react'
import { DITHER_ALGORITHMS, DITHER_FORMS, DITHER_FORM_LABELS, DITHER_MOTIFS, DITHER_MOTIF_LABELS, DITHER_LIMITS, validateDitherOverrides, type DitherNumericKey, type DitherOverrides, type DitherPlanetSpec } from './appearance'
import { DitherButton, DitherTitle } from './components'
import { DitherCanvas } from './DitherCanvas'
const labels: Record<DitherNumericKey, string> = { size: '星球大小', textureScale: '纹理尺度', disturbance: '扰动', density: '密度', pixelSize: '像素粒度', exposure: '亮度', contrast: '对比度', gamma: '中间调', blue: '蓝色比重', violet: '紫色比重', pink: '粉色比重', glow: '光晕', speed: '变化速度', pulse: '脉冲幅度', seedOffset: '纹理种子' }
export function AppearanceEditor({ spec, busy, error, onPreview, onApply, onClose, onReload, embedded = false, active = true, reducedMotion = false }: { spec: DitherPlanetSpec; busy: boolean; error: string; onPreview: (spec: DitherPlanetSpec)=>void; onApply: (overrides: DitherOverrides)=>void; onClose: ()=>void; onReload?: ()=>void; embedded?: boolean; active?: boolean; reducedMotion?: boolean }) {
  const [draft, setDraft] = useState<DitherOverrides>({ ...spec.overrides })
  const panel = useRef<HTMLElement>(null)
  const parameters = { ...spec.generated, ...draft }
  useEffect(() => { if (embedded) return; const previous = document.activeElement as HTMLElement; panel.current?.focus(); return ()=>previous?.focus() }, [embedded])
  useEffect(() => { if (validateDitherOverrides(draft).ok) onPreview({ ...spec, overrides: draft }) }, [spec])
  const update = (next: DitherOverrides) => { setDraft(next); if (validateDitherOverrides(next).ok) onPreview({ ...spec, overrides: next }) }
  return <div className={embedded ? 'cockpit-appearance-editor' : 'dither-editor-backdrop'}><section ref={panel} tabIndex={-1} className="dither-editor" role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-label="星球外观" onKeyDown={event=>{
    if (embedded) return
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose() }
    if (event.key === 'Tab') { const controls = Array.from(panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled)')); const first = controls[0], last = controls.at(-1); if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() } }
  }}>
    <header><DitherTitle level={2}>星球外观</DitherTitle><DitherButton disabled={busy} onClick={onClose} aria-label="关闭外观编辑">×</DitherButton></header>
    <p>实时预览。应用后保留手动参数；换歌只更新未调整的部分。</p>
    {embedded && active && <div className="cockpit-appearance-preview">
      {[{ label: '当前外观', visual: spec }, { label: '调整后', visual: { ...spec, overrides: draft } }].map(({ label, visual }) => <figure key={label} role="img" aria-label={label}>
        <figcaption>{label}</figcaption>
        <div className="cockpit-appearance-preview-planet"><DitherCanvas forceFallback reducedMotion={reducedMotion} getFrame={(width,height,phase)=>({ width,height,phase,assets:[{ id:label,spec:visual,x:width / 2,y:height / 2,radius:Math.min(width,height) * .28 }] })} /></div>
      </figure>)}
    </div>}
    <div className="dither-editor-fields">
      <label>形态<select aria-label="形态" value={parameters.form} disabled={busy} onChange={e=>update({ ...draft, form: e.target.value as typeof parameters.form })}>{DITHER_FORMS.map(value=><option key={value} value={value}>{DITHER_FORM_LABELS[value]}</option>)}</select></label>
      <label>纹理<select aria-label="纹理" value={parameters.motif} disabled={busy} onChange={e=>update({ ...draft, motif: e.target.value as typeof parameters.motif })}>{DITHER_MOTIFS.map(value=><option key={value} value={value}>{DITHER_MOTIF_LABELS[value]}</option>)}</select></label>
      <label>抖动算法<select aria-label="抖动算法" value={parameters.algorithm} disabled={busy} onChange={e=>update({ ...draft, algorithm: e.target.value as typeof parameters.algorithm })}>{DITHER_ALGORITHMS.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
      <label>鼠标扰动<select aria-label="鼠标扰动" value={parameters.pointer} disabled={busy} onChange={e=>update({ ...draft, pointer: e.target.value as typeof parameters.pointer })}><option value="off">关闭</option><option value="weak">轻微</option><option value="strong">明显</option></select></label>
      {(Object.keys(DITHER_LIMITS) as DitherNumericKey[]).map(key=><label key={key}><span>{labels[key]} <output>{parameters[key].toFixed(key === 'seedOffset' ? 0 : 2)}</output></span><input aria-label={labels[key]} type="range" min={DITHER_LIMITS[key][0]} max={DITHER_LIMITS[key][1]} step={key === 'seedOffset' || key === 'pixelSize' ? 1 : .01} value={parameters[key]} disabled={busy} onChange={e=>update({ ...draft, [key]: Number(e.target.value) })} /></label>)}
    </div>
    {error && <div><p role="alert">{error}</p>{onReload && <DitherButton disabled={busy} onClick={onReload}>重新读取已保存外观</DitherButton>}</div>}
    {!validateDitherOverrides(draft).ok && <p role="alert">至少保留一种颜色。</p>}
    <footer><DitherButton disabled={busy} onClick={()=>update({})}>恢复歌曲生成</DitherButton><DitherButton disabled={busy} onClick={onClose}>取消</DitherButton><DitherButton className="is-primary" busy={busy} disabled={!validateDitherOverrides(draft).ok} onClick={()=>onApply(draft)}>{busy ? '正在保存…' : '应用外观'}</DitherButton></footer>
  </section></div>
}
