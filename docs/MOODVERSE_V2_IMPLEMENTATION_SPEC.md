# Moodverse V2 — Initial Round Implementation Spec

Status: FROZEN for initial-round demo
Branch: `moodverse-v2`
Target: browser-deployed, mobile-first Golden Demo for the hackathon initial round

## 0. Non-negotiable product decision

**One user = one planet.**

Do not create:
- a personal galaxy containing 6/10 personal planets
- song satellites as separate 3D spheres
- a galaxy map as the default home screen
- a required friends galaxy
- mood/weather/check-in/care-card as the main user flow

The default home screen is the user's single planet.

The current 3–5 songs **change the appearance of that one planet**. Songs are selectable through lightweight UI cards / labels, not separate 3D planets or satellites.

Core thesis:

> My planet is home. Songs are roads.

Primary Golden Path:

`Onboarding → My Planet → select song → Song Portal → Match → Warp → Other Planet → Moment → another song → Warp again`

Everything else is secondary.

---

## 1. Scope for initial round

Initial-round submission only needs:
1. A browser-accessible deployed demo
2. A ≤3 minute narrated/subtitled demo video
3. A 100–300 Chinese-character project description
4. One cover image

Therefore the implementation goal is **not** a complete social network. It is a polished, deterministic, stable Golden Demo.

### P0 must work
- first-time onboarding
- choose 3 songs
- generate one personal planet
- current songs visibly change that planet
- add/view one Moment
- click a song
- see “today X people also listened/used this song”
- trigger “撞歌”
- Warp animation
- arrive at another user's planet
- view one Moment on that planet
- click another song and continue roaming

### P1 only if P0 is stable
- Random Roam
- My Orbit
- Discover/Galaxy
- drift bottle / send a song
- share card

### Not in P0
- friends system
- followers
- DMs
- comments/replies
- public leaderboard
- full login/account system
- real playback-history integration
- full QQ Music API integration
- archive/season UI
- care card
- weather diary
- 6 personal planets
- life-theme settings
- complex privacy settings

---

## 2. UX architecture

### 2.1 First-time user
Screen A — Landing
- full-screen dark universe background
- one short sentence:
  - CN: “今天，有谁和你听了同一首歌？”
  - EN optional: “Every song is a portal to someone’s world.”
- CTA: “创建我的星球”

Screen B — Pick 3 songs
- show a curated demo catalog
- select exactly 3
- no account creation
- no theme / mood / life-mainline questions
- CTA: “生成我的星球”

Screen C — Generate transition
- 1–2 second visual transformation
- songs map deterministically to visual parameters
- then enter My Planet

### 2.2 Returning/demo user
Go directly to My Planet.

### 2.3 My Planet = Home
The screen shows exactly one dominant 3D planet.

No surrounding personal planets.
No personal galaxy.
No embryo slots.
No star with six orbit slots.

UI should be very light.

Recommended layout:
- top-left: Moodverse wordmark
- top-right: optional small “Discover” icon/button (P1)
- center: one large interactive planet
- bottom: compact current-song strip with 3 song cards
- lower corner: “+ Moment”
- optional tiny status copy: “3 songs shaping this planet”

The song cards are UI, not 3D satellites.

### 2.4 Clicking a song
Open a compact bottom sheet / floating card.

Show:
- title
- artist
- optional cover
- match copy, e.g. “今天还有 4 个人也在听它”
- primary CTA: “去撞歌”
- secondary: “关闭” / optional external playback link

Do not auto-warp immediately on click.

### 2.5 Warp
On “去撞歌”:
- close song sheet
- use the existing portal/cloud/camera capability
- duration approx 1.0–1.8 s
- show a short transitional cue such as:
  - “1,984 km away”
  - “same song, same day”
- no long loading state

### 2.6 Other Planet
Same single-planet visual grammar:
- one central planet
- 3 current-song cards
- one visible/clickable Moment marker or one elegant Moment card
- reason for encounter shown subtly:
  - “你们今天都听过 505”

Visitor actions in P0:
- open Moment
- click another song
- continue roaming

No reply box.
No friend button.
No follow button.
No DM.

### 2.7 Continue Roaming
Click another song on the visited planet:
- open song card
- show next available match
- CTA “沿着这首歌继续漫游”
- Warp to next seeded planet

---

## 3. One planet visual model

### 3.1 Principle
The 3 selected songs jointly shape the **same** planet.

Do not visualize each song as a separate 3D object.

