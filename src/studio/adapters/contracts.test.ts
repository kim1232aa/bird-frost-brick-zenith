import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRefCount,
  attachOfficialOpenAiVideoContent,
  buildArkImageGenerationBody,
  buildArkVideoBody,
  buildCustomerVideoStudioRequest,
  buildDashscopeImageRequest,
  buildDashscopeVideoBody,
  buildOpenAiOfficialImageBody,
  buildOpenAiOfficialVideoBody,
  buildXaiImagineVideoBody,
  DASHSCOPE_TASK_POLL_WINDOW_MS,
  dashscopeNativeApiHost,
  isOfficialOpenAiHost,
  isOfficialXaiHost,
  OFFICIAL_OPENAI_IMAGE_REF_CAP,
  officialAwareVideoCreatePath,
  openaiVideoWireKind,
  planCustomerVideoContentFetch,
  planOpenAiCompatCreateVideo,
  readOpenAiCompatPoll,
  readProviderError,
  sniffMedia,
  STUDIO_VIDEO_POLL_WINDOW_MS,
  studioEndpoint,
  toStudioVideoWire,
  videoPollPath,
} from "./contracts.ts";
import { PROTOCOL_PRESETS } from "../protocols.ts";
import { clampManagedTokenPlanRelay } from "../../stores/api-relay-presets.ts";

test("Ark video preserves generateAudio=false", () => {
  assert.equal(buildArkVideoBody({ model: "seedance", prompt: "p", generateAudio: false }).generate_audio, false);
});

test("Ark video omits generate_audio unless generateAudio is boolean", () => {
  assert.equal("generate_audio" in buildArkVideoBody({ model: "seedance", prompt: "p" }), false);
  assert.equal(buildArkVideoBody({ model: "seedance", prompt: "p", generateAudio: true }).generate_audio, true);
});

test("xAI official I2V sends only image.url and never last_frame_image or reference_images", () => {
  const xaiI2v = buildXaiImagineVideoBody({ model: "grok-imagine-video-1.5", prompt: "p", image: { url: "first" } });
  assert.deepEqual(xaiI2v.image, { url: "first" });
  assert.equal("reference_images" in xaiI2v, false);
  assert.equal("last_frame_image" in xaiI2v, false);
  assert.equal("image_urls" in xaiI2v, false);
});

test("xAI official R2V sends reference_images and never mixes image", () => {
  const body = buildXaiImagineVideoBody({
    model: "grok-imagine-video-1.5",
    prompt: "p",
    image_urls: ["https://example.test/a.png", "https://example.test/b.png"],
  });
  assert.deepEqual(body.reference_images, [{ url: "https://example.test/a.png" }, { url: "https://example.test/b.png" }]);
  assert.equal("image" in body, false);
  assert.equal("image_urls" in body, false);
  assert.equal("last_frame_image" in body, false);
});

test("xAI official last_frame_image is unsupported and throws", () => {
  assert.throws(
    () =>
      buildXaiImagineVideoBody({
        model: "grok-imagine-video-1.5",
        prompt: "p",
        image: { url: "first" },
        last_frame_image: { url: "last" },
      }),
    /没有静帧尾帧|extensions/,
  );
});

test("xAI official refuses mixing I2V image with extra reference stills", () => {
  assert.throws(
    () =>
      buildXaiImagineVideoBody({
        model: "grok-imagine-video-1.5",
        prompt: "p",
        image: { url: "first" },
        image_urls: ["extra"],
      }),
    /I2V|R2V|不能同时|互斥/,
  );
});

test("Ark first and last frames use official roles", () => {
  const ark = buildArkVideoBody({ model: "seedance", prompt: "p", imageUrl: "first", lastFrameUrl: "last" });
  assert.equal((ark.content as Array<Record<string, unknown>>)[1].role, "first_frame");
  assert.equal((ark.content as Array<Record<string, unknown>>)[2].role, "last_frame");
});

test("Ark reference images use reference_image and stay exclusive of frames", () => {
  const refs = buildArkVideoBody({ model: "seedance", prompt: "p", imageUrls: ["a", "b"] });
  const content = refs.content as Array<Record<string, unknown>>;
  assert.equal(content[1].role, "reference_image");
  assert.equal(content[2].role, "reference_image");

  const frames = buildArkVideoBody({
    model: "seedance",
    prompt: "p",
    imageUrl: "first",
    lastFrameUrl: "last",
    imageUrls: ["extra"],
  });
  const frameContent = frames.content as Array<Record<string, unknown>>;
  assert.equal(frameContent.length, 3);
  assert.ok(!frameContent.some((item) => item.role === "reference_image"));
});

test("Ark group image count lives under sequential_image_generation_options", () => {
  const body = buildArkImageGenerationBody({ model: "doubao-seedream-5.0-lite", prompt: "p", n: 4 });
  assert.equal("max_images" in body, false);
  assert.equal(body.sequential_image_generation, "auto");
  assert.deepEqual(body.sequential_image_generation_options, { max_images: 4 });
});

test("Ark studio video wire preserves generateAudio=false and last frame", () => {
  const body = toStudioVideoWire("ark-plan", "seedance", {
    prompt: "p",
    ratio: "16:9",
    generateAudio: false,
    first_frame: "https://example.test/a.png",
    last_frame: "https://example.test/b.png",
  });
  assert.equal(body.generate_audio, false);
  const content = body.content as Array<Record<string, unknown>>;
  assert.equal(content[1].role, "first_frame");
  assert.ok(content.some((item) => item.role === "last_frame"));
});

test("DashScope wan2.6-t2v uses size not ratio", () => {
  const body = buildDashscopeVideoBody({
    model: "wan2.6-t2v",
    prompt: "p",
    ratio: "16:9",
  });
  const parameters = body.parameters as Record<string, unknown>;
  assert.equal(parameters.size, "1280*720");
  assert.equal("ratio" in parameters, false);
});

test("DashScope wan2.7-t2v uses ratio not size", () => {
  const body = buildDashscopeVideoBody({
    model: "wan2.7-t2v",
    prompt: "p",
    ratio: "16:9",
  });
  const parameters = body.parameters as Record<string, unknown>;
  assert.equal(parameters.ratio, "16:9");
  assert.notEqual(parameters.size, "16:9");
  assert.equal("size" in parameters, false);
});

test("DashScope wan2.6-t2i uses multimodal messages without image2image", () => {
  const request = buildDashscopeImageRequest({ model: "wan2.6-t2i", prompt: "p" });
  assert.match(request.path, /multimodal-generation\/generation/);
  assert.equal(request.async, false);
  const input = request.body.input as { messages?: Array<{ content?: Array<Record<string, unknown>> }> };
  assert.ok(input.messages?.[0]?.content?.some((item) => item.text === "p"));
});

