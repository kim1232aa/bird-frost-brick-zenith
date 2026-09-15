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

const { planFalVideoRequest, falVideoQueueNamespace } = await import("./fal.ts");
const {
  nativeVideoAdapterType,
  resolveVideoModelCapability,
} = await import("../../services/api/video-model-capabilities.ts");

test("fal 视频端点按模型映射：预设模型都能解析 t2v/i2v 队列端点（2026-09-15 结果拉取实证）", () => {
  const cases = [
    ["kling-3-pro", "/fal-ai/kling-video/v3/pro/text-to-video", "/fal-ai/kling-video/v3/pro/image-to-video"],
    ["kling-3-standard", "/fal-ai/kling-video/v3/standard/text-to-video", "/fal-ai/kling-video/v3/standard/image-to-video"],
    ["kling-3-turbo", "/fal-ai/kling-video/v3/turbo/standard/text-to-video", "/fal-ai/kling-video/v3/turbo/standard/image-to-video"],
    ["kling-3-turbo-pro", "/fal-ai/kling-video/v3/turbo/pro/text-to-video", "/fal-ai/kling-video/v3/turbo/pro/image-to-video"],
    ["hailuo-2.3", "/fal-ai/minimax/hailuo-2.3/pro/text-to-video", "/fal-ai/minimax/hailuo-2.3/pro/image-to-video"],
    // veo-3.1 t2v 在根路径，i2v 才挂 /image-to-video
    ["veo-3.1", "/fal-ai/veo3.1", "/fal-ai/veo3.1/image-to-video"],
    ["wan-pro", "/fal-ai/wan-pro/text-to-video", "/fal-ai/wan-pro/image-to-video"],
    ["minimax-h3", "/fal-ai/minimax/hailuo-03/text-to-video", "/fal-ai/minimax/hailuo-03/image-to-video"],
  ];
  for (const [model, t2v, i2v] of cases) {
    assert.equal(planFalVideoRequest({ model, prompt: "p" }).path, t2v, `${model} t2v`);
    assert.equal(planFalVideoRequest({ model, prompt: "p", imageUrl: "data:image/png;base64,x" }).path, i2v, `${model} i2v`);
  }
});

test("fal 未知视频模型拒绝提交（不猜端点）", () => {
  assert.throws(() => planFalVideoRequest({ model: "sora-2", prompt: "p" }), /未映射到官方队列端点/);
});

test("kling-3-pro 吃首帧+尾帧，参数按官方合同传输", () => {
  const { body } = planFalVideoRequest({
    model: "kling-3-pro",
    prompt: "p",
    imageUrl: "data:image/png;base64,a",
    lastFrameUrl: "data:image/png;base64,b",
    duration: 8,
    generateAudio: false,
    negativePrompt: "blurry",
    guidance: 0.7,
  });
  assert.equal(body.start_image_url, "data:image/png;base64,a");
  assert.equal(body.end_image_url, "data:image/png;base64,b");
  assert.equal(body.duration, "8");
  assert.equal(body.generate_audio, false);
  assert.equal(body.negative_prompt, "blurry");
  assert.equal(body.cfg_scale, 0.7);
  // 图生视频不发 aspect_ratio（跟原图走）
  assert.equal(body.aspect_ratio, undefined);
});

test("kling-3-pro 文生视频带 aspect_ratio，duration 夹取 3..15", () => {
  const t2v = planFalVideoRequest({ model: "kling-3-pro", prompt: "p", aspectRatio: "9:16", duration: 99 });
  assert.equal(t2v.body.aspect_ratio, "9:16");
  assert.equal(t2v.body.duration, "15");
  const low = planFalVideoRequest({ model: "kling-3-pro", prompt: "p", duration: 1 });
  assert.equal(low.body.duration, "3");
});

test("仅首帧模型拒绝尾帧与多张参考图（确认不支持才拦）", () => {
  assert.throws(
    () => planFalVideoRequest({ model: "veo-3.1", prompt: "p", imageUrl: "a", lastFrameUrl: "b" }),
    /不支持尾帧/,
  );
  assert.throws(
    () => planFalVideoRequest({ model: "hailuo-2.3", prompt: "p", imageUrl: "a", imageUrls: ["b"] }),
    /只吃首帧/,
  );
  assert.throws(() => planFalVideoRequest({ model: "kling-3-pro", prompt: "p", lastFrameUrl: "b" }), /不能只给尾帧/);
});

