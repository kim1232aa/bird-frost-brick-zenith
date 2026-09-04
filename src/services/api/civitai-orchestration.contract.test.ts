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

const { buildCivitaiImageWorkflow, buildCivitaiVideoWorkflow } = await import("./civitai-orchestration.ts");

type ImageService = Parameters<typeof buildCivitaiImageWorkflow>[0]["service"];

function service(
  id: string,
  parameters: Record<string, string>,
  input: readonly string[] = ["text"],
): NonNullable<ImageService> {
  return {
    id,
    step: "imageGen",
    parameters,
    modalities: { input, output: ["image"] },
    status: "available",
  };
}

function inputOf(workflow: ReturnType<typeof buildCivitaiImageWorkflow>) {
  return workflow.steps[0].input as Record<string, unknown>;
}

const DEV_LORA = "urn:air:flux2:lora:civitai:2169780@2443422";
const WAN_LORA = "urn:air:wan:lora:civitai:123456@789012";

 test("Flux 2 Dev serializes logical LoRA map as the official air/strength array", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/flux2/dev/createImage",
      service: service("image/flux2/dev/createImage", { engine: "flux2", model: "dev", operation: "createImage" }),
      prompt: "p",
      quantity: 1,
      loras: { [DEV_LORA]: 0.8 },
    }),
  );

  assert.deepEqual(input.loras, [{ air: DEV_LORA, strength: 0.8 }]);
  assert.deepEqual(Object.keys((input.loras as Array<Record<string, unknown>>)[0]), ["air", "strength"]);
});

test("WAN image generation serializes LoRAs as the shared official air/strength array", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/wan/v2.7/fal/createImage",
      service: service("image/wan/v2.7/fal/createImage", {
        engine: "wan",
        version: "v2.7",
        provider: "fal",
        operation: "createImage",
      }),
      prompt: "p",
      quantity: 1,
      loras: { [WAN_LORA]: 1.2 },
    }),
  );

  assert.deepEqual(input.loras, [{ air: WAN_LORA, strength: 1.2 }]);
});

test("image LoRA array rejects strength outside the live 0..4 ImageGenInputLora range", () => {
  assert.throws(
    () =>
      buildCivitaiImageWorkflow({
        model: "image/flux2/dev/createImage",
        service: service("image/flux2/dev/createImage", { engine: "flux2", model: "dev", operation: "createImage" }),
        prompt: "p",
        quantity: 1,
        loras: { [DEV_LORA]: 4.1 },
      }),
    /strength|0.*4/,
  );
});

test("Z-Image Base and HiDream-O1 keep official map LoRA keys from the site-API air field", () => {
  const baseAir = "urn:air:zimagebase:lora:civitai:2186776@3042980";
  const o1Air = "urn:air:hidream-o1:lora:civitai:2647859@2973135";
  const base = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/sdcpp/zImage/base/createImage",
      service: service("image/sdcpp/zImage/base/createImage", {
        engine: "sdcpp",
        ecosystem: "zImage",
        model: "base",
        operation: "createImage",
      }),
      prompt: "p",
      quantity: 1,
      loras: { [baseAir]: 0.8 },
    }),
  );
  assert.deepEqual(base.loras, { [baseAir]: 0.8 });

  const o1 = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/comfy/hidream-o1/HiDream-O1-Image-dev/editImage",
      service: service(
        "image/comfy/hidream-o1/HiDream-O1-Image-dev/editImage",
        { engine: "comfy", ecosystem: "hidream-o1", model: "HiDream-O1-Image-dev", operation: "editImage" },
        ["text", "image"],
      ),
      prompt: "p",
      quantity: 1,
      images: ["https://example.test/source.png"],
      loras: { [o1Air]: 1 },
    }),
  );
  assert.deepEqual(o1.loras, { [o1Air]: 1 });
});

test("recipe zImage AIR is rejected on both Turbo and Base imageGen services", () => {
  const recipeAir = "urn:air:zImage:lora:civitai:123456@789012";
  assert.throws(
    () =>
      buildCivitaiImageWorkflow({
        model: "image/sdcpp/zImage/turbo/createImage",
        service: service("image/sdcpp/zImage/turbo/createImage", {
          engine: "sdcpp",
          ecosystem: "zImage",
          model: "turbo",
          operation: "createImage",
        }),
        prompt: "p",
        quantity: 1,
        loras: { [recipeAir]: 1 },
      }),
    /zimageturbo|不兼容/,
  );
  assert.throws(
    () =>
      buildCivitaiImageWorkflow({
        model: "image/sdcpp/zImage/base/createImage",
        service: service("image/sdcpp/zImage/base/createImage", {
          engine: "sdcpp",
          ecosystem: "zImage",
          model: "base",
          operation: "createImage",
        }),
        prompt: "p",
        quantity: 1,
        loras: { [recipeAir]: 1 },
      }),
    /zimagebase|不兼容/,
  );
});

