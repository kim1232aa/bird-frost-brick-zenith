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

const { resolveImageModelCapability } = await import("./image-model-capabilities.ts");

type Service = NonNullable<Parameters<typeof resolveImageModelCapability>[0]["service"]>;

function service(id: string, parameters: Record<string, string>, input: readonly string[] = ["text"]): Service {
  return { id, step: "imageGen", parameters, modalities: { input, output: ["image"] } };
}

const provider = { adapterType: "civitai-orchestration", name: "Civitai" };

test("Flux 2 Dev capability exposes the array LoRA contract", () => {
  const capability = resolveImageModelCapability({
    model: "image/flux2/dev/createImage",
    operation: "generate",
    provider,
    service: service("image/flux2/dev/createImage", { engine: "flux2", model: "dev", operation: "createImage" }),
  });

  assert.equal(capability.advancedFields.loras.state, "supported");
  assert.equal(capability.advancedFields.loras.kind, "number-map");
  assert.equal(capability.advancedFields.loras.min, 0);
  assert.equal(capability.advancedFields.loras.max, 4);
  assert.equal(capability.serialization.referenceField, null);
});

test("WAN image capability exposes the shared array LoRA contract", () => {
  const capability = resolveImageModelCapability({
    model: "image/wan/v2.7/fal/createImage",
    operation: "generate",
    provider,
    service: service("image/wan/v2.7/fal/createImage", {
      engine: "wan",
      version: "v2.7",
      provider: "fal",
      operation: "createImage",
    }),
  });

  assert.equal(capability.advancedFields.loras.state, "supported");
  assert.equal(capability.advancedFields.loras.kind, "number-map");
  assert.equal(capability.advancedFields.loras.min, 0);
  assert.equal(capability.advancedFields.loras.max, 4);
});

test("Krea FAL capability uses the style-reference field and does not infer an edit operation", () => {
  const create = resolveImageModelCapability({
    model: "image/fal/krea2/createImage",
    operation: "generate",
    provider,
    service: service("image/fal/krea2/createImage", { engine: "fal", model: "krea2", operation: "createImage" }),
  });
  assert.deepEqual(create.referenceCount, {
    state: "supported",
    min: 0,
    max: 10,
    ordered: true,
    note: "Krea FAL imageStyleReferences maxItems=10",
  });
  assert.equal(create.serialization.referenceField, "imageStyleReferences[]");
  assert.equal(create.advancedFields.loras.state, "unsupported");

  const edit = resolveImageModelCapability({
    model: "image/fal/krea2/createImage",
    operation: "edit",
    provider,
    service: service("image/fal/krea2/createImage", { engine: "fal", model: "krea2", operation: "createImage" }, ["text", "image"]),
  });
  assert.equal(edit.availability.state, "unsupported");
});

test("Comfy Krea edit capability keeps its separate images[] max of two", () => {
  const capability = resolveImageModelCapability({
    model: "image/comfy/krea2/edit/editImage",
    operation: "edit",
    provider,
    service: service(
      "image/comfy/krea2/edit/editImage",
      { engine: "comfy", ecosystem: "krea2", model: "edit", operation: "editImage" },
      ["text", "image"],
    ),
  });

  assert.deepEqual(capability.referenceCount, {
    state: "supported",
    min: 1,
    max: 2,
    ordered: true,
    note: "Civitai Comfy krea2 editImage accepts 1-2 images",
  });
  assert.equal(capability.serialization.referenceField, "images[]");
});

test("Comfy Krea edit quantity follows the live OpenAPI max of 4, not the createImage 12", () => {
  const capability = resolveImageModelCapability({
    model: "image/comfy/krea2/edit/editImage",
    operation: "edit",
    provider,
    service: service(
      "image/comfy/krea2/edit/editImage",
      { engine: "comfy", ecosystem: "krea2", model: "edit", operation: "editImage" },
      ["text", "image"],
    ),
  });
  assert.equal(capability.outputCount.state, "supported");
  if (capability.outputCount.state !== "supported") return;
  assert.equal(capability.outputCount.max, 4);
});

