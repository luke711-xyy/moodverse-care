# Moodverse Music MVP Domain Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the first additive, tested domain and D1 storage contracts needed for the music-based Moodverse MVP without altering the legacy journal schema or production data.

**Architecture:** Define pure TypeScript validators for the song-selection and Moment-visibility rules, then add a versioned SQLite/D1 migration for the new music domain. Keep the old tables intact; use the existing internal user ID only as the owner key until the later authentication phase supplies durable account identity.

**Tech Stack:** TypeScript 5.9, Vitest, Cloudflare D1 / SQLite, Node 22 built-in `node:sqlite` for migration tests only.

**Spec:** [Moodverse 音乐偶遇 MVP｜产品与工程改造说明书](https://zcngcaimq8jy.feishu.cn/docx/SKsOdC1BsovVkYxXRh3cK6vInVg), especially sections 2.1–2.5, 2.11, 3, 4.1, and 5.

## Global Constraints

- Planet creation selects exactly 3 catalog tracks; later the active selection contains 1–5 tracks. This follows section 2.2; section 2.11 was corrected to the same rule in document revision 40.
- A track is identified by its stable canonical track ID; exact ID equality, never AI similarity, determines a same-song candidate.
- A new planet and a new Moment default to public, with per-Moment visibility; only the owner can read private Moments.
- Keep all legacy journal tables and rows intact. This migration is additive and is not deployed over the existing production environment.
- Runtime AI input must be minimized and permission-filtered; no raw private text is written to AI task records. This phase defines storage only and does not invoke a model.
- Codex remains the development tool; Moodverse runtime inference is a separate MacBook-hosted service. No Windows inference host is part of this plan.

## Review Focus

- Trim-equivalent or repeated canonical IDs must not create duplicate selections — pinned in Task 1 tests.
- Creation and update have different exact cardinality rules — pinned in Task 1 tests.
- A visitor must never receive a private Moment through the domain projection — pinned in Task 1 tests.
- Concurrent or malformed writes must not exceed five selected tracks, duplicate a slot, or create two primary tracks — pinned in Task 2 SQLite constraints.
- Migration application must leave the legacy schema usable and support deleting an owned music planet without orphaning dependent rows — pinned in Task 2 migration tests.

---

### Task 1: Shared Music Domain Rules

**Files:**
- Create: `src/music-domain.ts`
- Test: `tests/music-domain.test.ts`
- Modify: `docs/superpowers/plans/2026-09-29-music-mvp-domain-foundation.md`

**Interfaces:**
- Consumes: no new module.
- Produces: `validateTrackSelection(trackIds: unknown, operation: 'create' | 'update')` returning a discriminated result with normalized IDs or a stable error code; `canReadMoment(visibility: 'public' | 'private', isOwner: boolean): boolean`.

- [x] **Step 1: Write failing tests** for creation accepting exactly 3 unique non-empty IDs; update accepting 1–5; rejection of 2/4 creation IDs, 0/6 update IDs, malformed IDs and duplicates after trimming; and owner/visitor Moment visibility.
- [x] **Step 2: Run `npm test -- tests/music-domain.test.ts`** and confirm the expected missing-module/export failures.
- [x] **Step 3: Implement the smallest pure validators** in `src/music-domain.ts`. Return stable error codes for malformed selection, wrong count, and duplicate IDs; do not query catalog existence in this pure module.
- [x] **Step 4: Run `npm test -- tests/music-domain.test.ts`**, then `npm test` and `npm run typecheck`; all must pass.
- [x] **Step 5: Commit** only the domain module, its test, and this plan as `feat: add music MVP domain rules`.

### Task 2: Additive Music Core Migration

**Files:**
- Create: `migrations/0007_music_mvp_core.sql`
- Modify: `schema.sql`
- Test: `tests/music-schema.test.ts`

**Interfaces:**
- Consumes: the `users` internal owner IDs and the selection limits from Task 1.
- Produces: D1 tables `music_track_catalog`, `music_planets`, `music_planet_tracks`, `music_moments`, and `music_ai_tasks`.

- [ ] **Step 1: Write failing SQLite tests** that initialize a minimal pre-0007 database with existing `users` and a populated legacy table, apply migration `0007`, then exercise track foreign keys, one music planet per owner, public-by-default planet and Moment visibility, private Moment values, unique track/slot constraints, the five-track database cap, at most one primary track, and cascading cleanup while legacy data remains intact. In a separate test, load `schema.sql` into a fresh database and verify it contains the same new tables and constraints as the migration.
- [ ] **Step 2: Run `npm test -- tests/music-schema.test.ts`** and confirm it fails because migration `0007` does not exist.
- [ ] **Step 3: Implement the additive migration** with stable catalog IDs and official playback URLs; one music planet per internal owner; ordered 1–5 track slots; per-Moment public/private visibility and optional photo; and AI task metadata (kind, model/schema version, status, input hash, validated result, error and latency) without raw request text. Mirror the new DDL in `schema.sql`.
- [ ] **Step 4: Run `npm test -- tests/music-schema.test.ts`**, then `npm test`, `npm run typecheck`, and `npm run build`; all must pass. The migration test must execute the SQL and verify constraints, not merely search the migration text.
- [ ] **Step 5: Commit** only the migration, schema mirror, and migration test as `feat: add music MVP core schema`.

## Subsequent Plans in the Full MVP

This is the first foundation tranche, not completion of the product scope. Continue in separately reviewable plans for: durable sign-in and demo accounts; catalog/planet/Moment APIs and UI; Mac-hosted AI gateway and Composer; exact Song Portal; dynamic Galaxy and random roam; Orbit/friends/DM; drift bottles; then cross-account privacy, accessibility, and isolated demo deployment. Do not deploy this branch to the current production domain.
