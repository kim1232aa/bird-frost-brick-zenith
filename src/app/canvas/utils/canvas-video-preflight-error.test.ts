import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVideoPlaceholderPreflightError,
  isVideoNodeGenerating,
  isVideoNodeSucceeded,
  settleVideoPlaceholderPreflightMetadata,
} from "./canvas-video-preflight-error.ts";
import { resolveVideoReferenceSlotContract } from "../../../services/api/video-reference-slot-contract.ts";
import { resolveVideoModelCapability } from "../../../services/api/video-model-capabilities.ts";

const idlePlaceholderNode = (overrides: Record<string, any> = {}) => ({
  id: "placeholder-1",
  type: "video",
  metadata: {
    status: "idle",
    errorDetails: "",
    seedanceWorkflowRole: "placeholder",
    seedanceWorkflowNodeId: "wf-1",
    seedanceShotIndex: 1,
    seedanceStoryShotId: "shot_001",
    model: "grok-imagine-video",
    modelProviderId: "preset-grok-relay",
    ...overrides,
  },
});

const generatingPlaceholderNode = (overrides: Record<string, any> = {}) => ({
  id: "placeholder-generating",
  type: "video",
  metadata: {
    status: "loading",
    errorDetails: "",
    seedanceWorkflowRole: "placeholder",
    seedanceWorkflowNodeId: "wf-1",
    seedanceShotIndex: 1,
    seedanceStoryShotId: "shot_001",
    videoGenerationAttempt: {
      id: "attempt-1",
      kind: "native",
      provider: "customer",
      providerId: "preset-grok-relay",
      model: "grok-imagine-video",
      startedAt: "2026-09-23T04:00:00.000Z",
    },
    seedanceGenerationTaskState: {
      status: "generating",
      taskId: "task-live-1",
      startedAt: "2026-09-23T04:00:00.000Z",
      attemptId: "attempt-1",
    },
    ...overrides,
  },
});

const completedPlaceholderNode = (overrides: Record<string, any> = {}) => ({
  id: "placeholder-completed",
  type: "video",
  metadata: {
    status: "success",
    content: "https://example.com/rendered-video.mp4",
    errorDetails: "",
    seedanceWorkflowRole: "placeholder",
    seedanceWorkflowNodeId: "wf-1",
    seedanceShotIndex: 1,
    seedanceStoryShotId: "shot_001",
    model: "grok-imagine-video",
    ...overrides,
  },
});

test("提交前校验失败 → status 为 error 且 errorDetails 含原因", () => {
  const errorReason =
    "Grok 中转 / grok-imagine-video：当前 reference-to-video 至少需要 1 个普通参考图或参考视频";
  const node = idlePlaceholderNode();
  const nodes = [node];

  const { nodes: updatedNodes, modified } =
    applyVideoPlaceholderPreflightError(nodes, node.id, errorReason);

  assert.equal(modified, true);
  assert.equal(updatedNodes.length, 1);
  const updatedNode = updatedNodes[0] as any;
  assert.equal(updatedNode.metadata.status, "error");
  assert.equal(updatedNode.metadata.errorDetails, errorReason);
  assert.equal(
    updatedNode.metadata.seedanceGenerationTaskState?.status,
    "failed",
  );
  assert.equal(
    updatedNode.metadata.seedanceGenerationTaskState?.errorMessage,
    errorReason,
  );
  assert.equal(
    updatedNode.metadata.seedanceGenerationTaskState?.model,
    "grok-imagine-video",
  );
  assert.equal(
    updatedNode.metadata.seedanceGenerationTaskState?.providerId,
    "preset-grok-relay",
  );
  assert.equal(updatedNode.metadata.videoGenerationAttempt, undefined);
  assert.equal(updatedNode.metadata.videoGenerationTask, undefined);
  // 保留工作流占位框角色和分镜标识
  assert.equal(updatedNode.metadata.seedanceWorkflowRole, "placeholder");
  assert.equal(updatedNode.metadata.seedanceShotIndex, 1);
  assert.equal(updatedNode.metadata.seedanceStoryShotId, "shot_001");
});