test("Qwen API and Qwen20B keep separate quantity/reference limits", () => {
  const qwenApi = resolveImageModelCapability({
    model: "image/qwen/editImage/3.0-pro",
    operation: "edit",
    provider,
    service: service("image/qwen/editImage/3.0-pro", { engine: "qwen", model: "3.0-pro", operation: "editImage" }, ["text", "image"]),
  });
  assert.equal(qwenApi.outputCount.state, "supported");
  assert.equal(qwenApi.referenceCount.state, "supported");
  if (qwenApi.outputCount.state !== "supported" || qwenApi.referenceCount.state !== "supported") return;
  assert.equal(qwenApi.outputCount.max, 6);
  assert.equal(qwenApi.referenceCount.max, 3);

  const qwen20b = resolveImageModelCapability({
    model: "image/sdcpp/qwen/20b/editImage",
    operation: "edit",
    provider,
    service: service("image/sdcpp/qwen/20b/editImage", { engine: "sdcpp", ecosystem: "qwen", model: "20b", operation: "editImage" }, ["text", "image"]),
  });
  assert.equal(qwen20b.outputCount.state, "supported");
  assert.equal(qwen20b.referenceCount.state, "supported");
  if (qwen20b.outputCount.state !== "supported" || qwen20b.referenceCount.state !== "supported") return;
  assert.equal(qwen20b.outputCount.max, 12);
  assert.equal(qwen20b.referenceCount.max, 10);
});

test("Qwen API generate keeps the live OpenAPI quantity max of 6", () => {
  const capability = resolveImageModelCapability({
    model: "image/qwen/createImage/3.0-pro",
    operation: "generate",
    provider,
    service: service("image/qwen/createImage/3.0-pro", { engine: "qwen", model: "3.0-pro", operation: "createImage" }),
  });
  assert.equal(capability.outputCount.state, "supported");
  if (capability.outputCount.state !== "supported") return;
  assert.equal(capability.outputCount.max, 6);
});

test("Civitai OpenAI capability uses only the exact catalog service ID", () => {
  const id = "image/openai/gpt-image-2/editImage";
  const capability = resolveImageModelCapability({
    model: id,
    operation: "edit",
    provider,
    service: service(id, { engine: "openai", model: "gpt-image-2", operation: "editImage" }, ["text", "image"]),
  });
  assert.equal(capability.outputCount.state, "supported");
  assert.equal(capability.mask.state, "supported");
  if (capability.outputCount.state !== "supported") return;
  assert.equal(capability.outputCount.max, 4);

  const fabricatedId = "image/openai/gpt-image-2-2026-04-21/editImage";
  const fabricated = resolveImageModelCapability({
    model: fabricatedId,
    operation: "edit",
    provider,
    service: service(
      fabricatedId,
      { engine: "openai", model: "gpt-image-2-2026-04-21", operation: "editImage" },
      ["text", "image"],
    ),
  });
  assert.equal(fabricated.availability.state, "unknown");
  assert.equal(fabricated.outputCount.state, "unknown");
  assert.equal(fabricated.requiresExplicitProfile, true);
  assert.equal(fabricated.mask.state, "unsupported");
});

test("Civitai Z-Image Turbo and Base expose only their exact createImage contract", () => {
  for (const model of ["turbo", "base"] as const) {
    const createId = `image/sdcpp/zImage/${model}/createImage`;
    const create = resolveImageModelCapability({
      model: createId,
      operation: "generate",
      provider,
      service: service(createId, { engine: "sdcpp", ecosystem: "zImage", model, operation: "createImage" }),
    });
    assert.equal(create.id, "civitai-z-image-generate");
    assert.equal(create.outputCount.state, "supported");
    assert.equal(create.size.state, "supported");
    if (create.outputCount.state !== "supported" || create.size.state !== "supported" || create.size.kind !== "dimensions") continue;
    assert.equal(create.outputCount.max, 12);
    assert.equal(create.size.rules.minWidth, 64);
    assert.equal(create.size.rules.maxWidth, 2048);
    assert.equal(create.size.rules.multipleOf, 16);

    const editId = `image/sdcpp/zImage/${model}/editImage`;
    const edit = resolveImageModelCapability({
      model: editId,
      operation: "edit",
      provider,
      service: service(editId, { engine: "sdcpp", ecosystem: "zImage", model, operation: "editImage" }, ["text", "image"]),
    });
    assert.equal(edit.availability.state, "unsupported");
  }
});

test("Flux2 Klein capability exposes the official advanced fields", () => {
  const capability = resolveImageModelCapability({
    model: "image/flux2/klein/editImage/9b",
    operation: "edit",
    provider,
    service: service(
      "image/flux2/klein/editImage/9b",
      { engine: "flux2", model: "klein", operation: "editImage" },
      ["text", "image"],
    ),
  });
  const fields = capability.advancedFields;
  assert.equal(fields.negativePrompt.state, "supported");
  assert.equal(fields.steps.state, "supported");
  assert.equal(fields.cfgScale.state, "supported");
  assert.equal(fields.seed.state, "supported");
  assert.equal(fields.loras.state, "supported");
  if (
    fields.steps.state !== "supported" || fields.steps.kind !== "number"
    || fields.cfgScale.state !== "supported" || fields.cfgScale.kind !== "number"
  ) return;
  assert.equal(fields.steps.min, 4);
  assert.equal(fields.steps.max, 50);
  assert.equal(fields.cfgScale.min, 1);
  assert.equal(fields.cfgScale.max, 20);
});