test("fabricated OpenAI snapshot aliases are rejected as non-catalog services", () => {
  for (const model of ["gpt-image-2-2026-04-21", "chatgpt-image-latest"] as const) {
    const id = `image/openai/${model}/editImage`;
    const snapshotService = service(
      id,
      { engine: "openai", model, operation: "editImage" },
      ["text", "image"],
    );
    assert.throws(
      () => buildCivitaiImageWorkflow({
        model: id,
        service: snapshotService,
        prompt: "p",
        quantity: 1,
        images: ["https://example.test/source.png"],
      }),
      /服务目录|catalog|不支持/,
    );
  }
});

test("Krea FAL createImage maps connected references to imageStyleReferences and never images", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/fal/krea2/createImage",
      service: service("image/fal/krea2/createImage", { engine: "fal", model: "krea2", operation: "createImage" }),
      prompt: "p",
      quantity: 1,
      images: ["https://example.test/style.png"],
    }),
  );

  assert.deepEqual(input.imageStyleReferences, [{ imageUrl: "https://example.test/style.png" }]);
  assert.equal("images" in input, false);
});

test("Krea FAL createImage includes its required empty style-reference array", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/fal/krea2/createImage",
      service: service("image/fal/krea2/createImage", { engine: "fal", model: "krea2", operation: "createImage" }),
      prompt: "p",
      quantity: 1,
    }),
  );

  assert.deepEqual(input.imageStyleReferences, []);
  assert.equal("images" in input, false);
});

test("Krea FAL style references keep the official imageUrl/strength shape and range", () => {
  const options = {
    model: "image/fal/krea2/createImage",
    service: service("image/fal/krea2/createImage", { engine: "fal", model: "krea2", operation: "createImage" }),
    prompt: "p",
    quantity: 1,
    imageStyleReferences: [{ imageUrl: "https://example.test/style.png", strength: -2 }],
  };
  const input = inputOf(buildCivitaiImageWorkflow(options));

  assert.deepEqual(input.imageStyleReferences, options.imageStyleReferences);
  assert.throws(
    () => buildCivitaiImageWorkflow({ ...options, imageStyleReferences: [{ imageUrl: "https://example.test/style.png", strength: 2.1 }] }),
    /strength|-2.*2/,
  );
});

test("Comfy Krea edit keeps images[] and does not leak FAL style references or denoiseStrength", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/comfy/krea2/edit/editImage",
      service: service(
        "image/comfy/krea2/edit/editImage",
        { engine: "comfy", ecosystem: "krea2", model: "edit", operation: "editImage" },
        ["text", "image"],
      ),
      prompt: "p",
      quantity: 1,
      images: ["https://example.test/source.png"],
      strength: 0.7,
    }),
  );

  assert.equal(input.engine, "comfy");
  assert.equal(input.ecosystem, "krea2");
  assert.equal(input.model, "edit");
  assert.equal(input.operation, "editImage");
  assert.deepEqual(input.images, ["https://example.test/source.png"]);
  assert.equal("imageStyleReferences" in input, false);
  assert.equal("denoiseStrength" in input, false);
});

test("Flux2 Klein advanced fields are wired in the orchestration workflow", () => {
  const input = inputOf(buildCivitaiImageWorkflow({
    model: "image/flux2/klein/createImage/4b",
    service: service("image/flux2/klein/createImage/4b", { engine: "flux2", model: "klein", operation: "createImage" }),
    prompt: "p",
    quantity: 1,
    cfgScale: 5,
    steps: 20,
    negativePrompt: "bad",
    seed: 42,
    modelVersion: "4b",
  }));
  assert.equal(input.cfgScale, 5);
  assert.equal(input.steps, 20);
  assert.equal(input.negativePrompt, "bad");
  assert.equal(input.seed, 42);
  assert.equal(input.modelVersion, "4b");
  assert.throws(
    () => buildCivitaiImageWorkflow({
      model: "image/flux2/klein/createImage/4b",
      service: service("image/flux2/klein/createImage/4b", { engine: "flux2", model: "klein", operation: "createImage" }),
      prompt: "p",
      quantity: 5,
    }),
    /quantity.*4/,
  );
});