test("生成中的节点不会被这条路径改写", () => {
  const errorReason = "某个提交前校验错误";

  // Case 1: status 为 loading
  const nodeLoading = generatingPlaceholderNode({ status: "loading" });
  assert.equal(isVideoNodeGenerating(nodeLoading.metadata), true);
  const res1 = applyVideoPlaceholderPreflightError(
    [nodeLoading],
    nodeLoading.id,
    errorReason,
  );
  assert.equal(res1.modified, false);
  assert.equal(res1.nodes[0].metadata.status, "loading");

  // Case 2: taskState.status 为 generating 且有 taskId
  const nodeTaskGen = generatingPlaceholderNode({
    status: "idle",
    seedanceGenerationTaskState: { status: "generating", taskId: "task-99" },
  });
  assert.equal(isVideoNodeGenerating(nodeTaskGen.metadata), true);
  const res2 = applyVideoPlaceholderPreflightError(
    [nodeTaskGen],
    nodeTaskGen.id,
    errorReason,
  );
  assert.equal(res2.modified, false);

  // Case 3: 有未完成的 videoGenerationAttempt
  const nodeAttempt = idlePlaceholderNode({
    videoGenerationAttempt: {
      id: "attempt-xyz",
      kind: "native",
      provider: "customer",
      model: "grok-imagine-video",
      startedAt: "2026-09-23T04:00:00.000Z",
    },
  });
  assert.equal(isVideoNodeGenerating(nodeAttempt.metadata), true);
  const res3 = applyVideoPlaceholderPreflightError(
    [nodeAttempt],
    nodeAttempt.id,
    errorReason,
  );
  assert.equal(res3.modified, false);

  // Case 4: 剧本分镜正在生成中 (storyGenerationStatus: "loading")
  const nodeStoryLoading = idlePlaceholderNode({
    storyGenerationStatus: "loading",
  });
  assert.equal(isVideoNodeGenerating(nodeStoryLoading.metadata), true);
  const res4 = applyVideoPlaceholderPreflightError(
    [nodeStoryLoading],
    nodeStoryLoading.id,
    errorReason,
  );
  assert.equal(res4.modified, false);
});

test("已经成功的节点不会被这条路径改写", () => {
  const errorReason = "某个提交前校验错误";

  // Case 1: status 为 success
  const nodeSuccess = completedPlaceholderNode({ status: "success" });
  assert.equal(isVideoNodeSucceeded(nodeSuccess.metadata), true);
  const res1 = applyVideoPlaceholderPreflightError(
    [nodeSuccess],
    nodeSuccess.id,
    errorReason,
  );
  assert.equal(res1.modified, false);
  assert.equal(res1.nodes[0].metadata.status, "success");

  // Case 2: 已有视频内容 URL (content)
  const nodeWithContent = idlePlaceholderNode({
    content: "https://example.com/video.mp4",
  });
  assert.equal(isVideoNodeSucceeded(nodeWithContent.metadata), true);
  const res2 = applyVideoPlaceholderPreflightError(
    [nodeWithContent],
    nodeWithContent.id,
    errorReason,
  );
  assert.equal(res2.modified, false);

  // Case 3: seedanceGenerationTaskState.status 为 success
  const nodeTaskSuccess = idlePlaceholderNode({
    seedanceGenerationTaskState: { status: "success", taskId: "done-1" },
  });
  assert.equal(isVideoNodeSucceeded(nodeTaskSuccess.metadata), true);
  const res3 = applyVideoPlaceholderPreflightError(
    [nodeTaskSuccess],
    nodeTaskSuccess.id,
    errorReason,
  );
  assert.equal(res3.modified, false);
});

test("真实场景验证：grok-imagine-video 在 reference-to-video 下缺少参考图时 blockedContract 理由能正确落到节点", () => {
  const relayProvider = {
    id: "preset-grok-relay",
    adapterType: "xai-imagine",
    baseUrl: "https://relay.example.com/v1",
    videoCapabilityProfiles: { "grok-imagine-video": "xai-imagine-video" },
  };
  const capability = resolveVideoModelCapability({
    model: "grok-imagine-video",
    provider: relayProvider,
  });

  // 无参考图调用 resolveVideoReferenceSlotContract
  const slotContract = resolveVideoReferenceSlotContract({
    capability,
    operation: "reference-to-video",
    references: [],
    videos: [],
  });

  assert.equal(slotContract.state, "blocked");
  assert.equal(
    slotContract.reason,
    "当前 reference-to-video 至少需要 1 个普通参考图或参考视频",
  );

  const formattedError = `Grok 中转 / grok-imagine-video：${slotContract.reason}`;
  const node = idlePlaceholderNode({
    model: "grok-imagine-video",
    modelProviderId: "preset-grok-relay",
  });

  const { nodes: updatedNodes, modified } =
    applyVideoPlaceholderPreflightError([node], node.id, formattedError);

  assert.equal(modified, true);
  assert.equal(updatedNodes[0].metadata.status, "error");
  assert.equal(
    updatedNodes[0].metadata.errorDetails,
    "Grok 中转 / grok-imagine-video：当前 reference-to-video 至少需要 1 个普通参考图或参考视频",
  );
  assert.equal(
    (updatedNodes[0].metadata as any).seedanceGenerationTaskState?.status,
    "failed",
  );
});
