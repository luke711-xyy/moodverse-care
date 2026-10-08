import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const LegacyApp = lazy(() => import('./App'))
const MusicApp = lazy(() => import('./music/MusicApp'))
const DitherGallery = import.meta.env.DEV ? lazy(() => import('./music/dither/Gallery')) : null

const query = new URLSearchParams(window.location.search)
const ActiveApp = DitherGallery && query.get('dither-gallery') === '1' ? DitherGallery : query.get('legacy') === '1' ? LegacyApp : MusicApp

createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<main className="app-loading" role="status">正在为你准备星球…</main>}><ActiveApp /></Suspense></StrictMode>)