test("Flux2 Dev advanced fields are wired in the orchestration workflow", () => {
  const input = inputOf(buildCivitaiImageWorkflow({
    model: "image/flux2/dev/createImage",
    service: service("image/flux2/dev/createImage", { engine: "flux2", model: "dev", operation: "createImage" }),
    prompt: "p",
    quantity: 1,
    guidanceScale: 2.5,
    numInferenceSteps: 28,
    seed: 1,
  }));
  assert.equal(input.guidanceScale, 2.5);
  assert.equal(input.numInferenceSteps, 28);
  assert.equal(input.seed, 1);
  assert.throws(
    () => buildCivitaiImageWorkflow({
      model: "image/flux2/dev/createImage",
      service: service("image/flux2/dev/createImage", { engine: "flux2", model: "dev", operation: "createImage" }),
      prompt: "p",
      quantity: 1,
      negativePrompt: "bad",
    }),
    /negativePrompt|不支持高级/,
  );
});

test("sdcpp createVariant accepts loras map", () => {
  const input = inputOf(buildCivitaiImageWorkflow({
    model: "image/sdcpp/anima/createVariant",
    service: service("image/sdcpp/anima/createVariant", { engine: "sdcpp", ecosystem: "anima", model: "anima-v1", operation: "createVariant" }, ["text", "image"]),
    prompt: "p",
    quantity: 1,
    images: ["data:image/png;base64,abc"],
    loras: { "urn:air:anima:lora:civitai:1@2": 0.5 },
  }));
  assert.deepEqual(input.loras, { "urn:air:anima:lora:civitai:1@2": 0.5 });
});

test("Klein edit serializes images and maskImage", () => {
  const input = inputOf(buildCivitaiImageWorkflow({
    model: "image/flux2/klein/editImage/9b",
    service: service(
      "image/flux2/klein/editImage/9b",
      { engine: "flux2", model: "klein", operation: "editImage" },
      ["text", "image"],
    ),
    prompt: "p",
    quantity: 1,
    images: ["https://example.test/source.png"],
  }));
  assert.deepEqual(input.images, ["https://example.test/source.png"]);
});

test("Qwen API and Qwen20B edits infer dimensions from source images when omitted", () => {
  const source = "https://example.test/source.png";
  const qwenApi = inputOf(buildCivitaiImageWorkflow({
    model: "image/qwen/editImage/3.0-pro",
    service: service(
      "image/qwen/editImage/3.0-pro",
      { engine: "qwen", model: "3.0-pro", operation: "editImage" },
      ["text", "image"],
    ),
    prompt: "edit",
    quantity: 2,
    images: [source],
  }));
  assert.equal(qwenApi.quantity, 2);
  assert.deepEqual(qwenApi.images, [source]);
  assert.equal("width" in qwenApi, false);
  assert.equal("height" in qwenApi, false);

  const qwen20b = inputOf(buildCivitaiImageWorkflow({
    model: "image/sdcpp/qwen/20b/editImage",
    service: service(
      "image/sdcpp/qwen/20b/editImage",
      { engine: "sdcpp", ecosystem: "qwen", model: "20b", operation: "editImage" },
      ["text", "image"],
    ),
    prompt: "edit",
    quantity: 3,
    images: [source],
  }));
  assert.equal(qwen20b.quantity, 3);
  assert.deepEqual(qwen20b.images, [source]);
  assert.equal("width" in qwen20b, false);
  assert.equal("height" in qwen20b, false);

  assert.throws(
    () => buildCivitaiImageWorkflow({
      model: "image/qwen/editImage/3.0-pro",
      service: service(
        "image/qwen/editImage/3.0-pro",
        { engine: "qwen", model: "3.0-pro", operation: "editImage" },
        ["text", "image"],
      ),
      prompt: "edit",
      quantity: 7,
      images: [source],
    }),
    /quantity.*1\.\.6/,
  );
  assert.throws(
    () => buildCivitaiImageWorkflow({
      model: "image/sdcpp/qwen/20b/editImage",
      service: service(
        "image/sdcpp/qwen/20b/editImage",
        { engine: "sdcpp", ecosystem: "qwen", model: "20b", operation: "editImage" },
        ["text", "image"],
      ),
      prompt: "edit",
      quantity: 1,
      images: [source],
      width: 1025,
      height: 1024,
    }),
    /8 的倍数/,
  );
  assert.throws(
    () => buildCivitaiImageWorkflow({
      model: "image/qwen/editImage/3.0-pro",
      service: service(
        "image/qwen/editImage/3.0-pro",
        { engine: "qwen", model: "3.0-pro", operation: "editImage" },
        ["text", "image"],
      ),
      prompt: "edit",
      quantity: 1,
      images: [source],
      width: 1024,
    }),
    /width 和 height 必须同时提供/,
  );
});