test("DashScope wan2.7-i2v uses media first_frame/last_frame not img_url", () => {
  const body = buildDashscopeVideoBody({
    model: "wan2.7-i2v",
    prompt: "p",
    imageUrl: "first",
    lastFrameUrl: "last",
  });
  const input = body.input as { media?: Array<{ type?: string; url?: string }>; img_url?: string };
  assert.deepEqual(input.media, [
    { type: "first_frame", url: "first" },
    { type: "last_frame", url: "last" },
  ]);
  assert.equal("img_url" in input, false);
  assert.equal("ratio" in (body.parameters as Record<string, unknown>), false);
  assert.throws(
    () => buildDashscopeVideoBody({ model: "wan2.7-i2v", prompt: "p", imageUrl: "first", ratio: "16:9" }),
    /画幅跟随首帧.*不支持 ratio|不会静默丢弃/iu,
  );
});

test("DashScope wan2.6-image uses multimodal messages", () => {
  const request = buildDashscopeImageRequest({
    model: "wan2.6-image",
    prompt: "p",
    imageUrls: ["https://example.test/ref.png"],
  });
  assert.match(request.path, /multimodal-generation\/generation/);
  const input = request.body.input as { messages?: Array<{ content?: Array<Record<string, unknown>> }> };
  const content = input.messages?.[0]?.content || [];
  assert.ok(content.some((item) => item.image === "https://example.test/ref.png"));
  assert.ok(content.some((item) => item.text === "p"));
});

test("DashScope wan2.5-i2i alone uses legacy image2image", () => {
  const request = buildDashscopeImageRequest({
    model: "wan2.5-i2i",
    prompt: "p",
    imageUrls: ["https://example.test/ref.png"],
    negativePrompt: "n",
  });
  assert.match(request.path, /image2image\/image-synthesis/);
  const input = request.body.input as Record<string, unknown>;
  assert.deepEqual(input.images, ["https://example.test/ref.png"]);
  assert.equal(input.negative_prompt, "n");
  assert.equal("negative_prompt" in ((request.body.parameters as Record<string, unknown>) || {}), false);
});

test("openai-compat relay video wire forwards resolution fps last_frame image_urls negative_prompt", () => {
  const body = toStudioVideoWire("openai-compat", "relay-video", {
    prompt: "p",
    ratio: "16:9",
    resolution: "720p",
    fps: 24,
    generateAudio: false,
    last_frame: "https://example.test/b.png",
    image_urls: ["https://example.test/c.png"],
    negative_prompt: "n",
  });
  assert.equal(body.resolution, "720p");
  assert.equal(body.fps, 24);
  assert.equal(body.generate_audio, false);
  assert.equal(body.last_frame, "https://example.test/b.png");
  assert.deepEqual(body.image_urls, ["https://example.test/c.png"]);
  assert.equal(body.negative_prompt, "n");
  assert.equal(body.aspect_ratio || body.ratio, "16:9");
});

test("openai-compat relay forwards extended video fields without overwriting model", () => {
  const body = toStudioVideoWire("openai-compat", "relay-video", {
    prompt: "p",
    duration: 16,
    ratio: "21:9",
    steps: 33,
    guidance: 7.5,
    modelVariant: "relay-v2",
    watermark: false,
    promptExpansion: false,
    returnLastFrame: true,
    audioUrl: "https://example.test/audio.mp3",
    width: 2048,
    height: 858,
  });
  assert.equal(body.model, "relay-video");
  assert.equal(body.duration, 16);
  assert.equal(body.steps, 33);
  assert.equal(body.guidance, 7.5);
  assert.equal(body.model_variant, "relay-v2");
  assert.equal(body.watermark, false);
  assert.equal(body.prompt_expansion, false);
  assert.equal(body.return_last_frame, true);
  assert.equal(body.audio_url, "https://example.test/audio.mp3");
  assert.equal(body.width, 2048);
  assert.equal(body.height, 858);
});

test("official OpenAI and xAI reject unsupported extended video fields before HTTP", () => {
  assert.throws(
    () => toStudioVideoWire("openai-compat", "sora-2", {
      prompt: "p",
      steps: 33,
    }, { baseUrl: "https://api.openai.com/v1" }),
    /OpenAI 官方.*steps|不支持.*steps/iu,
  );
  assert.throws(
    () => toStudioVideoWire("xai-imagine", "grok-imagine-video-1.5", {
      prompt: "p",
      guidance: 7.5,
    }, { baseUrl: "https://api.x.ai/v1" }),
    /xAI 官方.*guidance|不支持.*guidance/iu,
  );
});

test("OpenAI official video uses only seconds size and one input_reference", () => {
  const body = buildOpenAiOfficialVideoBody({
    model: "sora-2",
    prompt: "p",
    duration: 8,
    size: "1280x720",
    first_frame: "https://example.test/a.png",
    ratio: "16:9",
  });
  assert.equal(body.model, "sora-2");
  assert.equal(body.prompt, "p");
  assert.equal(body.seconds, "8");
  assert.equal(body.size, "1280x720");
  assert.deepEqual(body.input_reference, { image_url: "https://example.test/a.png" });
  assert.equal("duration" in body, false);
  assert.equal("ratio" in body, false);
});

test("OpenAI official video rejects unsupported non-empty fields instead of dropping them", () => {
  const base = { model: "sora-2", prompt: "p", duration: 8 };
  assert.throws(() => buildOpenAiOfficialVideoBody({ ...base, fps: 24 }), /OpenAI 官方.*fps|不支持.*fps/iu);
  assert.throws(() => buildOpenAiOfficialVideoBody({ ...base, generateAudio: false }), /OpenAI 官方.*generate_audio|不支持.*音频/iu);
  assert.throws(() => buildOpenAiOfficialVideoBody({ ...base, negative_prompt: "n" }), /OpenAI 官方.*negative_prompt|不支持.*负面/iu);
  assert.throws(
    () => buildOpenAiOfficialVideoBody({ ...base, first_frame: "https://example.test/a.png", image_urls: ["https://example.test/b.png"] }),
    /OpenAI 官方.*image_urls|input_reference.*1/iu,
  );
});

test("OpenAI official video rejects last_frame instead of silently dropping it", () => {
  assert.throws(
    () =>
      buildOpenAiOfficialVideoBody({
        model: "sora-2",
        prompt: "p",
        first_frame: "https://example.test/a.png",
        last_frame: "https://example.test/b.png",
      }),
    /OpenAI 官方.*尾帧|last_frame|input_reference/,
  );
});

