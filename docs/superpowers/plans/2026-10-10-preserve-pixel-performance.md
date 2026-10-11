# Preserve Pixel Performance Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user has approved the measured recommendations and requested continuous sequential implementation.

**Goal:** Reduce rendering cost while keeping the planet's chosen pixel grain stable.

**Architecture:** Cache invariant motion work, restrict GPU work to the visible view, isolate static hardware from animation, and replace irreversible pixel downgrading with reversible workload pacing.

**Tech Stack:** React, TypeScript, WebGL2, Vitest, Cloudflare Pages.

**Spec:** `docs/performance-profile-2026-10-10.md` and the user's approval.

## Global Constraints

- Preserve prior dirty changes and the existing official domain.
- No database changes, Git push, or unrelated refactors.
- Production build plus relevant regression tests and browser checks; no routine whole-suite or independent review, per AGENTS.md.
- Preserve pointer holes, healed seams, orientation, pan/zoom, and shared audio behavior.
- Release using `wrangler.music-production.pages.toml` in the temporary release directory.

## Review Focus

- Cache invalidation after cell-grid replacement, rotation, and pulse edits.
- Visible clipping during zoom-out, edge panning, flight, and portrait rotation.
- Transparent/filter edges and animated coffee remaining correctly positioned.
- Slow-frame pacing must not permanently reduce planet cell count.
- Hidden pages, paused music, context restoration, and performance recovery.

### Task 1: Motion calculation

**Files:** `src/music/dither/motion.ts`, `tests/dither-motion-performance.test.ts`, existing coverage/motion tests.
**Interfaces:** Keep `stepParticleField` and `createDitherMotion().apply` compatible. Cache by live field and rotation, never by saved appearance globally.
- [x] RED: repeated stable-frame work must not repeat per-cell trigonometry; a rotated field must match independently computed reference tide/integration.
- [x] GREEN: cache spatial phases/rotated homes; hoist common time/amplitude; retain bounded seam coverage. Neighbor replacement not adopted: no independently demonstrated benefit.
- [x] Targeted motion, coverage, and audio-clock tests pass; browser CPU improves without fewer cells.

### Task 2: Visible GPU work

**Files:** `observation.ts`, `Stage.tsx`, `DitherCanvas.tsx`, `renderer.ts`, observation/canvas GPU checks.
**Interfaces:** Optional logical visible rectangle in `DitherFrame`, computed from logical stage size, overscan, and CSS camera; renderer converts to framebuffer scissor with outward rounding.
- [x] RED: literal clipping rectangles cover default view, zoom-out, translation and boundaries without changing assets.
- [x] GREEN: scissor visible drawing while retaining full canvas coordinates and interaction mapping; clear correctly across camera/context changes.
- [x] Native GPU image equality verified in four camera configurations; no differing visible RGBA channels and lower measured GPU work.

### Task 3: Cockpit work isolation

**Files:** `DeskObjects.tsx`, `desk.css`, cockpit surface tests.
**Interfaces:** Keep layout dimensions, art and existing action semantics. Separate animated vapor from the large filtered static desk-prop surface; use compositor caching only for bounded layers that benefit.
- [x] RED: animated vapor must not share the filtered paint ancestor with static desk hardware; retain its coordinates and accessible decoration semantics.
- [x] GREEN: separate paint layers without deleting the hardware/ink effect; independent FPS gain not demonstrated in the short sample.
- [x] Cockpit surface/shell tests and desktop browser visual check passed; composition and effects retained.

### Task 4: Reversible pacing and release

**Files:** new `render-budget.ts`, `DitherCanvas.tsx`, pacing/canvas tests, profiling report addendum.
**Interfaces:** Use bounded warm-up, measured work plus sustained cadence, hysteresis and recovery to pace 60/30 Hz without changing material-cell budget. Explicit `quality='low'` remains supported.
- [x] RED: startup hiccups do not downgrade; sustained cost enables pacing; sustained headroom restores full cadence; slow RAF does not change pixel count.
- [x] GREEN: retain normal pixel budget/DPR in auto; defer costly animation updates under sustained load, reset sampling after visibility/pause changes.
- [x] Production build and 63 scoped regression tests passed; real browser baseline comparison and camera/interaction numerical and pixel checks completed.
- [x] Deployed release `ea2f4be3`; canonical homepage and all 4 bundled assets verified byte-for-byte. Final live grain observation recorded in the profiling report.

## Execution ledger

Ruling: The user's approved sequential execution and repository fast-delivery instructions take precedence over an additional plan approval, blanket full-suite, automatic commits and external reviewer. No unrelated dirty work is staged or committed.
Pre-flight: Tasks 2/4 share DitherCanvas; clipping is pure view metadata, pacing must not modify it. Task 1 retains the motion API consumed by Task 4.
Post-flight: Targeted tests 63/63, production build passed, native numeric/camera pixel comparisons passed. Retained original seam algorithm because the alternative did not demonstrate a stable independent gain. Desk separation retains visuals but this short benchmark does not establish an independent FPS improvement. Measurement and publication evidence: `docs/performance-profile-2026-10-10.md`.