### 3.2 Reuse existing procedural planet engine
Existing engine already exposes useful parameters:
- palette
- land ratio
- moisture
- vegetation density
- cloud coverage
- cloud speed
- rain
- lightning
- fog
- glow
- wind
- terrain seed / terrain feature config

For V2, replace the old product mapping:
`theme + mood + intensity → visual profile`

with:
`3 current songs → music feature vector → visual profile`

### 3.3 Demo music feature vector
For P0, do **not** build a real ML model.

Each demo song can have deterministic hand-authored feature values:

```ts
type SongFeatures = {
  energy: number
  warmth: number
  dreaminess: number
  melancholy: number
  brightness: number
  chaos: number
}
```

All values 0..1.

Aggregate the 3 selected songs by average, with optional role weighting:
- song 1 weight 0.5
- song 2 weight 0.3
- song 3 weight 0.2

Map to existing renderer:
- brightness → atmosphere/glow
- dreaminess → fog/cloud softness
- energy → cloud speed/wind
- melancholy → cloud/rain/ocean emphasis
- warmth → palette hue family
- chaos → terrain ruggedness/lightning/noise

The same 3 songs must always generate the same planet state.

This gives a stable “AI-like composer” demo without model latency/failure.

### 3.4 Optional AI copy
If desired, a tiny deterministic/LLM-generated one-line summary can appear:
“Your planet is drifting somewhere between nostalgia and escape.”

This is optional and must not block rendering.

---

## 4. Moment model

P0 Moment:
- one song
- one short text
- optional image
- timestamp

Do not use “mood”, “intensity”, “triggers”, “weather”, “care action” in the user-facing flow.

Recommended P0 data shape:

```ts
type Moment = {
  id: string
  userId: string
  planetId: string
  songId: string
  text: string
  imageUrl?: string
  createdAt: string
}
```

Presentation:
- on My Planet: one or more tiny light points / subtle markers
- on click: open elegant card
- on Other Planet: show one strong demo Moment

For initial round, static seeded moments are acceptable.

---

## 5. Song model

Current repo stores mainly a single `musicUrl`. V2 needs structured songs.

P0:

```ts
type Song = {
  id: string
  title: string
  artist: string
  sourceUrl?: string
  coverUrl?: string
  coverColor?: string
  features: SongFeatures
}
```

And:

```ts
type PlanetSong = {
  songId: string
  role: 'primary' | 'secondary'
  addedAt: string
}
```

P0 needs only 3 songs per planet in the UI. The long-term concept may support 3–5.

---

## 6. Matching / 撞歌 for the demo

Do not integrate real listening history for P0.

Demo definition of “today listened to this song”:
- the song is in today's current 3-song planet set, OR
- the song is attached to today's Moment

Use seeded demo users.

Matching priority:
1. same song today
2. if needed, same artist
3. deterministic fallback seeded user

For the Golden Demo, every clickable demo song must have at least one valid destination.

Recommended API/function contract:

```ts
matchBySong(songId, currentUserId): {
  count: number
  candidates: DemoUser[]
  selected: DemoUser
}
```

Make selection deterministic so the recorded demo never fails.

---

## 7. Demo seed data

Create a small stable demo universe.

Suggested:
- 12 demo songs
- 8 seeded users
- each seeded user has:
  - one current planet visual seed
  - 3 current songs
  - 1–2 Moments
- ensure overlapping songs create a chain of at least 3 planets

Golden chain example:

User / Demo Me:
- Song A
- Song B
- Song C

User 2:
- Song A
- Song D
- Song E

User 3:
- Song D
- Song F
- Song G

This guarantees:
`My Planet → Song A → User 2 → Song D → User 3`

Do not depend on real-time network data for this chain.

---

## 8. Code strategy for this repository

### 8.1 Keep
Keep and reuse:
- React / Vite / TypeScript
- React Three Fiber / Three.js
- Cloudflare Pages deployment
- D1 setup, but P0 may run mostly on seeded/static data
- starfield
- meteor field
- procedural planet terrain
- atmosphere
- clouds
- vegetation
- rain / fog / lightning visual implementations
- camera focus utilities
- portal/cloud transition utilities
- LOD/performance utilities
- WebGL fallback concept
- reduced-motion handling

