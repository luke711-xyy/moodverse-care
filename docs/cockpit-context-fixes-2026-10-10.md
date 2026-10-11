# Cockpit context fixes — 2026-10-10

## Latest cancellation clarification

- The result's explicit `×` now cancels and clears that search, including the middle cockpit monitor. It also invalidates any in-flight response so cancelled results cannot reappear. It remains in the collision channel; ordinary return to the cockpit still preserves a non-cancelled search. This supersedes the earlier statement that closing with `×` preserves results.
- The final focused application/shell/CD run passed 14 checks, including both cancellation and ordinary-return persistence. No database or search-authorization change was made for this follow-up.

## Changes

- Exploration mini-preview uses the exterior context. Home always shows `扫描待命`; a retained Galaxy selection no longer leaks into the home preview. Genre, artist and song share the same rule.
- Physical `撞歌` on a visited planet selects the currently playing visited song, or its primary/first song, and shows that planet's CD collection. Explicit searches from the personal song list keep their own-song context.
- Song Portal accepts an optional source planet. The server verifies exact selected-song evidence, public visibility and both directions of blocking, excludes the source from results, and rechecks source eligibility after model ranking. Confirmed onward visits carry the same evidence without adding songs to the visitor's own collection. Existing own-selection/public-Moment authorization remains unchanged when no source is supplied. No schema change.
- Wheel navigation stops at the final Galaxy and discards the arriving overshoot. A separate `.16` normalized wheel approach is required to enter home (about six maximum-sized wheel events). Reverse scroll immediately moves back and resets the approach. Keyboard, drag and explicit home controls retain their prior behavior.

## Verification

- 55 API/client/navigation tests passed, including private/missing/wrong-song/blocked sources, source made private during ranking, invalid onward sources, encoded IDs and confirmed onward encounter evidence.
- 6 focused app checks passed: genre/artist/song return-home preview, visited-planet collision, final-Galaxy wheel approach and terminal scroll isolation. Visited-planet collision was rerun after the final explicit-source adjustment and passed.
- Production build and `git diff --check` passed. No full-suite run or independent review was performed.
- Published with `wrangler.music-production.pages.toml` copied to a temporary release directory as `wrangler.toml`, to the existing `moodverse-care` project / `main` branch. Release: `434703e7`.

- Canonical production HTML and all four JS/CSS assets returned 200 and matched the local build byte-for-byte. HTML revalidates and hashed assets retain immutable caching.
- A fresh independent production tab loaded `MusicApp-CM65OeQz.js`, displayed all eight genre navigation stops, and selecting Pop updated the exploration mini-preview to Pop. The return flight paused correctly when the tab became hidden; complete return-home checks are covered by the focused app tests above, not claimed as completed native-browser flights. The independent tab was closed without altering existing tabs or writing visit records.

## Follow-up: fill the home approach on the axis

- The final wheel approach now contributes to the axis fill while the scene camera and current-sector label remain at the last Galaxy. The last dashed leg reaches 100% on the same input that starts the return flight, and stays filled during departure.
- Reduced extra wheel distance from `.16` to `.12` (25% shorter). The final-sector overshoot is still discarded, and reverse scroll, sector selection and context changes reset the approach.
- Failing tests first reproduced the missing axis contribution and the old return threshold. The UI check uses an explicit eight-sector fixture; its initial one-sector fixture was incorrect for the expected 7/8 fill. Expensive repeated accessibility-tree queries also timed out on this machine and were replaced with direct DOM readiness checks, without changing app behavior.
- Follow-up verification: all 5 navigation tests and 2 focused app checks passed (7 total); production build passed with `MusicApp-DtwNJPnE.js`. No full-suite run.
- Published follow-up release `bef07aec` with the music-production configuration. Canonical HTML and all four hashed assets returned 200 and matched the local build byte-for-byte; the new bundle was confirmed in a fresh production tab.
- Real production wheel smoke passed: final sector fill `.875`, partial home approach `.902778`, reverse `.842593`, near-home `.986111` without flight, then exactly `1` with flight started. At full fill the line endpoint was within `.016px` of the home-node center. The current sector stayed Ambient throughout the home leg. The independent verification tab was closed; no visit records or database changes were made.

## Follow-up: separate opening results from searching (2026-10-10)

- Supersedes the automatic-song-selection behavior described above: opening the middle monitor, the physical collision channel, or the existing-result link now only navigates. None of those actions chooses a song or requests new matches.
- Only explicit per-song `撞歌` actions start a search. The visited planet's CD collection and validated `sourcePlanetId` still apply when the user deliberately searches from that collection.
- Closing the result view now returns to the cockpit without deleting the previous search. Its title, contact names, coordinates, count and radar state remain unchanged across channel changes, playback, visits and returns. Account resets and social eligibility invalidation still clear account-scoped results when required.
- Seven failing checks first reproduced unwanted home/visitor searches and result clearing. Eleven focused app/CD checks then passed; the visited-source check was expanded and rerun successfully to cover manual playback and returning home with the visited search intact. Production build and whitespace checks passed. No full suite or independent review was run.
- Published release `7477b2af` using the music-production temporary configuration. Canonical HTML and all four JS/CSS resources returned 200 and matched the production build byte-for-byte. A fresh independent production tab loaded the new bundle, opened the middle monitor, changed the browsed CD and returned to the cockpit with zero song-search requests, an unchanged mini-preview and no page alerts. Visitor/cached-result transitions were verified in the focused app tests, without generating production visit or search records. The verification tab was closed.
