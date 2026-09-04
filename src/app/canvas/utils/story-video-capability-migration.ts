import type { ResolvedVideoModelCapability } from "@/services/api/video-model-capabilities";
import {
  readVideoGenerationSettings,
  snapshotVideoWireFormat,
  type VideoGenerationSettings,
  type VideoGenerationSettingsScope,
  type VideoWireFormatSnapshot,
} from "@/stores/video-generation-settings";
import type { CanvasNodeData, CanvasNodeMetadata } from "../types";
import { isVideoTaskSnapshotLocked } from "./canvas-video-task-edit-lock";
import { resolveWorkflowVideoOperationSelection } from "./canvas-video-operation-selection";

export function isMigratableStoryVideoPlaceholder(
  node: CanvasNodeData,
  workflowId: string,
) {
  return (
    node.type === "video" &&
    node.metadata?.seedanceWorkflowRole === "placeholder" &&
    node.metadata?.seedanceWorkflowNodeId === workflowId &&
    !isVideoTaskSnapshotLocked(node.metadata)
  );
}

export function migrateIdleStoryVideoOperations(options: {
  nodes: CanvasNodeData[];
  resolveWorkflow: (workflow: CanvasNodeData) => {
    capability?: ResolvedVideoModelCapability;
    providerId: string;
    model: string;
    videoConfig: Parameters<typeof readVideoGenerationSettings>[0];
  } | undefined;
}): CanvasNodeData[] {
  let changed = false;
  const next = options.nodes.map((node) => node);
  options.nodes.forEach((workflow, workflowIndex) => {
    if (workflow.type !== "seedance2_workflow") return;
    const resolved = options.resolveWorkflow(workflow);
    if (!resolved?.capability || !resolved.providerId || !resolved.model) return;
    const selection = resolveWorkflowVideoOperationSelection({
      capability: resolved.capability,
      providerId: resolved.providerId,
      model: resolved.model,
      savedScope: workflow.metadata?.videoGenerationScope,
      savedCapabilityId: workflow.metadata?.videoGenerationCapabilityId,
      allowLegacyStoryAutoMigration: true,
      savedOperationMigrationSource: workflow.metadata?.videoGenerationOperationMigration?.source,
    });
    if (!selection.operation || selection.migrationSource === "user-selection") return;
    const currentScope = workflow.metadata?.videoGenerationScope;
    const currentSource = workflow.metadata?.videoGenerationOperationMigration?.source;
    const alreadyAligned =
      currentScope?.providerId === resolved.providerId &&
      currentScope?.model === resolved.model &&
      currentScope?.operation === selection.operation &&
      currentSource === (selection.migrationSource || currentSource);
    if (alreadyAligned) return;

    const scope: VideoGenerationSettingsScope = {
      providerId: resolved.providerId,
      model: resolved.model,
      operation: selection.operation,
    };
    const settings: VideoGenerationSettings = readVideoGenerationSettings(
      resolved.videoConfig,
      scope,
      resolved.capability,
    );
    const wireFormat: VideoWireFormatSnapshot | undefined = snapshotVideoWireFormat(settings, resolved.capability);
    const migration: NonNullable<CanvasNodeMetadata["videoGenerationOperationMigration"]> | undefined =
      selection.migrationSource
        ? {
            version: 1,
            source: selection.migrationSource,
            providerId: scope.providerId,
            model: scope.model,
            operation: scope.operation,
          }
        : undefined;
    const workflowPatch: Partial<CanvasNodeMetadata> = {
      videoGenerationSettings: settings,
      videoGenerationScope: scope,
      videoGenerationCapabilityId: resolved.capability.generationParameters.id,
      videoWireFormat: wireFormat,
      videoGenerationOperationMigration: migration,
    };
    next[workflowIndex] = {
      ...workflow,
      metadata: { ...workflow.metadata, ...workflowPatch },
    };
    changed = true;
    next.forEach((node, index) => {
      if (!isMigratableStoryVideoPlaceholder(node, workflow.id)) return;
      next[index] = {
        ...node,
        metadata: {
          ...node.metadata,
          model: workflow.metadata?.model || workflow.metadata?.seedanceModel,
          seedanceModel: workflow.metadata?.seedanceModel || workflow.metadata?.model,
          modelProviderId: workflow.metadata?.modelProviderId,
          ...workflowPatch,
        },
      };
    });
  });
  return changed ? next : options.nodes;
}
