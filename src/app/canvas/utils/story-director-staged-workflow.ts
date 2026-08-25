import type {
  StoryReferenceSnapshot,
  StoryStageError,
  StoryStageId,
  StoryStageRecord,
  StoryStagedDraft,
} from "../types";

export const STORY_STAGE_ORDER = [
  "requirements",
  "characters",
  "scenes",
  "props",
  "images",
  "storyboard",
  "videos",
] as const satisfies readonly StoryStageId[];

export type StoryStageRunTokenStore = {
  begin: (draftId: string, stageId: StoryStageId) => number;
  invalidate: (draftId: string, stageId: StoryStageId) => number;
  isCurrent: (draftId: string, stageId: StoryStageId, token: number) => boolean;
};

export function createStoryStageRunTokenStore(): StoryStageRunTokenStore {
  const tokens = new Map<string, number>();
  const key = (draftId: string, stageId: StoryStageId) => `${draftId}:${stageId}`;
  const increment = (draftId: string, stageId: StoryStageId) => {
    const next = (tokens.get(key(draftId, stageId)) || 0) + 1;
    tokens.set(key(draftId, stageId), next);
    return next;
  };
  return {
    begin: increment,
    invalidate: increment,
    isCurrent: (draftId, stageId, token) => tokens.get(key(draftId, stageId)) === token,
  };
}

const STAGE_DEPENDENTS: Readonly<Record<StoryStageId, readonly StoryStageId[]>> = {
  requirements: ["characters", "scenes", "props", "images", "storyboard", "videos"],
  characters: ["images", "storyboard", "videos"],
  scenes: ["images", "storyboard", "videos"],
  props: ["images", "storyboard", "videos"],
  images: ["storyboard", "videos"],
  storyboard: ["videos"],
  videos: [],
};

export type CreateStoryDraftInput = {
  sourceDirectorNodeId: string;
  baseNodeRevision: string;
  storyText: string;
  style?: string;
  aspectRatio?: string;
  shotCount?: number;
  durationSeconds?: number;
  audioRules?: string;
  imageQuality?: string;
  storyboardMode?: string;
  sourceNodeIds: string[];
};

type DraftOptions = { draftId?: string; now?: string };

const isoNow = () => new Date().toISOString();
const cloneDraft = (draft: StoryStagedDraft): StoryStagedDraft => structuredClone(draft);
const stageIndex = (stageId: StoryStageId) => STORY_STAGE_ORDER.indexOf(stageId);

