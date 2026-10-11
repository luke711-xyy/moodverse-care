# Audio preload and retained-buffer switching

## Change

- Read a destination's public primary track while its visit confirmation is open. This is a GET only; it does not record a visit or choose incognito status.
- Warm that track silently during confirmation/flight. The confirmed visit response remains authoritative.
- Retain up to three actual HTMLAudioElements, including the pre-visit track, instead of replacing one element's source on every transition. Returning restores its time and original play/pause intent.
- Release cancelled speculative media and account-scoped buffers. Inactive media events cannot replace the active player's status.
- Skip speculative loads in hidden/offline/save-data/2G contexts. Playback explicitly requested by the user remains available.
- No service worker, persistent audio cache, backend change, database migration or new third-party source allowance.

## Verification

- Test-first regressions demonstrated missing silent preloading, buffer reuse and bounded retention before implementation.
- 25 player, 15 API and 4 flight tests passed together (44 total).
- Three relevant MusicApp scenarios passed across isolated runs: confirmation preloading without playback/visit POST, Escape without visit, and delayed visit with single POST and eventual arrival. The heavy delayed-visit scenario initially exceeded the old one-second wait; its fixture now explicitly models a visible page and allows a bounded ten-second wait for the animation. It passed in the final isolated run. An earlier combined run also timed out the new preload test; its isolated run passed. These are scoped results, not a full-suite claim.
- Native Chrome smoke used the real hook and real HTMLAudioElements with two local same-origin stream routes and muted audio. Both sources reached readyState 4 before switching; the destination remained paused until selected. Destination arrival reused element 1, return reused element 0 at 37 seconds, and the stream request count remained two after both transitions. Only the selected element played. The fixture and temporary server were closed afterward.
- Background Chrome deferred native media loading until the test tab was activated. This was not treated as an upstream failure or a latency benchmark.
- TypeScript, production build and whitespace checks passed.
- Production release `76febec4` was deployed with the music production configuration. The canonical site's HTML and all four generated JS/CSS assets returned HTTP 200 and matched the local build exactly; immutable asset caching was preserved.

First-time upstream resolution/download and browser autoplay policy still apply; this change does not promise instantaneous first playback. Retained media count is bounded, but byte-level buffering is controlled by the browser.
