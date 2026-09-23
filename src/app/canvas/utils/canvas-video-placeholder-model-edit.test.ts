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
  isEditableSeedance2VideoPlaceholder,
  isStandaloneSeedance2VideoPlaceholder,
  seedance2VideoPlaceholderModelPatch,
} = await import("./canvas-standalone-video-model.ts");
const { isVideoTaskSnapshotLocked, protectVideoTaskSnapshotPatch } = await import(
  "./canvas-video-task-edit-lock.ts"
);

/**
 * Mirrors the model/provider precedence `buildCustomerVideoApiConfig` applies in
 * canvas-client-page.tsx before it resolves the submit route: the saved
 * `videoGenerationScope` outranks `seedanceModel`/`model`. That precedence is why a
 * model switch that leaves the scope behind still submits the old model.
 */
function submittedSelection(metadata: Record<string, any>) {
  const scope = metadata.videoGenerationScope || {};
  const scopeModel = String(scope.model || "").trim();
  const model = scopeModel || String(metadata.seedanceModel || metadata.model || "").trim();
  const providerId =
    (scopeModel && model === scopeModel ? String(scope.providerId || "").trim() : "") ||
    String(metadata.modelProviderId || "").trim();
  return { providerId, model };
}

/** A workflow-placed placeholder as the story workflow writes it. */
function workflowPlaceholderMetadata(overrides: Record<string, any> = {}) {
  return {
    status: "idle",
    content: "",
    generationMode: "video",
    model: "agnes-video-v2.0",
    seedanceModel: "agnes-video-v2.0",
    modelProviderId: "preset-agnes-ai",
    videoGenerationScope: {
      providerId: "preset-agnes-ai",
      model: "agnes-video-v2.0",
      operation: "keyframes-to-video",
    },
    videoGenerationCapabilityId: "agnes:agnes-video-v2.0",
    videoGenerationSettings: { duration: 6, frames: 145, fps: 24 },
    videoGenerationOperationMigration: {
      version: 1,
      source: "auto-materials",
      providerId: "preset-agnes-ai",
      model: "agnes-video-v2.0",
      operation: "keyframes-to-video",
    },
    seedanceWorkflowRole: "placeholder",
    seedanceWorkflowNodeId: "seedance2_workflow-1790076939968-a9p70",
    seedanceWorkflowMode: "slice",
    seedanceShotIndex: 1,
    seedanceShotTitle: "第1镜",
    seedanceStoryShotId: "shot_001",
    seedanceStoryShotIndex: 1,
    seedanceStoryDirectorNodeId: "story_director-1790055246716-b9rz7",
    seedanceRequiredReferences: ["当前分镜图"],
    seedanceReferenceOrder: ["当前分镜图", "角色图", "场景图", "其它参考图"],
    seedanceReferenceSlotBindings: { current_shot: { nodeId: "img-1" } },
    ...overrides,
  };
}

const nextSelection = { providerId: "preset-grok-relay", model: "grok-imagine-video" };

test("a workflow-placed placeholder is editable; only a running task freezes it", () => {
  const workflowPlaceholder = workflowPlaceholderMetadata();

  // The old gate keyed on "has no workflow owner", which is exactly why the
  // workflow-placed card rendered a dead text label instead of the picker.
  assert.equal(isStandaloneSeedance2VideoPlaceholder(workflowPlaceholder), false);
  assert.equal(isEditableSeedance2VideoPlaceholder(workflowPlaceholder), true);
  assert.equal(isVideoTaskSnapshotLocked(workflowPlaceholder), false);
});

test("switching the model on an idle workflow placeholder is what the next submit uses", () => {
  const before = workflowPlaceholderMetadata();
  assert.deepEqual(submittedSelection(before), {
    providerId: "preset-agnes-ai",
    model: "agnes-video-v2.0",
  });

  const patch = seedance2VideoPlaceholderModelPatch(nextSelection);
  const accepted = protectVideoTaskSnapshotPatch(before, patch);
  const after = { ...before, ...accepted };

  assert.deepEqual(submittedSelection(after), nextSelection);
  assert.equal(after.model, "grok-imagine-video");
  assert.equal(after.seedanceModel, "grok-imagine-video");
  assert.equal(after.modelProviderId, "preset-grok-relay");
});

