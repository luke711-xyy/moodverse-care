# Codex Execution Plan — Moodverse V2 Initial Round

Use `docs/MOODVERSE_V2_IMPLEMENTATION_SPEC.md` as the product source of truth.

## Working rule

Do not reinterpret product architecture. Do not bring back:
- home galaxy
- six personal planets
- song satellites
- mood diary
- care cards
- life-mainline themes
- required friend graph

Build the Golden Path first.

---

## Task 0 — Baseline and safety

1. Run typecheck/tests/build on current branch.
2. Record existing failures separately; do not “fix” unrelated legacy behavior.
3. Keep all legacy code available for rollback.
4. V2 work should be isolated under `src/v2/` where possible.

Definition of done:
- current baseline known
- no destructive DB/schema migration

---

## Task 1 — V2 shell and routing

Create V2 app state with these screens:
- landing
- song-picker
- my-planet
- other-planet

Add modal/overlay state:
- song-sheet
- moment-card
- warp

Switch branch entry point to V2 app.

Do not render legacy universe/home-galaxy flow.

Definition of done:
- opening app shows V2 landing
- no legacy galaxy screen appears

---

## Task 2 — Demo data and song model

Add:
- Song
- SongFeatures
- DemoUser
- Moment
- PlanetSong

Seed:
- 12 songs
- 8 users
- deterministic 3-planet roaming chain

Persist current user's selected 3 songs in localStorage.

Definition of done:
- three selections survive refresh
- every demo song used in Golden Path has a destination

---

## Task 3 — Single planet scene

Build a V2 single-planet scene.

Requirements:
- exactly one hero planet
- drag rotation is optional but preferred
- no own galaxy
- no six slots
- no embryo planets
- no 3D song satellites

Reuse:
- procedural terrain
- atmosphere/clouds
- starfield
- lighting
- performance utilities

Definition of done:
- one planet fills the home composition on desktop and mobile

---

## Task 4 — Music-to-planet visual composer

Implement deterministic song aggregation:
3 selected songs → combined music feature vector → existing planet visual parameters.

Create `music-visual.ts`.

At minimum, visibly vary:
- palette
- fog/clouds
- glow
- terrain ruggedness or land/ocean balance
- one additional effect (wind/rain/vegetation/etc.)

Definition of done:
- selecting clearly different song sets generates clearly different planets
- same song set is deterministic

---

## Task 5 — My Planet home UI

Build:
- minimal brand
- one central planet
- 3 compact song cards
- + Moment affordance
- optional tiny Discover placeholder, not required

No persistent sidebars.

Definition of done:
- My Planet clearly reads as the product Home

---

## Task 6 — Song Sheet and matching

Click a song card:
- open bottom sheet/card
- title + artist
- copy: “今天还有 X 个人也在听它”
- CTA: “去撞歌”

Implement deterministic `matchBySong`.

Definition of done:
- song → match count → target user works for all Golden Path songs

---

## Task 7 — Warp

Reuse/adapt existing portal/cloud/camera transition.

Flow:
- start transition
- swap target planet data during hidden/high-opacity portion
- reveal target planet

Target duration: 1.0–1.8s.

Definition of done:
- no hard page reload
- transition feels intentional and stable

---

## Task 8 — Other Planet

Render same single-planet scene for another user.

Show:
- alias/name
- encounter reason
- 3 song cards
- one Moment

No edit controls.
No comments.
No follow/friend.

Definition of done:
- user can understand whose planet this is and why they arrived

---

## Task 9 — Moment

P0:
- My Planet: simple add Moment form or pre-seeded own Moment
- Other Planet: one clickable Moment
- card contains song, text, time, optional image

Definition of done:
- Moment is readable and visually integrated, not a feed page

---

## Task 10 — Continue roaming

On Other Planet:
- click a different song
- song sheet
- match
- Warp again

Definition of done:
- Golden Path reaches at least a third planet

---

## Task 11 — Mobile polish

Test:
- 390×844
- 430×932
- desktop 1440×900

Requirements:
- planet not hidden by UI
- song strip scrolls if needed
- bottom sheets fit viewport
- text readable
- no legacy desktop sidebars

---

## Task 12 — Submission readiness

Before declaring done:

```
npm run typecheck
npm test
npm run build
```

Deploy branch build.

Verify incognito:
- no login
- onboarding works
- 3 songs
- one planet
- song match
- Warp
- other planet
- Moment
- continue roaming

Capture:
- clean cover screenshot
- 90-second product recording path

Only after this is stable consider P1.
