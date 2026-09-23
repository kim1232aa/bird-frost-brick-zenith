import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const aliasLoader = `
const SRC = new URL("file://" + process.cwd() + "/src/").href;
const SUFFIXES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) target = SRC + specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) target = new URL(specifier, context.parentURL).href;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    if (!target.startsWith("file:")) throw error;
    for (const suffix of SUFFIXES) {
      try {
        return await nextResolve(target + suffix, context);
      } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

const { falAdapter, planFalImageRequest } = await import("./fal.ts");
const {
  agnesVideoPollPath,
  buildAgnesImageBody,
  buildAgnesVideoBody,
  planAgnesVideoPoll,
  readAgnesVideoCreateId,
  readAgnesVideoPoll,
} = await import("./agnes.ts");
const { planSenseNovaImageRequest } = await import("./sensenova.ts");
const { allImageUrls } = await import("../generate/proxy.ts");
const { buildCustomerVideoStudioRequest, videoPollPath } = await import("./contracts.ts");
const { buildRelayTarget } = await import("../../lib/boundless-proxy.server.ts");

test("Fal maps configured short names to official fal-ai endpoint ids", () => {
  assert.equal(planFalImageRequest({ model: "flux-2-pro", prompt: "p" }).path, "/fal-ai/flux-2-pro");
  assert.equal(planFalImageRequest({ model: "flux-2-flex", prompt: "p" }).path, "/fal-ai/flux-2-flex");
  assert.equal(planFalImageRequest({ model: "flux-2-flash", prompt: "p" }).path, "/fal-ai/flux-2/flash");
  assert.equal(planFalImageRequest({ model: "flux-dev", prompt: "p" }).path, "/fal-ai/flux/dev");
  assert.equal(planFalImageRequest({ model: "flux-schnell", prompt: "p" }).path, "/fal-ai/flux/schnell");
  assert.equal(planFalImageRequest({ model: "nano-banana", prompt: "p" }).path, "/fal-ai/nano-banana");
  assert.equal(planFalImageRequest({ model: "nano-banana-pro", prompt: "p" }).path, "/fal-ai/nano-banana-pro");
  assert.equal(
    planFalImageRequest({ model: "seedream-4.5", prompt: "p" }).path,
    "/fal-ai/bytedance/seedream/v4.5/text-to-image",
  );
});

test("Fal never POSTs a bare short name such as flux-2-pro", () => {
  const planned = planFalImageRequest({ model: "flux-2-pro", prompt: "p" });
  assert.equal(planned.path.startsWith("/fal-ai/"), true);
  assert.equal(planned.path, "/fal-ai/flux-2-pro");
  assert.equal(planned.authScheme, "Key");
});

test("Fal keeps already-qualified endpoint ids", () => {
  assert.equal(planFalImageRequest({ model: "fal-ai/flux-2-pro", prompt: "p" }).path, "/fal-ai/flux-2-pro");
  assert.equal(
    planFalImageRequest({ model: "fal-ai/flux/dev/image-to-image", prompt: "p", imageUrl: "https://example.test/a.png" }).path,
    "/fal-ai/flux/dev/image-to-image",
  );
});

test("Fal LoRA endpoints accept direct weight URLs and serialize the official list shape", () => {
  const planned = planFalImageRequest({
    model: "fal-ai/flux-lora",
    prompt: "p",
    loras: {
      "https://example.test/style.safetensors": 0.75,
      "hf://adapter/style": 1,
    },
  });
  assert.equal(planned.path, "/fal-ai/flux-lora");
  assert.deepEqual(planned.body.loras, [
    { path: "https://example.test/style.safetensors", scale: 0.75 },
    { path: "hf://adapter/style", scale: 1 },
  ]);
});

test("Fal LoRA endpoints reject references because the official LoRA contracts are text-to-image only", () => {
  for (const model of ["flux-lora", "flux-2-lora"] as const) {
    assert.throws(
      () => planFalImageRequest({ model, prompt: "p", imageUrl: "https://example.test/reference.png" }),
      /文生图|image_url|edit/,
      model,
    );
  }
});

test("Fal refuses image_url on a pure text-to-image endpoint", () => {
  // flux-schnell 上游没有 edit/i2i 端点（其余 flux-2/nano-banana/seedream 的 edit
  // 端点 2026-09-14 经 relay 空 body 实测返回 422 = 存在），带参考图必须拒绝而不是静默丢图。
  assert.throws(
    () => planFalImageRequest({ model: "flux-schnell", prompt: "p", imageUrl: "https://example.test/a.png" }),
    /文生图|image_url|edit/,
  );
  const t2i = planFalImageRequest({ model: "flux-dev", prompt: "p" });
  assert.equal("image_url" in t2i.body, false);
  assert.equal("image_urls" in t2i.body, false);
});

test("Fal routes references to the verified per-model edit endpoints", () => {
  for (const [model, path] of [
    ["flux-2-pro", "/fal-ai/flux-2-pro/edit"],
    ["flux-2-flex", "/fal-ai/flux-2-flex/edit"],
    ["flux-2-flash", "/fal-ai/flux-2/flash/edit"],
    ["nano-banana", "/fal-ai/nano-banana/edit"],
    ["nano-banana-pro", "/fal-ai/nano-banana-pro/edit"],
    ["seedream-4.5", "/fal-ai/bytedance/seedream/v4.5/edit"],
  ] as const) {
    const planned = planFalImageRequest({ model, prompt: "p", imageUrl: "https://example.test/a.png" });
    assert.equal(planned.path, path, model);
    assert.deepEqual(planned.body.image_urls, ["https://example.test/a.png"], model);
  }
});

test("Fal flux/dev image-to-image sends a single official image_url", () => {
  const planned = planFalImageRequest({
    model: "flux-dev",
    prompt: "p",
    imageUrl: "https://example.test/a.png",
    strength: 0.8,
  });
  assert.equal(planned.path, "/fal-ai/flux/dev/image-to-image");
  assert.equal(planned.body.image_url, "https://example.test/a.png");
  assert.equal("image_urls" in planned.body, false);
  assert.equal(planned.body.strength, 0.8);
  assert.equal(planned.authScheme, "Key");
});

test("Fal flux/dev image-to-image rejects extra references instead of dropping them", () => {
  assert.throws(
    () =>
      planFalImageRequest({
        model: "flux-dev",
        prompt: "p",
        imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
      }),
    /一张|image_url|参考图/,
  );
});

test("Fal edit endpoints send documented image_urls and not image_url", () => {
  const planned = planFalImageRequest({
    model: "fal-ai/flux-2-pro/edit",
    prompt: "p",
    imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
  });
  assert.equal(planned.path, "/fal-ai/flux-2-pro/edit");
  assert.deepEqual(planned.body.image_urls, ["https://example.test/a.png", "https://example.test/b.png"]);
  assert.equal("image_url" in planned.body, false);
});

test("Fal rejects an unmapped short name instead of posting it bare", () => {
  assert.throws(() => planFalImageRequest({ model: "not-a-fal-endpoint", prompt: "p" }), /未映射|官方 endpoint|fal-ai/);
});

test("Fal unregistered qualified endpoints warn and pass known fields without guessing steps", () => {
  const planned = planFalImageRequest({
    model: "fal-ai/some-new-model",
    prompt: "p",
    seed: 3,
    steps: 20,
    guidance: 4,
  });
  assert.equal(planned.path, "/fal-ai/some-new-model");
  assert.equal(planned.body.prompt, "p");
  assert.equal(planned.body.seed, 3);
  assert.equal("num_inference_steps" in planned.body, false);
  assert.equal("guidance_scale" in planned.body, false);
});

test("Fal profiled endpoints send steps and guidance only when the profile marks them", () => {
  const dev = planFalImageRequest({ model: "flux-dev", prompt: "p", steps: 28, guidance: 3.5 });
  assert.equal(dev.body.num_inference_steps, 28);
  assert.equal(dev.body.guidance_scale, 3.5);
  const flux2 = planFalImageRequest({ model: "flux-2-pro", prompt: "p", steps: 28, guidance: 3.5 });
  assert.equal("num_inference_steps" in flux2.body, false);
  assert.equal("guidance_scale" in flux2.body, false);
});

test("Fal adapter wires video create/poll through the queue API", () => {
  assert.equal(typeof falAdapter.createVideo, "function");
  assert.equal(typeof falAdapter.pollVideo, "function");
});

test("Agnes image requires a documented size and defaults to 1K", () => {
  const body = buildAgnesImageBody({ model: "agnes-image-2.1-flash", prompt: "p" });
  assert.equal(body.size, "1K");
  assert.equal(buildAgnesImageBody({ model: "agnes-image-2.1-flash", prompt: "p", size: "2K" }).size, "2K");
});

test("Agnes image forwards n and ratio but not undocumented seed, negative_prompt, or steps", () => {
  const body = buildAgnesImageBody({
    model: "agnes-image-2.1-flash",
    prompt: "p",
    size: "2K",
    n: 2,
    seed: 7,
    negativePrompt: "blur",
    steps: 20,
    aspectRatio: "16:9",
  });
  assert.equal(body.n, 2);
  assert.equal("seed" in body, false);
  assert.equal("negative_prompt" in body, false);
  assert.equal("num_inference_steps" in body, false);
  assert.equal(body.ratio, "16:9");
});

test("Agnes image references use extra_body.image array only", () => {
  const single = buildAgnesImageBody({
    model: "agnes-image-2.1-flash",
    prompt: "p",
    size: "1K",
    imageUrl: "https://example.test/a.png",
  });
  assert.deepEqual((single.extra_body as { image: string[] }).image, ["https://example.test/a.png"]);
  assert.equal("image" in single, false);
  assert.equal("images" in single, false);

  const many = buildAgnesImageBody({
    model: "agnes-image-2.1-flash",
    prompt: "p",
    size: "1K",
    imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
  });
  assert.deepEqual((many.extra_body as { image: string[] }).image, [
    "https://example.test/a.png",
    "https://example.test/b.png",
  ]);
  assert.equal("image" in many, false);
  assert.equal("images" in many, false);
});

test("Agnes video V2.0 maps duration to documented num_frames/frame_rate and omits unverified fields", () => {
  const body = buildAgnesVideoBody({
    model: "agnes-video-v2.0",
    prompt: "p",
    imageUrl: "https://example.test/first.png",
    duration: 5,
    aspectRatio: "16:9",
    resolution: "720p",
    fps: 24,
    generateAudio: true,
    negativePrompt: "watermark",
    imageUrls: ["https://example.test/extra.png"],
    lastFrameUrl: "https://example.test/last.png",
    width: 1152,
    height: 768,
    seed: 42,
  });
  assert.equal(body.num_frames, 121);
  assert.equal(body.frame_rate, 24);
  assert.equal(body.width, 1152);
  assert.equal(body.height, 768);
  assert.equal(body.seed, 42);
  assert.equal("fps" in body, false);
  assert.equal("duration" in body, false);
  assert.equal("generate_audio" in body, false);
  assert.equal("aspect_ratio" in body, false);
  // resolution is a documented Agnes tier and is accepted by the live API
  // (probed 2026-09-23), so it is forwarded rather than dropped.
  assert.equal(body.resolution, "720p");
  assert.equal("image_urls" in body, false);
  assert.equal("last_frame" in body, false);
  assert.equal(body.negative_prompt, "watermark");
  assert.deepEqual((body.extra_body as { image: string[]; mode: string }).image, [
    "https://example.test/first.png",
    "https://example.test/last.png",
    "https://example.test/extra.png",
  ]);
  assert.equal((body.extra_body as { mode: string }).mode, "keyframes");
});

test("Agnes video V2.0 uses the documented 10-second 241-frame recommendation", () => {
  const body = buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", duration: 10 });
  assert.equal(body.num_frames, 241);
  assert.equal(body.frame_rate, 24);
});

test("Agnes video V2.0 sends an explicit frames value as official num_frames", () => {
  const body = buildAgnesVideoBody({
    model: "agnes-video-v2.0",
    prompt: "p",
    duration: 5,
    fps: 24,
    frames: 81,
  });
  assert.equal(body.num_frames, 81);
  assert.equal(body.frame_rate, 24);
  assert.equal("duration" in body, false);
  assert.throws(
    () => buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", frames: 80 }),
    /8n\+1|num_frames/,
  );
  const withQuantity = buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", quantity: 2 });
  assert.equal("quantity" in withQuantity, false);
  assert.equal("n" in withQuantity, false);
});

test("Agnes video V2.0 maps an explicit fps while preserving the 8n+1 frame rule", () => {
  const body = buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", duration: 5, fps: 30 });
  assert.equal(body.frame_rate, 30);
  assert.equal(body.num_frames, 153);
  assert.equal((Number(body.num_frames) - 1) % 8, 0);
  assert.ok(Number(body.num_frames) <= 441);
});

test("Agnes video accepts both documented modes and rejects an undocumented one", () => {
  // Official mode values are ti2vid and keyframes. Probed live 2026-09-23:
  // mode=ti2vid returned 200, so ti2vid must not be rejected.
  const t2v = buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", mode: "ti2vid", frames: 81, fps: 24 });
  assert.equal(t2v.num_frames, 81);
  const keyframes = buildAgnesVideoBody({
    model: "agnes-video-v2.0",
    prompt: "p",
    imageUrl: "https://x.test/a.png",
    lastFrameUrl: "https://x.test/b.png",
  });
  assert.deepEqual(keyframes.extra_body, {
    image: ["https://x.test/a.png", "https://x.test/b.png"],
    mode: "keyframes",
  });
  assert.throws(
    () => buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", mode: "not-a-mode" }),
    /ti2vid|keyframes/,
  );
});

test("Agnes video sends the documented resolution tiers and rejects others", () => {
  // Probed live 2026-09-23: resolution=720p returned 200.
  for (const tier of ["480p", "720p", "1080p"]) {
    assert.equal(buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", resolution: tier }).resolution, tier);
  }
  assert.throws(
    () => buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", resolution: "4k" }),
    /480p|720p|1080p/,
  );
});

test("Agnes resolution flows from the video settings panel into the request body", async () => {
  const { resolveVideoModelCapability } = await import("../../services/api/video-model-capabilities.ts");
  const { videoGenerationSettingsToRequest } = await import("../../stores/video-generation-settings.ts");
  const capability = resolveVideoModelCapability({
    model: "agnes-video-v2.0",
    provider: { id: "preset-agnes-ai", baseUrl: "https://apihub.agnes-ai.com/v1", adapterType: "agnes" },
  });
  const request = videoGenerationSettingsToRequest(
    { resolution: "720p", aspectRatio: undefined, duration: undefined } as never,
    capability,
  );
  assert.equal(request.resolution, "720p");
  const body = buildAgnesVideoBody({
    model: "agnes-video-v2.0",
    prompt: "p",
    resolution: String(request.resolution),
  });
  assert.equal(body.resolution, "720p");
});

test("Agnes video rejects invalid duration or fps instead of silently dropping them", () => {
  assert.throws(
    () => buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", duration: 0 }),
    /duration|时长|正数/,
  );
  assert.throws(
    () => buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", duration: 5, fps: 0 }),
    /fps|frame_rate|1.*60/,
  );
  assert.throws(
    () => buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", duration: 20 }),
    /441|时长|duration/,
  );
});

test("Agnes video 2.5 is rejected until its separate mode contract is wired", () => {
  assert.throws(
    () => buildAgnesVideoBody({ model: "agnes-video-2.5", prompt: "p", duration: 5 }),
    /不支持|未接线|2\.5/,
  );
});

test("Agnes i2v without extra frames uses documented image string", () => {
  const body = buildAgnesVideoBody({
    model: "agnes-video-v2.0",
    prompt: "p",
    imageUrl: "https://example.test/first.png",
  });
  assert.equal(body.image, "https://example.test/first.png");
  assert.equal("extra_body" in body, false);
});

test("Agnes video create prefers returned video_id", () => {
  assert.equal(readAgnesVideoCreateId({ task_id: "task-1", video_id: "video-9", id: "id-3" }), "video-9");
  assert.equal(readAgnesVideoCreateId({ task_id: "task-1", id: "id-3" }), "task-1");
});

test("Agnes video poll uses /agnesapi?video_id= and the top-level result url", () => {
  assert.equal(agnesVideoPollPath("vid 1"), "/agnesapi?video_id=vid%201");
  const planned = planAgnesVideoPoll("vid-1", "https://apihub.agnes-ai.com/v1");
  assert.equal(planned.path, "/agnesapi?video_id=vid-1");
  assert.equal(planned.method, "GET");
  assert.equal("baseUrl" in planned, false);
  // Verified 2026-09-23 against a real completed task: `url` is top-level and
  // `metadata` is null, so the top-level field is authoritative.
  const realCompleted = readAgnesVideoPoll({
    status: "completed",
    progress: 100,
    metadata: null,
    url: "https://platform-outputs.agnes-ai.space/videos/agnes-video-v2.0/video_5c12fbfb802e4a479438b5a79f469ba9.mp4",
  });
  assert.deepEqual(realCompleted, {
    status: "completed",
    url: "https://platform-outputs.agnes-ai.space/videos/agnes-video-v2.0/video_5c12fbfb802e4a479438b5a79f469ba9.mp4",
  });
  // A legacy payload that only carries metadata.url still resolves.
  assert.deepEqual(
    readAgnesVideoPoll({ status: "completed", metadata: { url: "https://example.test/legacy.mp4" } }),
    { status: "completed", url: "https://example.test/legacy.mp4" },
  );
  assert.equal(readAgnesVideoPoll({ status: "queued" }).status, "pending");
  assert.equal(readAgnesVideoPoll({ status: "in_progress" }).status, "pending");
  assert.equal(readAgnesVideoPoll({ status: "failed", error: { message: "nope" } }).status, "failed");
  assert.equal(readAgnesVideoPoll({ status: "completed" }).status, "failed");
});

test("SenseNova url-output returns b64_json and resolves to a data URI", () => {
  // Probed live 2026-09-23: POST /v1/images/generations for sensenova-u1-fast
  // returns { created, data:[{ b64_json }], output_format, size, usage } with no
  // data[].url, so the b64 branch is the one that actually runs.
  const urls = allImageUrls({
    created: 1790163101,
    data: [{ b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" }],
    output_format: "png",
    size: "2048x2048",
  });
  assert.equal(urls.length, 1);
  assert.ok(urls[0].startsWith("data:image/png;base64,"));
});

test("SenseNova generations omit undocumented seed, negative_prompt, and steps", () => {
  const planned = planSenseNovaImageRequest({
    model: "sensenova-u1-fast",
    prompt: "p",
    seed: 11,
    negativePrompt: "blur",
    steps: 30,
    cfgScale: 7,
    n: 2,
  });
  assert.equal(planned.path, "/images/generations");
  assert.equal("seed" in planned.body, false);
  assert.equal("negative_prompt" in planned.body, false);
  assert.equal("steps" in planned.body, false);
  assert.equal("cfg_scale" in planned.body, false);
  assert.equal("image" in planned.body, false);
  assert.equal("images" in planned.body, false);
  assert.equal(planned.body.n, 2);
  assert.equal(planned.body.size, "2048x2048");
});

test("SenseNova U1.5 edits send images[].image_url and force n=1", () => {
  const planned = planSenseNovaImageRequest({
    model: "sensenova-u1.5-lite",
    prompt: "p",
    imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
  });
  assert.equal(planned.path, "/images/edits");
  assert.deepEqual(planned.body.images, [{ image_url: "https://example.test/a.png" }, { image_url: "https://example.test/b.png" }]);
  assert.equal(planned.body.n, 1);
  assert.equal("image" in planned.body, false);
});

test("SenseNova rejects references on U1 Fast and n>1 on U1.5", () => {
  assert.throws(
    () =>
      planSenseNovaImageRequest({
        model: "sensenova-u1-fast",
        prompt: "p",
        imageUrl: "https://example.test/a.png",
      }),
    /U1 Fast|不支持图像|参考图/,
  );
  assert.throws(
    () =>
      planSenseNovaImageRequest({
        model: "sensenova-u1.5-lite",
        prompt: "p",
        n: 2,
      }),
    /n=1|仅允许/,
  );
});

test("Agnes last frame without first frame throws instead of keyframes impersonation", () => {
  assert.throws(
    () =>
      buildAgnesVideoBody({
        model: "agnes-video-v2.0",
        prompt: "p",
        lastFrameUrl: "https://example.test/last.png",
      }),
    /缺少首帧|单独尾帧/,
  );
  assert.throws(
    () =>
      buildCustomerVideoStudioRequest({
        adapterType: "agnes",
        model: "agnes-video-v2.0",
        baseUrl: "https://apihub.agnes-ai.com/v1",
        prompt: "p",
        last_frame: "https://example.test/last.png",
      }),
    /缺少首帧|单独尾帧/,
  );
});

test("Canvas customer Agnes wire uses buildAgnesVideoBody and omits duration/last_frame", () => {
  const request = buildCustomerVideoStudioRequest({
    adapterType: "agnes",
    model: "agnes-video-v2.0",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    prompt: "p",
    duration: 5,
    ratio: "16:9",
    first_frame: "https://example.test/first.png",
    last_frame: "https://example.test/last.png",
    fps: 24,
    generateAudio: true,
    negative_prompt: "watermark",
  });
  assert.equal(request.adapter, "agnes");
  assert.equal(request.path, "/videos");
  assert.equal("duration" in request.body, false);
  assert.equal("last_frame" in request.body, false);
  assert.equal("last_frame_image" in request.body, false);
  assert.equal("image_urls" in request.body, false);
  assert.equal(request.body.frame_rate, 24);
  assert.equal(request.body.negative_prompt, "watermark");
  assert.deepEqual((request.body.extra_body as { image: string[]; mode: string }).image, [
    "https://example.test/first.png",
    "https://example.test/last.png",
  ]);
  assert.equal((request.body.extra_body as { mode: string }).mode, "keyframes");
});

test("Canvas customer Fal video is refused instead of openai-compat /videos", () => {
  assert.throws(
    () =>
      buildCustomerVideoStudioRequest({
        adapterType: "fal",
        model: "kling-v3",
        baseUrl: "https://fal.run",
        prompt: "p",
        duration: 5,
      }),
    /Studio 已支持生图|视频未接线|未实现|未映射到官方队列端点/,
  );
});

test("videoPollPath(agnes) matches adapter /agnesapi?video_id=", () => {
  assert.equal(videoPollPath("agnes", "vid-1"), "/agnesapi?video_id=vid-1");
  assert.equal(videoPollPath("agnes", "vid 1"), agnesVideoPollPath("vid 1"));
  assert.equal(videoPollPath("agnes", "vid-1", { videosPoll: "/videos/{id}" }, { baseUrl: "https://apihub.agnes-ai.com/v1" }), "/agnesapi?video_id=vid-1");
  assert.equal(planAgnesVideoPoll("vid-1", "https://apihub.agnes-ai.com/v1").path, "/agnesapi?video_id=vid-1");
});

test("buildRelayTarget pins Agnes official host agnesapi to origin root", () => {
  const official = buildRelayTarget("https://apihub.agnes-ai.com/v1", "agnesapi", "?video_id=vid-1");
  assert.equal(official.origin, "https://apihub.agnes-ai.com");
  assert.equal(official.pathname, "/agnesapi");
  assert.equal(official.search, "?video_id=vid-1");
  assert.equal(official.toString(), "https://apihub.agnes-ai.com/agnesapi?video_id=vid-1");

  const queryInPath = buildRelayTarget("https://apihub.agnes-ai.com/v1", "agnesapi?video_id=vid-1", "");
  assert.equal(queryInPath.pathname, "/agnesapi");
  assert.match(queryInPath.search, /video_id=vid-1/);

  const otherHost = buildRelayTarget("https://relay.example.test/v1", "agnesapi", "?video_id=vid-1");
  assert.equal(otherHost.toString(), "https://relay.example.test/v1/agnesapi?video_id=vid-1");

  const openai = buildRelayTarget("https://api.openai.com/v1", "videos/vid-1", "");
  assert.equal(openai.toString(), "https://api.openai.com/v1/videos/vid-1");
});
