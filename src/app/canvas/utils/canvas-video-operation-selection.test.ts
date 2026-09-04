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
      try { return await nextResolve(target + suffix, context); } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

const {
  autoWorkflowVideoOperationForMaterials,
  resolveStandaloneVideoOperation,
  resolveWorkflowVideoOperationSelection,
} = await import("./canvas-video-operation-selection.ts");
const { resolveVideoModelCapability } = await import("../../../services/api/video-model-capabilities.ts");

const grokProvider = {
  id: "preset-grok",
  adapterType: "xai-imagine",
  baseUrl: "https://api.x.ai/v1",
};
const grokCapability = () => resolveVideoModelCapability({
  model: "grok-imagine-video-1.5",
  provider: grokProvider,
});

test("Story auto-migration upgrades unmarked Grok I2V to R2V", () => {
  const selection = resolveWorkflowVideoOperationSelection({
    capability: grokCapability(),
    providerId: "preset-grok",
    model: "grok-imagine-video-1.5",
    savedScope: {
      providerId: "preset-grok",
      model: "grok-imagine-video-1.5",
      operation: "image-to-video",
    },
    allowLegacyStoryAutoMigration: true,
  });
  assert.equal(selection.operation, "reference-to-video");
  assert.equal(selection.migrationSource, "auto-materials");
});

test("user-selected Story I2V is not auto-upgraded", () => {
  const selection = resolveWorkflowVideoOperationSelection({
    capability: grokCapability(),
    providerId: "preset-grok",
    model: "grok-imagine-video-1.5",
    savedScope: {
      providerId: "preset-grok",
      model: "grok-imagine-video-1.5",
      operation: "image-to-video",
    },
    allowLegacyStoryAutoMigration: true,
    savedOperationMigrationSource: "user-selection",
  });
  assert.equal(selection.operation, "image-to-video");
  assert.equal(selection.migrationSource, "user-selection");
});

test("standalone video nodes do not inherit Story auto R2V", () => {
  const selection = resolveWorkflowVideoOperationSelection({
    capability: grokCapability(),
    providerId: "preset-grok",
    model: "grok-imagine-video-1.5",
  });
  assert.equal(selection.operation, undefined);
  assert.equal(selection.requiresSelection, true);
});

test("Grok current-shot materials auto-select R2V, not I2V", () => {
  const selection = autoWorkflowVideoOperationForMaterials({
    capability: grokCapability(),
    materials: { totalShots: 5, shotsWithImage: 5 },
  });
  assert.equal(selection.operation, "reference-to-video");
});

test("standalone persisted I2V still wins when valid", () => {
  const operation = resolveStandaloneVideoOperation({
    capability: grokCapability(),
    persistedOperation: "image-to-video",
    hasConnectedImage: true,
  });
  assert.equal(operation, "image-to-video");
});
