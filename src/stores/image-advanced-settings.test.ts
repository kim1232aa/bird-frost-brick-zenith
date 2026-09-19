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

const { resolveImageModelCapability } = await import("@/services/api/image-model-capabilities");
const { imageAdvancedSettingsToRequest } = await import("./image-advanced-settings.ts");

const falCapability = resolveImageModelCapability({
  model: "flux-lora",
  operation: "generate",
  provider: { adapterType: "fal" },
});

test("Fal advanced settings preserve explicit direct LoRA paths", () => {
  const request = imageAdvancedSettingsToRequest(
    {
      loras: [
        { resource: "https://example.test/style.safetensors", resourceKind: "url", weight: 0.75 },
        { resource: "hf://org/another-style", resourceKind: "url", weight: 1 },
      ],
    },
    falCapability.advancedFields,
    { provider: "fal", model: "flux-lora" },
  );
  assert.deepEqual(request.loras, {
    "https://example.test/style.safetensors": 0.75,
    "hf://org/another-style": 1,
  });
});

test("Fal advanced settings reject duplicate direct LoRA paths", () => {
  assert.throws(
    () => imageAdvancedSettingsToRequest(
      {
        loras: [
          { resource: "https://example.test/style.safetensors", resourceKind: "url", weight: 0.75 },
          { resource: "https://example.test/style.safetensors", resourceKind: "url", weight: 1 },
        ],
      },
      falCapability.advancedFields,
      { provider: "fal", model: "flux-lora" },
    ),
    /重复|duplicate/i,
  );
});

test("Civitai advanced settings reject URL LoRA entries instead of looking them up", () => {
  assert.throws(
    () => imageAdvancedSettingsToRequest(
      { loras: [{ resource: "https://example.test/style.safetensors", resourceKind: "url", weight: 1 }] },
      falCapability.advancedFields,
      { provider: "civitai", model: "flux-lora" },
    ),
    /Civitai|直链|URL/i,
  );
});
