import { useCallback, useMemo, useState } from 'react'
import { createDitherSpec, DITHER_FORMS, DITHER_FORM_LABELS, DITHER_MOTIFS, DITHER_MOTIF_LABELS, type DitherOverrides } from './appearance'
import { DitherCanvas, DitherThumbnail } from './DitherCanvas'
import { DitherButton, DitherCard, DitherLoadingRing, DitherOrbit, DitherTitle } from './components'
import { depthOrderedAssets, satelliteAsset } from './layout'
import type { DitherFrame } from './renderer'
import './gallery.css'

export default function DitherGallery() {
  const [form, setForm] = useState<DitherOverrides['form']>('organic'), [motif, setMotif] = useState<DitherOverrides['motif']>('flow')
  const [fallback, setFallback] = useState(false), [paused, setPaused] = useState(false), [mode, setMode] = useState('')
  const spec = useMemo(() => createDitherSpec({ planetId: 'moodverse-art-system', tracks: [], overrides: { form, motif } }), [form, motif])
  const getFrame = useCallback((width: number, height: number, phase: number): DitherFrame => ({ width, height, phase, assets: depthOrderedAssets([
    { id: 'planet', spec, x: width * .5, y: height * .5, radius: Math.min(width, height) * .45 },
    satelliteAsset(spec, { id: 'music-satellite', kind: 'music', orbit: { x: width * .5, y: height * .5, rx: Math.min(width, height) * .42, ry: Math.min(width, height) * .22, tilt: 0 }, phase, radius: 20 }),
  ]) }), [spec])
  return <main className="dither-gallery">
    <header><span>MOODVERSE</span><span>二维资产样板 · {mode}</span></header>
    <div className="dither-gallery-main">
      <section className="dither-gallery-controls"><DitherTitle>让歌声有形。</DitherTitle>
        <fieldset><legend>形态</legend>{DITHER_FORMS.map((value) => <DitherButton key={value} aria-pressed={form === value} onClick={() => setForm(value)}>{DITHER_FORM_LABELS[value]}</DitherButton>)}</fieldset>
        <fieldset><legend>纹理</legend>{DITHER_MOTIFS.map((value) => <DitherButton key={value} aria-pressed={motif === value} onClick={() => setMotif(value)}>{DITHER_MOTIF_LABELS[value]}</DitherButton>)}</fieldset>
        <div className="dither-gallery-modes"><DitherButton aria-pressed={paused} onClick={() => setPaused(!paused)}>静止预览</DitherButton><DitherButton aria-pressed={fallback} onClick={() => setFallback(!fallback)}>Canvas2D 降级</DitherButton></div>
        <DitherLoadingRing label="环形加载样板" />
      </section>
      <section className="dither-gallery-scene" aria-label="二维星球预览">
        <svg viewBox="0 0 600 600" className="dither-gallery-orbit" aria-hidden="true"><DitherOrbit orbit={{ x: 300, y: 300, rx: 250, ry: 130, tilt: 0 }} /></svg>
        <DitherCanvas getFrame={getFrame} reducedMotion={paused} forceFallback={fallback} onModeChange={setMode} />
      </section>
    </div>
    <section className="dither-gallery-assets" aria-label="可复用纹理缩略图">{DITHER_MOTIFS.map((value) => <DitherCard key={value}>
      <DitherThumbnail spec={createDitherSpec({ planetId: 'moodverse-art-system', tracks: [], overrides: { form: 'organic', motif: value } })} label={DITHER_MOTIF_LABELS[value]} size={128} />
      <h2>{DITHER_MOTIF_LABELS[value]}</h2>
    </DitherCard>)}</section>
  </main>
}
