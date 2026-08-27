# Story director + infinite canvas pipeline — 2026-08-27

## Path
New canvas → Story Director stills → first/last frame video. Frontend-only.

## Bugs on main (`bf41e903`)
1. `use-canvas-store.ts` 700ms fail-open set `hydrated=true` without unlocking persist. Empty library flash; new canvases raced localForage merge.
2. `story-director-page.tsx` used only the first `cast.url`, ignored quality, video had no `lastFrameUrl`.
3. `push-to-workspace.ts` dropped `shot.url` / `shot.videoUrl`; no image/video nodes.
4. `wiring.ts` had no Grok relay / Hansyai. Defaults still SuperXihe + ModelScope.

## Fixes
- Seed `preset-grok-relay` (`https://sub2.alibb123.ccwu.cc/v1`) text+image+video.
- Seed `preset-hansyai` (`https://hansyai.cn/v1`) multi text + GPT Image.
- Session persist `v11` so merge picks up new presets.
- `director-helpers.ts`: multi-ref cap 3, quality→size, next-shot last frame.
- Story page + push-to-workspace consume helpers.
- Store: no fail-open; 4s nudge rehydrate only.

## Frontend runbook
1. `/canvas` wait for load (no empty flash).
2. New canvas or `/story` paste script → 拆分镜 → character stills → shot stills.
3. Shot video uses current still as first frame, next still as last frame.
4. Push to canvas keeps portrait + still + video nodes and first_frame links.
5. `/settings` shows Grok 中转 + Hansyai already wired.
