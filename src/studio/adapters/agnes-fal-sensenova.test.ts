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
import {
  agnesVideoPollPath,
  buildAgnesImageBody,
  buildAgnesVideoBody,
  planAgnesVideoPoll,
  readAgnesVideoCreateId,
  readAgnesVideoPoll,
} from "./agnes.ts";
import { planSenseNovaImageRequest } from "./sensenova.ts";
import { buildCustomerVideoStudioRequest, videoPollPath } from "./contracts.ts";
import { buildRelayTarget } from "../../lib/boundless-proxy.server.ts";

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

test("Fal adapter does not claim video create/poll in this task", () => {
  assert.equal(falAdapter.createVideo, undefined);
  assert.equal(falAdapter.pollVideo, undefined);
});

test("Agnes image requires a documented size and defaults to 1K", () => {
  const body = buildAgnesImageBody({ model: "agnes-image-2.1-flash", prompt: "p" });
  assert.equal(body.size, "1K");
  assert.equal(buildAgnesImageBody({ model: "agnes-image-2.1-flash", prompt: "p", size: "2K" }).size, "2K");
});

test("Agnes image omits undocumented top-level n, seed, and negative_prompt", () => {
  const body = buildAgnesImageBody({
    model: "agnes-image-2.1-flash",
    prompt: "p",
    size: "2K",
    n: 2,
    seed: 7,
    negativePrompt: "blur",
    aspectRatio: "16:9",
  });
  assert.equal("n" in body, false);
  assert.equal("seed" in body, false);
  assert.equal("negative_prompt" in body, false);
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
  assert.equal("resolution" in body, false);
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
  assert.throws(
    () => buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", quantity: 2 }),
    /不支持 quantity|不会静默/,
  );
});

test("Agnes video V2.0 maps an explicit fps while preserving the 8n+1 frame rule", () => {
  const body = buildAgnesVideoBody({ model: "agnes-video-v2.0", prompt: "p", duration: 5, fps: 30 });
  assert.equal(body.frame_rate, 30);
  assert.equal(body.num_frames, 153);
  assert.equal((Number(body.num_frames) - 1) % 8, 0);
  assert.ok(Number(body.num_frames) <= 441);
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

test("Agnes video poll uses /agnesapi?video_id= and metadata.url", () => {
  assert.equal(agnesVideoPollPath("vid 1"), "/agnesapi?video_id=vid%201");
  const planned = planAgnesVideoPoll("vid-1", "https://apihub.agnes-ai.com/v1");
  assert.equal(planned.path, "/agnesapi?video_id=vid-1");
  assert.equal(planned.method, "GET");
  assert.equal("baseUrl" in planned, false);
  const completed = readAgnesVideoPoll({
    status: "completed",
    video_url: "https://example.test/wrong.mp4",
    url: "https://example.test/also-wrong.mp4",
    metadata: { url: "https://example.test/official.mp4" },
  });
  assert.deepEqual(completed, { status: "completed", url: "https://example.test/official.mp4" });
  assert.equal(readAgnesVideoPoll({ status: "queued" }).status, "pending");
  assert.equal(readAgnesVideoPoll({ status: "in_progress" }).status, "pending");
  assert.equal(readAgnesVideoPoll({ status: "failed", error: { message: "nope" } }).status, "failed");
  assert.equal(readAgnesVideoPoll({ status: "completed" }).status, "failed");
});

test("SenseNova generations omit references, seed, and negative_prompt", () => {
  const planned = planSenseNovaImageRequest({
    model: "sensenova-u1-fast",
    prompt: "p",
    seed: 11,
    negativePrompt: "blur",
    n: 2,
  });
  assert.equal(planned.path, "/images/generations");
  assert.equal("seed" in planned.body, false);
  assert.equal("negative_prompt" in planned.body, false);
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
    /Studio 已支持生图|视频未接线|未实现/,
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