export function createStoryStagedDraft(
  input: CreateStoryDraftInput,
  referenceSnapshots: StoryReferenceSnapshot[],
  options: DraftOptions = {},
): StoryStagedDraft {
  const now = options.now || isoNow();
  const draftId = options.draftId || crypto.randomUUID();
  return {
    draftId,
    sourceDirectorNodeId: input.sourceDirectorNodeId,
    baseNodeRevision: input.baseNodeRevision,
    status: "idle",
    currentStageId: "requirements",
    inputSnapshot: {
      storyText: input.storyText,
      style: input.style,
      aspectRatio: input.aspectRatio,
      shotCount: input.shotCount,
      durationSeconds: input.durationSeconds,
      audioRules: input.audioRules,
      imageQuality: input.imageQuality,
      storyboardMode: input.storyboardMode,
      sourceNodeIds: [...input.sourceNodeIds],
    },
    referenceSnapshots: structuredClone(referenceSnapshots),
    stages: STORY_STAGE_ORDER.map((id) => ({
      id,
      status: "pending",
      revision: 0,
      attempt: 0,
      taskIds: [],
      draftNodeIds: [],
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function startStoryStage(
  draft: StoryStagedDraft,
  stageId: StoryStageId,
  now = isoNow(),
): StoryStagedDraft {
  const next = cloneDraft(draft);
  const stage = next.stages.find((item) => item.id === stageId);
  if (!stage) throw new Error(`Unknown story stage: ${stageId}`);
  const missing = next.stages
    .slice(0, stageIndex(stageId))
    .find((item) => item.status !== "confirmed" && item.status !== "skipped");
  if (missing) throw new Error(`Story stage ${missing.id} must be confirmed first`);
  if (!["pending", "paused", "failed", "needs_regeneration", "awaiting_review", "retrying"].includes(stage.status)) {
    throw new Error(`Story stage ${stageId} cannot start from ${stage.status}`);
  }
  stage.status = "running";
  stage.error = undefined;
  stage.updatedAt = now;
  next.currentStageId = stageId;
  next.status = "running";
  next.updatedAt = now;
  return next;
}

export function completeStoryStage(
  draft: StoryStagedDraft,
  stageId: StoryStageId,
  output: unknown,
  options: { rawOutput?: string; prompt?: string; taskIds?: string[]; draftNodeIds?: string[]; now?: string } = {},
): StoryStagedDraft {
  const now = options.now || isoNow();
  const next = cloneDraft(draft);
  const stage = next.stages.find((item) => item.id === stageId);
  if (!stage) throw new Error(`Unknown story stage: ${stageId}`);
  stage.status = "awaiting_review";
  stage.output = structuredClone(output);
  stage.rawOutput = options.rawOutput;
  stage.prompt = options.prompt || stage.prompt;
  stage.taskIds = Array.from(new Set([...stage.taskIds, ...(options.taskIds || [])]));
  stage.draftNodeIds = Array.from(new Set([...stage.draftNodeIds, ...(options.draftNodeIds || [])]));
  stage.revision += 1;
  stage.error = undefined;
  stage.updatedAt = now;
  next.status = "awaiting_review";
  next.updatedAt = now;
  return next;
}

export function confirmStoryStage(
  draft: StoryStagedDraft,
  stageId: StoryStageId,
  now = isoNow(),
): StoryStagedDraft {
  const next = cloneDraft(draft);
  const index = stageIndex(stageId);
  const stage = next.stages[index];
  const missing = next.stages.slice(0, index).find((item) => item.status !== "confirmed" && item.status !== "skipped");
  if (missing) throw new Error(`Story stage ${missing.id} must be confirmed first`);
  if (stage.status !== "awaiting_review") {
    throw new Error(`Story stage ${stageId} must be awaiting_review before confirmation`);
  }
  stage.status = "confirmed";
  stage.confirmedAt = now;
  stage.updatedAt = now;
  const following = next.stages[index + 1];
  if (following) {
    next.currentStageId = following.id;
    next.status = "idle";
  } else {
    next.status = "completed";
  }
  next.updatedAt = now;
  return next;
}

export function editStoryStage(
  draft: StoryStagedDraft,
  stageId: StoryStageId,
  output: unknown,
  now = isoNow(),
): StoryStagedDraft {
  const next = cloneDraft(draft);
  const stage = next.stages.find((item) => item.id === stageId);
  if (!stage) throw new Error(`Unknown story stage: ${stageId}`);
  stage.output = structuredClone(output);
  stage.status = "awaiting_review";
  stage.revision += 1;
  stage.confirmedAt = undefined;
  stage.updatedAt = now;
  for (const dependentId of STAGE_DEPENDENTS[stageId]) {
    const dependent = next.stages.find((item) => item.id === dependentId);
    if (
      dependent &&
      (dependent.status !== "pending" ||
        dependent.output !== undefined ||
        dependent.taskIds.length > 0 ||
        dependent.draftNodeIds.length > 0)
    ) {
      dependent.status = "needs_regeneration";
      dependent.updatedAt = now;
    }
  }
  next.currentStageId = stageId;
  next.status = "awaiting_review";
  next.updatedAt = now;
  return next;
}

export function pauseStoryStage(
  draft: StoryStagedDraft,
  stageId: StoryStageId,
  now = isoNow(),
): StoryStagedDraft {
  const next = cloneDraft(draft);
  const stage = next.stages.find((item) => item.id === stageId);
  if (!stage) throw new Error(`Unknown story stage: ${stageId}`);
  stage.status = "paused";
  stage.updatedAt = now;
  next.currentStageId = stageId;
  next.status = "paused";
  next.updatedAt = now;
  return next;
}

type RetryableError = Error & { retryable?: boolean; code?: string; taskId?: string; taskIds?: string[]; draftNodeIds?: string[] };

export type StoryStageOperationResult = {
  output: unknown;
  taskIds: string[];
  draftNodeIds: string[];
  rawOutput?: string;
};

export async function runStoryStageWithRetry(
  draft: StoryStagedDraft,
  stageId: StoryStageId,
  operation: (attempt: number) => Promise<StoryStageOperationResult>,
  options: { maxAutomaticRetries?: number; now?: () => string } = {},
): Promise<StoryStagedDraft> {
  const maxAttempts = 1 + (options.maxAutomaticRetries ?? 2);
  const getNow = options.now || isoNow;
  let next = startStoryStage(draft, stageId, getNow());
  const stage = () => next.stages.find((item) => item.id === stageId) as StoryStageRecord;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    stage().attempt = attempt;
    stage().status = attempt === 1 ? "running" : "retrying";
    stage().updatedAt = getNow();
    try {
      const result = await operation(attempt);
      return completeStoryStage(next, stageId, result.output, {
        rawOutput: result.rawOutput,
        taskIds: result.taskIds,
        draftNodeIds: result.draftNodeIds,
        now: getNow(),
      });
    } catch (caught) {
      const error = caught as RetryableError;
      const retryable = error.retryable !== false;
      const failure: StoryStageError = {
        code: error.code || "STAGE_GENERATION_FAILED",
        message: error.message || "Story stage generation failed",
        retryable,
        taskId: error.taskId,
        taskIds: error.taskIds || (error.taskId ? [error.taskId] : undefined),
        attempt,
        occurredAt: getNow(),
      };
      stage().error = failure;
      for (const taskId of error.taskIds || (error.taskId ? [error.taskId] : [])) {
        if (!stage().taskIds.includes(taskId)) stage().taskIds.push(taskId);
      }
      for (const nodeId of error.draftNodeIds || []) {
        if (!stage().draftNodeIds.includes(nodeId)) stage().draftNodeIds.push(nodeId);
      }
      if (!retryable || attempt === maxAttempts) {
        stage().status = "failed";
        next.status = "failed";
        next.updatedAt = getNow();
        return next;
      }
    }
  }
  return next;
}
