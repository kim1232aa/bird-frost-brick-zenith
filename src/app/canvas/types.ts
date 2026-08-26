import type { ImageAdvancedSettings, ImageAdvancedSettingsScope } from "../../stores/image-advanced-settings";
import type { VideoGenerationSettings, VideoGenerationSettingsScope, VideoWireFormatSnapshot } from "../../stores/video-generation-settings";
import type { VideoReferenceUseAs } from "../../types/media";
import type { CanvasImageTaskBinding } from "../../services/api/native-image-task";

export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
    StoryDirector = "story_director",
    Seedance2Workflow = "seedance2_workflow",
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasImageGenerationType = "generation" | "edit";
export type CanvasImageOperation = "generate" | "edit" | "variation" | "responses-tool";
export type StoryDirectorInputKind = "reference" | "character" | "scene" | "prop";
export type StoryGenerationMode = "quick" | "staged";
export type StoryDraftStatus = "idle" | "running" | "awaiting_review" | "paused" | "completed" | "failed";
export type StoryStageId = "requirements" | "characters" | "scenes" | "props" | "images" | "storyboard" | "videos";
export type StoryStageStatus = "pending" | "running" | "awaiting_review" | "confirmed" | "retrying" | "paused" | "failed" | "needs_regeneration" | "skipped";
export type StoryReferenceRole = "story" | "character" | "scene" | "prop";
export type StoryVersionRole = "director" | "reference" | "character" | "scene" | "prop" | "shot" | "video";

export type StoryReferenceSnapshot = {
    snapshotId: string;
    sourceNodeId: string;
    role: StoryReferenceRole;
    name: string;
    mimeType: string;
    width?: number;
    height?: number;
    content?: string;
    storageKey?: string;
    sha256: string;
    stableOrder: number;
    createdAt: string;
};

export type StoryStageError = {
    code: string;
    message: string;
    retryable: boolean;
    taskId?: string;
    taskIds?: string[];
    attempt?: number;
    occurredAt?: string;
};

export type StoryStageRecord = {
    id: StoryStageId;
    status: StoryStageStatus;
    revision: number;
    attempt: number;
    taskIds: string[];
    draftNodeIds: string[];
    inputRevision?: number;
    output?: unknown;
    rawOutput?: string;
    prompt?: string;
    error?: StoryStageError;
    confirmedAt?: string;
    updatedAt: string;
};

