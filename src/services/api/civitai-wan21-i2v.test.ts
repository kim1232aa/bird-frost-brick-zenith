import { register } from "node:module";
import assert from "node:assert/strict";
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

const { buildCivitaiVideoWorkflow } = await import("./civitai-orchestration.ts");
const { CIVITAI_FALLBACK_SERVICES, resolveCivitaiService } = await import("./civitai-services.ts");
const { resolveCivitaiVideoMediaContract } = await import("./civitai-video-media-contract.ts");

const SERVICE_ID = "video/wan/v2.1/civitai";
const SOURCE_IMAGE = "https://example.test/wan21-source.png";

test("WAN 2.1 Civitai exposes I2V and serializes the official images[] contract", () => {
  const service = resolveCivitaiService(SERVICE_ID, CIVITAI_FALLBACK_SERVICES);
  assert.ok(service);
  assert.deepEqual(service.modalities.input, ["text", "image"]);
  assert.deepEqual(service.parameters, {
    version: "v2.1",
    provider: "civitai",
    engine: "wan",
  });

  const contract = resolveCivitaiVideoMediaContract(SERVICE_ID);
  assert.ok(contract);
  assert.equal(contract.profileId, "civitai-i2v");
  assert.deepEqual(contract.referenceKinds, ["first_frame"]);
  assert.equal(contract.imageMaximum, 1);

  const workflow = buildCivitaiVideoWorkflow({
    model: SERVICE_ID,
    service,
    prompt: "A subject moves naturally",
    referenceKind: "first_frame",
    images: [SOURCE_IMAGE],
    generationParameters: {
      duration: 5,
      fps: 24,
      dimensions: "480x480",
      steps: 20,
      guidance: 4,
    },
  });
  assert.deepEqual(workflow.steps[0].input, {
    version: "v2.1",
    provider: "civitai",
    engine: "wan",
    prompt: "A subject moves naturally",
    images: [SOURCE_IMAGE],
    duration: 5,
    frameRate: 24,
    steps: 20,
    cfgScale: 4,
    width: 480,
    height: 480,
  });
  assert.equal("sourceImage" in workflow.steps[0].input, false);
  assert.equal("operation" in workflow.steps[0].input, false);
});