test("veo-3.1 参数按官方合同：duration 就近 4s/6s/8s、resolution、seed", () => {
  const { body } = planFalVideoRequest({
    model: "veo-3.1",
    prompt: "p",
    duration: 7,
    aspectRatio: "16:9",
    resolution: "1080p",
    generateAudio: true,
    seed: 42,
    negativePrompt: "low quality",
  });
  assert.equal(body.duration, "8s");
  assert.equal(body.aspect_ratio, "16:9");
  assert.equal(body.resolution, "1080p");
  assert.equal(body.generate_audio, true);
  assert.equal(body.seed, 42);
  assert.equal(body.negative_prompt, "low quality");
});

test("wan-pro 固定 6s：不发 duration，传 seed 与 enable_safety_checker", () => {
  const { body } = planFalVideoRequest({ model: "wan-pro", prompt: "p", duration: 10, seed: 7, safetyChecker: false });
  assert.equal(body.duration, undefined);
  assert.equal(body.seed, 7);
  assert.equal(body.enable_safety_checker, false);
});

test("hailuo-2.3 传 prompt_optimizer（promptExpansion 映射）", () => {
  const { body } = planFalVideoRequest({ model: "hailuo-2.3", prompt: "p", promptExpansion: false });
  assert.equal(body.prompt_optimizer, false);
});

test("fal 视频能力合同：kling-3-pro 首尾帧，其余仅首帧，unknown 需显式档案", () => {
  const provider = { id: "preset-fal", adapterType: "fal", baseUrl: "https://fal.run" };
  assert.equal(nativeVideoAdapterType(provider), "fal");
  assert.equal(nativeVideoAdapterType({ baseUrl: "https://queue.fal.run" }), "fal");

  const kling = resolveVideoModelCapability({ model: "kling-3-pro", provider });
  assert.equal(kling.id, "fal-kling3-pro");
  assert.equal(kling.supportsFirstFrame, true);
  assert.equal(kling.supportsFirstLastFrame, true);
  assert.equal(kling.generationParameters.duration.status, "supported");
  assert.equal(kling.generationParameters.guidance.status, "supported");

  const veo = resolveVideoModelCapability({ model: "veo-3.1", provider });
  assert.equal(veo.id, "fal-veo-3-1");
  assert.equal(veo.supportsFirstLastFrame, false);
  assert.equal(veo.generationParameters.resolution.status, "supported");
  assert.deepEqual(veo.generationParameters.duration.enumValues, ["4s", "6s", "8s"]);

  const hailuo = resolveVideoModelCapability({ model: "hailuo-2.3", provider });
  assert.equal(hailuo.id, "fal-hailuo-2-3");
  assert.equal(hailuo.generationParameters.promptExpansion.status, "supported");

  const wan = resolveVideoModelCapability({ model: "wan-pro", provider });
  assert.equal(wan.generationParameters.duration.status, "unsupported");

  const unknown = resolveVideoModelCapability({ model: "sora-2", provider });
  assert.equal(unknown.id, "fal-unknown");
  assert.equal(unknown.requiresExplicitProfile, true);
});

test("minimax-h3 的 duration 是数字且夹取 1..15（2026-09-15 校验报错实证）", () => {
  const { body } = planFalVideoRequest({ model: "minimax-h3", prompt: "p", duration: 99 });
  assert.equal(body.duration, 15);
  const low = planFalVideoRequest({ model: "minimax-h3", prompt: "p", duration: 0 });
  assert.equal(low.body.duration, 1);
});

test("falVideoQueueNamespace 取应用命名空间（状态/结果轮询用，全路径会 405）", () => {
  assert.equal(
    falVideoQueueNamespace("fal-ai/kling-video/v3/turbo/standard/text-to-video"),
    "fal-ai/kling-video",
  );
  assert.equal(
    falVideoQueueNamespace("fal-ai/kling-video/v3/pro/image-to-video"),
    "fal-ai/kling-video",
  );
  assert.equal(
    falVideoQueueNamespace("fal-ai/minimax/hailuo-2.3/pro/image-to-video"),
    "fal-ai/minimax",
  );
  assert.equal(
    falVideoQueueNamespace("fal-ai/veo3.1/image-to-video"),
    "fal-ai/veo3.1",
  );
  assert.equal(
    falVideoQueueNamespace("fal-ai/wan-pro/image-to-video"),
    "fal-ai/wan-pro",
  );
});
