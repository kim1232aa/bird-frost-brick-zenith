import type { CanvasNodeMetadata, StoryReferenceSnapshot, StoryStageId, StoryStagedDraft } from "../types";
import type { StoryStageOperationResult } from "./story-director-staged-workflow";

export type StoryTextStagePayload = {
  kind: "text";
  draftId: string;
  stageId: "requirements" | "characters" | "scenes" | "props";
  prompt: string;
};

export type StoryMediaAssetPayload = {
  id: string;
  role: "character" | "scene" | "prop";
  prompt: string;
  referenceSnapshotIds: string[];
};

export type StoryGeneratedImageAsset = {
  assetId: string;
  nodeId: string;
  role: StoryMediaAssetPayload["role"];
  referenceSnapshotIds: string[];
};

export type StoryImagesStagePayload = {
  kind: "images";
  draftId: string;
  stageId: "images";
  assets: StoryMediaAssetPayload[];
  referenceSnapshots: StoryReferenceSnapshot[];
};

export type StoryStoryboardStagePayload = {
  kind: "storyboard";
  draftId: string;
  stageId: "storyboard";
  shotCount: number;
  requirements: unknown;
  characters: unknown;
  scenes: unknown;
  props: unknown;
  imageAssets: unknown;
  referenceSnapshots: StoryReferenceSnapshot[];
  prompt: string;
};

export type StoryVideosStagePayload = {
  kind: "videos";
  draftId: string;
  stageId: "videos";
  shots: Array<Record<string, unknown>>;
  imageAssets: unknown;
  referenceSnapshots: StoryReferenceSnapshot[];
};

export type StoryMediaStagePayload = StoryImagesStagePayload | StoryStoryboardStagePayload | StoryVideosStagePayload;
export type StoryStagePayload = StoryTextStagePayload | StoryMediaStagePayload;
export type StoryStageExecutor<TPayload extends StoryStagePayload> = (payload: TPayload) => Promise<StoryStageOperationResult>;
export type StoryStagePromptBuilder = (draft: StoryStagedDraft, stageId: StoryStageId) => string;
export type StoryResolvedReference = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
  storageKey?: string;
};

export type LocalStoryStageExecutors = {
  text: StoryStageExecutor<StoryTextStagePayload>;
  images: StoryStageExecutor<StoryImagesStagePayload>;
  storyboard: StoryStageExecutor<StoryStoryboardStagePayload>;
  videos: StoryStageExecutor<StoryVideosStagePayload>;
};

type LocalStoryStageExecutorCallbacks = {
  executeText: StoryStageExecutor<StoryTextStagePayload>;
  executeImages: StoryStageExecutor<StoryImagesStagePayload>;
  executeStoryboard: StoryStageExecutor<StoryStoryboardStagePayload>;
  executeVideos: StoryStageExecutor<StoryVideosStagePayload>;
};

export function createLocalStoryStageExecutors(callbacks: LocalStoryStageExecutorCallbacks): LocalStoryStageExecutors {
  return {
    text: callbacks.executeText,
    images: callbacks.executeImages,
    storyboard: callbacks.executeStoryboard,
    videos: callbacks.executeVideos,
  };
}

export async function resolveStoryReferenceSnapshots(
  snapshots: StoryReferenceSnapshot[],
  resolveStorageKey: (storageKey: string) => Promise<string | undefined>,
): Promise<StoryResolvedReference[]> {
  return Promise.all(snapshots.map(async (snapshot) => {
    const dataUrl = snapshot.content || (snapshot.storageKey ? await resolveStorageKey(snapshot.storageKey) : undefined);
    if (!dataUrl) throw new Error(`参考图快照 ${snapshot.snapshotId} 无法解析内容或存储键`);
    return {
      id: snapshot.snapshotId,
      name: snapshot.name,
      type: snapshot.mimeType,
      dataUrl,
      storageKey: snapshot.storageKey,
    };
  }));
}

