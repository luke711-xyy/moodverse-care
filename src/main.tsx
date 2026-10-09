import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './music/base.css'

const MusicApp = lazy(() => import('./music/MusicApp'))
const DitherGallery = import.meta.env.DEV ? lazy(() => import('./music/dither/Gallery')) : null
const CockpitPreview = import.meta.env.DEV ? lazy(() => import('./music/cockpit/Preview')) : null

const query = new URLSearchParams(window.location.search)
const ActiveApp = CockpitPreview && query.get('cockpit-preview') === '1' ? CockpitPreview : DitherGallery && query.get('dither-gallery') === '1' ? DitherGallery : MusicApp

createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<main className="app-loading" role="status">正在为你准备星球…</main>}><ActiveApp /></Suspense></StrictMode>)
