# Local Moodverse AI Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Moodverse's real planet composition, exact-song portal ranking, and semantic embeddings on the user's Apple-Silicon Mac through one authenticated local model gateway.

**Architecture:** Cloudflare Pages remains responsible for login, candidate filtering, privacy, task state, and result validation. Pages calls a Cloudflare Access-protected Tunnel endpoint and also supplies a dedicated gateway bearer secret; the service binds only to loopback and loads MLX models lazily. The local service implements the existing three JSON contracts, with Qwen3.5 4B 4-bit for constrained planet visual output and Qwen3 Embedding 0.6B 8-bit for semantic ranking/embedding.

**Tech Stack:** Python 3.11+, `uv`, MLX (`mlx-vlm`, `mlx-embeddings`), Python standard-library HTTP server and `unittest`; existing TypeScript/Cloudflare Pages Functions/Vitest callers.

**Spec:** [Moodverse 音乐偶遇 MVP｜产品与工程改造说明书](https://zcngcaimq8jy.feishu.cn/docx/SKsOdC1BsovVkYxXRh3cK6vInVg), revision 45, sections 2.11 and 5. Local delivery setup is documented in `docs/music-email-auth-setup.md`; local inference only serves Moodverse and does not run Codex.

## Global Constraints

- Bind the model gateway to `127.0.0.1`; the browser never receives a model URL or credential.
- Require a gateway bearer secret at the origin as defense in depth behind Cloudflare Access.
- The service accepts only bounded, allow-listed payloads; never returns arbitrary model output.
- Keep exact-song candidate filtering, visibility, ownership, and private-Moment exclusion in D1/Pages.
- Model output must use the current Pages schemas; invalid output fails closed and the existing app fallback remains in force.
- Do not fabricate or seed catalog tracks; actual login sender DNS, Cloudflare secrets, Tunnel hostname, and Access policy are operator setup, not code defaults.

## Review Focus

- Prompt injection inside public Moments cannot expand the output schema or create facts/candidate IDs.
- Private Moments and private planets never enter public embedding or song-portal candidate payloads.
- Missing/wrong gateway bearer, oversized bodies, malformed JSON, and unsupported routes fail without inference.
- Empty, NaN, zero, wrong-dimension, or unknown-ID embeddings are rejected before Cloudflare ranking.
- Lazy model loading or inference errors produce bounded service errors; they must not expose file paths, prompts, credentials, or stack traces.

---

### Task 1: Typed service contracts and safe ranking/composition logic

**Files:**
- Create: `services/moodverse-ai/moodverse_ai/contracts.py`
- Create: `services/moodverse-ai/moodverse_ai/service.py`
- Create: `services/moodverse-ai/tests/test_service.py`

**Interfaces:** `MusicAIService(runtime).compose(payload)`, `.rank(payload)`, and `.embed(payload)` return the exact existing JSON response envelopes. `runtime.generate_json(prompt)` returns model text; `runtime.embed(texts)` returns `(model_name, model_version, vectors)`.

- [x] Write failing `unittest` cases for strict Composer schema output, candidate-ID-preserving embedding ranking and reason codes, embedding ID/dimension validation, request bounds, and prompt-injection text remaining data.
- [x] Run `python3 -m unittest discover -s services/moodverse-ai/tests -v` and confirm expected missing-module failures.
- [x] Implement pure validation and service orchestration; Composer request schema remains v1 and visual output schema is v2, with bounded palette/atmosphere/motion/particle values plus counts for only the four registered terrain components.
- [x] Run the focused service tests and require they pass.

### Task 2: Loopback HTTP server and gateway authentication

**Files:**
- Create: `services/moodverse-ai/moodverse_ai/http_server.py`
- Create: `services/moodverse-ai/tests/test_http_server.py`
- Modify: `services/moodverse-ai/moodverse_ai/service.py`

**Interfaces:** `GET /healthz`; `POST /v1/planet/compose`, `/v1/song-portal/rank`, and `/v1/embed`; protected POSTs require `Authorization: Bearer <MUSIC_AI_GATEWAY_TOKEN>`. The launcher refuses non-loopback bind addresses and limits request bodies to 256 KiB.

- [x] Write failing HTTP integration tests for all three routes, missing/wrong bearer, malformed/oversized bodies, unsupported paths, and generic failures without stack traces.
- [x] Run the focused HTTP tests and confirm expected failures.
- [x] Implement a bounded `ThreadingHTTPServer` adapter that serializes MLX inference through one service lock and exposes readiness without leaking credentials.
- [x] Run both Python test modules and require they pass.

### Task 3: Lazy MLX model adapters and runnable local package

**Files:**
- Create: `services/moodverse-ai/moodverse_ai/mlx_runtime.py`
- Create: `services/moodverse-ai/moodverse_ai/__main__.py`
- Create: `services/moodverse-ai/pyproject.toml`
- Create: `services/moodverse-ai/tests/test_mlx_runtime.py`

**Interfaces:** `MLXRuntime` lazily loads `mlx-community/Qwen3.5-4B-MLX-4bit` through `mlx-vlm` for JSON composition and `mlx-community/Qwen3-Embedding-0.6B-8bit` through `mlx-embeddings` for batch text vectors; model IDs and bind port are environment-overridable. Unit tests inject fake loaders so they run on non-MLX hosts.

- [x] Write failing tests for lazy one-time model loads, stable model/version metadata, tokenizer batch invocation, and backend-unavailable errors using injected fakes.
- [x] Run the focused runtime tests and confirm expected failures.
- [x] Implement the lazy runtime using the MLX APIs and fixed Moodverse instructions; text content is JSON-escaped as data and never treated as a system instruction.
- [x] Run all Python tests under Python 3.11 using `uv run python -m unittest discover -s tests -v` in the service directory (26 tests pass). `uv sync --python 3.11` installed the MLX runtime packages; the real embedding weights were downloaded and smoke-tested separately. Python 3.12 is not installed here.

### Task 4: Secure Pages-to-gateway caller integration

**Files:**
- Modify: `functions/_shared.ts`
- Modify: `functions/api/me/music-planet/compose.ts`
- Modify: `functions/api/music/song-portal.ts`
- Modify: `functions/api/music/discovery.ts`
- Modify: `functions/_music-drift-bottles.ts`
- Modify: `tests/music-planet-compose-api.test.ts`
- Modify: `tests/music-song-portal-api.test.ts`
- Modify: `tests/music-discovery-api.test.ts`
- Modify: `tests/music-drift-bottle-api.test.ts`
- Modify: `tests/music-planet-api.test.ts`
- Modify: `tests/music-moment-api.test.ts`

**Interfaces:** Pages requires `MUSIC_AI_GATEWAY_TOKEN` in addition to the existing Cloudflare Access service-token credentials and sends `Authorization: Bearer …` only server-to-server. Existing route contracts and D1 filters remain unchanged.

- [x] Add failing tests proving requests carry the origin bearer and reject/unset configuration consistently for Composer, ranking, discovery, and bottle embeddings.
- [x] Run the affected tests and confirm expected failures.
- [x] Add the secret to `Env`, each gateway call, and tests; adjust only timeout values that fail a measured local cold-start test, keeping graceful fallback on timeout.
- [x] Run affected TypeScript tests, the full suite, typecheck, and build.

### Task 5: Operator setup and model smoke verification

**Files:**
- Create: `docs/music-ai-gateway-setup.md`
- Modify: `docs/music-email-auth-setup.md` only if a shared operator boundary needs cross-linking.

- [x] Document `uv sync`, model cache locations, loopback startup, Cloudflare Tunnel origin, Access service-token setup, Pages variables/secrets, privacy boundaries, warm-up, sleep/offline fallback, and shutdown.
- [x] Run Python tests, full TypeScript tests, typecheck, build, and `git diff --check`.
- [x] Run the real Embed smoke test with two synthetic inputs over the loopback HTTP gateway: valid Bearer returned non-zero 1024-dimensional vectors with matching IDs and `Qwen3-Embedding-0.6B-8bit` metadata; missing Bearer returned `401 UNAUTHORIZED`.
- [x] Run real Composer and Rank smoke tests over the loopback HTTP gateway with synthetic data. Composer cold-start returned a validated visual in 29.57s; Rank cold-start returned a validated exact-candidate ranking in 30.81s, and a warm call in 7.94s. A prompt-quality rerun produced differentiated 0.95 / 0.72 / 0.38 scores without changing candidate IDs or server-owned reason codes.
- [ ] Configure staging Pages, Tunnel, Access Service Auth, and required secrets; verify the three model calls end to end. No Cloudflare resources were created during local verification.

### Post-plan follow-up: Calibrate exact-song ranking and timeout

- [x] Add a prompt-contract regression test and explicit contextual score bands. The model may rank only server-approved exact-song candidates; `matchSource` sets `reasonCode` but does not grant score bonuses or establish listening facts.
- [x] Add a measured-duration regression test for cold inference and raise the Song Portal request timeout from 8 seconds to 45 seconds, matching Composer and covering the observed ~31-second cold call. Cloudflare documents no hard wall-time cap for an incoming HTTP request while the client remains connected; the application-level 45-second abort remains the finite safeguard.
- [x] Re-run local whole-branch verification after the current changes: Python gateway 32 tests, TypeScript 43 files / 269 tests, typecheck, build, and `git diff --check` all pass.
- [ ] Perform Cloudflare staging end-to-end checks after the staging D1 ID, Pages bindings/secrets, Tunnel, Access Service Auth policy, and email sender credentials are configured. Current `music:staging:preflight` stops at the missing/placeholder D1 ID; no Cloudflare resources or secrets were changed.

### Post-plan follow-up: derive Song Portal reason codes server-side

- [x] Re-run the current real local Rank model after prompt changes; observe `AI_RESULT_INVALID` when the model assigns `shared_selection_and_moment` to an `active_selection` candidate.
- [x] Make the ranker return only candidate IDs and scores; derive `reasonCode` from the already-filtered `matchSource` in both the local gateway and Pages validation.
- [x] Align Pages with the gateway's verified `{ model, ranking }` response envelope.
- [x] Add regression coverage for deterministic server-derived reasons, rejection of model-supplied reason codes and invented candidates, and HTTP boundary serialization.
- [x] Re-run the real synthetic Rank request over loopback; verify correct reason codes and differentiated scores without adding/removing candidate IDs.

### Post-plan follow-up: tolerate singleton object-array model output

- [x] Reproduce a real local Qwen Rank response wrapped in a one-item JSON array; normalize only that exact wrapper before the existing strict schema/candidate validation.
- [x] Add regressions proving one-item object arrays are accepted while multi-item wrappers remain rejected; Python gateway suite now has 34 passing tests.
- [x] Re-run a real synthetic Rank request over the loopback HTTP gateway after normalization; HTTP 200 returned two validated candidates with server-derived reason codes in 22.20s.

### Task 6: Bounded reusable profile embeddings

**Files:**
- Modify: `services/moodverse-ai/moodverse_ai/service.py`
- Modify: `services/moodverse-ai/tests/test_service.py`
- Modify: `docs/music-ai-gateway-setup.md`

**Interfaces:** Keep the existing `/v1/embed` contract. Cache only validated candidate vectors whose server-generated IDs use `planet:<id>` or `user:<id>`; always embed query inputs freshly. Store only a SHA-256 content key and validated vector in a bounded process-local LRU with expiry; never retain source text or write vectors to disk. Cache entries include returned model metadata; if a fresh query embedding reports a different model/version, evict and recompute stale candidate vectors before returning a mixed batch.

- [x] Add regression tests proving repeated public candidate profiles reuse a vector while query text is always sent to inference, private/query text is not retained, invalid results are not cached, stale model metadata triggers recomputation, and the cache remains bounded.
- [x] Run the focused Python suite and confirm the cache behaviors fail before implementation.
- [x] Add the bounded, expiring in-memory cache and update the operator guide to clarify that cache lifetime is the gateway process lifetime and restart clears it.
- [x] Run Python tests, full TypeScript suite, typecheck, build, and `git diff --check`.

## Completion Boundary

The gateway code and mocked contract tests do not prove the Cloudflare Tunnel, Pages secrets, sender-domain setup, or real model weights are operational. Do not deploy to the legacy public Moodverse domain; this music MVP uses an isolated staging environment. Live AI is complete only after real weights load on the Mac, Access and origin bearer both pass, and the three Pages calls return validated model metadata.