test("Qwen API and Qwen20B allow source-inferred dimensions while preserving published bounds", () => {
  const qwenApi = resolveImageModelCapability({
    model: "image/qwen/editImage/3.0-pro",
    operation: "edit",
    provider,
    service: service("image/qwen/editImage/3.0-pro", { engine: "qwen", model: "3.0-pro", operation: "editImage" }, ["text", "image"]),
  });
  assert.equal(qwenApi.size.state, "supported");
  if (qwenApi.size.state !== "supported" || qwenApi.size.kind !== "dimensions") return;
  assert.equal(qwenApi.size.required, false);
  assert.equal(qwenApi.size.rules.minWidth, 512);
  assert.equal(qwenApi.size.rules.maxWidth, 2048);

  const qwen20b = resolveImageModelCapability({
    model: "image/sdcpp/qwen/20b/editImage",
    operation: "edit",
    provider,
    service: service("image/sdcpp/qwen/20b/editImage", { engine: "sdcpp", ecosystem: "qwen", model: "20b", operation: "editImage" }, ["text", "image"]),
  });
  assert.equal(qwen20b.size.state, "supported");
  if (qwen20b.size.state !== "supported" || qwen20b.size.kind !== "dimensions") return;
  assert.equal(qwen20b.size.required, false);
  assert.equal(qwen20b.size.rules.minWidth, 64);
  assert.equal(qwen20b.size.rules.multipleOf, 8);
});

test("sdcpp Flux2 Klein and Dev createVariant services keep the Flux2 quantity contract", () => {
  const klein = resolveImageModelCapability({
    model: "image/sdcpp/flux2Klein/createVariant/9b",
    operation: "variation",
    provider,
    service: service("image/sdcpp/flux2Klein/createVariant/9b", { engine: "sdcpp", ecosystem: "flux2Klein", operation: "createVariant", modelVersion: "9b" }, ["image"]),
  });
  assert.equal(klein.outputCount.state, "supported");
  assert.equal(klein.referenceCount.state, "supported");
  if (klein.outputCount.state !== "supported" || klein.referenceCount.state !== "supported") return;
  assert.equal(klein.outputCount.max, 4);
  assert.deepEqual(klein.referenceCount, { state: "supported", min: 1, max: 1, ordered: true });

  const dev = resolveImageModelCapability({
    model: "image/sdcpp/flux2Dev/createVariant",
    operation: "variation",
    provider,
    service: service("image/sdcpp/flux2Dev/createVariant", { engine: "sdcpp", ecosystem: "flux2Dev", operation: "createVariant" }, ["image"]),
  });
  assert.equal(dev.outputCount.state, "supported");
  if (dev.outputCount.state !== "supported") return;
  assert.equal(dev.outputCount.max, 4);
});

test("Flux2 Dev capability exposes the official array LoRA contract without invented fields", () => {
  const capability = resolveImageModelCapability({
    model: "image/flux2/dev/createImage",
    operation: "generate",
    provider,
    service: service("image/flux2/dev/createImage", { engine: "flux2", model: "dev", operation: "createImage" }),
  });
  const fields = capability.advancedFields;
  assert.equal(fields.loras.state, "supported");
  assert.equal(fields.loras.kind, "number-map");
  if (fields.loras.state !== "supported") return;
  assert.equal(fields.loras.min, 0);
  assert.equal(fields.loras.max, 4);
  assert.equal(fields.negativePrompt.state, "unsupported");
  assert.equal(fields.steps.state, "unsupported");
  assert.equal(fields.cfgScale.state, "unsupported");
  assert.equal(fields.seed.state, "supported");
});

test("dynamic Civitai service without an exact serializer remains discoverable but non-runnable", () => {
  const capability = resolveImageModelCapability({
    model: "image/fal/unknown/createImage",
    operation: "generate",
    provider,
    service: service("image/fal/unknown/createImage", { engine: "fal", model: "unknown", operation: "createImage" }),
  });

  assert.equal(capability.availability.state, "unknown");
  assert.equal(capability.requiresExplicitProfile, true);
  assert.match(capability.availability.reason, /serializer|合同|unknown|未知/);
});
