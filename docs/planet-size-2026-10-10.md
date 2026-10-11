# Unified planet size

## Findings

- Read-only production checks found the current browser's own planet and three public demo planets all had generated size 1 with no size override. The default observation transform was also scale 1.
- The scene builder used a 0.765 multiplier for home but 1 for a visitor. Identical planets therefore appeared about 30.7% larger when visited (285 versus 218.025 radius units in a 1000×700 frame).
- Galaxy overview also varied planet radius by list position (0.21 / 0.228 / 0.246), unrelated to the planet's appearance.

## Changes

- Keep the existing home reference unchanged and apply it to visited planets, their orbital layout and flight endpoints.
- Ordinary generated size is 1, including reads of older generated defaults. Explicit user size overrides are preserved, as are all other appearance fields.
- Only `demo:planet:` identities receive deterministic size variation between 0.85 and 1.15. The same identity retains its size on reload and song changes; existing demo records receive it through the read adapter without a database rewrite.
- Remove list-position sizing from Galaxy overview. Overview and destination views still have their respective scene compositions, but a planet's intrinsic size no longer depends on list position or viewer ownership.

## Verification

- Regression tests failed before fixes for own/visitor mismatch, ordinary default normalization, demo variety, public-read adaptation and Galaxy list-position sizing.
- Final targeted run: 66 tests passed across appearance, stage, public reads, Galaxy API/scene, migration, flight and observation controls.
- The initial run also exposed an old Galaxy scene fixture missing `isVirtual: false`; that fixture was corrected to represent a real friend, matching the already-existing production filter. No friend visibility behavior changed.
- Native WebGL check: home and visitor reference renders both used radius 218.025 and produced identical full-frame pixel checksums (1124583393), with GL error 0. Example demo sizes were 0.858 and 1.107, with the same base scene radius. The comparison screenshot was inspected.
- No database writes, account changes or visit records were made during verification. Temporary browser tabs and the local server were closed.
- TypeScript and production build passed. Release `81578686` used the music production configuration. Canonical HTML and all four JS/CSS assets returned HTTP 200 and matched local build bytes; the new cockpit loaded successfully. Live reads confirmed own size 1, demo glass-sea 0.858 and demo river-station 1.107.
