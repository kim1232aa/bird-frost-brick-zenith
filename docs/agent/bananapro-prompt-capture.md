# BananaPro prompt / API capture

Captured 2026-08-26 from live `www.bananapro.site` pages the owner pointed at:

- `/zh/ai/gpt-image-2`
- `/zh/ai/seedance`
- `/zh/ai/ecommerce-suite`

No session cookies or account tokens are stored in this repo.

## What was actually submitted

A real GPT Image 2 job was submitted against the logged-in session:

```http
POST /api/gptimage2/standard/submit
Content-Type: application/json

{
  "type": "text-to-image",
  "prompt": "a simple red apple on a white table, studio product photo",
  "aspect_ratio": "1:1",
  "quality": "low",
  "max_images": 1,
  "generation_mode": "standard"
}
```

Response:

```json
{
  "success": true,
  "task_id": "725773016571483841182970082869",
  "request_id": "7373f69359b54859a8880469cfbeaa48",
  "status": "processing"
}
```

Poll:

```http
POST /api/gptimage2/status
{"task_ids":["725773016571483841182970082869"]}
```

returned `status: processing`, `credits_used: 10`. The site bills server-side; `quality: "low"` did not map to the UI “经济 · 3 积分” tier.

The request body **is** the user prompt. BananaPro does not echo a rewritten system prompt back on `/status`. The product-grade wrapping lives in the **frontend composers** below (ecommerce suite) and in the community prompt library.

## GPT Image 2 API surface

| Path | Method | Role |
|---|---|---|
| `/api/gptimage2/{standard\|creative\|fal}/submit` | POST | create task |
| `/api/gptimage2/status` | POST `{task_ids:[]}` | poll |
| `/api/gptimage2/tiles` | GET | combo-grid tiles |
| `/api/prompt-library/gpt-image-2` | GET | community prompts |
| `/api/prompt-library/gpt-image-2/{slug}` | GET | one prompt body |
| `/api/upload` | POST | reference images |
| `/api/seedance/submit` | POST | Seedance video |
| `/api/seedance/status/{id}` | GET | Seedance poll |
| `/api/seedream/submit` | POST | Seedream image |
| `/api/gempix2/{standard\|classic\|creative}/submit` | POST | GemPix sibling |

Provider routing for GPT Image 2:

- UI provider `apimart` → `/api/gptimage2/creative/submit`
- UI provider `fal` → `/api/gptimage2/fal/submit`
- default → `/api/gptimage2/standard/submit`

Core GPT Image 2 body (from the live bundle):

```ts
{
  type: "text-to-image" | "image-to-image",
  prompt: string,
  image_urls?: string[],          // i2i only
  aspect_ratio: string,           // "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "2:3" | "3:2" | "21:9"
  quality: string,
  max_images: 1,
  generation_mode: "standard" | "wild" | "creative"
}
```

Combo-grid extra fields: `display_prompt`, `image_size`, `resolution`, `combo_grid_preset`.

Ecommerce extra fields: `generation_mode_contract: "product-v1"`, `batch_size`, `resolution`.

Seedance / Seedance-family body:

```ts
{
  prompt: string,
  mode: "text-to-video" | "image-to-video" | "edit-video",
  aspect_ratio: string,           // default "16:9"
  duration: number,
  sound?: boolean,                // or audio
  resolution?: "720p" | ...,
  input_image_url?: string,       // first frame / reference
  video_url?: string,             // edit-video
  provider?: string,
  nsfw_checker?: boolean
}
```

UI copy on GPT Image 2 (public page):

- modes: generate / edit (`图片编辑` selected by default on the landing snapshot)
- model chip: `GPT Image 2`
- prompt label: `描述你的想法` + `提示词模版` + “魔法笔” optimizer toggle
- upload: `点击上传图片，如需标注可再次点击`
- quality chips visible: `标准 5积分·1k`, `经济 3积分·1k`, `稳定 17积分·1k`
- example rail + `使用提示`
- Seedance 2 promo: 真人/狂野双模式, 狂野扩到 Seedream 5 + Seedance 1.5 Pro, 积分下降 20–45%

## Ecommerce suite — the actual wrapper prompt

This is the text BananaPro prepends to every marketplace shot. Port these into Boundless as named templates.

### Identity lock (`j(productBrief)`)

```text
The uploaded reference image(s) are the authoritative identity of ONE exact product/SKU. Extract the product itself from the references and ignore the source page layout, collage structure, dividers, backgrounds, props, neighboring products, captions, and graphic design.
IDENTITY LOCK: Preserve the same exact silhouette, geometry, proportions, materials, finish, colors, transparency, seams, closures, buttons, ports, logo placement, label layout, typography, packaging, and every visible distinguishing feature. Never redesign, simplify, recolor, mirror, stretch, add, remove, or relocate product features.
VISIBLE TEXT: Keep branding and legible product text faithful to the references. If small text cannot be reproduced reliably, preserve its placement and visual hierarchy without inventing new claims, measurements, certifications, or promotional copy.
UNSEEN SURFACES: Extend only the known construction conservatively. Do not invent prominent features, and keep every inferred detail physically plausible.
User product/category direction (apply only when it does not conflict with the reference identity): {productBrief}
```

