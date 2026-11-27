import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './music/base.css'
import MusicApp from './music/MusicApp'

const DitherGallery = import.meta.env.DEV ? lazy(() => import('./music/dither/Gallery')) : null
const CockpitPreview = import.meta.env.DEV ? lazy(() => import('./music/cockpit/Preview')) : null

const query = new URLSearchParams(window.location.search)
const ActiveApp = CockpitPreview && query.get('cockpit-preview') === '1' ? CockpitPreview : DitherGallery && query.get('dither-gallery') === '1' ? DitherGallery : MusicApp

// The production cockpit is eager: no separate full-screen loading terminal
// between the document and the app. Only isolated development tools are lazy.
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={null}><ActiveApp /></Suspense></StrictMode>)