test("OpenAI official Images reject unsupported seed or negative_prompt instead of dropping them", () => {
  assert.throws(
    () => buildOpenAiOfficialImageBody({ model: "gpt-image-2", prompt: "p", seed: 12 }),
    /OpenAI 官方 Images.*seed|不支持.*seed/iu,
  );
  assert.throws(
    () => buildOpenAiOfficialImageBody({ model: "gpt-image-2", prompt: "p", negativePrompt: "n" }),
    /OpenAI 官方 Images.*negative_prompt|不支持.*negative/iu,
  );

  const edit = buildOpenAiOfficialImageBody({
    model: "gpt-image-2",
    prompt: "p",
    imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
    maskUrl: "https://example.test/mask.png",
    operation: "edit",
  });
  assert.deepEqual(edit.images, [{ image_url: "https://example.test/a.png" }, { image_url: "https://example.test/b.png" }]);
  assert.deepEqual(edit.mask, { image_url: "https://example.test/mask.png" });
  assert.equal("image" in edit, false);
});

test("xAI studio video wire does not invent resolution", () => {
  const body = toStudioVideoWire("xai-imagine", "grok-imagine-video", {
    prompt: "p",
    first_frame: "https://example.test/a.png",
  });
  assert.equal("resolution" in body, false);
  assert.deepEqual(body.image, { url: "https://example.test/a.png" });
  assert.equal("last_frame_image" in body, false);
  assert.equal("image_urls" in body, false);
});

test("official OpenAI GPT Image reference cap is 16", () => {
  assert.equal(OFFICIAL_OPENAI_IMAGE_REF_CAP, 16);
  assert.throws(() => assertRefCount(17, 16), /最多 16 张参考图，当前 17 张/);
  assert.doesNotThrow(() => assertRefCount(16, 16));
});

test("safe image ref cap is surfaced in the error", () => {
  assert.throws(() => assertRefCount(6, 5), /最多 5 张参考图，当前 6 张/);
  assert.doesNotThrow(() => assertRefCount(5, 5));
});

test("official hosts are detected from base URL", () => {
  assert.equal(isOfficialXaiHost("https://api.x.ai/v1"), true);
  assert.equal(isOfficialXaiHost("https://superxihe.com/v1"), false);
  assert.equal(isOfficialOpenAiHost("https://api.openai.com/v1"), true);
  assert.equal(isOfficialOpenAiHost("https://hansyai.cn/v1"), false);
});

test("DashScope Token Plan host is not rewritten to shared dashscope.aliyuncs.com", () => {
  const host = dashscopeNativeApiHost("https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1");
  assert.match(host, /token-plan\.cn-beijing\.maas\.aliyuncs\.com/i);
  assert.equal(/dashscope\.aliyuncs\.com/i.test(host), false);
});

test("DashScope poll window covers the documented multi-minute task", () => {
  assert.ok(DASHSCOPE_TASK_POLL_WINDOW_MS >= 5 * 60_000);
});

test("toStudioVideoWire on api.openai.com uses official seconds size and input_reference", () => {
  const body = toStudioVideoWire(
    "openai-compat",
    "sora-2",
    {
      prompt: "p",
      duration: 8,
      ratio: "16:9",
      resolution: "720p",
      first_frame: "https://example.test/a.png",
    },
    { baseUrl: "https://api.openai.com/v1" },
  );
  assert.equal(body.seconds, "8");
  assert.equal(body.size, "1280x720");
  assert.deepEqual(body.input_reference, { image_url: "https://example.test/a.png" });
  assert.equal("duration" in body, false);
  assert.equal("ratio" in body, false);
});

test("toStudioVideoWire on api.openai.com rejects compatibility-only video fields", () => {
  const base = {
    prompt: "p",
    duration: 8,
    ratio: "16:9",
    resolution: "720p",
    first_frame: "https://example.test/a.png",
  };
  assert.throws(
    () => toStudioVideoWire("openai-compat", "sora-2", { ...base, fps: 24 }, { baseUrl: "https://api.openai.com/v1" }),
    /OpenAI 官方.*fps/iu,
  );
  assert.throws(
    () => toStudioVideoWire("openai-compat", "sora-2", { ...base, generateAudio: false }, { baseUrl: "https://api.openai.com/v1" }),
    /OpenAI 官方.*generate_audio|音频/iu,
  );
  assert.throws(
    () => toStudioVideoWire("openai-compat", "sora-2", { ...base, image_urls: ["https://example.test/c.png"] }, { baseUrl: "https://api.openai.com/v1" }),
    /OpenAI 官方.*image_urls|input_reference/iu,
  );
});

test("toStudioVideoWire official OpenAI rejects last_frame before serialization", () => {
  assert.throws(
    () =>
      toStudioVideoWire(
        "openai-compat",
        "sora-2",
        {
          prompt: "p",
          first_frame: "https://example.test/a.png",
          last_frame: "https://example.test/b.png",
        },
        { baseUrl: "https://api.openai.com/v1" },
      ),
    /OpenAI 官方.*尾帧|last_frame|input_reference/,
  );
});

test("toStudioVideoWire openai-official maps 720p 9:16 to documented size", () => {
  const body = toStudioVideoWire("openai-official", "sora-2", {
    prompt: "p",
    duration: 4,
    ratio: "9:16",
    resolution: "720p",
  });
  assert.equal(body.seconds, "4");
  assert.equal(body.size, "720x1280");
});

test("openaiVideoWireKind treats api.openai.com as official even on openai-compat protocol", () => {
  assert.equal(openaiVideoWireKind("https://api.openai.com/v1", "openai-compat"), "openai-official");
  assert.equal(openaiVideoWireKind("https://hansyai.cn/v1", "openai-compat"), "openai-compat");
  assert.equal(openaiVideoWireKind("https://example.test/v1", "openai-official"), "openai-official");
});

test("videoCreatePath uses /videos on official OpenAI host and /videos/generations on relays", () => {
  assert.equal(officialAwareVideoCreatePath("openai-compat", undefined, { baseUrl: "https://api.openai.com/v1" }), "/videos");
  assert.equal(officialAwareVideoCreatePath("openai-compat"), "/videos/generations");
  assert.equal(
    officialAwareVideoCreatePath("openai-compat", { videosCreate: "/videos" }, { baseUrl: "https://api.openai.com/v1" }),
    "/videos",
  );
  assert.equal(
    officialAwareVideoCreatePath("openai-compat", { videosCreate: "/videos/generations" }, { baseUrl: "https://api.openai.com/v1", protocol: "openai-compat" }),
    "/videos",
  );
  assert.equal(
    officialAwareVideoCreatePath("openai-official", { videosCreate: "/videos/generations" }),
    "/videos",
  );
});

