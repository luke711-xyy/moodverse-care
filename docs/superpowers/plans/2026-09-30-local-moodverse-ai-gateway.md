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
- [x] Implement pure validation and service orchestration; Composer output is limited to the current enums, three hex colors, 120-character summary, and 0–1 particle density.
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
- [x] Run all Python tests with the preinstalled Python 3.11 runtime using `uv run --python 3.11 --no-project python -m unittest discover -s tests -v` in the service directory. Python 3.12 is not installed here; no interpreter, MLX packages, or model weights were downloaded.

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
- [x] Mark real Composer, Embed, and Rank smoke checks pending: the current Mac has no MLX runtime packages or downloaded model weights, so no model downloads or live inference requests were made.

## Completion Boundary

The gateway code and mocked contract tests do not prove the Cloudflare Tunnel, Pages secrets, sender-domain setup, or real model weights are operational. Do not deploy to the legacy public Moodverse domain; this music MVP uses an isolated staging environment. Live AI is complete only after real weights load on the Mac, Access and origin bearer both pass, and the three Pages calls return validated model metadata.
