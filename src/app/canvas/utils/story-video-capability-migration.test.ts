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

const { migrateIdleStoryVideoOperations } = await import("./story-video-capability-migration.ts");
const { resolveVideoModelCapability } = await import("../../../services/api/video-model-capabilities.ts");
const asNode = (node: Record<string, unknown>) => node as never;

const grokProvider = {
  id: "preset-grok",
  adapterType: "xai-imagine",
  baseUrl: "https://api.x.ai/v1",
};
const grokCapability = () => resolveVideoModelCapability({
  model: "grok-imagine-video-1.5",
  provider: grokProvider,
});

test("idle Story placeholders inherit Grok R2V without touching locked boxes", () => {
  const workflow = {
    id: "wf-1",
    type: "seedance2_workflow",
    title: "工作流",
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    metadata: {
      seedanceModel: "grok-imagine-video-1.5",
      modelProviderId: "preset-grok",
      videoGenerationScope: {
        providerId: "preset-grok",
        model: "grok-imagine-video-1.5",
        operation: "image-to-video",
      },
    },
  };
  const idle = {
    id: "ph-idle",
    type: "video",
    title: "第1镜",
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    metadata: {
      seedanceWorkflowRole: "placeholder",
      seedanceWorkflowNodeId: "wf-1",
      status: "idle",
      videoGenerationScope: {
        providerId: "preset-grok",
        model: "grok-imagine-video-1.5",
        operation: "image-to-video",
      },
    },
  };
  const locked = {
    id: "ph-locked",
    type: "video",
    title: "第2镜",
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    metadata: {
      seedanceWorkflowRole: "placeholder",
      seedanceWorkflowNodeId: "wf-1",
      status: "success",
      content: "data:video/mp4,done",
      seedanceTaskId: "task-1",
      videoGenerationScope: {
        providerId: "preset-grok",
        model: "grok-imagine-video-1.5",
        operation: "image-to-video",
      },
    },
  };
  const standalone = {
    id: "video-standalone",
    type: "video",
    title: "独立视频",
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    metadata: {
      videoGenerationScope: {
        providerId: "preset-grok",
        model: "grok-imagine-video-1.5",
        operation: "image-to-video",
      },
    },
  };

  const next = migrateIdleStoryVideoOperations({
    nodes: [asNode(workflow), asNode(idle), asNode(locked), asNode(standalone)],
    resolveWorkflow: () => ({
      capability: grokCapability(),
      providerId: "preset-grok",
      model: "grok-imagine-video-1.5",
      videoConfig: {},
    }),
  });

  assert.equal(next[0].metadata?.videoGenerationScope?.operation, "reference-to-video");
  assert.equal(next[0].metadata?.videoGenerationOperationMigration?.source, "auto-materials");
  assert.equal(next[1].metadata?.videoGenerationScope?.operation, "reference-to-video");
  assert.equal(next[2].metadata?.videoGenerationScope?.operation, "image-to-video");
  assert.equal(next[3].metadata?.videoGenerationScope?.operation, "image-to-video");
});

test("user-selected Story I2V is left alone", () => {
  const workflow = {
    id: "wf-1",
    type: "seedance2_workflow",
    title: "工作流",
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    metadata: {
      seedanceModel: "grok-imagine-video-1.5",
      modelProviderId: "preset-grok",
      videoGenerationScope: {
        providerId: "preset-grok",
        model: "grok-imagine-video-1.5",
        operation: "image-to-video",
      },
      videoGenerationOperationMigration: {
        version: 1,
        source: "user-selection",
        providerId: "preset-grok",
        model: "grok-imagine-video-1.5",
        operation: "image-to-video",
      },
    },
  };
  const next = migrateIdleStoryVideoOperations({
    nodes: [asNode(workflow)],
    resolveWorkflow: () => ({
      capability: grokCapability(),
      providerId: "preset-grok",
      model: "grok-imagine-video-1.5",
      videoConfig: {},
    }),
  });
  assert.equal(next[0].metadata?.videoGenerationScope?.operation, "image-to-video");
  assert.equal(next[0].metadata?.videoGenerationOperationMigration?.source, "user-selection");
});