test("sdcpp Flux2 Klein and Dev variants serialize their distinct official contracts", () => {
  const source = "https://example.test/source.png";
  const kleinAir = "urn:air:flux2:lora:civitai:2462105@2846977";
  const kleinService = service(
    "image/sdcpp/flux2Klein/createVariant/9b",
    { engine: "sdcpp", ecosystem: "flux2Klein", operation: "createVariant", modelVersion: "9b" },
    ["image"],
  );
  const klein = inputOf(buildCivitaiImageWorkflow({
    model: kleinService.id,
    service: kleinService,
    prompt: "variant prompt",
    quantity: 4,
    images: [source],
    strength: 0.6,
    loras: { [kleinAir]: 0.8 },
  }));
  assert.equal(klein.prompt, "variant prompt");
  assert.equal(klein.quantity, 4);
  assert.equal(klein.image, source);
  assert.equal(klein.strength, 0.6);
  assert.equal(klein.modelVersion, "9b");
  assert.deepEqual(klein.loras, { [kleinAir]: 0.8 });

  const devService = service(
    "image/sdcpp/flux2Dev/createVariant",
    { engine: "sdcpp", ecosystem: "flux2Dev", operation: "createVariant" },
    ["image"],
  );
  const dev = inputOf(buildCivitaiImageWorkflow({
    model: devService.id,
    service: devService,
    prompt: "variant prompt",
    quantity: 4,
    images: [source],
    strength: 0.7,
    loras: { [DEV_LORA]: 1.2 },
  }));
  assert.equal(dev.prompt, "variant prompt");
  assert.equal(dev.quantity, 4);
  assert.equal(dev.image, source);
  assert.equal(dev.strength, 0.7);
  assert.deepEqual(dev.loras, [{ air: DEV_LORA, strength: 1.2 }]);

  for (const variantService of [kleinService, devService]) {
    assert.throws(
      () => buildCivitaiImageWorkflow({
        model: variantService.id,
        service: variantService,
        prompt: "variant prompt",
        quantity: 5,
        images: [source],
      }),
      /quantity.*4/,
    );
  }
});

type VideoService = Parameters<typeof buildCivitaiVideoWorkflow>[0]["service"];

function videoService(id: string, parameters: Record<string, string>): NonNullable<VideoService> {
  return {
    id,
    step: "videoGen",
    parameters,
    modalities: { input: ["text"], output: ["video"] },
    status: "available",
  };
}

function videoInputOf(workflow: ReturnType<typeof buildCivitaiVideoWorkflow>) {
  return workflow.steps[0].input as Record<string, unknown>;
}

test("LTX 2.3 video LoRA preserves the complete AIR map without image compatibility rules", () => {
  const air = "urn:air:ltx2:lora:civitai:1@2+3.safetensor";
  const input = videoInputOf(buildCivitaiVideoWorkflow({
    model: "video/ltx2.3/createVideo",
    service: videoService("video/ltx2.3/createVideo", { engine: "ltx2.3", operation: "createVideo" }),
    prompt: "video",
    referenceKind: "none",
    images: [],
    generationParameters: {
      fps: 24,
      dimensions: "1280x720",
      steps: 20,
      guidance: 4,
      quantity: 1,
      modelVariant: "22b-dev",
      audio: true,
    },
    loras: { [air]: 0.75 },
  }));

  assert.deepEqual(input.loras, { [air]: 0.75 });
});

test("Hunyuan video LoRA uses an array and does not invent the image strength cap", () => {
  const air = "urn:air:hyv1:lora:civitai:1@2";
  const input = videoInputOf(buildCivitaiVideoWorkflow({
    model: "video/hunyuan",
    service: videoService("video/hunyuan", { engine: "hunyuan" }),
    prompt: "video",
    referenceKind: "none",
    images: [],
    generationParameters: {
      duration: 5,
      fps: 25,
      dimensions: "854x480",
      steps: 40,
      guidance: 4,
    },
    loras: { [air]: 4.5 },
  }));

  assert.deepEqual(input.loras, [{ air, strength: 4.5 }]);
});

test("WAN v2.2 Comfy video LoRA uses the live VideoGenInputLora array contract", () => {
  const air = "urn:air:wan:lora:civitai:1@2+3.safetensor";
  const input = videoInputOf(buildCivitaiVideoWorkflow({
    model: "video/wan/v2.2/comfy",
    service: videoService("video/wan/v2.2/comfy", { engine: "wan", version: "v2.2", provider: "comfy" }),
    prompt: "video",
    referenceKind: "none",
    images: [],
    generationParameters: {},
    loras: { [air]: 1.25 },
  }));

  assert.deepEqual(input.loras, [{ air, strength: 1.25 }]);
});
