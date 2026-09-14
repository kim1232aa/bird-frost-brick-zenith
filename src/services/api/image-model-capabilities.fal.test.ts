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

const fal = { adapterType: "fal", name: "Fal.ai" };

test("fal generate is supported for every preset image model", () => {
  for (const model of ["flux-2-pro", "flux-2-flex", "flux-2-flash", "flux-dev", "flux-schnell", "nano-banana", "nano-banana-pro", "seedream-4.5"]) {
    const capability = resolveImageModelCapability({ model, operation: "generate", provider: fal });
    assert.equal(capability.availability.state, "supported", model);
  }
});

test("fal edit is supported where the live edit endpoint probe returned 422 (endpoint exists)", () => {
  for (const model of ["flux-2-pro", "flux-2-flex", "flux-2-flash", "flux-dev", "nano-banana", "nano-banana-pro", "seedream-4.5"]) {
    const capability = resolveImageModelCapability({ model, operation: "edit", provider: fal });
    assert.equal(capability.availability.state, "supported", model);
    assert.equal(capability.referenceCount.state, "supported", model);
  }
});

test("fal flux-schnell edit is unsupported (no i2i/edit endpoint upstream)", () => {
  const capability = resolveImageModelCapability({ model: "flux-schnell", operation: "edit", provider: fal });
  assert.equal(capability.availability.state, "unsupported");
});

test("fal seed field: flux/seedream expose seed, nano-banana does not claim it", () => {
  assert.equal(resolveImageModelCapability({ model: "flux-dev", operation: "generate", provider: fal }).advancedFields.seed.state, "supported");
  assert.equal(resolveImageModelCapability({ model: "seedream-4.5", operation: "generate", provider: fal }).advancedFields.seed.state, "supported");
  assert.notEqual(resolveImageModelCapability({ model: "nano-banana", operation: "generate", provider: fal }).advancedFields.seed.state, "supported");
});

test("fal flux-dev edit takes exactly one reference (image_url), flux-2 edit takes an array", () => {
  const dev = resolveImageModelCapability({ model: "flux-dev", operation: "edit", provider: fal });
  assert.equal(dev.referenceCount.state, "supported");
  if (dev.referenceCount.state === "supported") {
    assert.equal(dev.referenceCount.min, 1);
    assert.equal(dev.referenceCount.max, 1);
  }
  const flux2 = resolveImageModelCapability({ model: "flux-2-pro", operation: "edit", provider: fal });
  if (flux2.referenceCount.state === "supported") {
    assert.equal(flux2.referenceCount.min, 1);
    assert.equal(flux2.referenceCount.max, null);
  } else {
    assert.fail("flux-2-pro edit should accept references");
  }
});

test("fal adapterType is recognized from explicit adapter and fal.run host", async () => {
  const mod = await import("./image-model-capabilities.ts");
  assert.equal(mod.nativeImageAdapterType({ adapterType: "fal" }), "fal");
  assert.equal(mod.nativeImageAdapterType({ baseUrl: "https://fal.run" }), "fal");
});