test("Canvas customer official OpenAI JSON keeps only the supported first-frame contract", () => {
  const request = buildCustomerVideoStudioRequest({
    adapterType: "openai-compat",
    model: "sora-2",
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai-compat",
    prompt: "p",
    duration: 8,
    ratio: "16:9",
    first_frame: "https://example.test/a.png",
  });
  assert.equal(request.path, "/videos");
  assert.equal(request.body.seconds, "8");
  assert.equal(request.body.size, "1280x720");
  assert.deepEqual(request.body.input_reference, { image_url: "https://example.test/a.png" });
  assert.equal("duration" in request.body, false);
});

test("Canvas customer official OpenAI JSON rejects negative_prompt before a request is sent", () => {
  assert.throws(
    () =>
      buildCustomerVideoStudioRequest({
        adapterType: "openai-compat",
        model: "sora-2",
        baseUrl: "https://api.openai.com/v1",
        protocol: "openai-compat",
        prompt: "p",
        duration: 8,
        ratio: "16:9",
        negative_prompt: "n",
      }),
    /OpenAI 官方.*negative_prompt|负面提示词/iu,
  );
});

test("Canvas customer official OpenAI JSON rejects last_frame before a request is sent", () => {
  assert.throws(
    () =>
      buildCustomerVideoStudioRequest({
        adapterType: "openai-compat",
        model: "sora-2",
        baseUrl: "https://api.openai.com/v1",
        protocol: "openai-compat",
        prompt: "p",
        first_frame: "https://example.test/a.png",
        last_frame: "https://example.test/b.png",
      }),
    /OpenAI 官方.*尾帧|last_frame|input_reference/,
  );
});

test("xAI toStudioVideoWire uses relay profile for non-api.x.ai hosts", () => {
  const body = toStudioVideoWire(
    "xai-imagine",
    "grok-imagine-video",
    {
      prompt: "p",
      first_frame: "https://example.test/a.png",
      last_frame: "https://example.test/b.png",
      image_urls: ["https://example.test/c.png"],
    },
    { baseUrl: "https://superxihe.com/v1" },
  );
  assert.deepEqual(body.image, { url: "https://example.test/a.png" });
  assert.deepEqual(body.last_frame_image, { url: "https://example.test/b.png" });
  assert.ok(Array.isArray(body.image_urls));
  assert.equal("reference_images" in body, false);
});

test("xAI toStudioVideoWire on api.x.ai stays official and refuses last_frame", () => {
  assert.throws(
    () =>
      toStudioVideoWire(
        "xai-imagine",
        "grok-imagine-video-1.5",
        {
          prompt: "p",
          first_frame: "https://example.test/a.png",
          last_frame: "https://example.test/b.png",
        },
        { baseUrl: "https://api.x.ai/v1" },
      ),
    /没有静帧尾帧|extensions/,
  );
});

test("official OpenAI poll reads error.message instead of String(object)", () => {
  assert.equal(readProviderError({ error: { code: "moderation", message: "blocked" }, message: "fallback" }), "blocked");
  assert.equal(readProviderError({ error: "plain" }), "plain");
});

test("openai-compat official poll helper used by live adapter reads nested error.message", () => {
  const result = readOpenAiCompatPoll(
    { status: "failed", error: { code: "moderation_blocked", message: "blocked by policy" } },
    true,
  );
  assert.equal(result.status, "failed");
  assert.equal(result.error, "blocked by policy");
  assert.equal(String(result.error).includes("[object Object]"), false);
  const completed = readOpenAiCompatPoll({ status: "completed" }, true);
  assert.equal(completed.status, "completed");
  assert.equal(completed.needsContent, true);
});

test("Studio wait window covers official multi-minute video jobs", () => {
  assert.ok(STUDIO_VIDEO_POLL_WINDOW_MS >= 10 * 60_000);
});

test("openai-compat protocol preset does not default to api.openai.com", () => {
  const preset = PROTOCOL_PRESETS.find((item) => item.id === "openai-compat");
  assert.ok(preset);
  assert.notEqual(new URL(preset.defaultBaseUrl).hostname, "api.openai.com");
});

test("Token Plan merge preserves explicit image and video capabilities", () => {
  const row = clampManagedTokenPlanRelay({
    id: "preset-aliyun-tokenplan",
    capabilities: ["text", "image", "video"],
    models: ["wan2.7-image", "happyhorse-1.1-t2v"],
    textModels: [],
    imageModels: ["wan2.7-image"],
    videoModels: ["happyhorse-1.1-t2v"],
    audioModels: [],
  }, []);
  assert.deepEqual(row.capabilities, ["text", "image", "video"]);
  assert.deepEqual(row.imageModels, ["wan2.7-image"]);
  assert.deepEqual(row.videoModels, ["happyhorse-1.1-t2v"]);
  assert.deepEqual(row.models, ["wan2.7-image", "happyhorse-1.1-t2v"]);
});

