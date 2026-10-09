# Moodverse retro cockpit implementation

Approved spec: the cockpit plan in the current task, confirmed reference images.
Base: b00e522, preserved music-dithering-ui; implementation branch: codex/music-cockpit-ui.

## Global constraints

- Keep the live purple/pink/blue dither universe, cell dynamics, spherical rotation,
  satellite depth occlusion and reciprocal 2.1-second nebula flight.
- Beige aged enclosure, dark/amber CRT terminals, a shallow U-shaped console.
  Windshield ~80% of desktop overview; side wings face inward. No new image assets.
- Left terminal: own planet, songs, appearance, Moments, Orbit, friends and messages.
  Center: exact-song encounters, roam, bottles, Galaxy lists and visitors.
  Right controls: Galaxy classification, home/Galaxy flight, settings and live gauges.
- Both monitors approach to a straight-on browser-filling bezel, and retreat.
  Opening a terminal must not change the exterior scene. Native semantic controls.
- Preserve public/private rules, anonymous identity, demo song warnings, existing
  API formats, quotas and authorization. No D1 migration, new AI or music provider.
- No standalone business dialogs/right-hand panes. In-terminal preflight and editor.
- Drafts and scroll state survive channel changes; wheel cannot leak to the exterior.
- Horizontal cockpit on phones; bounded console pan, no document overflow.
- One persistent renderer, actual viewport resize/picking, reduced-motion and Canvas2D.
- Code-only commits. Release only moodverse-music-staging main; never legacy care D1.

### Task 1: Navigation contracts
Implement typed exterior/console/travel reducer and storage-safe CRT preference.
Tests: terminal navigation never changes exterior; settings/back restores channel;
travel tokens reject stale completion; return route preserves origin; account reset.
Expected: targeted tests and typecheck pass. Commit navigation state foundation.

### Task 2: Physical shell
Reusable windshield, monitor/bezel, tabs, gauges, knob, lever and CRT surface.
Tests: semantic controls, focus/escape/history return, correct channel actions;
effects disabled by reduced motion, fields suspend tracking; layout bounds.
Expected: functional shell without static whole-screen image. Commit shell.

### Task 3: Personal terminal
Move creation, song/name management, appearance, Moments and Orbit into left CRT.
Keep existing server operations; appearance becomes inline and preserves cancel/apply.
Tests: creation, appearance save/cancel/conflict, draft survival, friends and DM.
Expected: no standalone editor modal; personal workflow tests pass. Commit migration.

### Task 4: Exploration terminal
Move collision, roam, persistent bottle pages, Galaxy list, visitor and settings to CRT.
Preserve five Orbit groups, exact-song semantics, privacy and bottle quotas.
Tests: preflight without side effects, hidden visits, persistent bottle draft,
classification, authorized moderation, setting return.
Expected: no standalone business dialog; existing API tests pass. Commit migration.

### Task 5: Unified travel and renderer viewport
Flight on actual destination changes only; loading holds within nebula; arrive overview.
Keep request lock/token, recover source on failure/cancel, no cached private content.
ResizeObserver + correct coordinates; single canvas survives navigation.
Tests: reciprocal flight, slow loads, stale/cancelled replies, wheel isolation and resize.
Expected: no partial planet pop-in; shader/style unchanged outside cockpit. Commit flight.

### Task 6: Craft and responsive hardening
U-shaped perspective, functioning gauges, CRT texture/effects and local effect toggle.
Native body copy, contrast/focus, 44px touch, portrait console pan, 200% zoom.
Tests: reduced motion, failed WebGL, keyboard, internal scroll and viewport bounds.
Expected: inspected desktop + landscape + portrait screenshots. Commit polish.

### Task 7: Review and isolated release
Run whole suite, typecheck, build and staging preflight. Fresh whole-branch review.
Verify all product paths and 20 focus/return cycles without renderer accumulation.
Push new branch; deploy isolated staging main. Check root/assets/API 200 and real reads.
Expected: verified commit and deployment, previous deployment retained for rollback.

## Review focus
Input/focus/history isolation, draft preservation, exact matching and privacy,
late response races, cancelled POST semantics, GPU lifecycle, perspective picking,
mobile viewport bounds, disabled CRT effects and no fake instrument values.
