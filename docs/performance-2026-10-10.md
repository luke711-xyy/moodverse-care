# MOSIC performance verification — 2026-10-10

## Second pass — animation scheduling and CRT work

- CRT noise now lazily shares eight immutable frames per fixed resolution (120×70 and 420×260; at most 3.6 MiB total), instead of regenerating every pixel on every refresh. The grayscale distribution, canvas resolution and 24 Hz target remain unchanged. Each screen uses a timer at its actual noise rate, rather than waking on every display refresh. Inactive/disabled screens do no noise work; hidden pages cancel their timers. Reduced-motion screens retain a static frame.
- Flight holds stop scheduling React state updates while awaiting data, and resume when the destination is ready. Retreat frames with unchanged progress do not rerender the page. Flight and Galaxy journey state publications are capped near 60 Hz on high-refresh displays; hidden pages cancel their animation callbacks and resume without adding the hidden duration.
- Regression-first verification: six failures reproduced the old repeated-noise generation, waiting-flight callbacks, and 120/144 Hz updates. A separate regression reproduced the still-scheduled hidden Galaxy callback before fixing it.
- 39 targeted checks passed across CRT/performance, flight, Galaxy journey, cockpit controls and renderer pointer/frame scheduling. No repository-wide suite was run for this pass (per the project's delivery guidance). The first-pass legacy-suite caveats below still apply.
- Browser microbenchmark: 120 full-size noise frames using real Canvas2D; old loop approximately 501 ms, new first pass including cache warmup approximately 60 ms, warmed approximately 14 ms. Eight unique frames used 3,494,400 bytes for the full-size bank. This is an isolated local noise-drawing measurement, not an overall application FPS/CPU claim.
- Real browser control smoke: all SONG/ARTIST/GENRE controls selected and displayed the correct Chinese label. Background-page noise canvases stayed blank, as expected; simulated visibility in the local fixture resumed actual Canvas2D output (alpha 255 and changing pixels). The resulting cockpit screenshot was inspected. No database writes or backend/auth changes.
- Final production build passed. Release `76c386bc` was deployed with the music production configuration. The canonical root and all four JS/CSS assets returned HTTP 200 and matched local build bytes; hashed assets retain one-year immutable caching and HTML still revalidates.
- A development-only hot-reload hook-order error occurred when adding a hook while the preview was already mounted. The subsequent fresh production-page load rendered the populated Pop Galaxy, LINK LIVE status, four CRT screens, and the expected new `MusicApp-G3KzG1nA.js` bundle. No production interaction or data mutation was performed for this read-only smoke check.

## Scope

Frontend-only optimization: bounded public music cache (48 pages, 2-minute TTL, deduplicated in-flight requests, independent consumer cancellation), deferred/sequential prefetch of at most two pages, non-blocking Moments loading, coalesced animation updates with a 60 Hz ceiling, cell-wise thumbnail generation, immutable caching for content-hashed /assets/ files. No database changes, schema changes or private/social response caching. The pre-change GitHub rollback tag remains `rollback/pre-pixel-seam-20261010` at `67d4e04106dc4ab6786893a23f8353d57194837e`.

## Verified

- Production build: passed (TypeScript + Vite).
- 28 targeted tests passed across read-cache, prefetch, thumbnail fidelity/performance, renderer and pointer/frame scheduling.
- 12 MusicApp checks passed when run in isolation with a 20-second per-test timeout: first-paint independence from Moments, appearance edit, planet creation, anonymous identity, cross-tab account changes (two existing scenarios), empty catalog, star window, draft preservation, terminal scrolling, slow-visit arrival and Escape behavior.
- 5 Galaxy content UI checks and 4 social-sync checks passed.
- Total relevant successful checks: 49. This is NOT a claim that the entire repository suite passes.
- Browser thumbnail probe: same six 160×160 images, pixel size 6, cold procedural generation. Before: approximately 400 ms total. After: approximately 81 ms total. All six RGBA checksums identical: flow 3466958533; score 4077452389; flower 3022760517; tide 2117159237; digital 1456601797; prism 1593289893. Timing is a local sample, not a cross-device or overall-app speed guarantee.
- Actual WebGL2 smoke: 50,752 cells, GL error 0. The background browser throttles animation callbacks; this was not used as an FPS benchmark.
- Unit coverage verifies roughly 60 rendered frames per simulated second on 60/120/144 Hz displays, continued motion phase, coalesced state updates and hidden-page suspension.
- Whitespace/diff check passed.
- Production release 62f7ba37 completed using the music production configuration. The canonical https://moodverse-care.pages.dev root and all four generated JS/CSS assets returned HTTP 200 and matched local build bytes exactly. HTML remains revalidated; hashed assets returned `public, max-age=31536000, immutable`.

## Broader legacy page checks — not all green

The full MusicApp test file was also tried. One current run had 29 failures (mostly 5-second timeouts); the untouched rollback snapshot had 27 failures under the same default timeout. The nine failures unique to the current broad run all passed in the isolated follow-up, together with the new startup test and two account-switch tests. Existing fixture/assertion failures and the broader timeouts were not silently repaired as part of this performance change.

The table preserves every failed test name from those two broad runs. “Current” and “baseline” describe those runs only, not the final isolated result. See the successful isolated checks above for retested coverage.

| Test name | Broad current run | Untouched baseline run |
| --- | --- | --- |
| photo Moment publishing preserves the selected file on failure and clears it only after confirmation | Failed | Failed |
| Galaxy journey endpoint returns home with keyboard input | Failed | Failed |
| Galaxy journey endpoint returns home with drag input | Failed | Failed |
| Galaxy journey endpoint returns home with wheel input | Failed | Failed |
| appearance preview cancels locally; apply saves overrides with the confirmed revision | Failed | Not failed |
| a new user can choose exactly three songs, create a public planet and see deterministic 2D visuals without AI polling | Failed | Not failed |
| clearly identifies the fictional non-playable staging catalog | Failed | Failed |
| keeps song selection and social navigation usable with the Canvas2D visual fallback | Failed | Failed |
| clearly labels the automatically created anonymous account | Failed | Not failed |
| an auth change from another tab clears this tab and reloads the shared session | Failed | Failed |
| legacy cross-tab session notifications deduplicate without exposing another account's state | Failed | Failed |
| an empty catalog explains that the controlled catalog must be populated before planet creation | Failed | Not failed |
| settings load server privacy preferences and only show confirmed planet and Moment visibility changes | Failed | Failed |
| a moderator can review report metadata from settings without exposing target content | Failed | Failed |
| an owner can edit planet details, manage one to five selected songs, and choose a primary song | Failed | Failed |
| settings distinguish a failed Moment read from an empty Moment list and allow retry | Failed | Failed |
| an owner can visit an exact-song match and keep its public profile when opening and closing private messages | Failed | Failed |
| a visitor can browse public Galaxy planets by genre and open one without a shared-song claim | Failed | Failed |
| homepage random roam shows model-ranked public discoveries and asks before leaving a visible or incognito visit trace | Failed | Failed |
| My Orbit lets users answer friend requests and open a friend-only text conversation | Failed | Failed |
| a visitor can send a friend request from a public planet and block its owner | Failed | Failed |
| a visitor can send, receive, open, comment on and release a drift bottle | Failed | Failed |
| settings can remove a virtual friend satellite without treating it as a real friendship | Failed | Failed |
| clicking a Galaxy star opens a dismissible floating window without entering the exploration terminal | Failed | Not failed |
| the cockpit boots directly into Galaxy; opening my planet never replaces its windshield | Failed | Failed |
| cockpit channels keep the same world renderer and preserve a Moment draft across Orbit and overview | Failed | Not failed |
| terminal wheel scrolling never advances the exterior Galaxy journey | Failed | Not failed |
| a slow visit holds in the nebula without a cancel button, double confirmation posts once, and arrival resumes when ready | Failed | Not failed |
| Escape inside visit confirmation returns only one channel and never records a visit | Failed | Not failed |
| Moment heading always has a quick publish shortcut with 0 existing Moments | Not failed | Failed |
| Moment heading always has a quick publish shortcut with 1 existing Moments | Not failed | Failed |
| jump lever switches the persistent windshield between Galaxy and home without opening a terminal | Not failed | Failed |
| a planet owner can edit a Moment and only sees the saved version after the server confirms it | Not failed | Failed |
| a planet owner can view all Moments and confirm deletion before a Moment is removed | Not failed | Failed |
| settings explain the anonymous browser identity and omit email account controls | Not failed | Failed |
| My Orbit shares planet cards across its lists and omits song encounters and daily passing planets | Not failed | Failed |

The repository-wide suite was not run. Large assets, audio, private messages and account data were not added to the Git snapshot or persistent browser caches.