test("switching the model drops every snapshot bound to the previous model", () => {
  const after = {
    ...workflowPlaceholderMetadata(),
    ...seedance2VideoPlaceholderModelPatch(nextSelection),
  };

  assert.equal(after.videoGenerationScope, undefined);
  assert.equal(after.videoGenerationSettings, undefined);
  assert.equal(after.videoGenerationCapabilityId, undefined);
  assert.equal(after.videoWireFormat, undefined);
  // A stale migration marker still naming the old provider/model would let the
  // operation resolver re-adopt the previous model's operation.
  assert.equal(after.videoGenerationOperationMigration, undefined);
});

test("switching the model keeps the card inside its workflow", () => {
  const before = workflowPlaceholderMetadata();
  const after = { ...before, ...seedance2VideoPlaceholderModelPatch(nextSelection) };

  assert.equal(after.seedanceWorkflowRole, "placeholder");
  assert.equal(after.seedanceWorkflowNodeId, before.seedanceWorkflowNodeId);
  assert.equal(after.seedanceWorkflowMode, "slice");
  assert.equal(after.seedanceShotIndex, 1);
  assert.equal(after.seedanceShotTitle, "第1镜");
  assert.equal(after.seedanceStoryShotId, "shot_001");
  assert.equal(after.seedanceStoryShotIndex, 1);
  assert.equal(after.seedanceStoryDirectorNodeId, before.seedanceStoryDirectorNodeId);
  assert.deepEqual(after.seedanceRequiredReferences, ["当前分镜图"]);
  assert.deepEqual(after.seedanceReferenceOrder, before.seedanceReferenceOrder);
  assert.deepEqual(after.seedanceReferenceSlotBindings, before.seedanceReferenceSlotBindings);
  assert.equal(isEditableSeedance2VideoPlaceholder(after), true);
});

test("a placeholder with a running task refuses the model switch", () => {
  const generating = workflowPlaceholderMetadata({
    status: "loading",
    seedanceGenerationTaskState: {
      status: "generating",
      taskId: "task-1",
      startedAt: "2026-09-23T04:00:00.000Z",
      attemptId: "attempt-1",
    },
    videoGenerationAttempt: {
      id: "attempt-1",
      kind: "native",
      provider: "agnes",
      providerId: "preset-agnes-ai",
      model: "agnes-video-v2.0",
      startedAt: "2026-09-23T04:00:00.000Z",
    },
  });

  assert.equal(isVideoTaskSnapshotLocked(generating), true);

  const accepted = protectVideoTaskSnapshotPatch(
    generating,
    seedance2VideoPlaceholderModelPatch(nextSelection),
  );
  const after = { ...generating, ...accepted };

  assert.deepEqual(accepted, {});
  assert.deepEqual(submittedSelection(after), {
    providerId: "preset-agnes-ai",
    model: "agnes-video-v2.0",
  });
  assert.deepEqual(after.videoGenerationScope, generating.videoGenerationScope);
});

test("a settled task unlocks the placeholder again", () => {
  for (const settled of [
    { status: "error", seedanceGenerationTaskState: { status: "failed" } },
    { status: "success", seedanceGenerationTaskState: { status: "completed" } },
    { status: "idle", seedanceGenerationTaskState: { status: "timeout" } },
  ]) {
    const metadata = workflowPlaceholderMetadata(settled);
    assert.equal(isVideoTaskSnapshotLocked(metadata), false);
    const accepted = protectVideoTaskSnapshotPatch(
      metadata,
      seedance2VideoPlaceholderModelPatch(nextSelection),
    );
    assert.deepEqual(submittedSelection({ ...metadata, ...accepted }), nextSelection);
  }
});