test("sniffMedia recognizes audio, image, and video magic bytes", () => {
  assert.equal(sniffMedia(Uint8Array.of(0x49, 0x44, 0x33, 0x04)), "audio/mpeg");
  const wav = new Uint8Array(12);
  wav[0] = 0x52;
  wav[1] = 0x49;
  wav[2] = 0x46;
  wav[3] = 0x46;
  wav[8] = 0x57;
  wav[9] = 0x41;
  assert.equal(sniffMedia(wav), "audio/wav");
  assert.equal(sniffMedia(Uint8Array.of(0x4f, 0x67, 0x67, 0x53)), "audio/ogg");
  assert.equal(sniffMedia(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  const mp4 = new Uint8Array(12);
  mp4[4] = 0x66;
  mp4[5] = 0x74;
  mp4[6] = 0x79;
  mp4[7] = 0x70;
  assert.equal(sniffMedia(mp4), "video/mp4");
});

test("createVideo official host ignores compat videosCreate and forces /videos", () => {
  const official = planOpenAiCompatCreateVideo({
    model: "sora-2",
    prompt: "p",
    duration: 8,
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai-compat",
    endpoints: { videosCreate: "/videos/generations" },
  });
  assert.equal(official.path, "/videos");
  assert.equal(official.body.seconds, "8");
  assert.equal("duration" in official.body, false);

  const relay = planOpenAiCompatCreateVideo({
    model: "relay-video",
    prompt: "p",
    baseUrl: "https://hansyai.cn/v1",
    protocol: "openai-compat",
    endpoints: { videosCreate: "/videos/generations" },
  });
  assert.equal(relay.path, "/videos/generations");
});

test("official OpenAI seconds only emit API-ref 4|8|12 and reject other values", () => {
  assert.equal(buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", duration: 4 }).seconds, "4");
  assert.equal(buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", duration: 8 }).seconds, "8");
  assert.equal(buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", duration: 12 }).seconds, "12");
  assert.equal("seconds" in buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p" }), false);
  assert.throws(() => buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", duration: 5 }), /seconds 只接受 4 \/ 8 \/ 12/);
  assert.throws(() => buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", duration: 6 }), /seconds 只接受 4 \/ 8 \/ 12/);
});

test("customer official OpenAI poll plans GET /videos/{id}/content when retrieve is completed without a URL", () => {
  const planned = planCustomerVideoContentFetch({
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai-compat",
    taskId: "vid 1",
    task: { status: "completed" },
  });
  assert.deepEqual(planned, { method: "GET", path: "/videos/vid%201/content" });

  const attached = attachOfficialOpenAiVideoContent({ status: "completed", task_id: "vid 1" }, { url: "blob:official-content" });
  assert.ok(attached.file_urls?.includes("blob:official-content"));
  assert.equal(attached.content?.video_url, "blob:official-content");

  assert.equal(
    planCustomerVideoContentFetch({
      baseUrl: "https://hansyai.cn/v1",
      protocol: "openai-compat",
      taskId: "vid-1",
      task: { status: "completed", file_urls: ["https://cdn.example/a.mp4"] },
    }),
    null,
  );
});

test("videoPollPath(agnes) uses official /agnesapi?video_id= even when endpoints advertise /videos/{id}", () => {
  assert.equal(videoPollPath("agnes", "vid 1"), "/agnesapi?video_id=vid%201");
  assert.equal(videoPollPath("agnes", "vid-1", { videosPoll: "/videos/{id}" }), "/agnesapi?video_id=vid-1");
});

test("official OpenAI poll path stays GET /videos/{id} even if endpoints advertise generations", () => {
  assert.equal(
    videoPollPath("openai-compat", "vid 1", { videosPoll: "/videos/generations/{id}" }, { baseUrl: "https://api.openai.com/v1" }),
    "/videos/vid%201",
  );
  assert.equal(
    planCustomerVideoContentFetch({
      baseUrl: "https://api.openai.com/v1",
      protocol: "openai-official",
      taskId: "vid 1",
      task: { status: "completed" },
    })?.path,
    "/videos/vid%201/content",
  );
});

test("Canvas customer + registry share official create/poll contracts", () => {
  const official = { baseUrl: "https://api.openai.com/v1", protocol: "openai-compat" };
  const create = buildCustomerVideoStudioRequest({
    adapterType: "openai-compat",
    model: "sora-2",
    ...official,
    endpoints: { videosCreate: "/videos/generations", videosPoll: "/videos/generations/{id}" },
    prompt: "p",
    duration: 8,
  });
  assert.equal(create.path, "/videos");
  assert.equal(create.path, officialAwareVideoCreatePath("openai-compat", { videosCreate: "/videos/generations" }, official));
  assert.equal(create.body.seconds, "8");
  assert.equal("duration" in create.body, false);
  assert.equal(
    videoPollPath("openai-compat", "vid-1", { videosPoll: "/videos/generations/{id}" }, official),
    "/videos/vid-1",
  );
  assert.equal(videoPollPath("agnes", "vid-1", { videosPoll: "/videos/{id}" }), "/agnesapi?video_id=vid-1");
  assert.equal(
    videoPollPath("agnes", "vid-1", { videosPoll: "/agnesapi?video_id={id}" }, { baseUrl: "https://apihub.agnes-ai.com/v1" }),
    "/agnesapi?video_id=vid-1",
  );
});

test("studioEndpoint does not prefix a slash onto absolute URLs and keeps query placeholders", () => {
  assert.equal(
    studioEndpoint({ videosCreate: "https://relay.example/v1/videos" }, "videosCreate", "/videos"),
    "https://relay.example/v1/videos",
  );
  assert.equal(
    studioEndpoint({ videosPoll: "https://relay.example/v1/videos/{id}?variant=video" }, "videosPoll", "/videos/{id}", "vid 1"),
    "https://relay.example/v1/videos/vid%201?variant=video",
  );
  assert.equal(
    studioEndpoint({ videosPoll: "/agnesapi?video_id={id}" }, "videosPoll", "/videos/{id}", "vid 1"),
    "/agnesapi?video_id=vid%201",
  );
  assert.equal(studioEndpoint({ videosCreate: "videos/generations" }, "videosCreate", "/videos"), "/videos/generations");
});

test("Agnes create path stays POST /videos even when endpoints advertise generations", () => {
  assert.equal(officialAwareVideoCreatePath("agnes", { videosCreate: "/videos/generations" }), "/videos");
  assert.equal(
    officialAwareVideoCreatePath("agnes", { videosCreate: "/videos/generations" }, { baseUrl: "https://apihub.agnes-ai.com/v1" }),
    "/videos",
  );
  const request = buildCustomerVideoStudioRequest({
    adapterType: "agnes",
    model: "agnes-video-v2.0",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    endpoints: { videosCreate: "/videos/generations", videosPoll: "/videos/{id}" },
    prompt: "p",
    last_frame: "https://example.test/b.png",
    first_frame: "https://example.test/a.png",
  });
  assert.equal(request.path, "/videos");
  assert.deepEqual((request.body.extra_body as { image: string[]; mode: string }).image, [
    "https://example.test/a.png",
    "https://example.test/b.png",
  ]);
  assert.equal((request.body.extra_body as { mode: string }).mode, "keyframes");
});

test("toStudioVideoWire agnes sends explicit frames as official num_frames", () => {
  const body = toStudioVideoWire("agnes", "agnes-video-v2.0", {
    prompt: "p",
    duration: 5,
    fps: 24,
    frames: 81,
  });
  assert.equal(body.num_frames, 81);
  assert.equal(body.frame_rate, 24);
});

test("toStudioVideoWire DashScope video-edit sends official audio_setting", () => {
  const wan = buildDashscopeVideoBody({
    model: "wan2.7-videoedit",
    prompt: "p",
    audioMode: "origin",
    resolution: "720P",
  });
  assert.equal((wan.parameters as { audio_setting?: string }).audio_setting, "origin");
  assert.equal((wan.parameters as { resolution?: string }).resolution, "720P");

  const horse = toStudioVideoWire("dashscope", "happyhorse-1.0-video-edit", {
    prompt: "p",
    audioMode: "auto",
    resolution: "1080P",
  });
  assert.equal((horse.parameters as { audio_setting?: string }).audio_setting, "auto");

  assert.throws(
    () => buildDashscopeVideoBody({ model: "wan2.7-t2v", prompt: "p", audioMode: "origin" }),
    /audio_setting|audioMode|videoedit/iu,
  );
});

test("toStudioVideoWire Civitai LTX quantity and frameGuideStrength stay official", () => {
  const create = toStudioVideoWire("civitai", "ltx2.3", { prompt: "p", quantity: 3 });
  const createInput = (create.steps as Array<{ input: Record<string, unknown> }>)[0].input;
  assert.equal(createInput.quantity, 3);
  assert.equal("frameGuideStrength" in createInput, false);

  const flf = toStudioVideoWire("civitai", "ltx2.3", {
    prompt: "p",
    first_frame: "https://example.test/a.png",
    last_frame: "https://example.test/b.png",
    frameGuideStrength: 0.7,
    quantity: 2,
  });
  const flfInput = (flf.steps as Array<{ input: Record<string, unknown> }>)[0].input;
  assert.equal(flfInput.operation, "firstLastFrameToVideo");
  assert.equal(flfInput.frameGuideStrength, 0.7);
  assert.equal(flfInput.quantity, 2);
});

test("toStudioVideoWire agnes refuses last-only keyframes impersonation", () => {
  assert.throws(
    () =>
      toStudioVideoWire("agnes", "agnes-video-v2.0", {
        prompt: "p",
        last_frame: "https://example.test/b.png",
      }),
    /首帧|keyframes/,
  );
});

test("openai-compat custom videosCreate is used only when the host is not api.openai.com", () => {
  const relay = planOpenAiCompatCreateVideo({
    model: "relay-video",
    prompt: "p",
    baseUrl: "https://hansyai.cn/v1",
    protocol: "openai-compat",
    endpoints: { videosCreate: "https://hansyai.cn/custom/videos" },
  });
  assert.equal(relay.path, "https://hansyai.cn/custom/videos");
  assert.equal("seconds" in relay.body, false);

  const official = planOpenAiCompatCreateVideo({
    model: "sora-2",
    prompt: "p",
    duration: 8,
    baseUrl: "https://api.openai.com/v1",
    protocol: "openai-compat",
    endpoints: { videosCreate: "https://hansyai.cn/custom/videos" },
  });
  assert.equal(official.path, "/videos");
  assert.equal(official.body.seconds, "8");
});

test("official OpenAI size only emits API-ref WxH or documented 720p mappings", () => {
  assert.equal(buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", size: "1024x1792" }).size, "1024x1792");
  assert.equal(buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", size: "1792x1024" }).size, "1792x1024");
  assert.equal(
    buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", size: "720p", ratio: "16:9" }).size,
    "1280x720",
  );
  assert.equal("size" in buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p" }), false);
  assert.throws(
    () => buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", size: "1080p", ratio: "16:9" }),
    /OpenAI 官方 Videos 的 size .* 1080p/,
  );
  assert.throws(
    () => buildOpenAiOfficialVideoBody({ model: "sora-2", prompt: "p", size: "1920x1080" }),
    /OpenAI 官方 Videos 的 size .* 1920x1080/,
  );
});

test("Ark create body sends official resolution, watermark, and return_last_frame", () => {
  const body = buildArkVideoBody({
    model: "doubao-seedance-2-0-260128",
    prompt: "p",
    resolution: "1080P",
    duration: 5,
    ratio: "16:9",
    generateAudio: false,
    watermark: true,
    returnLastFrame: true,
  });
  assert.equal(body.resolution, "1080p");
  assert.equal(body.generate_audio, false);
  assert.equal(body.watermark, true);
  assert.equal(body.return_last_frame, true);
  assert.equal(body.duration, 5);
  assert.equal(body.ratio, "16:9");
  assert.equal("fps" in body, false);
});

test("Ark create body rejects resolution not in the official enum", () => {
  assert.throws(
    () =>
      buildArkVideoBody({
        model: "seedance",
        prompt: "p",
        resolution: "2k",
        duration: 5,
        ratio: "16:9",
      }),
    /Ark 官方视频 resolution 只接受 480p \/ 720p \/ 1080p \/ 4k/,
  );
});

test("DashScope wan2.6-i2v uses img_url for its first-frame contract", () => {
  const body = buildDashscopeVideoBody({
    model: "wan2.6-i2v",
    prompt: "p",
    imageUrl: "first",
    resolution: "720P",
  });
  const input = body.input as { img_url?: string; media?: unknown };
  assert.equal(input.img_url, "first");
  assert.equal("media" in input, false);
  assert.equal((body.parameters as { resolution?: string }).resolution, "720P");
});

test("DashScope wan2.6-i2v rejects lastFrameUrl instead of silently dropping it", () => {
  assert.throws(
    () =>
      buildDashscopeVideoBody({
        model: "wan2.6-i2v",
        prompt: "p",
        imageUrl: "first",
        lastFrameUrl: "last",
      }),
    /wan2\.6-i2v.*不支持尾帧.*lastFrameUrl/,
  );
});

test("DashScope known video families reject configurable fps instead of silently dropping it", () => {
  for (const model of ["wan2.6-t2v", "wan2.7-t2v", "wan3.0-video", "happyhorse-1.1-t2v"]) {
    assert.throws(
      () => buildDashscopeVideoBody({ model, prompt: "p", fps: 24 }),
      /DashScope.*fps.*固定|不支持.*fps/iu,
      model,
    );
  }
});

test("DashScope wan2.6 rejects an unknown ratio instead of falling back to 16:9", () => {
  assert.throws(
    () => buildDashscopeVideoBody({ model: "wan2.6-t2v", prompt: "p", ratio: "21:9", resolution: "720P" }),
    /wan2\.6.*ratio|画幅.*21:9|21:9.*不支持/iu,
  );
});

test("DashScope happyhorse rejects unsupported negativePrompt instead of dropping it", () => {
  assert.throws(
    () =>
      buildDashscopeVideoBody({
        model: "happyhorse-1.1-r2v",
        prompt: "p",
        imageUrls: ["https://example.test/a.png"],
        negativePrompt: "n",
      }),
    /HappyHorse.*negativePrompt|negative_prompt.*不支持/iu,
  );
});

test("DashScope wan2.7-t2v rejects boolean generateAudio instead of dropping it", () => {
  assert.throws(
    () => buildDashscopeVideoBody({ model: "wan2.7-t2v", prompt: "p", generateAudio: false }),
    /wan2\.7.*generateAudio|parameters\.audio.*不支持/iu,
  );
});

test("DashScope wan3.0-video sends official parameters.audio watermark seed prompt_extend", () => {
  assert.throws(
    () => buildDashscopeVideoBody({ model: "wan3.0-video", prompt: "p", negativePrompt: "n" }),
    /wan3.*negativePrompt|negative_prompt.*不支持/iu,
  );
  const body = buildDashscopeVideoBody({
    model: "wan3.0-video",
    prompt: "p",
    generateAudio: false,
    watermark: true,
    seed: 12345,
    promptExpansion: false,
  });
  const parameters = body.parameters as Record<string, unknown>;
  assert.equal(parameters.audio, false);
  assert.equal(parameters.watermark, true);
  assert.equal(parameters.seed, 12345);
  assert.equal(parameters.prompt_extend, false);
  assert.equal("negative_prompt" in (body.input as Record<string, unknown>), false);
});

test("DashScope wan2.7-r2v uses media reference_image and official parameter fields", () => {
  const body = buildDashscopeVideoBody({
    model: "wan2.7-r2v",
    prompt: "p",
    imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
    ratio: "16:9",
    resolution: "720P",
    duration: 10,
    watermark: true,
    seed: 7,
    promptExpansion: false,
    negativePrompt: "n",
  });
  const input = body.input as { media?: Array<{ type?: string; url?: string }>; negative_prompt?: string };
  assert.deepEqual(input.media, [
    { type: "reference_image", url: "https://example.test/a.png" },
    { type: "reference_image", url: "https://example.test/b.png" },
  ]);
  assert.equal(input.negative_prompt, "n");
  const parameters = body.parameters as Record<string, unknown>;
  assert.equal(parameters.ratio, "16:9");
  assert.equal(parameters.resolution, "720P");
  assert.equal(parameters.duration, 10);
  assert.equal(parameters.watermark, true);
  assert.equal(parameters.seed, 7);
  assert.equal(parameters.prompt_extend, false);
  assert.equal("audio" in parameters, false);
});

test("DashScope wan2.6-r2v uses reference_urls and size instead of media", () => {
  const body = buildDashscopeVideoBody({
    model: "wan2.6-r2v-flash",
    prompt: "p",
    imageUrls: ["https://example.test/a.png"],
    ratio: "16:9",
    resolution: "720P",
    generateAudio: false,
    watermark: true,
    seed: 9,
  });
  const input = body.input as { reference_urls?: string[]; media?: unknown };
  assert.deepEqual(input.reference_urls, ["https://example.test/a.png"]);
  assert.equal("media" in input, false);
  const parameters = body.parameters as Record<string, unknown>;
  assert.equal(parameters.size, "1280*720");
  assert.equal("ratio" in parameters, false);
  assert.equal(parameters.audio, false);
  assert.equal(parameters.watermark, true);
  assert.equal(parameters.seed, 9);
});

test("DashScope wan2.6-t2v puts negative_prompt in input and official extras in parameters", () => {
  const body = buildDashscopeVideoBody({
    model: "wan2.6-t2v",
    prompt: "p",
    ratio: "16:9",
    negativePrompt: "n",
    watermark: false,
    seed: 3,
    promptExpansion: true,
    audioUrl: "https://example.test/a.mp3",
  });
  const input = body.input as Record<string, unknown>;
  assert.equal(input.negative_prompt, "n");
  assert.equal(input.audio_url, "https://example.test/a.mp3");
  const parameters = body.parameters as Record<string, unknown>;
  assert.equal(parameters.size, "1280*720");
  assert.equal(parameters.watermark, false);
  assert.equal(parameters.seed, 3);
  assert.equal(parameters.prompt_extend, true);
  assert.equal("negative_prompt" in parameters, false);
});

test("DashScope wan2.7-i2v sends driving_audio and omits ratio", () => {
  const body = buildDashscopeVideoBody({
    model: "wan2.7-i2v",
    prompt: "p",
    imageUrl: "first",
    audioUrl: "https://example.test/a.mp3",
    watermark: true,
    seed: 4,
    promptExpansion: false,
  });
  const input = body.input as { media?: Array<{ type?: string; url?: string }> };
  assert.deepEqual(input.media, [
    { type: "first_frame", url: "first" },
    { type: "driving_audio", url: "https://example.test/a.mp3" },
  ]);
  const parameters = body.parameters as Record<string, unknown>;
  assert.equal("ratio" in parameters, false);
  assert.equal(parameters.watermark, true);
  assert.equal(parameters.seed, 4);
  assert.equal(parameters.prompt_extend, false);
});

test("xAI official R2V refuses more than 7 reference_images", () => {
  assert.throws(
    () =>
      buildXaiImagineVideoBody({
        model: "grok-imagine-video-1.5",
        prompt: "p",
        image_urls: Array.from({ length: 8 }, (_, index) => `https://example.test/${index}.png`),
      }),
    /最多 7 张|reference_images/,
  );
  const seven = buildXaiImagineVideoBody({
    model: "grok-imagine-video-1.5",
    prompt: "p",
    image_urls: Array.from({ length: 7 }, (_, index) => `https://example.test/${index}.png`),
  });
  assert.equal((seven.reference_images as unknown[]).length, 7);
});

test("xAI official validates duration, resolution, aspect ratio, and model-specific audio", () => {
  const base = { model: "grok-imagine-video-1.5", prompt: "p" };
  assert.throws(() => buildXaiImagineVideoBody({ ...base, duration: 16 }), /duration.*1.*15|1–15/iu);
  assert.throws(() => buildXaiImagineVideoBody({ ...base, resolution: "2k" }), /resolution.*480p.*720p.*1080p/iu);
  assert.throws(() => buildXaiImagineVideoBody({ ...base, aspect_ratio: "21:9" }), /aspect_ratio.*1:1.*16:9/iu);
  assert.throws(
    () => buildXaiImagineVideoBody({ model: "grok-imagine-video", prompt: "p", generateAudio: false }),
    /generate_audio.*1\.5|音频.*1\.5/iu,
  );
  assert.throws(
    () => buildXaiImagineVideoBody({ ...base, resolution: "1080p", image_urls: ["https://example.test/a.png"] }),
    /R2V.*720p|reference_images.*720p/iu,
  );
});

test("xAI relay preserves compatibility extensions without applying official enums", () => {
  const refs = Array.from({ length: 8 }, (_, index) => `https://example.test/${index}.png`);
  const body = buildXaiImagineVideoBody({
    model: "grok-imagine-video",
    prompt: "p",
    profile: "relay",
    duration: 16,
    resolution: "2k",
    aspect_ratio: "21:9",
    generateAudio: false,
    image_urls: refs,
  });
  assert.equal(body.duration, 16);
  assert.equal(body.resolution, "2k");
  assert.equal(body.aspect_ratio, "21:9");
  assert.equal(body.generate_audio, false);
  assert.deepEqual(body.image_urls, refs);
});

test("xAI official poll path stays /videos/{id} and create stays /videos/generations", () => {
  assert.equal(videoPollPath("xai-imagine", "req 1"), "/videos/req%201");
  assert.equal(
    officialAwareVideoCreatePath("xai-imagine", undefined, { baseUrl: "https://api.x.ai/v1" }),
    "/videos/generations",
  );
  assert.equal(
    officialAwareVideoCreatePath("xai-imagine", { videosCreate: "/videos" }, { baseUrl: "https://api.x.ai/v1" }),
    "/videos/generations",
  );
  assert.equal(
    videoPollPath("xai-imagine", "req 1", { videosPoll: "/videos/generations/{id}" }, { baseUrl: "https://api.x.ai/v1" }),
    "/videos/req%201",
  );
  assert.equal(
    officialAwareVideoCreatePath("xai-imagine", { videosCreate: "/custom/videos" }, { baseUrl: "https://superxihe.com/v1" }),
    "/custom/videos",
  );
});

test("official OpenAI JSON input_reference is one image_url object and rejects extras", () => {
  const body = buildOpenAiOfficialVideoBody({
    model: "sora-2",
    prompt: "p",
    first_frame: "https://example.test/a.png",
  });
  assert.deepEqual(body.input_reference, { image_url: "https://example.test/a.png" });
  assert.equal("file_id" in (body.input_reference as Record<string, unknown>), false);
  assert.equal(typeof body.input_reference, "object");
  assert.equal(Array.isArray(body.input_reference), false);
  assert.throws(
    () => buildOpenAiOfficialVideoBody({
      model: "sora-2",
      prompt: "p",
      first_frame: "https://example.test/a.png",
      image_urls: ["https://example.test/c.png"],
    }),
    /OpenAI 官方.*image_urls|input_reference/iu,
  );
});

test("official OpenAI retrieve-then-content skips content fetch when a file URL is already present", () => {
  assert.equal(
    planCustomerVideoContentFetch({
      baseUrl: "https://api.openai.com/v1",
      protocol: "openai-compat",
      taskId: "vid-1",
      task: { status: "completed", file_urls: ["https://cdn.example/a.mp4"] },
    }),
    null,
  );
  assert.equal(
    planCustomerVideoContentFetch({
      baseUrl: "https://api.openai.com/v1",
      protocol: "openai-compat",
      taskId: "vid-1",
      task: { status: "in_progress" },
    }),
    null,
  );
});

test("Civitai customer create and poll always use the official workflow paths", () => {
  const options = { baseUrl: "https://orchestration.civitai.com/v2/consumer", protocol: "civitai" };
  assert.equal(
    officialAwareVideoCreatePath("civitai", { videosCreate: "/videoGen" }, options),
    "/workflows?wait=0",
  );
  assert.equal(
    videoPollPath("civitai", "wf 1", { videosPoll: "/videoGen/{id}" }, options),
    "/workflows/wf%201?wait=0",
  );
});

test("Civitai customer builder emits the official videoGen workflow body", () => {
  const request = buildCustomerVideoStudioRequest({
    adapterType: "civitai-orchestration",
    model: "ltx2.3",
    baseUrl: "https://orchestration.civitai.com/v2/consumer",
    protocol: "civitai",
    prompt: "p",
    duration: 5,
    ratio: "16:9",
    first_frame: "https://example.test/first.png",
  });
  assert.equal(request.adapter, "civitai");
  assert.equal(request.path, "/workflows?wait=0");
  assert.deepEqual(request.body, {
    allowMatureContent: true,
    currencies: ["yellow"],
    steps: [
      {
        $type: "videoGen",
        input: {
          engine: "ltx2.3",
          operation: "createVideo",
          model: "22b-distilled",
          prompt: "p",
          duration: 5,
          width: 1280,
          height: 720,
          fps: 24,
          images: ["https://example.test/first.png"],
        },
      },
    ],
  });
});

test("Civitai customer video forwards verified LTX and Hunyuan generation fields", () => {
  const ltx = buildCustomerVideoStudioRequest({
    adapterType: "civitai-orchestration",
    model: "ltx2.3",
    baseUrl: "https://orchestration.civitai.com/v2/consumer",
    protocol: "civitai",
    prompt: "p",
    duration: 6,
    ratio: "9:16",
    fps: 30,
    generateAudio: false,
    negative_prompt: "blur",
    seed: 17,
    steps: 32,
    guidance: 5.5,
    modelVariant: "22b-dev",
    width: 720,
    height: 1280,
  });
  const ltxInput = (ltx.body.steps as Array<{ input: Record<string, unknown> }>)[0]!.input;
  assert.equal(ltxInput.duration, 6);
  assert.equal(ltxInput.fps, 30);
  assert.equal(ltxInput.generateAudio, false);
  assert.equal(ltxInput.negativePrompt, "blur");
  assert.equal(ltxInput.seed, 17);
  assert.equal(ltxInput.numInferenceSteps, 32);
  assert.equal(ltxInput.guidanceScale, 5.5);
  assert.equal(ltxInput.model, "22b-dev");
  assert.equal(ltxInput.width, 720);
  assert.equal(ltxInput.height, 1280);

  const hunyuan = buildCustomerVideoStudioRequest({
    adapterType: "civitai-orchestration",
    model: "hunyuan",
    baseUrl: "https://orchestration.civitai.com/v2/consumer",
    protocol: "civitai",
    prompt: "p",
    duration: 12,
    ratio: "1:1",
    fps: 25,
    seed: 22,
    steps: 40,
    guidance: 6,
    width: 480,
    height: 480,
  });
  const hunyuanInput = (hunyuan.body.steps as Array<{ input: Record<string, unknown> }>)[0]!.input;
  assert.equal(hunyuanInput.duration, 12);
  assert.equal(hunyuanInput.frameRate, 25);
  assert.equal(hunyuanInput.seed, 22);
  assert.equal(hunyuanInput.steps, 40);
  assert.equal(hunyuanInput.cfgScale, 6);
  assert.equal(hunyuanInput.width, 480);
  assert.equal(hunyuanInput.height, 480);

  assert.throws(
    () => buildCustomerVideoStudioRequest({
      adapterType: "civitai-orchestration",
      model: "hunyuan",
      prompt: "p",
      negative_prompt: "stale",
    }),
    /Hunyuan.*negative|负面提示词.*不支持/iu,
  );
});

test("Civitai customer poll plans GetBlob for a nested completed workflow", () => {
  const task = {
    status: "succeeded",
    steps: [{ output: { video: { id: "blob_1", url: "https://signed.example/video.mp4" } } }],
  } as unknown as NonNullable<Parameters<typeof planCustomerVideoContentFetch>[0]["task"]>;
  assert.deepEqual(
    planCustomerVideoContentFetch({
      adapterType: "civitai",
      baseUrl: "https://orchestration.civitai.com/v2/consumer",
      protocol: "civitai",
      taskId: "wf 1",
      task,
    }),
    { method: "GET", path: "/blobs/blob_1?workflowId=wf%201" },
  );
});