export function buildStoryMediaStagePayload(
  draft: StoryStagedDraft,
  stageId: "images" | "storyboard" | "videos",
): StoryMediaStagePayload {
  const confirmed = (id: StoryStageId) => {
    const stage = draft.stages.find((item) => item.id === id);
    return stage?.status === "confirmed" ? stage.output : undefined;
  };
  const referenceSnapshots = structuredClone(draft.referenceSnapshots);
  if (stageId === "images") {
    const snapshotIdsByRole = (role: StoryMediaAssetPayload["role"]) =>
      referenceSnapshots
        .filter((snapshot) => snapshot.role === "story" || snapshot.role === role)
        .map((snapshot) => snapshot.snapshotId);
    const assets = [
      ...assetPayloads(confirmed("characters"), "character"),
      ...assetPayloads(confirmed("scenes"), "scene"),
      ...assetPayloads(confirmed("props"), "prop"),
    ].map((asset) => ({
      ...asset,
      referenceSnapshotIds: Array.from(new Set([
        ...snapshotIdsByRole(asset.role),
        ...asset.referenceSnapshotIds,
      ])),
    }));
    return { kind: "images", draftId: draft.draftId, stageId, assets, referenceSnapshots };
  }
  if (stageId === "storyboard") {
    return {
      kind: "storyboard",
      draftId: draft.draftId,
      stageId,
      shotCount: draft.inputSnapshot.shotCount || 5,
      requirements: structuredClone(confirmed("requirements")),
      characters: structuredClone(confirmed("characters")),
      scenes: structuredClone(confirmed("scenes")),
      props: structuredClone(confirmed("props")),
      imageAssets: structuredClone(confirmed("images")),
      referenceSnapshots,
      prompt: "",
    };
  }
  return {
    kind: "videos",
    draftId: draft.draftId,
    stageId,
    shots: records(confirmed("storyboard")),
    imageAssets: structuredClone(confirmed("images")),
    referenceSnapshots,
  };
}

export function executeStoryStage(
  executors: LocalStoryStageExecutors,
  draft: StoryStagedDraft,
  stageId: StoryStageId,
  promptBuilder?: StoryStagePromptBuilder,
): Promise<StoryStageOperationResult> {
  if (stageId === "images") return executors.images(buildStoryMediaStagePayload(draft, stageId) as StoryImagesStagePayload);
  if (stageId === "storyboard") {
    const payload = buildStoryMediaStagePayload(draft, stageId) as StoryStoryboardStagePayload;
    payload.prompt = promptBuilder?.(draft, stageId) || "";
    return executors.storyboard(payload);
  }
  if (stageId === "videos") return executors.videos(buildStoryMediaStagePayload(draft, stageId) as StoryVideosStagePayload);
  return executors.text({
    kind: "text",
    draftId: draft.draftId,
    stageId,
    prompt: promptBuilder?.(draft, stageId) || "",
  });
}

export function buildStoryDraftMediaMetadata(input: {
  draftId: string;
  stageId: StoryStageId;
  role: "character" | "scene" | "prop" | "shot" | "video";
  referenceSnapshotIds: string[];
}): Pick<CanvasNodeMetadata, "storyStagedDraftId" | "storyStageId" | "storyDraftNode" | "storyAssetRole" | "storyReferenceSnapshotIds"> {
  return {
    storyStagedDraftId: input.draftId,
    storyStageId: input.stageId,
    storyDraftNode: true,
    storyAssetRole: input.role,
    storyReferenceSnapshotIds: [...input.referenceSnapshotIds],
  };
}

function assetPayloads(value: unknown, role: StoryMediaAssetPayload["role"]): StoryMediaAssetPayload[] {
  return records(value).map((item, index) => ({
    id: String(item.id || `${role}-${index + 1}`),
    role,
    prompt: String(item.visualPrompt || item.imagePrompt || item.description || item.name || ""),
    referenceSnapshotIds: stringArray(item.referenceSnapshotIds),
  }));
}

function records(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["items", "assets", "characters", "scenes", "props", "shots"]) {
    if (Array.isArray(record[key])) return records(record[key]);
  }
  return [];
}

const stringArray = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