export type StoryDraftInputSnapshot = {
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

export type StoryStagedDraft = {
    draftId: string;
    sourceDirectorNodeId: string;
    baseNodeRevision: string;
    status: StoryDraftStatus;
    currentStageId: StoryStageId;
    inputSnapshot: StoryDraftInputSnapshot;
    referenceSnapshots: StoryReferenceSnapshot[];
    stages: StoryStageRecord[];
    versionNumber?: number;
    committedVersionId?: string;
    createdAt: string;
    updatedAt: string;
};

export const STORY_DIRECTOR_INPUT_HANDLES = [
    { id: "story:reference", kind: "reference", label: "故事参考", shortLabel: "参考" },
    { id: "story:character", kind: "character", label: "角色参考", shortLabel: "角色" },
    { id: "story:scene", kind: "scene", label: "场景参考", shortLabel: "场景" },
    { id: "story:prop", kind: "prop", label: "其它参考", shortLabel: "其它" },
] as const satisfies ReadonlyArray<{ id: string; kind: StoryDirectorInputKind; label: string; shortLabel: string }>;

export type StoryCharacter = {
    id: string;
    name: string;
    aliases?: string[];
    roleType?: string;
    importance: "main" | "supporting" | "minor" | "background";
    appearance: string;
    personality?: string;
    relationshipSummary?: string;
    visualPrompt: string;
    negativePrompt?: string;
    referenceNodeId?: string;
    referenceImageUrl?: string;
    assetSource?: "upstream" | "generated" | "manual";
    assetLocked?: boolean;
    status: "draft" | "generating" | "ready" | "locked" | "error";
    errorDetails?: string;
};

export type StoryScene = {
    id: string;
    name: string;
    description: string;
    mood?: string;
    visualStyle?: string;
    referenceNodeId?: string;
    referenceImageUrl?: string;
};

export type StoryShot = {
    id: string;
    index: number;
    title: string;
    sceneId?: string;
    appearingCharacterIds: string[];
    excludedCharacterIds: string[];
    action: string;
    camera: string;
    emotion?: string;
    continuityNote?: string;
    characterState?: string;
    visualContent?: string;
    voiceover?: string;
    imagePrompt: string;
    finalPrompt?: string;
    resultNodeIds: string[];
    status: "pending" | "generating" | "done" | "error";
    errorDetails?: string;
};

export type Seedance2ReferenceSlotKey =
    | "upstream_hd_frame"
    | "current_shot"
    | "character"
    | "scene";

export type Seedance2ExtraReferenceSlotKey =
    | "reference_5"
    | "reference_6"
    | "reference_7"
    | "reference_8"
    | "reference_9"
    | "reference_10"
    | "reference_11"
    | "reference_12";

export type Seedance2ReferenceSlotUseAs = "first_frame" | "last_frame" | "keyframe" | "reference_image";

// 故事分镜参考图在“连接 → 槽位 → hydrate → payload”链路上携带的语义角色。
// 注意与 StoryReferenceRole（故事版本快照用）语义不同，这里描述的是单镜视频参考图的来源类别。
export type VideoReferenceRole =
    | "current_shot"
    | "character"
    | "scene"
    | "prop"
    | "other"
    | "upstream_frame";

export type Seedance2ReferenceSlotBinding = {
    /** Stable identity for this concrete asset, independent from its parent canvas node. */
    referenceId?: string;
    nodeId?: string;
    value?: string;
    label: string;
    required?: boolean;
    useAs?: Seedance2ReferenceSlotUseAs;
};

export type SeedanceGenerationTaskState = {
    status: "idle" | "generating" | "success" | "failed" | "timeout";
    taskId?: string;
    startedAt?: string;
    /** Durable attempt ownership. Legacy saved tasks may omit these fields. */
    attemptId?: string;
    provider?: CanvasVideoTaskProvider | "customer";
    providerId?: string;
    model?: string;
    timedOutAt?: string;
    errorMessage?: string;
};

export type CanvasVideoTaskProvider = "openai" | "seedance" | "dashscope" | "agnes" | "civitai" | "xai-imagine";

/**
 * Secret-free identity of the exact relay route that accepted a native video
 * task.  Recovery must validate every field before it polls that task again.
 */
export type CanvasVideoTaskProviderSnapshot = {
    readonly schema: "canvas-video-provider-snapshot/v1";
    readonly providerId: string;
    readonly providerUpdatedAt: string;
    readonly providerFingerprint: string;
    readonly adapterType: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly credentialId: string;
    readonly credentialSlot: number;
    readonly capability: "video";
    readonly operation: VideoGenerationSettingsScope["operation"];
};

export type CanvasVideoGenerationTask = {
    readonly id: string;
    readonly provider: CanvasVideoTaskProvider;
    readonly model: string;
    readonly providerId?: string;
    readonly credentialId?: string;
    readonly agnesVideoId?: string;
    readonly expectedOutputs?: number;
    readonly startedAt: string;
    /** Unique generation attempt; prevents an older poll from mutating a newer node state. */
    readonly attemptId?: string;
    /** Missing on legacy tasks, which are not safe for automatic provider recovery. */
    readonly providerSnapshot?: CanvasVideoTaskProviderSnapshot;
};

export type CanvasVideoGenerationAttempt = {
    readonly id: string;
    readonly kind: "native" | "customer";
    readonly provider: CanvasVideoTaskProvider | "customer";
    readonly providerId?: string;
    readonly model: string;
    readonly startedAt: string;
    readonly taskId?: string;
    /** Secret-free relay affinity for local customer tasks. Remote platform tasks omit it. */
    readonly providerSnapshot?: CanvasVideoTaskProviderSnapshot;
};

type CanvasVideoRuntimeTask = {
    readonly id: string;
    readonly provider: CanvasVideoTaskProvider;
    readonly model: string;
    readonly apiKey?: string;
    readonly agnesVideoId?: string;
    readonly expectedOutputs?: number;
    readonly route?: CanvasVideoTaskRoute;
};

type CanvasVideoTaskRoute =
    | { readonly mode: "local"; readonly provider: CanvasVideoTaskProviderConfig }
    | { readonly mode: "remote" | "localPool" };

type CanvasVideoTaskProviderConfig = {
    readonly id: string;
    readonly apiKey: string;
    readonly apiKeyId?: string;
    readonly apiKeys?: readonly string[];
    readonly apiKeyIds?: readonly string[];
};

export type RestoredCanvasVideoGenerationTask =
    | { readonly status: "ready"; readonly task: Omit<CanvasVideoRuntimeTask, "route"> }
    | { readonly status: "provider-mismatch" }
    | { readonly status: "credential-missing" };

function canvasVideoProviderCredentials(provider: CanvasVideoTaskProviderConfig) {
    const credentials: Array<{ apiKey: string; id: string }> = [];
    const seen = new Set<string>();
    const append = (keyValue: string | undefined, idValue: string | undefined) => {
        const apiKey = String(keyValue || "").trim();
        const id = String(idValue || "").trim();
        if (!apiKey || !id || seen.has(apiKey)) return;
        seen.add(apiKey);
        credentials.push({ apiKey, id });
    };
    append(provider.apiKey, provider.apiKeyId);
    (provider.apiKeys || []).forEach((apiKey, index) => append(apiKey, provider.apiKeyIds?.[index]));
    return credentials;
}

export function snapshotCanvasVideoGenerationTask(
    task: CanvasVideoRuntimeTask,
    startedAt = new Date().toISOString(),
    attemptId?: string,
): CanvasVideoGenerationTask {
    const localProvider = task.route?.mode === "local" ? task.route.provider : undefined;
    const credentialId = localProvider && task.apiKey
        ? canvasVideoProviderCredentials(localProvider).find((credential) => credential.apiKey === task.apiKey)?.id
        : undefined;
    return {
        id: task.id,
        provider: task.provider,
        model: task.model,
        ...(localProvider ? { providerId: localProvider.id } : {}),
        ...(credentialId ? { credentialId } : {}),
        ...(task.agnesVideoId ? { agnesVideoId: task.agnesVideoId } : {}),
        ...(task.expectedOutputs !== undefined ? { expectedOutputs: task.expectedOutputs } : {}),
        startedAt,
        ...(attemptId ? { attemptId } : {}),
    };
}

export function restoreCanvasVideoGenerationTask(
    snapshot: CanvasVideoGenerationTask,
    route: CanvasVideoTaskRoute,
): RestoredCanvasVideoGenerationTask {
    if (snapshot.providerId && (route.mode !== "local" || route.provider.id !== snapshot.providerId)) {
        return { status: "provider-mismatch" };
    }
    const providerCredentials = route.mode === "local" ? canvasVideoProviderCredentials(route.provider) : [];
    const apiKey = snapshot.credentialId === undefined
        ? undefined
        : providerCredentials.find((credential) => credential.id === snapshot.credentialId)?.apiKey;
    if (snapshot.credentialId !== undefined && !apiKey) return { status: "credential-missing" };
    return {
        status: "ready",
        task: {
            id: snapshot.id,
            provider: snapshot.provider,
            model: snapshot.model,
            ...(apiKey ? { apiKey } : {}),
            ...(snapshot.agnesVideoId ? { agnesVideoId: snapshot.agnesVideoId } : {}),
            ...(snapshot.expectedOutputs !== undefined ? { expectedOutputs: snapshot.expectedOutputs } : {}),
        },
    };
}

export const CHARACTER_DERIVED_VIEW_ANGLES = ["front", "side", "back", "portrait"] as const;

export type CharacterDerivedViewAngle = (typeof CHARACTER_DERIVED_VIEW_ANGLES)[number];

/**
 * A retained crop derived from a character turnaround sheet. It deliberately
 * contains storage metadata only: callers must resolve the storage key when a
 * display URL is needed instead of persisting a data URL with canvas state.
 */
export type CharacterDerivedView = {
    id: string;
    storageKey: string;
    width: number;
    height: number;
    mimeType: string;
    bytes: number;
    sourceStorageKey: string;
    version: number;
    angle: CharacterDerivedViewAngle;
    label: string;
};

export type StoryImageReferenceSemanticSnapshot = {
    /** Concrete derived asset ID; distinct from the owning canvas node for a crop. */
    id: string;
    /** Canvas node that owns the asset and is used for graph lineage. */
    sourceNodeId: string;
    /** Durable key only; runtime URLs and image bytes are never persisted here. */
    storageKey: string;
    role: "identity" | "scene" | "prop" | "story" | "style";
    entityId?: string;
    angle?: CharacterDerivedViewAngle | "identity";
};

export type CanvasNodeMetadata = {
    content?: string;
    composerContent?: string;
    prompt?: string;
    negativePrompt?: string;
    imageSequenceNumber?: number;
    storyLabel?: string;
    storyGrid9GroupIndex?: number;
    storyGrid9ShotStart?: number;
    storyGrid9ShotEnd?: number;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    /** Exact image API operation. Legacy nodes migrate from generationType/references/content. */
    imageOperation?: CanvasImageOperation;
    model?: string;
    /** Exact provider paired with `model`; omitted only for legacy model-only nodes. */
    modelProviderId?: string;
    size?: string;
    quality?: string;
    count?: number;
    /** Snapshot used by this node; applied only when imageAdvancedScope still matches the active route. */
    imageAdvancedSettings?: ImageAdvancedSettings;
    imageAdvancedScope?: ImageAdvancedSettingsScope;
    /** Durable storage-only replay handle for a local/mask edit. Never persist mask data URIs. */
    imageEditMask?: {
        storageKey: string;
        name: string;
        type: string;
    };
    /** Provider/model/operation snapshot used by this video node. */
    videoGenerationSettings?: VideoGenerationSettings;
    videoGenerationScope?: VideoGenerationSettingsScope;
    videoGenerationCapabilityId?: string;
    /** Auditable one-time recovery of an old node that lacked scope.operation. */
    videoGenerationOperationMigration?: {
        version: 1;
        source: "task-snapshot" | "semantic-contract" | "single-capability-operation" | "auto-materials";
        providerId: string;
        model: string;
        operation: VideoGenerationSettingsScope["operation"];
    };
    /** Visual/prompt layout only; this is never treated as an API width/height contract. */
    videoLayoutRatio?: string;
    /** Output-format fields verified for the exact provider/model and intended for the request wire. */
    videoWireFormat?: VideoWireFormatSnapshot;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    references?: string[];
    /** Optional semantic replay data for Story references; legacy `references`-only nodes remain valid. */
    storyImageReferenceSnapshots?: StoryImageReferenceSemanticSnapshot[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
    storageKey?: string;
    retained?: boolean;
    /** Semantic role of a character image; never infer this from its title or prompt. */
    storyCharacterAssetKind?: "turnaround_sheet" | "identity_reference" | "derived_view";
    storyCharacterId?: string;
    /** Retained, storage-key-only crops derived from this turnaround sheet. */
    characterDerivedViews?: CharacterDerivedView[];
    /** Derivation status is independent from the parent character-image generation. */
    characterDerivedViewsStatus?: "pending" | "ready" | "error";
    characterDerivedViewsError?: string;
    /** Set only on an expanded derived-view node. */
    characterDerivedViewAngle?: CharacterDerivedViewAngle;
    characterDerivedFromNodeId?: string;
    backendUrl?: string;
    backendRel?: string;
    mimeType?: string;
    bytes?: number;
    seedance2FaceEditOriginal?: {
        content?: string;
        backendUrl?: string;
        backendRel?: string;
        storageKey?: string;
        naturalWidth?: number;
        naturalHeight?: number;
        bytes?: number;
        mimeType?: string;
    };
    durationMs?: number;
    videoGenerationTask?: CanvasVideoGenerationTask;
    /** Current owner of any asynchronous video request/poll/materialization. */
    videoGenerationAttempt?: CanvasVideoGenerationAttempt;
    /** Zero-based position and total cardinality for a provider-returned video batch. */
    videoResultIndex?: number;
    videoResultCount?: number;
    source?: string;
    sourceImageTaskId?: string;
    /** Local ownership token before a native provider returns its real task ID. */
    imageGenerationAttemptId?: string;
    /** Secret-free native/platform image task handle plus exact node-attempt ownership. */
    imageGenerationTask?: CanvasImageTaskBinding;
    imageTaskId?: string;
    storyText?: string;
    storyDirectorTextModel?: string;
    /** Exact provider paired with the Story Director text model. */
    storyDirectorTextModelProviderId?: string;
    storyDirectorTextModelMode?: "inherit" | "custom";
    storyDirectorImageModel?: string;
    storyDirectorImageModelProviderId?: string;
    storyDirectorImageModelMode?: "inherit" | "custom";
    storyOriginalText?: string;
    storyStyleMode?: "preset" | "custom";
    storyCustomStyle?: string;
    storyStyle?: string;
    storyShotCount?: number;
    storyAspectRatio?: string;
    storyStoryboardMode?: "single" | "grid9";
    storyGenerationMode?: StoryGenerationMode;
    storyStagedDraftId?: string;
    storyStagedDraft?: StoryStagedDraft;
    storyStageId?: StoryStageId;
    storyDraftNode?: boolean;
    storyAssetRole?: "character" | "scene" | "prop" | "shot" | "video";
    storyDraftAssetId?: string;
    storyTaskId?: string;
    storyVersionId?: string;
    storyVersionNumber?: number;
    storyVersionParentId?: string;
    storyVersionSourceNodeId?: string;
    storyVersionRole?: StoryVersionRole;
    storyReferenceSnapshotIds?: string[];
    storyReferenceSnapshotId?: string;
    storyVersionCreatedAt?: string;
    storyCommittedDraftId?: string;
    storyImageQuality?: "low" | "medium" | "high" | "1k" | "2k" | "4k";
    /** Distinguishes a user choice from the legacy provider-agnostic `low` default. */
    storyImageQualityExplicit?: boolean;
    storyWorkflow?: "idle" | "analysis" | "character" | "shot";
    storySourceImageNodeId?: string;
    storySourceImageNodeIds?: string[];
    storyCharacterSourceImageNodeIds?: string[];
    storySceneSourceImageNodeIds?: string[];
    storyPropSourceImageNodeIds?: string[];
    storyAnalysisStatus?: CanvasNodeStatus;
    storyGenerationStatus?: CanvasNodeStatus;
    storyAnalysisRaw?: string;
    /** Last successful analysis JSON retained across a new in-flight analysis. */
    storyAnalysisPreviousRaw?: string;
    /** Exact source text sent to the last successful story analysis request. */
    storyAnalysisSourceText?: string;
    /** Exact generated development text shown after the last successful analysis. */
    storyAnalysisRenderedText?: string;
    /** Shot-count input used by the last successful analysis. */
    storyAnalysisShotCount?: number;
    storyCharacters?: StoryCharacter[];
    storyScenes?: StoryScene[];
    storyShots?: StoryShot[];
    seedanceApiProvider?: "local";
    seedanceApiEndpoint?: string;
    seedanceWorkflowMode?: "continuous" | "slice";
    seedanceShotCount?: number;
    seedanceGenerateCount?: number;
    seedanceContinuous?: boolean;
    seedanceModel?: string;
    seedanceResolution?: string;
    seedanceRatio?: string;
    seedanceRatioSelection?: "upstream" | "manual";
    seedanceDuration?: string;
    seedanceSourceAspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";
    seedanceInheritSourceRatio?: boolean;
    seedanceRatioTouched?: boolean;
    seedanceReferenceSlotBindings?: Partial<Record<Seedance2ReferenceSlotKey, Seedance2ReferenceSlotBinding>>;
    seedanceReferenceExtraSlotBindings?: Partial<Record<Seedance2ExtraReferenceSlotKey, Seedance2ReferenceSlotBinding>>;
    seedancePromptPanelMode?: "compact" | "inline";
    seedancePromptExpandedByUser?: boolean;
    seedanceManualMinHeight?: number;
    seedanceReferenceSlotsExpanded?: boolean;
    seedancePromptTemplate?: string;
    seedancePromptTextModel?: string;
    /** Exact provider paired with the Seedance2 prompt rewrite text model. */
    seedancePromptTextModelProviderId?: string;
    seedanceAutoPrompt?: string;
    seedancePromptEditedByUser?: boolean;
    seedanceReferenceOrder?: string[];
    seedanceRequiredReferences?: string[];
    /** Explainable result of provider-aware automatic story reference selection. */
    seedanceStoryAutoReferenceOmittedCount?: number;
    seedanceStoryAutoReferenceNotice?: string;
    seedanceVersionStatus?: "adopted" | "candidate" | "discarded";
    seedanceWorkflowNodeId?: string;
    seedanceStoryDirectorNodeId?: string;
    seedanceStoryShotId?: string;
    seedanceStoryShotIndex?: number;
    seedanceStorySourceImageNodeId?: string;
    seedanceStoryPackedImageNodeIds?: string[];
    seedancePlaceholderSetVersion?: number;
    seedancePromptRewriteModel?: string;
    seedancePromptRewriteTemplate?: string;
    seedancePromptRewriteCreatedAt?: string;
    /** Safe, serializable progress for resumable batched prompt rewriting. */
    seedancePromptRewriteCheckpoint?: {
        schema: "seedance2-prompt-rewrite-checkpoint/v1";
        fingerprintDigest: string;
        completedShots: Array<{ shotId: string; shotIndex: number; prompt: string }>;
    };
    seedancePromptRewriteCompletedCount?: number;
    seedancePromptRewriteTotalCount?: number;
    seedancePromptRewriteErrorDetails?: string;
    seedanceTaskId?: string;
    seedanceFileUrls?: string[];
    seedanceFiles?: string[];
    seedanceGenerationTaskState?: SeedanceGenerationTaskState;
    watermarkRemoved?: boolean;
    seedanceShotIndex?: number;
    seedanceShotTitle?: string;
    seedanceWorkflowRole?: "controller" | "placeholder" | "reference_frame" | "result" | "extracted-frame";
    seedanceSourcePlaceholderId?: string;
    seedanceVersion?: number;
    seedanceGeneratedVersions?: Array<{
        nodeId?: string;
        version: number;
        url: string;
        ratio?: string;
        duration?: string;
        taskId?: string;
        createdAt?: string;
    }>;
    seedanceResultNodeIds?: string[];
    seedanceLatestResultNodeId?: string;
    seedanceParamsSnapshot?: Record<string, unknown>;
    seedancePromptSnapshot?: string;
    seedanceCreatedAt?: string;
    seedanceSourceResultNodeId?: string;
    seedanceFrameTimeSeconds?: number;
    seedanceFrameIndex?: number;
    seedanceConnectsToNextPlaceholderId?: string;
    seedanceReferenceSlot?: Seedance2ReferenceSlotKey;
    pavoTestWorkspace?: boolean;
    pavoTestRunId?: string;
    pavoTestSourceNodeId?: string;
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    fromHandleId?: string;
    toHandleId?: string;
    referenceSequence?: number;
    referenceRole?: VideoReferenceRole;
    referenceEntityId?: string;
    referenceLabel?: string;
    useAs?: Seedance2ReferenceSlotUseAs;
    referenceUseAsExplicit?: boolean;
    /** Story-generated connections are replaceable; any user-authored or edited connection is manual. */
    referenceOrigin?: "story_auto" | "manual";
    /** These two snapshot fields are written and consumed as a pair. */
    referenceAssetId?: string;
    referenceAssetStorageKey?: string;
    /** Video input purpose. Missing legacy values are preserved for provider-specific compatibility validation. */
    videoUseAs?: VideoReferenceUseAs;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant";
    mode: "ask" | "image";
    text: string;
    isLoading?: boolean;
    references?: CanvasAssistantReference[];
    images?: CanvasAssistantImage[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
    handleId?: string;
};

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    additive: boolean;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "selection";
          x: number;
          y: number;
          nodeIds: string[];
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