### Platform directions (`y(platform)`)

- **amazon** — front hero must be edge-to-edge pure white `RGB(255,255,255)`, product only, no props/graphics, product ~85% of frame. Secondary shots may use clean neutral studio or restrained lifestyle.
- **tmall** — strong square mobile-first product visual, premium lighting, useful negative space. No promotional copy, prices, claims, badges, or invented specs.
- **temu** — bold compact square that reads at thumbnail size. Real product, visible function, material, scale, included components. No prices/discount/badges/claims.
- **tiktok-shop** — front hero complete product on pure white. Secondary shots social-native: use, handling, scale, texture, benefits in-scene. No creator likenesses, UI, captions, prices, badges, unverifiable claims.
- **shopee** — clean square mobile-first, strong recognition at thumbnail. Product dominant; depth, detail, scale, lifestyle, included components. No overlays/prices/badges/claims.
- **walmart** — front hero centered square on seamless white `RGB(255,255,255)`, professionally lit, tightly but safely cropped, no text/logos/watermarks/borders/unrelated props. Secondary: alternate views, true details, scale, or appropriate lifestyle.
- **ozon** — clean square marketplace image, immediate ID at thumbnail. Front hero complete, centered, light neutral background. Secondary: construction, function, detail, scale, lifestyle. No Russian copy, prices, discount graphics, badges, UI, specifications, unverifiable claims.
- **default / catalog** — faithful product documentation, clear camera geometry, premium commercial finish.

### Single-shot composer (`N(...)`)

```text
Create ONE standalone, full-resolution e-commerce product image for shot {i} of {n}.
{identity lock}
{platform direction}
SINGLE-IMAGE COMPOSITION: Output exactly one continuous photograph filling the entire canvas. Never create a contact sheet, collage, split screen, comparison layout, inset, sidebar, border, gutter, frame, caption, label, number, watermark, or UI. Do not copy the composition or panel layout of the reference image; use only the product identity from it.
SET CONSISTENCY: This image belongs to one coordinated product shoot. Use neutral commercial color science, realistic materials, consistent product scale, premium lens quality, soft controlled shadows, and clean retouching so it matches the other independently generated shots.
ASSIGNED SHOT: {shotPrompt}
```

### Contact-sheet composer

Same identity lock + platform direction, then ask for one `rows x cols` sheet of equal standalone panels. Every panel is the same SKU. Change only camera / crop / lighting / scene. No merged panels, labels, numbers, captions, watermarks, or UI. Each panel must be independently croppable.

Combo-grid `display_prompt` prefix used on independent tiles:

```text
[Ecommerce Independent {i}/{n} | {templateId}]
Image {i}: {shotId}
```

## Prompt library samples (community, not system)

Fetched from `/api/prompt-library/gpt-image-2/{slug}`.

| id | title | prompt (trimmed) |
|---|---|---|
| 17300 | MS Paint Drawing | Redraw the attached image in the most clumsy, scribbly, and utterly pathetic way possible. Use a white background, and make it look like it was drawn in MS Paint with a mouse. … Actually, you know what, whatever, just draw it however you want. |
| 14798 | Train Photography Game | A game capture themed around train spotting |
| 18582 | White Paper Craft | Please convert this illustration into a highly precise and realistic white paper paper craft style. Express high detail with sharp, accurate cuts like laser-cut cardboard, fine folds, rich dimensionality from multiple layers, paper fiber texture, and natural shadows. … Faithfully maintain the composition and characters of the original illustration. |
| 17532 | Chibi Mini Versions | Edit the image while keeping the original photo completely unchanged — including the person, face, body, pose, lighting, and gym background. Add multiple small, cute chibi-style “mini versions” of her around the image. |
| 14347 | Albedo Cosplay IG Story | Style: An Instagram story-style photo of Albedo cosplay; Content: squatting on the ground facing the camera, making exaggerated rebellious gestures with both hands, rolling eyes, with an arrogant and disdainful expression |
| 15085 / 27366 | JP ad banners | Long structured JSON briefs (2×2 grid, typography, brand color, panel copy). Treat as layout-brief templates, not short natural-language prompts. |

## Studio port checklist

1. Add an **电商套图** prompt pack in the canvas assistant / image node: identity lock + platform chip + shot list + contact-sheet vs independent-tile toggle.
2. GPT Image 2 node fields: `type`, `aspect_ratio`, `quality`, `generation_mode`, reference `image_urls`.
3. Seedance node fields: `mode`, first/last frame upload, `duration`, `aspect_ratio`, `sound`/`audio`, `resolution`.
4. Optional: community prompt-library browser (cache slugs locally; do not hotlink BananaPro at runtime).
5. Prompt optimizer (“魔法笔”) is a client toggle labeled `gempix2.workspace.prompt_enhance`; the rewrite itself is not a separate public JSON prompt in the bundle. Reimplement with our own text model rather than calling BananaPro.

## Do not do

- Do not commit cookies, session tokens, or the owner’s email.
- Do not keep polling BananaPro as a production backend.
- Rotate any key that was previously hardcoded in `src/studio/wiring.ts`.
