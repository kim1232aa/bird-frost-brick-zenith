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
    model: "image/comfy/krea2/editImage",
    operation: "edit",
    provider,
    service: service(
      "image/comfy/krea2/editImage",
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