### 8.2 Retire from V2 P0 UI
Do not expose:
- `home-galaxy`
- six personal planet slots
- embryo slots
- “自己的星系”
- life-mainline theme chooser
- focused themes
- “今天的天气”
- mood/intensity/trigger form
- care cards
- billboard UI
- anonymous reply UI
- archive management
- current old settings drawer
- scroll-through-six-galaxies journey before reaching self

Legacy code can remain in repository if removing it risks regressions. It simply must not be on the V2 path.

### 8.3 Safest implementation approach
Avoid refactoring the entire 80k App and 100k Scene in one pass.

Preferred:
- create a new `src/v2/` feature layer
- switch `main.tsx` to the V2 app on this branch
- import/reuse existing rendering utilities where practical
- extract only the minimum reusable planet renderer/camera pieces from `scene.tsx`
- leave legacy App available but unused during P0

Suggested V2 files:

```
src/v2/
  V2App.tsx
  v2.css
  demo-data.ts
  model.ts
  music-visual.ts
  match.ts
  MyPlanetScreen.tsx
  OtherPlanetScreen.tsx
  SongSheet.tsx
  MomentCard.tsx
  WarpOverlay.tsx
  SinglePlanetScene.tsx
```

If extraction from legacy `scene.tsx` is too risky, add a minimal V2-specific exported single-planet scene component in `scene.tsx` while keeping legacy components untouched.

### 8.4 Database strategy
Do not delete old tables/triggers before the initial round.

For P0:
- use seeded/static song and visitor data where possible
- use localStorage for first-time selected songs if necessary
- optionally reuse one existing `user_planets` row as the current planet
- do not rely on multi-planet semantics

After the initial round, schema can be cleaned properly.

---

## 9. Required screen states

### State 1 — landing
- minimal copy
- CTA create planet

### State 2 — choose songs
- 12-song grid/list
- selected counter 0/3
- CTA disabled until 3 selected

### State 3 — my planet
- one planet only
- 3 song cards
- Moment affordance
- click song

### State 4 — song sheet
- song info
- match count
- “去撞歌”

### State 5 — warp
- 1–1.8 seconds
- no user interaction needed

### State 6 — other planet
- one planet only
- reason for encounter
- one Moment
- 3 songs
- continue via another song

No galaxy screen is required for P0.

---

## 10. Visual direction

Do not preserve the legacy dashboard/HUD visual language.

Target:
- mobile-first
- near-black / deep navy background
- the planet occupies the visual center
- very little chrome
- no left explanatory wall of text
- no persistent right sidebar
- no “engineering dashboard” cards
- typography: modern cultural/editorial, readable
- subtle glass / thin line / restrained glow
- use 1–2 accent hues derived from the planet/music
- generous negative space
- transitions should feel cinematic but short

The planet is the hero.

---

## 11. Acceptance criteria

The P0 is done only if all are true:

1. Fresh browser can start the demo without registration.
2. User can select 3 songs.
3. One and only one personal 3D planet appears.
4. Changing the selected song set creates visibly different planet appearance.
5. Three current songs are accessible as UI controls, not 3D satellite spheres.
6. Clicking a song opens a song sheet.
7. Song sheet shows a non-zero match count.
8. “去撞歌” triggers a visible Warp transition.
9. After Warp, a different single planet appears.
10. The visited planet has at least one readable Moment.
11. User can click another song and Warp again.
12. No P0 flow requires friends, followers, messages, life themes, mood/weather check-in, care cards, or galaxy selection.
13. Mobile viewport works cleanly.
14. The full Golden Path can be recorded in under 90 seconds without failures.
15. Build passes and deployed URL works in a clean/incognito browser.

---

## 12. Initial-round demo script target

The product must support this exact recording:

0:00 — landing
0:05 — select 3 songs
0:15 — generate personal planet
0:25 — show that songs shaped the planet
0:35 — click one song
0:40 — “今天还有 4 个人也在听它”
0:45 — 撞歌
0:48 — Warp
0:52 — arrive at other planet
1:00 — open Moment
1:12 — click another song
1:17 — Warp again
1:22 — third planet appears
1:30 — end product recording

The remaining video time can explain:
- user problem
- product idea
- AI/visual composer
- serendipity engine
- future Discover/My Orbit

---

## 13. Do-not-drift checklist

Before implementing any new idea, ask:

- Does it strengthen the single-planet home?
- Does it make music more central?
- Does it improve the song → match → Warp → person loop?
- Does the initial-round demo need it?

If not, do not add it before P0 is complete.

Especially do not add separate 3D song satellites. The V2 concept is **one planet whose state is shaped by songs**.
