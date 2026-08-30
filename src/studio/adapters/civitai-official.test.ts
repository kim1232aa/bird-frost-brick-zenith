import assert from "node:assert/strict";
import test, { mock } from "node:test";

type ProxyCall = { path: string; method?: string; body?: unknown; timeoutMs?: number };
const proxyCalls: ProxyCall[] = [];
let proxyQueue: unknown[] = [];
let clockMs = 0;

mock.module("../generate/proxy.ts", {
  namedExports: {
    studioProxyJson: async (input: { path: string; method?: string; body?: unknown; timeoutMs?: number }) => {
      proxyCalls.push({ path: input.path, method: input.method, body: input.body, timeoutMs: input.timeoutMs });
      if (clockMs) clockMs += Math.max(1, Number(input.timeoutMs) || 1);
      if (!proxyQueue.length) throw new Error(`unexpected proxy call: ${input.method || "POST"} ${input.path}`);
      const next = proxyQueue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  },
});

import {
  civitaiAdapter,
  civitaiEngine,
  civitaiError,
  planCivitaiImageRequest,
  planCivitaiVideoRequest,
  readCivitaiMediaUrls,
  readCivitaiPollResult,
  readCivitaiWorkflowId,
} from "./civitai.ts";

const LORA_MAP = { "urn:air:flux1:lora:civitai:1@2": 0.8 } as const;
const CHECKPOINT = "urn:air:sdxl:checkpoint:civitai:111@222";

function stepInput(planned: { body: { steps: Array<{ input: Record<string, unknown> }> } }) {
  return planned.body.steps[0].input;
}

test("submit query keeps wait/whatif and omits allowMatureContent", () => {
  const image = planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p" });
  assert.equal(image.path, "/workflows?wait=60");
  assert.equal(image.path.includes("allowMatureContent"), false);
  assert.equal(image.path.includes("hideMatureContent"), false);
  assert.equal(image.body.allowMatureContent, true);
  assert.deepEqual(image.body.currencies, ["yellow"]);
  assert.equal(image.body.steps[0].$type, "imageGen");

  const video = planCivitaiVideoRequest({ model: "ltx2.3", prompt: "p" });
  assert.equal(video.path, "/workflows?wait=0");
  assert.equal(video.path.includes("allowMatureContent"), false);
  assert.equal(video.body.allowMatureContent, true);
  assert.equal(video.body.steps[0].$type, "videoGen");
  assert.equal(stepInput(video).model, "22b-distilled");
  assert.equal(stepInput(video).fps, 24);
  assert.equal("frameRate" in stepInput(video), false);

  const probe = planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p", whatif: true });
  assert.equal(probe.path, "/workflows?wait=0&whatif=true");
  assert.equal(probe.path.includes("allowMatureContent"), false);
});

test("SFW plans set allowMatureContent false and remove yellow-only currency", () => {
  const image = planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p", allowMatureContent: false });
  assert.equal(image.path, "/workflows?wait=60&hideMatureContent=true");
  assert.equal(image.body.allowMatureContent, false);
  assert.equal("currencies" in image.body, false);

  const whatif = planCivitaiImageRequest({
    model: "krea2-turbo",
    prompt: "p",
    allowMatureContent: false,
    whatif: true,
  });
  assert.equal(whatif.path, "/workflows?wait=0&whatif=true&hideMatureContent=true");
  assert.equal(whatif.body.allowMatureContent, false);
  assert.equal("currencies" in whatif.body, false);

  const video = planCivitaiVideoRequest({ model: "ltx2.3", prompt: "p", allowMatureContent: false });
  assert.equal(video.path, "/workflows?wait=0&hideMatureContent=true");
  assert.equal(video.body.allowMatureContent, false);
  assert.equal("currencies" in video.body, false);

  const explicitMature = planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p", allowMatureContent: true });
  assert.equal(explicitMature.path, "/workflows?wait=60");
  assert.equal(explicitMature.body.allowMatureContent, true);
  assert.deepEqual(explicitMature.body.currencies, ["yellow"]);
});

test("Z-Image uses ecosystem zImage and only createImage", () => {
  const input = stepInput(planCivitaiImageRequest({ model: "z-image-turbo", prompt: "p", n: 12 }));
  assert.equal(input.engine, "sdcpp");
  assert.equal(input.ecosystem, "zImage");
  assert.equal(input.operation, "createImage");
  assert.equal(input.quantity, 12);
  assert.equal("images" in input, false);
});

test("Z-Image rejects reference images instead of createVariant", () => {
  assert.throws(
    () =>
      planCivitaiImageRequest({
        model: "z-image-turbo",
        prompt: "p",
        imageUrl: "https://example.test/a.png",
      }),
    /createImage|参考图|createVariant/,
  );
});

test("Grok omits width/height, sends aspectRatio on create and quantity 1-4", () => {
  const input = stepInput(
    planCivitaiImageRequest({
      model: "civitai-grok",
      prompt: "p",
      width: 1280,
      height: 720,
      aspectRatio: "16:9",
      n: 4,
    }),
  );
  assert.equal(input.engine, "grok");
  assert.equal(input.operation, "createImage");
  assert.equal(input.aspectRatio, "16:9");
  assert.equal(input.quantity, 4);
  assert.equal("width" in input, false);
  assert.equal("height" in input, false);
});

test("Grok edit sends images 1-3 and omits aspectRatio", () => {
  const input = stepInput(
    planCivitaiImageRequest({
      model: "civitai-grok",
      prompt: "p",
      aspectRatio: "16:9",
      imageUrls: ["https://example.test/a.png", "https://example.test/b.png", "https://example.test/c.png"],
    }),
  );
  assert.equal(input.operation, "editImage");
  assert.deepEqual(input.images, [
    "https://example.test/a.png",
    "https://example.test/b.png",
    "https://example.test/c.png",
  ]);
  assert.equal("aspectRatio" in input, false);
  assert.equal("width" in input, false);
});

test("Hunyuan sends frameRate and required cfgScale, never fps", () => {
  const input = stepInput(planCivitaiVideoRequest({ model: "hunyuan", prompt: "p", duration: 5, fps: 24 }));
  assert.equal(input.engine, "hunyuan");
  assert.equal(input.frameRate, 24);
  assert.equal(input.cfgScale, 4);
  assert.equal("fps" in input, false);
  assert.equal("images" in input, false);
  assert.equal(stepInput(planCivitaiVideoRequest({ model: "hunyuan", prompt: "p" })).frameRate, 25);
});

test("Hunyuan is text-to-video only", () => {
  assert.throws(
    () =>
      planCivitaiVideoRequest({
        model: "hunyuan",
        prompt: "p",
        imageUrl: "https://example.test/a.png",
      }),
    /文生|参考图|T2V|纯/,
  );
});

test("LTX firstLastFrameToVideo uses firstFrame/lastFrame and not images", () => {
  const input = stepInput(
    planCivitaiVideoRequest({
      model: "ltx2.3",
      prompt: "p",
      imageUrl: "https://example.test/first.png",
      lastFrameUrl: "https://example.test/last.png",
    }),
  );
  assert.equal(input.engine, "ltx2.3");
  assert.equal(input.operation, "firstLastFrameToVideo");
  assert.equal(input.firstFrame, "https://example.test/first.png");
  assert.equal(input.lastFrame, "https://example.test/last.png");
  assert.equal("images" in input, false);
});

test("LTX createVideo accepts at most one image", () => {
  const one = stepInput(
    planCivitaiVideoRequest({
      model: "ltx2.3",
      prompt: "p",
      imageUrl: "https://example.test/first.png",
    }),
  );
  assert.equal(one.operation, "createVideo");
  assert.deepEqual(one.images, ["https://example.test/first.png"]);
  assert.equal("firstFrame" in one, false);

  assert.throws(
    () =>
      planCivitaiVideoRequest({
        model: "ltx2.3",
        prompt: "p",
        imageUrl: "https://example.test/first.png",
        imageUrls: ["https://example.test/extra.png"],
      }),
    /1 张|最多/,
  );
});

test("readCivitaiWorkflowId prefers workflow id over jobs[0].id", () => {
  assert.equal(
    readCivitaiWorkflowId({
      id: "wf_abc",
      jobId: "job_x",
      jobs: [{ id: "job_1" }],
    }),
    "wf_abc",
  );
  assert.equal(
    readCivitaiWorkflowId({
      workflowId: "wf_from_alias",
      jobs: [{ id: "job_1" }],
    }),
    "wf_from_alias",
  );
  assert.equal(readCivitaiWorkflowId({ jobs: [{ id: "job_only" }] }), "job_only");
});

test("video output reads legacy top-level videos with official video fields, not job blobUrl", () => {
  const urls = readCivitaiMediaUrls({
    jobs: [{ result: { blobUrl: "https://example.test/job-blob.mp4" } }],
    videos: [{ url: "https://example.test/legacy-videos.mp4" }],
    steps: [
      {
        output: {
          video: { url: "https://example.test/official.mp4", available: true },
          additionalVideos: [{ url: "https://example.test/extra.mp4", available: true }],
        },
      },
    ],
  });
  assert.deepEqual(urls, [
    "https://example.test/official.mp4",
    "https://example.test/extra.mp4",
    "https://example.test/legacy-videos.mp4",
  ]);
  assert.equal(urls.includes("https://example.test/job-blob.mp4"), false);
});

test("video output reads legacy steps[].output.videos[]", () => {
  const urls = readCivitaiMediaUrls({
    steps: [
      {
        output: {
          videos: [{ url: "https://example.test/legacy-step-video.mp4", available: true }],
        },
      },
    ],
  });
  assert.deepEqual(urls, ["https://example.test/legacy-step-video.mp4"]);
});

test("media output filters unavailable entries and deduplicates retained fields", () => {
  const urls = readCivitaiMediaUrls({
    images: [
      { url: "https://example.test/root-image.png", available: true },
      { url: "https://example.test/root-image.png", available: true },
      { url: "https://example.test/hidden-root-image.png", available: false },
    ],
    videos: [
      { url: "https://example.test/top-video.mp4", available: true },
      { url: "https://example.test/hidden-top-video.mp4", available: false },
    ],
    steps: [
      {
        output: {
          blobs: [
            { url: "https://example.test/blob.png", available: true },
            { url: "https://example.test/hidden-blob.png", available: false },
          ],
          video: { url: "https://example.test/hidden-video.mp4", available: false },
          additionalVideos: [
            { url: "https://example.test/additional.mp4", available: true },
            { url: "https://example.test/additional.mp4", available: true },
          ],
          videos: [
            { url: "https://example.test/step-video.mp4", available: true },
            { url: "https://example.test/hidden-step-video.mp4", available: false },
          ],
          images: [
            { url: "https://example.test/step-image.png", available: true },
            { url: "https://example.test/step-image.png", available: true },
          ],
        },
      },
    ],
  });
  assert.deepEqual(urls, [
    "https://example.test/blob.png",
    "https://example.test/additional.mp4",
    "https://example.test/step-video.mp4",
    "https://example.test/step-image.png",
    "https://example.test/root-image.png",
    "https://example.test/top-video.mp4",
  ]);
});

test("media output keeps baseline proxy image fields without job blobUrl", () => {
  const urls = readCivitaiMediaUrls({
    jobs: [{ result: { blobUrl: "https://example.test/job-blob.png" } }],
    data: [
      "https://example.test/data.png",
      { url: "https://example.test/hidden-data.png", available: false },
    ],
    output_images: [{ url: "https://example.test/output-images.png" }],
    outputImages: ["https://example.test/output-images-string.png"],
    urls: [{ image_url: "https://example.test/urls.png" }],
    outputs: [{ b64_json: "ZmFrZQ" }],
    output: { images: [{ url: "https://example.test/nested-output.png" }] },
    url: "https://example.test/root.png",
  });
  assert.deepEqual(urls, [
    "https://example.test/data.png",
    "https://example.test/output-images.png",
    "https://example.test/output-images-string.png",
    "https://example.test/urls.png",
    "data:image/png;base64,ZmFrZQ",
    "https://example.test/nested-output.png",
    "https://example.test/root.png",
  ]);
  assert.equal(urls.includes("https://example.test/job-blob.png"), false);
  assert.equal(urls.includes("https://example.test/hidden-data.png"), false);
});

test("poll treats official succeeded/failed/expired/canceled as terminal", () => {
  const completed = readCivitaiPollResult({
    status: "succeeded",
    steps: [{ output: { video: { url: "https://example.test/done.mp4", available: true } } }],
  });
  assert.deepEqual(completed, { status: "completed", url: "https://example.test/done.mp4" });
  assert.equal(readCivitaiPollResult({ status: "processing" }).status, "pending");
  assert.equal(readCivitaiPollResult({ status: "unassigned" }).status, "pending");
  assert.equal(readCivitaiPollResult({ status: "failed" }).status, "failed");
  assert.equal(readCivitaiPollResult({ status: "expired" }).status, "failed");
  assert.equal(readCivitaiPollResult({ status: "canceled" }).status, "failed");
  assert.equal(readCivitaiPollResult({ status: "cancelled" }).status, "failed");
  assert.equal(readCivitaiPollResult({ status: "succeeded" }).status, "failed");
});

test("LoRA map is forwarded for krea/flux1/z-image/sdxl/anima/flux2-klein/ltx", () => {
  const krea = stepInput(planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p", loras: LORA_MAP }));
  assert.deepEqual(krea.loras, LORA_MAP);

  const flux1 = stepInput(
    planCivitaiImageRequest({ model: "flux1", prompt: "p", checkpointAir: CHECKPOINT, loras: LORA_MAP }),
  );
  assert.deepEqual(flux1.loras, LORA_MAP);
  assert.equal(flux1.model, CHECKPOINT);

  const zImage = stepInput(planCivitaiImageRequest({ model: "z-image-turbo", prompt: "p", loras: LORA_MAP }));
  assert.deepEqual(zImage.loras, LORA_MAP);

  const sdxl = stepInput(
    planCivitaiImageRequest({ model: "sdxl", prompt: "p", checkpointAir: CHECKPOINT, loras: LORA_MAP }),
  );
  assert.deepEqual(sdxl.loras, LORA_MAP);

  const anima = stepInput(planCivitaiImageRequest({ model: "anima", prompt: "p", loras: LORA_MAP }));
  assert.deepEqual(anima.loras, LORA_MAP);

  const klein = stepInput(planCivitaiImageRequest({ model: "flux2-klein", prompt: "p", loras: LORA_MAP }));
  assert.deepEqual(klein.loras, LORA_MAP);

  const ltx = stepInput(planCivitaiVideoRequest({ model: "ltx2.3", prompt: "p", loras: LORA_MAP }));
  assert.deepEqual(ltx.loras, LORA_MAP);
});

test("LoRA array conversion for flux2-dev and hunyuan", () => {
  const dev = stepInput(planCivitaiImageRequest({ model: "flux2-dev", prompt: "p", loras: LORA_MAP }));
  assert.deepEqual(dev.loras, [{ air: "urn:air:flux1:lora:civitai:1@2", strength: 0.8 }]);
  assert.equal(Object.keys((dev.loras as Array<Record<string, unknown>>)[0]).join(","), "air,strength");

  const hunyuan = stepInput(planCivitaiVideoRequest({ model: "hunyuan", prompt: "p", loras: LORA_MAP }));
  assert.deepEqual(hunyuan.loras, [{ air: "urn:air:flux1:lora:civitai:1@2", strength: 0.8 }]);
  assert.equal(Object.keys((hunyuan.loras as Array<Record<string, unknown>>)[0]).join(","), "air,strength");
});

test("official LoRA objects only expose air/strength and reject empty AIR", () => {
  const map = stepInput(planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p", loras: LORA_MAP }));
  assert.deepEqual(map.loras, LORA_MAP);
  assert.equal("clipStrength" in (map.loras as object), false);
  assert.equal("weight" in (map.loras as object), false);

  const array = stepInput(planCivitaiImageRequest({ model: "flux2-dev", prompt: "p", loras: LORA_MAP }))
    .loras as Array<Record<string, unknown>>;
  assert.deepEqual(Object.keys(array[0]).sort(), ["air", "strength"]);
  assert.equal("clipStrength" in array[0], false);
  assert.equal("weight" in array[0], false);
  assert.equal("model" in array[0], false);

  assert.throws(
    () => planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p", loras: { "": 0.8 } }),
    /AIR|urn:air/,
  );
  assert.throws(
    () => planCivitaiImageRequest({ model: "flux2-dev", prompt: "p", loras: { "  ": 1 } }),
    /AIR|urn:air/,
  );
});

test("Flux 2 Dev ImageGenInputLora strength is 0-4; Hunyuan VideoGenInputLora has no official max", () => {
  const zero = stepInput(
    planCivitaiImageRequest({ model: "flux2-dev", prompt: "p", loras: { "urn:air:flux2:lora:civitai:1@2": 0 } }),
  );
  assert.deepEqual(zero.loras, [{ air: "urn:air:flux2:lora:civitai:1@2", strength: 0 }]);
  const max = stepInput(
    planCivitaiImageRequest({ model: "flux2-dev", prompt: "p", loras: { "urn:air:flux2:lora:civitai:1@2": 4 } }),
  );
  assert.deepEqual(max.loras, [{ air: "urn:air:flux2:lora:civitai:1@2", strength: 4 }]);
  assert.throws(
    () =>
      planCivitaiImageRequest({
        model: "flux2-dev",
        prompt: "p",
        loras: { "urn:air:flux2:lora:civitai:1@2": 4.1 },
      }),
    /0–4|0-4|strength/,
  );
  assert.throws(
    () =>
      planCivitaiImageRequest({
        model: "flux2-dev",
        prompt: "p",
        loras: { "urn:air:flux2:lora:civitai:1@2": -0.1 },
      }),
    /0–4|0-4|strength/,
  );

  const hunyuan = stepInput(
    planCivitaiVideoRequest({
      model: "hunyuan",
      prompt: "p",
      loras: { "urn:air:hyv1:lora:civitai:1@2": 1.5 },
    }),
  );
  assert.deepEqual(hunyuan.loras, [{ air: "urn:air:hyv1:lora:civitai:1@2", strength: 1.5 }]);
});

test("engines without LoRA reject extra.loras", () => {
  assert.throws(() => planCivitaiImageRequest({ model: "flux2-pro", prompt: "p", loras: LORA_MAP }), /LoRA/);
  assert.throws(() => planCivitaiImageRequest({ model: "qwen-3.0-pro", prompt: "p", loras: LORA_MAP }), /LoRA/);
  assert.throws(() => planCivitaiImageRequest({ model: "seedream-4.5", prompt: "p", loras: LORA_MAP }), /LoRA/);
  assert.throws(() => planCivitaiImageRequest({ model: "seedream-5.0-pro", prompt: "p", loras: LORA_MAP }), /LoRA/);
  assert.throws(() => planCivitaiImageRequest({ model: "civitai-grok", prompt: "p", loras: LORA_MAP }), /LoRA/);
});

test("quantity clamps to official per-engine maxima", () => {
  assert.equal(stepInput(planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p", n: 12 })).quantity, 12);
  assert.equal(stepInput(planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p", n: 13 })).quantity, 12);
  assert.equal(stepInput(planCivitaiImageRequest({ model: "z-image-turbo", prompt: "p", n: 12 })).quantity, 12);
  assert.equal(stepInput(planCivitaiImageRequest({ model: "flux2-klein", prompt: "p", n: 5 })).quantity, 4);
  assert.equal(stepInput(planCivitaiImageRequest({ model: "qwen-3.0-pro", prompt: "p", n: 6 })).quantity, 6);
  assert.equal(stepInput(planCivitaiImageRequest({ model: "qwen-3.0-pro", prompt: "p", n: 7 })).quantity, 6);
  assert.equal(stepInput(planCivitaiImageRequest({ model: "civitai-grok", prompt: "p", n: 5 })).quantity, 4);
  assert.equal(stepInput(planCivitaiImageRequest({ model: "seedream-4.5", prompt: "p", n: 12 })).quantity, 12);
  assert.equal(
    stepInput(planCivitaiImageRequest({ model: "flux1", prompt: "p", checkpointAir: CHECKPOINT, n: 12 })).quantity,
    12,
  );
});

test("Krea turbo/raw use the official edit branch for up to two references", () => {
  const turbo = stepInput(planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p" }));
  assert.equal(turbo.model, "turbo");
  assert.equal(turbo.operation, "createImage");
  assert.equal("images" in turbo, false);

  const edit = stepInput(
    planCivitaiImageRequest({
      model: "krea2-raw",
      prompt: "p",
      n: 4,
      imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
    }),
  );
  assert.equal(edit.engine, "comfy");
  assert.equal(edit.ecosystem, "krea2");
  assert.equal(edit.model, "edit");
  assert.equal(edit.operation, "editImage");
  assert.deepEqual(edit.images, ["https://example.test/a.png", "https://example.test/b.png"]);
  assert.equal(edit.quantity, 4);

  assert.throws(
    () =>
      planCivitaiImageRequest({
        model: "krea2-turbo",
        prompt: "p",
        imageUrls: [
          "https://example.test/a.png",
          "https://example.test/b.png",
          "https://example.test/c.png",
        ],
      }),
    /2 张|最多/,
  );
});

test("Flux1 and SDXL require a checkpoint AIR and do not invent one", () => {
  assert.throws(() => planCivitaiImageRequest({ model: "flux1", prompt: "p" }), /AIR|checkpoint/);
  assert.throws(() => planCivitaiImageRequest({ model: "sdxl", prompt: "p" }), /AIR|checkpoint/);
  const sdxl = stepInput(planCivitaiImageRequest({ model: "sdxl", prompt: "p", checkpointAir: CHECKPOINT }));
  assert.equal(sdxl.model, CHECKPOINT);
  assert.equal(sdxl.operation, "createImage");
  assert.equal("images" in sdxl, false);
  assert.equal("image" in sdxl, false);
});

test("Flux1 and SDXL img2img uses createVariant.image, never images[]", () => {
  const flux1 = stepInput(
    planCivitaiImageRequest({
      model: "flux1",
      prompt: "p",
      checkpointAir: CHECKPOINT,
      imageUrl: "https://example.test/a.png",
      strength: 0.7,
    }),
  );
  assert.equal(flux1.operation, "createVariant");
  assert.equal(flux1.image, "https://example.test/a.png");
  assert.equal(flux1.denoiseStrength, 0.7);
  assert.equal("images" in flux1, false);

  const sdxl = stepInput(
    planCivitaiImageRequest({
      model: "sdxl",
      prompt: "p",
      checkpointAir: CHECKPOINT,
      imageUrl: "https://example.test/a.png",
    }),
  );
  assert.equal(sdxl.operation, "createVariant");
  assert.equal(sdxl.image, "https://example.test/a.png");
  assert.equal("images" in sdxl, false);

  assert.throws(
    () =>
      planCivitaiImageRequest({
        model: "flux1",
        prompt: "p",
        checkpointAir: CHECKPOINT,
        imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
      }),
    /1 张|createVariant/,
  );
});

test("Anima is sdcpp createImage only and rejects reference images", () => {
  const anima = stepInput(planCivitaiImageRequest({ model: "anima", prompt: "p", n: 12 }));
  assert.equal(anima.engine, "sdcpp");
  assert.equal(anima.ecosystem, "anima");
  assert.equal(anima.operation, "createImage");
  assert.equal(anima.quantity, 12);
  assert.equal("model" in anima, false);
  assert.equal("images" in anima, false);
  assert.throws(
    () =>
      planCivitaiImageRequest({
        model: "anima",
        prompt: "p",
        imageUrl: "https://example.test/a.png",
      }),
    /createImage|参考图/,
  );
});

test("Qwen 3.0 Pro sends required width/height and no LoRAs", () => {
  const input = stepInput(planCivitaiImageRequest({ model: "qwen-3.0-pro", prompt: "p", n: 6, width: 1328, height: 1328 }));
  assert.equal(input.engine, "qwen");
  assert.equal(input.model, "3.0-pro");
  assert.equal(input.width, 1328);
  assert.equal(input.height, 1328);
  assert.equal(input.quantity, 6);
  assert.equal("loras" in input, false);
  assert.equal(input.promptExtend, false);
});

test("Grok create includes official version v1.0", () => {
  const input = stepInput(planCivitaiImageRequest({ model: "civitai-grok", prompt: "p" }));
  assert.equal(input.version, "v1.0");
  assert.equal(input.engine, "grok");
});

test("LTX and Hunyuan keep official fps/frameRate and LoRA shapes", () => {
  const ltx = stepInput(planCivitaiVideoRequest({ model: "ltx2.3", prompt: "p", fps: 30, generateAudio: false, loras: LORA_MAP }));
  assert.equal(ltx.fps, 30);
  assert.equal(ltx.generateAudio, false);
  assert.deepEqual(ltx.loras, LORA_MAP);
  assert.equal("frameRate" in ltx, false);

  const hunyuan = stepInput(planCivitaiVideoRequest({ model: "hunyuan", prompt: "p", fps: 30, loras: LORA_MAP }));
  assert.equal(hunyuan.frameRate, 30);
  assert.equal("fps" in hunyuan, false);
  assert.deepEqual(hunyuan.loras, [{ air: "urn:air:flux1:lora:civitai:1@2", strength: 0.8 }]);
});

test("image output reads official steps[].output.blobs[] and keeps named media fields", () => {
  const urls = readCivitaiMediaUrls({
    steps: [
      {
        output: {
          blobs: [{ url: "https://example.test/blob.png" }],
          video: { url: "https://example.test/video.mp4", available: true },
          additionalVideos: [{ url: "https://example.test/additional.mp4", available: true }],
          images: [{ url: "https://example.test/image.png", available: true }],
        },
      },
    ],
  });
  assert.deepEqual(urls, [
    "https://example.test/blob.png",
    "https://example.test/video.mp4",
    "https://example.test/additional.mp4",
    "https://example.test/image.png",
  ]);
});

test("image output reads steps[].output.images and ignores job blobUrl", () => {
  const urls = readCivitaiMediaUrls({
    jobs: [{ result: { blobUrl: "https://example.test/job-blob.png" } }],
    steps: [
      {
        output: {
          images: [
            { url: "https://example.test/a.png", available: true },
            { url: "https://example.test/hidden.png", available: false },
          ],
        },
      },
    ],
  });
  assert.deepEqual(urls, ["https://example.test/a.png"]);
});

test("unknown Civitai model throws instead of falling back to Krea", () => {
  assert.throws(() => civitaiEngine("not-a-civitai-engine"), /未知|fallback|Krea/);
  assert.throws(() => planCivitaiImageRequest({ model: "flux-unknown", prompt: "p" }), /未知|fallback|Krea/);
  assert.throws(() => planCivitaiVideoRequest({ model: "wan-unknown", prompt: "p" }), /未知|fallback|Krea/);
  const krea = stepInput(planCivitaiImageRequest({ model: "krea2-turbo", prompt: "p" }));
  assert.equal(krea.model, "turbo");
  assert.equal(krea.ecosystem, "krea2");
});

test("Seedream forwards official seed", () => {
  const v45 = stepInput(planCivitaiImageRequest({ model: "seedream-4.5", prompt: "p", seed: 42 }));
  assert.equal(v45.engine, "seedream");
  assert.equal(v45.version, "v4.5");
  assert.equal(v45.seed, 42);
  const v50 = stepInput(planCivitaiImageRequest({ model: "seedream-5.0-pro", prompt: "p", seed: 7 }));
  assert.equal(v50.version, "v5.0-pro");
  assert.equal(v50.seed, 7);
  assert.equal("seed" in stepInput(planCivitaiImageRequest({ model: "seedream-4.5", prompt: "p" })), false);
});

test("Qwen 3.0 Pro sets promptExtend false to avoid implicit rewrite latency", () => {
  const input = stepInput(planCivitaiImageRequest({ model: "qwen-3.0-pro", prompt: "p" }));
  assert.equal(input.promptExtend, false);
});

test("video aspectRatio maps to official width/height", () => {
  const ltx169 = stepInput(planCivitaiVideoRequest({ model: "ltx2.3", prompt: "p", aspectRatio: "16:9" }));
  assert.equal(ltx169.width, 1280);
  assert.equal(ltx169.height, 720);
  const ltx916 = stepInput(planCivitaiVideoRequest({ model: "ltx2.3", prompt: "p", aspectRatio: "9:16" }));
  assert.equal(ltx916.width, 720);
  assert.equal(ltx916.height, 1280);
  const ltx11 = stepInput(planCivitaiVideoRequest({ model: "ltx2.3", prompt: "p", aspectRatio: "1:1" }));
  assert.equal(ltx11.width, 1024);
  assert.equal(ltx11.height, 1024);
  const hunyuan169 = stepInput(planCivitaiVideoRequest({ model: "hunyuan", prompt: "p", aspectRatio: "16:9" }));
  assert.equal(hunyuan169.width, 1280);
  assert.equal(hunyuan169.height, 720);
  const hunyuan916 = stepInput(planCivitaiVideoRequest({ model: "hunyuan", prompt: "p", aspectRatio: "9:16" }));
  assert.equal(hunyuan916.width, 480);
  assert.equal(hunyuan916.height, 854);
  const hunyuan11 = stepInput(planCivitaiVideoRequest({ model: "hunyuan", prompt: "p", aspectRatio: "1:1" }));
  assert.equal(hunyuan11.width, 480);
  assert.equal(hunyuan11.height, 480);
  const explicit = stepInput(
    planCivitaiVideoRequest({ model: "ltx2.3", prompt: "p", aspectRatio: "9:16", width: 1280, height: 720 }),
  );
  assert.equal(explicit.width, 1280);
  assert.equal(explicit.height, 720);
  assert.throws(
    () => planCivitaiVideoRequest({ model: "ltx2.3", prompt: "p", aspectRatio: "4:3" }),
    /aspectRatio|16:9|9:16/,
  );
  assert.throws(
    () => planCivitaiVideoRequest({ model: "hunyuan", prompt: "p", aspectRatio: "21:9" }),
    /aspectRatio|16:9|9:16/,
  );
});

test("civitaiError reads RFC7807 detail/title and steps[].output.errors", () => {
  assert.equal(
    civitaiError({
      type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
      title: "One or more validation errors occurred.",
      status: 400,
      detail: "steps[0].input.resolution is invalid",
    }),
    "steps[0].input.resolution is invalid",
  );
  assert.equal(
    civitaiError({
      title: "One or more validation errors occurred.",
      status: 400,
      errors: { "steps[0].input.resolution": ["The value '4k' is not valid for resolution."] },
    }),
    "steps[0].input.resolution: The value '4k' is not valid for resolution.",
  );
  assert.equal(
    civitaiError({
      status: "failed",
      steps: [{ output: { images: [], errors: ["safety filter", "blocked"] } }],
    }),
    "safety filter; blocked",
  );
  assert.match(
    civitaiError({
      status: "failed",
      steps: [{ jobs: [{ status: "failed", reason: "no_provider_available" }] }],
    }),
    /no_provider_available/,
  );
  assert.equal(civitaiError({ title: "Unauthorized" }), "Unauthorized");
});

test("image poll treats succeeded without blobs as terminal failure", () => {
  const result = readCivitaiPollResult({ status: "succeeded" }, "image");
  assert.equal(result.status, "failed");
  assert.match(String(result.error), /图片/);
});

const civitaiCtx = {
  provider: { id: "civitai", apiKey: "token", baseUrl: "https://orchestration.civitai.com/v2/consumer" },
};
const civitaiSfwCtx = {
  provider: { ...civitaiCtx.provider, allowMatureContent: false },
};

test.afterEach(() => {
  proxyCalls.length = 0;
  proxyQueue = [];
  clockMs = 0;
});

test("image wait=60 incomplete workflow continues polling by workflow id", async () => {
  proxyQueue = [
    { id: "wf_pending", status: "processing" },
    {
      id: "wf_pending",
      status: "succeeded",
      steps: [{ output: { images: [{ url: "https://example.test/done.png", available: true }] } }],
    },
  ];
  const result = await civitaiAdapter.generateImage!(civitaiCtx, { model: "krea2-turbo", prompt: "p" });
  assert.equal(result.url, "https://example.test/done.png");
  assert.equal(proxyCalls[0]?.path, "/workflows?wait=60");
  assert.equal(proxyCalls[0]?.method || "POST", "POST");
  assert.match(String(proxyCalls[1]?.path), /\/workflows\/wf_pending\?wait=/);
  assert.equal(proxyCalls[1]?.method, "GET");
});

test("SFW provider policy reaches static create body and image poll query", async () => {
  proxyQueue = [
    { id: "wf_sfw", status: "processing" },
    {
      id: "wf_sfw",
      status: "succeeded",
      steps: [{ output: { images: [{ url: "https://example.test/sfw.png", available: true }] } }],
    },
  ];
  const result = await civitaiAdapter.generateImage!(civitaiSfwCtx, { model: "krea2-turbo", prompt: "p" });
  assert.equal(result.url, "https://example.test/sfw.png");
  assert.equal(proxyCalls[0]?.path, "/workflows?wait=60&hideMatureContent=true");
  const body = proxyCalls[0]?.body as { allowMatureContent?: boolean; currencies?: unknown };
  assert.equal(body.allowMatureContent, false);
  assert.equal("currencies" in body, false);
  assert.equal(proxyCalls[1]?.path, "/workflows/wf_sfw?wait=30&hideMatureContent=true");
  assert.equal(proxyCalls[1]?.method, "GET");
});

test("SFW provider policy reaches static what-if body", async () => {
  proxyQueue = [{ id: "wf_whatif", status: "succeeded", steps: [], cost: { total: 0 } }];
  const result = await civitaiAdapter.testConnection!(civitaiSfwCtx);
  assert.equal(result.ok, true);
  assert.equal(proxyCalls[0]?.path, "/workflows?wait=0&whatif=true&hideMatureContent=true");
  const body = proxyCalls[0]?.body as { allowMatureContent?: boolean; currencies?: unknown };
  assert.equal(body.allowMatureContent, false);
  assert.equal("currencies" in body, false);
});

test("SFW video poll hides mature output URLs", async () => {
  proxyQueue = [
    {
      id: "wf_video_sfw",
      status: "succeeded",
      videos: [{ url: "https://example.test/sfw.mp4", available: true }],
    },
  ];
  const result = await civitaiAdapter.pollVideo!(civitaiSfwCtx, "wf_video_sfw");
  assert.deepEqual(result, { status: "completed", url: "https://example.test/sfw.mp4" });
  assert.equal(proxyCalls[0]?.path, "/workflows/wf_video_sfw?wait=0&hideMatureContent=true");
  assert.equal(proxyCalls[0]?.method, "GET");
});

test("video poll uses the shared parser for legacy video output", async () => {
  proxyQueue = [
    {
      id: "wf_video",
      status: "succeeded",
      videos: [{ url: "https://example.test/legacy-polled.mp4", available: true }],
    },
  ];
  const result = await civitaiAdapter.pollVideo!(civitaiCtx, "wf_video");
  assert.deepEqual(result, { status: "completed", url: "https://example.test/legacy-polled.mp4" });
  assert.equal(proxyCalls[0]?.path, "/workflows/wf_video?wait=0");
  assert.equal(proxyCalls[0]?.method, "GET");
});

test("image poll stops on official failed/expired/canceled instead of missing-image", async () => {
  proxyQueue = [
    { id: "wf_failed", status: "processing" },
    {
      id: "wf_failed",
      status: "failed",
      steps: [{ output: { images: [], errors: ["blocked by safety"] } }],
    },
  ];
  await assert.rejects(
    () => civitaiAdapter.generateImage!(civitaiCtx, { model: "krea2-turbo", prompt: "p" }),
    /blocked by safety/,
  );
  proxyCalls.length = 0;
  proxyQueue = [
    { id: "wf_expired", status: "processing" },
    { id: "wf_expired", status: "expired", title: "Workflow expired" },
  ];
  await assert.rejects(
    () => civitaiAdapter.generateImage!(civitaiCtx, { model: "krea2-turbo", prompt: "p" }),
    /expired|Workflow expired/,
  );
  proxyCalls.length = 0;
  proxyQueue = [
    { id: "wf_canceled", status: "processing" },
    { id: "wf_canceled", status: "canceled", title: "Workflow canceled" },
  ];
  await assert.rejects(
    () => civitaiAdapter.generateImage!(civitaiCtx, { model: "krea2-turbo", prompt: "p" }),
    /canceled|Workflow canceled/,
  );
});

test("image poll times out when workflow never finishes", async () => {
  const originalNow = Date.now;
  const originalSetTimeout = globalThis.setTimeout;
  clockMs = 1_000_000;
  Date.now = () => clockMs;
  globalThis.setTimeout = ((fn: TimerHandler, ms?: number) => {
    clockMs += Math.max(1, Number(ms) || 1);
    if (typeof fn === "function") queueMicrotask(() => fn());
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  proxyQueue = Array.from({ length: 8 }, () => ({ id: "wf_slow", status: "processing" }));
  try {
    await assert.rejects(
      () => civitaiAdapter.generateImage!(civitaiCtx, { model: "krea2-turbo", prompt: "p" }),
      /超时/,
    );
    assert.equal(proxyCalls.some((item) => /\/workflows\/wf_slow\?wait=/.test(String(item.path))), true);
  } finally {
    Date.now = originalNow;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("Flux2 Klein edit images max 2", () => {
  const two = stepInput(
    planCivitaiImageRequest({
      model: "flux2-klein",
      prompt: "p",
      imageUrls: ["https://example.test/a.png", "https://example.test/b.png"],
    }),
  );
  assert.equal(two.operation, "editImage");
  assert.equal((two.images as string[]).length, 2);
  assert.throws(
    () =>
      planCivitaiImageRequest({
        model: "flux2-klein",
        prompt: "p",
        imageUrls: [
          "https://example.test/a.png",
          "https://example.test/b.png",
          "https://example.test/c.png",
        ],
      }),
    /2 张|最多/,
  );
});
