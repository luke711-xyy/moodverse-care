# Cockpit radar and flight readouts — 2026-10-10

## Changes

- Keep native disabled controls and the travel-state input guards. During flight only, remove the disabled opacity reduction from the three device panels and the jump lever; unrelated disabled radio controls retain their existing appearance.
- Ready collision results take priority in the exploration mini-preview: `扫描结果` and `n 同歌信号`. The radar remains active for loading/ready results, including after returning to the cockpit, until the result is cleared. Zero matches still represent a completed scan. Reduced-motion settings retain the static alternative.
- Match the personal display's title, secondary line and gap: 14px / 10px / 4px at the checked desktop viewport, including the title weight. Retain the existing narrow-container sizing and layout.
- Replace the symmetric speed envelope and 12% data-hold speed with a smooth acceleration, cruise through the cloud, and braking only over the last 18% of arrival. A data hold stays at cruise; no actual physical velocity is claimed. Remove only the speed needle's second CSS transition; heading/compass easing and flight timing are unchanged.

## Verification

- Test-first failures reproduced the old 0.75-progress speed of about 62% and the retained `扫描待命` title after a successful collision. An initial app-test setup opened an empty collision channel rather than starting a search; it was corrected to use the real personal-song search action before confirming the meaningful failure.
- 22 focused checks passed in the final selected run: 16 shell checks, 4 flight checks and 2 app checks for zero/one result, persistence after closing the terminal, and explicit clearing. The 7 travel-state reducer checks also passed in the preceding scoped run: 29 distinct checks across runs. No full-suite run or independent review.
- Production build passed (TypeScript and Vite): `MusicApp-CW0gA1RL.js`, `MusicApp-DcaE_Tyx.css`, `index-DDm8bSLl.js`, and unchanged `index-Cfuk3BdK.css`. `git diff --check` passed.
- A temporary browser fixture used the real CockpitShell, actual CSS and speed function, with controlled travel progress. All three monitors remained disabled with opacity 1; clicking monitors, channel keys and classification opened nothing. The idle-but-retained scan radar rotated, while reduced motion stopped its animation. Personal/radar typography matched at 14px / 10px / 4px. Speed samples at progress .1/.25/.5/.75/.9/1 were .232/.877/1/1/.583/0, and the needle transition was 0s. This checks rendering and state inputs, not a full network-backed flight. Temporary fixture setup initially used stale Vite dependency hashes; the successfully mounted fixture had no render errors.
- Temporary browser tab and local preview server were closed after the smoke check. No production visit records or database data were written.

## Publication

- Published release `139427d9` to the existing official `moodverse-care` Pages project, using the music-production configuration copied as `wrangler.toml` inside a temporary release directory.
- Canonical HTML and all four JS/CSS assets returned 200 and matched the local build byte-for-byte. An initial check during propagation received the prior fallback HTML at the new entry-bundle URL; the repeated check passed for every asset, and direct canonical/release entry requests returned JavaScript. HTML revalidates and hashed assets retain immutable caching.
- A fresh production tab loaded the new application/CSS bundles, displayed the idle preview with `data-scanning=false`, matched both monitor titles at 14px, and confirmed the speed needle's 0s transition. This was a read-only production check; scan/flight interactions were checked in the controlled fixture and tests above. The independent production tab was closed.
