# Moodverse 2D Dithering implementation

Authority: the approved plan in this thread, 2026-10-08. No feature reduction.
Branch: codex/music-dithering-ui, based on the current music MVP including its
uncommitted friend satellite and journey fixes. Preserve unrelated heavy assets.

## Global constraints

- Music app uses exclusively 2D visuals: no Three/R3F/models/cameras in its build.
  The user's subsequent sphere reference allows mathematical 3D surface
  projection and lighting inside the 2D shader, not restoring the archived engine.
- Preserve Galaxy, exact-song portals, AI discovery/ranking, Orbit, friendships,
  DMs, Moments, bottles, anonymous identity, moderation and access permissions.
- Five palette anchors: #08080D, #F2EFF8, #6C9DFF, #8E6BFF, #F279C5.
- Four forms (organic, particles, pulse, annulus) x seven motifs (flow, score,
  flower, tide, digital, dust, prism). Accessible text and semantic controls.
- Deterministic song appearance, stable planet seed, optional sourced audio
  features; never claim guessed tempo is measured. Primary weight 50%, others
  split 50%; one song has 100%. Manual overrides survive track changes.
- Shared 2D WebGL2 renderer; cached Canvas2D thumbnails/fallback; no GL per card.
- Reduced motion, hidden-page pause, cleanup/context loss and narrow layouts.
- No private Moment text in public appearance. No appearance AI queue/polling.
- Preserve legacy data for rollback, support existing visual JSON on reads.
- Publish branch, then verify isolated staging; never overwrite old original site.

## Task 1: Deterministic appearance domain

Produces: DitherPlanetSpec v3, bounded overrides, feature validation, weighted
mapping, stable compatibility adapter. Consumed by server, renderer and editor.
Steps: tests RED; implement pure domain and optional feature types; tests GREEN;
commit. Expected: deterministic, weighted, bounded, no private text inputs.
Verification: npm test -- tests/dither-appearance.test.ts; npm test.

## Task 2: Shared 2D assets and rendering

Produces: shared renderer, CPU sampler, four forms/seven textures, satellites,
orbits, loader/cards/titles/buttons, quality/lifecycle and gallery fixture.
Steps: real sampler/layout/lifecycle tests RED; implementation; tests and browser
screenshots, shader compile and fallback checks; commit.
Expected: visibly distinct complete motifs, native readable controls, no 3D.
Verification: renderer/component tests, typecheck, build, browser inspection.

## Task 3: Synchronous appearance API and compatibility

Produces: authoritative v3 visuals across owner/public/Galaxy/Orbit; owner PATCH
overrides; optional catalog features with provenance; archival compatibility.
Steps: API tests RED; atomic create/update; stop appearance queue and stale writes;
catalog/import/schema compatibility; targeted and full tests; commit.
Expected: immediate v3 after save, old records readable, no gateway appearance
requests, matching AI untouched, private data never exposed.
Verification: planet/public/Galaxy/catalog/compose tests, full suite.

## Task 4: Replace product scenes and UI

Produces: own planet/Galaxy and reverse nebula transitions; fixed axis;
arc song wall + focused record; complete preview/apply/reset editor; translated
friend/music satellites; all social views themed and copy distilled.
Steps: interaction tests RED; replace scene hierarchy and composition polling;
remove legacy import from music entry; polish and responsive/accessibility checks;
commit. Expected: product functions unchanged, uniform glyphs across routes,
no 3D resources loaded, internally scrolling panels do not move scene.
Verification: app/API regression tests, browser keyboard/touch/scroll/screenshots.

## Task 5: Verification, review and isolated rollout

Steps: production dependency/build audit; all tests and staging preflight; fresh
whole-branch review; fix important findings RED/GREEN; publish branch; deploy
isolated staging and inspect live routes/data. No merge into legacy main.
Expected: all explicit approved-plan requirements supported by current evidence.
Verification: tests/build/preflight, bundle report, live two-user E2E and resource
HTTP checks, renderer quality/fallback/reduced-motion and privacy checks.

## Review focus

Determinism, malformed/unbounded visual specs, user override precedence,
concurrent saves, old task late completion, private information, stable identity,
GPU lifecycle/context loss, no stale RAF transition, screen-space hit testing,
320px overflow, authentic motifs, all social functionality and no 3D bundle.

## Task 6: Spherical volume within the dither renderer

Authority: user's OpenProcessing reference and supplied point-sphere example.
Independently implement rotating surface coordinates, depth and view-space
lighting on the existing quad, keeping purple/pink/blue dithering and song/manual
parameters. No p5 dependency, model downloads, AI, new database fields or 3D scene.
Planet/star/friend spheres gain volume; music-cover discs and travel nebula remain
flat. Following the user's addition, music satellites are volumetric spheres.
Project the rotating body's silhouette as well as its material. Use lifted
elliptical orbit depth and painter order so rear satellites are occluded by the
planet and cannot steal clicks; front satellites remain visible. Keep the orbit
clock continuous so slower rates complete a full revolution without jumping.
Preserve transparent silhouettes, pixel-cell picking, pointer response, pause,
reduced motion and cached CPU fallback. The fallback remains a static sphere.
Steps: sphere tests RED, shader/CPU implementation GREEN, all 28 combinations
visually inspected, real GPU rotation/light and click checks, full tests/build,
publish the same music branch and isolated staging; verify new resources/live UI.
Reference: https://openprocessing.org/@noel/2812705 (CC BY-NC-SA 3.0); use the
mathematical principle, do not copy its p5 source into the product.
