"use client";

import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ErrorInfo, ReactNode } from "react";
import type {
  ChangeEvent as ReactChangeEvent,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlignCenter,
  AlignEndHorizontal,
  AlignStartHorizontal,
  Brush,
  Check,
  Clapperboard,
  Clipboard,
  Columns2,
  Copy,
  Download,
  FileText,
  Film,
  FolderPlus,
  Grid2x2,
  Home,
  ImageIcon,
  Images,
  Layers3,
  LayoutGrid,
  List,
  Maximize2,
  Menu,
  MessageSquare,
  Minus,
  Music2,
  PanelRightOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Redo2,
  Scissors,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Video,
  WandSparkles,
  ZoomIn,
} from "lucide-react";
import { saveAs } from "file-saver";

import {
  requestEdit,
  requestGeneration,
  requestResponsesImage,
  requestVariation,
  requestImageQuestion,
  preflightImageRequest,
  resumeNativeImageTask,
  resolveImageRequestCapability,
  type ChatCompletionMessage,
  type GeneratedImageResult,
  type ImageRequestOperation,
} from "@/services/api/image";
import {
  ownsCanvasImageTask,
  NativeImageTaskTerminalError,
  snapshotSubmittedNativeImageTask,
  type CanvasImageTaskBinding,
  type NativeImageTaskSubmissionObserver,
} from "@/services/api/native-image-task";
import type { ResolvedImageModelCapability } from "@/services/api/image-model-capabilities";
import { detectTextApiResponseError } from "@/services/api/text-response-errors";
import {
  requestAudioGeneration,
  storeGeneratedAudio,
} from "@/services/api/audio";
import {
  createVideoGenerationTask,
  pollVideoGenerationTask,
  storeGeneratedVideo,
  storeGeneratedVideos,
  type VideoGenerationTask,
} from "@/services/api/video";
import { videoPromptPreflightError } from "@/services/api/video-prompt-contract";
import { VideoSettingsPanel } from "@/components/video-settings-panel";
import {
  createVideoTaskPollingRequestError,
  isRetryableVideoTaskPollingError,
  isVideoTaskPollingPausedError,
  pollVideoTaskWithTransientRetry,
  videoTaskPollingRemainingMs,
} from "@/services/api/video-task-polling-policy";
import {
  nativeVideoSubmissionAdapterType,
  buildVideoReferenceIntent,
  prepareStoryVideoReferencesForSubmission,
  type ResolvedVideoModelCapability,
  type VideoReferenceImage,
} from "@/services/api/video-model-capabilities";
import {
  resolveVideoReferenceSlotContract,
} from "@/services/api/video-reference-slot-contract";
import {
  explicitMediaRequestModel,
  resolveApiRequestRoute,
  routedLocalApiUrl,
  routedLocalHeaders,
  type ApiRequestRoute,
} from "@/services/api/ai-routing";
import { buildLocalRelayProxyHeaders, rotateRelayCredentialId } from "@/services/api/relay-proxy";
import { resolveVideoAdapter, videoPollPath } from "@/studio/registry";
import {
  attachOfficialOpenAiVideoContent,
  buildCustomerVideoStudioRequest,
  planCustomerVideoContentFetch,
} from "@/studio/customer-video-wire";
import { sniffMedia } from "@/studio/adapters/contracts";
import { draftPlan } from "@/studio/story/plan";
import {
  requestNativeRelayVideo,
  shouldUseNativeRelayVideo,
} from "@/services/api/native-relay-video";
import {
  createImageEditTask,
  createImageGenerationTask,
  fetchImageTasks,
  protectCanvasImages,
  type ImageTask,
} from "@/lib/api";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import {
  defaultConfig,
  flushConfigStore,
  modelMatchesCapability,
  readImageAdvancedSettings,
  readVideoGenerationSettings,
  replayableVideoGenerationScope,
  resolveVideoGenerationRouteModel,
  resolveVideoGenerationSettingsScope,
  selectableModelsByCapability,
  selectableProviderModelsByCapability,
  snapshotVideoWireFormat,
  videoGenerationSettingsToRequest,
  videoGenerationOperationFromIntent,
  type AiConfig,
  type VideoGenerationOperation,
  type VideoGenerationSettings,
  useConfigStore,
  useEffectiveConfig,
  writeVideoGenerationSettings,
} from "@/stores/use-config-store";
import {
  providerDisplayName,
  providerModelsForCapability,
  resolveApiRelayTimeoutMs,
  type ApiRelayProvider,
  type ApiBoardRouteKey,
  type ProviderModelOption,
  type ProviderModelSelection,
} from "@/stores/api-relay-config";
import {
  imageToDataUrl,
  resolveImageUrl,
  setStoredImagesRetained,
  touchStoredImages,
  uploadImage,
  type UploadedImage,
} from "@/services/image-storage";
import {
  collectMediaStorageKeys,
  releaseMediaObjectUrls,
  resolveMediaUrl,
  uploadMediaFile,
  type UploadedFile,
} from "@/services/file-storage";
import { persistCanvasVideoWorks } from "../utils/canvas-video-work-persistence";
import { nanoid } from "nanoid";
import {
  base64ImageDataUrl,
  dataUrlToFile,
  getDataUrlByteSize,
  readImageMeta,
} from "@/lib/image-utils";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import {
  ModelSelectControl,
  ProviderModelSelectControl,
} from "@/components/model-picker";
import { useAssetStore } from "@/stores/use-asset-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { cropDataUrl, splitDataUrl } from "../utils/canvas-image-data";
import { shouldPersistCanvasProject } from "../utils/canvas-project-load-guard";
import {
  assertExactCanvasImageBatchCardinality,
  dispatchCanvasImageBatch,
  parseCanvasGenerationCount,
  type CanvasImageBatchOutcome,
} from "../utils/canvas-image-batch-dispatch";
import {
  applyExplicitCanvasGenerationModel,
  replayableCanvasGenerationModel,
  resolveCanvasGenerationModelSelection,
} from "../utils/canvas-generation-model";
import { applyActiveCanvasImageAdvancedSnapshot } from "../utils/canvas-image-advanced-snapshot";
import {
  isResumableCanvasImageTask,
  recoverInterruptedCanvasImageNode,
  recoveredLegacyImageMetadataPatch,
  shouldPreferCanvasImageRecoveryRetry,
  shouldSkipLegacyImageTaskResume,
} from "../utils/canvas-legacy-image-task";
import { resolveCanvasVideoModelCapability } from "../utils/canvas-video-capability";
import { autoWorkflowVideoOperationForMaterials, resolveStandaloneVideoOperation, resolveWorkflowVideoOperationSelection, workflowVideoAutoSkippedOperationReasons } from "../utils/canvas-video-operation-selection";
import { migrateIdleStoryVideoOperations } from "../utils/story-video-capability-migration";
import {
  buildCanvasImageEditPlan,
  buildCanvasMaskReferenceMetadata,
  canvasImageBatchResultPolicy,
  retryImageReferenceSnapshotError,
  restoreCanvasImageRetryConfig,
  restoreCanvasMaskReference,
  snapshotCanvasImageReferenceUrls,
  shouldReplayCanvasImageReferences,
} from "../components/canvas-image-retry-contract";
import { resolveImageSettingsContext } from "@/components/provider-settings-context";
import {
  createSeedance2FaceEditOriginalBackup,
  restoreSeedance2FaceEditOriginalNode,
} from "../utils/seedance2-face-editor";
import { applyCanvasVideoBatchResults } from "../utils/canvas-video-batch-results";
import {
  clearVideoTaskOwnership,
  hasNonterminalVideoTask,
  ownsVideoGenerationAttempt,
  videoTaskControllerKey,
  videoTaskControllerKeysForNode,
  withVideoAttemptTaskId,
  type VideoGenerationAttempt,
} from "../utils/canvas-video-task-ownership";
import {
  isVideoTaskSnapshotLocked,
  protectVideoTaskSnapshotPatch,
} from "../utils/canvas-video-task-edit-lock";
import {
  createCanvasVideoTaskProviderSnapshot,
  validateCanvasVideoTaskProviderSnapshot,
} from "../utils/canvas-video-task-snapshot";
import {
  fitNodeSize,
  imageNodeSize,
  nodeSizeFromRatio,
} from "../utils/canvas-node-size";
import { App, Button, Dropdown, Modal } from "antd";
import { NODE_DEFAULT_SIZE, getNodeSpec } from "../constants";
import {
  ActiveConnectionPath,
  CanvasConnectionDefs,
  ConnectionPath,
} from "../components/canvas-connections";
import { CanvasConfigComposer } from "../components/canvas-config-composer";
import { CanvasConfigNodePanel } from "../components/canvas-config-node-panel";
import { CanvasAssistantPanel } from "../components/canvas-assistant-panel";
import {
  CanvasNodeContextMenu,
  type CanvasContextMenuGroup,
  type CanvasContextMenuItem,
} from "../components/canvas-context-menu";
import { CanvasGenerationHistoryPanel } from "../components/canvas-generation-history-panel";
import { CanvasImageCompareDialog } from "../components/canvas-image-compare-dialog";
import {
  CanvasCharacterDerivedViewsDialog,
  type ResolvedCharacterDerivedView,
} from "../components/canvas-character-derived-views-dialog";
import { resolveCharacterDerivedViewUrls } from "../components/canvas-character-derived-views-state";
import {
  CanvasNodeAngleDialog,
  type CanvasImageAngleParams,
} from "../components/canvas-node-angle-dialog";
import {
  CanvasNodeCropDialog,
  type CanvasImageCropRect,
} from "../components/canvas-node-crop-dialog";
import {
  CanvasNodeLayerEditDialog,
  type CanvasImageLayerEditPayload,
} from "../components/canvas-node-layer-edit-dialog";
import {
  CanvasNodeMaskEditDialog,
  type CanvasImageMaskEditPayload,
} from "../components/canvas-node-mask-edit-dialog";
import {
  CanvasNodeSeedance2FaceEditDialog,
  type CanvasSeedance2FaceEditPayload,
} from "../components/canvas-node-seedance2-face-edit-dialog";
import {
  CanvasNodeSplitDialog,
  type CanvasImageSplitParams,
} from "../components/canvas-node-split-dialog";
import {
  CanvasNodeUpscaleDialog,
  type CanvasImageUpscaleParams,
} from "../components/canvas-node-upscale-dialog";
import {
  buildNodeChatMessages,
  buildNodeGenerationContext,
  buildNodeGenerationInputs,
  hydrateNodeGenerationContext,
  type NodeGenerationInput,
} from "../components/canvas-node-generation";
import { CanvasNodeInfoModal } from "../components/canvas-node-hover-toolbar";
import { buildImageToolbarTools } from "../components/canvas-image-toolbar-tools";
import { InfiniteCanvas } from "../components/infinite-canvas";
import { Minimap } from "../components/canvas-mini-map";
import { CanvasNode } from "../components/canvas-node";
import {
  CanvasNodePromptPanel,
  type CanvasNodeGenerationMode,
} from "../components/canvas-node-prompt-panel";
import { CanvasStoryDirectorPanel } from "../components/canvas-story-director-panel";
import { CanvasToolbar } from "../components/canvas-toolbar";
import {
  AssetPickerModal,
  type AssetPickerTab,
  type InsertAssetPayload,
} from "../components/asset-picker-modal";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import {
  flushCanvasPersistence,
  importLatestStorySeed,
  INFINITE_CANVAS_SEED_ID,
  useCanvasStore,
  type CanvasProject,
} from "../stores/use-canvas-store";
import { mediaPayloadFromWorkspaceSearch } from "@/studio/canvas/media-workspace-project";
import { pushMediaToCanvasWorkspace } from "@/studio/canvas/push-to-workspace";
import {
  buildSeedance2WorkflowNodes,
  defaultSeedancePromptTemplate,
  compactBulkSeedance2PlaceholderPanels,
  createSeedance2ResultMetadata,
  createSeedance2VideoPlaceholderMetadata,
  nextSeedance2ResultPosition,
  LOCAL_SEEDANCE2_API_ENDPOINT,
  normalizeSeedance2AspectRatio,
  normalizeSeedance2CreationAspectRatio,
  normalizeSeedance2Duration,
  normalizeSeedance2Resolution,
  submittedSeedance2ResultRatio,
  removeLegacySeedance2TextNodes,
  resolveSeedance2WorkflowRatio,
  resolveSeedance2WorkflowRatioSelection,
  seedance2DisplayResultNodeIds,
  seedance2LayoutRatioFromImageNode,
  seedance2PlaceholderSize,
  seedance2ResultSizeFromSourceHeight,
  seedance2ResultVersionsForNode,
} from "../utils/seedance2-workflow";
import {
  seedance2RatioFromNaturalSize,
  seedance2SourceRatioFromNaturalSize,
} from "../utils/seedance2-responsive-layout";
import {
  buildSeedance2CustomerVideoPayload as buildSharedSeedance2CustomerVideoPayload,
  dispatchCustomerVideoPayload,
  type Seedance2CustomerVideoPayload as SharedSeedance2CustomerVideoPayload,
  type Seedance2CustomerVideoReference,
} from "../utils/customer-video-adapter";
import { formatCustomerVideoRequestError } from "../utils/customer-video-errors";
import {
  customerVideoTaskError,
  customerVideoTaskFileUrls,
  customerVideoTaskPollDisposition,
  requireCustomerVideoTask,
  type CustomerVideoTask,
} from "../utils/customer-video-task";
import {
  planSeedance2ReferenceConnection,
  resolveSeedance2ReferenceSlots,
  seedance2CanOccupyReferenceSlot,
  seedance2ManualReferenceHighestSlotIndex,
  seedance2ResolvedSlotsToCustomerReferences,
  type Seedance2ResolvedReferenceSlot,
} from "../utils/seedance2-reference-slots";
import {
  hydrateSeedance2CustomerReferencesForTransport,
  resolveSeedance2ReferenceTransportValue,
} from "../utils/seedance2-reference-transport";
import {
  assertStoryVideoPlaceholderCapability,
  bindSeedance2StoryDirectorSource,
  buildStoryDirectorSlicePlaceholders,
  buildVersionedStoryDirectorSlicePlaceholders,
  collectSeedance2StoryRewriteInput,
  commitSeedance2PlaceholderSetAtomic,
  findSeedance2StoryDirectorSource,
  reconcileSeedance2StoryPlaceholderReferences,
  retainStoryAutoConnectionsForSupportedTargets,
  resolveSeedance2StoryDirectorSource,
  seedance2StoryShotCountDisplay,
  type Seedance2StoryDirectorSourceResolution,
  seedance2UserPromptPatch,
} from "../utils/seedance2-story-integration";
import {
  createSeedance2PromptRewriteFingerprint,
  rewriteSeedance2BatchPrompts,
  safeSeedance2PromptRewriteError,
  validSeedance2PromptRewriteCheckpoint,
} from "../utils/seedance2-prompt-rewrite";
import {
  buildCanvasResourceReferences,
  buildNodeMentionReferences,
  type CanvasResourceReference,
} from "../utils/canvas-resource-references";
import { canvasViewportRuntime } from "../utils/canvas-viewport-runtime";
import { isCanvasOverlayTarget } from "../utils/canvas-overlay-popup";
import { formatCanvasGenerationError, withCanvasErrorMessageKey } from "../utils/canvas-errors";
import {
  canvasImageOperationCapabilityError,
  legacyCanvasImageGenerationType,
  resolveCanvasImageOperation,
  resolveCanvasImageOperationOptions,
  resolveStoryWorkflowImageOperation,
} from "../utils/canvas-image-operation";
import {
  buildSeedance2PromptTextModelValues,
  resolveSeedance2PromptTextModel as resolveSeedance2PromptTextModelValue,
  type Seedance2PromptTextModelInput,
} from "../utils/seedance2-text-model";
import {
  hasCustomStoryDirectorTextModel,
  resolveStoryDirectorImageModelSelection,
  resolveStoryDirectorTextModelSelection,
  storyDirectorEditableText,
  type StoryDirectorTextModelSelection,
} from "../utils/story-director-text-model";
import { wiredStoryDirectorModels } from "../utils/story-director-wired-models";
import { normalizeStoryImageQuality } from "../utils/story-image-quality";
import { selectStoryDirectorShotRetryWork } from "../utils/story-director-shot-retry-selection";
import {
  hasCompleteCharacterDerivedViews,
  splitAndStoreCharacterTurnaroundSheet,
} from "../utils/character-turnaround-views";
import {
  selectStoryImageReferences,
  type StoryImageReferenceCandidate,
  type StoryImageReferenceSelection,
} from "../utils/story-image-reference-selection";
import {
  buildStoryImageReferenceDelivery,
  type StoryImageReferenceDeliveryOptions,
  type StoryImageReferenceDeliverySnapshot,
} from "../utils/story-image-reference-delivery";
import { resolveStoryImageReferenceReplay } from "../utils/story-image-reference-replay";
import {
  buildLegacyStoryReferenceLines,
  buildStoryImagePromptPlanForResolvedOperation,
} from "../utils/story-image-prompt-policy";
import { migrateLegacyStoryCharacterAssets } from "../utils/story-character-asset-migration";
import { classifyStorySceneReferenceCandidates } from "../utils/story-scene-reference-candidates";
import { storyShotHasReferenceIntent } from "../utils/story-shot-reference-intent";
import {
  resolveStoryImageGenerationSource,
  type StoryImageWorkflow,
} from "../utils/story-image-generation-route";
import {
  CanvasNodeType,
  restoreCanvasVideoGenerationTask,
  snapshotCanvasVideoGenerationTask,
  STORY_DIRECTOR_INPUT_HANDLES,
  type CanvasAssistantImage,
  type CanvasAssistantSession,
  type CanvasConnection,
  type CanvasImageGenerationType,
  type CanvasImageOperation,
  type CanvasNodeData,
  type CanvasNodeMetadata,
  type CanvasVideoGenerationAttempt,
  type CanvasVideoGenerationTask,
  type StoryCharacter,
  type StoryDirectorInputKind,
  type StoryImageReferenceSemanticSnapshot,
  type StoryScene,
  type StoryShot,
  type ConnectionHandle,
  type ContextMenuState,
  type Position,
  type Seedance2ReferenceSlotUseAs,
  type SelectionBox,
  type ViewportTransform,
} from "../types";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type CanvasClipboard = {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
};

type PendingConnectionCreate = {
  connection: ConnectionHandle;
  position: Position;
};

type ConnectionDropTarget = {
  nodeId: string | null;
  handleId?: string | null;
  isNearNode: boolean;
};

type CanvasHistoryEntry = Pick<CanvasClipboard, "nodes" | "connections"> & {
  chatSessions: CanvasAssistantSession[];
  activeChatId: string | null;
  backgroundMode: CanvasBackgroundMode;
  showImageInfo: boolean;
};

type CanvasReferenceGenerationPreset = {
  title?: string;
  prompt?: string;
  size?: string;
  quality?: AiConfig["quality"];
  count?: number;
  successMessage?: string;
  imageOperation: CanvasImageOperation;
};

type StoryDirectorConfigKind = "analysis" | "character" | "shot";
type StoryAnalysisResult = {
  characters: StoryCharacter[];
  scenes: StoryScene[];
  shots: StoryShot[];
};

function outpaintPreset(size: string): CanvasReferenceGenerationPreset {
  const sizeLabel = size === "auto" ? "自定义比例" : size;
  const ratioInstruction =
    size === "auto"
      ? "目标画幅比例使用右侧图片参数中的尺寸设置；如需自定义，请在生成配置里输入比例后再生成。"
      : `目标画幅比例为 ${size}。`;
  return {
    imageOperation: "edit",
    title: `画面扩展 ${sizeLabel}`,
    size,
    quality: "high",
    count: 1,
    prompt: `以参考图片为基础进行 AI 画面扩展。${ratioInstruction}
保持原图主体、主体比例、镜头视角、光线方向、色彩、材质和整体风格一致；只补全画布外延区域，让新增区域自然延续原有环境、背景和纹理。不要裁切主体，不要改变核心物体形状，不要新增无关元素。`,
    successMessage: "已创建画面扩展配置",
  };
}

function enhancePreset(
  title: string,
  detail: string,
  quality: AiConfig["quality"] = "high",
): CanvasReferenceGenerationPreset {
  return {
    imageOperation: "edit",
    title,
    size: "auto",
    quality,
    count: 1,
    prompt: `以参考图片为准进行 ${title}。${detail}
保持原图主体、构图、姿态、颜色关系、画面风格和比例一致，不要新增无关元素，不要改变人物身份或物体形状。输出自然、干净、细节更好的版本。`,
    successMessage: `已创建${title}配置`,
  };
}

function styleTransferPreset(
  title: string,
  style: string,
): CanvasReferenceGenerationPreset {
  return {
    imageOperation: "edit",
    title,
    size: "auto",
    quality: "high",
    count: 1,
    prompt: `参考图片中的主体、构图、空间关系和关键内容保持一致，将画面转换为${style}。保留主体身份、姿态、物体结构和画面重心，统一光影、色彩、材质和氛围，让结果像完整的新作品而不是滤镜。`,
    successMessage: `已创建${title}配置`,
  };
}

function preserveStyleRegenerationPreset(): CanvasReferenceGenerationPreset {
  return {
    imageOperation: "edit",
    title: "保持风格重绘",
    size: "auto",
    quality: "high",
    count: 1,
    prompt: `以参考图片的视觉风格为强约束进行重绘。保持其色彩体系、光影语言、材质表现、笔触或摄影质感与整体氛围一致；主体内容和细节按你在本配置节点中补充的要求生成。不要把多张参考图中的主体无条件合并到同一画面。`,
    successMessage: "已创建保持风格重绘配置，请补充需要生成的内容",
  };
}

function preserveCompositionRegenerationPreset(): CanvasReferenceGenerationPreset {
  return {
    imageOperation: "edit",
    title: "保持构图重绘",
    size: "auto",
    quality: "high",
    count: 1,
    prompt: `以参考图片的构图为强约束进行重绘。保持镜头视角、景别、主体位置、画面重心、透视关系、留白和空间层次稳定；主体内容、风格与细节按你在本配置节点中补充的要求生成。不要把多张参考图中的主体无条件合并到同一画面。`,
    successMessage: "已创建保持构图重绘配置，请补充需要生成的内容",
  };
}

function promptedReferenceGenerationPreset(): CanvasReferenceGenerationPreset {
  return {
    imageOperation: "edit",
    title: "指定 Prompt 生成",
    size: "auto",
    quality: "high",
    count: 1,
    prompt: "请在这里补充本次生成的具体 Prompt，并说明每张已连接参考图的用途；未说明用途的参考图只作为视觉参考，不应把所有主体合并到一张图中。",
    successMessage: "已创建 Prompt 配置，请填写具体生成要求",
  };
}

const VIDEO_NODE_MAX_WIDTH = 420;
const VIDEO_NODE_MAX_HEIGHT = 420;
const CONNECTION_HANDLE_HIT_RADIUS = 40;
const CONNECTION_NODE_HIT_PADDING = 32;
const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;
const NODE_STATUS_ERROR = "error" as const;

function isCanvasNodeGenerating(node: CanvasNodeData) {
  const metadata = node.metadata;
  return (
    metadata?.status === NODE_STATUS_LOADING ||
    metadata?.storyAnalysisStatus === NODE_STATUS_LOADING ||
    metadata?.storyGenerationStatus === NODE_STATUS_LOADING ||
    metadata?.seedanceGenerationTaskState?.status === "generating"
  );
}

function expandCanvasNodeDeletionIds(
  nodes: readonly CanvasNodeData[],
  ids: ReadonlySet<string>,
) {
  const allIds = new Set(ids);
  nodes.forEach((node) => {
    if (ids.has(node.id))
      node.metadata?.batchChildIds?.forEach((childId) => allIds.add(childId));
  });
  return allIds;
}

const CANVAS_IMAGE_TASK_POLL_INTERVAL_MS = 2_000;
const CANVAS_IMAGE_TASK_POLL_RETRY_LIMIT = 15;
const CANVAS_IMAGE_TASK_MISSING_GRACE_MS = 360_000;
const localCanvasImageTasks = new Map<string, Promise<GeneratedImageResult>>();
// The browser submits one generation request at a time. Provider capability
// decides the payload, never client-side parallelism.
const STORY_DIRECTOR_IMAGE_CONCURRENCY = 1;
const STORY_DIRECTOR_VIDEO_CONCURRENCY = 1;
const STORY_DIRECTOR_SHOT_COLUMNS = 5;
const STORY_DIRECTOR_SHOT_NODE_WIDTH = 340;
const STORY_DIRECTOR_SHOT_NODE_HEIGHT = 604;
const STORY_DIRECTOR_SHOT_COLUMN_GAP = 96;
const STORY_DIRECTOR_SHOT_ROW_GAP = 112;
const STORY_DIRECTOR_DEFAULT_IMAGE_RATIO = "16:9";
const DEFAULT_VIEWPORT: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_SHORTCUT_EVENT = "canvas:open-shortcuts";
const CANVAS_FILE_GRID_GAP_X = 420;
const CANVAS_FILE_GRID_GAP_Y = 320;
const CANVAS_RESTORE_TIMEOUT_MS = 4_000;
const CANVAS_RESTORE_ITEM_TIMEOUT_MS = 800;
const CANVAS_RECOVERY_SOURCE_TIMEOUT_MS = 12_000;
const CANVAS_RESTORE_CHUNK_SIZE = 6;
const XIAOJUN_TEACHER_RECOVERY_PROJECT_ID = "gqtgAPRgMApfbQ0Ar0iJq__merged_admin";
const XIAOJUN_TEACHER_RECOVERY_ALIASES = new Set([
  XIAOJUN_TEACHER_RECOVERY_PROJECT_ID,
  "LbX3osypY358Ls3Fo6nRu",
  "tolznormmht5E4hmRGeol",
  "LIlrXgC-CX-o_2zPKlT0e",
]);
const DEFAULT_CUSTOMER_VIDEO_API_BASE = "";
const CUSTOMER_VIDEO_TASK_POLL_INTERVAL_MS = 5_000;
const CUSTOMER_VIDEO_TASK_POLL_RETRY_LIMIT = 120;
const VIDEO_TASK_POLL_INTERVAL_MS = 2_500;
const VIDEO_TASK_AUTO_RESUME_DELAY_MS = 2_500;
const VIDEO_TASK_TRANSIENT_POLL_RETRY_ATTEMPTS = 3;
const VIDEO_TASK_TRANSIENT_POLL_RETRY_BASE_MS = 1_000;
const SEEDANCE2_CREATION_FALLBACK_RATIO = "9:16";
const SEEDANCE2_CREATION_RATIO_VALUES = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"] as const;
const CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS = { retained: true } as const;

function snapshotCreatedCanvasVideoTask(
  task: VideoGenerationTask,
  startedAt: string,
  attemptId: string,
  operation: VideoGenerationOperation,
): CanvasVideoGenerationTask {
  const snapshot = snapshotCanvasVideoGenerationTask(task, startedAt, attemptId);
  if (task.route?.mode !== "local") return snapshot;
  if (!snapshot.providerId || !snapshot.credentialId) {
    throw new Error("视频任务已创建，但当前 Provider 凭据缺少稳定标识，无法保存安全恢复快照");
  }
  const strict = createCanvasVideoTaskProviderSnapshot({
    provider: task.route.provider,
    model: task.model,
    credentialId: snapshot.credentialId,
    operation,
  });
  if (strict.status === "blocked") throw new Error(strict.message);
  return { ...snapshot, providerSnapshot: strict.snapshot };
}
const HIDE_CANVAS_NODE_HOVER_TOOLBAR = true;
function shouldLoadXiaojunTeacherRecovery(
  projectId: string,
  project?: CanvasProject | null,
) {
  if (!XIAOJUN_TEACHER_RECOVERY_ALIASES.has(projectId)) return false;
  return !project || project.nodes.length === 0;
}

async function loadXiaojunTeacherRecoveryProject(
  projectId: string,
): Promise<CanvasProject | null> {
  try {
    const response = await fetch("/recovery/xiaojun-teacher-project.json", {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { project?: Partial<CanvasProject> };
    const project = payload.project;
    if (!project || !Array.isArray(project.nodes)) return null;
    const now = new Date().toISOString();
    return {
      id: projectId,
      title:
        projectId === XIAOJUN_TEACHER_RECOVERY_PROJECT_ID
          ? "小军老师恢复画布"
          : "恢复的画布项目",
      createdAt: project.createdAt || now,
      updatedAt: now,
      nodes: project.nodes,
      connections: Array.isArray(project.connections) ? project.connections : [],
      chatSessions: Array.isArray(project.chatSessions) ? project.chatSessions : [],
      activeChatId: project.activeChatId || null,
      backgroundMode: project.backgroundMode || "lines",
      showImageInfo: Boolean(project.showImageInfo),
      viewport: project.viewport || DEFAULT_VIEWPORT,
    };
  } catch {
    return null;
  }
}

const IMAGE_PROMPT_REVERSE_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`;

const STORY_DIRECTOR_PLACEHOLDER = `在这里粘贴小说、章节或剧情梗概。

建议包含：人物、场景、关键事件、对白、画风要求。`;

function canvasPreviewableSrc(node?: CanvasNodeData | null) {
  if (!node) return "";
  const meta = node.metadata || {};
  const candidates = [meta.content, meta.backendUrl];
  for (const candidate of candidates) {
    const src = String(candidate || "").trim();
    if (/^(data:image\/|blob:|https?:\/\/|\/)/i.test(src)) return src;
  }
  return "";
}

function canvasPreviewPrompt(node?: CanvasNodeData | null) {
  if (!node) return "";
  return String(node.metadata?.prompt || node.metadata?.storyText || "").trim();
}

function createCanvasNode(
  type: CanvasNodeType,
  position: Position,
  metadata?: CanvasNodeMetadata,
): CanvasNodeData {
  const spec = getNodeSpec(type);
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    type,
    title: spec.title,
    position: {
      x: position.x - spec.width / 2,
      y: position.y - spec.height / 2,
    },
    width: spec.width,
    height: spec.height,
    metadata: { ...spec.metadata, ...metadata },
  };
}

function createSeedance2VideoPlaceholderNode(
  position: Position,
  options: {
    sourceImageNode?: CanvasNodeData;
    model?: string;
    modelProviderId?: string;
    ratio?: string;
    duration?: string;
    prompt?: string;
    shotIndex?: number;
  } = {},
): CanvasNodeData {
  const sourceRatio = options.sourceImageNode
    ? seedance2LayoutRatioFromImageNode(options.sourceImageNode)
    : "";
  const ratio = normalizeSeedance2AspectRatio(
    options.ratio || sourceRatio || "16:9",
  );
  const metadata = createSeedance2VideoPlaceholderMetadata({
    model: options.model,
    modelProviderId: options.modelProviderId,
    ratio,
    duration: options.duration || "5",
    sourceImageNode: options.sourceImageNode,
    shotIndex: options.shotIndex || 1,
    prompt:
      options.prompt ||
      (options.sourceImageNode
        ? "基于上游图片生成视频，保持主体、构图、场景和光线一致，增加自然运动和镜头变化。"
        : "描述当前镜头的视频内容。"),
  });
  const size = seedance2PlaceholderSize(ratio);
  const node = createCanvasNode(CanvasNodeType.Video, position, metadata);
  return {
    ...node,
    title: options.sourceImageNode
      ? "Seedance2 图片转视频"
      : "分镜视频占位框",
    width: size.width,
    height: size.height,
    metadata,
  };
}

function seedance2ReferenceSlotOrientation(node: CanvasNodeData): "9:16" | "16:9" {
  const followsSource =
    node.metadata?.seedanceInheritSourceRatio !== false &&
    !node.metadata?.seedanceRatioTouched;
  const ratio = normalizeSeedance2AspectRatio(
    followsSource
      ? node.metadata?.seedanceSourceAspectRatio || node.metadata?.seedanceRatio || node.metadata?.size || "9:16"
      : node.metadata?.seedanceRatio || node.metadata?.size || "9:16",
  );
  return ratio === "9:16" ? "9:16" : "16:9";
}

function seedance2OccupiedReferenceSlotCount(
  placeholder: CanvasNodeData,
  connections: readonly CanvasConnection[],
) {
  const highestConnectedSlot = connections.reduce(
    (highest, connection) =>
      connection.toNodeId === placeholder.id
        ? Math.max(highest, Number(connection.referenceSequence || 0))
        : highest,
    0,
  );
  return Math.max(
    seedance2ManualReferenceHighestSlotIndex(placeholder),
    highestConnectedSlot,
  );
}

function resolveSeedance2CreationRatio(configuredSize?: string | null) {
  const normalized = String(configuredSize || "").trim();
  return SEEDANCE2_CREATION_RATIO_VALUES.includes(
    normalized as (typeof SEEDANCE2_CREATION_RATIO_VALUES)[number],
  )
    ? normalized
    : SEEDANCE2_CREATION_FALLBACK_RATIO;
}

type Seedance2CustomerVideoPayload = SharedSeedance2CustomerVideoPayload & {
  model: string;
  provider: "auto";
};

type CustomerVideoTaskResponse = CustomerVideoTask & {
  success?: boolean;
  task_id?: string;
  video_id?: string;
  id?: string;
  message?: string;
  code?: string;
  task?: CustomerVideoTask & { video_id?: string };
  tasks?: CustomerVideoTask[];
  url?: string;
  video_url?: string;
  video?: { url?: string };
};

type Seedance2ResultInsertOptions = {
  url: string;
  taskId?: string;
  files?: string[];
  fileUrls?: string[];
  /** 本地媒体存储键；结果节点持久化后可恢复播放。 */
  storageKey?: string;
  mimeType?: string;
  watermarkRemoved?: boolean;
  paramsSnapshot?: Record<string, unknown>;
  /** Provider batch position; keeps multiple outputs from one task distinct. */
  resultIndex?: number;
  resultCount?: number;
};

function seedance2ResultsForPlaceholder(
  placeholderId: string,
  nodes: CanvasNodeData[],
) {
  return nodes.filter(
    (node) =>
      node.metadata?.seedanceWorkflowRole === "result" &&
      node.metadata?.seedanceSourcePlaceholderId === placeholderId,
  );
}

function nextSeedance2ResultVersion(
  placeholder: CanvasNodeData,
  nodes: CanvasNodeData[],
) {
  const resultVersions = seedance2ResultsForPlaceholder(placeholder.id, nodes)
    .map((node) => Number(node.metadata?.seedanceVersion || 0))
    .filter((version) => Number.isFinite(version) && version > 0);
  const metadataVersions = (placeholder.metadata?.seedanceGeneratedVersions || [])
    .map((entry) => Number(entry.version || 0))
    .filter((version) => Number.isFinite(version) && version > 0);
  return Math.max(0, ...resultVersions, ...metadataVersions) + 1;
}

function createSeedance2ResultVideoNode(
  sourcePlaceholder: CanvasNodeData,
  existingResults: CanvasNodeData[],
  options: Seedance2ResultInsertOptions & { version: number },
): CanvasNodeData {
  const ratio = submittedSeedance2ResultRatio({
    paramsSnapshot: options.paramsSnapshot,
    sourcePlaceholder,
  });
  const size = seedance2ResultSizeFromSourceHeight(sourcePlaceholder.height, ratio);
  const metadata = createSeedance2ResultMetadata({
    sourcePlaceholder,
    version: options.version,
    url: options.url,
    taskId: options.taskId,
    files: options.files || [],
    fileUrls: options.fileUrls?.length ? options.fileUrls : [options.url],
    ...(options.storageKey ? { storageKey: options.storageKey } : {}),
    paramsSnapshot: { ...(options.paramsSnapshot || {}), ratio },
  });
  return {
    id: `video-seedance2-result-${sourcePlaceholder.id}-${options.version}-${nanoid()}`,
    type: CanvasNodeType.Video,
    title: `生成结果 V${options.version}`,
    position: nextSeedance2ResultPosition(sourcePlaceholder, existingResults, ratio),
    width: size.width,
    height: size.height,
    metadata: {
      ...metadata,
      modelProviderId:
        sourcePlaceholder.metadata?.modelProviderId ||
        sourcePlaceholder.metadata?.videoGenerationScope?.providerId,
      seedanceWorkflowRole: "result",
      seedanceSourcePlaceholderId: sourcePlaceholder.id,
      backendUrl: options.url,
      mimeType: options.mimeType || "video/mp4",
      source: "customer-video-api",
      watermarkRemoved: options.watermarkRemoved,
      videoResultIndex: options.resultIndex ?? 0,
      videoResultCount: options.resultCount ?? 1,
    },
  };
}

function insertSeedance2ResultNode(
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
  placeholder: CanvasNodeData,
  resultOptions: Seedance2ResultInsertOptions,
) {
  const currentPlaceholder = nodes.find((node) => node.id === placeholder.id) || placeholder;
  const existingResults = seedance2ResultsForPlaceholder(currentPlaceholder.id, nodes);
  const resultIndex = resultOptions.resultIndex ?? 0;
  const existingTaskResult = resultOptions.taskId
    ? existingResults.find(
        (node) =>
          node.metadata?.seedanceTaskId === resultOptions.taskId &&
          (node.metadata?.videoResultIndex ?? 0) === resultIndex,
      )
    : undefined;
  if (existingTaskResult) {
    return { nodes, connections, resultNode: existingTaskResult };
  }
  const version = nextSeedance2ResultVersion(currentPlaceholder, nodes);
  const resultNode = createSeedance2ResultVideoNode(
    currentPlaceholder,
    existingResults,
    { ...resultOptions, version },
  );
  const fileUrls = resultOptions.fileUrls?.length
    ? resultOptions.fileUrls
    : [resultOptions.url];
  const generatedVersions = [
    ...(currentPlaceholder.metadata?.seedanceGeneratedVersions || []),
    {
      nodeId: resultNode.id,
      version,
      url: resultOptions.url,
      ratio: resultNode.metadata?.seedanceRatio || "16:9",
      duration: String(resultNode.metadata?.seedanceDuration || "15"),
      taskId: resultOptions.taskId,
      createdAt: String(resultNode.metadata?.seedanceCreatedAt || new Date().toISOString()),
    },
  ];
  const nextNodes = nodes.map((node) =>
    node.id === currentPlaceholder.id
      ? {
          ...node,
          metadata: {
            ...node.metadata,
            status: NODE_STATUS_SUCCESS,
            content: "",
            errorDetails: undefined,
            seedanceTaskId: resultOptions.taskId,
            seedanceFileUrls: fileUrls,
            seedanceFiles: resultOptions.files || [],
            seedanceGenerationTaskState: {
              status: "success" as const,
              taskId: resultOptions.taskId,
            },
            videoGenerationTask: undefined,
            videoGenerationAttempt: undefined,
            seedanceResultNodeIds: [
              ...(node.metadata?.seedanceResultNodeIds || []),
              resultNode.id,
            ],
            seedanceLatestResultNodeId: resultNode.id,
            seedanceGeneratedVersions: generatedVersions,
            watermarkRemoved: resultOptions.watermarkRemoved,
            source: "customer-video-api",
          },
        }
      : node,
  );
  return {
    nodes: [...nextNodes, resultNode],
    connections: [
      ...connections,
      {
        id: nanoid(),
        fromNodeId: currentPlaceholder.id,
        toNodeId: resultNode.id,
      },
    ],
    resultNode,
  };
}

type CustomerSeedanceResultMaterializationOptions = {
  nodes: CanvasNodeData[];
  connections: CanvasConnection[];
  placeholder: CanvasNodeData;
  task: CustomerVideoTask;
  taskId: string;
  baseUrl: string;
  paramsSnapshot: Record<string, unknown>;
  route?: ApiRequestRoute;
  storeVideo?: typeof storeGeneratedVideo;
};

export async function materializeCustomerSeedanceTaskResults({
  nodes,
  connections,
  placeholder,
  task,
  taskId,
  baseUrl,
  paramsSnapshot,
  route,
  storeVideo = storeGeneratedVideo,
}: CustomerSeedanceResultMaterializationOptions) {
  const serverFileUrls = customerVideoTaskFileUrls(task, baseUrl);
  const uploadedVideos: UploadedFile[] = [];
  for (const url of serverFileUrls) {
    uploadedVideos.push(await storeVideo({ url }, route));
  }
  if (!uploadedVideos.length) {
    throw new Error("视频任务完成但没有可落盘的结果");
  }
  const fileUrls = uploadedVideos.map((video) => video.url);
  const graph = uploadedVideos.reduce(
    (current, uploaded, resultIndex) =>
      insertSeedance2ResultNode(current.nodes, current.connections, placeholder, {
        url: uploaded.url,
        taskId,
        files: Array.isArray(task.files) ? task.files : [],
        fileUrls,
        storageKey: uploaded.storageKey,
        mimeType: uploaded.mimeType,
        watermarkRemoved: task.watermark_removed,
        paramsSnapshot,
        resultIndex,
        resultCount: uploadedVideos.length,
      }),
    { nodes, connections },
  );
  return { ...graph, uploadedVideos };

}

type CustomerVideoApiConfig = {
  baseUrl: string;
  credentialId?: string;
  model?: string;
  route?: ApiRequestRoute;
  providerList?: readonly ApiRelayProvider[];
};

type CustomerVideoAttempt = VideoGenerationAttempt &
  Pick<CanvasVideoGenerationAttempt, "providerSnapshot">;

type CustomerVideoLocalCredential = {
  readonly provider: ApiRelayProvider;
  readonly credentialId: string;
};

function selectCustomerVideoLocalCredential(
  apiConfig: CustomerVideoApiConfig,
): CustomerVideoLocalCredential | undefined {
  if (apiConfig.route?.mode !== "local") return undefined;
  const provider = apiConfig.route.provider;
  const credentialId = rotateRelayCredentialId(provider);
  if (!credentialId) {
    throw new Error(
      "当前视频 Provider 凭据缺少稳定标识，无法安全提交可恢复任务",
    );
  }
  return { provider, credentialId };
}

function pinCustomerVideoApiConfigToCredential(
  apiConfig: CustomerVideoApiConfig,
  credentialId: string,
): CustomerVideoApiConfig {
  if (apiConfig.route?.mode !== "local") return apiConfig;
  return {
    ...apiConfig,
    baseUrl: apiConfig.route.provider.baseUrl,
    credentialId,
    model: apiConfig.route.model,
  };
}

function normalizeCustomerVideoApiBase(value?: string) {
  const raw = String(value || "").trim() || DEFAULT_CUSTOMER_VIDEO_API_BASE;
  return (
    raw
      .replace(/\/+$/, "")
      .replace(/\/v1\/videos\/generations$/i, "") || DEFAULT_CUSTOMER_VIDEO_API_BASE
  );
}

// canvas-customer-video-contract:start
function firstCustomerVideoString(...values: unknown[]) {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
}

export function splitCustomerVideoPath(path: string) {
  const raw = String(path || "");
  const queryIndex = raw.indexOf("?");
  if (queryIndex < 0) return { pathname: raw, query: "" };
  return { pathname: raw.slice(0, queryIndex), query: raw.slice(queryIndex + 1) };
}

export function joinCustomerVideoRequestUrl(input: {
  path: string;
  baseUrl?: string;
  localProxyUrl?: string;
}) {
  const { pathname, query } = splitCustomerVideoPath(input.path);
  const querySuffix = query ? `?${query}` : "";
  if (input.localProxyUrl !== undefined) {
    const proxy = String(input.localProxyUrl || "").replace(/\/+$/, "") || "/";
    return `${proxy}${querySuffix}`;
  }
  const rawBase = String(input.baseUrl || "").trim();
  if (!rawBase) throw new Error("未配置视频中转，请到设置中选择视频模型");
  const host = hostnameOfCustomerVideoBase(rawBase);
  const pathName = pathname.replace(/^\/+/, "");
  const officialAgnesRoot =
    pathName.toLowerCase() === "agnesapi" &&
    (host === "apihub.agnes-ai.com" || host === "agnes-ai.com" || host.endsWith(".agnes-ai.com"));
  if (officialAgnesRoot) {
    const origin = originOfCustomerVideoBase(rawBase);
    if (!origin) throw new Error("未配置视频中转，请到设置中选择视频模型");
    return `${origin}/agnesapi${querySuffix}`;
  }
  const apiBase = ensureCustomerVideoV1Base(rawBase, host);
  if (!apiBase) throw new Error("未配置视频中转，请到设置中选择视频模型");
  const suffix = `/${pathName}${querySuffix}`;
  return `${apiBase}${suffix}`;
}

function ensureCustomerVideoV1Base(baseUrl: string, host: string) {
  const trimmed = String(baseUrl || "").replace(/\/+$/, "");
  const officialHost = host === "api.openai.com" || host === "apihub.agnes-ai.com";
  if (!officialHost) return trimmed;
  try {
    const url = new URL(trimmed);
    const current = url.pathname.replace(/\/+$/, "");
    if (!current || current === "/") url.pathname = "/v1";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed;
  }
}

function hostnameOfCustomerVideoBase(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function originOfCustomerVideoBase(baseUrl: string) {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return String(baseUrl || "").replace(/\/+$/, "");
  }
}

export function parseCustomerVideoHttpBody(input: {
  ok: boolean;
  status: number;
  contentType: string;
  bytes: Uint8Array;
  sniffMedia: (bytes: Uint8Array) => string;
  createObjectUrl: (blob: Blob) => string;
}) {
  const bytes = input.bytes;
  let i = 0;
  while (i < bytes.length && bytes[i] <= 32) i += 1;
  const start = bytes[i];
  const looksJson = start === 0x7b || start === 0x5b || start === 0x22;
  const contentType = String(input.contentType || "").toLowerCase();
  const sniffed = input.sniffMedia(bytes);
  const isVideo = sniffed.startsWith("video/") || contentType.includes("video/");
  if (input.ok && !looksJson && isVideo && bytes.length > 32) {
    const type = sniffed.startsWith("video/")
      ? sniffed
      : contentType.includes("video/")
        ? contentType.split(";")[0]!.trim() || "video/mp4"
        : "video/mp4";
    const blobUrl = input.createObjectUrl(new Blob([bytes.slice()], { type }));
    return {
      ok: true,
      status: input.status,
      data: {
        success: true,
        url: blobUrl,
        video_url: blobUrl,
        video: { url: blobUrl },
        content: { video_url: blobUrl },
      },
    };
  }
  const rawText = new TextDecoder("utf-8").decode(bytes);
  let raw = {} as Record<string, unknown>;
  try {
    if (rawText.trim()) raw = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      status: input.status,
      data: { success: false, message: rawText.slice(0, 240) || "视频响应不是 JSON" },
    };
  }
  const nestedVideo = raw.video && typeof raw.video === "object" ? (raw.video as { url?: string }) : undefined;
  const nestedContent = raw.content && typeof raw.content === "object" ? (raw.content as { video_url?: string }) : undefined;
  const nestedMetadata = raw.metadata && typeof raw.metadata === "object" ? (raw.metadata as { url?: string }) : undefined;
  const requestId = firstCustomerVideoString(raw.video_id, raw.task_id, raw.request_id, raw.id);
  const videoUrl = firstCustomerVideoString(
    nestedMetadata?.url,
    nestedContent?.video_url,
    nestedVideo?.url,
    raw.url,
    raw.video_url,
  );
  return {
    ok: input.ok,
    status: input.status,
    data: {
      ...raw,
      success: raw.success !== false,
      task_id: requestId || raw.task_id,
      id: requestId || raw.id,
      ...(videoUrl
        ? {
            url: videoUrl,
            video_url: videoUrl,
            file_urls: [videoUrl],
            content: { ...(nestedContent || {}), video_url: videoUrl },
          }
        : {}),
    },
  };
}

export function customerVideoCreatedTaskId(data: {
  video_id?: string;
  task_id?: string;
  request_id?: string;
  id?: string;
  task?: { video_id?: string; task_id?: string; id?: string };
}) {
  return firstCustomerVideoString(
    data.video_id,
    data.task?.video_id,
    data.task_id,
    data.task?.task_id,
    data.task?.id,
    data.id,
    data.request_id,
  );
}

function customerVideoHost(value?: string) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function canvasCustomerVideoSubmitGuard(input: {
  hasLocalAdapter: boolean;
  isLocalRoute: boolean;
  adapterType?: string;
  model?: string;
  baseUrl?: string;
  operation?: string;
  prompt: string;
  references: Array<{ useAs?: string; value?: string }>;
  videoCount: number;
}): { kind: "native" | "customer" | "block"; reason?: string } {
  if (!input.isLocalRoute) {
    return {
      kind: "block",
      reason: "视频 Provider 必须先接入同源后端中转；已阻止浏览器直接发送上游 API Key",
    };
  }
  const host = customerVideoHost(input.baseUrl);
  const firstFrameCount = input.references.filter((item) => item.useAs === "first_frame").length;
  const lastFrameCount = input.references.filter((item) => item.useAs === "last_frame").length;
  const ordinaryReferenceCount = input.references.filter(
    (item) => !item.useAs || item.useAs === "reference_image",
  ).length;
  const isOfficialXai = host === "api.x.ai";
  if (isOfficialXai && lastFrameCount > 0) {
    return {
      kind: "block",
      reason: "xAI 官方视频不支持首尾帧模式；官方 generation 只支持单首帧 image 或普通 reference_images 二选一，不会发送 last_frame。请改用单首帧、普通参考图，或支持首尾帧的 provider/model",
    };
  }
  if (isOfficialXai && firstFrameCount > 0 && ordinaryReferenceCount > 0) {
    return {
      kind: "block",
      reason: "xAI 官方视频的 I2V image 与 R2V reference_images 互斥；请选择单首帧或普通参考图，不会混合发送",
    };
  }
  const isOfficialOpenAi = host === "api.openai.com";
  if (isOfficialOpenAi && lastFrameCount > 0) {
    return {
      kind: "block",
      reason: "OpenAI 官方 Videos 不支持尾帧；input_reference 只能作为视频首帧，已阻止提交，不会静默丢弃 last_frame",
    };
  }
  if (input.hasLocalAdapter) return { kind: "native" };
  const labeledFrames = input.references.filter((item) =>
    item.useAs === "first_frame" || item.useAs === "last_frame" || item.useAs === "keyframe",
  );
  const unlabeledOrGeneric = input.references.filter((item) =>
    !item.useAs || item.useAs === "reference_image",
  );
  if (input.videoCount > 0 || unlabeledOrGeneric.length > 0) {
    return {
      kind: "block",
      reason: `当前 customer 视频端点没有显式验证的参考图片或参考视频 serializer/profile；${input.references.length} 张图片、${input.videoCount} 个视频均未提交`,
    };
  }
  if (input.isLocalRoute && labeledFrames.length === 0 && input.references.length === 0) {
    return {
      kind: "block",
      reason: "当前视频 provider/model 没有已验证的原生视频 capability profile/serializer，已阻止故事占位框提交",
    };
  }
  if (!String(input.prompt || "").trim() && labeledFrames.length === 0) {
    return {
      kind: "block",
      reason: "当前 customer 视频端点只开放已验证的纯文本合同，请先填写视频提示词",
    };
  }
  const i2vLike = input.operation === "image-to-video"
    || input.operation === "first-last-frame-to-video"
    || input.operation === "keyframes-to-video";
  if (i2vLike && labeledFrames.length === 0) {
    return {
      kind: "block",
      reason: `当前 customer 视频 serializer 只验证了 text-to-video，不能按 ${input.operation} 提交`,
    };
  }
  if (input.operation && input.operation !== "text-to-video" && !i2vLike) {
    return {
      kind: "block",
      reason: `当前 customer 视频 serializer 只验证了 text-to-video，不能按 ${input.operation} 提交`,
    };
  }
  return { kind: "customer" };
}
// canvas-customer-video-contract:end

function customerVideoApiHeaders(apiConfig: CustomerVideoApiConfig) {
  if (apiConfig.route?.mode !== "local") {
    throw new Error("视频 Provider 必须走同源后端中转；已阻止浏览器直接发送上游 API Key");
  }
  return buildLocalRelayProxyHeaders(
    apiConfig.route.provider,
    "application/json",
    undefined,
    apiConfig.credentialId,
  );
}

function customerVideoPollHeaders(apiConfig: CustomerVideoApiConfig) {
  if (apiConfig.route?.mode !== "local") {
    throw new Error("视频 Provider 必须走同源后端中转；已阻止浏览器直接发送上游 API Key");
  }
  return buildLocalRelayProxyHeaders(
    apiConfig.route.provider,
    undefined,
    undefined,
    apiConfig.credentialId,
  );
}

function customerVideoWireOptions(apiConfig: CustomerVideoApiConfig) {
  const provider = apiConfig.route?.mode === "local" ? apiConfig.route.provider : undefined;
  return {
    adapterType: provider?.adapterType || "",
    model: apiConfig.model,
    baseUrl: provider?.baseUrl || apiConfig.baseUrl,
    protocol: provider?.protocol,
    endpoints: provider?.endpoints,
  };
}

function customerVideoAdapterId(apiConfig: CustomerVideoApiConfig) {
  return resolveVideoAdapter(customerVideoWireOptions(apiConfig));
}

function customerVideoPollPathFor(apiConfig: CustomerVideoApiConfig, taskId: string) {
  const options = customerVideoWireOptions(apiConfig);
  return videoPollPath(customerVideoAdapterId(apiConfig), taskId, options.endpoints, options);
}

function customerVideoUrlForPath(apiConfig: CustomerVideoApiConfig, path: string) {
  const { pathname } = splitCustomerVideoPath(path);
  if (apiConfig.route?.mode === "local") {
    return joinCustomerVideoRequestUrl({
      path,
      localProxyUrl: routedLocalApiUrl(apiConfig.route, pathname || "/"),
    });
  }
  return joinCustomerVideoRequestUrl({
    path,
    baseUrl: apiConfig.baseUrl,
  });
}

function customerVideoPollUrl(taskId: string, apiConfig: CustomerVideoApiConfig) {
  return customerVideoUrlForPath(apiConfig, customerVideoPollPathFor(apiConfig, taskId));
}

function customerVideoContentUrl(path: string, apiConfig: CustomerVideoApiConfig) {
  return customerVideoUrlForPath(apiConfig, path);
}

function customerVideoTaskListUrl(taskId: string, apiConfig: CustomerVideoApiConfig) {
  void taskId;
  return customerVideoUrlForPath(apiConfig, "/tasks");
}

function customerVideoNativePollPath(taskId: string, apiConfig: CustomerVideoApiConfig) {
  return customerVideoPollPathFor(apiConfig, taskId).replace(/^\//, "");
}

function customerVideoTaskFromResponse(data: CustomerVideoTaskResponse, taskId: string) {
  return findCustomerVideoTaskById(data, taskId) || data.task || data;
}

function findCustomerVideoTaskById(data: CustomerVideoTaskResponse, taskId: string) {
  const cleanTaskId = String(taskId || "").trim();
  if (!cleanTaskId) return undefined;
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  return tasks.find((task) => task.task_id === cleanTaskId || task.id === cleanTaskId);
}

function isCustomerVideoTaskEndpointMissing(response: Pick<Response, "status">, data: CustomerVideoTaskResponse) {
  const message = String(data.message || data.code || "").toLowerCase();
  return response.status === 404 || message.includes("not found") || message.includes("page not found");
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function collectCustomerVideoRelayObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || depth > 4) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectCustomerVideoRelayObjects(item, depth + 1));
  }
  const record = value as Record<string, unknown>;
  const haystack = [record.name, record.title, record.label, record.type, record.provider, record.kind]
    .map((item) => String(item || "").toLowerCase())
    .join(" ");
  const hasApiFields = ["baseUrl", "baseURL", "apiBaseUrl", "apiBaseURL", "relayBaseUrl", "endpoint", "url"].some(
    (key) => typeof record[key] === "string",
  );
  const isRelayLike = /relay|openai|compatible|api/.test(haystack) || hasApiFields;
  const children = Object.values(record).flatMap((item) => collectCustomerVideoRelayObjects(item, depth + 1));
  return isRelayLike ? [record, ...children] : children;
}

function pickCustomerVideoRelayField(objects: Record<string, unknown>[], keys: string[]) {
  for (const object of objects) {
    for (const key of keys) {
      const text = firstCustomerVideoString(object[key]);
      if (text) return text;
    }
  }
  return "";
}

function customerVideoGlobalRelayConfig(
  config?: unknown,
  effectiveConfig?: unknown,
  requestedModel: string | ProviderModelSelection = "",
): CustomerVideoApiConfig | null {
  for (const candidate of [effectiveConfig, config]) {
    const record = objectRecord(candidate);
    if (record.channelMode !== "local") continue;
    const route = resolveApiRequestRoute(
      candidate as AiConfig,
      "video",
      requestedModel,
      "videoGeneration",
    );
    if (route.mode === "local") {
      return {
        baseUrl: route.provider.baseUrl,
        model: route.model,
        route,
        providerList: (candidate as AiConfig).apiRelays,
      };
    }
  }
  return null;
}

function buildCustomerVideoApiConfig(
  node: CanvasNodeData,
  config?: unknown,
  effectiveConfig?: unknown,
): CustomerVideoApiConfig {
  const meta = objectRecord(node.metadata);
  const videoScope = objectRecord(meta.videoGenerationScope);
  const scopeModel = firstCustomerVideoString(videoScope.model);
  const requestedModel = firstCustomerVideoString(
    scopeModel,
    meta.seedanceModel,
    meta.model,
  );
  const requestedProviderId = firstCustomerVideoString(
    scopeModel && requestedModel === scopeModel ? videoScope.providerId : "",
    meta.modelProviderId,
  );
  const requestedSelection = requestedProviderId && requestedModel
    ? { providerId: requestedProviderId, model: requestedModel }
    : requestedModel;
  const globalRelayConfig = customerVideoGlobalRelayConfig(
    config,
    effectiveConfig,
    requestedSelection,
  );
  if (globalRelayConfig) return globalRelayConfig;
  const configRecord = objectRecord(config);
  const effectiveRecord = objectRecord(effectiveConfig);
  const relayObjects = [
    ...collectCustomerVideoRelayObjects(config),
    ...collectCustomerVideoRelayObjects(effectiveConfig),
  ];
  const configuredBase = firstCustomerVideoString(
    effectiveRecord.videoApiBaseUrl,
    effectiveRecord.videoBaseUrl,
    effectiveRecord.relayBaseUrl,
    effectiveRecord.relayApiBaseUrl,
    effectiveRecord.apiBaseUrl,
    effectiveRecord.baseUrl,
    effectiveRecord.baseURL,
    configRecord.videoApiBaseUrl,
    configRecord.videoBaseUrl,
    configRecord.relayBaseUrl,
    configRecord.relayApiBaseUrl,
    configRecord.apiBaseUrl,
    configRecord.baseUrl,
    configRecord.baseURL,
    pickCustomerVideoRelayField(relayObjects, [
      "videoApiBaseUrl",
      "videoBaseUrl",
      "relayBaseUrl",
      "relayApiBaseUrl",
      "apiBaseUrl",
      "apiBaseURL",
      "baseUrl",
      "baseURL",
      "endpoint",
      "url",
    ]),
  );
  const nodeEndpoint = firstCustomerVideoString(meta.seedanceApiEndpoint);
  return {
    baseUrl: normalizeCustomerVideoApiBase(configuredBase || nodeEndpoint),
    model: requestedModel,
  };
}

type StoryVideoCapabilityPreview =
  | { state: "resolved"; capability: ResolvedVideoModelCapability }
  | { state: "route_unresolved"; reason: string };

function previewStoryVideoCapabilityForNode(
  node: CanvasNodeData,
  config?: unknown,
  effectiveConfig?: unknown,
): StoryVideoCapabilityPreview {
  let apiConfig: CustomerVideoApiConfig;
  try {
    apiConfig = buildCustomerVideoApiConfig(node, config, effectiveConfig);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { state: "route_unresolved", reason: error.message };
  }
  if (!apiConfig.route) {
    return { state: "route_unresolved", reason: "视频 provider 路由尚未配置" };
  }
  return {
    state: "resolved",
    capability: resolveCanvasVideoModelCapability(
      { apiRelays: [...(apiConfig.providerList || [])] },
      apiConfig.model || "",
      apiConfig.route.mode === "local" ? apiConfig.route.provider : undefined,
    ),
  };
}

function resolveStoryVideoCapabilityForNode(
  node: CanvasNodeData,
  config?: unknown,
  effectiveConfig?: unknown,
): ResolvedVideoModelCapability | undefined {
  const preview = previewStoryVideoCapabilityForNode(node, config, effectiveConfig);
  return preview.state === "resolved" ? preview.capability : undefined;
}

function resolveCapabilityReferenceSlots(
  placeholder: CanvasNodeData,
  nodes: readonly CanvasNodeData[],
  connections: readonly CanvasConnection[],
  config?: unknown,
  effectiveConfig?: unknown,
) {
  const occupiedSlots = resolveSeedance2ReferenceSlots({
    placeholder,
    nodes,
    connections,
    visibleSlotCount: 0,
  });
  const capability = resolveStoryVideoCapabilityForNode(placeholder, config, effectiveConfig);
  if (!capability) return occupiedSlots;
  const currentReferences = seedance2ResolvedSlotsToCustomerReferences(occupiedSlots);
  const operation = resolveStandaloneVideoOperation({
    capability,
    persistedOperation: placeholder.metadata?.videoGenerationScope?.operation,
    hasConnectedImage: currentReferences.length > 0,
  });
  if (!operation) return occupiedSlots;
  // Connections dropped onto a video node carry no explicit purpose. Assign the
  // purpose the resolved operation actually needs (i2v → first frame, r2v →
  // ordinary reference) instead of hard-defaulting every drop to 普通参考.
  const unmarkedNodeIds = new Set(
    connections
      .filter((connection) => connection.toNodeId === placeholder.id && !connection.useAs && connection.referenceUseAsExplicit !== true)
      .map((connection) => connection.fromNodeId),
  );
  const remapSlots = <T extends { nodeId?: string; useAs?: string }>(slots: readonly T[]): T[] => {
    let firstFrameAssigned = false;
    let lastFrameAssigned = false;
    return slots.map((slot) => {
      if (!slot.nodeId || !unmarkedNodeIds.has(slot.nodeId)) return slot;
      if (operation === "reference-to-video" || operation === "text-to-video") return slot;
      if (operation === "first-last-frame-to-video") {
        if (!firstFrameAssigned) {
          firstFrameAssigned = true;
          return { ...slot, useAs: "first_frame" as const };
        }
        if (!lastFrameAssigned) {
          lastFrameAssigned = true;
          return { ...slot, useAs: "last_frame" as const };
        }
        return slot;
      }
      if (!firstFrameAssigned) {
        firstFrameAssigned = true;
        return { ...slot, useAs: "first_frame" as const };
      }
      if (operation === "keyframes-to-video") return { ...slot, useAs: "keyframe" as const };
      return slot;
    });
  };
  const references = seedance2ResolvedSlotsToCustomerReferences(remapSlots(occupiedSlots));
  const videos = buildNodeGenerationInputs(
    placeholder.id,
    [...nodes],
    [...connections],
  ).flatMap((input) => input.video ? [input.video] : []);
  const contract = resolveVideoReferenceSlotContract({
    capability,
    operation,
    references,
    videos,
  });
  return remapSlots(resolveSeedance2ReferenceSlots({
    placeholder,
    nodes,
    connections,
    visibleSlotCount: contract.visibleImageSlotPurposes.length,
    visibleSlotPurposes: contract.visibleImageSlotPurposes,
    automaticConnectionPurpose: contract.nextImageConnectionPurpose,
  }));
}

function buildSeedance2CustomerVideoPayload(
  node: CanvasNodeData,
  references: Seedance2CustomerVideoReference[] = [],
  model = "",
): Seedance2CustomerVideoPayload {
  return {
    ...buildSharedSeedance2CustomerVideoPayload(node, references),
    model,
    provider: "auto",
  };
}

type CustomerVideoRequestResult = {
  ok: boolean;
  status: number;
  data: CustomerVideoTaskResponse;
};

async function executeCustomerVideoRequest(
  apiConfig: CustomerVideoApiConfig,
  options: {
    method: "GET" | "POST";
    nativePath: string;
    browserUrl: string;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<CustomerVideoRequestResult> {
  if (shouldUseNativeRelayVideo()) {
    return withAbortSignal(
      requestNativeRelayVideo<CustomerVideoTaskResponse>({
        method: options.method,
        baseUrl: apiConfig.baseUrl,
        path: options.nativePath,
        body: options.body,
        proxyUrl:
          apiConfig.route?.mode === "local" && apiConfig.route.provider.proxyMode === "custom"
            ? String(apiConfig.route.provider.proxyUrl || "").trim()
            : undefined,
      }),
      options.signal,
    );
  }

  const response = await fetch(options.browserUrl, {
    method: options.method,
    headers:
      options.method === "POST"
        ? customerVideoApiHeaders(apiConfig)
        : customerVideoPollHeaders(apiConfig),
    body: options.body,
    signal: options.signal,
  });
  const buffer = await response.arrayBuffer();
  const parsed = parseCustomerVideoHttpBody({
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    bytes: new Uint8Array(buffer),
    sniffMedia,
    createObjectUrl: (blob) => URL.createObjectURL(blob),
  });
  return {
    ok: parsed.ok,
    status: parsed.status,
    data: parsed.data as CustomerVideoTaskResponse,
  };
}

async function requestCustomerVideoTask(
  payload: Seedance2CustomerVideoPayload,
  apiConfig: CustomerVideoApiConfig,
  signal?: AbortSignal,
) {
  try {
    const response = await dispatchCustomerVideoPayload(payload, (wirePayload) => {
      const request = buildCustomerVideoStudioRequest({
        ...customerVideoWireOptions(apiConfig),
        prompt: wirePayload.prompt,
        duration: wirePayload.duration,
        ratio: wirePayload.ratio,
        resolution: wirePayload.resolution,
        fps: wirePayload.fps,
        generateAudio: wirePayload.generateAudio,
        negative_prompt: wirePayload.negative_prompt,
        first_frame: payload.first_frame,
        last_frame: payload.last_frame,
        operation: wirePayload.mode,
        seed: wirePayload.seed,
        steps: wirePayload.steps,
        guidance: wirePayload.guidance,
        modelVariant: wirePayload.modelVariant,
        watermark: wirePayload.watermark,
        promptExpansion: wirePayload.promptExpansion,
        returnLastFrame: wirePayload.returnLastFrame,
        audioUrl: wirePayload.audioUrl,
        width: wirePayload.width,
        height: wirePayload.height,
      });
      return executeCustomerVideoRequest(apiConfig, {
        method: "POST",
        nativePath: request.path.replace(/^\//, ""),
        browserUrl: customerVideoUrlForPath(apiConfig, request.path),
        body: JSON.stringify(request.body),
        signal,
      });
    });
    const data = response.data;
    if (!response.ok || data.success === false) {
      throw new Error(data.message || data.code || `Video task submit failed (${response.status})`);
    }
    return data;
  } catch (error) {
    if (signal?.aborted) throw abortSignalReason(signal, "视频任务提交已取消");
    throw new Error(formatCustomerVideoRequestError(error, { action: "submit", baseUrl: apiConfig.baseUrl }));
  }
}

async function fetchCustomerVideoTask(
  taskId: string,
  apiConfig: CustomerVideoApiConfig,
  signal?: AbortSignal,
) {
  try {
    const response = await executeCustomerVideoRequest(apiConfig, {
      method: "GET",
      nativePath: customerVideoNativePollPath(taskId, apiConfig),
      browserUrl: customerVideoPollUrl(taskId, apiConfig),
      signal,
    });
    const data = response.data;
    if (!response.ok || data.success === false) {
      if (isCustomerVideoTaskEndpointMissing(response, data)) {
        const listResponse = await executeCustomerVideoRequest(apiConfig, {
          method: "GET",
          nativePath: "tasks",
          browserUrl: customerVideoTaskListUrl(taskId, apiConfig),
          signal,
        });
        const listData = listResponse.data;
        if (!listResponse.ok || listData.success === false) {
          const message = listData.message || listData.code || `Video task query failed (${listResponse.status})`;
          throw createVideoTaskPollingRequestError(
            Object.assign(new Error(String(message)), { status: listResponse.status }),
            String(message),
            { status: listResponse.status },
          );
        }
        return requireCustomerVideoTask(listData.tasks, taskId);
      }
      const message = data.message || data.code || `Video task query failed (${response.status})`;
      throw createVideoTaskPollingRequestError(
        Object.assign(new Error(String(message)), { status: response.status }),
        String(message),
        { status: response.status },
      );
    }
    const task = customerVideoTaskFromResponse(data, taskId);
    const contentPlan = planCustomerVideoContentFetch({
      ...customerVideoWireOptions(apiConfig),
      taskId,
      task,
    });
    if (!contentPlan) return task;
    const contentResponse = await executeCustomerVideoRequest(apiConfig, {
      method: "GET",
      nativePath: contentPlan.path.replace(/^\//, ""),
      browserUrl: customerVideoContentUrl(contentPlan.path, apiConfig),
      signal,
    });
    if (!contentResponse.ok || contentResponse.data.success === false) {
      const message = contentResponse.data.message || contentResponse.data.code || `Video content download failed (${contentResponse.status})`;
      throw createVideoTaskPollingRequestError(
        Object.assign(new Error(String(message)), { status: contentResponse.status }),
        String(message),
        { status: contentResponse.status },
      );
    }
    const contentUrl = firstCustomerVideoString(
      contentResponse.data.url,
      contentResponse.data.video_url,
      contentResponse.data.content?.video_url,
      contentResponse.data.video && typeof contentResponse.data.video === "object"
        ? (contentResponse.data.video as { url?: string }).url
        : "",
    );
    if (!contentUrl) {
      throw createVideoTaskPollingRequestError(
        new Error("视频已完成但没有地址"),
        "视频已完成但没有地址",
      );
    }
    return attachOfficialOpenAiVideoContent(task, { url: contentUrl, video: { url: contentUrl } });
  } catch (error) {
    if (signal?.aborted) throw abortSignalReason(signal, "视频任务查询已取消");
    throw createVideoTaskPollingRequestError(
      error,
      formatCustomerVideoRequestError(error, { action: "poll", baseUrl: apiConfig.baseUrl }),
    );
  }
}

class CanvasVideoTerminalError extends Error {}
class CanvasVideoPollingDeadlineError extends Error {}

function abortSignalReason(signal: AbortSignal, fallback: string) {
  return signal.reason instanceof Error ? signal.reason : new Error(fallback);
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortSignalReason(signal, "视频任务已取消"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortSignalReason(signal, "视频任务已取消"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function waitCustomerVideoPoll(ms: number, signal?: AbortSignal) {
  return withAbortSignal(
    new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
    signal,
  );
}

async function pollCustomerVideoTaskUntilReady(
  taskId: string,
  apiConfig: CustomerVideoApiConfig,
  signal: AbortSignal,
) {
  while (true) {
    const task = await pollVideoTaskWithTransientRetry(
      () => fetchCustomerVideoTask(taskId, apiConfig, signal),
      {
        maxAttempts: VIDEO_TASK_TRANSIENT_POLL_RETRY_ATTEMPTS,
        baseDelayMs: VIDEO_TASK_TRANSIENT_POLL_RETRY_BASE_MS,
        signal,
        wait: waitCustomerVideoPoll,
      },
    );
    const disposition = customerVideoTaskPollDisposition(task);
    if (disposition === "failed") {
      throw new CanvasVideoTerminalError(customerVideoTaskError(task));
    }
    if (disposition === "completed") {
      if (customerVideoTaskFileUrls(task, apiConfig.baseUrl).length > 0) return task;
      throw new CanvasVideoTerminalError("视频任务完成但没有返回可用结果");
    }
    await waitCustomerVideoPoll(CUSTOMER_VIDEO_TASK_POLL_INTERVAL_MS, signal);
  }
}

async function pollCanvasVideoTaskUntilReady(
  config: AiConfig,
  task: VideoGenerationTask,
  signal: AbortSignal,
) {
  const pollIntervalMs = task.provider === "seedance" || task.provider === "civitai"
    ? CUSTOMER_VIDEO_TASK_POLL_INTERVAL_MS
    : VIDEO_TASK_POLL_INTERVAL_MS;
  while (true) {
    const state = await pollVideoTaskWithTransientRetry(
      () => withAbortSignal(pollVideoGenerationTask(config, task), signal),
      {
        maxAttempts: VIDEO_TASK_TRANSIENT_POLL_RETRY_ATTEMPTS,
        baseDelayMs: VIDEO_TASK_TRANSIENT_POLL_RETRY_BASE_MS,
        signal,
        wait: waitCustomerVideoPoll,
      },
    );
    if (state.status === "completed") return storeGeneratedVideos(state.result);
    if (state.status === "failed") throw new CanvasVideoTerminalError(state.error);
    await waitCustomerVideoPoll(pollIntervalMs, signal);
  }
}

function createTimedVideoTaskAbortController(
  startedAt: string,
  timeoutMs: number,
  timeoutMessage: string,
) {
  const controller = new AbortController();
  const remainingMs = videoTaskPollingRemainingMs(startedAt, timeoutMs);
  const timeoutId = window.setTimeout(
    () => controller.abort(new CanvasVideoPollingDeadlineError(timeoutMessage)),
    remainingMs,
  );
  return {
    controller,
    cancelTimeout: () => window.clearTimeout(timeoutId),
  };
}

function normalizeViewport(
  viewport: ViewportTransform | undefined,
): ViewportTransform {
  const x = Number.isFinite(viewport?.x) ? viewport!.x : DEFAULT_VIEWPORT.x;
  const y = Number.isFinite(viewport?.y) ? viewport!.y : DEFAULT_VIEWPORT.y;
  const k = Number.isFinite(viewport?.k)
    ? Math.min(Math.max(viewport!.k, 0.05), 5)
    : DEFAULT_VIEWPORT.k;
  return { x, y, k };
}

function isDefaultViewport(viewport: ViewportTransform) {
  return (
    viewport.x === DEFAULT_VIEWPORT.x &&
    viewport.y === DEFAULT_VIEWPORT.y &&
    viewport.k === DEFAULT_VIEWPORT.k
  );
}

const EMPTY_MENTION_REFERENCES: CanvasResourceReference[] = [];
const EMPTY_REFERENCE_VIDEOS: ReferenceVideo[] = [];

function sameIdSet(left: Set<string>, right: Set<string>) {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const id of right) {
    if (!left.has(id)) return false;
  }
  return true;
}

export default function CanvasPage() {
  const projectId = useSearchParams().get("id") || "";

  return (
    <CanvasWorkspaceErrorBoundary key={projectId}>
      <InfiniteCanvasPage />
    </CanvasWorkspaceErrorBoundary>
  );
}

class CanvasWorkspaceErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Canvas workspace crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const detail = this.state.error.message || "未知渲染错误";
    return (
      <CanvasRestoreErrorShell
        message={`画布组件渲染出错：${detail}。这是界面代码问题，不是你的画布文件坏了。点重试会重新挂载画布。`}
        onRetry={() => this.setState({ error: null })}
        onBack={() => (window.location.href = "/canvas/home")}
        onRepair={() => (window.location.href = "/canvas-repair")}
      />
    );
  }
}

function CanvasRefreshShell() {
  return (
    <main className="canvas-workspace-board relative flex h-full min-h-full w-full flex-1 overflow-hidden bg-[#f4f2ed] text-stone-800">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div
        className="absolute bottom-5 left-1/2 z-50 flex h-14 -translate-x-1/2 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
        }}
        aria-hidden="true"
      >
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="size-8 rounded-md bg-current opacity-10"
          />
        ))}
      </div>

      <div
        className="absolute bottom-24 left-6 z-50 h-40 w-[240px] rounded-lg border shadow-2xl backdrop-blur-sm"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
        }}
        aria-hidden="true"
      >
        <div className="absolute left-7 top-7 h-5 w-12 rounded-sm bg-current opacity-10" />
        <div className="absolute left-28 top-16 h-6 w-16 rounded-sm bg-current opacity-10" />
        <div className="absolute bottom-7 left-16 h-8 w-20 rounded-sm bg-current opacity-10" />
        <div className="absolute inset-5 rounded border border-current opacity-15" />
      </div>

      <div
        className="absolute bottom-5 left-5 z-50 flex h-14 w-[260px] items-center gap-2 rounded-xl border px-2 shadow-lg backdrop-blur"
        style={{
          background: "var(--background)",
          borderColor: "var(--border)",
        }}
        aria-hidden="true"
      >
        <div className="size-8 rounded-md bg-current opacity-10" />
        <div className="size-8 rounded-md bg-current opacity-10" />
        <div className="h-1 flex-1 rounded-full bg-current opacity-10" />
        <div className="h-4 w-10 rounded bg-current opacity-10" />
        <div className="size-8 rounded-md bg-current opacity-10" />
      </div>
    </main>
  );
}

function CanvasRestoreErrorShell({
  message,
  onRetry,
  retrying = false,
  onBack,
  onRepair,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  onBack: () => void;
  onRepair: () => void;
}) {
  return (
    <main className="canvas-workspace-board relative grid h-full min-h-full w-full flex-1 place-items-center bg-[#f4f2ed] px-5 text-stone-800">
      <section className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-xs text-stone-500">画布加载异常</p>
        <h1 className="mt-3 text-xl font-semibold">这个画布的数据需要修复</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          {message ||
            "启动时读取本地画布数据失败，请先返回画布库或执行加载修复。"}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {onRetry ? (
            <Button type="primary" loading={retrying} onClick={onRetry}>
              重试读取
            </Button>
          ) : null}
          <Button onClick={onBack}>
            返回画布库
          </Button>
          <Button onClick={onRepair}>修复加载</Button>
        </div>
      </section>
    </main>
  );
}

function ConnectionCreateMenu({
  pending,
  onCreate,
  onClose,
}: {
  pending: PendingConnectionCreate;
  onCreate: (
    type:
      | CanvasNodeType.Image
      | CanvasNodeType.Text
      | CanvasNodeType.Config
      | CanvasNodeType.Video
      | CanvasNodeType.Audio,
  ) => void;
  onClose: () => void;
}) {
  const themeName = useThemeStore((state) => state.theme);
  const theme = canvasThemes[themeName] || canvasThemes.light;
  return (
    <div
      className="absolute z-[120] w-[300px] rounded-[18px] border p-3 shadow-2xl backdrop-blur"
      data-connection-create-menu
      style={{
        left: pending.position.x,
        top: pending.position.y,
        background: theme.node.panel,
        borderColor: theme.node.stroke,
        color: theme.node.text,
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span
          className="text-sm font-medium"
          style={{ color: theme.node.muted }}
        >
          引用该节点生成
        </span>
        <button
          type="button"
          className="grid size-7 place-items-center rounded-lg text-base opacity-55 transition hover:bg-white/10 hover:opacity-100"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
      <div className="grid gap-1">
        <ConnectionCreateOption
          theme={theme}
          icon={<List className="size-5" />}
          title="加一段文字"
          description="剧本、旁白、广告词"
          onClick={() => onCreate(CanvasNodeType.Text)}
        />
        <ConnectionCreateOption
          theme={theme}
          icon={<ImageIcon className="size-5" />}
          title="按这个出图"
          description="用当前这块去生成图片"
          onClick={() => onCreate(CanvasNodeType.Image)}
        />
        <ConnectionCreateOption
          theme={theme}
          icon={<Settings2 className="size-5" />}
          title="加一块设置"
          description="单独改生图用哪个模型和参数"
          onClick={() => onCreate(CanvasNodeType.Config)}
        />
        <ConnectionCreateOption
          theme={theme}
          icon={<Video className="size-5" />}
          title="按这个出视频"
          onClick={() => onCreate(CanvasNodeType.Video)}
        />
        <ConnectionCreateOption
          theme={theme}
          icon={<Music2 className="size-5" />}
          title="加一段音频"
          onClick={() => onCreate(CanvasNodeType.Audio)}
        />
      </div>
    </div>
  );
}

function ConnectionCreateOption({
  theme,
  icon,
  title,
  description,
  onClick,
}: {
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
  icon: React.ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition"
      style={{ color: theme.node.text }}
      onClick={onClick}
      onMouseEnter={(event) =>
        (event.currentTarget.style.background = theme.node.fill)
      }
      onMouseLeave={(event) =>
        (event.currentTarget.style.background = "transparent")
      }
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl"
        style={{ background: theme.node.fill, color: theme.node.muted }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-base font-semibold leading-5">
          {title}
        </span>
        {description ? (
          <span
            className="mt-1 block truncate text-sm"
            style={{ color: theme.node.muted }}
          >
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function CanvasEmptyStarter({
  theme,
  onUpload,
  onTextToImage,
  onOpenAssets,
  onSeedance2Workflow,
  onStoryDirector,
  onAddText,
}: {
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
  onUpload: () => void;
  onTextToImage: () => void;
  onOpenAssets: () => void;
  onSeedance2Workflow: () => void;
  onStoryDirector: () => void;
  onAddText: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[80] flex items-center justify-center px-4 pb-24" data-canvas-no-zoom>
      <div
        className="pointer-events-auto w-[min(520px,calc(100vw-32px))] rounded-lg border p-4 shadow-xl backdrop-blur"
        style={{
          background: theme.node.panel,
          borderColor: theme.node.stroke,
          color: theme.node.text,
        }}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg"
            style={{ background: theme.node.fill, color: theme.node.muted }}
          >
            <Sparkles className="size-4.5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-5">开始创作</div>
            <div
              className="mt-0.5 text-xs leading-5"
              style={{ color: theme.node.muted }}
            >
              画布是空的。先放一个节点，或从底栏继续加。
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <CanvasStarterAction
            theme={theme}
            icon={<ImageIcon className="size-4" />}
            label="文生图"
            onClick={onTextToImage}
          />
          <CanvasStarterAction
            theme={theme}
            icon={<Clapperboard className="size-4" />}
            label="故事导演"
            onClick={onStoryDirector}
          />
          <CanvasStarterAction
            theme={theme}
            icon={<Film className="size-4" />}
            label="分镜视频"
            onClick={onSeedance2Workflow}
          />
          <CanvasStarterAction
            theme={theme}
            icon={<Upload className="size-4" />}
            label="上传素材"
            onClick={onUpload}
          />
          <CanvasStarterAction
            theme={theme}
            icon={<FileText className="size-4" />}
            label="文本"
            onClick={onAddText}
          />
          <CanvasStarterAction
            theme={theme}
            icon={<Images className="size-4" />}
            label="我的素材"
            onClick={onOpenAssets}
          />
        </div>
      </div>
    </div>
  );
}

function CanvasStarterAction({
  theme,
  icon,
  label,
  onClick,
}: {
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition hover:scale-[1.01]"
      style={{
        background: theme.node.fill,
        borderColor: theme.node.stroke,
        color: theme.node.text,
      }}
      onClick={onClick}
      aria-label={label}
      data-canvas-starter={label}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}



function seedance2PromptTextModelInput(
  node: CanvasNodeData,
  config: AiConfig,
  configuredTextModels = selectableModelsByCapability(config, "text"),
): Seedance2PromptTextModelInput {
  return {
    savedModel: node.metadata?.seedancePromptTextModel,
    currentTextModel: config.textModel,
    configuredTextModels,
    defaultTextModel: defaultConfig.textModel,
  };
}

function seedance2PromptTextModelValues(
  node: CanvasNodeData,
  config: AiConfig,
  configuredTextModels?: string[],
) {
  return buildSeedance2PromptTextModelValues(
    seedance2PromptTextModelInput(node, config, configuredTextModels),
    (model) => modelMatchesCapability(model, "text"),
  );
}

function resolveSeedance2PromptTextModel(node: CanvasNodeData, config: AiConfig) {
  return (
    resolveSeedance2PromptTextModelValue(
      seedance2PromptTextModelInput(node, config),
      (model) => modelMatchesCapability(model, "text"),
    ) || defaultConfig.textModel
  );
}

function resolveSeedance2PromptTextProviderSelection(
  node: CanvasNodeData,
  config: AiConfig,
) {
  const savedModel = String(
    node.metadata?.seedancePromptTextModel || "",
  ).trim();
  return resolveCanvasGenerationModelSelection(
    config,
    savedModel
      ? {
          model: savedModel,
          modelProviderId:
            node.metadata?.seedancePromptTextModelProviderId,
        }
      : undefined,
    "text",
  );
}

const SEEDANCE2_PROMPT_TEMPLATE_TEXTAREA_MIN_HEIGHT = 196;

const SEEDANCE2_API_RATIO_OPTIONS = [
  { value: "16:9", label: "横屏" },
  { value: "9:16", label: "竖屏" },
  { value: "1:1", label: "方形" },
  { value: "4:3", label: "标准横屏" },
  { value: "3:4", label: "标准竖屏" },
  { value: "21:9", label: "宽银幕" },
] as const;

const SEEDANCE2_SHOT_COUNT_OPTIONS = Array.from(
  { length: 60 },
  (_, index) => ({ value: String(index + 1), label: String(index + 1) }),
);

type Seedance2PickerOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function Seedance2OptionPicker({
  label,
  value,
  options,
  onChange,
  theme,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly Seedance2PickerOption[];
  onChange: (value: string) => void;
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) || options[0];
  const stop = (event: ReactMouseEvent | ReactPointerEvent) => event.stopPropagation();
  return (
    <div className="relative grid gap-1 text-xs" onMouseDown={stop} onPointerDown={stop} data-canvas-no-drag data-canvas-no-zoom>
      <span style={{ color: theme.node.muted }}>{label}</span>
      <button
        type="button"
        disabled={disabled}
        className="flex h-9 items-center justify-between rounded-lg border px-2 text-left text-sm outline-none transition hover:border-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) setOpen((currentOpen) => !currentOpen);
        }}
      >
        <span className="truncate">{current?.label || value}</span>
        <span className="ml-2 text-[10px]" style={{ color: theme.node.muted }}>{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-[90] mt-1 overflow-hidden rounded-lg border p-1 shadow-lg" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  background: selected ? "rgba(249,115,22,.18)" : "transparent",
                  color: option.disabled ? theme.node.muted : theme.node.text,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <span className="text-orange-300">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Seedance2ProviderModelOptionPicker({
  label, value, legacyValue, options, onChange, theme,
}: {
  label: string;
  value: ProviderModelSelection | null;
  legacyValue?: string;
  options: readonly ProviderModelOption[];
  onChange: (value: ProviderModelSelection) => void;
  theme: (typeof canvasThemes)[keyof typeof canvasThemes];
}) {
  return (
    <div className="relative grid gap-1 text-xs" data-canvas-no-drag data-canvas-no-zoom>
      <span style={{ color: theme.node.muted }}>{label}</span>
      <ProviderModelSelectControl
        options={options}
        value={value}
        legacyValue={legacyValue}
        onChange={onChange}
        placeholder="选择模型"
        emptyLabel={`暂无已配置${label}`}
        title={label}
        triggerClassName="min-h-9 h-auto w-full rounded-lg border px-2 py-1 text-sm shadow-none hover:border-orange-400"
        triggerStyle={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
        contentClassName="z-[1300]"
      />
    </div>
  );
}

function Seedance2WorkflowPanel({
  node,
  onConfigChange,
  onCreatePlaceholders,
  onGenerateVideos,
  storyDirectorSourceResolution,
  isCreatingPlaceholders = false,
  rewriteStreamingChars = 0,
  pendingPlaceholderCount = 0,
  videoBatch = null,
  onClose,
  embedded = false,
}: {
  node: CanvasNodeData;
  onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
  onCreatePlaceholders: (node: CanvasNodeData) => void;
  onGenerateVideos?: (node: CanvasNodeData) => void;
  storyDirectorSourceResolution: Seedance2StoryDirectorSourceResolution;
  isCreatingPlaceholders?: boolean;
  rewriteStreamingChars?: number;
  pendingPlaceholderCount?: number;
  videoBatch?: { done: number; total: number } | null;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const theme = canvasThemes[useThemeStore((state) => state.theme)] || canvasThemes.light;
  const effectiveConfig = useEffectiveConfig();
  const meta = node.metadata || {};
  const fieldStyle = { borderColor: theme.node.stroke, color: theme.node.text, background: theme.node.fill };
  const videoModelOptions = selectableProviderModelsByCapability(
    effectiveConfig,
    "video",
  );
  const videoModelResolution = resolveCanvasGenerationModelSelection(
    effectiveConfig,
    meta,
    "video",
  );
  const requestedVideoModel = String(
    videoModelResolution.selection?.model ||
      videoModelResolution.legacyModel ||
      meta.seedanceModel ||
      meta.model ||
      "",
  ).trim();
  const videoModel = videoModelResolution.selection?.model || requestedVideoModel;
  const patch = (value: Partial<CanvasNodeData["metadata"]>) =>
    onConfigChange(node.id, {
      seedanceWorkflowMode: "slice",
      seedanceContinuous: false,
      seedanceGenerateCount: 1,
      seedanceApiProvider: "local",
      seedanceApiEndpoint: LOCAL_SEEDANCE2_API_ENDPOINT,
      seedanceModel: videoModel,
      ...(videoModelResolution.selection
        ? { modelProviderId: videoModelResolution.selection.providerId }
        : {}),
      ...value,
    });
  // Older workflow nodes may only inherit the visible global video model. Pass
  // that display value through the same explicit route path as saved selections.
  const workflowModelNode = requestedVideoModel
    ? {
        ...node,
        metadata: {
          ...meta,
          seedanceModel: requestedVideoModel,
          modelProviderId: videoModelResolution.selection?.providerId,
        },
      }
    : node;
  const workflowVideoConfig = buildGenerationConfig(effectiveConfig, workflowModelNode, "video");
  const workflowRouteScope = resolveVideoGenerationSettingsScope(workflowVideoConfig, "text-to-video");
  const workflowProvider = workflowVideoConfig.apiRelays.find((item) => item.id === workflowRouteScope.providerId);
  const workflowProviderOwnsModel = Boolean(
    workflowProvider && providerModelsForCapability(workflowProvider, "video").includes(workflowRouteScope.model),
  );
  const workflowModelBlocked = Boolean(
    requestedVideoModel && (
      workflowRouteScope.model !== requestedVideoModel ||
      !workflowProviderOwnsModel
    ),
  );
  const workflowCapability = workflowModelBlocked
    ? undefined
    : resolveCanvasVideoModelCapability(workflowVideoConfig, workflowRouteScope.model, workflowProvider);
  const workflowTaskSnapshot =
    meta.videoGenerationAttempt?.providerSnapshot ||
    meta.videoGenerationTask?.providerSnapshot;
  const workflowOperationSelection = resolveWorkflowVideoOperationSelection({
    capability: workflowCapability,
    providerId: workflowRouteScope.providerId,
    model: workflowRouteScope.model,
    savedScope: meta.videoGenerationScope,
    savedTaskScope: workflowTaskSnapshot
      ? {
          providerId: workflowTaskSnapshot.providerId,
          model: workflowTaskSnapshot.model,
          operation: workflowTaskSnapshot.operation,
        }
      : undefined,
    savedCapabilityId: meta.videoGenerationCapabilityId,
    savedReferenceUses: [
      ...Object.values(meta.seedanceReferenceSlotBindings || {}),
      ...Object.values(meta.seedanceReferenceExtraSlotBindings || {}),
    ].flatMap((binding) => binding?.useAs ? [binding.useAs] : []),
    allowLegacyStoryAutoMigration: true,
    savedOperationMigrationSource: meta.videoGenerationOperationMigration?.source,
  });
  const workflowOperation = workflowOperationSelection.operation;
  const workflowAutoSkippedReasons = workflowCapability
    ? workflowVideoAutoSkippedOperationReasons(workflowCapability)
    : [];
  const workflowOperationPatch = (
    operation: VideoGenerationOperation,
    migrationSource?: NonNullable<typeof workflowOperationSelection.migrationSource>,
  ): Partial<CanvasNodeMetadata> => {
    if (!workflowCapability || !workflowRouteScope.providerId || !workflowRouteScope.model) return {};
    const scope = {
      providerId: workflowRouteScope.providerId,
      model: workflowRouteScope.model,
      operation,
    };
    const settings = readVideoGenerationSettings(
      workflowVideoConfig,
      scope,
      workflowCapability,
    );
    return {
      videoGenerationSettings: settings,
      videoGenerationScope: scope,
      videoGenerationCapabilityId: workflowCapability.generationParameters.id,
      videoWireFormat: snapshotVideoWireFormat(settings, workflowCapability),
      videoGenerationOperationMigration: migrationSource
        ? {
            version: 1 as const,
            source: migrationSource,
            providerId: scope.providerId,
            model: scope.model,
            operation: scope.operation,
          }
        : undefined,
    };
  };
  const promptTextModelResolution = resolveSeedance2PromptTextProviderSelection(
    node,
    effectiveConfig,
  );
  const promptTextModelOptions = selectableProviderModelsByCapability(
    effectiveConfig,
    "text",
  );
  const storyDirectorSource = storyDirectorSourceResolution.source;
  const storyShotCountDisplay = seedance2StoryShotCountDisplay(
    storyDirectorSourceResolution,
  );
  const storyShotCount = storyShotCountDisplay.count;
  const storyShotsForAuto = storyDirectorSource?.metadata?.storyShots || [];
  const workflowAutoDisplayOperation = !workflowOperation && workflowCapability
    ? autoWorkflowVideoOperationForMaterials({
        capability: workflowCapability,
        materials: {
          totalShots: storyShotsForAuto.length || storyShotCount,
          shotsWithImage: storyShotsForAuto.filter((shot) => (shot.resultNodeIds || []).length > 0).length || storyShotsForAuto.length || storyShotCount,
        },
      }).operation
    : undefined;
  const workflowSettingsOperation = workflowOperation || workflowAutoDisplayOperation;
  const rewriteTotalCountValue = Number(meta.seedancePromptRewriteTotalCount);
  const rewriteTotalCount = Number.isSafeInteger(rewriteTotalCountValue) && rewriteTotalCountValue > 0
    ? rewriteTotalCountValue
    : storyShotCount;
  const rewriteCompletedCountValue = Number(meta.seedancePromptRewriteCompletedCount);
  const rewriteCompletedCount = Number.isSafeInteger(rewriteCompletedCountValue) && rewriteCompletedCountValue >= 0
    ? Math.min(rewriteTotalCount, rewriteCompletedCountValue)
    : 0;
  const rewriteInProgress =
    isCreatingPlaceholders || meta.status === "loading";
  const panelClass = embedded
    ? "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[26px] border p-4"
    : "w-[560px] rounded-2xl border p-4 shadow-xl backdrop-blur";
  const sourceHint = storyDirectorSourceResolution.status === "connected"
    ? "已直接连接故事导演：创建或刷新时，将按故事导演的全部分镜生成视频提示词。"
    : storyDirectorSourceResolution.status === "bound"
      ? "已按工作流元数据关联故事导演，但当前没有可见直接连线。"
      : storyDirectorSourceResolution.status === "suggested"
        ? "自动使用画布唯一故事导演，未建立连接；开始前会先保存关联并建立可见连线。"
        : storyDirectorSourceResolution.status === "ambiguous"
          ? "画布中有多个故事导演，请明确连接一个故事导演后再创建视频占位框。"
          : "请先连接包含分镜的故事导演；视频占位提示词必须由故事导演与视频提示词模板共同生成。";

  return (
    <div
      data-seedance2-workflow-panel
      className={panelClass}
      style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
      data-canvas-no-zoom
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <span className="truncate">分镜视频工作流</span>
            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-300">分镜式</span>
          </div>
          <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
            使用故事导演内容和视频提示词模板，为每个分镜创建下游视频占位框。
          </div>
        </div>
        {!embedded && onClose ? (
          <button type="button" className="rounded-lg px-2 py-1 text-xs" style={{ background: theme.node.fill, color: theme.node.text }} onClick={onClose}>关闭</button>
        ) : null}
      </div>

      <div className="mb-3 rounded-xl border px-3 py-2 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.muted }}>
        {sourceHint}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div
          className="grid gap-1 text-xs"
          data-seedance2-story-shot-count
          data-canvas-no-drag
          data-canvas-no-zoom
        >
          <span style={{ color: theme.node.muted }}>分镜数量</span>
          <div className="flex h-9 items-center rounded-lg border px-2 text-sm" style={fieldStyle}>
            {storyShotCountDisplay.label}
          </div>
        </div>
        <Seedance2ProviderModelOptionPicker
          label="视频模型"
          value={videoModelResolution.selection}
          legacyValue={videoModelResolution.legacyModel}
          options={videoModelOptions}
          theme={theme}
          onChange={(selection) => patch({
            seedanceModel: selection.model,
            model: selection.model,
            modelProviderId: selection.providerId,
            videoGenerationSettings: undefined,
            videoGenerationScope: undefined,
            videoGenerationCapabilityId: undefined,
            videoWireFormat: undefined,
            videoGenerationOperationMigration: undefined,
            seedancePromptRewriteErrorDetails: undefined,
          })}
        />
        <Seedance2ProviderModelOptionPicker
          label="文本模型"
          value={promptTextModelResolution.selection}
          legacyValue={promptTextModelResolution.legacyModel}
          options={promptTextModelOptions}
          theme={theme}
          onChange={(selection) => patch({
            seedancePromptTextModelProviderId: selection.providerId,
            seedancePromptTextModel: selection.model,
            seedancePromptRewriteErrorDetails: undefined,
          })}
        />
      </div>

      <div className="mt-3 rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
        {workflowModelBlocked ? (
          <div data-seedance2-video-model-blocked className="rounded-xl border border-red-400/50 px-3 py-2 text-sm text-red-300">
            视频模型“{requestedVideoModel}”没有可唯一确定的已配置 provider；已阻止显示或提交其他 provider 的参数合同。请选择一个可用视频模型后重试。
          </div>
        ) : (
          <>
            {workflowOperationSelection.options.length ? (
              <label className="mb-2 grid gap-1 text-xs" data-canvas-no-drag data-canvas-no-zoom>
                <span style={{ color: theme.node.muted }}>出片方式</span>
                <select
                  className="h-9 w-full rounded-lg border px-2 text-sm outline-none"
                  style={fieldStyle}
                  value={meta.videoGenerationOperationMigration?.source === "user-selection" && workflowOperation ? workflowOperation : "auto"}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "auto") {
                      patch({
                        videoGenerationSettings: undefined,
                        videoGenerationScope: undefined,
                        videoGenerationCapabilityId: undefined,
                        videoWireFormat: undefined,
                        videoGenerationOperationMigration: undefined,
                      });
                      return;
                    }
                    const selected = workflowOperationSelection.options.find((option) => option.value === value);
                    if (!selected) return;
                    patch(workflowOperationPatch(selected.value, "user-selection"));
                  }}
                >
                  <option value="auto">
                    自动{workflowAutoDisplayOperation
                      ? `（${workflowOperationSelection.options.find((option) => option.value === workflowAutoDisplayOperation)?.label || workflowAutoDisplayOperation}）`
                      : ""}
                  </option>
                  {workflowOperationSelection.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {!workflowSettingsOperation ? (
              <div data-seedance2-video-operation-auto className="rounded-xl border px-3 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                自动：按当前模型真实槽位打包分镜图。Grok 等多参考模型是每镜一条请求，镜内再加当前分镜、角色、场景参考；Agnes 按 2–3 张不重叠切窗；纯首帧才一镜一条。重试复现每条请求自己的 provider/model/operation/图序。
                {workflowOperationSelection.blockedReason ? (
                  <div className="mt-1 text-orange-300">{workflowOperationSelection.blockedReason}</div>
                ) : null}
                {workflowAutoSkippedReasons.map((reason) => (
                  <div key={reason} className="mt-1">{reason}</div>
                ))}
              </div>
            ) : (
              <>
                {meta.videoGenerationOperationMigration?.source !== "user-selection" ? (
                  <div data-seedance2-video-operation-auto className="mb-2 rounded-xl border px-3 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    自动：按当前模型真实槽位打包分镜图。Grok 等多参考模型是每镜一条请求，镜内再加当前分镜、角色、场景参考；Agnes 按 2–3 张不重叠切窗；纯首帧才一镜一条。下方参数按解析出的「{workflowOperationSelection.options.find((option) => option.value === workflowSettingsOperation)?.label || workflowSettingsOperation}」合同显示，可改时长/清晰度。
                  </div>
                ) : null}
                <VideoSettingsPanel
                  config={workflowVideoConfig}
                  operation={workflowSettingsOperation}
                  theme={theme}
                  showTitle
                  className="thin-scrollbar max-h-[280px] space-y-4 overflow-y-auto pr-1"
                  onConfigChange={(key, value) => {
                    if (key === "imageHostBaseUrl" || key === "imageHostApiKey") {
                      useConfigStore.getState().updateConfig(key, value);
                    }
                  }}
                  onImageHostCredentialBlur={() => {
                    void flushConfigStore().catch(() => undefined);
                  }}
                  onGenerationSettingsChange={(settings, scope, capabilityId) => {
                    const provider = effectiveConfig.apiRelays.find((item) => item.id === scope.providerId);
                    const capability = resolveCanvasVideoModelCapability(effectiveConfig, scope.model, provider);
                    const keepUserSelection = meta.videoGenerationOperationMigration?.source === "user-selection";
                    patch({
                      videoGenerationSettings: settings,
                      videoGenerationScope: scope,
                      videoGenerationCapabilityId: capabilityId,
                      videoWireFormat: snapshotVideoWireFormat(settings, capability),
                      videoGenerationOperationMigration: keepUserSelection
                        ? {
                            version: 1,
                            source: "user-selection",
                            providerId: scope.providerId,
                            model: scope.model,
                            operation: scope.operation,
                          }
                        : {
                            version: 1,
                            source: "auto-materials",
                            providerId: scope.providerId,
                            model: scope.model,
                            operation: scope.operation,
                          },
                    });
                  }}
                />
              </>
            )}
          </>
        )}
        <div className="mt-2 text-[10px]" style={{ color: theme.node.muted }}>
          占位框布局沿用故事导演比例；API 输出尺寸仅由上方 provider/model 合同决定。
        </div>
      </div>

      <label className="mt-3 grid gap-1 text-xs" data-canvas-no-drag data-canvas-no-zoom>
        <span style={{ color: theme.node.muted }}>视频提示词模板</span>
        <textarea
          className="thin-scrollbar block h-[220px] max-h-[220px] min-h-0 w-full resize-none overflow-y-auto overscroll-contain rounded-lg border px-2 py-2 text-sm leading-5 outline-none"
          style={{ ...fieldStyle, minHeight: SEEDANCE2_PROMPT_TEMPLATE_TEXTAREA_MIN_HEIGHT }}
          value={meta.seedancePromptTemplate || ""}
          onChange={(event) => patch({ seedancePromptTemplate: event.target.value })}
          onWheel={(event) => event.stopPropagation()}
          data-canvas-wheel-scroll
        />
      </label>
      {rewriteInProgress && rewriteTotalCount > 0 ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-seedance2-rewrite-progress
          className="mt-3 rounded-xl border px-3 py-2 text-xs leading-5"
          style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}
        >
          <div className="flex items-center justify-between gap-3">
            <span>正在整批改写视频提示词</span>
            <strong className="shrink-0" style={{ color: theme.node.text }}>
              已完成 {rewriteCompletedCount} / {rewriteTotalCount} 镜
            </strong>
          </div>
          {rewriteStreamingChars > 0 ? (
            <div className="mt-1" data-seedance2-rewrite-streaming>本批已接收 {rewriteStreamingChars} 字</div>
          ) : null}
          <div
            aria-hidden="true"
            className="mt-2 h-1.5 overflow-hidden rounded-full"
            style={{ background: theme.node.stroke }}
          >
            <div
              className="h-full rounded-full bg-orange-400 transition-[width] duration-300"
              style={{ width: `${rewriteTotalCount ? (rewriteCompletedCount / rewriteTotalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      ) : null}
      {meta.status === "error" && meta.seedancePromptRewriteErrorDetails ? (
        <div
          role="alert"
          data-seedance2-rewrite-error
          className="mt-3 rounded-xl border border-red-400/50 px-3 py-2 text-xs leading-5 text-red-300"
        >
          <div>{meta.seedancePromptRewriteErrorDetails}</div>
          <div>
            已完成 {rewriteCompletedCount} / {rewriteTotalCount} 镜；重试将从失败批次继续。
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex gap-2" data-canvas-no-drag data-canvas-no-zoom>
        <button type="button" disabled={isCreatingPlaceholders || Boolean(videoBatch) || !storyDirectorSource || workflowModelBlocked} className="h-10 flex-1 rounded-xl bg-orange-500 px-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => {
          if (workflowOperationSelection.migrationSource && workflowOperation) {
            const migrationPatch = workflowOperationPatch(
              workflowOperation,
              workflowOperationSelection.migrationSource,
            );
            patch(migrationPatch);
            onCreatePlaceholders({
              ...node,
              metadata: { ...node.metadata, ...migrationPatch },
            });
            return;
          }
          onCreatePlaceholders(node);
        }}>
          {isCreatingPlaceholders
            ? `正在按分镜摆格子（${rewriteCompletedCount}/${rewriteTotalCount || storyShotCount}）...`
            : "按分镜摆出空视频格"}
        </button>
        <button
          type="button"
          disabled={
            isCreatingPlaceholders ||
            Boolean(videoBatch) ||
            !onGenerateVideos ||
            pendingPlaceholderCount <= 0 ||
            workflowModelBlocked
          }
          className="h-10 flex-1 rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            borderColor: theme.node.stroke,
            background: theme.node.fill,
            color: theme.node.text,
          }}
          onClick={() => onGenerateVideos?.(node)}
        >
          {videoBatch
            ? `正在生成视频（${videoBatch.done}/${videoBatch.total}）...`
            : pendingPlaceholderCount > 0
              ? `把空格子都生成视频（${pendingPlaceholderCount}）`
              : "把空格子都生成视频"}
        </button>
      </div>
    </div>
  );
}

function InfiniteCanvasPage() {
  const { message: antdMessage } = App.useApp();
  const message = useMemo(() => ({
    ...antdMessage,
    error: (content: Parameters<typeof antdMessage.error>[0], duration?: Parameters<typeof antdMessage.error>[1], onClose?: Parameters<typeof antdMessage.error>[2]) => {
      return antdMessage.error(withCanvasErrorMessageKey(content) as Parameters<typeof antdMessage.error>[0], duration, onClose);
    },
  }), [antdMessage]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id") || "";
  const projectSession = useMemo(() => ({ projectId }), [projectId]);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<{
    nodeId?: string;
    position?: Position;
  } | null>(null);
  const clipboardRef = useRef<CanvasClipboard | null>(null);
  const historyRef = useRef<{
    past: CanvasHistoryEntry[];
    future: CanvasHistoryEntry[];
  }>({ past: [], future: [] });
  const lastHistoryRef = useRef<CanvasHistoryEntry | null>(null);
  const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const viewportSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const applyingHistoryRef = useRef(false);
  const historyPausedRef = useRef(false);
  const didInitialCenterRef = useRef(false);
  const shouldCenterInitialViewportRef = useRef(false);
  const pendingFitRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hoverRafRef = useRef<number | null>(null);
  const pendingHoveredNodeIdRef = useRef<string | null>(null);
  const nodeDraggingRef = useRef(false);
  const dragRef = useRef<{
    isDraggingNode: boolean;
    hasMoved: boolean;
    startX: number;
    startY: number;
    initialSelectedNodes: { id: string; x: number; y: number }[];
  }>({
    isDraggingNode: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    initialSelectedNodes: [],
  });

  const config = useConfigStore((state) => state.config);
  const effectiveConfig = useEffectiveConfig();
  const storyDirectorTextModels = useMemo(() => {
    const listed = selectableProviderModelsByCapability(effectiveConfig, "text");
    return listed.length ? listed : wiredStoryDirectorModels("text");
  }, [effectiveConfig]);
  const storyDirectorInheritedTextModel = useMemo<StoryDirectorTextModelSelection | null>(
    () => {
      const boardRoute = effectiveConfig.apiBoardRouting.storyDirector;
      const route =
        boardRoute.mode === "custom"
          ? boardRoute
          : effectiveConfig.apiRouting.text;
      if (route.providerId && route.model) {
        return { providerId: route.providerId, model: route.model };
      }
      const first = storyDirectorTextModels[0];
      return first?.providerId && first?.model
        ? { providerId: first.providerId, model: first.model }
        : null;
    },
    [
      effectiveConfig.apiBoardRouting.storyDirector,
      effectiveConfig.apiRouting.text,
      storyDirectorTextModels,
    ],
  );
  const storyDirectorImageModels = useMemo(() => {
    const listed = selectableProviderModelsByCapability(effectiveConfig, "image");
    return listed.length ? listed : wiredStoryDirectorModels("image");
  }, [effectiveConfig]);
  const storyDirectorInheritedImageModel = useMemo<StoryDirectorTextModelSelection | null>(
    () => {
      const route = effectiveConfig.apiRouting.image;
      if (route.providerId && route.model) {
        return { providerId: route.providerId, model: route.model };
      }
      const first = storyDirectorImageModels[0];
      return first?.providerId && first?.model
        ? { providerId: first.providerId, model: first.model }
        : null;
    },
    [effectiveConfig.apiRouting.image, storyDirectorImageModels],
  );
  const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
  const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
  const addAsset = useAssetStore((state) => state.addAsset);
  const assetHydrationStatus = useAssetStore((state) => state.hydrationStatus);
  const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
  const refreshAssetMediaUrls = useAssetStore((state) => state.refreshMediaUrls);
  const hydrated = useCanvasStore((state) => state.hydrated);
  const canvasHydrationStatus = useCanvasStore((state) => state.hydrationStatus);
  const canvasHydrationError = useCanvasStore((state) => state.hydrationError);
  const retryCanvasHydration = useCanvasStore((state) => state.retryHydration);
  const createProject = useCanvasStore((state) => state.createProject);
  const openProject = useCanvasStore((state) => state.openProject);
  const updateProject = useCanvasStore((state) => state.updateProject);
  const renameProject = useCanvasStore((state) => state.renameProject);
  const deleteProjects = useCanvasStore((state) => state.deleteProjects);
  const replaceProjects = useCanvasStore((state) => state.replaceProjects);
  const currentProject = useCanvasStore((state) =>
    state.projects.find((project) => project.id === projectId),
  );
  const theme = canvasThemes[useThemeStore((state) => state.theme)] || canvasThemes.light;
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>(
    [],
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportTransform>({
    x: 0,
    y: 0,
    k: 1,
  });
  const [size, setSize] = useState({ width: 1200, height: 720 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [connectingParams, setConnectingParams] =
    useState<ConnectionHandle | null>(null);
  const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<
    string | null
  >(null);
  const [connectionTargetHandleId, setConnectionTargetHandleId] = useState<
    string | null
  >(null);
  const [pendingConnectionCreate, setPendingConnectionCreate] =
    useState<PendingConnectionCreate | null>(null);
  const [mouseWorld, setMouseWorld] = useState<Position>({ x: 0, y: 0 });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [runningNodeId, setRunningNodeId] = useState<string | null>(null);
  const [rewriteStreamingChars, setRewriteStreamingChars] = useState(0);
  const [seedance2VideoBatch, setSeedance2VideoBatch] = useState<{
    workflowId: string;
    done: number;
    total: number;
  } | null>(null);
  const rewriteStreamingLastPushRef = useRef(0);
  const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
  const [backgroundMode, setBackgroundMode] =
    useState<CanvasBackgroundMode>("lines");
  const [showImageInfo, setShowImageInfo] = useState(false);
  const [pendingDeleteNodeIds, setPendingDeleteNodeIds] = useState<string[]>([]);
  const [clearConfirmProjectId, setClearConfirmProjectId] = useState<string | null>(null);
  const [deleteProjectConfirmId, setDeleteProjectConfirmId] = useState<string | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerTab, setAssetPickerTab] =
    useState<AssetPickerTab>("my-assets");
  const [replacePickerNodeId, setReplacePickerNodeId] = useState<string | null>(
    null,
  );
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [readingBanner, setReadingBanner] = useState(true);
  const projectLoaded = shouldPersistCanvasProject({
    projectLoaded: loadedProjectId !== null,
    currentProjectId: projectId,
    loadedProjectId,
  });
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
  const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
  const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editRequestNonce, setEditRequestNonce] = useState(0);
  const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
  const [cropNodeId, setCropNodeId] = useState<string | null>(null);
  const [layerEditNodeId, setLayerEditNodeId] = useState<string | null>(null);
  const [maskEditNodeId, setMaskEditNodeId] = useState<string | null>(null);
  const [seedance2FaceEditNodeId, setSeedance2FaceEditNodeId] = useState<
    string | null
  >(null);
  const [seedance2FaceEditDataUrl, setSeedance2FaceEditDataUrl] = useState("");
  const [splitNodeId, setSplitNodeId] = useState<string | null>(null);
  const [upscaleNodeId, setUpscaleNodeId] = useState<string | null>(null);
  const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(
    null,
  );
  const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [compareNodeIds, setCompareNodeIds] = useState<string[]>([]);
  const [comparePrimaryNodeId, setComparePrimaryNodeId] = useState<
    string | null
  >(null);
  const [characterDerivedViewsNodeId, setCharacterDerivedViewsNodeId] =
    useState<string | null>(null);
  const [resolvedCharacterDerivedViews, setResolvedCharacterDerivedViews] =
    useState<ResolvedCharacterDerivedView[]>([]);
  const [generationHistoryOpen, setGenerationHistoryOpen] = useState(false);
  const [assistantCollapsed, setAssistantCollapsed] = useState(true);
  const [assistantMounted, setAssistantMounted] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(
    new Set(),
  );

  const nodesRef = useRef(nodes);
  const activeProjectSessionRef = useRef(projectSession);
  const connectionsRef = useRef(connections);
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  const selectedConnectionIdRef = useRef(selectedConnectionId);
  const dialogNodeIdRef = useRef(dialogNodeId);
  const previewNodeIdRef = useRef(previewNodeId);
  const hoveredNodeIdRef = useRef(hoveredNodeId);
  const toolbarNodeIdRef = useRef(toolbarNodeId);
  const contextMenuRef = useRef(contextMenu);
  const viewportRef = useRef(viewport);
  const connectingParamsRef = useRef(connectingParams);
  const connectionTargetNodeIdRef = useRef(connectionTargetNodeId);
  const connectionTargetHandleIdRef = useRef(connectionTargetHandleId);
  const selectionBoxRef = useRef(selectionBox);
  const pendingConnectionCreateRef = useRef(pendingConnectionCreate);
  const resumedImageTaskIdsRef = useRef<Set<string>>(new Set());
  const nativeImageResumeTasksRef = useRef<
    Map<string, Promise<GeneratedImageResult[]>>
  >(new Map());
  const resumedVideoTaskIdsRef = useRef<Set<string>>(new Set());
  const videoTaskControllersRef = useRef<Map<string, AbortController>>(new Map());
  const videoTaskResumeTimersRef = useRef<Map<string, number>>(new Map());
  const videoGenerationEntryLocksRef = useRef<Map<string, string>>(new Map());
  const generateSeedance2VideoFromPlaceholderRef = useRef<
    (node: CanvasNodeData) => Promise<void>
  >(async () => {});
  const nodeGenerationLocksRef = useRef<Set<string>>(new Set());
  const [videoTaskResumeRevision, setVideoTaskResumeRevision] = useState(0);
  const characterDerivationFlightsRef = useRef<Map<string, Promise<void>>>(
    new Map(),
  );

  useLayoutEffect(() => {
    activeProjectSessionRef.current = projectSession;
  }, [projectSession]);

  const createHistoryEntry = useCallback(
    (): CanvasHistoryEntry => ({
      nodes: nodesRef.current,
      connections: connectionsRef.current,
      chatSessions,
      activeChatId,
      backgroundMode,
      showImageInfo,
    }),
    [activeChatId, backgroundMode, chatSessions, showImageInfo],
  );

  const cleanupCanvasFiles = useCallback(
    (extra?: unknown) => {
      cleanupAssetImages({
        extra,
        history: historyRef.current,
        lastHistory: lastHistoryRef.current,
      });
    },
    [cleanupAssetImages],
  );

  useEffect(() => {
    if (projectLoaded) {
      setReadingBanner(false);
      return;
    }
    setReadingBanner(true);
    const timer = window.setTimeout(() => setReadingBanner(false), 500);
    return () => window.clearTimeout(timer);
  }, [projectLoaded]);

  useEffect(() => {
    setLoadedProjectId(null);
    setRestoreError(null);
    setPendingDeleteNodeIds([]);
    setClearConfirmProjectId(null);
    setDeleteProjectConfirmId(null);
    setDialogNodeId(null);
    const snapshot = projectId
      ? useCanvasStore.getState().projects.find((item) => item.id === projectId)
      : null;
    if (!snapshot || snapshot.nodes.length === 0) {
      if (!hydrated) {
        setNodes([]);
        setConnections([]);
      }
    }
    if (!hydrated) return;
    let cancelled = false;
    const mediaRestoreController = new AbortController();

    const restoreProjectState = async (targetProject: CanvasProject) => {
      try {
        const persistedSourceNodes = withImageSequenceNumbers(
          sanitizeCanvasNodes(targetProject.nodes),
        );
        const sourceConnections = sanitizeCanvasConnections(
          targetProject.connections,
          persistedSourceNodes,
        );
        const sourceNodes = migrateLegacyStoryCharacterAssets(
          persistedSourceNodes,
          sourceConnections,
        );
        const sourceSessions = stripExpiredPersistedAssistantObjectUrls(
          Array.isArray(targetProject.chatSessions)
            ? targetProject.chatSessions
            : [],
        );
        const recoveredNodes = withImageSequenceNumbers(
          sanitizeCanvasNodes(
            normalizeConfigNodeSize(recoverInterruptedGeneration(sourceNodes)),
          ),
        );
        const initialNodes = synchronizeSeedanceWorkflowPlaceholderSnapshotsOnLoad(
          stripExpiredPersistedCanvasObjectUrls(
            reconcileStoryDirectorImageResults(
              recoveredNodes,
              sourceConnections,
            ),
          ),
        );
        const initialConnections = sanitizeCanvasConnections(
          sourceConnections,
          initialNodes,
        );
        if (cancelled) return;
        setNodes(initialNodes);
        setConnections(initialConnections);
        setChatSessions(sourceSessions);
        setActiveChatId(targetProject.activeChatId || null);
        setBackgroundMode(targetProject.backgroundMode);
        setShowImageInfo(targetProject.showImageInfo || false);
        const restoredCanvasViewport = normalizeViewport(targetProject.viewport);
        const fittedViewport = fitViewportToNodes(
          initialNodes,
          size.width || 1200,
          size.height || 720,
        );
        setViewport(fittedViewport || restoredCanvasViewport);
        didInitialCenterRef.current = Boolean(fittedViewport);
        shouldCenterInitialViewportRef.current = !fittedViewport;
        pendingFitRef.current = true;
        historyRef.current = { past: [], future: [] };
        if (historyCommitTimerRef.current) {
          clearTimeout(historyCommitTimerRef.current);
          historyCommitTimerRef.current = null;
        }
        lastHistoryRef.current = {
          nodes: initialNodes,
          connections: initialConnections,
          chatSessions: sourceSessions,
          activeChatId: targetProject.activeChatId || null,
          backgroundMode: targetProject.backgroundMode,
          showImageInfo: targetProject.showImageInfo || false,
        };
        setHistoryState({ canUndo: false, canRedo: false });
        setLoadedProjectId(targetProject.id);

        window.setTimeout(() => {
          void (async () => {
            try {
              const hydratedNodes = withImageSequenceNumbers(
                sanitizeCanvasNodes(
                  normalizeConfigNodeSize(
                    await hydrateCanvasImages(
                      initialNodes,
                      mediaRestoreController.signal,
                    ),
                  ),
                ),
              );
              const restoredConnections = sanitizeCanvasConnections(
                sourceConnections,
                hydratedNodes,
              );
              const restoredNodes = reconcileStoryDirectorImageResults(
                hydratedNodes,
                restoredConnections,
              );
              const restoredSessions = await withCanvasRestoreTimeout(
                hydrateAssistantImages(
                  sourceSessions,
                  mediaRestoreController.signal,
                ),
                sourceSessions,
              );
              if (cancelled || mediaRestoreController.signal.aborted) return;
              const mergeHistoryEntry = (entry: CanvasHistoryEntry) =>
                mergeHydratedCanvasHistoryEntry(
                  entry,
                  initialNodes,
                  restoredNodes,
                  sourceSessions,
                  restoredSessions,
                );
              historyRef.current = {
                past: historyRef.current.past.map(mergeHistoryEntry),
                future: historyRef.current.future.map(mergeHistoryEntry),
              };
              if (lastHistoryRef.current)
                lastHistoryRef.current = mergeHistoryEntry(
                  lastHistoryRef.current,
                );
              setNodes((currentNodes) =>
                mergeHydratedCanvasMedia(
                  currentNodes,
                  initialNodes,
                  restoredNodes,
                ),
              );
              setChatSessions((currentSessions) =>
                mergeHydratedAssistantMedia(
                  currentSessions,
                  sourceSessions,
                  restoredSessions,
                ),
              );
            } catch (error) {
              if (!mediaRestoreController.signal.aborted)
                console.warn("Canvas media restore skipped", error);
            }
          })();
        }, 0);
      } catch (error) {
        if (cancelled) return;
        setRestoreError(
          error instanceof Error ? error.message : "画布数据恢复失败",
        );
      }
    };

    if (!projectId) {
      if (pathname === "/canvas/workspace") router.replace("/canvas/home");
      return;
    }
    let project = openProject(projectId);
    if (!project) {
      const mediaPayload = mediaPayloadFromWorkspaceSearch({
        id: projectId,
        kind: (searchParams.get("kind") as "image" | "video" | "upload" | "prompt" | null) || undefined,
        src: searchParams.get("src") || undefined,
        prompt: searchParams.get("prompt") || undefined,
        title: searchParams.get("title") || undefined,
        model: searchParams.get("model") || undefined,
      });
      if (mediaPayload) {
        const rebuilt = pushMediaToCanvasWorkspace({
          ...mediaPayload,
          id: projectId,
          title: mediaPayload.title || mediaPayload.prompt,
        });
        project = useCanvasStore.getState().openProject(rebuilt.id) || openProject(projectId);
        if (rebuilt.id !== projectId) {
          const next = new URLSearchParams(searchParams.toString());
          next.set("id", rebuilt.id);
          router.replace(`${pathname}?${next.toString()}`);
          return;
        }
      }
    }
    if (shouldLoadXiaojunTeacherRecovery(projectId, project)) {
      void loadXiaojunTeacherRecoveryProject(projectId).then(async (recoveredProject) => {
        if (cancelled || !recoveredProject) return;
        const existingProjects = useCanvasStore.getState().projects;
        replaceProjects([
          recoveredProject,
          ...existingProjects.filter((item) => item.id !== recoveredProject.id),
        ]);
        await restoreProjectState(recoveredProject);
      });
      return () => {
        cancelled = true;
        mediaRestoreController.abort();
      };
    }
    if (!project) {
      void importLatestStorySeed().then(() => {
        if (cancelled) return;
        const recovered =
          useCanvasStore.getState().openProject(projectId) ||
          (projectId === INFINITE_CANVAS_SEED_ID
            ? useCanvasStore.getState().openProject(INFINITE_CANVAS_SEED_ID)
            : null);
        if (recovered) {
          void restoreProjectState(recovered);
          return;
        }
        setRestoreError("找不到这个画布。它可能还没导入完成，或已经从本机库里删掉了。请回画布库打开已有项目，不要在这里新建空画布。");
      });
      return () => {
        cancelled = true;
        mediaRestoreController.abort();
      };
    }

    void restoreProjectState(project);
    return () => {
      cancelled = true;
      mediaRestoreController.abort();
    };
  }, [createProject, hydrated, openProject, pathname, projectId, replaceProjects, restoreAttempt, router]);

  useEffect(() => {
    if (!hydrated || !projectId) return;
    if (loadedProjectId === projectId) return;
    const stored = currentProject?.nodes;
    if (!stored?.length || nodes.length >= stored.length) return;
    const storedNodes = withImageSequenceNumbers(sanitizeCanvasNodes(stored));
    const storedConnections = sanitizeCanvasConnections(
      currentProject?.connections || [],
      storedNodes,
    );
    const next = withImageSequenceNumbers(
      sanitizeCanvasNodes(
        reconcileStoryDirectorImageResults(
          recoverInterruptedGeneration(storedNodes),
          storedConnections,
        ),
      ),
    );
    if (!next.length) return;
    setNodes(next);
    setConnections(sanitizeCanvasConnections(storedConnections, next));
    const fitted = fitViewportToNodes(
      next,
      size.width || 1200,
      size.height || 720,
    );
    if (fitted) {
      setViewport(fitted);
      didInitialCenterRef.current = true;
      shouldCenterInitialViewportRef.current = false;
    }
    if (!loadedProjectId) setLoadedProjectId(projectId);
  }, [
    currentProject,
    hydrated,
    loadedProjectId,
    nodes.length,
    projectId,
    size.height,
    size.width,
  ]);

  useEffect(() => {
    if (
      !projectLoaded ||
      applyingHistoryRef.current ||
      historyPausedRef.current
    )
      return;
    const next = createHistoryEntry();
    const previous = lastHistoryRef.current;
    if (
      previous?.nodes === next.nodes &&
      previous.connections === next.connections &&
      previous.chatSessions === next.chatSessions &&
      previous.activeChatId === next.activeChatId &&
      previous.backgroundMode === next.backgroundMode &&
      previous.showImageInfo === next.showImageInfo
    )
      return;

    if (historyCommitTimerRef.current)
      clearTimeout(historyCommitTimerRef.current);
    historyCommitTimerRef.current = setTimeout(() => {
      const current = createHistoryEntry();
      const last = lastHistoryRef.current;
      if (!last) return;
      historyRef.current.past = [...historyRef.current.past.slice(-49), last];
      historyRef.current.future = [];
      setHistoryState({ canUndo: true, canRedo: false });
      lastHistoryRef.current = current;
      historyCommitTimerRef.current = null;
    }, 180);

    return () => {
      if (historyCommitTimerRef.current) {
        clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = null;
      }
    };
  }, [
    activeChatId,
    backgroundMode,
    chatSessions,
    connections,
    createHistoryEntry,
    nodes,
    projectLoaded,
    showImageInfo,
  ]);

  useEffect(() => {
    if (!projectLoaded || historyPausedRef.current) return;
    updateProject(projectId, {
      nodes,
      connections,
      chatSessions,
      activeChatId,
      backgroundMode,
      showImageInfo,
    });
    if (config.channelMode === "remote")
      protectBackendImagesForCanvas(nodes, projectId);
  }, [
    activeChatId,
    backgroundMode,
    chatSessions,
    config.channelMode,
    connections,
    nodes,
    projectId,
    projectLoaded,
    showImageInfo,
    updateProject,
  ]);

  useEffect(() => {
    if (!projectLoaded) return;
    setNodes((prev) =>
      syncStoryDirectorInputMetadata(prev, connectionsRef.current),
    );
  }, [connections, projectLoaded]);

  useEffect(() => {
    if (!projectLoaded) return;
    setConnections((previous) => {
      const capabilityPreviewByPlaceholderId = new Map(
        nodesRef.current
          .filter(
            (node) =>
              node.type === CanvasNodeType.Video &&
              node.metadata?.seedanceWorkflowRole === "placeholder",
          )
          .map((placeholder) => [
            placeholder.id,
            previewStoryVideoCapabilityForNode(
              placeholder,
              config,
              effectiveConfig,
            ),
          ]),
      );
      const reconciled = reconcileSeedance2StoryPlaceholderReferences({
        nodes: nodesRef.current,
        connections: previous,
        shouldReconcilePlaceholder: (placeholder) =>
          capabilityPreviewByPlaceholderId.get(placeholder.id)?.state === "resolved",
        capabilityForPlaceholder: (placeholder) => {
          const preview = capabilityPreviewByPlaceholderId.get(placeholder.id);
          return preview?.state === "resolved" ? preview.capability : undefined;
        },
      });
      const retainedTargetNodeIds = new Set(
        [...capabilityPreviewByPlaceholderId.entries()]
          .filter(([, preview]) => preview.state === "route_unresolved" || Boolean(preview.capability))
          .map(([placeholderId]) => placeholderId),
      );
      return retainStoryAutoConnectionsForSupportedTargets(
        reconciled,
        retainedTargetNodeIds,
      );
    });
  }, [config, connections, effectiveConfig, nodes, projectLoaded]);

  useEffect(() => {
    if (!projectLoaded) return;
    setNodes((previous) => migrateIdleStoryVideoOperations({
      nodes: previous,
      resolveWorkflow: (workflow) => {
        const preview = previewStoryVideoCapabilityForNode(workflow, config, effectiveConfig);
        if (preview.state !== "resolved") return undefined;
        try {
          const apiConfig = buildCustomerVideoApiConfig(workflow, config, effectiveConfig);
          return {
            capability: preview.capability,
            providerId: apiConfig.route?.mode === "local" ? apiConfig.route.provider.id : "",
            model: apiConfig.model || "",
            videoConfig: buildGenerationConfig(effectiveConfig, workflow, "video"),
          };
        } catch {
          return undefined;
        }
      },
    }));
  }, [config, effectiveConfig, projectLoaded]);

  useEffect(() => {
    if (!dialogNodeId) setNodeImageSettingsOpen(false);
  }, [dialogNodeId]);

  const persistCanvasSnapshot = useCallback(
    (nextNodes: CanvasNodeData[], nextConnections = connectionsRef.current) => {
      if (activeProjectSessionRef.current !== projectSession) return;
      nodesRef.current = nextNodes;
      connectionsRef.current = nextConnections;
      updateProject(projectId, {
        nodes: nextNodes,
        connections: nextConnections,
        chatSessions,
        activeChatId,
        backgroundMode,
        showImageInfo,
      });
    },
    [
      activeChatId,
      backgroundMode,
      chatSessions,
      projectId,
      projectSession,
      showImageInfo,
      updateProject,
    ],
  );

  const persistNativeImageTaskBindings = useCallback(
    async (bindings: readonly CanvasImageTaskBindingTarget[]) => {
      const byTarget = new Map(bindings.map((item) => [item.targetId, item.binding]));
      bindings.forEach(({ binding }) =>
        resumedImageTaskIdsRef.current.add(
          `${binding.snapshot.taskId}:${binding.attemptId}:${binding.outputIndex}`,
        ),
      );
      const nextNodes = nodesRef.current.map((node) => {
        const binding = byTarget.get(node.id);
        if (
          !binding ||
          node.metadata?.imageGenerationAttemptId !== binding.attemptId
        )
          return node;
        return {
          ...node,
          metadata: {
            ...node.metadata,
            sourceImageTaskId: binding.snapshot.taskId,
            imageGenerationAttemptId: undefined,
            imageGenerationTask: binding,
          },
        };
      });
      if (
        bindings.some(
          ({ targetId, binding }) =>
            !nextNodes.some(
              (node) =>
                node.id === targetId &&
                ownsCanvasImageTask(
                  node.metadata?.imageGenerationTask,
                  binding.attemptId,
                  binding.snapshot.taskId,
                ),
            ),
        )
      ) {
        throw new Error("图片任务已被新的生成尝试替换，已停止当前轮询");
      }
      setNodes(nextNodes);
      persistCanvasSnapshot(nextNodes);
      await flushCanvasPersistence();
    },
    [persistCanvasSnapshot],
  );

  const applyPersistedNodes = useCallback(
    (updater: (nodes: CanvasNodeData[]) => CanvasNodeData[]) => {
      const nextNodes = updater(nodesRef.current);
      setNodes(nextNodes);
      persistCanvasSnapshot(nextNodes);
      return nextNodes;
    },
    [persistCanvasSnapshot],
  );

  const applyPersistedGraph = useCallback(
    (
      nodeUpdater: (nodes: CanvasNodeData[]) => CanvasNodeData[],
      connectionUpdater: (
        connections: CanvasConnection[],
      ) => CanvasConnection[],
    ) => {
      const nextNodes = nodeUpdater(nodesRef.current);
      const nextConnections = connectionUpdater(connectionsRef.current);
      setNodes(nextNodes);
      setConnections(nextConnections);
      persistCanvasSnapshot(nextNodes, nextConnections);
      return { nodes: nextNodes, connections: nextConnections };
    },
    [persistCanvasSnapshot],
  );

  const clearScheduledVideoTaskResume = useCallback((resumeKey: string) => {
    const timerId = videoTaskResumeTimersRef.current.get(resumeKey);
    if (timerId === undefined) return;
    window.clearTimeout(timerId);
    videoTaskResumeTimersRef.current.delete(resumeKey);
  }, []);

  const scheduleVideoTaskResume = useCallback((resumeKey: string) => {
    if (videoTaskResumeTimersRef.current.has(resumeKey)) return;
    const timerId = window.setTimeout(() => {
      videoTaskResumeTimersRef.current.delete(resumeKey);
      resumedVideoTaskIdsRef.current.delete(resumeKey);
      setVideoTaskResumeRevision((revision) => revision + 1);
    }, VIDEO_TASK_AUTO_RESUME_DELAY_MS);
    videoTaskResumeTimersRef.current.set(resumeKey, timerId);
  }, []);

  const cancelVideoTaskForNode = useCallback(
    (nodeId: string) => {
      const currentNode = nodesRef.current.find((node) => node.id === nodeId);
      if (!currentNode) return;
      for (const key of videoTaskControllerKeysForNode(
        nodeId,
        currentNode.metadata,
      )) {
        videoTaskControllersRef.current
          .get(key)
          ?.abort(new Error("用户已用本地视频替换当前生成任务"));
        videoTaskControllersRef.current.delete(key);
        clearScheduledVideoTaskResume(key);
        resumedVideoTaskIdsRef.current.delete(key);
      }
      videoGenerationEntryLocksRef.current.delete(nodeId);
      const nextNodes = nodesRef.current.map((node) =>
        node.id === nodeId
          ? { ...node, metadata: clearVideoTaskOwnership(node.metadata || {}) }
          : node,
      );
      nodesRef.current = nextNodes;
      setNodes(nextNodes);
      persistCanvasSnapshot(nextNodes);
    },
    [clearScheduledVideoTaskResume, persistCanvasSnapshot],
  );

  const deriveCharacterTurnaroundViews = useCallback(
    async (requestedNode: CanvasNodeData) => {
      const latest =
        nodesRef.current.find((node) => node.id === requestedNode.id) ||
        requestedNode;
      const sourceStorageKey = latest.metadata?.storageKey;
      if (
        latest.type !== CanvasNodeType.Image ||
        latest.metadata?.storyCharacterAssetKind !== "turnaround_sheet" ||
        !sourceStorageKey
      )
        return;
      if (
        hasCompleteCharacterDerivedViews(
          latest.metadata.characterDerivedViews,
          sourceStorageKey,
          latest.id,
        )
      ) {
        if (latest.metadata.characterDerivedViewsStatus !== "ready")
          applyPersistedNodes((current) =>
            current.map((node) =>
              node.id === latest.id
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      characterDerivedViewsStatus: "ready",
                      characterDerivedViewsError: undefined,
                    },
                  }
                : node,
            ),
          );
        return;
      }

      const flightKey = `${latest.id}\u0000${sourceStorageKey}`;
      const existingFlight = characterDerivationFlightsRef.current.get(flightKey);
      if (existingFlight) return existingFlight;
      const flight = (async () => {
        applyPersistedNodes((current) =>
          current.map((node) =>
            node.id === latest.id && node.metadata?.storageKey === sourceStorageKey
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    characterDerivedViewsStatus: "pending",
                    characterDerivedViewsError: undefined,
                  },
                }
              : node,
          ),
        );
        try {
          const sourceUrl = await resolveImageUrl(
            sourceStorageKey,
            latest.metadata?.content || "",
          );
          if (!sourceUrl) throw new Error("角色设定表源图不可读取");
          const views = await splitAndStoreCharacterTurnaroundSheet({
            parentNodeId: latest.id,
            sourceStorageKey,
            sourceUrl,
            existingViews: latest.metadata?.characterDerivedViews,
            upload: uploadImage,
          });
          applyPersistedNodes((current) =>
            current.map((node) =>
              node.id === latest.id &&
              node.metadata?.storageKey === sourceStorageKey &&
              node.metadata?.storyCharacterAssetKind === "turnaround_sheet"
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      characterDerivedViews: views,
                      characterDerivedViewsStatus: "ready",
                      characterDerivedViewsError: undefined,
                    },
                  }
                : node,
            ),
          );
        } catch (error) {
          const errorDetails = formatCanvasGenerationError(
            error,
            "角色角度图派生失败",
          );
          const stillCurrent = nodesRef.current.some(
            (node) =>
              node.id === latest.id &&
              node.metadata?.storageKey === sourceStorageKey &&
              node.metadata?.storyCharacterAssetKind === "turnaround_sheet",
          );
          if (stillCurrent) {
            applyPersistedNodes((current) =>
              current.map((node) =>
                node.id === latest.id &&
                node.metadata?.storageKey === sourceStorageKey
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        characterDerivedViewsStatus: "error",
                        characterDerivedViewsError: errorDetails,
                      },
                    }
                  : node,
              ),
            );
            message.warning(`${errorDetails}；原角色图已保留，可稍后重试`);
          }
        }
      })().finally(() => {
        characterDerivationFlightsRef.current.delete(flightKey);
      });
      characterDerivationFlightsRef.current.set(flightKey, flight);
      return flight;
    },
    [applyPersistedNodes, message],
  );

  const viewCharacterDerivedViews = useCallback(
    async (node: CanvasNodeData) => {
      try {
        await deriveCharacterTurnaroundViews(node);
        const latest = nodesRef.current.find(
          (candidate) => candidate.id === node.id,
        );
        const sourceStorageKey = latest?.metadata?.storageKey;
        if (
          !latest ||
          !sourceStorageKey ||
          !hasCompleteCharacterDerivedViews(
            latest.metadata?.characterDerivedViews,
            sourceStorageKey,
            latest.id,
          )
        )
          return;
        const storedViews = latest.metadata?.characterDerivedViews || [];
        const resolvedUrls = await resolveCharacterDerivedViewUrls(
          storedViews,
          (storageKey) => resolveImageUrl(storageKey),
        );
        const views = storedViews.flatMap((view) => {
          const url = resolvedUrls.get(view.id);
          return url
            ? [{ id: view.id, label: view.label, angle: view.angle, url }]
            : [];
        });
        setResolvedCharacterDerivedViews(views);
        setCharacterDerivedViewsNodeId(latest.id);
      } catch (error) {
        message.error(
          formatCanvasGenerationError(error, "角色角度图读取失败"),
        );
      }
    },
    [deriveCharacterTurnaroundViews, message],
  );

  const expandCharacterDerivedViews = useCallback(
    async (requestedNode?: CanvasNodeData) => {
      const parentId = requestedNode?.id || characterDerivedViewsNodeId;
      if (!parentId) return;
      const parent = nodesRef.current.find((node) => node.id === parentId);
      if (!parent) return;
      try {
        await deriveCharacterTurnaroundViews(parent);
        const latest = nodesRef.current.find((node) => node.id === parentId);
        const views = latest?.metadata?.characterDerivedViews || [];
        if (
          !latest?.metadata?.storageKey ||
          !hasCompleteCharacterDerivedViews(
            views,
            latest.metadata.storageKey,
            parentId,
          )
        )
          return;
        const resolvedUrls = await resolveCharacterDerivedViewUrls(
          views,
          (storageKey) => resolveImageUrl(storageKey),
        );
        applyPersistedGraph(
          (current) => {
            const existingDerivedIds = new Set(
              current
                .filter(
                  (node) =>
                    node.metadata?.characterDerivedFromNodeId === parentId &&
                    node.metadata?.storyCharacterAssetKind === "derived_view",
                )
                .map((node) => node.id),
            );
            const created = views.flatMap((view, index) => {
              if (existingDerivedIds.has(view.id)) return [];
              const content = resolvedUrls.get(view.id) || "";
              if (!content) return [];
              const nodeSize = fitNodeSize(view.width, view.height, 180, 220);
              return [
                {
                  id: view.id,
                  type: CanvasNodeType.Image,
                  title: `${latest.title || "角色"}-${view.label}`,
                  position: {
                    x:
                      latest.position.x + latest.width + 48 + (index % 2) * 204,
                    y: latest.position.y + Math.floor(index / 2) * 244,
                  },
                  width: nodeSize.width,
                  height: nodeSize.height,
                  metadata: {
                    content,
                    storageKey: view.storageKey,
                    retained: true,
                    mimeType: view.mimeType,
                    bytes: view.bytes,
                    naturalWidth: view.width,
                    naturalHeight: view.height,
                    status: NODE_STATUS_SUCCESS,
                    storyCharacterAssetKind: "derived_view",
                    storyCharacterId: latest.metadata?.storyCharacterId,
                    characterDerivedViewAngle: view.angle,
                    characterDerivedFromNodeId: parentId,
                  },
                } satisfies CanvasNodeData,
              ];
            });
            return created.length ? [...current, ...created] : current;
          },
          (current) => {
            const existingTargets = new Set(
              current
                .filter((connection) => connection.fromNodeId === parentId)
                .map((connection) => connection.toNodeId),
            );
            const additions = views
              .filter((view) => !existingTargets.has(view.id))
              .map((view) => ({
                id: nanoid(),
                fromNodeId: parentId,
                toNodeId: view.id,
              }));
            return additions.length ? [...current, ...additions] : current;
          },
        );
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "角色角度图展开失败"));
      }
    },
    [
      applyPersistedGraph,
      characterDerivedViewsNodeId,
      deriveCharacterTurnaroundViews,
      message,
    ],
  );

  useEffect(() => {
    if (!projectLoaded) return;
    let cancelled = false;
    const candidates = nodesRef.current.filter(
      (node) =>
        node.metadata?.storyCharacterAssetKind === "turnaround_sheet" &&
        node.metadata?.storageKey &&
        !hasCompleteCharacterDerivedViews(
          node.metadata.characterDerivedViews,
          node.metadata.storageKey,
          node.id,
        ),
    );
    void runWithConcurrency(candidates, 1, async (node) => {
      if (!cancelled) await deriveCharacterTurnaroundViews(node);
    });
    return () => {
      cancelled = true;
    };
  }, [deriveCharacterTurnaroundViews, projectLoaded]);

  const resumeCanvasVideoTask = useCallback(
    async (
      nodeId: string,
      snapshot: CanvasVideoGenerationTask,
      pollingStartedAt = snapshot.startedAt,
    ) => {
      const initialNode = nodesRef.current.find((node) => node.id === nodeId);
      if (
        !initialNode ||
        initialNode.metadata?.videoGenerationTask?.id !== snapshot.id
      )
        return;
      const attempt: VideoGenerationAttempt =
        initialNode.metadata?.videoGenerationAttempt?.taskId === snapshot.id
          ? initialNode.metadata.videoGenerationAttempt
          : {
              id:
                snapshot.attemptId ||
                `legacy-native:${snapshot.provider}:${snapshot.providerId || "-"}:${nodeId}:${snapshot.id}:${snapshot.startedAt}`,
              kind: "native",
              provider: snapshot.provider,
              providerId: snapshot.providerId,
              model: snapshot.model,
              startedAt: snapshot.startedAt,
              taskId: snapshot.id,
            };
      if (!ownsVideoGenerationAttempt(initialNode.metadata, attempt)) {
        const claimedNodes = nodesRef.current.map((node) =>
          node.id === nodeId &&
          node.metadata?.videoGenerationTask?.id === snapshot.id
            ? {
                ...node,
                metadata: {
                  ...node.metadata,
                  videoGenerationTask: {
                    ...node.metadata.videoGenerationTask,
                    attemptId: attempt.id,
                  },
                  videoGenerationAttempt: attempt,
                },
              }
            : node,
        );
        nodesRef.current = claimedNodes;
        setNodes(claimedNodes);
        persistCanvasSnapshot(claimedNodes);
      }
      const stillOwnsAttempt = (node: CanvasNodeData) =>
        ownsVideoGenerationAttempt(node.metadata, attempt);
      let route: ApiRequestRoute;
      try {
        if (snapshot.providerId) {
          const operation =
            initialNode.metadata?.videoGenerationScope?.operation;
          const strictResume = validateCanvasVideoTaskProviderSnapshot(
            snapshot.providerSnapshot,
            effectiveConfig.apiRelays,
            snapshot.credentialId && operation
              ? {
                  providerId: snapshot.providerId,
                  model: snapshot.model,
                  credentialId: snapshot.credentialId,
                  capability: "video",
                  operation,
                }
              : undefined,
          );
          if (strictResume.status === "blocked")
            throw new Error(strictResume.message);
          const provider = strictResume.provider;
          route = {
            mode: "local",
            capability: "video",
            model: snapshot.model,
            provider,
            timeoutMs: resolveApiRelayTimeoutMs(
              provider,
              effectiveConfig.apiRelayAdvanced.defaultTimeoutMs || 360_000,
            ),
          };
        } else {
          route = resolveApiRequestRoute(
            effectiveConfig,
            "video",
            snapshot.model,
            "videoGeneration",
          );
        }
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "视频任务原 Provider 配置不可用，无法恢复轮询",
        );
        applyPersistedNodes((currentNodes) =>
          currentNodes.map((node) =>
            node.id === nodeId && stillOwnsAttempt(node)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    ...(node.metadata?.seedanceWorkflowRole === "placeholder"
                      ? {
                          seedanceGenerationTaskState: {
                            status: "failed" as const,
                            taskId: snapshot.id,
                            errorMessage: errorDetails,
                          },
                        }
                      : {}),
                  },
                }
              : node,
          ),
        );
        return;
      }
      const restored = restoreCanvasVideoGenerationTask(snapshot, route);
      if (restored.status === "provider-mismatch") {
        const nextNodes = applyPersistedNodes((currentNodes) =>
          currentNodes.map((node) =>
            node.id === nodeId && stillOwnsAttempt(node)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails:
                      "视频任务原 Provider 已变更，无法安全恢复轮询",
                    ...(node.metadata?.seedanceWorkflowRole === "placeholder"
                      ? {
                          seedanceGenerationTaskState: {
                            status: "failed" as const,
                            taskId: snapshot.id,
                            errorMessage:
                              "视频任务原 Provider 已变更，无法安全恢复轮询",
                          },
                        }
                      : {}),
                  },
                }
              : node,
          ),
        );
        nodesRef.current = nextNodes;
        return;
      }
      if (restored.status === "credential-missing") {
        const nextNodes = applyPersistedNodes((currentNodes) =>
          currentNodes.map((node) =>
            node.id === nodeId && stillOwnsAttempt(node)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails:
                      "视频任务使用的 Provider Key 槽位已不存在，无法恢复轮询",
                    ...(node.metadata?.seedanceWorkflowRole === "placeholder"
                      ? {
                          seedanceGenerationTaskState: {
                            status: "failed" as const,
                            taskId: snapshot.id,
                            errorMessage:
                              "视频任务使用的 Provider Key 槽位已不存在，无法恢复轮询",
                          },
                        }
                      : {}),
                  },
                }
              : node,
          ),
        );
        nodesRef.current = nextNodes;
        return;
      }

      const task: VideoGenerationTask = { ...restored.task, route };
      const polling = createTimedVideoTaskAbortController(
        pollingStartedAt,
        route.timeoutMs,
        "视频任务已超过本次生成的最长等待时间",
      );
      const { controller } = polling;
      const controllerKey = videoTaskControllerKey({
        provider: snapshot.provider,
        providerId: snapshot.providerId,
        nodeId,
        taskId: snapshot.id,
      });
      clearScheduledVideoTaskResume(controllerKey);
      videoTaskControllersRef.current.set(controllerKey, controller);
      applyPersistedNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId && stillOwnsAttempt(node)
            ? {
                ...node,
                metadata: {
                  ...node.metadata,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                },
              }
            : node,
        ),
      );
      try {
        const uploadedVideos = await pollCanvasVideoTaskUntilReady(
          effectiveConfig,
          task,
          controller.signal,
        );
        if (!uploadedVideos.length)
          throw new CanvasVideoTerminalError("视频任务完成但没有可落盘的结果");
        const currentNode = nodesRef.current.find((node) => node.id === nodeId);
        if (!currentNode || !stillOwnsAttempt(currentNode)) return;
        await persistCanvasVideoWorks({
          videos: uploadedVideos,
          title: currentNode.title,
          prompt: currentNode.metadata?.prompt || "",
          model: snapshot.model || currentNode.metadata?.model || "",
          providerId: snapshot.providerId || attempt.providerId,
        });
        if (currentNode.metadata?.seedanceWorkflowRole === "placeholder") {
          const fileUrls = uploadedVideos.map((video) => video.url);
          const inserted = uploadedVideos.reduce(
            (graph, uploaded, resultIndex) =>
              insertSeedance2ResultNode(
                graph.nodes,
                graph.connections,
                currentNode,
                {
                  url: uploaded.url,
                  taskId: snapshot.id,
                  files: [],
                  fileUrls,
                  paramsSnapshot: {
                    ratio: submittedSeedance2ResultRatio({
                      paramsSnapshot: {
                        aspectRatio:
                          currentNode.metadata?.videoWireFormat?.aspectRatio ||
                          currentNode.metadata?.videoGenerationSettings?.aspectRatio,
                        wireFormat: currentNode.metadata?.videoWireFormat,
                        settings: currentNode.metadata?.videoGenerationSettings,
                      },
                      sourcePlaceholder: currentNode,
                    }),
                    aspectRatio:
                      currentNode.metadata?.videoWireFormat?.aspectRatio ||
                      currentNode.metadata?.videoGenerationSettings?.aspectRatio,
                    duration:
                      currentNode.metadata?.seedanceDuration ||
                      currentNode.metadata?.seconds,
                    model: snapshot.model,
                    wireFormat: currentNode.metadata?.videoWireFormat,
                    settings: currentNode.metadata?.videoGenerationSettings,
                  },
                  storageKey: uploaded.storageKey,
                  mimeType: uploaded.mimeType,
                  resultIndex,
                  resultCount: uploadedVideos.length,
                },
              ),
            { nodes: nodesRef.current, connections: connectionsRef.current },
          );
          nodesRef.current = inserted.nodes;
          connectionsRef.current = inserted.connections;
          setNodes(inserted.nodes);
          setConnections(inserted.connections);
          persistCanvasSnapshot(inserted.nodes, inserted.connections);
          return;
        }
        const materialized = applyCanvasVideoBatchResults({
          nodes: nodesRef.current,
          connections: connectionsRef.current,
          targetNodeId: nodeId,
          videos: uploadedVideos,
          createNodeId: () => nanoid(),
          createConnectionId: () => nanoid(),
          maxWidth: VIDEO_NODE_MAX_WIDTH,
          maxHeight: VIDEO_NODE_MAX_HEIGHT,
        });
        const completedNodes = materialized.nodes.map((node) =>
          materialized.resultNodeIds.includes(node.id)
            ? {
                ...node,
                metadata: {
                  ...node.metadata,
                  videoGenerationAttempt: undefined,
                  seedanceGenerationTaskState: undefined,
                  seedanceTaskId: undefined,
                },
              }
            : node,
        );
        nodesRef.current = completedNodes;
        setNodes(completedNodes);
        setConnections(materialized.connections);
        persistCanvasSnapshot(completedNodes, materialized.connections);
      } catch (error) {
        const pollingPaused = isVideoTaskPollingPausedError(
          error,
          controller.signal,
        );
        const pollingDeadlineExhausted =
          controller.signal.reason instanceof CanvasVideoPollingDeadlineError;
        const providerTerminalAbort =
          controller.signal.reason instanceof CanvasVideoTerminalError;
        if (
          controller.signal.aborted &&
          !pollingPaused &&
          !pollingDeadlineExhausted &&
          !providerTerminalAbort
        )
          return;
        const resolvedError =
          pollingDeadlineExhausted || providerTerminalAbort
            ? controller.signal.reason
            : error;
        if (pollingDeadlineExhausted) {
          const errorDetails = `${formatCanvasGenerationError(
            resolvedError,
            "视频任务本地轮询已暂停",
          )}；远端任务仍可继续查询`;
          const nextNodes = nodesRef.current.map((node) =>
            node.id === nodeId && stillOwnsAttempt(node)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    ...(node.metadata?.seedanceWorkflowRole === "placeholder"
                      ? {
                          seedanceGenerationTaskState: {
                            status: "timeout" as const,
                            taskId: snapshot.id,
                            startedAt: snapshot.startedAt,
                            attemptId: attempt.id,
                            provider: attempt.provider,
                            providerId: attempt.providerId,
                            model: attempt.model,
                            errorMessage: errorDetails,
                          },
                        }
                      : {}),
                  },
                }
              : node,
          );
          nodesRef.current = nextNodes;
          setNodes(nextNodes);
          persistCanvasSnapshot(nextNodes);
          return;
        }
        const recoverable =
          !providerTerminalAbort &&
          (pollingPaused || isRetryableVideoTaskPollingError(resolvedError));
        if (recoverable) {
          const nextNodes = nodesRef.current.map((node) =>
            node.id === nodeId && stillOwnsAttempt(node)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_LOADING,
                    errorDetails: undefined,
                    ...(node.metadata?.seedanceWorkflowRole === "placeholder"
                      ? {
                          seedanceGenerationTaskState: {
                            status: "generating" as const,
                            taskId: snapshot.id,
                            startedAt: snapshot.startedAt,
                          },
                        }
                      : {}),
                  },
                }
              : node,
          );
          nodesRef.current = nextNodes;
          setNodes(nextNodes);
          persistCanvasSnapshot(nextNodes);
          scheduleVideoTaskResume(controllerKey);
          return;
        }
        const terminalFailure =
          resolvedError instanceof CanvasVideoTerminalError;
        const errorDetails = formatCanvasGenerationError(
          resolvedError,
          "视频任务恢复失败",
        );
        const nextNodes = nodesRef.current.map((node) =>
          node.id === nodeId && stillOwnsAttempt(node)
            ? {
                ...node,
                metadata: {
                  ...node.metadata,
                  status: NODE_STATUS_ERROR,
                  errorDetails,
                  ...(terminalFailure
                    ? {
                        videoGenerationTask: undefined,
                        videoGenerationAttempt: undefined,
                      }
                    : {}),
                  ...(node.metadata?.seedanceWorkflowRole === "placeholder"
                    ? {
                        seedanceGenerationTaskState: {
                          status: terminalFailure
                            ? ("failed" as const)
                            : ("generating" as const),
                          taskId: snapshot.id,
                          ...(!terminalFailure
                            ? { startedAt: snapshot.startedAt }
                            : {}),
                          errorMessage: errorDetails,
                        },
                      }
                    : {}),
                },
              }
            : node,
        );
        nodesRef.current = nextNodes;
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } finally {
        polling.cancelTimeout();
        videoTaskControllersRef.current.delete(controllerKey);
      }
    },
    [
      applyPersistedNodes,
      clearScheduledVideoTaskResume,
      effectiveConfig,
      persistCanvasSnapshot,
      scheduleVideoTaskResume,
    ],
  );

  const resumeCustomerSeedanceTask = useCallback(
    async (
      nodeId: string,
      taskId: string,
      startedAt: string,
      expectedAttempt?: CustomerVideoAttempt,
      pollingStartedAt = startedAt,
    ) => {
      const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
      if (
        !sourceNode ||
        sourceNode.metadata?.seedanceGenerationTaskState?.taskId !== taskId
      )
        return;
      const persistedAttempt =
        expectedAttempt ||
        (sourceNode.metadata?.videoGenerationAttempt?.taskId === taskId
          ? sourceNode.metadata.videoGenerationAttempt
          : undefined);
      const persistedSnapshot = persistedAttempt?.providerSnapshot;
      let apiConfig: CustomerVideoApiConfig;
      try {
        if (persistedSnapshot) {
          const operation = sourceNode.metadata?.videoGenerationScope?.operation;
          const strictResume = validateCanvasVideoTaskProviderSnapshot(
            persistedSnapshot,
            effectiveConfig.apiRelays,
            persistedAttempt?.providerId && operation
              ? {
                  providerId: persistedAttempt.providerId,
                  model: persistedAttempt.model,
                  credentialId: persistedSnapshot.credentialId,
                  capability: "video",
                  operation,
                }
              : undefined,
          );
          if (strictResume.status === "blocked") throw new Error(strictResume.message);
          const exactProviderConfig: CustomerVideoApiConfig = {
            baseUrl: persistedSnapshot.baseUrl,
            model: persistedSnapshot.model,
            route: {
              mode: "local",
              capability: "video",
              model: persistedSnapshot.model,
              provider: strictResume.provider,
              timeoutMs: resolveApiRelayTimeoutMs(
                strictResume.provider,
                effectiveConfig.apiRelayAdvanced.defaultTimeoutMs || 360_000,
              ),
            },
          };
          apiConfig = pinCustomerVideoApiConfigToCredential(
            exactProviderConfig,
            persistedSnapshot.credentialId,
          );
        } else {
          const resolvedApiConfig = buildCustomerVideoApiConfig(
            sourceNode,
            config,
            effectiveConfig,
          );
          if (resolvedApiConfig.route?.mode === "local") {
            throw new Error(
              "旧视频任务没有严格 provider 快照，无法安全自动恢复。",
            );
          } else {
            apiConfig = resolvedApiConfig;
          }
        }
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "视频任务原 Provider 配置不可用，无法恢复轮询",
        );
        applyPersistedNodes((currentNodes) =>
          currentNodes.map((node) =>
            node.id === nodeId &&
            node.metadata?.seedanceGenerationTaskState?.taskId === taskId
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    seedanceGenerationTaskState: {
                      ...node.metadata.seedanceGenerationTaskState,
                      status: "failed" as const,
                      taskId,
                      errorMessage: errorDetails,
                    },
                  },
                }
              : node,
          ),
        );
        return;
      }
      const providerId =
        apiConfig.route?.mode === "local"
          ? apiConfig.route.provider.id
          : apiConfig.baseUrl;
      const attempt: CustomerVideoAttempt =
        persistedAttempt ||
        {
              id:
                sourceNode.metadata?.seedanceGenerationTaskState?.attemptId ||
                `legacy-customer:${providerId}:${nodeId}:${taskId}:${startedAt}`,
              kind: "customer",
              provider: "customer",
              providerId,
              model: apiConfig.model || "",
              startedAt,
              taskId,
            };
      if (!ownsVideoGenerationAttempt(sourceNode.metadata, attempt)) {
        const claimedNodes = nodesRef.current.map((node) =>
          node.id === nodeId &&
          node.metadata?.seedanceGenerationTaskState?.taskId === taskId
            ? {
                ...node,
                metadata: {
                  ...node.metadata,
                  videoGenerationAttempt: attempt,
                  seedanceGenerationTaskState: {
                    ...node.metadata.seedanceGenerationTaskState,
                    attemptId: attempt.id,
                    provider: attempt.provider,
                    providerId: attempt.providerId,
                    model: attempt.model,
                  },
                },
              }
            : node,
        );
        nodesRef.current = claimedNodes;
        setNodes(claimedNodes);
        persistCanvasSnapshot(claimedNodes);
      }
      const stillOwnsAttempt = (node: CanvasNodeData) =>
        ownsVideoGenerationAttempt(node.metadata, attempt);
      const polling = createTimedVideoTaskAbortController(
        pollingStartedAt,
        apiConfig.route?.timeoutMs
          ?? CUSTOMER_VIDEO_TASK_POLL_INTERVAL_MS * CUSTOMER_VIDEO_TASK_POLL_RETRY_LIMIT,
        "视频任务已超过本次生成的最长等待时间",
      );
      const { controller } = polling;
      const controllerKey = videoTaskControllerKey({
        provider: attempt.provider,
        providerId: attempt.providerId,
        nodeId,
        taskId,
      });
      clearScheduledVideoTaskResume(controllerKey);
      videoTaskControllersRef.current.set(controllerKey, controller);
      applyPersistedNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId && stillOwnsAttempt(node)
            ? {
                ...node,
                metadata: {
                  ...node.metadata,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                  seedanceGenerationTaskState: {
                    status: "generating" as const,
                    taskId,
                    startedAt,
                    attemptId: attempt.id,
                    provider: attempt.provider,
                    providerId: attempt.providerId,
                    model: attempt.model,
                  },
                },
              }
            : node,
        ),
      );
      try {
        const task = await pollCustomerVideoTaskUntilReady(
          taskId,
          apiConfig,
          controller.signal,
        );
        const currentNode = nodesRef.current.find((node) => node.id === nodeId);
        if (!currentNode || !stillOwnsAttempt(currentNode)) return;
        const inserted = await materializeCustomerSeedanceTaskResults({
          nodes: nodesRef.current,
          connections: connectionsRef.current,
          placeholder: currentNode,
          task,
          taskId,
          baseUrl: apiConfig.baseUrl,
          route: apiConfig.route,
          paramsSnapshot: {
            ratio: currentNode.metadata?.seedanceRatio || currentNode.metadata?.size,
            duration: currentNode.metadata?.seedanceDuration || currentNode.metadata?.seconds,
            model: apiConfig.model,
          },
        });
        await persistCanvasVideoWorks({
          videos: inserted.uploadedVideos,
          title: currentNode.title,
          prompt: currentNode.metadata?.prompt || "",
          model: apiConfig.model || attempt.model || currentNode.metadata?.model || "",
          providerId: attempt.providerId,
        });
        const latestNode = nodesRef.current.find((node) => node.id === nodeId);
        if (!latestNode || !stillOwnsAttempt(latestNode)) return;
        nodesRef.current = inserted.nodes;
        connectionsRef.current = inserted.connections;
        setNodes(inserted.nodes);
        setConnections(inserted.connections);
        persistCanvasSnapshot(inserted.nodes, inserted.connections);
      } catch (error) {
        const pollingPaused = isVideoTaskPollingPausedError(error, controller.signal);
        const pollingDeadlineExhausted =
          controller.signal.reason instanceof CanvasVideoPollingDeadlineError;
        const providerTerminalAbort =
          controller.signal.reason instanceof CanvasVideoTerminalError;
        if (
          controller.signal.aborted &&
          !pollingPaused &&
          !pollingDeadlineExhausted &&
          !providerTerminalAbort
        )
          return;
        const resolvedError =
          pollingDeadlineExhausted || providerTerminalAbort
            ? controller.signal.reason
            : error;
        if (pollingDeadlineExhausted) {
          const errorDetails = `${formatCanvasGenerationError(
            resolvedError,
            "视频任务本地轮询已暂停",
          )}；远端任务仍可继续查询`;
          const nextNodes = nodesRef.current.map((node) =>
            node.id === nodeId && stillOwnsAttempt(node)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    seedanceGenerationTaskState: {
                      status: "timeout" as const,
                      taskId,
                      startedAt,
                      attemptId: attempt.id,
                      provider: attempt.provider,
                      providerId: attempt.providerId,
                      model: attempt.model,
                      errorMessage: errorDetails,
                    },
                  },
                }
              : node,
          );
          nodesRef.current = nextNodes;
          setNodes(nextNodes);
          persistCanvasSnapshot(nextNodes);
          return;
        }
        const recoverable =
          !providerTerminalAbort &&
          (pollingPaused || isRetryableVideoTaskPollingError(resolvedError));
        if (recoverable) {
          const nextNodes = nodesRef.current.map((node) =>
            node.id === nodeId && stillOwnsAttempt(node)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_LOADING,
                    errorDetails: undefined,
                    seedanceGenerationTaskState: {
                      status: "generating" as const,
                      taskId,
                      startedAt,
                      attemptId: attempt.id,
                      provider: attempt.provider,
                      providerId: attempt.providerId,
                      model: attempt.model,
                    },
                  },
                }
              : node,
          );
          nodesRef.current = nextNodes;
          setNodes(nextNodes);
          persistCanvasSnapshot(nextNodes);
          scheduleVideoTaskResume(controllerKey);
          return;
        }
        const terminalFailure = resolvedError instanceof CanvasVideoTerminalError;
        const errorDetails = formatCanvasGenerationError(resolvedError, "视频任务恢复失败");
        const nextNodes = nodesRef.current.map((node) =>
          node.id === nodeId && stillOwnsAttempt(node)
            ? {
                ...node,
                metadata: {
                  ...node.metadata,
                  status: NODE_STATUS_ERROR,
                  errorDetails,
                  seedanceGenerationTaskState: {
                    status: terminalFailure ? "failed" as const : "generating" as const,
                    taskId,
                    ...(!terminalFailure ? { startedAt } : {}),
                    errorMessage: errorDetails,
                  },
                  ...(terminalFailure
                    ? { videoGenerationAttempt: undefined }
                    : {}),
                },
              }
            : node,
        );
        nodesRef.current = nextNodes;
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } finally {
        polling.cancelTimeout();
        videoTaskControllersRef.current.delete(controllerKey);
      }
    },
    [
      applyPersistedNodes,
      clearScheduledVideoTaskResume,
      config,
      effectiveConfig,
      persistCanvasSnapshot,
      scheduleVideoTaskResume,
    ],
  );

  useEffect(() => {
    return () => {
      videoTaskControllersRef.current.forEach((controller) =>
        controller.abort(new Error("画布视频任务轮询已停止")),
      );
      videoTaskControllersRef.current.clear();
      videoTaskResumeTimersRef.current.forEach((timerId) =>
        window.clearTimeout(timerId),
      );
      videoTaskResumeTimersRef.current.clear();
      videoGenerationEntryLocksRef.current.clear();
      resumedVideoTaskIdsRef.current.clear();
      resumedImageTaskIdsRef.current.clear();
      nativeImageResumeTasksRef.current.clear();
      releaseMediaObjectUrls(collectMediaStorageKeys(nodesRef.current));
      void refreshAssetMediaUrls();
    };
  }, [projectId, refreshAssetMediaUrls]);

  const resumeCanvasImageTask = useCallback(
    async (nodeId: string, taskId: string) => {
      const taskProjectSession = activeProjectSessionRef.current;
      const taskProjectIsCurrent = () =>
        activeProjectSessionRef.current === taskProjectSession;
      try {
        const generated = await pollCanvasImageTask(taskId);
        if (!taskProjectIsCurrent()) return;
        const uploaded = await uploadImage(generated.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
        if (!taskProjectIsCurrent()) return;
        const nextNodes = reconcileStoryDirectorImageResults(
          nodesRef.current.map((node) =>
            node.id === nodeId &&
            node.metadata?.sourceImageTaskId === taskId
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    ...imageMetadata(uploaded, generated),
                  },
                }
              : node,
          ),
          connectionsRef.current,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } catch (error) {
        if (!taskProjectIsCurrent()) return;
        const errorDetails = formatCanvasGenerationError(
          error,
          "图片任务恢复失败",
        );
        const nextNodes = reconcileStoryDirectorImageResults(
          nodesRef.current.map((node) =>
            node.id === nodeId &&
            node.metadata?.sourceImageTaskId === taskId
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    sourceImageTaskId: undefined,
                  },
                }
              : node,
          ),
          connectionsRef.current,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } finally {
        resumedImageTaskIdsRef.current.delete(taskId);
      }
    },
    [persistCanvasSnapshot],
  );

  const resumeCanvasNativeImageTask = useCallback(
    async (nodeId: string, binding: CanvasImageTaskBinding) => {
      const taskProjectSession = activeProjectSessionRef.current;
      const taskProjectIsCurrent = () =>
        activeProjectSessionRef.current === taskProjectSession;
      const snapshot = binding.snapshot;
      const sharedKey = [
        snapshot.provider,
        snapshot.providerId || "",
        snapshot.taskId,
        snapshot.credentialId || "",
      ].join(":");
      try {
        let task = nativeImageResumeTasksRef.current.get(sharedKey);
        if (!task) {
          task = resumeNativeImageTask(effectiveConfig, snapshot);
          nativeImageResumeTasksRef.current.set(sharedKey, task);
        }
        const generated = await task;
        const image = generated[binding.outputIndex];
        if (!image)
          throw new Error(
            `图片任务缺少第 ${binding.outputIndex + 1} 个输出，无法恢复该节点`,
          );
        if (!taskProjectIsCurrent()) return;
        const uploaded = await uploadImage(
          image.dataUrl,
          CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
        );
        if (!taskProjectIsCurrent()) return;
        const nextNodes = reconcileStoryDirectorImageResults(
          nodesRef.current.map((node) =>
            node.id === nodeId &&
            ownsCanvasImageTask(
              node.metadata?.imageGenerationTask,
              binding.attemptId,
              snapshot.taskId,
            )
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    ...imageMetadata(uploaded, image),
                  },
                }
              : node,
          ),
          connectionsRef.current,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } catch (error) {
        if (!taskProjectIsCurrent()) return;
        const errorDetails = formatCanvasGenerationError(
          error,
          "原生图片任务恢复失败",
        );
        const terminal = error instanceof NativeImageTaskTerminalError;
        const nextNodes = reconcileStoryDirectorImageResults(
          nodesRef.current.map((node) =>
            node.id === nodeId &&
            ownsCanvasImageTask(
              node.metadata?.imageGenerationTask,
              binding.attemptId,
              snapshot.taskId,
            )
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    ...(terminal
                      ? {
                          sourceImageTaskId: undefined,
                          imageGenerationTask: undefined,
                        }
                      : {}),
                  },
                }
              : node,
          ),
          connectionsRef.current,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      }
    },
    [effectiveConfig, persistCanvasSnapshot],
  );

  useEffect(() => {
    if (!projectLoaded) return;
    nodes
      .filter((node) => {
        return (
          node.type === CanvasNodeType.Image &&
          hasResumableCanvasImageTask(node.metadata)
        );
      })
      .forEach((node) => {
        const nativeBinding = node.metadata?.imageGenerationTask;
        if (nativeBinding) {
          const resumeKey = `${nativeBinding.snapshot.taskId}:${nativeBinding.attemptId}:${nativeBinding.outputIndex}`;
          if (resumedImageTaskIdsRef.current.has(resumeKey)) return;
          resumedImageTaskIdsRef.current.add(resumeKey);
          void resumeCanvasNativeImageTask(node.id, nativeBinding);
          return;
        }
        const taskId = node.metadata!.sourceImageTaskId!;
        if (resumedImageTaskIdsRef.current.has(taskId)) return;
        if (taskId.startsWith("canvas-")) {
          const nextNodes = nodesRef.current.map((item) =>
            item.id === node.id && item.metadata?.sourceImageTaskId === taskId
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails:
                      "旧版本未保存 provider 真实任务句柄，无法恢复；已停止且不会重新提交付费请求",
                    sourceImageTaskId: undefined,
                  },
                }
              : item,
          );
          setNodes(nextNodes);
          persistCanvasSnapshot(nextNodes);
          return;
        }
        resumedImageTaskIdsRef.current.add(taskId);
        void resumeCanvasImageTask(node.id, taskId);
      });
  }, [nodes, projectLoaded, persistCanvasSnapshot, resumeCanvasImageTask, resumeCanvasNativeImageTask]);

  useEffect(() => {
    resumedVideoTaskIdsRef.current.forEach((resumeKey) => {
      if (
        !videoTaskControllersRef.current.has(resumeKey) &&
        !videoTaskResumeTimersRef.current.has(resumeKey)
      )
        resumedVideoTaskIdsRef.current.delete(resumeKey);
    });
  }, [effectiveConfig]);

  useEffect(() => {
    if (!projectLoaded) return;
    nodes.forEach((node) => {
      const task = node.metadata?.videoGenerationTask;
      if (!task) return;
      const resumeKey = videoTaskControllerKey({
        provider: task.provider,
        providerId: task.providerId,
        nodeId: node.id,
        taskId: task.id,
      });
      if (
        resumedVideoTaskIdsRef.current.has(resumeKey) ||
        videoTaskControllersRef.current.has(resumeKey) ||
        videoTaskResumeTimersRef.current.has(resumeKey)
      )
        return;
      resumedVideoTaskIdsRef.current.add(resumeKey);
      void resumeCanvasVideoTask(node.id, task);
    });
  }, [nodes, projectLoaded, resumeCanvasVideoTask, videoTaskResumeRevision]);

  useEffect(() => {
    if (!projectLoaded) return;
    nodes.forEach((node) => {
      const taskState = node.metadata?.seedanceGenerationTaskState;
      if (
        node.metadata?.videoGenerationTask ||
        taskState?.status !== "generating" ||
        !taskState.taskId ||
        !taskState.startedAt
      )
        return;
      const resumeKey = videoTaskControllerKey({
        provider: taskState.provider || "customer",
        providerId: taskState.providerId,
        nodeId: node.id,
        taskId: taskState.taskId,
      });
      if (
        resumedVideoTaskIdsRef.current.has(resumeKey) ||
        videoTaskControllersRef.current.has(resumeKey) ||
        videoTaskResumeTimersRef.current.has(resumeKey)
      )
        return;
      resumedVideoTaskIdsRef.current.add(resumeKey);
      void resumeCustomerSeedanceTask(
        node.id,
        taskState.taskId,
        taskState.startedAt,
        node.metadata?.videoGenerationAttempt,
      );
    });
  }, [nodes, projectLoaded, resumeCustomerSeedanceTask, videoTaskResumeRevision]);

  useEffect(() => {
    if (!projectLoaded) return;
    if (viewportSaveTimerRef.current)
      clearTimeout(viewportSaveTimerRef.current);
    viewportSaveTimerRef.current = setTimeout(() => {
      updateProject(projectId, { viewport: canvasViewportRuntime.current });
      viewportSaveTimerRef.current = null;
    }, 500);
  }, [projectId, projectLoaded, updateProject, viewport]);

  useEffect(() => {
    if (!projectLoaded) return;
    return () => {
      if (!viewportSaveTimerRef.current) return;
      clearTimeout(viewportSaveTimerRef.current);
      viewportSaveTimerRef.current = null;
      updateProject(projectId, { viewport: canvasViewportRuntime.current });
    };
  }, [projectId, projectLoaded, updateProject]);

  useLayoutEffect(() => {
    nodesRef.current = nodes;
    connectionsRef.current = connections;
    selectedNodeIdsRef.current = selectedNodeIds;
    selectedConnectionIdRef.current = selectedConnectionId;
    dialogNodeIdRef.current = dialogNodeId;
    previewNodeIdRef.current = previewNodeId;
    hoveredNodeIdRef.current = hoveredNodeId;
    toolbarNodeIdRef.current = toolbarNodeId;
    contextMenuRef.current = contextMenu;
    viewportRef.current = viewport;
    connectingParamsRef.current = connectingParams;
    connectionTargetNodeIdRef.current = connectionTargetNodeId;
    connectionTargetHandleIdRef.current = connectionTargetHandleId;
    pendingConnectionCreateRef.current = pendingConnectionCreate;
  }, [
    nodes,
    connections,
    selectedNodeIds,
    selectedConnectionId,
    dialogNodeId,
    previewNodeId,
    hoveredNodeId,
    toolbarNodeId,
    contextMenu,
    viewport,
    connectingParams,
    connectionTargetNodeId,
    connectionTargetHandleId,
    pendingConnectionCreate,
  ]);

  useLayoutEffect(() => {
    selectionBoxRef.current = selectionBox;
  }, [selectionBox]);

  useLayoutEffect(() => {
    if (!projectLoaded) return;
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
      if (pendingFitRef.current && rect.width > 80 && rect.height > 80 && nodesRef.current.length) {
        const fitted = fitViewportToNodes(nodesRef.current, rect.width, rect.height);
        if (fitted) setViewport(fitted);
        pendingFitRef.current = false;
        didInitialCenterRef.current = true;
        return;
      }
      if (
        !didInitialCenterRef.current &&
        shouldCenterInitialViewportRef.current
      ) {
        const fitted = fitViewportToNodes(
          nodesRef.current,
          rect.width,
          rect.height,
        );
        setViewport(
          fitted || { x: rect.width / 2, y: rect.height / 2, k: 1 },
        );
      }
      didInitialCenterRef.current = true;
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [projectId, projectLoaded]);

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const currentViewport = canvasViewportRuntime.current;
    const localX = clientX - (rect?.left || 0);
    const localY = clientY - (rect?.top || 0);
    const k = Math.max(currentViewport.k, 0.05);

    return {
      x: (localX - currentViewport.x) / k,
      y: (localY - currentViewport.y) / k,
    };
  }, []);

  const getCanvasCenter = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const current = canvasViewportRuntime.current;
    const width = rect?.width || size.width || 1200;
    const height = rect?.height || size.height || 720;
    const k = Math.max(current.k, 0.05);
    return {
      x: (width / 2 - current.x) / k,
      y: (height / 2 - current.y) / k,
    };
  }, [size.height, size.width]);

  const focusNodeInView = useCallback((node: CanvasNodeData) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const width = rect?.width || size.width || 1200;
    const k = Math.max(canvasViewportRuntime.current.k, 0.05);
    setViewport({
      x: width / 2 - (node.position.x + node.width / 2) * k,
      y: 32 - node.position.y * k,
      k,
    });
  }, [size.width]);

  const setConnecting = useCallback((next: ConnectionHandle | null) => {
    connectingParamsRef.current = next;
    setConnectingParams(next);
    if (!next) {
      connectionTargetNodeIdRef.current = null;
      connectionTargetHandleIdRef.current = null;
      setConnectionTargetNodeId(null);
      setConnectionTargetHandleId(null);
    }
  }, []);

  const keepNodeToolbar = useCallback(
    (nodeId: string) => {
      if (HIDE_CANVAS_NODE_HOVER_TOOLBAR) return;
      if (nodeDraggingRef.current || nodeImageSettingsOpen) return;
      if (toolbarHideTimerRef.current) {
        clearTimeout(toolbarHideTimerRef.current);
        toolbarHideTimerRef.current = null;
      }
      setToolbarNodeId(nodeId);
    },
    [nodeImageSettingsOpen],
  );

  const hideNodeToolbar = useCallback(() => {
    if (HIDE_CANVAS_NODE_HOVER_TOOLBAR) {
      setToolbarNodeId(null);
      return;
    }
    if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
    toolbarHideTimerRef.current = setTimeout(() => {
      setToolbarNodeId(null);
      toolbarHideTimerRef.current = null;
    }, 120);
  }, []);

  const retainCanvasImageNodesById = useCallback((nodeIds: string[]) => {
    const targetIds = new Set(nodeIds);
    const storageKeys = nodesRef.current
      .filter(
        (node) =>
          targetIds.has(node.id) &&
          node.type === CanvasNodeType.Image &&
          Boolean(node.metadata?.storageKey),
      )
      .map((node) => node.metadata?.storageKey)
      .filter((key): key is string => Boolean(key));
    if (storageKeys.length) void setStoredImagesRetained(storageKeys, true);
    if (!storageKeys.length) return;
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (
          !targetIds.has(node.id) ||
          node.type !== CanvasNodeType.Image ||
          !node.metadata?.storageKey ||
          node.metadata.retained
        )
          return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, retained: true } };
      });
      return changed ? next : prev;
    });
  }, []);

  const connectNodes = useCallback(
    (
      current: ConnectionHandle,
      targetNodeId: string,
      targetHandleId?: string | null,
    ) => {
      if (current.nodeId === targetNodeId) return;

      const connection = normalizeConnection(
        current.nodeId,
        targetNodeId,
        nodesRef.current,
        current.handleType,
        current.handleId,
        targetHandleId || undefined,
      );
      if (!connection) {
        message.warning("配置节点之间不能连接");
        return;
      }
      const { fromNodeId, toNodeId, fromHandleId, toHandleId } = connection;
      const exists = connectionsRef.current.some(
        (conn) =>
          conn.fromNodeId === fromNodeId &&
          conn.toNodeId === toNodeId &&
          (conn.fromHandleId || "") === (fromHandleId || "") &&
          (conn.toHandleId || "") === (toHandleId || ""),
      );
      if (!exists) {
        const source = nodesRef.current.find((node) => node.id === fromNodeId);
        const target = nodesRef.current.find((node) => node.id === toNodeId);
        if (
          target?.type === CanvasNodeType.Video &&
          isVideoTaskSnapshotLocked(target.metadata)
        ) {
          message.warning("该视频任务已提交或完成，不能再改变其引用连线；idle 占位仍可编辑");
          return;
        }
        const targetIsVideoGeneration = target?.type === CanvasNodeType.Video || (
          target?.type === CanvasNodeType.Config && target.metadata?.generationMode === "video"
        );
        const imageSlotContract = source?.type === CanvasNodeType.Image && target && targetIsVideoGeneration
          ? (() => {
              const capability = resolveStoryVideoCapabilityForNode(target, config, effectiveConfig);
              if (!capability) return undefined;
              const connectedInputs = buildNodeGenerationInputs(
                target.id,
                nodesRef.current,
                connectionsRef.current,
              );
              const connectedImages = connectedInputs.flatMap((input) => input.image ? [input.image] : []);
              return resolveVideoReferenceSlotContract({
                capability,
                operation: resolveStandaloneVideoOperation({
                  capability,
                  persistedOperation: target.metadata?.videoGenerationScope?.operation,
                  hasConnectedImage: connectedImages.length > 0 || source.type === CanvasNodeType.Image,
                }),
                references: connectedImages,
                videos: connectedInputs.flatMap((input) => input.video ? [input.video] : []),
              });
            })()
          : undefined;
        if (imageSlotContract?.state === "known" && !imageSlotContract.nextImageConnectionPurpose) {
          message.warning("当前模型的图片参考槽位已满或不支持该用途；连线仍会保留，但当前模型不会提交这张图片");
        }
        const referencePlan =
          source?.type === CanvasNodeType.Image &&
          target?.type === CanvasNodeType.Video &&
          target.metadata?.seedanceWorkflowRole === "placeholder"
            ? planSeedance2ReferenceConnection({
                connection,
                placeholderId: target.id,
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                visibleSlotCount: 0,
              })
            : null;
        if (referencePlan && !referencePlan.accepted) {
          message.warning("参考图槽位已满");
          return;
        }
        const nextConnection: CanvasConnection = {
          id: nanoid(),
          fromNodeId,
          toNodeId,
          fromHandleId,
          toHandleId,
        };
        if (
          source?.type === CanvasNodeType.Video &&
          (target?.type === CanvasNodeType.Video || target?.type === CanvasNodeType.Config)
        ) {
          const targetApiConfig = buildCustomerVideoApiConfig(target, config, effectiveConfig);
          if (targetApiConfig.route) {
            const targetCapability = resolveCanvasVideoModelCapability(
              { apiRelays: [...(targetApiConfig.providerList || [])] },
              targetApiConfig.model || "",
              targetApiConfig.route.mode === "local" ? targetApiConfig.route.provider : undefined,
            );
            const connectedInputs = buildNodeGenerationInputs(
              target.id,
              nodesRef.current,
              connectionsRef.current,
            );
            const videoSlotContract = resolveVideoReferenceSlotContract({
              capability: targetCapability,
              operation: target.metadata?.videoGenerationScope?.operation,
              references: connectedInputs.flatMap((input) => input.image ? [input.image] : []),
              videos: connectedInputs.flatMap((input) => input.video ? [input.video] : []),
            });
            const automaticVideoPurposes = videoSlotContract.state === "blocked" && !videoSlotContract.recoverable
              ? []
              : videoSlotContract.videoSlots;
            if (automaticVideoPurposes.length === 1) {
              nextConnection.videoUseAs = automaticVideoPurposes[0].useAs;
            }
          }
        }
        if (referencePlan?.accepted) {
          nextConnection.referenceSequence = referencePlan.referenceSequence;
        }
        if (imageSlotContract?.nextImageConnectionPurpose) {
          nextConnection.useAs = imageSlotContract.nextImageConnectionPurpose;
        }
        if (
          source?.type === CanvasNodeType.Image &&
          target?.type === CanvasNodeType.StoryDirector &&
          String(toHandleId || "").startsWith("story:")
        ) {
          retainCanvasImageNodesById([fromNodeId]);
        }
        setConnections((prev) => [
          ...prev,
          nextConnection,
        ]);
      }
      setContextMenu(null);
    },
    [config, effectiveConfig, message, retainCanvasImageNodesById],
  );

  const createConnectedNode = useCallback(
    (
      type:
        | CanvasNodeType.Image
        | CanvasNodeType.Text
        | CanvasNodeType.Config
        | CanvasNodeType.Video
        | CanvasNodeType.Audio,
      pending: PendingConnectionCreate,
    ) => {
      const sourceNode = nodesRef.current.find(
        (node) => node.id === pending.connection.nodeId,
      );
      const metadata =
        type === CanvasNodeType.Config
          ? {
              ...defaultCanvasProviderModelMetadata(effectiveConfig, "image"),
              size: effectiveConfig.size,
              quality: effectiveConfig.quality,
              count: getGenerationCount(
                effectiveConfig.canvasImageCount || effectiveConfig.count,
              ),
            }
          : undefined;
      const seedance2SourceImageRatio =
        sourceNode?.type === CanvasNodeType.Image
          ? (() => {
              const width = Number(
                sourceNode.metadata?.naturalWidth || sourceNode.width,
              );
              const height = Number(
                sourceNode.metadata?.naturalHeight || sourceNode.height,
              );
              return seedance2RatioFromNaturalSize(width, height, "9:16");
            })()
          : undefined;
      const videoModelMetadata = type === CanvasNodeType.Video
        ? defaultCanvasProviderModelMetadata(effectiveConfig, "video")
        : undefined;
      const newNode =
        type === CanvasNodeType.Video
          ? createSeedance2VideoPlaceholderNode(pending.position, {
              sourceImageNode:
                sourceNode?.type === CanvasNodeType.Image
                  ? sourceNode
                  : undefined,
              model: videoModelMetadata?.model,
              modelProviderId: videoModelMetadata?.modelProviderId,
              ratio:
                seedance2SourceImageRatio ||
                resolveSeedance2CreationRatio(effectiveConfig.size),
              duration: effectiveConfig.videoSeconds || "5",
            })
          : createCanvasNode(type, pending.position, metadata);
      const connection = normalizeConnection(
        pending.connection.nodeId,
        newNode.id,
        [...nodesRef.current, newNode],
        pending.connection.handleType,
        pending.connection.handleId,
      );
      if (!connection) {
        message.warning("配置节点之间不能连接");
        return;
      }
      setNodes((prev) => [...prev, newNode]);
      setConnections((prev) => [...prev, { id: nanoid(), ...connection }]);
      setSelectedNodeIds(new Set([newNode.id]));
      setSelectedConnectionId(null);
      if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio)
        setDialogNodeId(newNode.id);
      setPendingConnectionCreate(null);
      setConnecting(null);
    },
    [effectiveConfig, message, setConnecting],
  );

  const cancelPendingConnectionCreate = useCallback(() => {
    setPendingConnectionCreate(null);
    setConnecting(null);
  }, [setConnecting]);

  const getConnectionDropTarget = useCallback(
    (
      clientX: number,
      clientY: number,
      current: ConnectionHandle,
    ): ConnectionDropTarget => {
      const world = screenToCanvas(clientX, clientY);
      const scale = Math.max(canvasViewportRuntime.current.k, 0.05);
      const padding = CONNECTION_NODE_HIT_PADDING / scale;
      const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / scale;
      let isNearNode = false;
      let bestNodeId: string | null = null;
      let bestHandleId: string | null = null;
      let bestPriority = Number.POSITIVE_INFINITY;

      [...nodesRef.current]
        .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
        .reverse()
        .forEach((node) => {
          const anchor = getConnectionTargetAnchor(
            node,
            current,
            world.x,
            world.y,
          );
          const dx = world.x - anchor.x;
          const dy = world.y - anchor.y;
          const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius;
          const hitsInside =
            world.x >= node.position.x &&
            world.x <= node.position.x + node.width &&
            world.y >= node.position.y &&
            world.y <= node.position.y + node.height;
          const hitsExpanded =
            world.x >= node.position.x - padding &&
            world.x <= node.position.x + node.width + padding &&
            world.y >= node.position.y - padding &&
            world.y <= node.position.y + node.height + padding;

          if (!hitsHandle && !hitsInside && !hitsExpanded) return;
          isNearNode = true;
          if (
            node.id === current.nodeId ||
            !normalizeConnection(
              current.nodeId,
              node.id,
              nodesRef.current,
              current.handleType,
              current.handleId,
              anchor.handleId,
            )
          )
            return;

          const priority = hitsInside ? 0 : hitsHandle ? 1 : 2;
          if (priority < bestPriority) {
            bestNodeId = node.id;
            bestHandleId = anchor.handleId ?? null;
            bestPriority = priority;
          }
        });

      return { nodeId: bestNodeId, handleId: bestHandleId, isNearNode };
    },
    [screenToCanvas],
  );

  const displayedSeedance2ResultNodeIds = useMemo(
    () => seedance2DisplayResultNodeIds(nodes),
    [nodes],
  );
  const visibleNodes = useMemo(() => {
    const notHidden = (node: CanvasNodeData) =>
      selectedNodeIds.has(node.id) ||
      dialogNodeId === node.id ||
      ((node.metadata?.seedanceWorkflowRole !== "result" ||
        displayedSeedance2ResultNodeIds.has(node.id)) &&
      !isHiddenBatchChild(node, nodes, collapsingBatchIds));

    if (nodes.length <= 48) return nodes.filter(notHidden);

    const padding = 280;
    const rect = containerRef.current?.getBoundingClientRect();
    const width = rect?.width || size.width;
    const height = rect?.height || size.height;
    if (!width || !height) return nodes.filter(notHidden);
    const viewLeft = -viewport.x / viewport.k - padding;
    const viewTop = -viewport.y / viewport.k - padding;
    const viewRight = viewLeft + width / viewport.k + padding * 2;
    const viewBottom = viewTop + height / viewport.k + padding * 2;

    const culled = nodes.filter(
      (node) =>
        notHidden(node) &&
        node.position.x + node.width > viewLeft &&
        node.position.x < viewRight &&
        node.position.y + node.height > viewTop &&
        node.position.y < viewBottom,
    );
    return culled.length ? culled : nodes.filter(notHidden);
  }, [
    collapsingBatchIds,
    dialogNodeId,
    displayedSeedance2ResultNodeIds,
    nodes,
    selectedNodeIds,
    size.height,
    size.width,
    viewport.k,
    viewport.x,
    viewport.y,
  ]);

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const seedance2ResultVersionsByNodeId = useMemo(() => {
    const versionsByNodeId = new Map<string, CanvasNodeData[]>();
    displayedSeedance2ResultNodeIds.forEach((nodeId) => {
      versionsByNodeId.set(nodeId, seedance2ResultVersionsForNode(nodes, nodeId));
    });
    return versionsByNodeId;
  }, [displayedSeedance2ResultNodeIds, nodes]);
  const seedance2StoryDirectorSourceByNodeId = useMemo(() => {
    const map = new Map<string, Seedance2StoryDirectorSourceResolution>();
    nodes.forEach((node) => {
      if (node.type === CanvasNodeType.Seedance2Workflow) {
        map.set(
          node.id,
          resolveSeedance2StoryDirectorSource(node, nodes, connections),
        );
      }
    });
    return map;
  }, [nodes, connections]);
  const connectionTargetNode = connectionTargetNodeId
    ? nodeById.get(connectionTargetNodeId)
    : undefined;
  const infoNode = infoNodeId ? nodeById.get(infoNodeId) || null : null;
  const cropNode = cropNodeId ? nodeById.get(cropNodeId) || null : null;
  const layerEditNode = layerEditNodeId
    ? nodeById.get(layerEditNodeId) || null
    : null;
  const maskEditNode = maskEditNodeId
    ? nodeById.get(maskEditNodeId) || null
    : null;
  const seedance2FaceEditNode = seedance2FaceEditNodeId
    ? nodeById.get(seedance2FaceEditNodeId) || null
    : null;
  useEffect(() => {
    let cancelled = false;
    if (!seedance2FaceEditNode) {
      setSeedance2FaceEditDataUrl("");
      return;
    }

    const storageKey = seedance2FaceEditNode.metadata?.storageKey;
    const directSource = seedance2FaceEditFallbackSource(seedance2FaceEditNode.metadata);
    if (!storageKey && !directSource) {
      setSeedance2FaceEditDataUrl("");
      return;
    }

    void resolveImageUrl(storageKey, directSource).then((resolved) => {
      if (cancelled) return;
      setSeedance2FaceEditDataUrl(resolved || "");
    });

    return () => {
      cancelled = true;
    };
  }, [
    seedance2FaceEditNode?.id,
    seedance2FaceEditNode?.metadata?.backendRel,
    seedance2FaceEditNode?.metadata?.backendUrl,
    seedance2FaceEditNode?.metadata?.content,
    seedance2FaceEditNode?.metadata?.storageKey,
  ]);
  const splitNode = splitNodeId ? nodeById.get(splitNodeId) || null : null;
  const upscaleNode = upscaleNodeId
    ? nodeById.get(upscaleNodeId) || null
    : null;
  const superResolveNode = superResolveNodeId
    ? nodeById.get(superResolveNodeId) || null
    : null;
  const angleNode = angleNodeId ? nodeById.get(angleNodeId) || null : null;
  const previewNode = previewNodeId
    ? nodeById.get(previewNodeId) || null
    : null;
  const selectedImageNodes = useMemo(
    () =>
      nodes.filter(
        (node) =>
          selectedNodeIds.has(node.id) &&
          node.type === CanvasNodeType.Image &&
          Boolean(node.metadata?.content),
      ),
    [nodes, selectedNodeIds],
  );
  const replacePickerNode = replacePickerNodeId
    ? nodeById.get(replacePickerNodeId) || null
    : null;
  const replacePickerImages = useMemo(
    () =>
      nodes.filter(
        (node) =>
          node.type === CanvasNodeType.Image &&
          node.id !== replacePickerNodeId &&
          Boolean(node.metadata?.content),
      ),
    [nodes, replacePickerNodeId],
  );
  const compareNodes = useMemo(
    () =>
      compareNodeIds
        .map((id) => nodeById.get(id))
        .filter((node): node is CanvasNodeData =>
          Boolean(node?.metadata?.content),
        ),
    [compareNodeIds, nodeById],
  );
  const hasMultipleSelectedNodes = selectedNodeIds.size > 1;
  const activeNodeId = hasMultipleSelectedNodes
    ? null
    : hoveredNodeId ||
      (selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null);
  const batchChildCountById = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((node) => {
      if (node.metadata?.isBatchRoot)
        map.set(
          node.id,
          Math.max(
            node.metadata.count || 0,
            (node.metadata.batchChildIds?.length || 0) + 1,
          ),
        );
    });
    return map;
  }, [nodes]);
  const batchMotionById = useMemo(() => {
    const map = new Map<string, { x: number; y: number; index: number }>();
    nodes.forEach((node) => {
      const rootId = node.metadata?.batchRootId;
      if (!rootId) return;
      const root = nodeById.get(rootId);
      const index = root?.metadata?.batchChildIds?.indexOf(node.id) ?? 0;
      const stackX = root ? root.position.x + 34 + index * 14 : node.position.x;
      const stackY = root ? root.position.y + 14 + index * 8 : node.position.y;
      map.set(node.id, {
        x: stackX - node.position.x,
        y: stackY - node.position.y,
        index: Math.max(index, 0),
      });
    });
    return map;
  }, [nodeById, nodes]);
  const relatedHighlight = useMemo(() => {
    const nodeIds = new Set<string>();
    const connectionIds = new Set<string>();

    if (!activeNodeId) return { nodeIds, connectionIds };

    nodeIds.add(activeNodeId);
    connections.forEach((connection) => {
      if (
        connection.fromNodeId !== activeNodeId &&
        connection.toNodeId !== activeNodeId
      )
        return;
      connectionIds.add(connection.id);
      nodeIds.add(connection.fromNodeId);
      nodeIds.add(connection.toNodeId);
    });

    return { nodeIds, connectionIds };
  }, [activeNodeId, connections]);

  const configInputsById = useMemo(() => {
    const map = new Map<string, NodeGenerationInput[]>();
    nodes.forEach((node) => {
      if (node.type !== CanvasNodeType.Config) return;
      map.set(node.id, buildNodeGenerationInputs(node.id, nodes, connections));
    });
    return map;
  }, [connections, nodes]);
  const resourceContextNodeId = dialogNodeId || activeNodeId;
  const canvasResourceReferences = useMemo(
    () =>
      buildCanvasResourceReferences(nodes, connections, resourceContextNodeId),
    [connections, nodes, resourceContextNodeId],
  );
  const resourceReferenceByNodeId = useMemo(
    () =>
      new Map(
        canvasResourceReferences.map((reference) => [
          reference.nodeId,
          reference,
        ]),
      ),
    [canvasResourceReferences],
  );
  const mentionReferencesByNodeId = useMemo(() => {
    const map = new Map<
      string,
      ReturnType<typeof buildNodeMentionReferences>
    >();
    nodes.forEach((node) =>
      map.set(node.id, buildNodeMentionReferences(node, nodes, connections)),
    );
    return map;
  }, [connections, nodes]);
  const seedance2AspectRatioSourcesByNodeId = useMemo(
    () => buildSeedance2AspectRatioSources(nodes, connections),
    [connections, nodes],
  );
  const referenceVideosByNodeId = useMemo(() => {
    const map = new Map<string, ReferenceVideo[]>();
    nodes.forEach((node) => {
      if (node.type !== CanvasNodeType.Video) return;
      map.set(
        node.id,
        buildNodeGenerationInputs(node.id, nodes, connections).flatMap((input) =>
          input.video ? [input.video] : [],
        ),
      );
    });
    return map;
  }, [connections, nodes]);
  const seedance2ReferenceSlotsByNodeId = useMemo(() => {
    const slotsByNodeId = new Map<string, Seedance2ResolvedReferenceSlot[]>();
    nodes.forEach((node) => {
      if (
        node.type !== CanvasNodeType.Video ||
        node.metadata?.seedanceWorkflowRole !== "placeholder"
      ) {
        return;
      }
      slotsByNodeId.set(
        node.id,
        resolveCapabilityReferenceSlots(node, nodes, connections, config, effectiveConfig),
      );
    });
    return slotsByNodeId;
  }, [config, connections, effectiveConfig, nodes]);
  useEffect(() => {
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (
          node.type !== CanvasNodeType.Video ||
          node.metadata?.content ||
          node.metadata?.seedanceWorkflowRole !== "placeholder" ||
          node.metadata?.seedanceInheritSourceRatio === false ||
          node.metadata?.seedanceRatioTouched
        )
          return node;
        const sources = seedance2AspectRatioSourcesByNodeId.get(node.id);
        const previousSourceAspectRatio = node.metadata?.seedanceSourceAspectRatio;
        const sourceRatio = sources?.currentShotRatio || sources?.upstreamNaturalRatio;
        const hasExpandedManualFrame = node.metadata?.seedanceReferenceSlotsExpanded === true;
        const manualMinimumHeight = hasExpandedManualFrame
          ? Number(node.metadata?.seedanceManualMinHeight || 0)
          : 0;
        if (!sourceRatio) {
          if (previousSourceAspectRatio === undefined) return node;
          const defaultRatio = normalizeSeedance2AspectRatio(SEEDANCE2_CREATION_FALLBACK_RATIO);
          const defaultSize = seedance2PlaceholderSize(defaultRatio);
          changed = true;
          return {
            ...node,
            width: hasExpandedManualFrame
              ? Math.max(defaultSize.width, node.width)
              : defaultSize.width,
            height: Math.max(defaultSize.height, manualMinimumHeight),
            metadata: {
              ...node.metadata,
              seedanceSourceAspectRatio: undefined,
              seedanceRatio: node.metadata?.seedanceRatio === previousSourceAspectRatio ? defaultRatio : node.metadata?.seedanceRatio,
              size: node.metadata?.size === previousSourceAspectRatio ? defaultRatio : node.metadata?.size,
            },
          };
        }
        const ratio = normalizeSeedance2AspectRatio(sourceRatio);
        const size = seedance2PlaceholderSize(ratio);
        if (
          node.metadata?.seedanceRatio === ratio &&
          node.metadata?.seedanceSourceAspectRatio === ratio &&
          node.metadata?.size === ratio &&
          node.width >= size.width &&
          node.height >= size.height
        )
          return node;
        changed = true;
        return {
          ...node,
          width: hasExpandedManualFrame
            ? Math.max(size.width, node.width)
            : size.width,
          height: Math.max(size.height, manualMinimumHeight),
          metadata: {
            ...node.metadata,
            seedanceRatio: ratio,
            seedanceSourceAspectRatio: ratio,
            size: ratio,
          },
        };
      });
      return changed ? next : prev;
    });
  }, [seedance2AspectRatioSourcesByNodeId]);
  const createNode = useCallback(
    (type: CanvasNodeType, position?: Position) => {
      const targetPosition = position || getCanvasCenter();
      const configMetadata =
        type === CanvasNodeType.Config
          ? {
              ...defaultCanvasProviderModelMetadata(effectiveConfig, "image"),
              generationMode: "image" as const,
              imageOperation: "generate" as const,
              size: effectiveConfig.size,
              quality: effectiveConfig.quality,
              count: getGenerationCount(
                effectiveConfig.canvasImageCount || effectiveConfig.count,
              ),
            }
          : undefined;
      const videoModelMetadata = type === CanvasNodeType.Video
        ? defaultCanvasProviderModelMetadata(effectiveConfig, "video")
        : undefined;
      const newNode =
        type === CanvasNodeType.Video
          ? createSeedance2VideoPlaceholderNode(targetPosition, {
              model: videoModelMetadata?.model,
              modelProviderId: videoModelMetadata?.modelProviderId,
              ratio: resolveSeedance2CreationRatio(effectiveConfig.size),
              duration: effectiveConfig.videoSeconds || "5",
            })
          : createCanvasNode(type, targetPosition, configMetadata);

      setNodes((prev) => [...prev, newNode]);
      setSelectedNodeIds(new Set([newNode.id]));
      setSelectedConnectionId(null);
      if (type !== CanvasNodeType.Text && type !== CanvasNodeType.Audio)
        setDialogNodeId(newNode.id);
      focusNodeInView(newNode);
    },
    [effectiveConfig, focusNodeInView, getCanvasCenter],
  );


  const createSeedance2Workflow = useCallback(
    (position?: Position) => {
      const center = position || getCanvasCenter();
      const origin = { x: center.x - NODE_DEFAULT_SIZE[CanvasNodeType.Seedance2Workflow].width / 2, y: center.y - NODE_DEFAULT_SIZE[CanvasNodeType.Seedance2Workflow].height / 2 };
      const initialVideoSelection = resolveCanvasGenerationModelSelection(
        effectiveConfig,
        undefined,
        "video",
      ).selection;
      const built = buildSeedance2WorkflowNodes({
        origin,
        shotCount: 4,
        mode: "slice",
        model: initialVideoSelection?.model || "",
        ratio: resolveSeedance2CreationRatio(effectiveConfig.size),
        generateCount: 1,
        apiProvider: "local",
        apiEndpoint: LOCAL_SEEDANCE2_API_ENDPOINT,
      });
      let controller: CanvasNodeData = {
        ...built.nodes[0],
        metadata: {
          ...built.nodes[0].metadata,
          ...(initialVideoSelection
            ? {
                model: initialVideoSelection.model,
                seedanceModel: initialVideoSelection.model,
                modelProviderId: initialVideoSelection.providerId,
              }
            : {}),
          },
      };
      let nextNodes = [...nodesRef.current, controller];
      let nextConnections = connectionsRef.current;
      const storyDirectors = nodesRef.current.filter(
        (node) => node.type === CanvasNodeType.StoryDirector,
      );
      if (storyDirectors.length === 1) {
        const bound = bindSeedance2StoryDirectorSource({
          workflowNode: controller,
          storyDirector: storyDirectors[0],
          nodes: nextNodes,
          connections: nextConnections,
        });
        controller = bound.workflowNode;
        nextNodes = bound.nodes;
        nextConnections = bound.connections;
      }
      nodesRef.current = nextNodes;
      connectionsRef.current = nextConnections;
      setNodes(nextNodes);
      setConnections(nextConnections);
      persistCanvasSnapshot(nextNodes, nextConnections);
      setSelectedNodeIds(new Set([controller.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(controller.id);
      focusNodeInView(controller);
    },
    [effectiveConfig, focusNodeInView, getCanvasCenter, persistCanvasSnapshot],
  );

  const rebuildSeedance2Placeholders = useCallback(async (workflowNode: CanvasNodeData) => {
    const taskProjectSession = activeProjectSessionRef.current;
    const sessionActive = () => activeProjectSessionRef.current === taskProjectSession;
    let activeWorkflowNode = workflowNode;
    let sourceResolution = resolveSeedance2StoryDirectorSource(
      activeWorkflowNode,
      nodesRef.current,
      connectionsRef.current,
    );
    const shouldPersistCanonicalStoryBinding = Boolean(
      sourceResolution.source &&
      (
        sourceResolution.status === "suggested" ||
        (
          sourceResolution.status === "connected" &&
          activeWorkflowNode.metadata?.seedanceStoryDirectorNodeId !== sourceResolution.source.id
        )
      ),
    );
    if (shouldPersistCanonicalStoryBinding && sourceResolution.source) {
      const bound = bindSeedance2StoryDirectorSource({
        workflowNode: activeWorkflowNode,
        storyDirector: sourceResolution.source,
        nodes: nodesRef.current,
        connections: connectionsRef.current,
      });
      if (!sessionActive()) return;
      activeWorkflowNode = bound.workflowNode;
      nodesRef.current = bound.nodes;
      connectionsRef.current = bound.connections;
      setNodes(bound.nodes);
      setConnections(bound.connections);
      persistCanvasSnapshot(bound.nodes, bound.connections);
      await flushCanvasPersistence();
      if (!sessionActive()) return;
      sourceResolution = resolveSeedance2StoryDirectorSource(
        activeWorkflowNode,
        nodesRef.current,
        connectionsRef.current,
      );
    }
    const storyDirector = sourceResolution.source;
    if (!storyDirector) {
      message.error(
        sourceResolution.status === "ambiguous"
          ? "画布中有多个故事导演，请明确连接一个故事导演后再创建视频占位框"
          : "请先连接故事导演，视频占位提示词必须由故事导演与视频提示词模板共同生成",
      );
      return;
    }
    const meta = activeWorkflowNode.metadata || {};
    const storyShotCount = storyDirector.metadata?.storyShots?.length || 0;
    if (storyShotCount <= 0) {
      message.error("故事导演没有可用分镜，无法生成视频占位提示词");
      return;
    }
    const promptTextModelResolution = resolveSeedance2PromptTextProviderSelection(
      activeWorkflowNode,
      effectiveConfig,
    );
    if (!promptTextModelResolution.selection) {
      message.error(
        `Seedance2 文本模型“${promptTextModelResolution.legacyModel || "未选择"}”没有可唯一确定的 provider，请重新选择后再试`,
      );
      return;
    }
    const workflowVideoModelResolution = resolveCanvasGenerationModelSelection(
      effectiveConfig,
      activeWorkflowNode.metadata,
      "video",
    );
    const providerMigration: Partial<CanvasNodeMetadata> = {};
    if (
      (meta.seedanceModel || meta.model) &&
      !meta.modelProviderId &&
      workflowVideoModelResolution.selection
    ) {
      providerMigration.modelProviderId =
        workflowVideoModelResolution.selection.providerId;
    }
    if (
      meta.seedancePromptTextModel &&
      !meta.seedancePromptTextModelProviderId
    ) {
      providerMigration.seedancePromptTextModelProviderId =
        promptTextModelResolution.selection.providerId;
    }
    if (Object.keys(providerMigration).length) {
      activeWorkflowNode = {
        ...activeWorkflowNode,
        metadata: { ...activeWorkflowNode.metadata, ...providerMigration },
      };
      applyPersistedNodes((prev) =>
        prev.map((item) =>
          item.id === workflowNode.id
            ? activeWorkflowNode
            : item,
        ),
      );
    }
    const promptTextModel = promptTextModelResolution.selection.model;
    const textConfig = applyExplicitCanvasGenerationModel(
      buildGenerationConfig(effectiveConfig, activeWorkflowNode, "text"),
      "text",
      promptTextModelResolution.selection,
    );
    if (!isAiConfigReady(textConfig, promptTextModel)) {
      openConfigDialog(true);
      return;
    }

    setRunningNodeId(workflowNode.id);
    let fingerprintDigest = "";
    try {
      const configuredTemplate = typeof meta.seedancePromptTemplate === "string"
        ? meta.seedancePromptTemplate.trim()
        : "";
      const rewriteTemplate = configuredTemplate || defaultSeedancePromptTemplate();
      const rewriteInput = collectSeedance2StoryRewriteInput({
        storyDirector,
        nodes: nodesRef.current,
        connections: connectionsRef.current,
        template: rewriteTemplate,
      });
      const rewriteInputWithModel = {
        ...rewriteInput,
        rewriteModel: promptTextModel,
      };
      const workflowVideoApiConfig = buildCustomerVideoApiConfig(
        activeWorkflowNode,
        config,
        effectiveConfig,
      );
      const workflowVideoCapability = resolveStoryVideoCapabilityForNode(
        activeWorkflowNode,
        config,
        effectiveConfig,
      );
      const workflowVideoScope = activeWorkflowNode.metadata?.videoGenerationScope;
      const workflowOperationSelection = resolveWorkflowVideoOperationSelection({
        capability: workflowVideoCapability,
        providerId:
          workflowVideoApiConfig.route?.mode === "local"
            ? workflowVideoApiConfig.route.provider.id
            : "",
        model: workflowVideoApiConfig.model || "",
        savedScope: workflowVideoScope,
        savedCapabilityId: activeWorkflowNode.metadata?.videoGenerationCapabilityId,
        allowLegacyStoryAutoMigration: true,
        savedOperationMigrationSource: activeWorkflowNode.metadata?.videoGenerationOperationMigration?.source,
      });
      let workflowOperation = workflowOperationSelection.operation;
      if (!workflowOperation && workflowVideoCapability && !workflowOperationSelection.blockedReason) {
        // One-click story runs must not dead-end on a manual mode pick: resolve
        // the first operation that the model contract supports and the current
        // storyboard materials can satisfy, then pin it on the workflow node so
        // retries replay the exact same provider/model/operation.
        const storyShots = rewriteInputWithModel.shots;
        const shotsWithImage = storyShots.filter(
          (shot) => shot.sourceImage || shot.sourceImageNodeId,
        ).length;
        const autoSelection = autoWorkflowVideoOperationForMaterials({
          capability: workflowVideoCapability,
          materials: { totalShots: storyShots.length, shotsWithImage },
        });
        if (!autoSelection.operation) {
          throw new Error(autoSelection.blockedReason);
        }
        const autoProviderId =
          workflowVideoApiConfig.route?.mode === "local"
            ? workflowVideoApiConfig.route.provider.id
            : "";
        const autoModel = workflowVideoApiConfig.model || "";
        if (!autoProviderId || !autoModel) {
          throw new Error("视频 provider/model 未唯一确定，不能按模型能力打包分镜图");
        }
        workflowOperation = autoSelection.operation;
        const autoScope = {
          providerId: autoProviderId,
          model: autoModel,
          operation: workflowOperation,
        };
        const autoVideoConfig = buildGenerationConfig(effectiveConfig, activeWorkflowNode, "video");
        const autoSettings = readVideoGenerationSettings(
          autoVideoConfig,
          autoScope,
          workflowVideoCapability,
        );
        activeWorkflowNode = {
          ...activeWorkflowNode,
          metadata: {
            ...activeWorkflowNode.metadata,
            videoGenerationSettings: autoSettings,
            videoGenerationScope: autoScope,
            videoGenerationCapabilityId: workflowVideoCapability.generationParameters.id,
            videoWireFormat: snapshotVideoWireFormat(autoSettings, workflowVideoCapability),
          },
        };
      }
      assertStoryVideoPlaceholderCapability(
        workflowVideoCapability,
        workflowVideoCapability
          ? undefined
          : {
              intentPolicy: "blocked",
              referenceImagePolicy: { supported: false },
              autoCharacterDerivedViewPolicy: "disabled",
            },
      );
      // Build a pure in-memory preview first so required references are rejected
      // before the text rewrite request can spend a provider quota.
      const preview = buildStoryVideoBatchPreview(
        activeWorkflowNode,
        storyDirector,
        nodesRef.current,
        connectionsRef.current,
        workflowVideoCapability,
      );
      const parameterSnapshots = buildStoryVideoParameterSnapshots({
        workflowNode: activeWorkflowNode,
        nodes: preview.nodes,
        connections: preview.connections,
        draftNodeIds: preview.draftNodeIds,
        config,
        effectiveConfig,
      });
      fingerprintDigest = await createSeedance2PromptRewriteFingerprint({
        story: rewriteInputWithModel.story,
        template: rewriteInputWithModel.template,
        textRoute: {
          providerId: promptTextModelResolution.selection.providerId,
          model: rewriteInputWithModel.rewriteModel,
        },
        source: {
          storyDirectorNodeId: storyDirector.id,
        },
        videoRoute: {
          mode: workflowVideoApiConfig.route?.mode || "customer",
          providerId:
            workflowVideoApiConfig.route?.mode === "local"
              ? workflowVideoApiConfig.route.provider.id
              : undefined,
          baseUrl: workflowVideoApiConfig.baseUrl,
          model: workflowVideoApiConfig.model,
        },
        videoCapability: workflowVideoCapability || null,
        videoSettings: [...parameterSnapshots.entries()]
          .sort(([left], [right]) => left - right)
          .map(([shotIndex, snapshot]) => ({
            shotIndex,
            scope: snapshot.scope,
            settings: snapshot.settings,
            capabilityId: snapshot.capabilityId,
            wireFormat: snapshot.wireFormat,
          })),
        shots: rewriteInputWithModel.shots.map((shot) => ({
          shotId: shot.shotId,
          shotIndex: shot.shotIndex,
          sourceImageNodeId: shot.sourceImageNodeId,
          sourceImage: shot.sourceImage,
          currentPrompt: shot.currentPrompt,
          storyContext: shot.storyContext,
        })),
      });
      if (!sessionActive()) return;
      const currentWorkflowMetadata = nodesRef.current.find(
        (node) => node.id === workflowNode.id,
      )?.metadata;
      const initialCheckpoint = validSeedance2PromptRewriteCheckpoint(
        rewriteInputWithModel,
        fingerprintDigest,
        currentWorkflowMetadata?.seedancePromptRewriteCheckpoint,
      );
      const initialCompletedCount = initialCheckpoint?.completedShots.length || 0;
      const runningNodes = nodesRef.current.map((node) =>
        node.id === workflowNode.id
          ? {
              ...node,
              metadata: {
                ...node.metadata,
                status: "loading" as const,
                errorDetails: undefined,
                seedancePromptRewriteCheckpoint: initialCheckpoint,
                seedancePromptRewriteCompletedCount: initialCompletedCount,
                seedancePromptRewriteTotalCount: storyShotCount,
                seedancePromptRewriteErrorDetails: undefined,
              },
            }
          : node,
      );
      nodesRef.current = runningNodes;
      setNodes(runningNodes);
      persistCanvasSnapshot(runningNodes, connectionsRef.current);
      await flushCanvasPersistence();
      if (!sessionActive()) return;

      const rewrittenShots = await rewriteSeedance2BatchPrompts(
        rewriteInputWithModel,
        async (request) => {
          if (!sessionActive()) throw new Error("Seedance2 工作区已切换，已停止当前改写");
          rewriteStreamingLastPushRef.current = 0;
          setRewriteStreamingChars(0);
          const runRequest = async () => {
            const transportShots = await Promise.all(
              request.shots.map(async (shot) => ({
                ...shot,
                sourceImage: await resolveSeedance2ReferenceTransportValue(
                  shot.sourceImage,
                  imageToDataUrl,
                ),
              })),
            );
            if (!sessionActive()) throw new Error("Seedance2 工作区已切换，已停止当前改写");
            const content: ChatCompletionMessage["content"] = [
              { type: "text", text: request.contentText },
              ...transportShots.flatMap((shot) => {
                const imageParts: Array<
                  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
                > = [
                  {
                    type: "text",
                    text: `上游分镜图片 ${shot.shotId}（第 ${shot.shotIndex} 镜，${shot.title}）`,
                  },
                ];
                if (shot.sourceImage) {
                  imageParts.push({ type: "image_url", image_url: { url: shot.sourceImage } });
                }
                return imageParts;
              }),
            ];
            return (
              (await requestImageQuestion(
                { ...textConfig, textModel: request.model, model: request.model },
                [{ role: "user", content }],
                (text) => {
                  const now = Date.now();
                  if (now - rewriteStreamingLastPushRef.current >= 500) {
                    rewriteStreamingLastPushRef.current = now;
                    setRewriteStreamingChars(text.length);
                  }
                },
                { stream: true },
              )) || ""
            );
          };
          // 图片转换发生在 axios 超时之外；整段包一层硬超时，杜绝无声挂起。
          const textRoute = resolveApiRequestRoute(
            { ...textConfig, textModel: request.model, model: request.model },
            "text",
            request.model,
          );
          const rewriteTimeoutMs = (textRoute.timeoutMs || 120000) + 30000;
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
          try {
            return await Promise.race([
              runRequest(),
              new Promise<never>((_resolve, reject) => {
                timeoutHandle = setTimeout(() => {
                  reject(new Error(`改写请求超过 ${Math.round(rewriteTimeoutMs / 1000)} 秒未完成，请检查文本模型链路后重试`));
                }, rewriteTimeoutMs);
              }),
            ]);
          } finally {
            clearTimeout(timeoutHandle);
          }
        },
        {
          fingerprintDigest,
          initialCheckpoint,
          onCheckpoint: async (checkpoint) => {
            if (!sessionActive()) throw new Error("Seedance2 工作区已切换，已停止保存改写进度");
            const checkpointNodes = nodesRef.current.map((node) =>
              node.id === workflowNode.id
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      status: "loading" as const,
                      seedancePromptRewriteCheckpoint: checkpoint,
                      seedancePromptRewriteCompletedCount: checkpoint.completedShots.length,
                      seedancePromptRewriteTotalCount: storyShotCount,
                      seedancePromptRewriteErrorDetails: undefined,
                    },
                  }
                : node,
            );
            nodesRef.current = checkpointNodes;
            setNodes(checkpointNodes);
            persistCanvasSnapshot(checkpointNodes, connectionsRef.current);
            await flushCanvasPersistence();
            if (!sessionActive()) throw new Error("Seedance2 工作区已切换，已停止保存改写进度");
          },
        },
      );
      if (!sessionActive()) return;
      const latestWorkflowNode = nodesRef.current.find((node) => node.id === workflowNode.id);
      if (!latestWorkflowNode) throw new Error("Seedance2 工作流节点已不存在，未创建视频占位框");
      const rawBuilt = buildVersionedStoryDirectorSlicePlaceholders({
        workflowNode: latestWorkflowNode,
        storyDirector,
        nodes: nodesRef.current,
        connections: connectionsRef.current,
        capability: workflowVideoCapability,
        referencePolicy: workflowVideoCapability
          ? undefined
          : {
              intentPolicy: "blocked",
              referenceImagePolicy: { supported: false },
              autoCharacterDerivedViewPolicy: "disabled",
            },
        rewrittenShots,
        rewriteModel: promptTextModel,
        rewriteTemplate,
      });
      const stampSnapshot = (placeholder: CanvasNodeData): CanvasNodeData => {
        const shotIndex = Number(placeholder.metadata?.seedanceStoryShotIndex || placeholder.metadata?.seedanceShotIndex || 0);
        const snapshot = parameterSnapshots.get(shotIndex);
        if (!snapshot) throw new Error(`第 ${shotIndex || "?"} 镜缺少视频参数快照`);
        return {
          ...placeholder,
          metadata: {
            ...placeholder.metadata,
            videoLayoutRatio: normalizeSeedance2AspectRatio(
              placeholder.metadata?.seedanceRatio || placeholder.metadata?.size,
            ),
            modelProviderId: latestWorkflowNode.metadata?.modelProviderId || snapshot.scope.providerId,
            videoGenerationSettings: snapshot.settings,
            videoGenerationScope: snapshot.scope,
            videoGenerationCapabilityId: snapshot.capabilityId,
            videoWireFormat: snapshot.wireFormat,
          },
        };
      };
      const built = {
        ...rawBuilt,
        createdNodes: rawBuilt.createdNodes.map(stampSnapshot),
      };
      const committed = commitSeedance2PlaceholderSetAtomic({
        workflowNodeId: workflowNode.id,
        nodes: nodesRef.current,
        connections: connectionsRef.current,
        built,
        sessionActive: sessionActive(),
        workflowMetadataPatch: {
          seedanceShotCount: storyShotCount,
          status: "success",
          errorDetails: undefined,
          seedancePromptRewriteCheckpoint: undefined,
          seedancePromptRewriteCompletedCount: undefined,
          seedancePromptRewriteTotalCount: undefined,
          seedancePromptRewriteErrorDetails: undefined,
        },
      });
      if (committed.status === "stale-session") return;
      nodesRef.current = committed.nodes;
      connectionsRef.current = committed.connections;
      setNodes(committed.nodes);
      setConnections(committed.connections);
      persistCanvasSnapshot(committed.nodes, committed.connections);
      await flushCanvasPersistence();
      if (!sessionActive()) return;
      setSelectedNodeIds(new Set([workflowNode.id]));
      setSelectedConnectionId(null);
      message.success(`已创建分镜视频占位框 V${rawBuilt.setVersion}（${storyShotCount} 镜）`);
    } catch (error) {
      if (sessionActive()) {
        const errorDetails = safeSeedance2PromptRewriteError(error);
        const failedNodes = nodesRef.current.map((node) => {
          if (node.id !== workflowNode.id) return node;
          const checkpoint = node.metadata?.seedancePromptRewriteCheckpoint;
          const completedCount =
            checkpoint?.fingerprintDigest === fingerprintDigest
              ? checkpoint.completedShots.length
              : 0;
          return {
            ...node,
            metadata: {
              ...node.metadata,
              status: "error" as const,
              errorDetails,
              seedancePromptRewriteCompletedCount: completedCount,
              seedancePromptRewriteTotalCount: storyShotCount,
              seedancePromptRewriteErrorDetails: errorDetails,
            },
          };
        });
        nodesRef.current = failedNodes;
        setNodes(failedNodes);
        persistCanvasSnapshot(failedNodes, connectionsRef.current);
        await flushCanvasPersistence();
        if (sessionActive()) message.error(errorDetails);
      }
    } finally {
      setRunningNodeId((current) => current === workflowNode.id ? null : current);
      setRewriteStreamingChars(0);
    }
    return;
  }, [applyPersistedNodes, config, effectiveConfig, message, openConfigDialog, persistCanvasSnapshot]);

  const deleteNodes = useCallback(
    (ids: Set<string>) => {
      if (!ids.size) return false;
      const allIds = expandCanvasNodeDeletionIds(nodesRef.current, ids);
      const wouldDetachLockedVideoReference = connectionsRef.current.some(
        (connection) => {
          if (!allIds.has(connection.fromNodeId) || allIds.has(connection.toNodeId)) {
            return false;
          }
          const target = nodesRef.current.find(
            (node) => node.id === connection.toNodeId,
          );
          return Boolean(
            target?.type === CanvasNodeType.Video &&
              isVideoTaskSnapshotLocked(target.metadata),
          );
        },
      );
      if (wouldDetachLockedVideoReference) {
        message.warning("所选节点仍被已提交或完成的视频任务引用，不能删除；先保留该任务快照");
        return false;
      }
      setNodes((prev) => {
        const next = prev.filter((node) => !allIds.has(node.id));
        return next.map((node) => {
          const childIds = node.metadata?.batchChildIds?.filter(
            (childId) => !allIds.has(childId),
          );
          if (
            !node.metadata?.isBatchRoot ||
            childIds?.length === node.metadata.batchChildIds?.length
          )
            return node;
          const primaryImageId = childIds?.includes(
            node.metadata.primaryImageId || "",
          )
            ? node.metadata.primaryImageId
            : childIds?.[0];
          const primaryNode = next.find((item) => item.id === primaryImageId);
          return {
            ...node,
            metadata: {
              ...node.metadata,
              batchChildIds: childIds,
              primaryImageId,
              content: primaryNode?.metadata?.content || node.metadata.content,
              naturalWidth:
                primaryNode?.metadata?.naturalWidth ||
                node.metadata.naturalWidth,
              naturalHeight:
                primaryNode?.metadata?.naturalHeight ||
                node.metadata.naturalHeight,
            },
          };
        });
      });
      setConnections((prev) =>
        prev.filter(
          (conn) => !allIds.has(conn.fromNodeId) && !allIds.has(conn.toNodeId),
        ),
      );
      setSelectedNodeIds(new Set());
      setSelectedConnectionId(null);
      setHoveredNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setToolbarNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setDialogNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setEditingNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setInfoNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setCropNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setMaskEditNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setAngleNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setPreviewNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setRunningNodeId((current) =>
        current && allIds.has(current) ? null : current,
      );
      setContextMenu((current) =>
        current?.type === "node" && allIds.has(current.nodeId) ? null : current,
      );
      cleanupCanvasFiles({
        projectId,
        nodes: nodesRef.current.filter((node) => !allIds.has(node.id)),
        chatSessions,
      });
      return true;
    },
    [chatSessions, cleanupCanvasFiles, message, projectId],
  );

  const deleteConnection = useCallback((connectionId: string) => {
    const connection = connectionsRef.current.find((item) => item.id === connectionId);
    const target = connection
      ? nodesRef.current.find((node) => node.id === connection.toNodeId)
      : undefined;
    if (
      target?.type === CanvasNodeType.Video &&
      isVideoTaskSnapshotLocked(target.metadata)
    ) {
      message.warning("该视频任务已提交或完成，不能删除其引用连线；idle 占位仍可编辑");
      return;
    }
    setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
    setSelectedConnectionId((current) =>
      current === connectionId ? null : current,
    );
    setContextMenu((current) =>
      current?.type === "connection" && current.connectionId === connectionId
        ? null
        : current,
    );
  }, [message]);

  const updateConnectionUseAs = useCallback(
    (
      updates: readonly {
        connectionId: string;
        useAs: Seedance2ReferenceSlotUseAs;
      }[],
    ) => {
      if (!updates.length) return;
      const lockedTargetIds = new Set(
        nodesRef.current
          .filter(
            (node) =>
              node.type === CanvasNodeType.Video &&
              isVideoTaskSnapshotLocked(node.metadata),
          )
          .map((node) => node.id),
      );
      const useAsByConnectionId = new Map(
        updates.map((update) => [update.connectionId, update.useAs]),
      );
      setConnections((prev) => {
        let changed = false;
        const next = prev.map((connection) => {
          const useAs = useAsByConnectionId.get(connection.id);
          if (!useAs || connection.useAs === useAs) return connection;
          if (lockedTargetIds.has(connection.toNodeId)) return connection;
          changed = true;
          return { ...connection, useAs, referenceUseAsExplicit: true };
        });
        return changed ? next : prev;
      });
      if (
        connectionsRef.current.some(
          (connection) =>
            useAsByConnectionId.has(connection.id) &&
            lockedTargetIds.has(connection.toNodeId),
        )
      ) {
        message.warning("该视频任务已提交或完成，不能改变其引用用途；idle 占位仍可编辑");
      }
    },
    [message],
  );

  const requestDeleteNodes = useCallback(
    (ids: Set<string>) => {
      const allIds = expandCanvasNodeDeletionIds(nodesRef.current, ids);
      const nodesToDelete = nodesRef.current.filter((node) => allIds.has(node.id));
      if (!nodesToDelete.length) return false;
      if (
        nodesToDelete.length > 1 ||
        nodesToDelete.some(isCanvasNodeGenerating)
      ) {
        setPendingDeleteNodeIds(nodesToDelete.map((node) => node.id));
        return true;
      }
      if (deleteNodes(new Set(nodesToDelete.map((node) => node.id))))
        message.success("节点已删除，可按 Ctrl/Cmd+Z 撤销");
      return true;
    },
    [deleteNodes, message],
  );

  const confirmDeleteNodes = useCallback(() => {
    const nodesToDelete = nodesRef.current.filter((node) =>
      pendingDeleteNodeIds.includes(node.id),
    );
    setPendingDeleteNodeIds([]);
    if (!nodesToDelete.length) return;
    if (deleteNodes(new Set(nodesToDelete.map((node) => node.id))))
      message.success(`${nodesToDelete.length} 个节点已删除，可按 Ctrl/Cmd+Z 撤销`);
  }, [deleteNodes, message, pendingDeleteNodeIds]);

  const requestDeleteActiveCanvasSelection = useCallback(() => {
    const selectedIds = selectedNodeIdsRef.current;
    if (selectedIds.size) return requestDeleteNodes(new Set(selectedIds));

    const activeNodeId = dialogNodeIdRef.current || toolbarNodeIdRef.current;
    if (
      activeNodeId &&
      nodesRef.current.some((node) => node.id === activeNodeId)
    )
      return requestDeleteNodes(new Set([activeNodeId]));

    const connectionId = selectedConnectionIdRef.current;
    if (connectionId) {
      deleteConnection(connectionId);
      return true;
    }

    return false;
  }, [deleteConnection, requestDeleteNodes]);

  const deselectCanvas = useCallback(() => {
    cancelPendingConnectionCreate();
    setSelectedNodeIds(new Set());
    setSelectedConnectionId(null);
    setContextMenu(null);
    setSelectionBox(null);
    setHoveredNodeId(null);
    setToolbarNodeId(null);
    setDialogNodeId(null);
    setEditingNodeId(null);
  }, [cancelPendingConnectionCreate]);

  const clearCanvas = useCallback(() => {
    if (clearConfirmProjectId !== projectId) {
      setClearConfirmProjectId(null);
      return;
    }
    setNodes([]);
    setConnections([]);
    setInfoNodeId(null);
    setCropNodeId(null);
    setMaskEditNodeId(null);
    setAngleNodeId(null);
    setPreviewNodeId(null);
    setRunningNodeId(null);
    deselectCanvas();
    setClearConfirmProjectId(null);
    cleanupCanvasFiles({ projectId, nodes: [], chatSessions: [] });
  }, [cleanupCanvasFiles, clearConfirmProjectId, deselectCanvas, projectId]);

  const duplicateNode = useCallback((nodeId: string) => {
    const source = nodesRef.current.find((node) => node.id === nodeId);
    if (!source) return;

    const id = `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: CanvasNodeData = {
      ...source,
      id,
      title: `${source.title} Copy`,
      position: { x: source.position.x + 36, y: source.position.y + 36 },
    };

    setNodes((prev) => [...prev, next]);
    setSelectedNodeIds(new Set([id]));
    setSelectedConnectionId(null);
    setDialogNodeId(id);
  }, []);

  const copySelectedNodes = useCallback(() => {
    const selectedIds = selectedNodeIdsRef.current;
    if (!selectedIds.size) return;

    const copiedNodes = nodesRef.current
      .filter((node) => selectedIds.has(node.id))
      .map((node) => ({
        ...node,
        position: { ...node.position },
        metadata: node.metadata ? { ...node.metadata } : undefined,
      }));

    if (!copiedNodes.length) return;

    clipboardRef.current = {
      nodes: copiedNodes,
      connections: connectionsRef.current
        .filter(
          (connection) =>
            selectedIds.has(connection.fromNodeId) &&
            selectedIds.has(connection.toNodeId),
        )
        .map((connection) => ({ ...connection })),
    };
  }, []);

  const pasteCopiedNodes = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard?.nodes.length) return false;

    const center = getCanvasCenter();
    const bounds = clipboard.nodes.reduce(
      (acc, node) => ({
        left: Math.min(acc.left, node.position.x),
        top: Math.min(acc.top, node.position.y),
        right: Math.max(acc.right, node.position.x + node.width),
        bottom: Math.max(acc.bottom, node.position.y + node.height),
      }),
      { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
    const dx = center.x - (bounds.left + bounds.right) / 2;
    const dy = center.y - (bounds.top + bounds.bottom) / 2;
    const idMap = new Map<string, string>();
    const nextNodes = clipboard.nodes.map((node, index) => {
      const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
        position: {
          x: node.position.x + dx,
          y: node.position.y + dy,
        },
        metadata: node.metadata ? { ...node.metadata } : undefined,
      };
    });

    const nextConnections = clipboard.connections.flatMap(
      (connection, index) => {
        const fromNodeId = idMap.get(connection.fromNodeId);
        const toNodeId = idMap.get(connection.toNodeId);
        if (!fromNodeId || !toNodeId) return [];
        return [
          {
            ...connection,
            id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
            fromNodeId,
            toNodeId,
          },
        ];
      },
    );

    setNodes((prev) => [...prev, ...nextNodes]);
    setConnections((prev) => [...prev, ...nextConnections]);
    setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
    setSelectedConnectionId(null);
    setContextMenu(null);
    setDialogNodeId(nextNodes[0]?.id || null);
    return true;
  }, [getCanvasCenter]);

  const duplicateSelectedNodes = useCallback(() => {
    const selectedIds = selectedNodeIdsRef.current;
    if (!selectedIds.size) return false;

    const copiedNodes = nodesRef.current
      .filter((node) => selectedIds.has(node.id))
      .map((node) => ({
        ...node,
        position: { ...node.position },
        metadata: node.metadata ? { ...node.metadata } : undefined,
      }));
    if (!copiedNodes.length) return false;

    const idMap = new Map<string, string>();
    const nextNodes = copiedNodes.map((node, index) => {
      const id = `${node.type}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
        position: { x: node.position.x + 36, y: node.position.y + 36 },
      };
    });

    const nextConnections = connectionsRef.current.flatMap(
      (connection, index) => {
        const fromNodeId = idMap.get(connection.fromNodeId);
        const toNodeId = idMap.get(connection.toNodeId);
        if (!fromNodeId || !toNodeId) return [];
        return [
          {
            ...connection,
            id: `conn-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
            fromNodeId,
            toNodeId,
          },
        ];
      },
    );

    setNodes((prev) => [...prev, ...nextNodes]);
    setConnections((prev) => [...prev, ...nextConnections]);
    setSelectedNodeIds(new Set(nextNodes.map((node) => node.id)));
    setSelectedConnectionId(null);
    setContextMenu(null);
    setDialogNodeId(nextNodes.length === 1 ? nextNodes[0].id : null);
    return true;
  }, []);

  const resetViewport = useCallback(() => {
    setViewport({ x: size.width / 2, y: size.height / 2, k: 1 });
    setContextMenu(null);
  }, [size.height, size.width]);

  const setZoomScale = useCallback(
    (scale: number) => {
      const nextScale = Math.min(Math.max(scale, 0.05), 5);
      const prev = canvasViewportRuntime.current;
      const k = Math.max(prev.k, 0.05);
      setViewport({
        x: size.width / 2 - ((size.width / 2 - prev.x) / k) * nextScale,
        y: size.height / 2 - ((size.height / 2 - prev.y) / k) * nextScale,
        k: nextScale,
      });
      if (contextMenuRef.current) setContextMenu(null);
    },
    [size.height, size.width],
  );

  const applyHistory = useCallback((entry: CanvasHistoryEntry) => {
    if (historyCommitTimerRef.current) {
      clearTimeout(historyCommitTimerRef.current);
      historyCommitTimerRef.current = null;
    }
    applyingHistoryRef.current = true;
    setNodes(entry.nodes);
    setConnections(entry.connections);
    setChatSessions(entry.chatSessions);
    setActiveChatId(entry.activeChatId);
    setBackgroundMode(entry.backgroundMode);
    setShowImageInfo(entry.showImageInfo);
    setSelectedNodeIds(new Set());
    setSelectedConnectionId(null);
    setContextMenu(null);
    setTimeout(() => {
      lastHistoryRef.current = entry;
      applyingHistoryRef.current = false;
      setHistoryState({
        canUndo: historyRef.current.past.length > 0,
        canRedo: historyRef.current.future.length > 0,
      });
    });
  }, []);

  const undoCanvas = useCallback(() => {
    const previous = historyRef.current.past.pop();
    const current = lastHistoryRef.current;
    if (!previous || !current) return;
    historyRef.current.future.push(current);
    applyHistory(previous);
  }, [applyHistory]);

  const redoCanvas = useCallback(() => {
    const next = historyRef.current.future.pop();
    const current = lastHistoryRef.current;
    if (!next || !current) return;
    historyRef.current.past.push(current);
    applyHistory(next);
  }, [applyHistory]);

  const createAndOpenProject = useCallback(() => {
    const id = createProject(
      `无限画布 ${useCanvasStore.getState().projects.length + 1}`,
    );
    router.push(`/canvas/workspace?id=${encodeURIComponent(id)}`);
  }, [createProject, router]);

  const deleteCurrentProject = useCallback(() => {
    if (!deleteProjectConfirmId || deleteProjectConfirmId !== projectId) {
      setDeleteProjectConfirmId(null);
      return;
    }
    deleteProjects([deleteProjectConfirmId]);
    setDeleteProjectConfirmId(null);
    cleanupAssetImages();
    router.push("/canvas/home");
  }, [cleanupAssetImages, deleteProjectConfirmId, deleteProjects, projectId, router]);

  const handleCanvasMouseDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      setContextMenu(null);
      if (pendingConnectionCreateRef.current) cancelPendingConnectionCreate();
      if (event.button !== 0) return;

      if (!event.ctrlKey && !event.metaKey) {
        setSelectionBox(null);
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        return;
      }

      const world = screenToCanvas(event.clientX, event.clientY);
      const nextSelectionBox = {
        startWorldX: world.x,
        startWorldY: world.y,
        currentWorldX: world.x,
        currentWorldY: world.y,
        additive: event.shiftKey,
        initialSelectedNodeIds: event.shiftKey
          ? Array.from(selectedNodeIdsRef.current)
          : [],
      };
      selectionBoxRef.current = nextSelectionBox;
      setSelectionBox(nextSelectionBox);
      if (!event.shiftKey) {
        setSelectedNodeIds(new Set());
      }

      setSelectedConnectionId(null);
    },
    [cancelPendingConnectionCreate, screenToCanvas],
  );

  const handleNodeMouseDown = useCallback(
    (event: ReactMouseEvent, nodeId: string) => {
      event.stopPropagation();
      if (contextMenuRef.current) setContextMenu(null);
      if (hoveredNodeIdRef.current && hoveredNodeIdRef.current !== nodeId) {
        setHoveredNodeId(null);
      }
      if (toolbarNodeIdRef.current) setToolbarNodeId(null);
      if (selectedConnectionIdRef.current) setSelectedConnectionId(null);

      const currentSelected = selectedNodeIdsRef.current;
      const currentNodes = nodesRef.current;
      const nextSelected = new Set(currentSelected);

      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        if (nextSelected.has(nodeId)) {
          nextSelected.delete(nodeId);
        } else {
          nextSelected.add(nodeId);
        }
      } else if (!nextSelected.has(nodeId)) {
        nextSelected.clear();
        nextSelected.add(nodeId);
      }

      if (!sameIdSet(currentSelected, nextSelected)) {
        setSelectedNodeIds(nextSelected);
      }
      const target =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null;
      const skipDrag = Boolean(
        target?.closest(
          "input,textarea,select,button,a,[contenteditable='true'],[data-canvas-no-drag]",
        ),
      );
      if (skipDrag) return;
      const dragIds = new Set(nextSelected);
      currentNodes.forEach((node) => {
        if (
          nextSelected.has(node.id) &&
          node.type === CanvasNodeType.Image &&
          node.metadata?.isBatchRoot
        ) {
          node.metadata?.batchChildIds?.forEach((childId) =>
            dragIds.add(childId),
          );
        }
      });
      dragRef.current = {
        isDraggingNode: true,
        hasMoved: false,
        startX: event.clientX,
        startY: event.clientY,
        initialSelectedNodes: currentNodes
          .filter((node) => dragIds.has(node.id))
          .map((node) => ({
            id: node.id,
            x: node.position.x,
            y: node.position.y,
          })),
      };
      historyPausedRef.current = true;
      nodeDraggingRef.current = true;
    },
    [],
  );

  const finishNodeDrag = useCallback((clientX?: number, clientY?: number) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!dragRef.current.isDraggingNode) return;

    const wasClick =
      !dragRef.current.hasMoved &&
      dragRef.current.initialSelectedNodes.length === 1;
    const clickedNodeId = dragRef.current.initialSelectedNodes[0]?.id;
    const currentK = Math.max(canvasViewportRuntime.current.k, 0.05);
    const dx =
      clientX == null ? 0 : (clientX - dragRef.current.startX) / currentK;
    const dy =
      clientY == null ? 0 : (clientY - dragRef.current.startY) / currentK;
    const initialPositions = dragRef.current.initialSelectedNodes;

    historyPausedRef.current = false;
    nodeDraggingRef.current = false;
    if (dragRef.current.hasMoved && clientX != null && clientY != null) {
      setNodes((prev) =>
        prev.map((node) => {
          const initial = initialPositions.find((item) => item.id === node.id);
          if (!initial) return node;
          return {
            ...node,
            position: { x: initial.x + dx, y: initial.y + dy },
          };
        }),
      );
    }

    dragRef.current.isDraggingNode = false;
    dragRef.current.hasMoved = false;
    dragRef.current.initialSelectedNodes = [];
    if (wasClick && clickedNodeId) {
      const clickedNode = nodesRef.current.find(
        (node) => node.id === clickedNodeId,
      );
      if (clickedNode?.type === CanvasNodeType.Text) {
        setDialogNodeId((current) =>
          current === clickedNodeId ? current : null,
        );
      } else if (dialogNodeIdRef.current !== clickedNodeId) {
        setDialogNodeId(clickedNodeId);
      }
    }
  }, []);

  const handleGlobalMouseMove = useCallback(
    (event: MouseEvent) => {
      if (dragRef.current.isDraggingNode) {
        const currentK = Math.max(canvasViewportRuntime.current.k, 0.05);
        const dx = (event.clientX - dragRef.current.startX) / currentK;
        const dy = (event.clientY - dragRef.current.startY) / currentK;
        const initialPositions = dragRef.current.initialSelectedNodes;
        if (
          Math.abs(event.clientX - dragRef.current.startX) > 3 ||
          Math.abs(event.clientY - dragRef.current.startY) > 3
        ) {
          dragRef.current.hasMoved = true;
        }

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          setNodes((prev) =>
            prev.map((node) => {
              const initial = initialPositions.find(
                (item) => item.id === node.id,
              );
              return initial
                ? {
                    ...node,
                    position: { x: initial.x + dx, y: initial.y + dy },
                  }
                : node;
            }),
          );
          rafRef.current = null;
        });
        return;
      }

      if (connectingParamsRef.current && !pendingConnectionCreateRef.current) {
        const dropTarget = getConnectionDropTarget(
          event.clientX,
          event.clientY,
          connectingParamsRef.current,
        );
        connectionTargetNodeIdRef.current = dropTarget.nodeId;
        connectionTargetHandleIdRef.current = dropTarget.handleId || null;
        setConnectionTargetNodeId(dropTarget.nodeId);
        setConnectionTargetHandleId(dropTarget.handleId || null);
        setMouseWorld(screenToCanvas(event.clientX, event.clientY));
      }
    },
    [finishNodeDrag, getConnectionDropTarget, screenToCanvas],
  );

  const handleGlobalPointerMove = useCallback(
    (event: PointerEvent) => {
      const currentSelection = selectionBoxRef.current;
      if (!currentSelection) return;

      if (event.buttons === 0) {
        selectionBoxRef.current = null;
        setSelectionBox(null);
        return;
      }

      const world = screenToCanvas(event.clientX, event.clientY);
      const rectX = Math.min(currentSelection.startWorldX, world.x);
      const rectY = Math.min(currentSelection.startWorldY, world.y);
      const rectW = Math.abs(world.x - currentSelection.startWorldX);
      const rectH = Math.abs(world.y - currentSelection.startWorldY);
      const nextSelected = new Set<string>(
        currentSelection.additive
          ? currentSelection.initialSelectedNodeIds
          : [],
      );

      nodesRef.current
        .filter((node) => !isHiddenBatchChild(node, nodesRef.current))
        .forEach((node) => {
          const intersects =
            rectX < node.position.x + node.width &&
            rectX + rectW > node.position.x &&
            rectY < node.position.y + node.height &&
            rectY + rectH > node.position.y;

          if (intersects) nextSelected.add(node.id);
        });

      const nextSelectionBox = {
        ...currentSelection,
        currentWorldX: world.x,
        currentWorldY: world.y,
      };
      selectionBoxRef.current = nextSelectionBox;
      setSelectionBox(nextSelectionBox);
      setSelectedNodeIds(nextSelected);
    },
    [screenToCanvas],
  );

  const handleGlobalMouseUp = useCallback(
    (event: MouseEvent) => {
      finishNodeDrag(event.clientX, event.clientY);

      selectionBoxRef.current = null;
      setSelectionBox(null);

      if (pendingConnectionCreateRef.current) return;

      const currentConnection = connectingParamsRef.current;
      if (currentConnection) {
        const dropTarget = getConnectionDropTarget(
          event.clientX,
          event.clientY,
          currentConnection,
        );
        if (dropTarget.nodeId) {
          connectNodes(
            currentConnection,
            dropTarget.nodeId,
            dropTarget.handleId,
          );
          setConnecting(null);
        } else if (dropTarget.isNearNode) {
          setConnecting(null);
        } else {
          setMouseWorld(screenToCanvas(event.clientX, event.clientY));
          setPendingConnectionCreate({
            connection: currentConnection,
            position: screenToCanvas(event.clientX, event.clientY),
          });
        }
      }
    },
    [
      connectNodes,
      finishNodeDrag,
      getConnectionDropTarget,
      screenToCanvas,
      setConnecting,
    ],
  );

  useEffect(() => {
    const handlePointerUp = (event: PointerEvent) =>
      finishNodeDrag(event.clientX, event.clientY);
    const cancelNodeDrag = () => finishNodeDrag();
    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", cancelNodeDrag);
    window.addEventListener("blur", cancelNodeDrag);
    window.addEventListener("pointermove", handleGlobalPointerMove);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", cancelNodeDrag);
      window.removeEventListener("blur", cancelNodeDrag);
      window.removeEventListener("pointermove", handleGlobalPointerMove);
    };
  }, [
    finishNodeDrag,
    handleGlobalMouseMove,
    handleGlobalMouseUp,
    handleGlobalPointerMove,
  ]);

  const createImageFileNode = useCallback(
    async (file: File, position: Position) => {
      const image = await uploadImage(file, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
      const size = imageNodeSize(image.width, image.height);
      const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newNode: CanvasNodeData = {
        id,
        type: CanvasNodeType.Image,
        title: file.name,
        position: {
          x: position.x - size.width / 2,
          y: position.y - size.height / 2,
        },
        width: size.width,
        height: size.height,
        metadata: {
          ...imageMetadata(image),
          imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
          retained: true,
        },
      };

      setNodes((prev) => [...prev, newNode]);
      setSelectedNodeIds(new Set([id]));
      setSelectedConnectionId(null);
      setDialogNodeId(id);
      return id;
    },
    [],
  );


  const createImageNodeFromVideoFrame = useCallback(
    async (
      sourceNode: CanvasNodeData,
      frame: { dataUrl: string; width: number; height: number; currentTime: number },
    ) => {
      try {
        const uploaded = await uploadImage(frame.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
        const naturalWidth = frame.width || uploaded.width || sourceNode.width;
        const naturalHeight = frame.height || uploaded.height || sourceNode.height;
        const aspectRatio = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : 1;
        const frameHeight = Math.max(1, Math.round(sourceNode.height));
        const frameWidth = Math.max(1, Math.round(frameHeight * aspectRatio));
        const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: CanvasNodeData = {
          id,
          type: CanvasNodeType.Image,
          title: `\u9009\u5e27 ${formatVideoFrameTime(frame.currentTime)}`,
          position: {
            x: sourceNode.position.x + sourceNode.width + 48,
            y: sourceNode.position.y,
          },
          width: frameWidth,
          height: frameHeight,
          metadata: {
            ...imageMetadata(uploaded),
            imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
            source: "seedance2-frame-extraction",
            prompt: sourceNode.metadata?.prompt,
            naturalWidth,
            naturalHeight,
            seedanceWorkflowRole: "extracted-frame",
            seedanceSourceResultNodeId: sourceNode.id,
            seedanceFrameTimeSeconds: frame.currentTime,
            seedanceFrameIndex: Math.max(0, Math.round((frame.currentTime || 0) * 24)),
            freeResize: false,
            isBatchRoot: undefined,
            batchRootId: undefined,
            batchChildIds: undefined,
            batchUsesReferenceImages: undefined,
            primaryImageId: undefined,
            imageBatchExpanded: undefined,
          },
        };

        setNodes((prev) => [...prev, newNode]);
        setConnections((prev) => [
          ...prev,
          { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: id },
        ]);
        setSelectedNodeIds(new Set([id]));
        setSelectedConnectionId(null);
        setDialogNodeId(null);
        message.success("\u5df2\u9009\u53d6\u5f53\u524d\u5e27");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "\u9009\u5e27\u5931\u8d25");
      }
    },
    [message],
  );

  const createVideoFileNode = useCallback(
    async (file: File, position: Position) => {
      const video = await uploadMediaFile(file, "video");
      if (!video.width || !video.height) {
        throw new Error("视频元数据读取失败：未取得有效尺寸");
      }
      const size = fitNodeSize(
        video.width,
        video.height,
        VIDEO_NODE_MAX_WIDTH,
        VIDEO_NODE_MAX_HEIGHT,
      );
      const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setNodes((prev) => [
        ...prev,
        {
          id,
          type: CanvasNodeType.Video,
          title: file.name,
          position: {
            x: position.x - size.width / 2,
            y: position.y - size.height / 2,
          },
          width: size.width,
          height: size.height,
          metadata: videoMetadata(video),
        },
      ]);
      setSelectedNodeIds(new Set([id]));
      setSelectedConnectionId(null);
      setDialogNodeId(id);
      return id;
    },
    [],
  );

  const createAudioFileNode = useCallback(
    async (file: File, position: Position) => {
      const audio = await uploadMediaFile(file, "audio");
      const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
      const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setNodes((prev) => [
        ...prev,
        {
          id,
          type: CanvasNodeType.Audio,
          title: file.name,
          position: {
            x: position.x - spec.width / 2,
            y: position.y - spec.height / 2,
          },
          width: spec.width,
          height: spec.height,
          metadata: audioMetadata(audio),
        },
      ]);
      setSelectedNodeIds(new Set([id]));
      setSelectedConnectionId(null);
      setDialogNodeId(null);
      return id;
    },
    [],
  );

  const createCanvasFileNode = useCallback(
    (file: File, position: Position) => {
      if (isAudioFile(file)) return createAudioFileNode(file, position);
      if (file.type.startsWith("video/"))
        return createVideoFileNode(file, position);
      return createImageFileNode(file, position);
    },
    [createAudioFileNode, createImageFileNode, createVideoFileNode],
  );

  const createCanvasFileNodes = useCallback(
    async (files: File[], anchorPosition: Position) => {
      const supportedFiles = files.filter(isSupportedCanvasFile);
      if (!supportedFiles.length) return;

      const createdIds: string[] = [];
      for (let index = 0; index < supportedFiles.length; index += 1) {
        const file = supportedFiles[index];
        try {
          const id = await createCanvasFileNode(
            file,
            getGridPosition(anchorPosition, index, supportedFiles.length),
          );
          createdIds.push(id);
        } catch (error) {
          message.error(
            `${file.name} 添加失败：${error instanceof Error ? error.message : "请重试"}`,
          );
        }
      }

      if (createdIds.length > 1) {
        setSelectedNodeIds(new Set(createdIds));
        setSelectedConnectionId(null);
        setDialogNodeId(null);
        message.success(`已添加 ${createdIds.length} 个素材`);
      }
    },
    [createCanvasFileNode, message],
  );

  const replaceNodeWithImage = useCallback(
    (
      nodeId: string,
      title: string,
      uploaded: UploadedImage,
      extraMetadata: Partial<CanvasNodeMetadata> = {},
    ) => {
      const nextSize = imageNodeSize(uploaded.width, uploaded.height);
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const center = {
            x: node.position.x + node.width / 2,
            y: node.position.y + node.height / 2,
          };
          return {
            ...node,
            type: CanvasNodeType.Image,
            title,
            position: {
              x: center.x - nextSize.width / 2,
              y: center.y - nextSize.height / 2,
            },
            width: nextSize.width,
            height: nextSize.height,
            metadata: {
              ...node.metadata,
              ...imageMetadata(uploaded),
              ...extraMetadata,
              imageSequenceNumber:
                node.metadata?.imageSequenceNumber ??
                nextImageSequenceNumber(nodesRef.current),
              errorDetails: undefined,
              freeResize: false,
              isBatchRoot: undefined,
              batchRootId: undefined,
              batchChildIds: undefined,
              batchUsesReferenceImages: undefined,
              generationType: undefined,
              model: undefined,
              size: undefined,
              quality: undefined,
              count: undefined,
              references: undefined,
              primaryImageId: undefined,
              imageBatchExpanded: undefined,
            },
          };
        }),
      );
      setSelectedNodeIds(new Set([nodeId]));
      setSelectedConnectionId(null);
      setDialogNodeId(nodeId);
    },
    [],
  );

  const replaceNodeFromCanvasImage = useCallback(
    async (targetNode: CanvasNodeData, sourceNode: CanvasNodeData) => {
      if (!sourceNode.metadata?.content)
        return message.warning("这张图片暂无可用内容");
      try {
        const dataUrl = await imageToDataUrl({
          url: sourceNode.metadata.content,
          storageKey: sourceNode.metadata.storageKey,
        });
        if (!dataUrl) return message.error("读取画布图片失败");
        const uploaded = await uploadImage(dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
        replaceNodeWithImage(
          targetNode.id,
          sourceNode.title || "画布图片",
          uploaded,
          {
            prompt: sourceNode.metadata.prompt,
            source: "canvas-image",
          },
        );
        setReplacePickerNodeId(null);
        message.success("已用画布图片替换");
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "替换失败，请重试",
        );
      }
    },
    [message, replaceNodeWithImage],
  );

  const copyNodeImageToSystemClipboard = useCallback(
    async (
      node: CanvasNodeData,
      successMessage = "已复制图片，可粘贴到微信等应用",
    ) => {
      try {
        if (node.type !== CanvasNodeType.Image || !node.metadata?.content)
          throw new Error("图片内容为空");
        const dataUrl = await imageToDataUrl({
          url: node.metadata.content,
          storageKey: node.metadata.storageKey,
        });
        if (!dataUrl) throw new Error("读取图片失败");
        if (
          navigator.clipboard?.write &&
          typeof ClipboardItem !== "undefined"
        ) {
          const blob = await clipboardImageBlob(dataUrl);
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type || "image/png"]: blob }),
          ]);
          message.success(successMessage);
          return true;
        }
        if (copyImageWithLegacySelection(dataUrl)) {
          message.success("已用兼容模式复制图片，可尝试粘贴到微信");
          return true;
        }
        throw new Error(
          window.isSecureContext
            ? "当前浏览器不支持复制图片"
            : "当前地址不是 HTTPS，浏览器限制复制图片",
        );
      } catch (error) {
        const fallbackText = window.isSecureContext
          ? ""
          : "；请用 HTTPS 打开，或先下载图片再发送";
        message.error(
          `${error instanceof Error ? error.message : "复制图片失败"}${fallbackText}`,
        );
        return true;
      }
    },
    [message],
  );

  const createTextNodeFromClipboard = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      const node = {
        ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), {
          content: trimmed,
          status: NODE_STATUS_SUCCESS,
        }),
        title: trimmed.slice(0, 32) || "剪切板文本",
      };

      setNodes((prev) => [...prev, node]);
      setSelectedNodeIds(new Set([node.id]));
      setSelectedConnectionId(null);
      setContextMenu(null);
      setDialogNodeId(node.id);
      return true;
    },
    [getCanvasCenter],
  );

  const pasteSystemClipboard = useCallback(async () => {
    if (!navigator.clipboard) return;
    try {
      const items = await navigator.clipboard.read();
      const imageItem = items.find((item) =>
        item.types.some((type) => type.startsWith("image/")),
      );
      if (imageItem) {
        const imageType = imageItem.types.find((type) =>
          type.startsWith("image/"),
        );
        if (!imageType) return;
        const blob = await imageItem.getType(imageType);
        const file = new File([blob], "clipboard-image.png", { type: imageType });
        await createImageFileNode(file, getCanvasCenter());
        message.success("已从剪切板添加图片");
        return;
      }

      const text = await navigator.clipboard.readText();
      if (createTextNodeFromClipboard(text))
        message.success("已从剪切板添加文本");
    } catch (error) {
      message.error(`剪切板图片读取失败：${error instanceof Error ? error.message : "请重试"}`);
    }
  }, [
    createImageFileNode,
    createTextNodeFromClipboard,
    getCanvasCenter,
    message,
  ]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        target?.closest("[contenteditable='true'],[data-canvas-no-zoom]")
      )
        return;
      const file = Array.from(event.clipboardData?.files || []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        void createImageFileNode(file, getCanvasCenter())
          .then(() => message.success("已从剪切板添加图片"))
          .catch((error: unknown) =>
            message.error(`剪切板图片读取失败：${error instanceof Error ? error.message : "请重试"}`),
          );
        return;
      }
      const text = event.clipboardData?.getData("text/plain") || "";
      if (createTextNodeFromClipboard(text)) {
        event.preventDefault();
        message.success("已从剪切板添加文本");
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [
    createImageFileNode,
    createTextNodeFromClipboard,
    getCanvasCenter,
    message,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      const target = event.target instanceof Element ? event.target : null;
      const isEditableTarget =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        Boolean(target?.closest("[contenteditable='true']")) ||
        isCanvasOverlayTarget(target) ||
        Boolean(document.querySelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden), [data-radix-select-content], [data-radix-popper-content-wrapper]"));
      if (isEditableTarget) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        requestDeleteActiveCanvasSelection();
        return;
      }

      if (target?.closest("[data-canvas-no-zoom]")) return;

      const key = event.key.toLowerCase();
      const isModifierShortcut = event.metaKey || event.ctrlKey;

      if (isModifierShortcut && !event.altKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCanvas();
        else undoCanvas();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "y") {
        event.preventDefault();
        redoCanvas();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "a") {
        event.preventDefault();
        setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "c") {
        if (event.repeat) return;
        event.preventDefault();
        const selectedId =
          selectedNodeIdsRef.current.size === 1
            ? Array.from(selectedNodeIdsRef.current)[0]
            : null;
        const selectedNode = selectedId
          ? nodesRef.current.find((node) => node.id === selectedId)
          : null;
        if (
          selectedNode?.type === CanvasNodeType.Image &&
          selectedNode.metadata?.content
        ) {
          copySelectedNodes();
          void copyNodeImageToSystemClipboard(selectedNode);
          return;
        }
        copySelectedNodes();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "v") {
        if (pasteCopiedNodes()) event.preventDefault();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "d") {
        event.preventDefault();
        duplicateSelectedNodes();
        return;
      }

      if (isModifierShortcut && !event.altKey && (key === "=" || key === "+")) {
        event.preventDefault();
        setZoomScale(canvasViewportRuntime.current.k * 1.15);
        return;
      }

      if (isModifierShortcut && !event.altKey && (key === "-" || key === "_")) {
        event.preventDefault();
        setZoomScale(canvasViewportRuntime.current.k / 1.15);
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "0") {
        event.preventDefault();
        resetViewport();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "n") {
        event.preventDefault();
        createAndOpenProject();
        return;
      }

      if (isModifierShortcut && !event.altKey && key === "o") {
        event.preventDefault();
        uploadTargetRef.current = null;
        imageInputRef.current?.click();
        return;
      }

      if (
        !event.repeat &&
        event.code === "Space" &&
        !event.altKey &&
        !isModifierShortcut &&
        !event.shiftKey
      ) {
        if (previewNodeIdRef.current) {
          event.preventDefault();
          setPreviewNodeId(null);
          return;
        }
        const selectedId =
          selectedNodeIdsRef.current.size === 1
            ? Array.from(selectedNodeIdsRef.current)[0]
            : null;
        const selectedNode = selectedId
          ? nodesRef.current.find((node) => node.id === selectedId)
          : null;
        if (
          selectedNode?.type === CanvasNodeType.Image &&
          canvasPreviewableSrc(selectedNode)
        ) {
          event.preventDefault();
          setPreviewNodeId(selectedNode.id);
          return;
        }
      }

      if (
        (key === "?" || (key === "/" && event.shiftKey)) &&
        !event.altKey &&
        !isModifierShortcut
      ) {
        event.preventDefault();
        window.dispatchEvent(new Event(CANVAS_SHORTCUT_EVENT));
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedNodeIds(new Set());
        setSelectedConnectionId(null);
        setContextMenu(null);
        setSelectionBox(null);
        setConnecting(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        setEditingNodeId(null);
        setInfoNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setPendingConnectionCreate(null);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return;

      if (key === "i") {
        event.preventDefault();
        createNode(CanvasNodeType.Image);
        return;
      }

      if (key === "t") {
        event.preventDefault();
        createNode(CanvasNodeType.Text);
        return;
      }

      if (key === "g") {
        event.preventDefault();
        createNode(CanvasNodeType.Config);
        return;
      }

      if (key === "v") {
        event.preventDefault();
        createNode(CanvasNodeType.Video);
        return;
      }

      if (key === "a") {
        event.preventDefault();
        createNode(CanvasNodeType.Audio);
        return;
      }

      if (key === "u") {
        event.preventDefault();
        uploadTargetRef.current = null;
        imageInputRef.current?.click();
        return;
      }

      if (key === "l") {
        event.preventDefault();
        setAssetPickerTab("library");
        setAssetPickerOpen(true);
        return;
      }

      if (key === "b") {
        event.preventDefault();
        setAssetPickerTab("my-assets");
        setAssetPickerOpen(true);
        return;
      }

      if (key === "m") {
        event.preventDefault();
        setIsMiniMapOpen((value) => !value);
        return;
      }

      if (key === "h") {
        event.preventDefault();
        setAssistantMounted(true);
        setAssistantCollapsed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    copySelectedNodes,
    createAndOpenProject,
    createNode,
    duplicateSelectedNodes,
    requestDeleteActiveCanvasSelection,
    pasteCopiedNodes,
    pasteSystemClipboard,
    redoCanvas,
    resetViewport,
    setConnecting,
    setZoomScale,
    undoCanvas,
  ]);

  const handleConnectStart = useCallback(
    (
      event: ReactMouseEvent,
      nodeId: string,
      handleType: "source" | "target",
      handleId?: string,
    ) => {
      event.stopPropagation();
      setMouseWorld(screenToCanvas(event.clientX, event.clientY));
      setConnecting({ nodeId, handleType, handleId });
      connectionTargetNodeIdRef.current = null;
      connectionTargetHandleIdRef.current = null;
      setConnectionTargetNodeId(null);
      setConnectionTargetHandleId(null);
      setSelectedConnectionId(null);
    },
    [screenToCanvas, setConnecting],
  );

  const handleNodeResize = useCallback(
    (
      nodeId: string,
      width: number,
      height: number,
      position?: Position,
      options: { persistSeedanceManualMinHeight?: boolean; seedanceRatio?: "9:16" | "16:9" } = {},
    ) => {
      const updateNodes =
        options.persistSeedanceManualMinHeight === false
          ? applyPersistedNodes
          : setNodes;
      updateNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          if (node.type === CanvasNodeType.Video && node.metadata?.seedanceWorkflowRole === "placeholder") {
            const nextRatio = normalizeSeedance2AspectRatio(
              options.seedanceRatio ||
                node.metadata?.seedanceRatio ||
                node.metadata?.seedanceSourceAspectRatio ||
                node.metadata?.size ||
                "9:16",
            );
            const stableSize = seedance2PlaceholderSize(nextRatio);
            const currentRatio = normalizeSeedance2AspectRatio(
              node.metadata?.seedanceRatio || node.metadata?.size || "9:16",
            );
            const ratioChanged = Boolean(options.seedanceRatio) && nextRatio !== currentRatio;
            const baseMetadata =
              options.persistSeedanceManualMinHeight === false
                ? node.metadata?.seedanceReferenceSlotsExpanded === true
                  ? node.metadata
                  : {
                      ...node.metadata,
                      seedanceManualMinHeight: undefined,
                    }
                : {
                    ...node.metadata,
                    seedanceManualMinHeight: Math.max(stableSize.height, height),
                    seedanceReferenceSlotsExpanded:
                      width > stableSize.width || height > stableSize.height,
                  };
            const nextMetadata = options.seedanceRatio
              ? {
                  ...baseMetadata,
                  seedanceRatio: nextRatio,
                  size: nextRatio,
                  ...(ratioChanged
                    ? {
                        seedanceRatioTouched: true,
                        seedanceInheritSourceRatio: false,
                      }
                    : {}),
                }
              : baseMetadata;
            return {
              ...node,
              width: Math.max(stableSize.width, width),
              height: Math.max(stableSize.height, height),
              position: position || node.position,
              metadata: nextMetadata,
            };
          }
          return { ...node, width, height, position: position || node.position };
        }),
      );
    },
    [applyPersistedNodes],
  );

  useEffect(() => {
    const handleImageWheelResize = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          nodeId?: unknown;
          width?: unknown;
          height?: unknown;
          position?: unknown;
        }>
      ).detail;
      if (
        !detail ||
        typeof detail.nodeId !== "string" ||
        typeof detail.width !== "number" ||
        typeof detail.height !== "number"
      )
        return;
      const position = detail.position as Position | undefined;
      handleNodeResize(detail.nodeId, detail.width, detail.height, position);
    };
    window.addEventListener(
      "canvas:image-wheel-resize",
      handleImageWheelResize,
    );
    return () =>
      window.removeEventListener(
        "canvas:image-wheel-resize",
        handleImageWheelResize,
      );
  }, [handleNodeResize]);

  const toggleNodeFreeResize = useCallback((nodeId: string) => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        const freeResize = !node.metadata?.freeResize;
        if (freeResize || node.type !== CanvasNodeType.Image)
          return { ...node, metadata: { ...node.metadata, freeResize } };
        const ratio =
          (node.metadata?.naturalWidth || node.width) /
          (node.metadata?.naturalHeight || node.height || 1);
        const height = node.width / ratio;
        return {
          ...node,
          height,
          position: {
            x: node.position.x,
            y: node.position.y + node.height / 2 - height / 2,
          },
          metadata: { ...node.metadata, freeResize },
        };
      }),
    );
  }, []);

  const handleNodeContentChange = useCallback(
    (nodeId: string, content: string) => {
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          if (node.type === CanvasNodeType.Video && node.metadata?.seedanceWorkflowRole === "placeholder") {
            return { ...node, metadata: { ...node.metadata, ...seedance2UserPromptPatch(content) } };
          }
          return { ...node, metadata: { ...node.metadata, content } };
        }),
      );
    },
    [],
  );

  const regenerateSeedance2StoryPrompt = useCallback(
    async (nodeId: string) => {
      const placeholder = nodesRef.current.find((node) => node.id === nodeId);
      if (
        placeholder?.type !== CanvasNodeType.Video ||
        placeholder.metadata?.seedanceWorkflowRole !== "placeholder"
      ) return;

      const workflowId = String(placeholder.metadata?.seedanceWorkflowNodeId || "").trim();
      const workflowNode = nodesRef.current.find((node) => node.id === workflowId);
      if (!workflowNode || workflowNode.type !== CanvasNodeType.Seedance2Workflow) {
        message.error("\u672a\u627e\u5230\u5f53\u524d\u89c6\u9891\u8282\u70b9\u5bf9\u5e94\u7684 Seedance2 \u89c6\u9891\u5de5\u4f5c\u6d41");
        return;
      }
      const storyDirectorId = String(
        placeholder.metadata?.seedanceStoryDirectorNodeId || "",
      ).trim();
      const storyDirector = nodesRef.current.find(
        (node) =>
          node.id === storyDirectorId &&
          node.type === CanvasNodeType.StoryDirector,
      );
      if (!storyDirector) {
        message.error("\u672a\u627e\u5230\u5f53\u524d\u89c6\u9891\u8282\u70b9\u5173\u8054\u7684\u6545\u4e8b\u5bfc\u6f14");
        return;
      }

      const promptTextModelResolution = resolveSeedance2PromptTextProviderSelection(
        workflowNode,
        effectiveConfig,
      );
      if (!promptTextModelResolution.selection) {
        message.error(
          `Seedance2 文本模型“${promptTextModelResolution.legacyModel || "未选择"}”没有可唯一确定的 provider，请重新选择后再试`,
        );
        return;
      }
      if (
        workflowNode.metadata?.seedancePromptTextModel &&
        !workflowNode.metadata.seedancePromptTextModelProviderId
      ) {
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === workflowNode.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    seedancePromptTextModelProviderId:
                      promptTextModelResolution.selection!.providerId,
                  },
                }
              : item,
          ),
        );
      }
      const promptTextModel = promptTextModelResolution.selection.model;
      const textConfig = applyExplicitCanvasGenerationModel(
        buildGenerationConfig(effectiveConfig, workflowNode, "text"),
        "text",
        promptTextModelResolution.selection,
      );
      if (!isAiConfigReady(textConfig, promptTextModel)) {
        openConfigDialog(true);
        return;
      }

      const configuredTemplate = typeof workflowNode.metadata?.seedancePromptTemplate === "string"
        ? workflowNode.metadata.seedancePromptTemplate.trim()
        : "";
      const rewriteTemplate = configuredTemplate || defaultSeedancePromptTemplate();
      setRunningNodeId(nodeId);
      try {
        const rewriteInput = collectSeedance2StoryRewriteInput({
          storyDirector,
          nodes: nodesRef.current,
          connections: connectionsRef.current,
          template: rewriteTemplate,
          shotId: placeholder.metadata?.seedanceStoryShotId,
          shotIndex:
            placeholder.metadata?.seedanceStoryShotIndex ||
            placeholder.metadata?.seedanceShotIndex,
        });
        const resolvedSlots = resolveCapabilityReferenceSlots(
          placeholder,
          nodesRef.current,
          connectionsRef.current,
          config,
          effectiveConfig,
        );
        const referenceCandidates = seedance2ResolvedSlotsToCustomerReferences(resolvedSlots);
        const selectedShot = rewriteInput.shots[0];
        if (
          selectedShot?.sourceImage &&
          !referenceCandidates.some((reference) => reference.nodeId === selectedShot.sourceImageNodeId)
        ) {
          referenceCandidates.unshift({
            label: "\u5f53\u524d\u5206\u955c\u56fe",
            value: selectedShot.sourceImage,
            nodeId: selectedShot.sourceImageNodeId,
            useAs: "reference_image",
            role: "current_shot",
          });
        }
        const promptReferences = await hydrateSeedance2CustomerReferencesForTransport(
          referenceCandidates,
          imageToDataUrl,
        );
        const referenceContext = promptReferences.map((reference) => {
          const sourceNode = nodesRef.current.find((node) => node.id === reference.nodeId);
          return {
            label: reference.label,
            nodeId: reference.nodeId,
            useAs: reference.useAs,
            sourceTitle: sourceNode?.title || "",
            sourcePrompt:
              typeof sourceNode?.metadata?.prompt === "string"
                ? sourceNode.metadata.prompt
                : "",
          };
        });
        const [rewrittenShot] = await rewriteSeedance2BatchPrompts(
          { ...rewriteInput, rewriteModel: promptTextModel },
          async (request) => {
            const content: ChatCompletionMessage["content"] = [
              { type: "text", text: request.contentText },
              {
                type: "text",
                text: `\u5f53\u524d\u89c6\u9891\u8282\u70b9\u7684\u5168\u90e8\u53c2\u8003\u56fe\u8d44\u6599\uff08\u5fc5\u987b\u4e0e\u89c6\u9891\u5de5\u4f5c\u6d41\u6a21\u677f\u4e00\u8d77\u4f7f\u7528\uff09\uff1a\n${JSON.stringify(referenceContext, null, 2)}`,
              },
              ...promptReferences.flatMap((reference) => [
                {
                  type: "text" as const,
                  text: `\u89c6\u9891\u8282\u70b9\u53c2\u8003\u56fe\uff1a${reference.label}`,
                },
                {
                  type: "image_url" as const,
                  image_url: { url: reference.value },
                },
              ]),
            ];
            return (
              (await requestImageQuestion(
                {
                  ...textConfig,
                  textModel: request.model,
                  model: request.model,
                },
                [{ role: "user", content }],
                undefined,
                { stream: false },
              )) || ""
            );
          },
        );
        if (!rewrittenShot) throw new Error("\u89c6\u9891\u63d0\u793a\u8bcd\u91cd\u65b0\u751f\u6210\u672a\u8fd4\u56de\u7ed3\u679c");
        setNodes((prev) =>
          prev.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    prompt: rewrittenShot.prompt,
                    seedanceAutoPrompt: rewrittenShot.prompt,
                    seedancePromptEditedByUser: false,
                    seedancePromptRewriteModel: promptTextModel,
                    seedancePromptRewriteTemplate: rewriteTemplate,
                    seedancePromptRewriteCreatedAt: new Date().toISOString(),
                  },
                }
              : node,
          ),
        );
        message.success("\u5df2\u6839\u636e\u89c6\u9891\u5de5\u4f5c\u6d41\u6a21\u677f\u91cd\u65b0\u751f\u6210\u63d0\u793a\u8bcd");
      } catch (error) {
        const details = error instanceof Error ? error.message : "\u89c6\u9891\u63d0\u793a\u8bcd\u91cd\u65b0\u751f\u6210\u5931\u8d25";
        message.error(details);
      } finally {
        setRunningNodeId(null);
      }
    },
    [applyPersistedNodes, effectiveConfig, message, openConfigDialog],
  );

  const handleNodeMetadataChange = useCallback(
    (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => {
      const node = nodesRef.current.find((candidate) => candidate.id === nodeId);
      const requestsStoryPromptRegeneration =
        node?.type === CanvasNodeType.Video &&
        node.metadata?.seedanceWorkflowRole === "placeholder" &&
        patch.seedancePromptEditedByUser === false &&
        typeof patch.prompt === "string" &&
        patch.prompt ===
          (node.metadata?.seedanceAutoPrompt ||
            node.metadata?.prompt ||
            "");
      if (requestsStoryPromptRegeneration) {
        void regenerateSeedance2StoryPrompt(nodeId);
        return;
      }

      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const acceptedPatch = node.type === CanvasNodeType.Video
            ? protectVideoTaskSnapshotPatch(node.metadata, patch)
            : patch;
          const nextMetadata = { ...node.metadata, ...acceptedPatch };
          if (acceptedPatch.seedanceReferenceSlotBindings) {
            nextMetadata.seedanceReferenceSlotBindings = {
              ...(node.metadata?.seedanceReferenceSlotBindings || {}),
              ...(acceptedPatch.seedanceReferenceSlotBindings || {}),
            };
          }
          if (acceptedPatch.seedanceReferenceExtraSlotBindings) {
            nextMetadata.seedanceReferenceExtraSlotBindings = {
              ...(node.metadata?.seedanceReferenceExtraSlotBindings || {}),
              ...(acceptedPatch.seedanceReferenceExtraSlotBindings || {}),
            };
          }
          const changesPlaceholderRatio =
            node.type === CanvasNodeType.Video &&
            !nextMetadata.content &&
            nextMetadata.seedanceWorkflowRole === "placeholder" &&
            (typeof acceptedPatch.seedanceRatio === "string" ||
              typeof acceptedPatch.size === "string");
          if (!changesPlaceholderRatio) {
            return { ...node, metadata: nextMetadata };
          }
          const ratio = normalizeSeedance2AspectRatio(
            nextMetadata.seedanceRatio || nextMetadata.size || "16:9",
          );
          const size = seedance2PlaceholderSize(ratio);
          const hasExpandedManualFrame = nextMetadata.seedanceReferenceSlotsExpanded === true;
          const manualMinimumHeight = hasExpandedManualFrame
            ? Number(nextMetadata.seedanceManualMinHeight || 0)
            : 0;
          const nextWidth = hasExpandedManualFrame
            ? Math.max(size.width, node.width)
            : size.width;
          const nextHeight = Math.max(size.height, manualMinimumHeight);
          return {
            ...node,
            position: {
              x: node.position.x + node.width / 2 - nextWidth / 2,
              y: node.position.y + node.height / 2 - nextHeight / 2,
            },
            width: nextWidth,
            height: nextHeight,
            metadata: {
              ...nextMetadata,
              seedanceRatio: ratio,
              size: ratio,
            },
          };
        }),
      );
    },
    [regenerateSeedance2StoryPrompt],
  );

  const toggleBatchExpanded = useCallback((nodeId: string) => {
    const isExpanded = Boolean(
      nodesRef.current.find((node) => node.id === nodeId)?.metadata
        ?.imageBatchExpanded,
    );
    if (isExpanded) {
      setCollapsingBatchIds((prev) => new Set(prev).add(nodeId));
      window.setTimeout(() => {
        setCollapsingBatchIds((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }, 320);
    } else {
      setOpeningBatchIds((prev) => new Set(prev).add(nodeId));
      window.setTimeout(() => {
        setOpeningBatchIds((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }, 260);
    }
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          metadata: {
            ...node.metadata,
            imageBatchExpanded: !node.metadata?.imageBatchExpanded,
          },
        };
      }),
    );
  }, []);

  const setBatchPrimary = useCallback((child: CanvasNodeData) => {
    const rootId = child.metadata?.batchRootId;
    if (!rootId || !child.metadata?.content) return;
    setNodes((prev) =>
      prev.map((node) =>
        node.id === rootId
          ? {
              ...node,
              width: child.width,
              height: child.height,
              metadata: {
                ...node.metadata,
                content: child.metadata?.content,
                primaryImageId: child.id,
                naturalWidth: child.metadata?.naturalWidth,
                naturalHeight: child.metadata?.naturalHeight,
                freeResize: child.metadata?.freeResize,
              },
            }
          : node,
      ),
    );
  }, []);

  const openTextEditor = useCallback((node: CanvasNodeData) => {
    if (node.type !== CanvasNodeType.Text) return;
    setSelectedNodeIds(new Set([node.id]));
    setSelectedConnectionId(null);
    setDialogNodeId(node.id);
    setEditingNodeId(node.id);
    setEditRequestNonce((value) => value + 1);
  }, []);

  const handleNodePromptChange = useCallback(
    (nodeId: string, prompt: string) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? { ...node, metadata: { ...node.metadata, prompt } }
            : node,
        ),
      );
    },
    [],
  );

  const createPromptNodeForGeneration = useCallback(
    (prompt: string, position: Position): CanvasNodeData => {
      const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
      return {
        ...createCanvasNode(
          CanvasNodeType.Text,
          {
            x: position.x + textConfig.width / 2,
            y: position.y + textConfig.height / 2,
          },
          {
            content: prompt,
            prompt,
            status: NODE_STATUS_SUCCESS,
            fontSize: 14,
          },
        ),
        title: "提示词",
      };
    },
    [],
  );

  const handleConfigNodeChange = useCallback(
    (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => {
      setNodes((prev) =>
        (() => {
          const requestedPatch = patch || {};
          const currentNode = prev.find((node) => node.id === nodeId);
          const acceptedPatch = currentNode?.type === CanvasNodeType.Video
            ? protectVideoTaskSnapshotPatch(currentNode.metadata, requestedPatch)
            : requestedPatch;
          const next = prev.map((node) =>
            node.id === nodeId ? applyNodeConfigPatch(node, acceptedPatch) : node,
          );
          const changedSnapshotField = SEEDANCE_WORKFLOW_SNAPSHOT_FIELDS.some(
            (field) => Object.prototype.hasOwnProperty.call(acceptedPatch, field),
          );
          const workflow = next.find(
            (node) => node.id === nodeId && node.type === CanvasNodeType.Seedance2Workflow,
          );
          return changedSnapshotField && workflow
            ? synchronizeSeedanceWorkflowPlaceholderSnapshots(next, workflow)
            : next;
        })(),
      );
    },
    [],
  );

  const downloadNodeImage = useCallback(async (node: CanvasNodeData) => {
    if (
      (node.type !== CanvasNodeType.Image &&
        node.type !== CanvasNodeType.Video &&
        node.type !== CanvasNodeType.Audio) ||
      (!node.metadata?.content && !node.metadata?.storageKey)
    )
      return;
    if (node.type === CanvasNodeType.Image && node.metadata.storageKey)
      void touchStoredImages([node.metadata.storageKey]);
    const content =
      node.type !== CanvasNodeType.Image && node.metadata.storageKey
        ? await resolveMediaUrl(node.metadata.storageKey, node.metadata.content || "")
        : node.metadata.content || "";
    if (!content) return;
    saveAs(
      content,
      `canvas-${node.type}-${node.id}.${node.type === CanvasNodeType.Video ? "mp4" : node.type === CanvasNodeType.Audio ? audioExtension(node.metadata.mimeType) : imageExtension(content)}`,
    );
  }, []);

  const touchNodeImage = useCallback((node: CanvasNodeData) => {
    if (node.type === CanvasNodeType.Image && node.metadata?.storageKey) {
      void touchStoredImages([node.metadata.storageKey]);
    }
  }, []);

  const previewNodeImage = useCallback(
    (node: CanvasNodeData) => {
      const src = canvasPreviewableSrc(node);
      if (!src) return;
      touchNodeImage(node);
      setPreviewNodeId(node.id);
    },
    [touchNodeImage],
  );

  const toggleRetainNodeImage = useCallback(
    async (node: CanvasNodeData) => {
      if (node.type !== CanvasNodeType.Image || !node.metadata?.storageKey)
        return;
      const retained = !node.metadata.retained;
      await setStoredImagesRetained([node.metadata.storageKey], retained);
      setNodes((prev) =>
        prev.map((item) =>
          item.id === node.id
            ? { ...item, metadata: { ...item.metadata, retained } }
            : item,
        ),
      );
      message.success(
        retained
          ? "已长期保留这张图片"
          : "已取消长期保留，之后按 7 天未使用自动删除",
      );
    },
    [message],
  );

  const saveNodeAsset = useCallback(
    async (node: CanvasNodeData) => {
      if (assetHydrationStatus !== "ready") {
        message.warning(
          assetHydrationStatus === "error"
            ? "素材库读取失败，已阻止保存以免覆盖原数据；请在“我的素材”中重试读取"
            : "素材库仍在读取，完成后才能保存素材",
        );
        return;
      }
      if (node.type === CanvasNodeType.Text) {
        const content = node.metadata?.content?.trim();
        if (!content) return message.error("没有可保存的文本");
        addAsset({
          kind: "text",
          title: node.metadata?.prompt?.slice(0, 24) || "画布文本",
          coverUrl: "",
          tags: [],
          source: "Canvas",
          data: { content },
          metadata: { source: "canvas", nodeId: node.id },
        });
        message.success("已加入我的素材");
        return;
      }
      if (node.type === CanvasNodeType.Video) {
        if (!node.metadata?.content) return message.error("没有可保存的视频");
        addAsset({
          kind: "video",
          title: node.metadata?.prompt?.slice(0, 24) || "画布视频",
          coverUrl: "",
          tags: [],
          source: "Canvas",
          data: {
            url: node.metadata.content,
            storageKey: node.metadata.storageKey,
            width: node.width,
            height: node.height,
            bytes: node.metadata.bytes || 0,
            mimeType: node.metadata.mimeType || "video/mp4",
          },
          metadata: {
            source: "canvas",
            nodeId: node.id,
            prompt: node.metadata?.prompt,
          },
        });
        message.success("已加入我的素材");
        return;
      }
      if (!node.metadata?.content) return message.error("没有可保存的图片");
      if (node.metadata.storageKey) {
        await setStoredImagesRetained([node.metadata.storageKey], true);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? { ...item, metadata: { ...item.metadata, retained: true } }
              : item,
          ),
        );
      }
      const dataUrl = node.metadata.storageKey ? "" : node.metadata.content;
      addAsset({
        kind: "image",
        title: node.metadata?.prompt?.slice(0, 24) || "画布图片",
        coverUrl: node.metadata.content,
        tags: [],
        source: "Canvas",
        data: {
          dataUrl,
          storageKey: node.metadata.storageKey,
          width: node.metadata.naturalWidth || node.width,
          height: node.metadata.naturalHeight || node.height,
          bytes: node.metadata.bytes || getDataUrlByteSize(dataUrl),
          mimeType: node.metadata.mimeType || "image/png",
        },
        metadata: {
          source: "canvas",
          nodeId: node.id,
          prompt: node.metadata?.prompt,
        },
      });
      message.success("已加入我的素材");
    },
    [addAsset, assetHydrationStatus, message],
  );

  const downloadSelectedImages = useCallback(
    (targetNodes = selectedImageNodes) => {
      if (!targetNodes.length) return message.warning("请先选择图片");
      targetNodes.forEach((node, index) => {
        if (!node.metadata?.content) return;
        window.setTimeout(() => downloadNodeImage(node), index * 120);
      });
      message.success(`已开始下载 ${targetNodes.length} 张图片`);
    },
    [downloadNodeImage, message, selectedImageNodes],
  );

  const saveSelectedImages = useCallback(
    async (targetNodes = selectedImageNodes) => {
      if (!targetNodes.length) return message.warning("请先选择图片");
      for (const node of targetNodes) {
        await saveNodeAsset(node);
      }
      message.success(`已处理 ${targetNodes.length} 张图片`);
    },
    [message, saveNodeAsset, selectedImageNodes],
  );

  const retainSelectedImages = useCallback(
    async (targetNodes = selectedImageNodes) => {
      const keys = targetNodes
        .map((node) => node.metadata?.storageKey)
        .filter((key): key is string => Boolean(key));
      if (!keys.length) return message.warning("选中图片没有可保留的本地文件");
      await setStoredImagesRetained(keys, true);
      const ids = new Set(targetNodes.map((node) => node.id));
      setNodes((prev) =>
        prev.map((node) =>
          ids.has(node.id)
            ? { ...node, metadata: { ...node.metadata, retained: true } }
            : node,
        ),
      );
      message.success(`已保留 ${keys.length} 张图片`);
    },
    [message, selectedImageNodes],
  );

  const openImageCompare = useCallback(
    (targetNodes = selectedImageNodes) => {
      if (targetNodes.length < 2) {
        message.warning("请至少选择 2 张图片进行对比");
        return;
      }
      setCompareNodeIds(targetNodes.map((node) => node.id));
      setComparePrimaryNodeId(targetNodes[0]?.id || null);
      setContextMenu(null);
    },
    [message, selectedImageNodes],
  );

  const alignSelectedImages = useCallback(
    (mode: "left" | "center" | "right") => {
      const targets = selectedImageNodes;
      if (targets.length < 2) return message.warning("请至少选择 2 张图片");
      const value =
        mode === "left"
          ? Math.min(...targets.map((node) => node.position.x))
          : mode === "right"
            ? Math.max(...targets.map((node) => node.position.x + node.width))
            : targets.reduce(
                (sum, node) => sum + node.position.x + node.width / 2,
                0,
              ) / targets.length;
      const ids = new Set(targets.map((node) => node.id));
      setNodes((prev) =>
        prev.map((node) => {
          if (!ids.has(node.id)) return node;
          const x =
            mode === "left"
              ? value
              : mode === "right"
                ? value - node.width
                : value - node.width / 2;
          return { ...node, position: { ...node.position, x } };
        }),
      );
    },
    [message, selectedImageNodes],
  );

  const distributeSelectedImages = useCallback(
    (axis: "x" | "y") => {
      const targets = selectedImageNodes
        .slice()
        .sort((a, b) =>
          axis === "x"
            ? a.position.x - b.position.x
            : a.position.y - b.position.y,
        );
      if (targets.length < 3)
        return message.warning("请至少选择 3 张图片进行均分");
      const first = targets[0];
      const last = targets[targets.length - 1];
      const firstCenter =
        axis === "x"
          ? first.position.x + first.width / 2
          : first.position.y + first.height / 2;
      const lastCenter =
        axis === "x"
          ? last.position.x + last.width / 2
          : last.position.y + last.height / 2;
      const gap = (lastCenter - firstCenter) / (targets.length - 1);
      const ids = new Map(
        targets.map((node, index) => [node.id, firstCenter + gap * index]),
      );
      setNodes((prev) =>
        prev.map((node) => {
          const center = ids.get(node.id);
          if (center == null) return node;
          return {
            ...node,
            position:
              axis === "x"
                ? { ...node.position, x: center - node.width / 2 }
                : { ...node.position, y: center - node.height / 2 },
          };
        }),
      );
    },
    [message, selectedImageNodes],
  );

  const autoArrangeSelectedImages = useCallback(() => {
    const targets = selectedImageNodes;
    if (targets.length < 2) return message.warning("请至少选择 2 张图片");
    const sorted = targets
      .slice()
      .sort(
        (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
      );
    const minX = Math.min(...sorted.map((node) => node.position.x));
    const minY = Math.min(...sorted.map((node) => node.position.y));
    const maxWidth = Math.max(...sorted.map((node) => node.width));
    const maxHeight = Math.max(...sorted.map((node) => node.height));
    const columns = Math.ceil(Math.sqrt(sorted.length));
    const ids = new Map(
      sorted.map((node, index) => [
        node.id,
        {
          x: minX + (index % columns) * (maxWidth + 36),
          y: minY + Math.floor(index / columns) * (maxHeight + 36),
        },
      ]),
    );
    setNodes((prev) =>
      prev.map((node) =>
        ids.has(node.id) ? { ...node, position: ids.get(node.id)! } : node,
      ),
    );
  }, [message, selectedImageNodes]);

  const createReferenceGenerationFromImages = useCallback(
    (
      targetNodes = selectedImageNodes,
      preset: CanvasReferenceGenerationPreset,
    ) => {
      if (!targetNodes.length) return message.warning("请先选择图片");
      const operationError = canvasImageOperationCapabilityError(
        effectiveConfig,
        preset.imageOperation,
        targetNodes.length,
      );
      if (operationError) return message.warning(operationError);
      const bounds = targetNodes.reduce(
        (acc, node) => ({
          right: Math.max(acc.right, node.position.x + node.width),
          centerY: acc.centerY + node.position.y + node.height / 2,
        }),
        { right: -Infinity, centerY: 0 },
      );
      const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
      const references = targetNodes
        .map((node) => `@[node:${node.id}]`)
        .join(" ");
      const composerContent = [preset.prompt?.trim(), `参考图片：${references}`]
        .filter(Boolean)
        .join("\n\n");
      const configNode = createCanvasNode(
        CanvasNodeType.Config,
        {
          x: bounds.right + 96 + configSpec.width / 2,
          y: bounds.centerY / targetNodes.length,
        },
        {
          generationMode: "image",
          ...defaultCanvasProviderModelMetadata(effectiveConfig, "image"),
          size: preset.size || effectiveConfig.size,
          quality: preset.quality || effectiveConfig.quality,
          count:
            preset.count ||
            getGenerationCount(
              effectiveConfig.canvasImageCount || effectiveConfig.count,
            ),
          composerContent,
          imageOperation: preset.imageOperation,
        },
      );
      if (preset.title) configNode.title = preset.title;
      setNodes((prev) => [...prev, configNode]);
      setConnections((prev) => [
        ...prev,
        ...targetNodes.map((node) => ({
          id: nanoid(),
          fromNodeId: node.id,
          toNodeId: configNode.id,
        })),
      ]);
      setSelectedNodeIds(new Set([configNode.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(configNode.id);
      setContextMenu(null);
      if (preset.successMessage) message.success(preset.successMessage);
    },
    [
      effectiveConfig,
      message,
      selectedImageNodes,
    ],
  );

  const createStoryDirectorFromImages = useCallback(
    (targetNodes: CanvasNodeData[]) => {
      const primaryImage = targetNodes.find(
        (item) =>
          item.type === CanvasNodeType.Image && Boolean(item.metadata?.content),
      );
      const sourceImageIds = targetNodes
        .filter(
          (item) =>
            item.type === CanvasNodeType.Image &&
            Boolean(item.metadata?.content),
        )
        .map((item) => item.id);
      const sourceText =
        targetNodes.find(
          (item) =>
            item.type === CanvasNodeType.Text ||
            item.type === CanvasNodeType.StoryDirector,
        )?.metadata?.storyText ||
        targetNodes.find(
          (item) =>
            item.type === CanvasNodeType.Text ||
            item.type === CanvasNodeType.StoryDirector,
        )?.metadata?.content ||
        "";
      const sourceBounds = targetNodes.length
        ? targetNodes.reduce(
            (acc, node) => ({
              right: Math.max(acc.right, node.position.x + node.width),
              centerY: acc.centerY + node.position.y + node.height / 2,
            }),
            { right: -Infinity, centerY: 0 },
          )
        : null;
      const spec = NODE_DEFAULT_SIZE[CanvasNodeType.StoryDirector];
      const position = sourceBounds
        ? {
            x: sourceBounds.right + 96 + spec.width / 2,
            y: sourceBounds.centerY / targetNodes.length,
          }
        : getCanvasCenter();
      const node = createCanvasNode(CanvasNodeType.StoryDirector, position, {
        storyText: sourceText,
        content: sourceText,
        storyStyle: "电影感写实",
        storyShotCount: 5,
        storyAspectRatio: "16:9",
        storyWorkflow: "idle",
        storySourceImageNodeId: primaryImage?.id,
        storySourceImageNodeIds: sourceImageIds,
        storyCharacterSourceImageNodeIds: [],
        storySceneSourceImageNodeIds: [],
        storyPropSourceImageNodeIds: [],
        status: NODE_STATUS_SUCCESS,
        storyAnalysisStatus: "idle",
        storyGenerationStatus: "idle",
      });
      setNodes((prev) => [...prev, node]);
      setConnections((prev) => [
        ...prev,
        ...targetNodes.map((target) => ({
          id: nanoid(),
          fromNodeId: target.id,
          toNodeId: node.id,
          toHandleId:
            target.type === CanvasNodeType.Image
              ? "story:reference"
              : undefined,
        })),
      ]);
      setSelectedNodeIds(new Set([node.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(node.id);
      setContextMenu(null);
      focusNodeInView(node);
      message.success(
        sourceText
          ? "已创建故事导演节点，并带入文本"
          : primaryImage
            ? "已创建故事导演节点，并连接参考图"
            : "已创建空白故事导演节点",
      );
    },
    [focusNodeInView, getCanvasCenter, message],
  );

  const createStoryDirectorConfig = useCallback(
    async (node: CanvasNodeData, kind: StoryDirectorConfigKind) => {
      const storyText = storyDirectorEditableText(node.metadata);
      if (!storyText || storyText === STORY_DIRECTOR_PLACEHOLDER.trim()) {
        message.warning("请先在故事导演节点中粘贴小说或剧情文本");
        return;
      }

      const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
      const position = {
        x: node.position.x + node.width + 96 + configSpec.width / 2,
        y: node.position.y + node.height / 2,
      };
      const prompt = buildStoryDirectorPrompt(node, kind);
      const mode = kind === "analysis" ? "text" : "image";
      const sourceIds =
        kind === "analysis"
          ? []
          : ["reference", "character", "scene", "prop"].flatMap((inputKind) =>
              storyDirectorSourceIdsForKind(
                node,
                inputKind as StoryDirectorInputKind,
              ),
            );
      let storyImageRequest: Awaited<ReturnType<typeof resolveStoryWorkflowImageRequest>> | undefined;
      if (mode === "image") {
        try {
          storyImageRequest = await resolveStoryWorkflowImageRequest(
            effectiveConfig,
            sourceIds.length > 0,
          );
        } catch (error) {
          message.warning(formatCanvasGenerationError(error, "Story 图片配置不可用"));
          return;
        }
      }
      const configNode = createCanvasNode(CanvasNodeType.Config, position, {
        generationMode: mode,
        ...defaultCanvasProviderModelMetadata(effectiveConfig, mode),
        size:
          kind === "character"
            ? "16:9"
            : node.metadata?.storyAspectRatio || effectiveConfig.size,
        quality: effectiveConfig.quality,
        count: 1,
        composerContent: `故事导演：@[node:${node.id}]\n\n${prompt}`,
        storyWorkflow: kind,
        ...(storyImageRequest
          ? { imageOperation: storyImageRequest.capability.operation }
          : {}),
      });
      configNode.title =
        kind === "analysis"
          ? "故事分析配置"
          : kind === "character"
            ? "角色图配置"
            : "分镜图配置";
      setNodes((prev) => [
        ...prev.map((item) =>
          item.id === node.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  storyWorkflow: kind,
                  status: NODE_STATUS_SUCCESS,
                  storyAnalysisStatus:
                    item.metadata?.storyAnalysisStatus === NODE_STATUS_LOADING
                      ? "idle"
                      : item.metadata?.storyAnalysisStatus,
                  storyGenerationStatus:
                    item.metadata?.storyGenerationStatus === NODE_STATUS_LOADING
                      ? "idle"
                      : item.metadata?.storyGenerationStatus,
                },
              }
            : item,
        ),
        configNode,
      ]);
      setConnections((prev) => {
        const next = [
          ...prev,
          { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id },
        ];
        const sourceConnections = sourceIds
          .filter(
            (sourceId) =>
              !next.some(
                (connection) =>
                  connection.fromNodeId === sourceId &&
                  connection.toNodeId === configNode.id,
              ),
          )
          .map((sourceId) => ({
            id: nanoid(),
            fromNodeId: sourceId,
            toNodeId: configNode.id,
          }));
        return sourceConnections.length
          ? [...next, ...sourceConnections]
          : next;
      });
      setSelectedNodeIds(new Set([configNode.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(configNode.id);
      setContextMenu(null);
    },
    [effectiveConfig, message],
  );

  const resolveStoryImageGenerationSourceForRun = useCallback(
    (
      storyDirector: CanvasNodeData,
      workflow: StoryImageWorkflow,
      sourceNodes: readonly CanvasNodeData[],
    ) => {
      try {
        return resolveStoryImageGenerationSource(
          storyDirector,
          workflow,
          sourceNodes,
          connectionsRef.current,
        );
      } catch (error) {
        const workflowLabel = workflow === "character" ? "角色图" : "分镜图";
        const errorDetails = formatCanvasGenerationError(
          error,
          `${workflowLabel}配置不可用`,
        );
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === storyDirector.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return null;
      }
    },
    [applyPersistedNodes, message],
  );

  const analyzeStoryDirector = useCallback(
    async (node: CanvasNodeData) => {
      const storyText = storyDirectorEditableText(node.metadata);
      if (!storyText || storyText === STORY_DIRECTOR_PLACEHOLDER.trim()) {
        message.warning("请先粘贴小说或剧情文本");
        return null;
      }
      const inheritedStoryDirectorTextModel = storyDirectorInheritedTextModel;
      const storyDirectorTextModelResolution = resolveStoryDirectorTextModelSelection(
        node.metadata,
        inheritedStoryDirectorTextModel,
        storyDirectorTextModels,
      );
      if (!storyDirectorTextModelResolution.selection) {
        const legacyModel = storyDirectorTextModelResolution.legacyModel || "未选择";
        const errorDetails =
          storyDirectorTextModelResolution.status === "ambiguous"
            ? `故事导演文本模型“${legacyModel}”属于多个 provider，请重新选择后再试`
            : `故事导演文本模型“${legacyModel}”的 provider 不可用，请重新选择后再试`;
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyAnalysisStatus: NODE_STATUS_ERROR,
                    storyGenerationStatus:
                      item.metadata?.storyGenerationStatus === NODE_STATUS_LOADING
                        ? "idle"
                        : item.metadata?.storyGenerationStatus,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return null;
      }
      const storyDirectorTextModel = storyDirectorTextModelResolution.selection.model;
      if (
        node.metadata?.storyDirectorTextModelMode === "custom" &&
        !node.metadata.storyDirectorTextModelProviderId
      ) {
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyDirectorTextModelProviderId:
                      storyDirectorTextModelResolution.selection!.providerId,
                    storyDirectorTextModel,
                  },
                }
              : item,
          ),
        );
      }
      const hasCustomStoryDirectorModel = hasCustomStoryDirectorTextModel(
        node.metadata,
        storyDirectorTextModels,
      );
      const storyDirectorBoardRouteKey: ApiBoardRouteKey | undefined =
        hasCustomStoryDirectorModel ? undefined : "storyDirector";
      const baseTextConfig = buildGenerationConfig(
        effectiveConfig,
        node,
        "text",
      );
      const textConfig = applyExplicitCanvasGenerationModel(
        baseTextConfig,
        "text",
        storyDirectorTextModelResolution.selection,
      );
      if (!isAiConfigReady(textConfig, textConfig.model)) {
        openConfigDialog(true);
        return;
      }

      const previousStoryAnalysisRaw =
        node.metadata?.storyAnalysisRaw &&
        !detectTextApiResponseError(node.metadata.storyAnalysisRaw)
          ? node.metadata.storyAnalysisRaw
          : node.metadata?.storyAnalysisPreviousRaw &&
              !detectTextApiResponseError(node.metadata.storyAnalysisPreviousRaw)
            ? node.metadata.storyAnalysisPreviousRaw
            : undefined;
      setRunningNodeId(node.id);
      applyPersistedNodes((prev) =>
        prev.map((item) =>
          item.id === node.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  storyAnalysisStatus: NODE_STATUS_LOADING,
                  storyAnalysisPreviousRaw: previousStoryAnalysisRaw,
                  storyAnalysisRaw: previousStoryAnalysisRaw,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                },
              }
            : item,
        ),
      );
      try {
        let streamed = "";
        const requestedShotCount = node.metadata?.storyShotCount || 5;
        const parseRequestedStoryAnalysis = (value: string) => {
          const parsed = parseStoryAnalysis(value);
          if (parsed.shots.length !== requestedShotCount) {
            throw new Error(
              `故事分析镜头数不符合要求：要求 ${requestedShotCount} 个镜头，实际返回 ${parsed.shots.length} 个镜头`,
            );
          }
          return parsed;
        };
        const prompt = `${buildStoryDirectorPrompt(node, "analysis")}\n\n故事文本：\n${storyText}`;
        const storyDirectorJsonOptions = supportsStoryDirectorJsonResponseFormat(storyDirectorTextModel)
          ? {
              stream: true,
              responseFormat: "json_object" as const,
              disableFileGeneration: true,
              boardRouteKey: storyDirectorBoardRouteKey,
              requestPurpose: "storyDirector" as const,
            }
          : {
              stream: true,
              responseFormat: undefined,
              disableFileGeneration: undefined,
              boardRouteKey: storyDirectorBoardRouteKey,
              requestPurpose: "storyDirector" as const,
            };
        const handleAnalysisDelta = (text: string) => {
          if (detectTextApiResponseError(text)) return;
          streamed = text;
          setNodes((prev) =>
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    metadata: { ...item.metadata, storyAnalysisRaw: text },
                  }
                : item,
            ),
          );
        };
        const requestStoryJson = async (content: string) => {
          try {
            return await requestImageQuestion(
              textConfig,
              [{ role: "user", content }],
              handleAnalysisDelta,
              storyDirectorJsonOptions,
            );
          } catch (error) {
            const reason = error instanceof Error ? error.message : "";
            if (!/response_format|json_object|unsupported|不支持/i.test(reason))
              throw error;
            return requestImageQuestion(
              textConfig,
              [{ role: "user", content }],
              handleAnalysisDelta,
              { ...storyDirectorJsonOptions, responseFormat: undefined },
            );
          }
        };
        let raw = (await requestStoryJson(prompt)) || streamed;
        const initialResponseError = detectTextApiResponseError(raw);
        if (initialResponseError) throw new Error(initialResponseError);
        let analysis: StoryAnalysisResult;
        try {
          analysis = parseRequestedStoryAnalysis(raw);
        } catch (parseError) {
          message.info("故事分析结果不符合要求，正在自动修复");
          const repairPrompt = buildStoryAnalysisRepairPrompt(
            node,
            storyText,
            raw,
            parseError,
          );
          raw = (await requestStoryJson(repairPrompt)) || streamed || raw;
          const repairedResponseError = detectTextApiResponseError(raw);
          if (repairedResponseError) throw new Error(repairedResponseError);
          analysis = parseRequestedStoryAnalysis(raw);
        }
        const storyDevelopmentText = buildStoryDevelopmentText(analysis, node, storyText);
        applyPersistedNodes((prev) =>
          syncStoryDirectorInputMetadata(
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    metadata: {
                      ...item.metadata,
                      storyAnalysisStatus: NODE_STATUS_SUCCESS,
                      storyGenerationStatus: "idle",
                      storyAnalysisRaw: raw,
                      storyOriginalText: item.metadata?.storyOriginalText || storyText,
                      storyAnalysisSourceText: storyText,
                      storyAnalysisRenderedText: storyDevelopmentText,
                      storyAnalysisShotCount: requestedShotCount,
                      storyText,
                      content: storyText,
                      storyCharacters: analysis.characters,
                      storyScenes: analysis.scenes,
                      storyShots: analysis.shots,
                      status: NODE_STATUS_SUCCESS,
                      errorDetails: undefined,
                    },
                  }
                : item,
            ),
            connectionsRef.current,
          ),
        );
        message.success(
          `故事分析完成：${analysis.characters.length} 个角色，${analysis.shots.length} 个镜头`,
        );
        return analysis;
      } catch (error) {
        const errorDetails =
          error instanceof Error ? error.message : "故事分析失败";
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyAnalysisStatus: NODE_STATUS_ERROR,
                    storyGenerationStatus:
                      item.metadata?.storyGenerationStatus === NODE_STATUS_LOADING
                        ? "idle"
                        : item.metadata?.storyGenerationStatus,
                    storyAnalysisRaw: previousStoryAnalysisRaw,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return null;
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      applyPersistedNodes,
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      storyDirectorInheritedTextModel,
      storyDirectorTextModels,
    ],
  );

  const generateStoryCharacters = useCallback(
    async (node: CanvasNodeData, analysis?: StoryAnalysisResult | null) => {
      const base = nodesRef.current.find((item) => item.id === node.id) || node;
      if (!analysis && !reusableStoryDirectorAnalysis(base)) {
        message.warning(
          "故事内容或镜头数已更改，请先重新分析故事再生成角色图",
        );
        return false;
      }
      const baseCharacters =
        analysis?.characters || base.metadata?.storyCharacters || [];
      const syncedNodes = syncStoryDirectorInputMetadata(
        nodesRef.current.map((item) =>
          item.id === base.id
            ? {
                ...base,
                metadata: { ...base.metadata, storyCharacters: baseCharacters },
              }
            : item,
        ),
        connectionsRef.current,
      );
      if (syncedNodes !== nodesRef.current) {
        setNodes(syncedNodes);
        persistCanvasSnapshot(syncedNodes);
      }
      const current = syncedNodes.find((item) => item.id === base.id) || base;
      const eligibleCharacters = (
        current.metadata?.storyCharacters || []
      ).filter(
        (character) =>
          character.importance === "main" ||
          character.importance === "supporting",
      );
      const characters = eligibleCharacters.filter(
        (character) => !character.referenceNodeId && !character.assetLocked,
      );
      if (!eligibleCharacters.length) {
        message.info("未识别到可生成的角色参考图，继续生成分镜");
        return true;
      }
      if (!characters.length) {
        message.success("角色参考图已齐全，无需重复生成");
        return true;
      }
      const storyImageGenerationSource = resolveStoryImageGenerationSourceForRun(
        current,
        "character",
        syncedNodes,
      );
      if (!storyImageGenerationSource) return false;
      const storyImageGenerationNode = storyImageGenerationSource.node;
      const sourceReferences = sourceReferenceImagesForStoryDirector(
        current,
        syncedNodes,
        ["reference"],
      );
      let imageConfig: AiConfig;
      try {
        imageConfig = {
          ...buildGenerationConfig(
            effectiveConfig,
            storyImageGenerationSource.kind === "config"
              ? storyImageGenerationNode
              : undefined,
            "image",
          ),
          model:
            (storyImageGenerationSource.kind === "config"
              ? storyImageGenerationNode.metadata?.model
              : "") ||
            effectiveConfig.imageModel ||
            effectiveConfig.model ||
            defaultConfig.imageModel,
          count: "1",
          size: "16:9",
          quality: normalizeStoryImageQuality(
            current.metadata?.storyImageQuality,
            current.metadata?.storyImageQualityExplicit === true,
          ),
        };
        if (storyImageGenerationSource.kind !== "config") {
          imageConfig = applyStoryDirectorImageModel(
            imageConfig,
            current,
            storyDirectorInheritedImageModel,
            storyDirectorImageModels,
          );
        }
        imageConfig = applyActiveCanvasImageAdvancedSnapshot(
          imageConfig,
          "generate",
          undefined,
        );
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "角色图配置不可用",
        );
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return false;
      }
      if (!isAiConfigReady(imageConfig, imageConfig.model)) {
        openConfigDialog(true);
        return false;
      }
      let configuredStoryImageOperation: CanvasImageOperation;
      try {
        const resolution = await resolveStoryWorkflowImageRequest(
          imageConfig,
          sourceReferences.length > 0,
        );
        configuredStoryImageOperation = resolution.capability.operation;
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "无法解析角色图片 operation",
        );
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return false;
      }
      // Plan story-level references through the exact model capability contract —
      // the same ledger storyboard shots get: clip to the verified reference
      // capacity, retain overflow with per-candidate reasons, and fail closed
      // instead of paying for a zero-reference generate when references cannot submit.
      let characterReferenceOperation: CanvasImageOperation = configuredStoryImageOperation;
      let characterReferenceResolution = await resolveImageRequestCapability(
        imageConfig,
        characterReferenceOperation,
        "imageGeneration",
      );
      const characterReferenceSelection = selectStoryImageReferences({
        shot: CHARACTER_STAGE_REFERENCE_SHOT,
        characters: [],
        nodes: syncedNodes,
        capability: characterReferenceResolution.capability,
        otherReferences: storyReferenceCandidatesFor(current, syncedNodes),
        requestedOperation: characterReferenceOperation,
      });
      if (characterReferenceSelection.submissionPlan.state === "blocked") {
        const blockedDetails = `角色参考图无法提交：${storyImageReferenceWarningText(characterReferenceSelection) || characterReferenceSelection.submissionPlan.reasonCode}`;
        message.error(blockedDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails: blockedDetails,
                  },
                }
              : item,
          ),
        );
        return false;
      }
      characterReferenceOperation = characterReferenceSelection.submissionPlan.operation;
      if (characterReferenceOperation !== configuredStoryImageOperation) {
        characterReferenceResolution = await resolveImageRequestCapability(
          imageConfig,
          characterReferenceOperation,
          "imageGeneration",
        );
      }
      const characterReferenceDelivery = buildStoryImageReferenceDelivery(
        await persistStoryImageReferenceSelection(characterReferenceSelection),
        storyImageReferenceDeliveryOptions(characterReferenceResolution, characterReferenceOperation),
      );
      setRunningNodeId(current.id);
      applyPersistedNodes((prev) =>
        prev.map((item) =>
          item.id === current.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  storyAnalysisStatus: NODE_STATUS_SUCCESS,
                  storyGenerationStatus: NODE_STATUS_LOADING,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                },
              }
            : item,
        ),
      );
      const imageSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
      const baseX = current.position.x - imageSpec.width - 140;
      const baseY = current.position.y;
      const firstSequenceNumber = nextImageSequenceNumber(nodesRef.current);

      try {
        await runWithConcurrency(
          characters,
          STORY_DIRECTOR_IMAGE_CONCURRENCY,
          async (character, index) => {
            const references = characterReferenceDelivery.references;
            const prompt = buildStoryCharacterImagePrompt(
              character,
              current,
              references.length,
            );
            const operation: ImageRequestOperation = characterReferenceOperation;
            const requestImageConfig = applyActiveNodeImageAdvancedSnapshot(
              imageConfig,
              storyImageGenerationNode.metadata,
              operation,
            );
            const requestPreflight = await preflightImageRequest(
              requestImageConfig,
              operation,
              prompt,
              references,
              undefined,
              "imageGeneration",
              { useReferenceLabels: true },
            );
            applyPersistedNodes((prev) =>
              prev.map((item) =>
                item.id === current.id
                  ? updateStoryCharacterStatus(item, character.id, {
                      status: "generating",
                      errorDetails: undefined,
                    })
                  : item,
              ),
            );
            const characterLabel = storyCharacterDisplayName(character, index);
            const nodeId = nanoid();
            const taskId = `canvas-story-character-${nodeId}-${Date.now()}`;
            resumedImageTaskIdsRef.current.add(taskId);
            const pendingNode: CanvasNodeData = {
              id: nodeId,
              type: CanvasNodeType.Image,
              title: `角色-${characterLabel}`,
              position: {
                x: baseX,
                y: baseY + index * (imageSpec.height + 72),
              },
              width: imageSpec.width,
              height: imageSpec.height,
              metadata: {
                prompt,
                storyLabel: characterLabel,
                imageSequenceNumber: firstSequenceNumber + index,
                status: NODE_STATUS_LOADING,
                sourceImageTaskId: undefined,
                imageGenerationAttemptId: taskId,
                storyCharacterAssetKind: "turnaround_sheet",
                storyCharacterId: character.id,
                characterDerivedViewsStatus: "pending",
                ...buildImageGenerationMetadata(
                  operation,
                  requestImageConfig,
                  1,
                  references,
                ),
              },
            };
            applyPersistedGraph(
              (prev) => [...prev, pendingNode],
              (prev) => [
                ...prev,
                {
                  id: nanoid(),
                  fromNodeId: nodeId,
                  toNodeId: current.id,
                  toHandleId: "story:character",
                },
                ...characterReferenceDelivery.sourceNodeIds.map((sourceNodeId) => ({
                  id: nanoid(),
                  fromNodeId: sourceNodeId,
                  toNodeId: nodeId,
                })),
              ],
            );
            try {
              const pollTaskId = await submitCanvasImageTask(
                taskId,
                requestImageConfig,
                operation,
                prompt,
                references,
                {
                  useReferenceLabels: true,
                  onNativeTaskSubmitted: async (submitted) => {
                    const snapshot = snapshotSubmittedNativeImageTask(
                      requestPreflight.route,
                      submitted,
                      {
                        operation,
                        capabilityId: requestPreflight.capability.id,
                        resultPolicy: "exact-count",
                      },
                    );
                    await persistNativeImageTaskBindings([
                      {
                        targetId: nodeId,
                        binding: {
                          snapshot,
                          attemptId: taskId,
                          outputIndex: 0,
                        },
                      },
                    ]);
                  },
                },
              );
              const generated = await pollCanvasImageTask(pollTaskId);
              const uploaded = await uploadImage(generated.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
              const size = imageNodeSize(
                uploaded.width,
                uploaded.height,
                imageSpec.width,
              );
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === nodeId
                    ? {
                        ...item,
                        width: size.width,
                        height: size.height,
                        metadata: {
                          ...item.metadata,
                          ...imageMetadata(uploaded, generated),
                          prompt,
                          ...buildImageGenerationMetadata(
                            operation,
                            requestImageConfig,
                            1,
                            references,
                          ),
                        },
                      }
                    : item.id === current.id
                      ? updateStoryCharacterStatus(item, character.id, {
                          status: "ready",
                          referenceNodeId: nodeId,
                          referenceImageUrl: uploaded.url,
                          assetSource: "generated",
                          assetLocked: true,
                        })
                      : item,
                ),
              );
              const uploadedCharacterNode = nodesRef.current.find(
                (item) => item.id === nodeId,
              );
              if (uploadedCharacterNode)
                await deriveCharacterTurnaroundViews(uploadedCharacterNode);
            } catch (error) {
              const errorDetails = formatCanvasGenerationError(
                error,
                "角色图生成失败",
              );
              const canFallbackGenerate =
                operation === "edit" && isTransientImageLimitError(errorDetails);
              if (canFallbackGenerate) {
                try {
                  message.warning(
                    `${character.name} 图生图受限，改用文生图补齐`,
                  );
                  const fallbackTaskId = `canvas-story-char-fallback-${nodeId}-${Date.now()}`;
                  resumedImageTaskIdsRef.current.add(fallbackTaskId);
                  const pollTaskId = await submitCanvasImageTask(
                    fallbackTaskId,
                    requestImageConfig,
                    "generate",
                    prompt,
                    [],
                    {
                      useReferenceLabels: false,
                      boardRouteKey: "imageGeneration",
                    },
                  );
                  const generated = await pollCanvasImageTask(pollTaskId);
                  const uploaded = await uploadImage(
                    generated.dataUrl,
                    CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
                  );
                  const size = imageNodeSize(
                    uploaded.width,
                    uploaded.height,
                    imageSpec.width,
                  );
                  applyPersistedNodes((prev) =>
                    prev.map((item) =>
                      item.id === nodeId
                        ? {
                            ...item,
                            width: size.width,
                            height: size.height,
                            metadata: {
                              ...item.metadata,
                              ...imageMetadata(uploaded, generated),
                              prompt,
                              ...buildImageGenerationMetadata(
                                "generate",
                                requestImageConfig,
                                1,
                                [],
                              ),
                            },
                          }
                        : item.id === current.id
                          ? updateStoryCharacterStatus(item, character.id, {
                              status: "ready",
                              referenceNodeId: nodeId,
                              referenceImageUrl: uploaded.url,
                              assetSource: "generated",
                              assetLocked: true,
                            })
                          : item,
                    ),
                  );
                  resumedImageTaskIdsRef.current.delete(fallbackTaskId);
                  const uploadedCharacterNode = nodesRef.current.find(
                    (item) => item.id === nodeId,
                  );
                  if (uploadedCharacterNode)
                    await deriveCharacterTurnaroundViews(uploadedCharacterNode);
                  return;
                } catch (fallbackError) {
                  const fallbackDetails = formatCanvasGenerationError(
                    fallbackError,
                    "角色图生成失败",
                  );
                  applyPersistedNodes((prev) =>
                    prev.map((item) =>
                      item.id === nodeId
                        ? {
                            ...item,
                            metadata: {
                              ...item.metadata,
                              status: NODE_STATUS_ERROR,
                              errorDetails: fallbackDetails,
                              sourceImageTaskId: undefined,
                              imageGenerationAttemptId: undefined,
                            },
                          }
                        : item.id === current.id
                          ? updateStoryCharacterStatus(item, character.id, {
                              status: "error",
                              errorDetails: fallbackDetails,
                            })
                          : item,
                    ),
                  );
                  throw new Error(fallbackDetails);
                }
              }
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === nodeId
                    ? {
                        ...item,
                        metadata: {
                          ...item.metadata,
                          status: NODE_STATUS_ERROR,
                          errorDetails,
                          sourceImageTaskId: undefined,
                          imageGenerationAttemptId: undefined,
                        },
                      }
                    : item.id === current.id
                      ? updateStoryCharacterStatus(item, character.id, {
                          status: "error",
                          errorDetails,
                        })
                      : item,
                ),
              );
              throw new Error(errorDetails);
            } finally {
              resumedImageTaskIdsRef.current.delete(taskId);
            }
          },
        );
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_SUCCESS,
                    status: NODE_STATUS_SUCCESS,
                    errorDetails: undefined,
                  },
                }
              : item,
          ),
        );
        message.success(`已补齐 ${characters.length} 张角色图`);
        return true;
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "角色图生成失败",
        );
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return false;
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      applyPersistedGraph,
      applyPersistedNodes,
      deriveCharacterTurnaroundViews,
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      persistNativeImageTaskBindings,
      persistCanvasSnapshot,
      resolveStoryImageGenerationSourceForRun,
      storyDirectorImageModels,
      storyDirectorInheritedImageModel,
    ],
  );

  const generateStoryShots = useCallback(
    async (node: CanvasNodeData) => {
      const base = nodesRef.current.find((item) => item.id === node.id) || node;
      const syncedNodes = syncStoryDirectorInputMetadata(
        nodesRef.current,
        connectionsRef.current,
      );
      if (syncedNodes !== nodesRef.current) {
        setNodes(syncedNodes);
        persistCanvasSnapshot(syncedNodes);
      }
      const current = syncedNodes.find((item) => item.id === base.id) || base;
      const shots = current.metadata?.storyShots || [];
      if (!shots.length) {
        message.warning("请先分析故事生成分镜");
        return;
      }
      if (!reusableStoryDirectorAnalysis(current)) {
        message.warning(
          "故事内容或镜头数已更改，请先重新分析故事再生成分镜图",
        );
        return;
      }
      const storyboardMode = current.metadata?.storyStoryboardMode || "single";
      if (storyboardMode === "grid9" && shots.length % 9 !== 0) {
        message.warning("9宫格分镜模式下，镜头数必须是 9 的倍数");
        return;
      }
      const storyShotWork = selectStoryDirectorShotRetryWork({
        storyDirectorId: current.id,
        storyboardMode,
        shots,
        nodes: syncedNodes,
        connections: connectionsRef.current,
      });
      if (storyShotWork.noWork) {
        applyPersistedNodes((prev) =>
          reconcileStoryDirectorImageResults(
            prev,
            connectionsRef.current,
          ),
        );
        message.info("分镜图已齐全，无需重复生成");
        return;
      }
      const storyImageGenerationSource = resolveStoryImageGenerationSourceForRun(
        current,
        "shot",
        syncedNodes,
      );
      if (!storyImageGenerationSource) return;
      const storyImageGenerationNode = storyImageGenerationSource.node;
      const storyImageGenerationMetadata =
        storyImageGenerationSource.kind === "config"
          ? storyImageGenerationNode.metadata
          : current.metadata;
      let imageConfig: AiConfig;
      try {
        imageConfig = {
          ...buildGenerationConfig(
            effectiveConfig,
            storyImageGenerationSource.kind === "config"
              ? storyImageGenerationNode
              : undefined,
            "image",
          ),
          model:
            (storyImageGenerationSource.kind === "config"
              ? storyImageGenerationNode.metadata?.model
              : "") ||
            effectiveConfig.imageModel ||
            effectiveConfig.model ||
            defaultConfig.imageModel,
          count: "1",
          size: effectiveConfig.size,
          quality: normalizeStoryImageQuality(
            current.metadata?.storyImageQuality,
            current.metadata?.storyImageQualityExplicit === true,
          ),
        };
        if (storyImageGenerationSource.kind !== "config") {
          imageConfig = applyStoryDirectorImageModel(
            imageConfig,
            current,
            storyDirectorInheritedImageModel,
            storyDirectorImageModels,
          );
        }
        imageConfig = applyActiveCanvasImageAdvancedSnapshot(
          imageConfig,
          "generate",
          undefined,
        );
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "分镜图配置不可用",
        );
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return;
      }
      if (!isAiConfigReady(imageConfig, imageConfig.model)) {
        openConfigDialog(true);
        return;
      }
      try {
        await resolveStoryWorkflowImageRequest(imageConfig, false);
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "无法解析分镜图片 operation",
        );
        message.error(
          errorDetails,
        );
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return;
      }
      setRunningNodeId(current.id);
      applyPersistedNodes((prev) =>
        prev.map((item) =>
          item.id === current.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  storyAnalysisStatus: NODE_STATUS_SUCCESS,
                  storyGenerationStatus: NODE_STATUS_LOADING,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                },
              }
            : item,
        ),
      );
      const characterById = new Map(
        (current.metadata?.storyCharacters || []).map((character) => [
          character.id,
          character,
        ]),
      );
      const baseX = current.position.x + current.width + 560;
      const baseY = current.position.y;
      const shotNodeSize = storyDirectorShotNodeSize(imageConfig.size);
      const firstSequenceNumber = nextImageSequenceNumber(nodesRef.current);
      const shownReferenceWarnings = new Set<string>();
      const showReferenceWarningOnce = (warning: string) => {
        if (!warning || shownReferenceWarnings.has(warning)) return;
        shownReferenceWarnings.add(warning);
        message.warning(warning);
      };

      try {
        if (storyboardMode === "grid9") {
          const gridGroups = storyShotWork.workItems.map((item) => {
            if (item.mode !== "grid9") {
              throw new Error("分镜补齐计划与九宫格模式不一致");
            }
            return {
              chunkStart: item.groupIndex * 9,
              chunk: item.shots,
              groupIndex: item.groupIndex,
            };
          });
          await runWithConcurrency(
            gridGroups,
            STORY_DIRECTOR_IMAGE_CONCURRENCY,
            async ({ chunkStart, chunk, groupIndex }) => {
              const storyReferenceResolution = await resolveStoryWorkflowImageRequest(
                imageConfig,
                storyShotHasReferenceIntent(current, chunk),
              );
              const storyImageOperation = storyReferenceResolution.capability.operation;
              const referencePlan = planStoryImageReferences(
                current,
                stableFrontGridStoryShot(chunk),
                syncedNodes,
                storyReferenceResolution.capability,
                new Set(
                  chunk
                    .map((shot) => shot.sceneId)
                    .filter((sceneId): sceneId is string => Boolean(sceneId)),
                ),
                "grid9",
                chunk,
                storyImageReferenceDeliveryOptions(
                  storyReferenceResolution,
                  storyImageOperation,
                ),
              );
              const selectedReferences = referencePlan.references;
              const referenceWarning = storyImageReferenceWarningText(
                referencePlan.selection,
              );
              showReferenceWarningOnce(referenceWarning);
              const legacyReferenceLines = buildLegacyStoryReferenceLines({
                shots: chunk,
                characters: Array.from(characterById.values()),
                references: selectedReferences,
                storyReferenceIds: current.metadata?.storySourceImageNodeIds ||
                  (current.metadata?.storySourceImageNodeId ? [current.metadata.storySourceImageNodeId] : []),
                sceneReferenceIds: current.metadata?.storySceneSourceImageNodeIds,
                propReferenceIds: current.metadata?.storyPropSourceImageNodeIds,
              });
              let finalStoryReferenceResolution = storyReferenceResolution;
              const storyPromptPlan = await buildStoryImagePromptPlanForResolvedOperation({
                mode: "grid9",
                shots: chunk,
                characters: Array.from(characterById.values()),
                scenes: current.metadata?.storyScenes || [],
                style: current.metadata?.storyStyle || "电影感写实",
                aspectRatio: current.metadata?.storyAspectRatio || "16:9",
                referenceAppendix: referencePlan.selection.promptAppendix,
                legacyReferenceLines,
                references: selectedReferences,
                referenceIntent: referencePlan.selection.submissionPlan.referenceIntent,
                requestedOperation: storyImageOperation,
                submissionBlockReason: referencePlan.selection.submissionPlan.state === "blocked"
                  ? referencePlan.selection.submissionPlan.reasonCode
                  : undefined,
                routing: "imageGeneration" as const,
              }, async (operation) => {
                finalStoryReferenceResolution = await resolveImageRequestCapability(
                  imageConfig,
                  operation,
                  "imageGeneration",
                );
                return finalStoryReferenceResolution.capability;
              });
              const finalReferenceSelection = storyPromptPlan.transportAllowed
                ? await persistStoryImageReferenceSelection(referencePlan.selection)
                : referencePlan.selection;
              const storyReferenceDelivery = buildStoryImageReferenceDelivery(
                finalReferenceSelection,
                storyImageReferenceDeliveryOptions(
                  finalStoryReferenceResolution,
                  storyPromptPlan.operation,
                ),
              );
              if (!storyPromptPlan.transportAllowed) {
                throw new Error(`分镜参考图无法提交：${storyImageReferenceWarningText(referencePlan.selection) || storyPromptPlan.submissionBlockReason || "参考图合同未验证"}`);
              }
              const prompt = storyPromptPlan.prompt;
              const references = storyReferenceDelivery.references;
              const operation: ImageRequestOperation = storyPromptPlan.operation;
              const requestImageConfig = applyActiveNodeImageAdvancedSnapshot(
                imageConfig,
                storyImageGenerationNode.metadata,
                operation,
              );
              const requestPreflight = await preflightImageRequest(
                requestImageConfig,
                operation,
                prompt,
                references,
                undefined,
                storyPromptPlan.routing,
                { useReferenceLabels: false },
              );
              const nodeId = nanoid();
              const taskId = `canvas-story-grid9-${nodeId}-${Date.now()}`;
              resumedImageTaskIdsRef.current.add(taskId);
              const shotStart = chunk[0]?.index || chunkStart + 1;
              const shotEnd =
                chunk[chunk.length - 1]?.index || chunkStart + chunk.length;
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === current.id
                    ? updateStoryShotsStatus(
                        item,
                        chunk.map((shot) => shot.id),
                        { status: "generating", errorDetails: undefined },
                      )
                    : item,
                ),
              );
              const pendingNode: CanvasNodeData = {
                id: nodeId,
                type: CanvasNodeType.Image,
                title: `九宫格分镜${groupIndex + 1}`.slice(0, 48),
                position: storyDirectorGridPosition(
                  baseX,
                  baseY,
                  groupIndex,
                  shotNodeSize,
                ),
                width: shotNodeSize.width,
                height: shotNodeSize.height,
                metadata: {
                  prompt,
                  storyLabel:
                    shotStart === shotEnd
                      ? `第${shotStart}镜`
                      : `第${shotStart}-${shotEnd}镜`,
                  imageSequenceNumber: firstSequenceNumber + groupIndex,
                  storyGrid9GroupIndex: groupIndex + 1,
                  storyGrid9ShotStart: shotStart,
                  storyGrid9ShotEnd: shotEnd,
                  status: NODE_STATUS_LOADING,
                  sourceImageTaskId: undefined,
                  imageGenerationAttemptId: taskId,
                  ...buildImageGenerationMetadata(
                    operation,
                    requestImageConfig,
                    1,
                    references,
                  ),
                },
              };
              applyPersistedGraph(
                (prev) => [...prev, pendingNode],
                (prev) => [
                  ...prev,
                  { id: nanoid(), fromNodeId: current.id, toNodeId: nodeId },
                  ...storyReferenceDelivery.sourceNodeIds.map((sourceNodeId) => ({
                    id: nanoid(),
                    fromNodeId: sourceNodeId,
                    toNodeId: nodeId,
                  })),
                ],
              );
              try {
                const pollTaskId = await submitCanvasImageTask(
                  taskId,
                  requestImageConfig,
                  operation,
                  prompt,
                  references,
                  {
                    useReferenceLabels: false,
                    boardRouteKey: "imageGeneration",
                    onNativeTaskSubmitted: async (submitted) => {
                      const snapshot = snapshotSubmittedNativeImageTask(
                        requestPreflight.route,
                        submitted,
                        {
                          operation,
                          capabilityId: requestPreflight.capability.id,
                          resultPolicy: "exact-count",
                        },
                      );
                      await persistNativeImageTaskBindings([
                        {
                          targetId: nodeId,
                          binding: {
                            snapshot,
                            attemptId: taskId,
                            outputIndex: 0,
                          },
                        },
                      ]);
                    },
                  },
                );
                const generated = await pollCanvasImageTask(pollTaskId);
                const uploaded = await uploadImage(generated.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
                applyPersistedNodes((prev) =>
                  prev.map((item) =>
                    item.id === nodeId
                      ? {
                          ...item,
                          width: shotNodeSize.width,
                          height: shotNodeSize.height,
                          metadata: {
                            ...item.metadata,
                            ...imageMetadata(uploaded, generated),
                            prompt,
                            ...buildImageGenerationMetadata(
                              operation,
                              requestImageConfig,
                              1,
                              references,
                            ),
                          },
                        }
                      : item.id === current.id
                        ? updateStoryShotsStatus(
                            item,
                            chunk.map((shot) => shot.id),
                            {
                              status: "done",
                              resultNodeIds: [nodeId],
                              finalPrompt: prompt,
                            },
                          )
                        : item,
                  ),
                );
              } catch (error) {
                const errorDetails = formatCanvasGenerationError(
                  error,
                  "九宫格分镜生成失败",
                );
                applyPersistedNodes((prev) =>
                  prev.map((item) =>
                    item.id === nodeId
                      ? {
                          ...item,
                          metadata: {
                            ...item.metadata,
                            status: NODE_STATUS_ERROR,
                            errorDetails,
                            sourceImageTaskId: undefined,
                            imageGenerationAttemptId: undefined,
                          },
                        }
                      : item.id === current.id
                        ? updateStoryShotsStatus(
                            item,
                            chunk.map((shot) => shot.id),
                            { status: "error", errorDetails },
                          )
                        : item,
                  ),
                );
                throw new Error(errorDetails);
              } finally {
                resumedImageTaskIdsRef.current.delete(taskId);
              }
            },
          );
          applyPersistedNodes((prev) =>
            prev.map((item) =>
              item.id === current.id
                ? {
                    ...item,
                    metadata: {
                      ...item.metadata,
                      storyGenerationStatus: NODE_STATUS_SUCCESS,
                      status: NODE_STATUS_SUCCESS,
                    },
                  }
                : item,
            ),
          );
          message.success(`已补齐 ${gridGroups.length} 张九宫格分镜图`);
          return;
        }

        const pendingShots = storyShotWork.workItems.map((item) => {
          if (item.mode !== "single") {
            throw new Error("分镜补齐计划与逐镜模式不一致");
          }
          return item.shot;
        });
        await runWithConcurrency(
          pendingShots,
          STORY_DIRECTOR_IMAGE_CONCURRENCY,
          async (shot, workIndex) => {
            const storyReferenceResolution = await resolveStoryWorkflowImageRequest(
              imageConfig,
              storyShotHasReferenceIntent(current, [shot]),
            );
            const storyImageOperation = storyReferenceResolution.capability.operation;
            const layoutIndex = Math.max(
              0,
              shots.findIndex((candidate) => candidate.id === shot.id),
            );
            const referencePlan = planStoryImageReferences(
              current,
              shot,
              syncedNodes,
              storyReferenceResolution.capability,
              undefined,
              "single",
              undefined,
              storyImageReferenceDeliveryOptions(
                storyReferenceResolution,
                storyImageOperation,
              ),
            );
            const selectedReferences = referencePlan.references;
            const referenceWarning = storyImageReferenceWarningText(
              referencePlan.selection,
            );
            showReferenceWarningOnce(referenceWarning);
            const legacyReferenceLines = buildLegacyStoryReferenceLines({
              shots: [shot],
              characters: Array.from(characterById.values()),
              references: selectedReferences,
              storyReferenceIds: current.metadata?.storySourceImageNodeIds ||
                (current.metadata?.storySourceImageNodeId ? [current.metadata.storySourceImageNodeId] : []),
              sceneReferenceIds: current.metadata?.storySceneSourceImageNodeIds,
              propReferenceIds: current.metadata?.storyPropSourceImageNodeIds,
            });
            let finalStoryReferenceResolution = storyReferenceResolution;
            const storyPromptPlan = await buildStoryImagePromptPlanForResolvedOperation({
              mode: "single",
              shots: [shot],
              characters: Array.from(characterById.values()),
              scenes: current.metadata?.storyScenes || [],
              style: current.metadata?.storyStyle || "电影感写实",
              aspectRatio: current.metadata?.storyAspectRatio || "16:9",
              referenceAppendix: referencePlan.selection.promptAppendix,
              legacyReferenceLines,
              references: selectedReferences,
              referenceIntent: referencePlan.selection.submissionPlan.referenceIntent,
              requestedOperation: storyImageOperation,
              submissionBlockReason: referencePlan.selection.submissionPlan.state === "blocked"
                ? referencePlan.selection.submissionPlan.reasonCode
                : undefined,
              routing: "imageGeneration" as const,
            }, async (operation) => {
              finalStoryReferenceResolution = await resolveImageRequestCapability(
                imageConfig,
                operation,
                "imageGeneration",
              );
              return finalStoryReferenceResolution.capability;
            });
            const finalReferenceSelection = storyPromptPlan.transportAllowed
              ? await persistStoryImageReferenceSelection(referencePlan.selection)
              : referencePlan.selection;
            const storyReferenceDelivery = buildStoryImageReferenceDelivery(
              finalReferenceSelection,
              storyImageReferenceDeliveryOptions(
                finalStoryReferenceResolution,
                storyPromptPlan.operation,
              ),
            );
            if (!storyPromptPlan.transportAllowed) {
              throw new Error(`分镜参考图无法提交：${storyImageReferenceWarningText(referencePlan.selection) || storyPromptPlan.submissionBlockReason || "参考图合同未验证"}`);
            }
            const prompt = storyPromptPlan.prompt;
            const references = storyReferenceDelivery.references;
            const operation: ImageRequestOperation = storyPromptPlan.operation;
            const requestImageConfig = applyActiveNodeImageAdvancedSnapshot(
              imageConfig,
              storyImageGenerationNode.metadata,
              operation,
            );
            const requestPreflight = await preflightImageRequest(
              requestImageConfig,
              operation,
              prompt,
              references,
              undefined,
              storyPromptPlan.routing,
              { useReferenceLabels: false },
            );
            const nodeId = nanoid();
            const taskId = `canvas-story-shot-${nodeId}-${Date.now()}`;
            resumedImageTaskIdsRef.current.add(taskId);
            applyPersistedNodes((prev) =>
              prev.map((item) =>
                item.id === current.id
                  ? updateStoryShotStatus(item, shot.id, {
                      status: "generating",
                      errorDetails: undefined,
                    })
                  : item,
              ),
            );
            const pendingNode: CanvasNodeData = {
              id: nodeId,
              type: CanvasNodeType.Image,
              title: `镜头${shot.index}-${shot.title}`.slice(0, 48),
              position: storyDirectorGridPosition(
                baseX,
                baseY,
                layoutIndex,
                shotNodeSize,
              ),
              width: shotNodeSize.width,
              height: shotNodeSize.height,
              metadata: {
                prompt,
                storyLabel: `第${shot.index}镜`,
                imageSequenceNumber: firstSequenceNumber + workIndex,
                status: NODE_STATUS_LOADING,
                sourceImageTaskId: undefined,
                imageGenerationAttemptId: taskId,
                ...buildImageGenerationMetadata(
                  operation,
                  requestImageConfig,
                  1,
                  references,
                ),
              },
            };
            applyPersistedGraph(
              (prev) => [...prev, pendingNode],
              (prev) => [
                ...prev,
                { id: nanoid(), fromNodeId: current.id, toNodeId: nodeId },
                ...storyReferenceDelivery.sourceNodeIds.map((sourceNodeId) => ({
                  id: nanoid(),
                  fromNodeId: sourceNodeId,
                  toNodeId: nodeId,
                })),
              ],
            );
            try {
              const pollTaskId = await submitCanvasImageTask(
                taskId,
                requestImageConfig,
                operation,
                prompt,
                references,
                {
                  useReferenceLabels: false,
                  boardRouteKey: "imageGeneration",
                  onNativeTaskSubmitted: async (submitted) => {
                    const snapshot = snapshotSubmittedNativeImageTask(
                      requestPreflight.route,
                      submitted,
                      {
                        operation,
                        capabilityId: requestPreflight.capability.id,
                        resultPolicy: "exact-count",
                      },
                    );
                    await persistNativeImageTaskBindings([
                      {
                        targetId: nodeId,
                        binding: {
                          snapshot,
                          attemptId: taskId,
                          outputIndex: 0,
                        },
                      },
                    ]);
                  },
                },
              );
              const generated = await pollCanvasImageTask(pollTaskId);
              const uploaded = await uploadImage(generated.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === nodeId
                    ? {
                        ...item,
                        width: shotNodeSize.width,
                        height: shotNodeSize.height,
                        metadata: {
                          ...item.metadata,
                          ...imageMetadata(uploaded, generated),
                          prompt,
                          ...buildImageGenerationMetadata(
                            operation,
                            requestImageConfig,
                            1,
                            references,
                          ),
                        },
                      }
                    : item.id === current.id
                      ? updateStoryShotStatus(item, shot.id, {
                          status: "done",
                          resultNodeIds: [
                            ...(shot.resultNodeIds || []),
                            nodeId,
                          ],
                          finalPrompt: prompt,
                        })
                      : item,
                ),
              );
            } catch (error) {
              const errorDetails = formatCanvasGenerationError(
                error,
                "分镜图生成失败",
              );
              const canFallbackGenerate =
                operation === "edit" &&
                isTransientImageLimitError(errorDetails);
              if (canFallbackGenerate) {
                try {
                  message.warning(
                    `第${shot.index}镜图生图受限，改用文生图补齐`,
                  );
                  const fallbackTaskId = `canvas-story-shot-fallback-${nodeId}-${Date.now()}`;
                  resumedImageTaskIdsRef.current.add(fallbackTaskId);
                  const pollTaskId = await submitCanvasImageTask(
                    fallbackTaskId,
                    requestImageConfig,
                    "generate",
                    prompt,
                    [],
                    {
                      useReferenceLabels: false,
                      boardRouteKey: "imageGeneration",
                    },
                  );
                  const generated = await pollCanvasImageTask(pollTaskId);
                  const uploaded = await uploadImage(
                    generated.dataUrl,
                    CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
                  );
                  applyPersistedNodes((prev) =>
                    prev.map((item) =>
                      item.id === nodeId
                        ? {
                            ...item,
                            width: shotNodeSize.width,
                            height: shotNodeSize.height,
                            metadata: {
                              ...item.metadata,
                              ...imageMetadata(uploaded, generated),
                              prompt,
                              ...buildImageGenerationMetadata(
                                "generate",
                                requestImageConfig,
                                1,
                                [],
                              ),
                            },
                          }
                        : item.id === current.id
                          ? updateStoryShotStatus(item, shot.id, {
                              status: "done",
                              resultNodeIds: [
                                ...(shot.resultNodeIds || []),
                                nodeId,
                              ],
                              finalPrompt: prompt,
                            })
                          : item,
                    ),
                  );
                  resumedImageTaskIdsRef.current.delete(fallbackTaskId);
                  return;
                } catch (fallbackError) {
                  const fallbackDetails = formatCanvasGenerationError(
                    fallbackError,
                    "分镜图生成失败",
                  );
                  applyPersistedNodes((prev) =>
                    prev.map((item) =>
                      item.id === nodeId
                        ? {
                            ...item,
                            metadata: {
                              ...item.metadata,
                              status: NODE_STATUS_ERROR,
                              errorDetails: fallbackDetails,
                              sourceImageTaskId: undefined,
                              imageGenerationAttemptId: undefined,
                            },
                          }
                        : item.id === current.id
                          ? updateStoryShotStatus(item, shot.id, {
                              status: "error",
                              errorDetails: fallbackDetails,
                            })
                          : item,
                    ),
                  );
                  throw new Error(fallbackDetails);
                }
              }
              applyPersistedNodes((prev) =>
                prev.map((item) =>
                  item.id === nodeId
                    ? {
                        ...item,
                        metadata: {
                          ...item.metadata,
                          status: NODE_STATUS_ERROR,
                          errorDetails,
                          sourceImageTaskId: undefined,
                          imageGenerationAttemptId: undefined,
                        },
                      }
                    : item.id === current.id
                      ? updateStoryShotStatus(item, shot.id, {
                          status: "error",
                          errorDetails,
                        })
                      : item,
                ),
              );
              throw new Error(errorDetails);
            } finally {
              resumedImageTaskIdsRef.current.delete(taskId);
            }
          },
        );
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_SUCCESS,
                    status: NODE_STATUS_SUCCESS,
                    errorDetails: undefined,
                  },
                }
              : item,
          ),
        );
        message.success(`已补齐 ${pendingShots.length} 张分镜图`);
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "分镜图生成失败",
        );
        message.error(errorDetails);
        applyPersistedNodes((prev) =>
          prev.map((item) =>
            item.id === current.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    storyGenerationStatus: NODE_STATUS_ERROR,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      applyPersistedGraph,
      applyPersistedNodes,
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      persistNativeImageTaskBindings,
      persistCanvasSnapshot,
      resolveStoryImageGenerationSourceForRun,
      storyDirectorImageModels,
      storyDirectorInheritedImageModel,
    ],
  );

  const generateAllSeedance2PlaceholderVideos = useCallback(
    async (workflowNode: CanvasNodeData) => {
      const placeholders = listPendingSeedance2Placeholders(
        nodesRef.current,
        workflowNode.id,
      );
      if (!placeholders.length) {
        message.info("没有待生成的视频占位框，请先创建或刷新占位框");
        return;
      }
      setSeedance2VideoBatch({
        workflowId: workflowNode.id,
        done: 0,
        total: placeholders.length,
      });
      let done = 0;
      try {
        message.info(
          `开始生成 ${placeholders.length} 个分镜视频（浏览器单线程，逐个提交）`,
        );
        await runWithConcurrency(
          placeholders,
          STORY_DIRECTOR_VIDEO_CONCURRENCY,
          async (placeholder) => {
            await generateSeedance2VideoFromPlaceholderRef.current(placeholder);
            done += 1;
            setSeedance2VideoBatch((current) =>
              current && current.workflowId === workflowNode.id
                ? { ...current, done }
                : current,
            );
          },
        );
      } finally {
        setSeedance2VideoBatch((current) =>
          current?.workflowId === workflowNode.id ? null : current,
        );
      }
    },
    [message],
  );

  const ensureStoryDirectorVideoWorkflow = useCallback(
    (storyDirector: CanvasNodeData) => {
      const latestDirector =
        nodesRef.current.find((item) => item.id === storyDirector.id) ||
        storyDirector;
      const bound = nodesRef.current.find((node) => {
        if (node.type !== CanvasNodeType.Seedance2Workflow) return false;
        if (node.metadata?.seedanceStoryDirectorNodeId === latestDirector.id) {
          return true;
        }
        return connectionsRef.current.some(
          (connection) =>
            connection.fromNodeId === latestDirector.id &&
            connection.toNodeId === node.id,
        );
      });
      if (bound) return bound;
      const workflows = nodesRef.current.filter(
        (node) => node.type === CanvasNodeType.Seedance2Workflow,
      );
      if (workflows.length === 1) return workflows[0];
      if (workflows.length > 1) {
        message.warning("画布中有多个视频工作流，请连接其中一个后再生成视频");
        return null;
      }
      const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Seedance2Workflow];
      createSeedance2Workflow({
        x: latestDirector.position.x + latestDirector.width / 2,
        y: latestDirector.position.y + latestDirector.height + spec.height / 2 + 160,
      });
      return (
        nodesRef.current.find(
          (node) => node.type === CanvasNodeType.Seedance2Workflow,
        ) || null
      );
    },
    [createSeedance2Workflow, message],
  );

  const runStoryDirectorAll = useCallback(
    async (node: CanvasNodeData) => {
      const current =
        nodesRef.current.find((item) => item.id === node.id) || node;
      const analysis = await analyzeStoryDirector(current);
      if (!analysis) return;
      const latest =
        nodesRef.current.find((item) => item.id === node.id) || node;
      const charactersReady = await generateStoryCharacters(latest, analysis);
      if (!charactersReady) return;
      const afterCharacters =
        nodesRef.current.find((item) => item.id === node.id) || latest;
      await generateStoryShots(afterCharacters);
      const afterShots =
        nodesRef.current.find((item) => item.id === afterCharacters.id) ||
        afterCharacters;
      const pendingShots = (afterShots.metadata?.storyShots || []).filter(
        (shot) =>
          shot.status !== "done" && !(shot.resultNodeIds || []).length,
      );
      if (pendingShots.length) {
        message.warning(
          `还有 ${pendingShots.length} 个分镜未完成，正在等待后自动补齐`,
        );
        await sleep(12_000);
        const retryNode =
          nodesRef.current.find((item) => item.id === afterShots.id) ||
          afterShots;
        await generateStoryShots(retryNode);
      }
      const readyDirector =
        nodesRef.current.find((item) => item.id === afterShots.id) ||
        afterShots;
      const readyShots = (readyDirector.metadata?.storyShots || []).filter(
        (shot) =>
          shot.status === "done" || (shot.resultNodeIds || []).length > 0,
      );
      if (!readyShots.length) {
        message.warning("没有完成的分镜图，已跳过视频工作流");
        return;
      }
      const workflow = ensureStoryDirectorVideoWorkflow(readyDirector);
      if (!workflow) return;
      await rebuildSeedance2Placeholders(workflow);
      const latestWorkflow =
        nodesRef.current.find((item) => item.id === workflow.id) || workflow;
      await generateAllSeedance2PlaceholderVideos(latestWorkflow);
    },
    [
      analyzeStoryDirector,
      applyPersistedNodes,
      ensureStoryDirectorVideoWorkflow,
      generateAllSeedance2PlaceholderVideos,
      generateStoryCharacters,
      generateStoryShots,
      message,
      rebuildSeedance2Placeholders,
    ],
  );

  const createImageReversePromptNodes = useCallback(
    (node: CanvasNodeData) => {
      if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
        message.warning("图片节点为空，无法反推提示词");
        return;
      }

      const gap = 96;
      const textSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
      const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
      const centerY = node.position.y + node.height / 2;
      const textNode = {
        ...createCanvasNode(
          CanvasNodeType.Text,
          {
            x: node.position.x + node.width + gap + textSpec.width / 2,
            y: centerY,
          },
          {
            content: IMAGE_PROMPT_REVERSE_PRESET,
            prompt: IMAGE_PROMPT_REVERSE_PRESET,
            status: NODE_STATUS_SUCCESS,
            fontSize: 14,
          },
        ),
        title: "反推提示词",
      };
      const configNode = {
        ...createCanvasNode(
          CanvasNodeType.Config,
          {
            x:
              textNode.position.x + textNode.width + gap + configSpec.width / 2,
            y: centerY,
          },
          {
            generationMode: "text",
            ...defaultCanvasProviderModelMetadata(effectiveConfig, "text"),
            count: 1,
            composerContent: `参考图片：@[node:${node.id}]\n任务说明：@[node:${textNode.id}]`,
          },
        ),
        title: "反推提示词配置",
      };

      setNodes((prev) => [...prev, textNode, configNode]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: configNode.id },
        { id: nanoid(), fromNodeId: textNode.id, toNodeId: configNode.id },
      ]);
      setSelectedNodeIds(new Set([configNode.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(configNode.id);
      setContextMenu(null);
    },
    [effectiveConfig.model, effectiveConfig.textModel, message],
  );

  const cropImageNode = useCallback(
    async (node: CanvasNodeData, crop: CanvasImageCropRect) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      const cropped = await cropDataUrl(node.metadata.content, crop);
      const image = await uploadImage(cropped, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
      const width = Math.min(node.width, Math.max(220, image.width));
      const childId = nanoid();
      const child: CanvasNodeData = {
        id: childId,
        type: CanvasNodeType.Image,
        title: "Cropped Image",
        position: { x: node.position.x + node.width + 96, y: node.position.y },
        width,
        height: width * (image.height / image.width),
        metadata: {
          ...imageMetadata(image),
          imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
          prompt: node.metadata?.prompt,
        },
      };
      setNodes((prev) => [...prev, child]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setDialogNodeId(childId);
      setCropNodeId(null);
    },
    [touchNodeImage],
  );

  const layerEditImageNode = useCallback(
    async (node: CanvasNodeData, payload: CanvasImageLayerEditPayload) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      const image = await uploadImage(payload.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
      const size = imageNodeSize(image.width, image.height, node.width);
      const childId = nanoid();
      const child: CanvasNodeData = {
        id: childId,
        type: CanvasNodeType.Image,
        title: "图层合成",
        position: { x: node.position.x + node.width + 96, y: node.position.y },
        width: size.width,
        height: size.height,
        metadata: {
          ...imageMetadata(image),
          imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
          prompt: node.metadata?.prompt,
        },
      };
      setNodes((prev) => [...prev, child]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setSelectedConnectionId(null);
      setDialogNodeId(childId);
      setLayerEditNodeId(null);
      message.success("已生成图层合成图");
    },
    [message, touchNodeImage],
  );

  const saveSeedance2FaceEditImageNode = useCallback(
    async (
      node: CanvasNodeData,
      payload: CanvasSeedance2FaceEditPayload,
    ): Promise<void> => {
      if (!payload.dataUrl) {
        const error = new Error("人脸迁移结果为空，无法保存");
        message.error(error.message);
        throw error;
      }
      try {
        touchNodeImage(node);
        const originalStorageKey =
          node.metadata?.seedance2FaceEditOriginal?.storageKey ||
          node.metadata?.storageKey;
        if (originalStorageKey) {
          await setStoredImagesRetained([originalStorageKey], true);
        }
        const uploaded = await uploadImage(payload.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
        const metadata = imageMetadata(uploaded);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? createSeedance2FaceEditOriginalBackup(item, {
                  ...metadata,
                  prompt: item.metadata?.prompt,
                  imageSequenceNumber:
                    item.metadata?.imageSequenceNumber ??
                    nextImageSequenceNumber(nodesRef.current),
                })
              : item,
          ),
        );
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setSeedance2FaceEditNodeId(null);
        message.success("已合并并替换原图");
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Seedance2 人脸迁移保存失败";
        message.error(errorMessage);
        throw (error instanceof Error ? error : new Error(errorMessage));
      }
    },
    [message, touchNodeImage],
  );

  const restoreSeedance2FaceEditOriginalImageNode = useCallback(
    async (node: CanvasNodeData) => {
      const originalMetadata = node.metadata?.seedance2FaceEditOriginal;
      if (!originalMetadata) {
        message.warning("未找到 Seedance2 原图记录");
        return;
      }
      try {
        const restoreOverrides: Parameters<typeof restoreSeedance2FaceEditOriginalNode>[1] = {};
        if (originalMetadata.storageKey) {
          await setStoredImagesRetained([originalMetadata.storageKey], true);
          const resolvedContent = await resolveImageUrl(
            originalMetadata.storageKey,
            originalMetadata.content || "",
          );
          if (resolvedContent) restoreOverrides.content = resolvedContent;
        }
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? restoreSeedance2FaceEditOriginalNode(item, restoreOverrides)
              : item,
          ),
        );
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        message.success("已还原 Seedance2 原图");
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Seedance2 原图还原失败";
        message.error(errorMessage);
      }
    },
    [message],
  );

  const splitImageNode = useCallback(
    async (node: CanvasNodeData, params: CanvasImageSplitParams) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      setSplitNodeId(null);
      const pieces = await splitDataUrl(node.metadata.content, params);
      const sourceWidth = pieces[0]?.sourceWidth || 1;
      const sourceHeight = pieces[0]?.sourceHeight || 1;
      const scale = Math.min(
        node.width / sourceWidth,
        node.height / sourceHeight,
      );
      const startX = node.position.x + node.width + 96;
      const startY = node.position.y;
      let nextSequenceNumber = nextImageSequenceNumber(nodesRef.current);
      const childNodes = await Promise.all(
        pieces.map(async (piece) => {
          const image = await uploadImage(piece.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
          const id = nanoid();
          return {
            id,
            type: CanvasNodeType.Image,
            title: `${node.title || "图片"} ${piece.row + 1}-${piece.column + 1}`,
            position: {
              x: startX + Math.round(piece.x * scale),
              y: startY + Math.round(piece.y * scale),
            },
            width: Math.max(1, Math.round(piece.width * scale)),
            height: Math.max(1, Math.round(piece.height * scale)),
            metadata: {
              ...imageMetadata(image),
              imageSequenceNumber: nextSequenceNumber++,
              prompt: node.metadata?.prompt,
            },
          } satisfies CanvasNodeData;
        }),
      );
      setNodes((prev) => [...prev, ...childNodes]);
      setConnections((prev) => [
        ...prev,
        ...childNodes.map((child) => ({
          id: nanoid(),
          fromNodeId: node.id,
          toNodeId: child.id,
        })),
      ]);
      setSelectedNodeIds(new Set(childNodes.map((child) => child.id)));
      setSelectedConnectionId(null);
      setDialogNodeId(null);
      message.success(`已切分为 ${childNodes.length} 个子节点`);
    },
    [message, touchNodeImage],
  );

  const maskEditImageNode = useCallback(
    async (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      const baseGenerationConfig = {
        ...buildGenerationConfig(effectiveConfig, node, "image"),
        count: "1",
        size: node.metadata?.size || "auto",
      };
      let generationConfig: AiConfig;
      try {
        generationConfig = applyActiveNodeImageAdvancedSnapshot(
          baseGenerationConfig,
          node.metadata,
          "edit",
        );
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "局部编辑配置校验失败"));
        return;
      }
      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        return;
      }
      let resolvedMaskCapability: ResolvedImageModelCapability;
      try {
        resolvedMaskCapability = (
          await resolveImageRequestCapability(
            generationConfig,
            "edit",
            "imageGeneration",
          )
        ).capability;
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "局部编辑配置校验失败"));
        return;
      }
      const maskCapabilityError = canvasResolvedMaskEditCapabilityError(
        resolvedMaskCapability,
      );
      if (maskCapabilityError) {
        message.error(maskCapabilityError);
        return;
      }
      const userPrompt = payload.prompt.trim();
      const prompt = `只修改蒙版透明区域，其他区域保持不变。${userPrompt}`;
      const childId = nanoid();
      const source = {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
        url: node.metadata.backendUrl,
      };
      let uploadedMask: UploadedImage;
      try {
        uploadedMask = await uploadImage(
          payload.maskDataUrl,
          CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
        );
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "蒙版保存失败"));
        return;
      }
      const maskMetadata = buildCanvasMaskReferenceMetadata(
        uploadedMask,
        `${node.title || node.id}-mask.png`,
      );
      const maskReference: ReferenceImage = {
        id: `${node.id}-mask`,
        name: maskMetadata.name,
        type: maskMetadata.type,
        dataUrl: uploadedMask.url,
        storageKey: maskMetadata.storageKey,
      };
      const generationMetadata = buildImageGenerationMetadata(
        "edit",
        generationConfig,
        1,
        [source],
      );
      try {
        await preflightImageRequest(generationConfig, "edit", payload.prompt, [source], maskReference, "imageGeneration");
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "图片编辑配置校验失败"));
        return;
      }
      setMaskEditNodeId(null);
      setRunningNodeId(childId);
      setNodes((prev) => [
        ...prev,
        {
          id: childId,
          type: CanvasNodeType.Image,
          title: userPrompt.slice(0, 32) || "局部编辑结果",
          position: {
            x: node.position.x + node.width + 96,
            y: node.position.y,
          },
          width: node.width,
          height: node.height,
          metadata: {
            prompt,
            imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
            status: NODE_STATUS_LOADING,
            imageEditMask: maskMetadata,
            ...generationMetadata,
          },
        },
      ]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setSelectedConnectionId(null);
      setDialogNodeId(childId);
      try {
        const taskId = `canvas-${childId}`;
        const pollTaskId = await submitCanvasImageTask(taskId, generationConfig, "edit", prompt, [source], {
          mask: maskReference,
        });
        const image = await pollCanvasImageTask(pollTaskId);
        const uploaded = await uploadImage(image.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
        const size = imageNodeSize(uploaded.width, uploaded.height, node.width);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  width: size.width,
                  height: size.height,
                  metadata: {
                    ...item.metadata,
                    ...imageMetadata(uploaded, image),
                    prompt,
                    ...generationMetadata,
                  },
                }
              : item,
          ),
        );
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(error, "局部修改失败");
        message.error(errorDetails);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      touchNodeImage,
    ],
  );

  const aiUpscaleImageNode = useCallback(
    async (node: CanvasNodeData, params: CanvasImageUpscaleParams) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      setUpscaleNodeId(null);
      const baseGenerationConfig = {
        ...buildGenerationConfig(effectiveConfig, node, "image"),
        count: "1",
        quality: params.quality,
        size: params.size || "auto",
      };
      let generationConfig: AiConfig;
      try {
        generationConfig = applyActiveNodeImageAdvancedSnapshot(
          baseGenerationConfig,
          node.metadata,
          "edit",
        );
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "AI 高清放大配置校验失败"));
        return;
      }
      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        return;
      }

      const childId = nanoid();
      const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
      const source = {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
        url: node.metadata.backendUrl,
      };
      const prompt =
        "以参考图为准进行 AI 高清放大和超分修复。保持原图主体、构图、姿态、颜色关系、画面风格和比例一致，不要新增无关元素，不要改变人物身份或物体形状。提升清晰度、边缘细节、材质纹理和整体画质，修复模糊、噪点、压缩痕迹和低分辨率问题，输出自然真实的高清版本。";
      const generationMetadata = buildImageGenerationMetadata(
        "edit",
        generationConfig,
        1,
        [source],
      );

      try {
        await preflightImageRequest(generationConfig, "edit", prompt, [source], undefined, "imageGeneration");
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "图片编辑配置校验失败"));
        return;
      }

      setRunningNodeId(childId);
      setNodes((prev) => [
        ...prev,
        {
          id: childId,
          type: CanvasNodeType.Image,
          title: "AI 高清放大",
          position: {
            x: node.position.x + node.width + 96,
            y: node.position.y,
          },
          width: imageConfig.width,
          height: imageConfig.height,
          metadata: {
            prompt,
            imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
            status: NODE_STATUS_LOADING,
            ...generationMetadata,
          },
        },
      ]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setSelectedConnectionId(null);
      setDialogNodeId(childId);

      try {
        const taskId = `canvas-${childId}`;
        const pollTaskId = await submitCanvasImageTask(taskId, generationConfig, "edit", prompt, [source]);
        const image = await pollCanvasImageTask(pollTaskId);
        const uploaded = await uploadImage(image.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
        const size = imageNodeSize(
          uploaded.width,
          uploaded.height,
          imageConfig.width,
        );
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  width: size.width,
                  height: size.height,
                  metadata: {
                    ...item.metadata,
                    ...imageMetadata(uploaded, image),
                    prompt,
                    ...generationMetadata,
                  },
                }
              : item,
          ),
        );
        message.success("已生成 AI 高清放大图");
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(
          error,
          "AI 高清放大失败",
        );
        message.error(errorDetails);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      touchNodeImage,
    ],
  );

  const generateAngleNode = useCallback(
    async (node: CanvasNodeData, params: CanvasImageAngleParams) => {
      if (!node.metadata?.content) return;
      touchNodeImage(node);
      const baseGenerationConfig = {
        ...buildGenerationConfig(effectiveConfig, node, "image"),
        count: "1",
      };
      let generationConfig: AiConfig;
      try {
        generationConfig = applyActiveNodeImageAdvancedSnapshot(
          baseGenerationConfig,
          node.metadata,
          "edit",
        );
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "图片编辑配置校验失败"));
        return;
      }
      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        return;
      }
      const childId = nanoid();
      const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
      const title = buildAngleLabel(params);
      const prompt = buildAnglePrompt(params);
      const source = {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
        url: node.metadata.backendUrl,
      };
      const generationMetadata = buildImageGenerationMetadata(
        "edit",
        generationConfig,
        1,
        [source],
      );
      try {
        await preflightImageRequest(generationConfig, "edit", prompt, [source], undefined, "imageGeneration");
      } catch (error) {
        message.error(formatCanvasGenerationError(error, "图片编辑配置校验失败"));
        return;
      }
      setAngleNodeId(null);
      setRunningNodeId(childId);
      setNodes((prev) => [
        ...prev,
        {
          id: childId,
          type: CanvasNodeType.Image,
          title,
          position: {
            x: node.position.x + node.width + 96,
            y: node.position.y,
          },
          width: imageConfig.width,
          height: imageConfig.height,
          metadata: {
            prompt,
            imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
            status: NODE_STATUS_LOADING,
            ...generationMetadata,
          },
        },
      ]);
      setConnections((prev) => [
        ...prev,
        { id: nanoid(), fromNodeId: node.id, toNodeId: childId },
      ]);
      setSelectedNodeIds(new Set([childId]));
      setDialogNodeId(childId);
      try {
        const taskId = `canvas-${childId}`;
        const pollTaskId = await submitCanvasImageTask(taskId, generationConfig, "edit", prompt, [source]);
        const image = await pollCanvasImageTask(pollTaskId);
        const uploaded = await uploadImage(image.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
        const size = imageNodeSize(
          uploaded.width,
          uploaded.height,
          imageConfig.width,
        );
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  width: size.width,
                  height: size.height,
                  metadata: {
                    ...item.metadata,
                    ...imageMetadata(uploaded, image),
                    prompt,
                    ...generationMetadata,
                  },
                }
              : item,
          ),
        );
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(error);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === childId
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
      } finally {
        setRunningNodeId(null);
      }
    },
    [
      effectiveConfig,
      isAiConfigReady,
      message,
      openConfigDialog,
      touchNodeImage,
    ],
  );

  const copyNodePrompt = useCallback(
    (node: CanvasNodeData) => {
      const prompt = node.metadata?.prompt?.trim();
      if (!prompt) {
        message.warning("暂无可复制的提示词");
        return;
      }
      void navigator.clipboard
        ?.writeText(prompt)
        .then(() => message.success("提示词已复制"))
        .catch(() => message.error("复制失败，请手动复制"));
    },
    [message],
  );

  const generateImageFromTextNodeRef = useRef<(node: CanvasNodeData) => void>(
    () => {},
  );
  const handleUploadRequestRef = useRef<
    (nodeId?: string, position?: Position) => void
  >(() => {});
  const handleFontSizeChangeRef = useRef<
    (nodeId: string, fontSize: number) => void
  >(() => {});
  const handleRetryNodeRef = useRef<(node: CanvasNodeData) => void>(() => {});

  const buildContextMenuGroups = useCallback(
    (menu: ContextMenuState): CanvasContextMenuGroup[] => {
      if (menu.type === "connection") {
        const connection = connectionsRef.current.find(
          (item) => item.id === menu.connectionId,
        );
        const source = connection
          ? nodesRef.current.find((node) => node.id === connection.fromNodeId)
          : undefined;
        const target = connection
          ? nodesRef.current.find((node) => node.id === connection.toNodeId)
          : undefined;
        const targetIsVideoGeneration = Boolean(
          target &&
            (target.type === CanvasNodeType.Video ||
              (target.type === CanvasNodeType.Config &&
                target.metadata?.generationMode === "video")),
        );
        const targetVideoSnapshotLocked = Boolean(
          target?.type === CanvasNodeType.Video &&
            isVideoTaskSnapshotLocked(target.metadata),
        );
        const targetCapability = targetIsVideoGeneration && target
          ? (() => {
              const config = buildGenerationConfig(effectiveConfig, target, "video");
              const scope = resolveVideoGenerationSettingsScope(
                config,
                target.metadata?.videoGenerationScope?.operation || "text-to-video",
              );
              const provider = config.apiRelays.find((item) => item.id === scope.providerId);
              return resolveCanvasVideoModelCapability(config, scope.model, provider);
            })()
          : null;
        const targetOperation = target && targetCapability
          ? resolveStandaloneVideoOperation({
              capability: targetCapability,
              persistedOperation: target.metadata?.videoGenerationScope?.operation,
              hasConnectedImage: buildNodeGenerationInputs(
                target.id,
                nodesRef.current,
                connectionsRef.current,
              ).some((input) => Boolean(input.image)) || source?.type === CanvasNodeType.Image,
            })
          : target?.metadata?.videoGenerationScope?.operation;
        const capabilityKnown = Boolean(
          targetCapability &&
            !targetCapability.requiresExplicitProfile &&
            targetCapability.id !== "dashscope-unknown" &&
            targetCapability.id !== "ark-unknown" &&
            targetCapability.id !== "civitai-unknown",
        );
        const targetVideoSlotContract = targetCapability && target
          ? (() => {
              const inputs = buildNodeGenerationInputs(
                target.id,
                nodesRef.current,
                connectionsRef.current,
              );
              return resolveVideoReferenceSlotContract({
                capability: targetCapability,
                operation: targetOperation,
                references: inputs.flatMap((input) => input.image ? [input.image] : []),
                videos: inputs.flatMap((input) => input.video ? [input.video] : []),
              });
            })()
          : null;
        const allowedVideoPurposes = new Set(
          targetVideoSlotContract && (
            targetVideoSlotContract.state !== "blocked" || targetVideoSlotContract.recoverable
          )
            ? targetVideoSlotContract.videoSlots.map((slot) => slot.useAs)
            : [],
        );
        const currentVideoPurpose = connection?.videoUseAs || "reference_video";
        const connectedVideoCount = connection
          ? connectionsRef.current.filter((item) => {
              if (item.toNodeId !== connection.toNodeId) return false;
              return nodesRef.current.find((node) => node.id === item.fromNodeId)?.type === CanvasNodeType.Video;
            }).length
          : 0;
        const videoSlot = targetVideoSlotContract?.videoSlots[0];
        const videoSlotNotice = targetVideoSlotContract?.reason
          ? targetVideoSlotContract.reason
          : videoSlot
            ? videoSlot.maximum === null
              ? `至少 ${videoSlot.minimum} 个 · 官方未公布上限`
              : `需要 ${videoSlot.minimum}..${videoSlot.maximum} 个 · 剩余 ${Math.max(0, videoSlot.maximum - connectedVideoCount)}`
            : capabilityKnown ? "当前 operation 不接收视频" : "目标模型或 operation 待确定";
        const setVideoPurpose = (
          videoUseAs: "reference_video" | "first_clip" | "source_video",
        ) => {
          if (targetVideoSnapshotLocked) {
            message.warning("该视频任务已提交或完成，不能改变其引用用途；idle 占位仍可编辑");
            return;
          }
          if (!allowedVideoPurposes.has(videoUseAs)) {
            message.warning("当前视频 operation 不接受该引用用途；旧连线已保留但不会作为可提交用途修改");
            return;
          }
          setConnections((prev) =>
            prev.map((item) =>
              item.id === menu.connectionId ? { ...item, videoUseAs } : item,
            ),
          );
        };
        const allowedImagePurposes = source?.type === CanvasNodeType.Image && targetCapability && target
          ? (() => {
              const otherConnections = connectionsRef.current.filter((item) => item.id !== menu.connectionId);
              const inputs = buildNodeGenerationInputs(target.id, nodesRef.current, otherConnections);
              const contract = resolveVideoReferenceSlotContract({
                capability: targetCapability,
                operation: targetOperation,
                references: inputs.flatMap((input) => input.image ? [input.image] : []),
                videos: inputs.flatMap((input) => input.video ? [input.video] : []),
              });
              return new Set([
                ...contract.visibleImageSlotPurposes,
                ...(contract.nextImageConnectionPurpose ? [contract.nextImageConnectionPurpose] : []),
              ]);
            })()
          : new Set<Seedance2ReferenceSlotUseAs>();
        const setImagePurpose = (useAs: Seedance2ReferenceSlotUseAs) => {
          if (targetVideoSnapshotLocked) {
            message.warning("该视频任务已提交或完成，不能改变其引用用途；idle 占位仍可编辑");
            return;
          }
          setConnections((prev) =>
            prev.map((item) =>
              item.id === menu.connectionId
                ? { ...item, useAs, referenceUseAsExplicit: true, referenceOrigin: "manual" }
                : item,
            ),
          );
        };
        return [
          {
            items: [
              ...(source?.type === CanvasNodeType.Image
                ? ([
                    ["first_frame", "首帧"],
                    ["last_frame", "尾帧"],
                    ["keyframe", "中间关键帧"],
                    ["reference_image", "普通参考图"],
                  ] as const).flatMap(([purpose, label]) =>
                    allowedImagePurposes.has(purpose)
                      ? [{
                          id: `image-purpose-${purpose}`,
                          label: `图片用途：${label}${connection?.useAs === purpose ? "（当前）" : ""}`,
                          disabled: targetVideoSnapshotLocked,
                          onClick: () => setImagePurpose(purpose),
                        }]
                      : [],
                  )
                : []),
              ...(source?.type === CanvasNodeType.Video
                ? ([
                    ["reference_video", "普通参考"],
                    ["first_clip", "续写首段"],
                    ["source_video", "编辑源视频"],
                  ] as const).flatMap(([purpose, label]) => {
                    const allowed = allowedVideoPurposes.has(purpose);
                    const current = currentVideoPurpose === purpose;
                    if (!allowed && !current) return [];
                    const reason = capabilityKnown
                      ? `${targetCapability?.label || "当前模型"} 不支持`
                      : "目标视频模型待确定";
                    return [{
                      id: `video-purpose-${purpose}`,
                      label: `视频用途：${label}${current ? "（当前）" : ""} · ${videoSlotNotice}${!allowed ? ` · ${reason}` : !capabilityKnown ? " · 目标模型待确定" : ""}`,
                      disabled: !allowed || targetVideoSnapshotLocked,
                      onClick: () => setVideoPurpose(purpose),
                    }];
                  })
                : []),
              {
                id: "delete-connection",
                label: "删除连线",
                icon: <Trash2 className="size-4" />,
                danger: true,
                onClick: () => deleteConnection(menu.connectionId),
              },
            ],
          },
        ];
      }

      if (menu.type === "selection") {
        const selectedImages = nodesRef.current.filter(
          (item) =>
            menu.nodeIds.includes(item.id) &&
            item.type === CanvasNodeType.Image &&
            Boolean(item.metadata?.content),
        );
        const compactMenuItems = (
          entries: Array<CanvasContextMenuItem | null>,
        ) =>
          entries.filter((entry): entry is CanvasContextMenuItem =>
            Boolean(entry),
          );
        const closeSelectionMenu = () => {
          setContextMenu(null);
          setSelectedNodeIds(new Set(selectedImages.map((item) => item.id)));
          setSelectedConnectionId(null);
        };
        const action = (run: () => void) => () => {
          closeSelectionMenu();
          run();
        };
        const supportedImageOperations = new Set(
          resolveCanvasImageOperationOptions(
            effectiveConfig,
            selectedImages.length,
            { compatibleOnly: true },
          ).map((option) => option.value),
        );
        const supportsGenerateReferences = supportedImageOperations.has("generate");
        const supportsEditReferences = supportedImageOperations.has("edit");
        const item = (
          id: string,
          label: string,
          icon: React.ReactNode | undefined,
          run: () => void,
          options?: Pick<
            CanvasContextMenuItem,
            "danger" | "disabled" | "shortcut" | "submenu" | "children"
          >,
        ): CanvasContextMenuItem => ({
          id,
          label,
          icon,
          onClick: action(run),
          ...options,
        });
        const submenu = (
          id: string,
          label: string,
          children: Array<CanvasContextMenuItem | null>,
          icon?: React.ReactNode,
        ): CanvasContextMenuItem | null => {
          const compactChildren = compactMenuItems(children);
          if (!compactChildren.length) return null;
          return {
            id,
            label,
            icon,
            onClick: () => undefined,
            children: compactChildren,
          };
        };
        if (selectedImages.length < 2) return [];
        return [
          {
            items: compactMenuItems([
              submenu(
                "compare",
                "对比查看",
                [
                  item(
                    "compare-side",
                    "左右对比",
                    <Columns2 className="size-4" />,
                    () => openImageCompare(selectedImages.slice(0, 2)),
                    { disabled: selectedImages.length < 2 },
                  ),
                  item(
                    "compare-grid",
                    "宫格对比",
                    <Grid2x2 className="size-4" />,
                    () => openImageCompare(selectedImages),
                  ),
                  item(
                    "compare-zoom",
                    "同步放大查看",
                    <ZoomIn className="size-4" />,
                    () => openImageCompare(selectedImages),
                  ),
                ],
                <Columns2 className="size-4" />,
              ),
              submenu(
                "batch",
                "批量操作",
                [
                  item(
                    "batch-download",
                    "批量下载",
                    <Download className="size-4" />,
                    () => downloadSelectedImages(selectedImages),
                  ),
                  item(
                    "batch-save",
                    "批量存素材",
                    <FolderPlus className="size-4" />,
                    () => void saveSelectedImages(selectedImages),
                    { disabled: assetHydrationStatus !== "ready" },
                  ),
                  item(
                    "batch-retain",
                    "批量保留",
                    <Pin className="size-4" />,
                    () => void retainSelectedImages(selectedImages),
                  ),
                  item(
                    "batch-delete",
                    "批量删除",
                    <Trash2 className="size-4" />,
                    () =>
                      requestDeleteNodes(
                        new Set(selectedImages.map((image) => image.id)),
                      ),
                    { danger: true },
                  ),
                ],
                <FolderPlus className="size-4" />,
              ),
              submenu(
                "ai-create",
                "AI 创作",
                [
                  ...(supportsEditReferences
                    ? [item(
                        "create-reference",
                        "作为参考图新建编辑",
                        <ImageIcon className="size-4" />,
                        () => createReferenceGenerationFromImages(selectedImages, {
                          imageOperation: "edit",
                        }),
                      )]
                    : []),
                  item(
                    "story-director",
                    "故事导演节点",
                    <Clapperboard className="size-4" />,
                    () => createStoryDirectorFromImages(selectedImages),
                  ),
                  ...(supportsEditReferences ? [item(
                    "regen-style",
                    "保持风格重绘",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        preserveStyleRegenerationPreset(),
                      ),
                  )] : []),
                  ...(supportsEditReferences ? [item(
                    "regen-composition",
                    "保持构图重绘",
                    <LayoutGrid className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        preserveCompositionRegenerationPreset(),
                      ),
                  )] : []),
                  ...(supportsEditReferences ? [item(
                    "regen-prompt",
                    "指定 Prompt 生成",
                    <MessageSquare className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        promptedReferenceGenerationPreset(),
                      ),
                  )] : []),
                ],
                <Sparkles className="size-4" />,
              ),
              submenu(
                "image-enhance",
                "图片增强",
                supportsEditReferences ? [
                  item(
                    "upscale-2x",
                    "AI 高清放大",
                    <ZoomIn className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        enhancePreset(
                          "AI 高清放大",
                          "提升清晰度、边缘细节、材质纹理和整体画质，修复轻微模糊与压缩痕迹。",
                          "medium",
                        ),
                      ),
                  ),
                  item(
                    "upscale-4x",
                    "AI 4K 修复",
                    <ZoomIn className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        enhancePreset(
                          "AI 4K 修复",
                          "大幅提升细节密度、边缘锐度、材质纹理和高频细节，修复低分辨率、模糊、压缩噪点和细节断裂。",
                          "high",
                        ),
                      ),
                  ),
                  item(
                    "denoise",
                    "AI 去噪增强",
                    <WandSparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        enhancePreset(
                          "AI 去噪增强",
                          "去除噪点、脏污、压缩块和不自然颗粒，同时保留真实纹理、边缘结构和自然光影。",
                          "high",
                        ),
                      ),
                  ),
                ] : [],
                <ZoomIn className="size-4" />,
              ),
              submenu(
                "image-outpaint",
                "画面扩展",
                supportsEditReferences ? [
                  item(
                    "outpaint-1-1",
                    "扩展为 1:1",
                    <Maximize2 className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        outpaintPreset("1:1"),
                      ),
                  ),
                  item(
                    "outpaint-16-9",
                    "扩展为 16:9",
                    <Maximize2 className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        outpaintPreset("16:9"),
                      ),
                  ),
                  item(
                    "outpaint-9-16",
                    "扩展为 9:16",
                    <Maximize2 className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        outpaintPreset("9:16"),
                      ),
                  ),
                  item(
                    "outpaint-custom",
                    "自定义比例",
                    <Settings2 className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        outpaintPreset("auto"),
                      ),
                  ),
                ] : [],
                <Maximize2 className="size-4" />,
              ),
              submenu(
                "style-transfer",
                "风格迁移",
                supportsEditReferences ? [
                  item(
                    "style-real",
                    "写实风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "写实风格",
                          "高质量写实摄影风格，真实自然的材质、光影、景深和色彩",
                        ),
                      ),
                  ),
                  item(
                    "style-anime",
                    "动漫风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "动漫风格",
                          "精致动漫插画风格，清晰线条、干净色块、柔和光影和角色化表现",
                        ),
                      ),
                  ),
                  item(
                    "style-cinematic",
                    "电影风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "电影风格",
                          "电影剧照风格，富有层次的布光、镜头感、色彩分级和叙事氛围",
                        ),
                      ),
                  ),
                  item(
                    "style-illustration",
                    "插画风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "插画风格",
                          "精致商业插画风格，统一笔触、清晰形体、设计感构图和丰富细节",
                        ),
                      ),
                  ),
                  item(
                    "style-watercolor",
                    "水彩风格",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "水彩风格",
                          "透明水彩绘画风格，柔和边缘、纸张肌理、自然晕染和轻盈色彩",
                        ),
                      ),
                  ),
                  item(
                    "style-cyberpunk",
                    "赛博朋克",
                    <Sparkles className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(
                        selectedImages,
                        styleTransferPreset(
                          "赛博朋克",
                          "赛博朋克视觉风格，霓虹光、强烈冷暖对比、未来城市质感和高反差氛围",
                        ),
                      ),
                  ),
                  item(
                    "style-custom",
                    "自定义参考图",
                    <Upload className="size-4" />,
                    () =>
                      createReferenceGenerationFromImages(selectedImages, {
                          title: "自定义风格参考",
                          imageOperation: "edit",
                        size: "auto",
                        quality: "high",
                        count: 1,
                        prompt:
                          "根据已连接的参考图片进行风格迁移。请在组装提示词中补充你想迁移的风格来源、风格关键词或再连接一张风格参考图。保持主体内容和构图稳定，只改变视觉风格、材质、光影、色彩和表现手法。",
                        successMessage: "已创建自定义风格配置",
                      }),
                  ),
                ] : [],
                <Sparkles className="size-4" />,
              ),
              submenu(
                "continue",
                "继续创作",
                [
                  item(
                    "continue-copy",
                    "复制节点",
                    <Copy className="size-4" />,
                    () => duplicateSelectedNodes(),
                  ),
                  ...(supportedImageOperations.has("variation")
                    ? [item(
                        "continue-variant",
                        "创建图片变体",
                        <Sparkles className="size-4" />,
                        () => createReferenceGenerationFromImages(selectedImages, {
                          title: "图片变体",
                          prompt: "",
                          imageOperation: "variation",
                          successMessage: "已创建图片变体操作",
                        }),
                      )]
                    : []),
                  ...(supportedImageOperations.has("responses-tool")
                    ? [item(
                        "continue-responses-image",
                        "Responses 图片工具",
                        <Sparkles className="size-4" />,
                        () => createReferenceGenerationFromImages(selectedImages, {
                          title: "Responses 图片工具",
                          prompt: "请根据有序参考图片生成新的图片。",
                          imageOperation: "responses-tool",
                          successMessage: "已创建 Responses 图片工具操作",
                        }),
                      )]
                    : []),
                  ...(supportsGenerateReferences
                    ? [item(
                        "continue-generate",
                        "基于选中图继续生成",
                        <Sparkles className="size-4" />,
                        () => createReferenceGenerationFromImages(selectedImages, {
                          imageOperation: "generate",
                        }),
                      )]
                    : []),
                  ...(supportsEditReferences
                    ? [item(
                        "continue-config",
                        "作为参考图创建编辑配置",
                        <Settings2 className="size-4" />,
                        () => createReferenceGenerationFromImages(selectedImages, {
                          imageOperation: "edit",
                        }),
                      )]
                    : []),
                ],
                <Sparkles className="size-4" />,
              ),
              submenu(
                "assets-export",
                "素材与导出",
                [
                  item(
                    "asset-save",
                    "存入素材库",
                    <FolderPlus className="size-4" />,
                    () => void saveSelectedImages(selectedImages),
                    { disabled: assetHydrationStatus !== "ready" },
                  ),
                  item(
                    "asset-download",
                    "下载图片",
                    <Download className="size-4" />,
                    () => downloadSelectedImages(selectedImages),
                  ),
                  item(
                    "asset-retain",
                    "保留选中",
                    <Pin className="size-4" />,
                    () => void retainSelectedImages(selectedImages),
                  ),
                ],
                <FolderPlus className="size-4" />,
              ),
              submenu(
                "arrange",
                "画布整理",
                [
                  item(
                    "align-left",
                    "左对齐",
                    <AlignStartHorizontal className="size-4" />,
                    () => alignSelectedImages("left"),
                  ),
                  item(
                    "align-center",
                    "居中对齐",
                    <AlignCenter className="size-4" />,
                    () => alignSelectedImages("center"),
                  ),
                  item(
                    "align-right",
                    "右对齐",
                    <AlignEndHorizontal className="size-4" />,
                    () => alignSelectedImages("right"),
                  ),
                  item(
                    "distribute-x",
                    "横向均分",
                    <Columns2 className="size-4" />,
                    () => distributeSelectedImages("x"),
                    { disabled: selectedImages.length < 3 },
                  ),
                  item(
                    "distribute-y",
                    "纵向均分",
                    <List className="size-4" />,
                    () => distributeSelectedImages("y"),
                    { disabled: selectedImages.length < 3 },
                  ),
                  item(
                    "auto-arrange",
                    "自动整理",
                    <LayoutGrid className="size-4" />,
                    autoArrangeSelectedImages,
                  ),
                ],
                <LayoutGrid className="size-4" />,
              ),
              submenu(
                "selection-node",
                "节点操作",
                [
                  item(
                    "selection-duplicate",
                    "复制节点",
                    <Copy className="size-4" />,
                    () => duplicateSelectedNodes(),
                  ),
                  item(
                    "selection-delete",
                    "删除选中",
                    <Trash2 className="size-4" />,
                    () =>
                      requestDeleteNodes(
                        new Set(selectedImages.map((image) => image.id)),
                      ),
                    { danger: true },
                  ),
                ],
                <List className="size-4" />,
              ),
            ]),
          },
        ];
      }

      const node = nodesRef.current.find((item) => item.id === menu.nodeId);
      if (!node) return [];
      const isImage = node.type === CanvasNodeType.Image;
      const isText = node.type === CanvasNodeType.Text;
      const isConfig = node.type === CanvasNodeType.Config;
      const isVideo = node.type === CanvasNodeType.Video;
      const isAudio = node.type === CanvasNodeType.Audio;
      const hasContent = Boolean(node.metadata?.content);
      const hasImage = isImage && hasContent;
      const hasVideo = isVideo && hasContent;
      const hasAudio = isAudio && hasContent;
      const maskEditError = hasImage
        ? canvasMaskEditCapabilityError(
            buildGenerationConfig(effectiveConfig, node, "image"),
          )
        : "";
      const closePanels = () => {
        setContextMenu(null);
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
      };
      const action = (run: () => void) => () => {
        closePanels();
        run();
      };
      const item = (
        id: string,
        label: string,
        icon: React.ReactNode | undefined,
        run: () => void,
        options?: Pick<
          CanvasContextMenuItem,
          "danger" | "disabled" | "shortcut" | "submenu" | "children"
        >,
      ): CanvasContextMenuItem => ({
        id,
        label,
        icon,
        onClick: action(run),
        ...options,
      });
      const imageTools = hasImage
        ? buildImageToolbarTools(node, {
            onUpload: (target) => handleUploadRequestRef.current(target.id),
            onToggleFreeResize: (target) => toggleNodeFreeResize(target.id),
            onLayerEdit: (target) => setLayerEditNodeId(target.id),
            onMaskEdit: (target) => setMaskEditNodeId(target.id),
            onCrop: (target) => setCropNodeId(target.id),
            onSplit: (target) => setSplitNodeId(target.id),
            onUpscale: (target) => setUpscaleNodeId(target.id),
            onSuperResolve: (target) => setSuperResolveNodeId(target.id),
            onAngle: (target) => setAngleNodeId(target.id),
            onViewImage: previewNodeImage,
            onCopyPrompt: copyNodePrompt,
            onReversePrompt: createImageReversePromptNodes,
          }).filter(
            (tool) =>
              tool.id !== "superResolve" &&
              !(tool.id === "maskEdit" && Boolean(maskEditError)),
          )
        : [];
      const imageToolItem = (id: string) => {
        const tool = imageTools.find((entry) => entry.id === id);
        if (!tool) return null;
        return item(tool.id, tool.label, tool.icon, tool.onClick);
      };
      const imageMenuItem = (id: string, label: string, shortcut?: string) => {
        const tool = imageTools.find((entry) => entry.id === id);
        if (!tool) return null;
        return item(
          tool.id,
          label,
          undefined,
          tool.onClick,
          shortcut ? { shortcut } : undefined,
        );
      };
      const compactMenuItems = (entries: Array<CanvasContextMenuItem | null>) =>
        entries.filter((entry): entry is CanvasContextMenuItem =>
          Boolean(entry),
        );
      const submenu = (
        id: string,
        label: string,
        children: Array<CanvasContextMenuItem | null>,
        icon?: React.ReactNode,
      ): CanvasContextMenuItem | null => {
        const compactChildren = compactMenuItems(children);
        if (!compactChildren.length) return null;
        return {
          id,
          label,
          icon,
          onClick: () => undefined,
          children: compactChildren,
        };
      };

      if (hasImage) {
        return [
          {
            items: compactMenuItems([
              item(
                "download",
                "下载图片",
                <Download className="size-4" />,
                () => downloadNodeImage(node),
              ),
              item(
                "regenerate-image",
                "重新生成图片",
                <Redo2 className="size-4" />,
                () => handleRetryNodeRef.current(node),
                { disabled: node.metadata?.status === NODE_STATUS_LOADING },
              ),
              item(
                "replace",
                "上传替换图片",
                <Upload className="size-4" />,
                () => handleUploadRequestRef.current(node.id),
              ),
              item(
                "replace-from-canvas",
                "从画布选图替换",
                <Images className="size-4" />,
                () => setReplacePickerNodeId(node.id),
              ),
              item(
                "copy-image",
                "复制图片",
                <Clipboard className="size-4" />,
                () => void copyNodeImageToSystemClipboard(node),
                { shortcut: "⌘C" },
              ),
              item(
                "seedance2-face-edit",
                "Seedance2 人脸迁移",
                <Layers3 className="size-4" />,
                () => setSeedance2FaceEditNodeId(node.id),
              ),
              submenu(
                "image-edit",
                "编辑图片",
                [
                  item(
                    "edit",
                    "打开编辑面板",
                    <MessageSquare className="size-4" />,
                    () =>
                      setDialogNodeId((current) =>
                        current === node.id ? null : node.id,
                      ),
                  ),
                  item(
                    "seedance2-face-restore-original",
                    "还原 Seedance2 原图",
                    <Undo2 className="size-4" />,
                    () => restoreSeedance2FaceEditOriginalImageNode(node),
                    { disabled: !node.metadata?.seedance2FaceEditOriginal },
                  ),
                  item(
                    "maskEdit",
                    maskEditError || "局部编辑",
                    <Brush className="size-4" />,
                    () => setMaskEditNodeId(node.id),
                    { disabled: Boolean(maskEditError) },
                  ),
                  imageToolItem("layerEdit"),
                  imageToolItem("crop"),
                  imageToolItem("split"),
                  imageToolItem("resize"),
                ],
                <Pencil className="size-4" />,
              ),
              submenu(
                "image-generate",
                "生成增强",
                [
                  item(
                    "story-director",
                    "故事导演节点",
                    <Clapperboard className="size-4" />,
                    () => createStoryDirectorFromImages([node]),
                  ),
                  imageToolItem("reversePrompt"),
                  imageToolItem("angle"),
                  imageToolItem("upscale"),
                ],
                <Sparkles className="size-4" />,
              ),
              submenu(
                "image-actions",
                "图片操作",
                [
                  imageToolItem("replace") ||
                    item(
                      "replace",
                      "替换图片",
                      <Upload className="size-4" />,
                      () => handleUploadRequestRef.current(node.id),
                    ),
                  imageToolItem("view"),
                  imageMenuItem("copyPrompt", "复制提示词") ||
                    item(
                      "copyPrompt",
                      "复制提示词",
                      <Copy className="size-4" />,
                      () => copyNodePrompt(node),
                    ),
                ],
                <ImageIcon className="size-4" />,
              ),
              submenu(
                "image-assets",
                "素材与导出",
                [
                  item(
                    "saveAsset",
                    "存素材",
                    <FolderPlus className="size-4" />,
                    () => void saveNodeAsset(node),
                    { disabled: assetHydrationStatus !== "ready" },
                  ),
                  item(
                    "download-sub",
                    "下载图片",
                    <Download className="size-4" />,
                    () => downloadNodeImage(node),
                  ),
                  item(
                    "retain",
                    node.metadata?.retained ? "取消保留" : "保留",
                    node.metadata?.retained ? (
                      <PinOff className="size-4" />
                    ) : (
                      <Pin className="size-4" />
                    ),
                    () => void toggleRetainNodeImage(node),
                  ),
                ],
                <FolderPlus className="size-4" />,
              ),
            ]),
          },
          {
            items: compactMenuItems([
              submenu(
                "node-actions",
                "节点操作",
                [
                  item("info", "信息", <List className="size-4" />, () =>
                    setInfoNodeId(node.id),
                  ),
                  item(
                    "duplicate",
                    "复制节点",
                    <Copy className="size-4" />,
                    () => duplicateNode(node.id),
                  ),
                  item(
                    "delete",
                    "删除",
                    <Trash2 className="size-4" />,
                    () => requestDeleteNodes(new Set([node.id])),
                    { danger: true },
                  ),
                ],
                <List className="size-4" />,
              ),
            ]),
          },
        ];
      }

      if (isText) {
        return [
          {
            items: [
              item("info", "信息", <List className="size-4" />, () =>
                setInfoNodeId(node.id),
              ),
              item("editText", "编辑文字", <Pencil className="size-4" />, () =>
                openTextEditor(node),
              ),
              item(
                "generateImage",
                "用文本生图",
                <ImageIcon className="size-4" />,
                () => generateImageFromTextNodeRef.current(node),
              ),
              item(
                "story-director",
                "故事导演节点",
                <Clapperboard className="size-4" />,
                () => createStoryDirectorFromImages([node]),
              ),
              item(
                "saveAsset",
                "存素材",
                <FolderPlus className="size-4" />,
                () => void saveNodeAsset(node),
                { disabled: assetHydrationStatus !== "ready" },
              ),
              item(
                "decreaseFont",
                "减小字号",
                <Minus className="size-4" />,
                () =>
                  handleFontSizeChangeRef.current(
                    node.id,
                    Math.max(10, (node.metadata?.fontSize || 14) - 2),
                  ),
              ),
              item(
                "increaseFont",
                "增大字号",
                <Plus className="size-4" />,
                () =>
                  handleFontSizeChangeRef.current(
                    node.id,
                    Math.min(32, (node.metadata?.fontSize || 14) + 2),
                  ),
              ),
            ],
          },
          {
            title: "节点操作",
            items: [
              item("duplicate", "复制节点", <Copy className="size-4" />, () =>
                duplicateNode(node.id),
              ),
              item(
                "delete",
                "删除",
                <Trash2 className="size-4" />,
                () => requestDeleteNodes(new Set([node.id])),
                { danger: true },
              ),
            ],
          },
        ];
      }

      if (isConfig) {
        return [
          {
            items: [
              item("info", "信息", <List className="size-4" />, () =>
                setInfoNodeId(node.id),
              ),
              item(
                "config",
                "打开生成配置",
                <Settings2 className="size-4" />,
                () =>
                  setDialogNodeId((current) =>
                    current === node.id ? null : node.id,
                  ),
              ),
            ],
          },
          {
            title: "节点操作",
            items: [
              item("duplicate", "复制节点", <Copy className="size-4" />, () =>
                duplicateNode(node.id),
              ),
              item(
                "delete",
                "删除",
                <Trash2 className="size-4" />,
                () => requestDeleteNodes(new Set([node.id])),
                { danger: true },
              ),
            ],
          },
        ];
      }

      return [
        {
          items: [
            item("info", "信息", <List className="size-4" />, () =>
              setInfoNodeId(node.id),
            ),
            ...(hasVideo || hasAudio
              ? [
                  item(
                    "download",
                    hasAudio ? "下载音频" : "下载视频",
                    <Download className="size-4" />,
                    () => downloadNodeImage(node),
                  ),
                ]
              : []),
            ...(isVideo || isAudio
              ? [
                  item(
                    "replace-media",
                    hasContent
                      ? isAudio
                        ? "替换音频"
                        : "替换视频"
                      : isAudio
                        ? "上传音频"
                        : "上传视频",
                    <Upload className="size-4" />,
                    () => handleUploadRequestRef.current(node.id),
                  ),
                ]
              : []),
          ],
        },
        {
          title: "节点操作",
          items: [
            item("duplicate", "复制节点", <Copy className="size-4" />, () =>
              duplicateNode(node.id),
            ),
            item(
              "delete",
              "删除",
              <Trash2 className="size-4" />,
              () => requestDeleteNodes(new Set([node.id])),
              { danger: true },
            ),
          ],
        },
      ];
    },
    [
      alignSelectedImages,
      assetHydrationStatus,
      autoArrangeSelectedImages,
      copyNodePrompt,
      copyNodeImageToSystemClipboard,
      createReferenceGenerationFromImages,
      createStoryDirectorFromImages,
      createImageReversePromptNodes,
      deleteConnection,
      requestDeleteNodes,
      distributeSelectedImages,
      downloadSelectedImages,
      downloadNodeImage,
      duplicateNode,
      duplicateSelectedNodes,
      effectiveConfig,
      message,
      openTextEditor,
      openImageCompare,
      retainSelectedImages,
      restoreSeedance2FaceEditOriginalImageNode,
      saveNodeAsset,
      saveSelectedImages,
      toggleNodeFreeResize,
      toggleRetainNodeImage,
    ],
  );

  const handleFontSizeChange = useCallback(
    (nodeId: string, fontSize: number) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? { ...node, metadata: { ...node.metadata, fontSize } }
            : node,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    handleFontSizeChangeRef.current = handleFontSizeChange;
  }, [handleFontSizeChange]);

  const handleUploadRequest = useCallback(
    (nodeId?: string, position?: Position) => {
      uploadTargetRef.current = { nodeId, position };
      imageInputRef.current?.click();
    },
    [],
  );

  useEffect(() => {
    handleUploadRequestRef.current = handleUploadRequest;
  }, [handleUploadRequest]);

  const handleImageInputChange = useCallback(
    async (event: ReactChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []).filter(
        isSupportedCanvasFile,
      );
      const file = files[0];
      const target = uploadTargetRef.current;
      if (!file) return;

      if (target?.nodeId) {
        try {
          if (isAudioFile(file)) {
            const audio = await uploadMediaFile(file, "audio");
            const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
            setNodes((prev) =>
              prev.map((node) =>
                node.id === target.nodeId
                  ? {
                      ...node,
                      type: CanvasNodeType.Audio,
                      title: file.name,
                      position: {
                        x: node.position.x + node.width / 2 - spec.width / 2,
                        y: node.position.y + node.height / 2 - spec.height / 2,
                      },
                      width: spec.width,
                      height: spec.height,
                      metadata: {
                        ...node.metadata,
                        ...audioMetadata(audio),
                        errorDetails: undefined,
                      },
                    }
                  : node,
              ),
            );
            setSelectedNodeIds(new Set([target.nodeId]));
            setSelectedConnectionId(null);
            uploadTargetRef.current = null;
            event.target.value = "";
            return;
          }
          if (file.type.startsWith("video/")) {
            const video = await uploadMediaFile(file, "video");
            if (!video.width || !video.height) {
              throw new Error("视频元数据读取失败：未取得有效尺寸");
            }
            const nextSize = fitNodeSize(
              video.width,
              video.height,
              VIDEO_NODE_MAX_WIDTH,
              VIDEO_NODE_MAX_HEIGHT,
            );
            cancelVideoTaskForNode(target.nodeId);
            setNodes((prev) =>
              prev.map((node) =>
                node.id === target.nodeId
                  ? {
                      ...node,
                      type: CanvasNodeType.Video,
                      title: file.name,
                      position: {
                        x: node.position.x + node.width / 2 - nextSize.width / 2,
                        y:
                          node.position.y + node.height / 2 - nextSize.height / 2,
                      },
                      width: nextSize.width,
                      height: nextSize.height,
                      metadata: {
                        ...clearVideoTaskOwnership(node.metadata || {}),
                        ...videoMetadata(video),
                        errorDetails: undefined,
                      },
                    }
                  : node,
              ),
            );
            setSelectedNodeIds(new Set([target.nodeId]));
            setSelectedConnectionId(null);
            setDialogNodeId(target.nodeId);
            uploadTargetRef.current = null;
            event.target.value = "";
            return;
          }
          const image = await uploadImage(file, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
          replaceNodeWithImage(target.nodeId, file.name, image, { retained: true });
        } catch (error) {
          message.error(`${file.name} 替换失败：${error instanceof Error ? error.message : "请重试"}`);
          uploadTargetRef.current = null;
          event.target.value = "";
        }
      } else {
        const position =
          target?.position ||
          screenToCanvas(
            (containerRef.current?.getBoundingClientRect().left || 0) +
              size.width / 2,
            (containerRef.current?.getBoundingClientRect().top || 0) +
              size.height / 2,
          );
        void createCanvasFileNodes(files, position);
      }

      uploadTargetRef.current = null;
      event.target.value = "";
    },
    [
      createCanvasFileNodes,
      cancelVideoTaskForNode,
      message,
      replaceNodeWithImage,
      screenToCanvas,
      size.height,
      size.width,
    ],
  );

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer.files).filter(
        isSupportedCanvasFile,
      );
      if (!files.length) return;

      const pos = screenToCanvas(event.clientX, event.clientY);
      void createCanvasFileNodes(files, pos);
    },
    [createCanvasFileNodes, screenToCanvas],
  );

  useEffect(() => {
    const preventFileOpen = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileOpen);
    window.addEventListener("drop", preventFileOpen);
    return () => {
      window.removeEventListener("dragover", preventFileOpen);
      window.removeEventListener("drop", preventFileOpen);
    };
  }, []);

  const pasteAssistantImage = useCallback(
    async (file: File) => {
      const position = screenToCanvas(
        (containerRef.current?.getBoundingClientRect().left || 0) +
          size.width / 2,
        (containerRef.current?.getBoundingClientRect().top || 0) +
          size.height / 2,
      );
      try {
        await createImageFileNode(file, position);
        message.success("已从剪切板添加图片");
      } catch (error) {
        message.error(`剪切板图片读取失败：${error instanceof Error ? error.message : "请重试"}`);
      }
    },
    [createImageFileNode, message, screenToCanvas, size.height, size.width],
  );

  const handleAssistantSessionsChange = useCallback(
    (sessions: CanvasAssistantSession[], activeId: string | null) => {
      setChatSessions(sessions);
      setActiveChatId(activeId);
    },
    [],
  );

  const startTitleEditing = useCallback(() => {
    setTitleDraft(currentProject?.title || "未命名画布");
    setTitleEditing(true);
  }, [currentProject?.title]);

  const finishTitleEditing = useCallback(() => {
    const nextTitle = titleDraft.trim();
    if (nextTitle) renameProject(projectId, nextTitle);
    setTitleEditing(false);
  }, [projectId, renameProject, titleDraft]);

  const preventCanvasContextMenu = useCallback((event: ReactMouseEvent) => {
    if ((event.target as HTMLElement).closest("[data-node-id]")) return;
    event.preventDefault();
    const selectedImages = nodesRef.current.filter(
      (node) =>
        selectedNodeIdsRef.current.has(node.id) &&
        node.type === CanvasNodeType.Image &&
        Boolean(node.metadata?.content),
    );
    setContextMenu(
      selectedImages.length > 1
        ? {
            type: "selection",
            x: event.clientX,
            y: event.clientY,
            nodeIds: selectedImages.map((node) => node.id),
          }
        : null,
    );
  }, []);

  const generateSeedance2VideoFromPlaceholder = useCallback(
    async (node: CanvasNodeData) => {
      const latest = nodesRef.current.find((item) => item.id === node.id) || node;
      if (
        latest.type !== CanvasNodeType.Video ||
        latest.metadata?.seedanceWorkflowRole !== "placeholder"
      )
        return;
      if (
        hasNonterminalVideoTask(latest.metadata) ||
        videoGenerationEntryLocksRef.current.has(latest.id)
      ) {
        message.warning("该视频节点已有生成任务，完成或替换后才能再次提交");
        return;
      }

      const prompt = String(
        latest.metadata?.prompt || latest.metadata?.content || "",
      ).trim();
      const resolvedSlots = resolveCapabilityReferenceSlots(
        latest,
        nodesRef.current,
        connectionsRef.current,
        config,
        effectiveConfig,
      );
      const unresolvedReferences =
        seedance2ResolvedSlotsToCustomerReferences(resolvedSlots);
      const connectedMediaInputs = buildNodeGenerationInputs(
        latest.id,
        nodesRef.current,
        connectionsRef.current,
      );
      const referenceVideos = connectedMediaInputs.flatMap((input) => input.video ? [input.video] : []);
      const referenceAudios = connectedMediaInputs.flatMap((input) => input.audio ? [input.audio] : []);
      const missingRequiredReferences = findMissingSeedance2RequiredReferences(
        latest,
        unresolvedReferences,
      );

      const entryAttemptId = nanoid();
      videoGenerationEntryLocksRef.current.set(latest.id, entryAttemptId);

      let videoApiConfig: CustomerVideoApiConfig | undefined;
      let operation: VideoGenerationOperation | undefined;
      let resolvedLocalAdapter = "";
      let authorityError: unknown;
      try {
        videoApiConfig = buildCustomerVideoApiConfig(
          latest,
          config,
          effectiveConfig,
        );
        const autoCapability = resolveCanvasVideoModelCapability(
          { apiRelays: [...(videoApiConfig.providerList || [])] },
          videoApiConfig.model || "",
          videoApiConfig.route?.mode === "local"
            ? videoApiConfig.route.provider
            : undefined,
        );
        const isStoryPlaceholder = latest.metadata?.seedanceWorkflowRole === "placeholder";
        const storySelection = autoCapability
          ? resolveWorkflowVideoOperationSelection({
              capability: autoCapability,
              providerId: videoApiConfig.route?.mode === "local" ? videoApiConfig.route.provider.id : "",
              model: videoApiConfig.model || "",
              savedScope: latest.metadata?.videoGenerationScope,
              savedCapabilityId: latest.metadata?.videoGenerationCapabilityId,
              allowLegacyStoryAutoMigration: isStoryPlaceholder,
              savedOperationMigrationSource: latest.metadata?.videoGenerationOperationMigration?.source,
            })
          : undefined;
        let effectiveOperation = storySelection?.operation || latest.metadata?.videoGenerationScope?.operation;
        const savedOperationStillValid = effectiveOperation && autoCapability?.supportedOperations?.includes(effectiveOperation);
        if (!effectiveOperation || !savedOperationStillValid) {
          if (autoCapability) {
            const shotsWithImage = unresolvedReferences.length > 0 ? 1 : 0;
            const autoSelection = autoWorkflowVideoOperationForMaterials({
              capability: autoCapability,
              materials: { totalShots: 1, shotsWithImage },
            });
            if (autoSelection.operation) {
              effectiveOperation = autoSelection.operation;
            }
          }
        }
        operation = requireVideoGenerationOperation(
          effectiveOperation,
          `${videoApiConfig.model || "未选择视频模型"}`,
        );
        resolvedLocalAdapter = videoApiConfig.route?.mode === "local"
          ? nativeVideoSubmissionAdapterType(
              videoApiConfig.route.provider,
              videoApiConfig.model || "",
            )
          : "";
      } catch (error) {
        authorityError = error;
      }
      const localAdapter = resolvedLocalAdapter;

      const releaseEntryLock = () => {
        if (videoGenerationEntryLocksRef.current.get(latest.id) === entryAttemptId) {
          videoGenerationEntryLocksRef.current.delete(latest.id);
        }
      };
      if (authorityError || !videoApiConfig || !operation) {
        releaseEntryLock();
        message.error(formatCanvasGenerationError(authorityError, "视频生成配置校验失败"));
        return;
      }

      if (missingRequiredReferences.length) {
        releaseEntryLock();
        message.warning(`缺少必需参考图：${missingRequiredReferences.join("、")}`);
        return;
      }

      let nativePreflight:
        | {
            generationConfig: AiConfig;
            capability: ResolvedVideoModelCapability;
            selectedReferences: VideoReferenceImage[];
            parameterSnapshot: ReturnType<typeof buildVideoParameterSnapshot>;
          }
        | undefined;
      let customerPayload: Seedance2CustomerVideoPayload | undefined;
      let customerReferences = unresolvedReferences;
      let customerLocalCredential: CustomerVideoLocalCredential | undefined;
      let nativeGenerationConfig: AiConfig | undefined;
      const nativeLedgerReferences: VideoReferenceImage[] = unresolvedReferences.map(
        (reference, index) => ({
          id:
            reference.referenceId ||
            reference.id ||
            reference.nodeId ||
            `seedance-ref-${index}`,
          name: reference.label,
          label: reference.label,
          nodeId: reference.nodeId,
          type: "image/png",
          dataUrl: reference.value,
          role: reference.role,
          useAs: reference.useAs,
          referenceOrigin: reference.referenceOrigin,
        }),
      );
      try {
        const customerGuard = canvasCustomerVideoSubmitGuard({
          hasLocalAdapter: Boolean(localAdapter),
          isLocalRoute: videoApiConfig.route?.mode === "local",
          adapterType: videoApiConfig.route?.mode === "local" ? videoApiConfig.route.provider.adapterType : "",
          model: videoApiConfig.model || "",
          baseUrl: videoApiConfig.route?.mode === "local" ? videoApiConfig.route.provider.baseUrl : videoApiConfig.baseUrl,
          operation,
          prompt,
          references: unresolvedReferences,
          videoCount: referenceVideos.length,
        });
        if (customerGuard.kind === "block") {
          throw new Error(customerGuard.reason || "当前 customer 视频 serializer/profile 未验证，参考媒体未提交");
        }
        if (localAdapter) {
          const unresolvedReferenceImages = nativeLedgerReferences;
          const generationConfig: AiConfig = {
            ...buildGenerationConfig(effectiveConfig, latest, "video"),
            model: videoApiConfig.model || "",
            videoModel: videoApiConfig.model || "",
          };
          nativeGenerationConfig = generationConfig;
          const capability = resolveCanvasVideoModelCapability(
            { apiRelays: [...(videoApiConfig.providerList || [])] },
            videoApiConfig.model || "",
            videoApiConfig.route?.mode === "local"
              ? videoApiConfig.route.provider
              : undefined,
          );
          const preparedReferences = prepareStoryVideoReferencesForSubmission(
            capability,
            unresolvedReferenceImages,
            {
              operation,
              videos: referenceVideos,
            },
          );
          assertNoOmittedAutomaticStoryVideoReferences(capability, preparedReferences);
          const parameterSnapshot = buildVideoParameterSnapshot(
            generationConfig,
            preparedReferences.references,
            referenceVideos,
            operation,
            latest.metadata?.videoGenerationSettings || {},
            unresolvedReferenceImages,
          );
          videoGenerationSettingsToRequest(
            parameterSnapshot.settings,
            capability,
          );
          const promptError = videoPromptPreflightError(capability, prompt, {
            imageCount: preparedReferences.references.length,
            videoCount: referenceVideos.length,
            audioCount: referenceAudios.length,
          });
          if (promptError) throw new Error(promptError);

          const selectedReferences: VideoReferenceImage[] = [];
          for (const reference of preparedReferences.references) {
            const dataUrl = await resolveSeedance2ReferenceTransportValue(
              reference.dataUrl,
              imageToDataUrl,
            );
            if (!dataUrl) {
              throw new Error(`参考图“${reference.label || reference.name}”读取失败`);
            }
            selectedReferences.push({ ...reference, dataUrl });
          }
          nativePreflight = {
            generationConfig,
            capability,
            selectedReferences,
            parameterSnapshot,
          };
        } else {
          const hydratedCustomerReferences = await hydrateSeedance2CustomerReferencesForTransport(
            unresolvedReferences,
            imageToDataUrl,
          );
          if (unresolvedReferences.length && hydratedCustomerReferences.length !== unresolvedReferences.length) {
            throw new Error("参考图地址无效；blob: 或空地址不会作为 first_frame / last_frame 提交。");
          }
          customerPayload = buildSeedance2CustomerVideoPayload(
            latest,
            hydratedCustomerReferences,
            videoApiConfig.model,
          );
          customerReferences = hydratedCustomerReferences;
          customerLocalCredential = selectCustomerVideoLocalCredential(videoApiConfig);
        }
      } catch (error) {
        if (
          videoGenerationEntryLocksRef.current.get(latest.id) === entryAttemptId
        )
          videoGenerationEntryLocksRef.current.delete(latest.id);
        message.error(
          formatCanvasGenerationError(error, "视频生成配置校验失败"),
        );
        return;
      }

      setRunningNodeId(latest.id);
      setToolbarNodeId(null);
      setHoveredNodeId(null);
      const startedAt = new Date().toISOString();
      const providerId =
        videoApiConfig.route?.mode === "local"
          ? videoApiConfig.route.provider.id
          : videoApiConfig.baseUrl;
      const pendingAttempt: CustomerVideoAttempt = {
        id: entryAttemptId,
        kind: nativePreflight ? "native" : "customer",
        provider: "customer",
        providerId,
        model: videoApiConfig.model || "",
        startedAt,
      };
      let currentTaskId: string | undefined;
      let generationErrorStatus: "generating" | "failed" = "failed";
      const pendingNodes = nodesRef.current.map((item) =>
        item.id === latest.id
          ? {
              ...item,
              metadata: {
                ...item.metadata,
                status: NODE_STATUS_LOADING,
                errorDetails: undefined,
                seedanceGenerationTaskState: {
                  status: "generating" as const,
                  startedAt,
                  attemptId: pendingAttempt.id,
                  provider: pendingAttempt.provider,
                  providerId: pendingAttempt.providerId,
                  model: pendingAttempt.model,
                },
                videoGenerationAttempt: pendingAttempt,
              },
            }
          : item,
      );
      nodesRef.current = pendingNodes;
      setNodes(pendingNodes);
      persistCanvasSnapshot(pendingNodes);

      try {
        if (nativePreflight) {
          const {
            capability,
            generationConfig,
            parameterSnapshot,
            selectedReferences,
          } = nativePreflight;
          const parameterNodes = nodesRef.current.map((item) =>
            item.id === latest.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    videoGenerationSettings: parameterSnapshot.settings,
                    videoGenerationScope: parameterSnapshot.scope,
                    videoGenerationCapabilityId: parameterSnapshot.capabilityId,
                    videoLayoutRatio: latest.metadata?.videoLayoutRatio || latest.metadata?.seedanceRatio || latest.metadata?.size,
                    videoWireFormat: parameterSnapshot.wireFormat,
                  },
                }
              : item,
          );
          nodesRef.current = parameterNodes;
          setNodes(parameterNodes);
          persistCanvasSnapshot(parameterNodes);
          await flushCanvasPersistence();
          const task = await createVideoGenerationTask(
            generationConfig,
            prompt,
            selectedReferences,
            referenceVideos,
            referenceAudios,
            "videoGeneration",
            {
              generationParameters: parameterSnapshot.settings,
              operation: parameterSnapshot.scope.operation,
            },
          );
          currentTaskId = task.id;
          const taskAttempt = withVideoAttemptTaskId(
            { ...pendingAttempt, provider: task.provider },
            task.id,
          );
          const snapshot = snapshotCreatedCanvasVideoTask(
            task,
            startedAt,
            taskAttempt.id,
            parameterSnapshot.scope.operation,
          );
          const taskNodes = nodesRef.current.map((item) =>
            item.id === latest.id &&
            ownsVideoGenerationAttempt(item.metadata, pendingAttempt)
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    seedanceTaskId: task.id,
                    references: selectedReferences.map((reference) => reference.dataUrl),
                    videoGenerationSettings: parameterSnapshot.settings,
                    videoGenerationScope: parameterSnapshot.scope,
                    videoGenerationCapabilityId: parameterSnapshot.capabilityId,
                    videoLayoutRatio: latest.metadata?.videoLayoutRatio || latest.metadata?.seedanceRatio || latest.metadata?.size,
                    videoWireFormat: parameterSnapshot.wireFormat,
                    videoGenerationTask: snapshot,
                    videoGenerationAttempt: taskAttempt,
                    seedanceGenerationTaskState: {
                      status: "generating" as const,
                      taskId: task.id,
                      startedAt,
                      attemptId: taskAttempt.id,
                      provider: taskAttempt.provider,
                      providerId: taskAttempt.providerId,
                      model: taskAttempt.model,
                    },
                  },
                }
              : item,
          );
          nodesRef.current = taskNodes;
          setNodes(taskNodes);
          persistCanvasSnapshot(taskNodes);
          await flushCanvasPersistence();
          const resumeKey = videoTaskControllerKey({
            provider: task.provider,
            providerId: snapshot.providerId,
            nodeId: latest.id,
            taskId: task.id,
          });
          resumedVideoTaskIdsRef.current.add(resumeKey);
          await resumeCanvasVideoTask(latest.id, snapshot);
          return;
        }
        const payload = customerPayload!;
        let submissionAttempt: CustomerVideoAttempt = pendingAttempt;
        if (customerLocalCredential) {
          const strictCustomerSnapshot =
            createCanvasVideoTaskProviderSnapshot({
              provider: customerLocalCredential.provider,
              model: videoApiConfig.model || "",
              credentialId: customerLocalCredential.credentialId,
              operation,
            });
          if (strictCustomerSnapshot.status === "blocked")
            throw new Error(strictCustomerSnapshot.message);
          videoApiConfig = pinCustomerVideoApiConfigToCredential(
            videoApiConfig,
            customerLocalCredential.credentialId,
          );
          submissionAttempt = {
            ...pendingAttempt,
            providerSnapshot: strictCustomerSnapshot.snapshot,
          };
        }
        const submissionNodes = nodesRef.current.map((item) =>
          item.id === latest.id &&
          ownsVideoGenerationAttempt(item.metadata, pendingAttempt)
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  videoGenerationAttempt: submissionAttempt,
                  ...(submissionAttempt.providerSnapshot
                    ? {
                        videoGenerationScope: {
                          providerId: submissionAttempt.providerSnapshot.providerId,
                          model: submissionAttempt.providerSnapshot.model,
                          operation,
                        },
                      }
                    : {}),
                },
              }
            : item,
        );
        nodesRef.current = submissionNodes;
        setNodes(submissionNodes);
        persistCanvasSnapshot(submissionNodes);
        await flushCanvasPersistence();
        const timeoutMs = videoApiConfig.route?.timeoutMs
          ?? CUSTOMER_VIDEO_TASK_POLL_INTERVAL_MS * CUSTOMER_VIDEO_TASK_POLL_RETRY_LIMIT;
        const timeout = createTimedVideoTaskAbortController(
          startedAt,
          timeoutMs,
          "视频生成超时或未获得视频文件",
        );
        const created = await requestCustomerVideoTask(
          payload,
          videoApiConfig,
          timeout.controller.signal,
        ).finally(timeout.cancelTimeout);
        const taskId = customerVideoCreatedTaskId(created);
        if (!taskId) throw new Error("视频接口没有返回 task_id");
        currentTaskId = taskId;
        const taskAttempt: CustomerVideoAttempt = {
          ...submissionAttempt,
          taskId,
        };

        const taskNodes = nodesRef.current.map((item) =>
            item.id === latest.id &&
            ownsVideoGenerationAttempt(item.metadata, pendingAttempt)
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  seedanceTaskId: taskId,
                  size: payload.ratio,
                  seedanceRatio: payload.ratio,
                  seconds: String(payload.duration),
                  seedanceDuration: String(payload.duration),
                  references: customerReferences.map(
                    (reference) => reference.value,
                  ),
                  seedanceGenerationTaskState: {
                    status: "generating" as const,
                    taskId,
                    startedAt,
                    attemptId: taskAttempt.id,
                    provider: taskAttempt.provider,
                    providerId: taskAttempt.providerId,
                    model: taskAttempt.model,
                  },
                  videoGenerationAttempt: taskAttempt,
                },
              }
            : item,
        );
        nodesRef.current = taskNodes;
        setNodes(taskNodes);
        persistCanvasSnapshot(taskNodes);
        await flushCanvasPersistence();
        const resumeKey = videoTaskControllerKey({
          provider: taskAttempt.provider,
          providerId: taskAttempt.providerId,
          nodeId: latest.id,
          taskId,
        });
        resumedVideoTaskIdsRef.current.add(resumeKey);
        await resumeCustomerSeedanceTask(
          latest.id,
          taskId,
          startedAt,
          taskAttempt,
        );
        return;
      } catch (error) {
        const errorDetails = error instanceof Error ? error.message : "视频生成失败";
        generationErrorStatus = currentTaskId && !(error instanceof CanvasVideoTerminalError) ? "generating" : "failed";
        const errorNodes = nodesRef.current.map((item) =>
          item.id === latest.id &&
          ownsVideoGenerationAttempt(item.metadata, {
            ...pendingAttempt,
            taskId: currentTaskId,
          })
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  status: NODE_STATUS_ERROR,
                  errorDetails,
                  seedanceGenerationTaskState: {
                    status: generationErrorStatus,
                    taskId: currentTaskId,
                    ...(generationErrorStatus === "generating" ? { startedAt } : {}),
                    errorMessage: errorDetails,
                  },
                  ...(generationErrorStatus === "failed"
                    ? { videoGenerationAttempt: undefined }
                    : {}),
                },
              }
            : item,
        );
        setNodes(errorNodes);
        persistCanvasSnapshot(errorNodes);
        message.error(errorDetails);
      } finally {
        if (
          videoGenerationEntryLocksRef.current.get(latest.id) === entryAttemptId
        )
          videoGenerationEntryLocksRef.current.delete(latest.id);
        setRunningNodeId(null);
      }
    },
    [
      config,
      effectiveConfig,
      message,
      persistCanvasSnapshot,
      resumeCanvasVideoTask,
      resumeCustomerSeedanceTask,
    ],
  );
  generateSeedance2VideoFromPlaceholderRef.current =
    generateSeedance2VideoFromPlaceholder;

  const handleGenerateNode = useCallback(
    async (
      nodeId: string,
      mode: CanvasNodeGenerationMode,
      prompt: string,
      options?: { referenceImages?: ReferenceImage[] },
    ) => {
      if (nodeGenerationLocksRef.current.has(nodeId)) return;
      nodeGenerationLocksRef.current.add(nodeId);
      try {
      const sourceNode = nodesRef.current.find((node) => node.id === nodeId);
      const generationConfig = buildGenerationConfig(
        effectiveConfig,
        sourceNode,
        mode,
      );
      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        return;
      }

      let videoEntryAttemptId: string | undefined;
      if (mode === "video") {
        if (
          hasNonterminalVideoTask(sourceNode?.metadata) ||
          videoGenerationEntryLocksRef.current.has(nodeId)
        ) {
          message.warning("该视频节点已有生成任务，完成或替换后才能再次提交");
          return;
        }
        videoEntryAttemptId = nanoid();
        videoGenerationEntryLocksRef.current.set(nodeId, videoEntryAttemptId);
      }

      const directImageRegeneration =
        mode === "image" &&
        sourceNode?.type === CanvasNodeType.Image &&
        Boolean(sourceNode.metadata?.content) &&
        isStoryDirectorGeneratedImage(
          sourceNode,
          nodesRef.current,
          connectionsRef.current,
        );
      if (directImageRegeneration && sourceNode) {
        const selectedStoryTargets = selectedNodeIdsRef.current.has(
          sourceNode.id,
        )
          ? nodesRef.current.filter(
              (node) =>
                selectedNodeIdsRef.current.has(node.id) &&
                node.type === CanvasNodeType.Image &&
                Boolean(node.metadata?.content) &&
                isStoryDirectorGeneratedImage(
                  node,
                  nodesRef.current,
                  connectionsRef.current,
                ),
            )
          : [];
        const regenerationTargets =
          selectedStoryTargets.length > 1 ? selectedStoryTargets : [sourceNode];

        setRunningNodeId(nodeId);
        setToolbarNodeId(null);
        setHoveredNodeId(null);
        setContextMenu(null);
        setDialogNodeId(null);

        let directPendingIds: string[] = [];
        const directPendingTaskIds: string[] = [];
        try {
          const directCount = getGenerationCount(generationConfig.count);
          for (const targetNode of regenerationTargets) {
            const directPrompt = upgradeStoryCharacterPromptForRegeneration(
              prompt.trim(),
              targetNode,
            );
            if (!directPrompt) continue;
            const savedReferences = await resolveImageNodeSavedReferences(
              targetNode.metadata || {},
              nodesRef.current,
            );
            if (!savedReferences) {
              message.error("参考图片已丢失，无法基于本镜头重新生成");
              const nextNodes = nodesRef.current.map((node) =>
                node.id === targetNode.id
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        status: NODE_STATUS_ERROR,
                        errorDetails: "参考图片已丢失，无法基于本镜头重新生成",
                      },
                    }
                  : node,
              );
              const reconciledNodes = reconcileStoryDirectorImageResults(
                nextNodes,
                connectionsRef.current,
              );
              setNodes(reconciledNodes);
              persistCanvasSnapshot(reconciledNodes);
              continue;
            }
            if (
              !savedReferences.length &&
              (targetNode.metadata?.imageOperation
                ? targetNode.metadata.imageOperation !== "generate"
                : targetNode.metadata?.generationType === "edit")
            ) {
              const errorDetails =
                "Story 分镜的原始语义参考图片已丢失，无法基于本镜头安全重生成";
              message.error(errorDetails);
              const nextNodes = nodesRef.current.map((node) =>
                node.id === targetNode.id
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        status: NODE_STATUS_ERROR,
                        errorDetails,
                      },
                    }
                  : node,
              );
              const reconciledNodes = reconcileStoryDirectorImageResults(
                nextNodes,
                connectionsRef.current,
              );
              setNodes(reconciledNodes);
              persistCanvasSnapshot(reconciledNodes);
              continue;
            }
            if (!savedReferences.length && referencesImageLabel(directPrompt)) {
              message.warning(
                "提示词提到了图片编号，但当前节点没有保存可用参考图",
              );
              continue;
            }
            const directReferenceValidation =
              validateStoryImageRetryReferences(
                savedReferences,
                nodesRef.current,
              );
            if (directReferenceValidation.errorDetails) {
              message.error(directReferenceValidation.errorDetails);
              const nextNodes = nodesRef.current.map((node) =>
                node.id === targetNode.id
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        status: NODE_STATUS_ERROR,
                        errorDetails: directReferenceValidation.errorDetails,
                      },
                    }
                  : node,
              );
              const reconciledNodes = reconcileStoryDirectorImageResults(
                nextNodes,
                connectionsRef.current,
              );
              setNodes(reconciledNodes);
              persistCanvasSnapshot(reconciledNodes);
              continue;
            }
            const directReferences = directReferenceValidation.references;

            const targetGenerationConfig = {
              ...buildGenerationConfig(effectiveConfig, targetNode, "image"),
              count: generationConfig.count,
            };
            const directOperation = resolveCanvasImageOperation(targetNode.metadata, {
              referenceCount: directReferences.length,
              hasImageContent: Boolean(targetNode.metadata?.content),
            });
            if (!directOperation) {
              const errorDetails =
                "缺少已持久化的图片 operation；请选择图片操作。所有参考图保持原样。";
              message.error(errorDetails);
              const nextNodes = nodesRef.current.map((node) =>
                node.id === targetNode.id
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        status: NODE_STATUS_ERROR,
                        errorDetails,
                      },
                    }
                  : node,
              );
              const reconciledNodes = reconcileStoryDirectorImageResults(
                nextNodes,
                connectionsRef.current,
              );
              setNodes(reconciledNodes);
              persistCanvasSnapshot(reconciledNodes);
              continue;
            }
            const requestTargetGenerationConfig =
              applyActiveNodeImageAdvancedSnapshot(
                targetGenerationConfig,
                targetNode.metadata,
                directOperation,
              );
            await preflightImageRequest(
              requestTargetGenerationConfig,
              directOperation,
              directPrompt,
              directReferences,
              undefined,
              "imageGeneration",
              { useReferenceLabels: true },
            );
            const generationMetadata = buildImageGenerationMetadata(
              directOperation,
              requestTargetGenerationConfig,
              directCount,
              directReferences,
            );
            const targetIds = Array.from({ length: directCount }, (_, index) =>
              index === 0 ? targetNode.id : nanoid(),
            );
            directPendingIds = [...directPendingIds, ...targetIds];
            const taskIdByTargetId = new Map(
              targetIds.map((id) => [id, `canvas-${id}-${Date.now()}`]),
            );
            taskIdByTargetId.forEach((taskId) => {
              directPendingTaskIds.push(taskId);
              resumedImageTaskIdsRef.current.add(taskId);
            });
            const extraNodes: CanvasNodeData[] = targetIds
              .slice(1)
              .map((id, index) => ({
                ...targetNode,
                id,
                position: {
                  x:
                    targetNode.position.x +
                    (index + 1) * (targetNode.width + 36),
                  y: targetNode.position.y,
                },
                metadata: {
                  ...targetNode.metadata,
                  prompt: directPrompt,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                  content: undefined,
                  sourceImageTaskId: undefined,
                  imageGenerationAttemptId: taskIdByTargetId.get(id),
                  ...generationMetadata,
                },
              }));
            const pendingNodes = [
              ...nodesRef.current.map((node) =>
                node.id === targetNode.id
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        prompt: directPrompt,
                        status: NODE_STATUS_LOADING,
                        errorDetails: undefined,
                        sourceImageTaskId: undefined,
                        imageGenerationAttemptId: taskIdByTargetId.get(targetNode.id),
                        ...generationMetadata,
                      },
                    }
                  : node,
              ),
              ...extraNodes,
            ];
            const reconciledPendingNodes = reconcileStoryDirectorImageResults(
              pendingNodes,
              connectionsRef.current,
            );
            setNodes(reconciledPendingNodes);
            persistCanvasSnapshot(reconciledPendingNodes);

            const batchOutcomes = await requestCanvasImageBatch(
              targetIds.map((targetId) => ({
                targetId,
                taskId:
                  taskIdByTargetId.get(targetId) ||
                  `canvas-${targetId}-${Date.now()}`,
              })),
              requestTargetGenerationConfig,
              directOperation,
              directPrompt,
              directReferences,
              {
                useReferenceLabels: true,
                onNativeTaskSubmitted: persistNativeImageTaskBindings,
              },
            );
            let batchError: Error | undefined;
            await Promise.all(
              batchOutcomes.map(async (outcome) => {
                const taskId =
                  taskIdByTargetId.get(outcome.targetId) ||
                  `canvas-${outcome.targetId}-${Date.now()}`;
                try {
                  if (outcome.status === "rejected") throw outcome.reason;
                  const image = outcome.value;
                  const uploaded = await uploadImage(
                    image.dataUrl,
                    CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
                  );
                  const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
                  const imageSize = imageNodeSize(
                    uploaded.width,
                    uploaded.height,
                    imageConfig.width,
                  );
                  const nextNodes = nodesRef.current.map((node) => {
                    if (node.id !== outcome.targetId) return node;
                    if (
                      node.metadata?.sourceImageTaskId !== taskId &&
                      node.metadata?.imageGenerationAttemptId !== taskId &&
                      !ownsCanvasImageTask(
                        node.metadata?.imageGenerationTask,
                        taskId,
                      )
                    )
                      return node;
                    const center = {
                      x: node.position.x + node.width / 2,
                      y: node.position.y + node.height / 2,
                    };
                    return {
                      ...node,
                      width: imageSize.width,
                      height: imageSize.height,
                      position: {
                        x: center.x - imageSize.width / 2,
                        y: center.y - imageSize.height / 2,
                      },
                      metadata: {
                        ...node.metadata,
                        ...imageMetadata(uploaded, image),
                        prompt: directPrompt,
                        ...generationMetadata,
                      },
                    };
                  });
                  const reconciledNodes = reconcileStoryDirectorImageResults(
                    nextNodes,
                    connectionsRef.current,
                  );
                  setNodes(reconciledNodes);
                  persistCanvasSnapshot(reconciledNodes);
                } catch (error) {
                  const errorDetails = formatCanvasGenerationError(error);
                  batchError ||=
                    error instanceof Error ? error : new Error(errorDetails);
                } finally {
                  resumedImageTaskIdsRef.current.delete(taskId);
                }
              }),
            );
            if (batchError) throw batchError;
          }
        } catch (error) {
          const errorDetails = formatCanvasGenerationError(error);
          const terminal = error instanceof NativeImageTaskTerminalError;
          message.error(errorDetails);
          const targetIds = new Set(
            directPendingIds.length
              ? directPendingIds
              : regenerationTargets.map((node) => node.id),
          );
          const nextNodes = nodesRef.current.map((node) =>
            targetIds.has(node.id) &&
            node.metadata?.status === NODE_STATUS_LOADING &&
            (Boolean(node.metadata?.imageGenerationAttemptId) ||
              Boolean(node.metadata?.imageGenerationTask))
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    ...(node.metadata?.imageGenerationTask
                      ? terminal
                        ? {
                            sourceImageTaskId: undefined,
                            imageGenerationTask: undefined,
                          }
                        : {}
                      : {
                          sourceImageTaskId: undefined,
                          imageGenerationAttemptId: undefined,
                        }),
                  },
                }
              : node,
          );
          const reconciledNodes = reconcileStoryDirectorImageResults(
            nextNodes,
            connectionsRef.current,
          );
          setNodes(reconciledNodes);
          persistCanvasSnapshot(reconciledNodes);
          directPendingTaskIds.forEach((taskId) =>
            resumedImageTaskIdsRef.current.delete(taskId),
          );
        } finally {
          setRunningNodeId(null);
        }
        return;
      }

      setRunningNodeId(nodeId);
      const sourceTextContent =
        sourceNode?.type === CanvasNodeType.Text
          ? sourceNode.metadata?.content?.trim() || ""
          : "";
      const editingTextNode = mode === "text" && Boolean(sourceTextContent);
      let generationContext;
      try {
        generationContext = await hydrateNodeGenerationContext(
          buildNodeGenerationContext(
            nodeId,
            nodesRef.current,
            connectionsRef.current,
            editingTextNode
              ? `请根据要求修改以下文本。\n\n原文：\n${sourceTextContent}\n\n修改要求：\n${prompt}`
              : prompt,
          ),
        );
      } catch (error) {
        if (
          videoEntryAttemptId &&
          videoGenerationEntryLocksRef.current.get(nodeId) ===
            videoEntryAttemptId
        )
          videoGenerationEntryLocksRef.current.delete(nodeId);
        setRunningNodeId(null);
        message.error(formatCanvasGenerationError(error, "生成输入读取失败"));
        return;
      }
      const effectivePrompt = generationContext.prompt.trim();
      let preparedVideoParameterSnapshot:
        | ReturnType<typeof buildVideoParameterSnapshot>
        | undefined;
      if (mode === "video") {
        const explicitVideoOperation =
          sourceNode?.metadata?.videoGenerationScope?.operation;
        try {
          if (generationContext.inputErrors.length) {
            throw new Error(generationContext.inputErrors[0]);
          }
          preparedVideoParameterSnapshot = buildVideoParameterSnapshot(
            generationConfig,
            generationContext.referenceImages,
            generationContext.referenceVideos,
            requireVideoGenerationOperation(
              explicitVideoOperation,
              sourceNode?.title || "视频节点",
            ),
            sourceNode?.metadata?.videoGenerationSettings || {},
          );
          videoGenerationSettingsToRequest(
            preparedVideoParameterSnapshot.settings,
            preparedVideoParameterSnapshot.capability,
          );
          const promptError = videoPromptPreflightError(
            preparedVideoParameterSnapshot.capability,
            effectivePrompt,
            {
              imageCount: generationContext.referenceImages.length,
              videoCount: generationContext.referenceVideos.length,
              audioCount: generationContext.referenceAudios.length,
            },
          );
          if (promptError) throw new Error(promptError);
        } catch (error) {
          if (
            videoEntryAttemptId &&
            videoGenerationEntryLocksRef.current.get(nodeId) ===
              videoEntryAttemptId
          )
            videoGenerationEntryLocksRef.current.delete(nodeId);
          setRunningNodeId(null);
          message.error(
            formatCanvasGenerationError(error, "视频生成配置校验失败"),
          );
          return;
        }
      }
      const markSourceStatus =
        sourceNode?.type !== CanvasNodeType.Image && !editingTextNode;
      const statusPrompt =
        sourceNode?.type === CanvasNodeType.Config ? effectivePrompt : prompt;
      if (!effectivePrompt && (mode === "text" || mode === "audio")) {
        setRunningNodeId(null);
        return;
      }
      let pendingChildIds: string[] = [];
      if (markSourceStatus)
        setNodes((prev) =>
          prev.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    prompt: statusPrompt,
                    status: NODE_STATUS_LOADING,
                    errorDetails: undefined,
                  },
                }
              : node,
          ),
        );

      try {
        if (mode === "image") {
          const count = getGenerationCount(generationConfig.count);
          const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
          const isImageNode = sourceNode?.type === CanvasNodeType.Image;
          const isEmptyImageNode =
            isImageNode && !sourceNode?.metadata?.content;
          const sourceReference: ReferenceImage[] =
            !options?.referenceImages?.length &&
            isImageNode &&
            sourceNode?.metadata?.content
              ? [
                  {
                    id: sourceNode.id,
                    name: `${sourceNode.title || sourceNode.id}.png`,
                    type: sourceNode.metadata.mimeType || "image/png",
                    dataUrl: sourceNode.metadata.content,
                    storageKey: sourceNode.metadata.storageKey,
                    url: sourceNode.metadata.backendUrl,
                  },
                ]
              : [];
          const collectedReferenceImages: ReferenceImage[] = options?.referenceImages?.length
            ? options.referenceImages
            : sourceReference.length
              ? sourceReference
              : generationContext.referenceImages;
          const imageOperation = resolveCanvasImageOperation(sourceNode?.metadata, {
            referenceCount: collectedReferenceImages.length,
            hasImageContent: Boolean(sourceNode?.metadata?.content),
          });
          if (!imageOperation) {
            const errorDetails =
              "缺少已持久化的图片 operation；请选择图片操作。所有参考图保持原样。";
            message.error(errorDetails);
            const nextNodes = nodesRef.current.map((node) =>
              node.id === nodeId
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      status: NODE_STATUS_ERROR,
                      errorDetails,
                    },
                  }
                : node,
            );
            setNodes(nextNodes);
            persistCanvasSnapshot(nextNodes);
            setRunningNodeId(null);
            return;
          }
          const requestImageConfig = applyActiveNodeImageAdvancedSnapshot(
            generationConfig,
            sourceNode?.metadata,
            imageOperation,
          );
          const referenceImages = collectedReferenceImages;
          const imageOperationPrompt = imageOperation === "variation" ? "" : effectivePrompt;
          const selectedEditTargets =
            isImageNode &&
            sourceNode?.metadata?.content &&
            selectedNodeIdsRef.current.has(sourceNode.id)
              ? nodesRef.current.filter(
                  (node) =>
                    selectedNodeIdsRef.current.has(node.id) &&
                    node.type === CanvasNodeType.Image &&
                    Boolean(node.metadata?.content) &&
                    !isStoryDirectorGeneratedImage(
                      node,
                      nodesRef.current,
                      connectionsRef.current,
                    ),
                )
              : [];
          const editTargetNodes = imageOperation === "edit"
            ? selectedEditTargets.length ? selectedEditTargets : isImageNode && sourceNode?.metadata?.content && !isStoryDirectorGeneratedImage(sourceNode, nodesRef.current, connectionsRef.current) ? [sourceNode] : []
            : [];
          if (editTargetNodes.length) {
            const editSourceNode = sourceNode || editTargetNodes[0];
            const editCount = Math.max(1, count);
            const parentPosition = editSourceNode.position;
            const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
            const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
            const editTargetReferences = editTargetNodes.flatMap((targetNode) =>
              canvasImageReferenceFromNode(
                targetNode,
                `${targetNode.title || targetNode.id}.png`,
              ),
            );
            if (!editTargetReferences.length) {
              setRunningNodeId(null);
              return;
            }
            const editPlan = buildCanvasImageEditPlan(
              effectivePrompt,
              editTargetReferences,
              [
                ...generationContext.referenceImages,
                ...(options?.referenceImages || []),
              ],
            );
            const editPrompt = editPlan.prompt;
            const editReferences = editPlan.references;
            await preflightImageRequest(requestImageConfig, "edit", editPrompt, editReferences, undefined, "imageGeneration");
            const promptNode = createPromptNodeForGeneration(editPrompt, {
              x: parentPosition.x + editSourceNode.width + 96,
              y:
                parentPosition.y +
                editSourceNode.height / 2 -
                textConfig.height / 2,
            });
            const resultIds = Array.from({ length: editCount }, () => nanoid());
            let nextSequenceNumber = nextImageSequenceNumber(nodesRef.current);
            pendingChildIds = [promptNode.id, ...resultIds];
            const generationMetadata = buildImageGenerationMetadata(
              "edit",
              requestImageConfig,
              editCount,
              editReferences,
            );
            const resultNodes: CanvasNodeData[] = resultIds.map((id, index) => {
              const column = Math.floor(index / 3);
              const row = index % 3;
              const rowsInColumn = Math.min(3, resultIds.length - column * 3);
              const columnHeight =
                rowsInColumn * imageConfig.height +
                Math.max(rowsInColumn - 1, 0) * 36;
              return {
                id,
                type: CanvasNodeType.Image,
                title: editPrompt.slice(0, 32) || "Edited Image",
                position: {
                  x:
                    promptNode.position.x +
                    promptNode.width +
                    96 +
                    column * (imageConfig.width + 120),
                  y:
                    promptNode.position.y +
                    promptNode.height / 2 -
                    columnHeight / 2 +
                    row * (imageConfig.height + 36),
                },
                width: imageConfig.width,
                height: imageConfig.height,
                metadata: {
                  prompt: editPrompt,
                  imageSequenceNumber: nextSequenceNumber++,
                  status: NODE_STATUS_LOADING,
                  ...generationMetadata,
                },
              };
            });
            const pendingNodes = [
              ...nodesRef.current.map((node) =>
                node.id === editSourceNode.id
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        prompt,
                        status: NODE_STATUS_SUCCESS,
                        errorDetails: undefined,
                      },
                    }
                  : node,
              ),
              promptNode,
              ...resultNodes,
            ];
            const pendingConnections = [
              ...connectionsRef.current,
              ...editTargetNodes.map((targetNode) => ({
                id: nanoid(),
                fromNodeId: targetNode.id,
                toNodeId: promptNode.id,
              })),
              ...resultNodes.map((resultNode) => ({
                id: nanoid(),
                fromNodeId: promptNode.id,
                toNodeId: resultNode.id,
              })),
            ];
            setNodes(pendingNodes);
            setConnections(pendingConnections);
            persistCanvasSnapshot(pendingNodes, pendingConnections);
            setSelectedNodeIds(new Set([resultNodes[0].id]));
            setSelectedConnectionId(null);
            setDialogNodeId(resultNodes[0].id);

            let hasSuccess = false;
            let hasFailure = false;
            let firstFailureDetails = "";
            const batchTargets = resultIds.map((targetId) => ({
              targetId,
              taskId: `canvas-${targetId}`,
            }));
            const taskIdByTargetId = new Map(
              batchTargets.map((target) => [target.targetId, target.taskId]),
            );
            batchTargets.forEach(({ taskId }) =>
              resumedImageTaskIdsRef.current.add(taskId),
            );
            const taskNodes = nodesRef.current.map((node) => {
              const taskId = taskIdByTargetId.get(node.id);
              return taskId
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      sourceImageTaskId: undefined,
                      imageGenerationAttemptId: taskId,
                    },
                  }
                : node;
            });
            setNodes(taskNodes);
            persistCanvasSnapshot(taskNodes);
            const batchOutcomes = await requestCanvasImageBatch(
              batchTargets,
              requestImageConfig,
              "edit",
              editPrompt,
              editReferences,
              { onNativeTaskSubmitted: persistNativeImageTaskBindings },
            );
            await Promise.all(
              batchOutcomes.map(async (outcome) => {
                const resultId = outcome.targetId;
                const taskId = taskIdByTargetId.get(resultId)!;
                try {
                  if (outcome.status === "rejected") throw outcome.reason;
                  const image = outcome.value;
                  const uploaded = await uploadImage(
                    image.dataUrl,
                    CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
                  );
                  hasSuccess = true;
                  const imageSize = imageNodeSize(
                    uploaded.width,
                    uploaded.height,
                    imageConfig.width,
                  );
                  const nextNodes = nodesRef.current.map((node) => {
                    if (node.id !== resultId) return node;
                    if (
                      node.metadata?.sourceImageTaskId !== taskId &&
                      node.metadata?.imageGenerationAttemptId !== taskId &&
                      !ownsCanvasImageTask(
                        node.metadata?.imageGenerationTask,
                        taskId,
                      )
                    )
                      return node;
                    const center = {
                      x: node.position.x + node.width / 2,
                      y: node.position.y + node.height / 2,
                    };
                    return {
                      ...node,
                      position: {
                        x: center.x - imageSize.width / 2,
                        y: center.y - imageSize.height / 2,
                      },
                      width: imageSize.width,
                      height: imageSize.height,
                      metadata: {
                        ...node.metadata,
                        ...imageMetadata(uploaded, image),
                      },
                    };
                  });
                  setNodes(nextNodes);
                  persistCanvasSnapshot(nextNodes);
                } catch (error) {
                  hasFailure = true;
                  const errorDetails =
                    error instanceof Error ? error.message : "图片保存失败";
                  firstFailureDetails ||= errorDetails;
                  const terminal = error instanceof NativeImageTaskTerminalError;
                  const nextNodes = nodesRef.current.map((node) =>
                    node.id === resultId &&
                    (node.metadata?.imageGenerationAttemptId === taskId ||
                      ownsCanvasImageTask(
                        node.metadata?.imageGenerationTask,
                        taskId,
                      ))
                      ? {
                          ...node,
                          metadata: {
                            ...node.metadata,
                            status: NODE_STATUS_ERROR,
                            errorDetails,
                            ...(node.metadata?.imageGenerationTask
                              ? terminal
                                ? {
                                    sourceImageTaskId: undefined,
                                    imageGenerationTask: undefined,
                                  }
                                : {}
                              : {
                                  sourceImageTaskId: undefined,
                                  imageGenerationAttemptId: undefined,
                                }),
                          },
                        }
                      : node,
                  );
                  setNodes(nextNodes);
                  persistCanvasSnapshot(nextNodes);
                } finally {
                  resumedImageTaskIdsRef.current.delete(taskId);
                }
              }),
            );
            if (hasFailure)
              message.error(
                hasSuccess
                  ? `部分图片生成失败：${firstFailureDetails}`
                  : firstFailureDetails || "全部图片生成失败",
              );
            return;
          }
          if (
            shouldUseStoryDirectorGenerationRules(
              sourceNode,
              nodesRef.current,
              connectionsRef.current,
            ) &&
            !referenceImages.length &&
            referencesImageLabel(effectivePrompt)
          ) {
            message.warning(
              "提示词提到了图片编号，但没有收集到参考图，请检查连线",
            );
            setRunningNodeId(null);
            return;
          }
          await preflightImageRequest(
            requestImageConfig,
            imageOperation,
            imageOperationPrompt,
            referenceImages,
            undefined,
            "imageGeneration",
            { useReferenceLabels: shouldUseStoryDirectorGenerationRules(sourceNode, nodesRef.current, connectionsRef.current) },
          );
          const generationMetadata = buildImageGenerationMetadata(
            imageOperation,
            requestImageConfig,
            count,
            referenceImages,
          );
          const parentConfig =
            NODE_DEFAULT_SIZE[
              isConfigNode
                ? CanvasNodeType.Config
                : isImageNode
                  ? CanvasNodeType.Image
                  : CanvasNodeType.Text
            ];
          const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
          const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
          const parentPosition = sourceNode?.position || { x: 0, y: 0 };
          const gap = 96;
          const rowGap = 36;
          const resultGap = 120;
          const shouldUseCurrentNodeAsPrompt =
            isEmptyImageNode || (!isConfigNode && !isImageNode);
          const shouldCreatePromptNode = isImageNode && !isEmptyImageNode;
          const promptNodePosition = {
            x: parentPosition.x + parentConfig.width + gap,
            y:
              parentPosition.y +
              parentConfig.height / 2 -
              textConfig.height / 2,
          };
          const promptNode = shouldCreatePromptNode
            ? createPromptNodeForGeneration(effectivePrompt, promptNodePosition)
            : null;
          const shouldReplaceCurrentImageNode = isEmptyImageNode && count === 1;
          const targetIds = Array.from({ length: count }, (_, index) =>
            shouldReplaceCurrentImageNode && index === 0 ? nodeId : nanoid(),
          );
          const newTargetIds = shouldReplaceCurrentImageNode
            ? targetIds.slice(1)
            : targetIds;
          const rootId = targetIds[0];
          let nextSequenceNumber = nextImageSequenceNumber(nodesRef.current);
          pendingChildIds = [
            ...newTargetIds,
            ...(promptNode ? [promptNode.id] : []),
          ];
          const resultAnchor = promptNode || sourceNode;
          const resultAnchorPosition = resultAnchor?.position || parentPosition;
          const resultAnchorWidth = resultAnchor?.width || parentConfig.width;
          const resultAnchorHeight =
            resultAnchor?.height || parentConfig.height;
          const resultColumnSize = 3;
          const resultBaseX = resultAnchorPosition.x + resultAnchorWidth + gap;
          const resultCenterY = resultAnchorPosition.y + resultAnchorHeight / 2;
          const resultNodes: CanvasNodeData[] = targetIds.map((id, index) => {
            const column = Math.floor(index / resultColumnSize);
            const row = index % resultColumnSize;
            const rowsInColumn = Math.min(
              resultColumnSize,
              count - column * resultColumnSize,
            );
            const columnHeight =
              rowsInColumn * imageConfig.height +
              Math.max(rowsInColumn - 1, 0) * rowGap;
            return {
              id,
              type: CanvasNodeType.Image,
              title: effectivePrompt.slice(0, 32) || "Generated Image",
              position: {
                x: resultBaseX + column * (imageConfig.width + resultGap),
                y:
                  resultCenterY -
                  columnHeight / 2 +
                  row * (imageConfig.height + rowGap),
              },
              width: imageConfig.width,
              height: imageConfig.height,
              metadata: {
                prompt: effectivePrompt,
                imageSequenceNumber:
                  shouldReplaceCurrentImageNode &&
                  index === 0 &&
                  sourceNode?.metadata?.imageSequenceNumber
                    ? sourceNode.metadata.imageSequenceNumber
                    : nextSequenceNumber++,
                status: NODE_STATUS_LOADING,
                ...generationMetadata,
              },
            };
          });
          const newResultNodes = shouldReplaceCurrentImageNode
            ? resultNodes.slice(1)
            : resultNodes;
          const batchConnections = promptNode
            ? [
                { id: nanoid(), fromNodeId: nodeId, toNodeId: promptNode.id },
                ...targetIds.map((targetId) => ({
                  id: nanoid(),
                  fromNodeId: promptNode.id,
                  toNodeId: targetId,
                })),
              ]
            : newTargetIds.map((targetId) => ({
                id: nanoid(),
                fromNodeId: nodeId,
                toNodeId: targetId,
              }));

          const pendingNodes = [
            ...nodesRef.current.map((node) =>
              node.id === nodeId
                ? isConfigNode
                  ? {
                      ...node,
                      metadata: {
                        ...node.metadata,
                        prompt: effectivePrompt,
                        status: NODE_STATUS_LOADING,
                        errorDetails: undefined,
                      },
                    }
                  : shouldReplaceCurrentImageNode
                    ? {
                        ...node,
                        ...resultNodes[0],
                        position: node.position,
                        metadata: {
                          ...node.metadata,
                          ...resultNodes[0].metadata,
                        },
                      }
                    : shouldUseCurrentNodeAsPrompt
                      ? {
                          ...node,
                          type: CanvasNodeType.Text,
                          title: "提示词",
                          width: textConfig.width,
                          height: textConfig.height,
                          metadata: {
                            ...node.metadata,
                            content: effectivePrompt,
                            prompt: effectivePrompt,
                            status: NODE_STATUS_SUCCESS,
                            fontSize: 14,
                            errorDetails: undefined,
                          },
                        }
                      : isImageNode
                        ? {
                            ...node,
                            metadata: {
                              ...node.metadata,
                              prompt,
                              status: NODE_STATUS_SUCCESS,
                              errorDetails: undefined,
                            },
                          }
                        : {
                            ...node,
                            type: CanvasNodeType.Text,
                            title: prompt.slice(0, 32) || "Prompt",
                            width: parentConfig.width,
                            height: parentConfig.height,
                            metadata: {
                              ...node.metadata,
                              content: prompt,
                              prompt,
                              status: NODE_STATUS_SUCCESS,
                              fontSize: 14,
                              errorDetails: undefined,
                            },
                          }
                : node,
            ),
            ...(promptNode ? [promptNode] : []),
            ...newResultNodes,
          ];
          const pendingConnections = [
            ...connectionsRef.current,
            ...batchConnections,
          ];
          setNodes(pendingNodes);
          setConnections(pendingConnections);
          persistCanvasSnapshot(pendingNodes, pendingConnections);
          setSelectedNodeIds(new Set([rootId]));
          setSelectedConnectionId(null);
          setDialogNodeId(rootId);

          let hasSuccess = false;
          let hasFailure = false;
          let firstFailureDetails = "";
          const batchTargets = targetIds.map((targetId) => ({
            targetId,
            taskId: `canvas-${targetId}`,
          }));
          const taskIdByTargetId = new Map(
            batchTargets.map((target) => [target.targetId, target.taskId]),
          );
          batchTargets.forEach(({ taskId }) =>
            resumedImageTaskIdsRef.current.add(taskId),
          );
          const taskNodes = nodesRef.current.map((node) => {
            const taskId = taskIdByTargetId.get(node.id);
            return taskId
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    sourceImageTaskId: undefined,
                    imageGenerationAttemptId: taskId,
                  },
                }
              : node;
          });
          setNodes(taskNodes);
          persistCanvasSnapshot(taskNodes);
          const batchOutcomes = await requestCanvasImageBatch(
            batchTargets,
            requestImageConfig,
            imageOperation,
            imageOperationPrompt,
            referenceImages,
            {
              useReferenceLabels: shouldUseStoryDirectorGenerationRules(
                sourceNode,
                nodesRef.current,
                connectionsRef.current,
              ),
              onNativeTaskSubmitted: persistNativeImageTaskBindings,
            },
          );
          await Promise.all(
            batchOutcomes.map(async (outcome) => {
              const targetId = outcome.targetId;
              const taskId = taskIdByTargetId.get(targetId)!;
              try {
                if (outcome.status === "rejected") throw outcome.reason;
                const image = outcome.value;
                const uploaded = await uploadImage(
                  image.dataUrl,
                  CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
                );
                hasSuccess = true;
                const imageSize = imageNodeSize(
                  uploaded.width,
                  uploaded.height,
                  imageConfig.width,
                );
                const nextNodes = nodesRef.current.map((node) => {
                  if (node.id !== targetId) return node;
                  if (
                    node.metadata?.sourceImageTaskId !== taskId &&
                    node.metadata?.imageGenerationAttemptId !== taskId &&
                    !ownsCanvasImageTask(
                      node.metadata?.imageGenerationTask,
                      taskId,
                    )
                  )
                    return node;
                  const center = {
                    x: node.position.x + node.width / 2,
                    y: node.position.y + node.height / 2,
                  };
                  return {
                    ...node,
                    position: {
                      x: center.x - imageSize.width / 2,
                      y: center.y - imageSize.height / 2,
                    },
                    width: imageSize.width,
                    height: imageSize.height,
                    metadata: {
                      ...node.metadata,
                      ...imageMetadata(uploaded, image),
                    },
                  };
                });
                setNodes(nextNodes);
                persistCanvasSnapshot(nextNodes);
                if (isConfigNode) {
                  const configDoneNodes = nodesRef.current.map((node) =>
                    node.id === nodeId
                      ? {
                          ...node,
                          metadata: {
                            ...node.metadata,
                            status: NODE_STATUS_SUCCESS,
                            errorDetails: undefined,
                          },
                        }
                      : node,
                  );
                  setNodes(configDoneNodes);
                  persistCanvasSnapshot(configDoneNodes);
                }
              } catch (error) {
                hasFailure = true;
                const errorDetails =
                  error instanceof Error ? error.message : "图片保存失败";
                firstFailureDetails ||= errorDetails;
                const terminal = error instanceof NativeImageTaskTerminalError;
                const nextNodes = nodesRef.current.map((node) =>
                  node.id === targetId &&
                  (node.metadata?.imageGenerationAttemptId === taskId ||
                    ownsCanvasImageTask(
                      node.metadata?.imageGenerationTask,
                      taskId,
                    ))
                    ? {
                        ...node,
                        metadata: {
                          ...node.metadata,
                          status: NODE_STATUS_ERROR,
                          errorDetails,
                          ...(node.metadata?.imageGenerationTask
                            ? terminal
                              ? {
                                  sourceImageTaskId: undefined,
                                  imageGenerationTask: undefined,
                                }
                              : {}
                            : {
                                sourceImageTaskId: undefined,
                                imageGenerationAttemptId: undefined,
                              }),
                        },
                      }
                    : node,
                );
                setNodes(nextNodes);
                persistCanvasSnapshot(nextNodes);
              } finally {
                resumedImageTaskIdsRef.current.delete(taskId);
              }
            }),
          );
          if (hasFailure)
            message.error(
              hasSuccess
                ? `部分图片生成失败：${firstFailureDetails}`
                : firstFailureDetails || "全部图片生成失败",
            );
          const finalNodes = nodesRef.current.map((node) =>
            node.id === nodeId && isConfigNode
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: hasSuccess
                      ? NODE_STATUS_SUCCESS
                      : NODE_STATUS_ERROR,
                    errorDetails: hasSuccess
                      ? undefined
                      : firstFailureDetails || "全部图片生成失败",
                  },
                }
              : node.id === rootId && !hasSuccess
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      status: NODE_STATUS_ERROR,
                      errorDetails:
                        firstFailureDetails || "全部图片生成失败",
                    },
                  }
                : node,
          );
          setNodes(finalNodes);
          persistCanvasSnapshot(finalNodes);
          return;
        }

        if (mode === "video") {
          const parameterSnapshot = preparedVideoParameterSnapshot!;
          const startedAt = new Date().toISOString();
          const pendingAttempt: VideoGenerationAttempt = {
            id: videoEntryAttemptId!,
            kind: "native",
            provider: "customer",
            providerId: parameterSnapshot.scope.providerId,
            model: parameterSnapshot.scope.model,
            startedAt,
          };
          const spec =
            nodeSizeFromRatio(
              generationConfig.size,
              NODE_DEFAULT_SIZE[CanvasNodeType.Video].width,
              NODE_DEFAULT_SIZE[CanvasNodeType.Video].height,
            ) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
          const isEmptyVideoNode =
            sourceNode?.type === CanvasNodeType.Video &&
            !sourceNode.metadata?.content;
          const videoId = isEmptyVideoNode ? nodeId : nanoid();
          const parent = sourceNode?.position || { x: 0, y: 0 };
          const videoNode: CanvasNodeData = {
            id: videoId,
            type: CanvasNodeType.Video,
            title: effectivePrompt.slice(0, 32) || "Generated Video",
            position: isEmptyVideoNode
              ? sourceNode.position
              : {
                  x: parent.x + (sourceNode?.width || spec.width) + 96,
                  y: parent.y,
                },
            width: isEmptyVideoNode ? sourceNode.width : spec.width,
            height: isEmptyVideoNode ? sourceNode.height : spec.height,
            metadata: {
              prompt: effectivePrompt,
              status: NODE_STATUS_LOADING,
              model: generationConfig.model,
              modelProviderId: parameterSnapshot.scope.providerId,
              size: generationConfig.size,
              seconds: generationConfig.videoSeconds,
              vquality: generationConfig.vquality,
              generateAudio: generationConfig.videoGenerateAudio,
              watermark: generationConfig.videoWatermark,
              references: generationReferenceUrls(generationContext),
              videoGenerationSettings: parameterSnapshot.settings,
              videoGenerationScope: parameterSnapshot.scope,
              videoGenerationCapabilityId: parameterSnapshot.capabilityId,
              videoWireFormat: parameterSnapshot.wireFormat,
              videoGenerationAttempt: pendingAttempt,
            },
          };
          pendingChildIds = [videoId];
          const pendingVideoNodes = isEmptyVideoNode
            ? nodesRef.current.map((node) =>
                node.id === nodeId ? { ...node, ...videoNode } : node,
              )
            : [
                ...nodesRef.current.map((node) =>
                  node.id === nodeId
                    ? {
                        ...node,
                        metadata: {
                          ...node.metadata,
                          status: NODE_STATUS_SUCCESS,
                        },
                      }
                    : node,
                ),
                videoNode,
              ];
          const pendingVideoConnections = isEmptyVideoNode
            ? connectionsRef.current
            : [
                ...connectionsRef.current,
                { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId },
              ];
          nodesRef.current = pendingVideoNodes;
          setNodes(pendingVideoNodes);
          setConnections(pendingVideoConnections);
          persistCanvasSnapshot(pendingVideoNodes, pendingVideoConnections);
          await flushCanvasPersistence();
          const task = await createVideoGenerationTask(
            generationConfig,
            effectivePrompt,
            generationContext.referenceImages,
            generationContext.referenceVideos,
            generationContext.referenceAudios,
            "videoGeneration",
            {
              generationParameters: parameterSnapshot.settings,
              operation: parameterSnapshot.scope.operation,
            },
          );
          const taskAttempt = withVideoAttemptTaskId(
            { ...pendingAttempt, provider: task.provider },
            task.id,
          );
          const snapshot = snapshotCreatedCanvasVideoTask(
            task,
            startedAt,
            taskAttempt.id,
            parameterSnapshot.scope.operation,
          );
          const taskNodes = nodesRef.current.map((node) =>
            node.id === videoId &&
            ownsVideoGenerationAttempt(node.metadata, pendingAttempt)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    videoGenerationTask: snapshot,
                    videoGenerationAttempt: taskAttempt,
                  },
                }
              : node,
          );
          nodesRef.current = taskNodes;
          setNodes(taskNodes);
          persistCanvasSnapshot(taskNodes, pendingVideoConnections);
          await flushCanvasPersistence();
          resumedVideoTaskIdsRef.current.add(
            videoTaskControllerKey({
              provider: task.provider,
              providerId: snapshot.providerId,
              nodeId: videoId,
              taskId: task.id,
            }),
          );
          await resumeCanvasVideoTask(videoId, snapshot);
          return;
        }

        if (mode === "audio") {
          const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
          const isEmptyAudioNode =
            sourceNode?.type === CanvasNodeType.Audio &&
            !sourceNode.metadata?.content;
          const audioId = isEmptyAudioNode ? nodeId : nanoid();
          const parent = sourceNode?.position || { x: 0, y: 0 };
          const audioNode: CanvasNodeData = {
            id: audioId,
            type: CanvasNodeType.Audio,
            title: effectivePrompt.slice(0, 32) || "Generated Audio",
            position: isEmptyAudioNode
              ? sourceNode.position
              : {
                  x: parent.x + (sourceNode?.width || spec.width) + 96,
                  y:
                    parent.y +
                    ((sourceNode?.height || spec.height) - spec.height) / 2,
                },
            width: isEmptyAudioNode ? sourceNode.width : spec.width,
            height: isEmptyAudioNode ? sourceNode.height : spec.height,
            metadata: {
              prompt: effectivePrompt,
              status: NODE_STATUS_LOADING,
              ...buildAudioGenerationMetadata(generationConfig),
            },
          };
          pendingChildIds = [audioId];
          setNodes((prev) =>
            isEmptyAudioNode
              ? prev.map((node) =>
                  node.id === nodeId ? { ...node, ...audioNode } : node,
                )
              : [
                  ...prev.map((node) =>
                    node.id === nodeId
                      ? {
                          ...node,
                          metadata: {
                            ...node.metadata,
                            status: NODE_STATUS_SUCCESS,
                          },
                        }
                      : node,
                  ),
                  audioNode,
                ],
          );
          if (!isEmptyAudioNode)
            setConnections((prev) => [
              ...prev,
              { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId },
            ]);
          const audio = await storeGeneratedAudio(
            await requestAudioGeneration(generationConfig, effectivePrompt),
            generationConfig.audioFormat,
          );
          setNodes((prev) =>
            prev.map((node) =>
              node.id === audioId
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      ...audioMetadata(audio),
                      prompt: effectivePrompt,
                      ...buildAudioGenerationMetadata(generationConfig),
                    },
                  }
                : node,
            ),
          );
          return;
        }

        const textGenerationIdentity = resolveGenerationMetadataModelIdentity(
          generationConfig,
          "text",
          "imagePrompt",
        );
        let streamed = "";
        const isConfigNode = sourceNode?.type === CanvasNodeType.Config;
        const textCount = isConfigNode
          ? getGenerationCount(generationConfig.count)
          : 1;
        const parentConfig =
          NODE_DEFAULT_SIZE[
            isConfigNode ? CanvasNodeType.Config : CanvasNodeType.Text
          ];
        const textConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Text];
        const parentPosition = sourceNode?.position || { x: 0, y: 0 };
        const childIds =
          isConfigNode || editingTextNode
            ? Array.from({ length: textCount }, () => nanoid())
            : [];
        pendingChildIds = childIds;
        if (isConfigNode || editingTextNode) {
          const childNodes: CanvasNodeData[] = childIds.map((id, index) => ({
            id,
            type: CanvasNodeType.Text,
            title: effectivePrompt.slice(0, 32) || "Generated Text",
            position: {
              x: parentPosition.x + parentConfig.width + 96,
              y:
                parentPosition.y +
                parentConfig.height / 2 -
                textConfig.height / 2 +
                (index - (textCount - 1) / 2) * (textConfig.height + 36),
            },
            width: textConfig.width,
            height: textConfig.height,
            metadata: {
              prompt: effectivePrompt,
              status: NODE_STATUS_LOADING,
              fontSize: 14,
              ...textGenerationIdentity,
            },
          }));
          setNodes((prev) => [
            ...prev.map((node) =>
              node.id === nodeId && isConfigNode
                ? {
                    ...node,
                    metadata: {
                      ...node.metadata,
                      prompt: effectivePrompt,
                      status: NODE_STATUS_LOADING,
                      errorDetails: undefined,
                    },
                  }
                : node,
            ),
            ...childNodes,
          ]);
          setConnections((prev) => [
            ...prev,
            ...childIds.map((childId) => ({
              id: nanoid(),
              fromNodeId: nodeId,
              toNodeId: childId,
            })),
          ]);
        }

        const answers = await Promise.all(
          (childIds.length ? childIds : [nodeId]).map((targetNodeId) => {
            let localStreamed = "";
            return requestImageQuestion(
              generationConfig,
              buildNodeChatMessages({
                ...generationContext,
                prompt: effectivePrompt,
              }),
              (text) => {
                localStreamed = text;
                streamed = text;
                if (isConfigNode) return;
                setNodes((prev) =>
                  prev.map((node) =>
                    node.id === targetNodeId
                      ? {
                          ...node,
                          type: CanvasNodeType.Text,
                          metadata: {
                            ...node.metadata,
                            content: text,
                            status: NODE_STATUS_LOADING,
                          },
                        }
                      : node,
                  ),
                );
              },
              { boardRouteKey: "imagePrompt" },
            ).then((answer) => ({
              nodeId: targetNodeId,
              content: answer || localStreamed,
            }));
          }),
        );
        const answerByNodeId = new Map(
          answers.map((item) => [item.nodeId, item.content]),
        );
        setNodes((prev) =>
          prev.map((node) =>
            childIds.includes(node.id)
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    content: answerByNodeId.get(node.id) || streamed,
                    status: NODE_STATUS_SUCCESS,
                    ...textGenerationIdentity,
                  },
                }
              : node.id === nodeId && isConfigNode
                ? {
                    ...node,
                    metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS },
                  }
                : node.id === nodeId && !editingTextNode
                  ? {
                      ...node,
                      type: CanvasNodeType.Text,
                      title: prompt.slice(0, 32) || "Generated Text",
                      metadata: {
                        ...node.metadata,
                        content: answerByNodeId.get(node.id) || streamed,
                        status: NODE_STATUS_SUCCESS,
                        ...textGenerationIdentity,
                      },
                    }
                  : node,
          ),
        );
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(error);
        message.error(errorDetails);
        const nextNodes = nodesRef.current.map((node) =>
          (node.id === nodeId || pendingChildIds.includes(node.id)) &&
          (mode !== "video" ||
            ownsVideoGenerationAttempt(node.metadata, {
              id: videoEntryAttemptId!,
              provider:
                node.metadata?.videoGenerationAttempt?.provider || "customer",
              providerId:
                node.metadata?.videoGenerationAttempt?.providerId,
            }))
            ? node.id === nodeId && !markSourceStatus
              ? node
              : {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    ...(mode === "video"
                      ? {
                          videoGenerationTask: undefined,
                          videoGenerationAttempt: undefined,
                        }
                      : {}),
                  },
                }
            : node,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } finally {
        if (
          videoEntryAttemptId &&
          videoGenerationEntryLocksRef.current.get(nodeId) ===
            videoEntryAttemptId
        )
          videoGenerationEntryLocksRef.current.delete(nodeId);
        setRunningNodeId(null);
      }
    } finally {
      nodeGenerationLocksRef.current.delete(nodeId);
    }
    },
    [effectiveConfig, openConfigDialog, persistCanvasSnapshot],
  );

  const handleRetryNode = useCallback(
    async (node: CanvasNodeData) => {
      if (node.type === CanvasNodeType.Config) {
        await handleGenerateNode(
          node.id,
          node.metadata?.generationMode || "image",
          node.metadata?.composerContent ?? node.metadata?.prompt ?? "",
        );
        return;
      }
      if (nodeGenerationLocksRef.current.has(node.id)) return;
      nodeGenerationLocksRef.current.add(node.id);
      try {
      const persistedNativeVideoTask =
        node.type === CanvasNodeType.Video
          ? node.metadata?.videoGenerationTask
          : undefined;
      const persistedCustomerTask =
        node.type === CanvasNodeType.Video &&
        node.metadata?.seedanceGenerationTaskState?.taskId &&
        node.metadata.seedanceGenerationTaskState.startedAt &&
        node.metadata.videoGenerationAttempt
          ? node.metadata.seedanceGenerationTaskState
          : undefined;
      if (persistedNativeVideoTask) {
        const controllerKey = videoTaskControllerKey({
          provider: persistedNativeVideoTask.provider,
          providerId: persistedNativeVideoTask.providerId,
          nodeId: node.id,
          taskId: persistedNativeVideoTask.id,
        });
        if (videoTaskControllersRef.current.has(controllerKey)) {
          message.warning("该视频任务仍在查询中");
          return;
        }
        resumedVideoTaskIdsRef.current.add(controllerKey);
        await resumeCanvasVideoTask(
          node.id,
          persistedNativeVideoTask,
          new Date().toISOString(),
        );
        return;
      }
      if (persistedCustomerTask) {
        const controllerKey = videoTaskControllerKey({
          provider: node.metadata!.videoGenerationAttempt!.provider,
          providerId: node.metadata!.videoGenerationAttempt!.providerId,
          nodeId: node.id,
          taskId: persistedCustomerTask.taskId!,
        });
        if (videoTaskControllersRef.current.has(controllerKey)) {
          message.warning("该视频任务仍在查询中");
          return;
        }
        resumedVideoTaskIdsRef.current.add(controllerKey);
        await resumeCustomerSeedanceTask(
          node.id,
          persistedCustomerTask.taskId!,
          persistedCustomerTask.startedAt!,
          node.metadata!.videoGenerationAttempt,
          new Date().toISOString(),
        );
        return;
      }
      if (
        node.type === CanvasNodeType.Image &&
        !String(node.metadata?.content || "").trim() &&
        shouldPreferCanvasImageRecoveryRetry(node) &&
        (!hasActiveCanvasImageGeneration(node.metadata) ||
          shouldSkipLegacyImageTaskResume(node.metadata))
      ) {
        try {
          const recovered = await recoverCanvasImageNode(node);
          if (
            recovered.metadata?.content &&
            recovered.metadata.status !== NODE_STATUS_ERROR
          ) {
            const nextNodes = mergeHydratedCanvasMedia(
              nodesRef.current,
              [node],
              [recovered],
            );
            nodesRef.current = nextNodes;
            setNodes(nextNodes);
            persistCanvasSnapshot(nextNodes);
            await flushCanvasPersistence().catch(() => undefined);
            return;
          }
        } catch {
          // Keep the existing fail-closed generation retry path when media recovery fails.
        }
      }
      const sourceNode =
        findRetrySourceNode(
          node.id,
          nodesRef.current,
          connectionsRef.current,
        ) || node;
      const retrySourceNode = sourceNode || node;
      const batchRoot = node.metadata?.batchRootId
        ? nodesRef.current.find(
            (item) => item.id === node.metadata?.batchRootId,
          )
        : null;
      const savedImageMetadata =
        node.type === CanvasNodeType.Image
          ? { ...batchRoot?.metadata, ...node.metadata }
          : undefined;
      const hasSavedImageMetadata = Boolean(savedImageMetadata?.imageOperation || savedImageMetadata?.generationType);
      const savedGenerationType = savedImageMetadata?.generationType;
      const savedImageOperation = savedImageMetadata?.imageOperation ||
        (savedGenerationType === "edit"
          ? "edit"
          : savedGenerationType === "generation"
            ? "generate"
            : undefined);
      const savedImageRoute = savedImageMetadata?.imageAdvancedScope?.providerId &&
        savedImageMetadata.imageAdvancedScope.model
        ? savedImageMetadata.imageAdvancedScope
        : savedImageMetadata?.modelProviderId && savedImageMetadata.model
          ? {
              providerId: savedImageMetadata.modelProviderId,
              model: savedImageMetadata.model,
            }
          : undefined;
      if (node.type === CanvasNodeType.Image && (!savedImageOperation || !savedImageRoute)) {
        const errorDetails =
          "图片重试缺少已保存的精确 operation/provider/model 路由，已阻止使用当前配置提交";
        message.error(errorDetails);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return;
      }
      const baseGenerationConfig =
        hasSavedImageMetadata && savedImageMetadata
          ? {
              ...effectiveConfig,
              model:
                savedImageMetadata.model &&
                modelMatchesCapability(savedImageMetadata.model, "image")
                  ? savedImageMetadata.model
                  : effectiveConfig.imageModel || effectiveConfig.model,
              quality: savedImageMetadata.quality || effectiveConfig.quality,
              size:
                typeof savedImageMetadata.size === "string"
                  ? savedImageMetadata.size
                  : effectiveConfig.size,
              count: "1",
            }
          : {
              ...buildGenerationConfig(
                effectiveConfig,
                sourceNode,
                node.type === CanvasNodeType.Text
                  ? "text"
                  : node.type === CanvasNodeType.Video
                    ? "video"
                    : node.type === CanvasNodeType.Audio
                      ? "audio"
                      : "image",
              ),
              count: "1",
            };
      const generationConfig =
        node.type === CanvasNodeType.Image
          ? restoreCanvasImageRetryConfig(
              baseGenerationConfig,
              savedImageMetadata?.imageAdvancedScope
                ? savedImageMetadata
                : savedImageRoute && savedImageOperation
                  ? {
                      ...savedImageMetadata,
                      imageAdvancedScope: {
                        ...savedImageRoute,
                        operation: savedImageOperation,
                      },
                    }
                  : savedImageMetadata || node.metadata,
            )
          : baseGenerationConfig;
      const isStoryDirectorImage = isStoryDirectorGeneratedImage(
        node,
        nodesRef.current,
        connectionsRef.current,
      );

      if (!isAiConfigReady(generationConfig, generationConfig.model)) {
        openConfigDialog(true);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: "请先完成模型配置后再重试",
                  },
                }
              : item,
          ),
        );
        return;
      }

      const context = hasSavedImageMetadata
          ? null
          : await hydrateNodeGenerationContext(
              buildNodeGenerationContext(
                retrySourceNode.id,
                nodesRef.current,
                connectionsRef.current,
                retrySourceNode.metadata?.prompt || node.metadata?.prompt || "",
              ),
            );
      const prompt = (
        savedImageMetadata?.prompt ||
        context?.prompt ||
        ""
      ).trim();
      if (!prompt && savedImageOperation !== "variation") {
        message.warning("找不到提示词，无法重试");
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: "找不到提示词，无法重试",
                  },
                }
              : item,
          ),
        );
        return;
      }
      const generationType = savedGenerationType;
      const retryImageOperation = savedImageOperation || "generate";
      const retryReferenceSnapshotError = retryImageReferenceSnapshotError(
        retryImageOperation,
        savedImageMetadata,
        isStoryDirectorImage,
      );
      if (retryReferenceSnapshotError) {
        message.error(retryReferenceSnapshotError);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: retryReferenceSnapshotError,
                  },
                }
              : item,
          ),
        );
        return;
      }
      const useReferenceImages = savedImageOperation
        ? shouldReplayCanvasImageReferences(
            savedImageOperation,
            savedImageMetadata,
          )
        : generationType
        ? generationType === "edit"
        : Boolean(context?.referenceImages.length);
      let retryReferenceImages: ReferenceImage[] | null =
        hasSavedImageMetadata && savedImageMetadata
          ? await resolveMetadataReferences(
              savedImageMetadata,
              nodesRef.current,
            )
          : useReferenceImages
            ? context?.referenceImages.length
              ? context.referenceImages
              : sourceNodeReferenceImages(batchRoot || sourceNode)
            : [];
      if (
        useReferenceImages &&
        (!retryReferenceImages || !retryReferenceImages.length) &&
        isStoryDirectorImage
      ) {
        const errorDetails =
          "Story 分镜的原始语义参考图片已丢失，无法安全重试；不会改用上游四视图或其它图片替代";
        message.error(errorDetails);
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                  },
                }
              : item,
          ),
        );
        return;
      }
      if (
        useReferenceImages &&
        retryReferenceImages?.length &&
        isStoryDirectorImage
      ) {
        const validation = validateStoryImageRetryReferences(
          retryReferenceImages,
          nodesRef.current,
        );
        if (validation.errorDetails) {
          message.error(validation.errorDetails);
          setNodes((prev) =>
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    metadata: {
                      ...item.metadata,
                      status: NODE_STATUS_ERROR,
                      errorDetails: validation.errorDetails,
                    },
                  }
                : item,
            ),
          );
          return;
        }
        retryReferenceImages = validation.references;
      }
      const hasRetryReferenceImages = Boolean(retryReferenceImages?.length);
      if (useReferenceImages && !hasRetryReferenceImages) {
        message.error("参考图片已丢失，无法继续重试");
        setNodes((prev) =>
          prev.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails: "参考图片已丢失，无法继续重试",
                  },
                }
              : item,
          ),
        );
        return;
      }
      const retryImages: ReferenceImage[] =
        hasRetryReferenceImages && retryReferenceImages
          ? retryReferenceImages
          : [];
      if (node.type === CanvasNodeType.Image) {
        try {
          await preflightImageRequest(
            generationConfig,
            retryImageOperation,
            prompt,
            retryImages,
            restoreCanvasMaskReference(savedImageMetadata?.imageEditMask),
            "imageGeneration",
            { useReferenceLabels: isStoryDirectorGeneratedImage(node, nodesRef.current, connectionsRef.current) },
          );
        } catch (error) {
          message.error(formatCanvasGenerationError(error, "图片生成配置校验失败"));
          return;
        }
      }
      let retryVideoParameterSnapshot:
        | ReturnType<typeof buildVideoParameterSnapshot>
        | undefined;
      let retryVideoAttempt: VideoGenerationAttempt | undefined;
      if (node.type === CanvasNodeType.Video) {
        if (
          hasNonterminalVideoTask(
            nodesRef.current.find((item) => item.id === node.id)?.metadata,
          ) ||
          videoGenerationEntryLocksRef.current.has(node.id)
        ) {
          message.warning("该视频节点已有生成任务，完成或替换后才能再次提交");
          return;
        }
        const explicitVideoOperation =
          node.metadata?.videoGenerationScope?.operation ||
          sourceNode?.metadata?.videoGenerationScope?.operation;
        try {
          retryVideoParameterSnapshot = buildVideoParameterSnapshot(
            generationConfig,
            retryImages,
            context?.referenceVideos || [],
            requireVideoGenerationOperation(
              explicitVideoOperation,
              node.title || "视频节点",
            ),
            node.metadata?.videoGenerationSettings || {},
          );
          videoGenerationSettingsToRequest(
            retryVideoParameterSnapshot.settings,
            retryVideoParameterSnapshot.capability,
          );
          const promptError = videoPromptPreflightError(
            retryVideoParameterSnapshot.capability,
            prompt,
            {
              imageCount: retryImages.length,
              videoCount: context?.referenceVideos.length || 0,
              audioCount: context?.referenceAudios.length || 0,
            },
          );
          if (promptError) throw new Error(promptError);
        } catch (error) {
          message.error(
            formatCanvasGenerationError(error, "视频生成配置校验失败"),
          );
          return;
        }
        retryVideoAttempt = {
          id: nanoid(),
          kind: "native",
          provider: "customer",
          providerId: retryVideoParameterSnapshot.scope.providerId,
          model: retryVideoParameterSnapshot.scope.model,
          startedAt: new Date().toISOString(),
        };
        videoGenerationEntryLocksRef.current.set(
          node.id,
          retryVideoAttempt.id,
        );
      }
      const retryImageTaskId =
        node.type === CanvasNodeType.Image
          ? `canvas-${node.id}-${Date.now()}-${nanoid(8)}`
          : undefined;
      if (retryImageTaskId) {
        resumedImageTaskIdsRef.current.add(retryImageTaskId);
      }

      setRunningNodeId(node.id);

      const retryPendingNodes = reconcileStoryDirectorImageResults(
        nodesRef.current.map((item) =>
          item.id === node.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  status: NODE_STATUS_LOADING,
                  errorDetails: undefined,
                  sourceImageTaskId: undefined,
                  imageGenerationAttemptId: retryImageTaskId,
                  ...(retryVideoAttempt
                    ? {
                        model: retryVideoAttempt.model,
                        modelProviderId: retryVideoAttempt.providerId,
                        videoGenerationAttempt: retryVideoAttempt,
                      }
                    : {}),
                },
              }
            : item,
        ),
        connectionsRef.current,
      );
      nodesRef.current = retryPendingNodes;
      setNodes(retryPendingNodes);
      persistCanvasSnapshot(retryPendingNodes);

      try {
        if (node.type === CanvasNodeType.Text) {
          if (!context) return;
          let streamed = "";
          const answer = await requestImageQuestion(
            generationConfig,
            buildNodeChatMessages({ ...context, prompt }),
            (text) => {
              streamed = text;
              setNodes((prev) =>
                prev.map((item) =>
                  item.id === node.id
                    ? {
                        ...item,
                        type: CanvasNodeType.Text,
                        metadata: {
                          ...item.metadata,
                          content: text,
                          status: NODE_STATUS_LOADING,
                        },
                      }
                    : item,
                  ),
              );
            },
            { boardRouteKey: "imagePrompt" },
          );
          setNodes((prev) =>
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    type: CanvasNodeType.Text,
                    metadata: {
                      ...item.metadata,
                      content: answer || streamed,
                      prompt,
                      status: NODE_STATUS_SUCCESS,
                      ...resolveGenerationMetadataModelIdentity(
                        generationConfig,
                        "text",
                        "imagePrompt",
                      ),
                    },
                  }
                : item,
            ),
          );
          return;
        }
        if (node.type === CanvasNodeType.Video) {
          const parameterSnapshot = retryVideoParameterSnapshot!;
          await flushCanvasPersistence();
          const task = await createVideoGenerationTask(
            generationConfig,
            prompt,
            retryImages,
            context?.referenceVideos || [],
            context?.referenceAudios || [],
            "videoGeneration",
            {
              generationParameters: parameterSnapshot.settings,
              operation: parameterSnapshot.scope.operation,
            },
          );
          const taskAttempt = withVideoAttemptTaskId(
            { ...retryVideoAttempt!, provider: task.provider },
            task.id,
          );
          const snapshot = snapshotCreatedCanvasVideoTask(
            task,
            retryVideoAttempt!.startedAt,
            taskAttempt.id,
            parameterSnapshot.scope.operation,
          );
          const taskNodes = nodesRef.current.map((item) =>
            item.id === node.id &&
            ownsVideoGenerationAttempt(item.metadata, retryVideoAttempt!)
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    videoGenerationSettings: parameterSnapshot.settings,
                    videoGenerationScope: parameterSnapshot.scope,
                    videoGenerationCapabilityId: parameterSnapshot.capabilityId,
                    videoWireFormat: parameterSnapshot.wireFormat,
                    videoGenerationTask: snapshot,
                    videoGenerationAttempt: taskAttempt,
                  },
                }
              : item,
          );
          nodesRef.current = taskNodes;
          setNodes(taskNodes);
          persistCanvasSnapshot(taskNodes);
          await flushCanvasPersistence();
          resumedVideoTaskIdsRef.current.add(
            videoTaskControllerKey({
              provider: task.provider,
              providerId: snapshot.providerId,
              nodeId: node.id,
              taskId: task.id,
            }),
          );
          await resumeCanvasVideoTask(node.id, snapshot);
          return;
        }
        if (node.type === CanvasNodeType.Audio) {
          const audio = await storeGeneratedAudio(
            await requestAudioGeneration(generationConfig, prompt),
            generationConfig.audioFormat,
          );
          setNodes((prev) =>
            prev.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    metadata: {
                      ...item.metadata,
                      ...audioMetadata(audio),
                      prompt,
                      ...buildAudioGenerationMetadata(generationConfig),
                    },
                  }
                : item,
            ),
          );
          return;
        }

        const taskId = retryImageTaskId || `canvas-${node.id}-${Date.now()}`;
        const taskNodes = reconcileStoryDirectorImageResults(
          nodesRef.current.map((item) =>
            item.id === node.id &&
            (!retryVideoAttempt ||
              ownsVideoGenerationAttempt(item.metadata, {
                ...retryVideoAttempt,
                taskId: item.metadata?.videoGenerationAttempt?.taskId,
              }))
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_LOADING,
                    errorDetails: undefined,
                    sourceImageTaskId: undefined,
                    imageGenerationAttemptId: taskId,
                  },
                }
              : item,
          ),
          connectionsRef.current,
        );
        setNodes(taskNodes);
        persistCanvasSnapshot(taskNodes);
        const retryImageCapability = await resolveImageRequestCapability(
          generationConfig,
          retryImageOperation,
          "imageGeneration",
        );
        const pollTaskId = await submitCanvasImageTask(
          taskId,
          generationConfig,
          retryImageOperation,
          prompt,
          useReferenceImages ? retryImages : [],
          {
            useReferenceLabels: isStoryDirectorGeneratedImage(
              node,
              nodesRef.current,
              connectionsRef.current,
            ),
            mask: restoreCanvasMaskReference(
              savedImageMetadata?.imageEditMask,
            ),
            onNativeTaskSubmitted: async (submitted) => {
              const snapshot = snapshotSubmittedNativeImageTask(
                retryImageCapability.route,
                submitted,
                {
                  operation: retryImageOperation,
                  capabilityId: retryImageCapability.capability.id,
                  resultPolicy: "exact-count",
                },
              );
              await persistNativeImageTaskBindings([
                {
                  targetId: node.id,
                  binding: { snapshot, attemptId: taskId, outputIndex: 0 },
                },
              ]);
            },
          },
        );
        const image = await pollCanvasImageTask(pollTaskId);
        const uploadedImage = await uploadImage(
          image.dataUrl,
          CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
        );
        const imageConfig = NODE_DEFAULT_SIZE[CanvasNodeType.Image];
        const imageSize = imageNodeSize(
          uploadedImage.width,
          uploadedImage.height,
          imageConfig.width,
        );
        const generationMetadata = savedImageMetadata?.imageOperation || savedImageMetadata?.generationType
          ? {
              ...buildImageGenerationMetadata(
                retryImageOperation,
                generationConfig,
                savedImageMetadata.count || 1,
                retryImages,
              ),
              references: savedImageMetadata.references?.length
                ? savedImageMetadata.references
                : generationType === "edit"
                  ? retryImages
                      .map(referenceUrl)
                      .filter((url): url is string => Boolean(url))
                  : savedImageMetadata.references,
            }
          : buildImageGenerationMetadata(
              retryImageOperation,
              generationConfig,
              1,
              retryImages,
            );
        const batchRootId = node.metadata?.batchRootId;
        const nextNodes = reconcileStoryDirectorImageResults(
          nodesRef.current.map((item) => {
            if (
              item.id === node.id &&
              (item.metadata?.imageGenerationAttemptId === taskId ||
                ownsCanvasImageTask(
                  item.metadata?.imageGenerationTask,
                  taskId,
                ))
            ) {
              return {
                ...item,
                type: CanvasNodeType.Image,
                width: imageSize.width,
                height: imageSize.height,
                metadata: {
                  ...item.metadata,
                  ...imageMetadata(uploadedImage, image),
                  prompt,
                  ...generationMetadata,
                },
              };
            }
            if (
              batchRootId &&
              item.id === batchRootId &&
              !item.metadata?.content
            ) {
              const center = {
                x: item.position.x + item.width / 2,
                y: item.position.y + item.height / 2,
              };
              return {
                ...item,
                width: imageSize.width,
                height: imageSize.height,
                position: {
                  x: center.x - imageSize.width / 2,
                  y: center.y - imageSize.height / 2,
                },
                metadata: {
                  ...item.metadata,
                  ...imageMetadata(uploadedImage, image),
                  prompt,
                  ...generationMetadata,
                  status: NODE_STATUS_SUCCESS,
                  primaryImageId: node.id,
                },
              };
            }
            return item;
          }),
          connectionsRef.current,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } catch (error) {
        const errorDetails = formatCanvasGenerationError(error);
        message.error(errorDetails);
        const terminalImageFailure =
          error instanceof NativeImageTaskTerminalError;
        const nextNodes = reconcileStoryDirectorImageResults(
          nodesRef.current.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  metadata: {
                    ...item.metadata,
                    status: NODE_STATUS_ERROR,
                    errorDetails,
                    sourceImageTaskId: undefined,
                    imageGenerationAttemptId: undefined,
                    ...(terminalImageFailure
                      ? { imageGenerationTask: undefined }
                      : {}),
                    ...(retryVideoAttempt
                      ? {
                          videoGenerationTask: undefined,
                          videoGenerationAttempt: undefined,
                        }
                      : {}),
                  },
                }
              : item,
          ),
          connectionsRef.current,
        );
        setNodes(nextNodes);
        persistCanvasSnapshot(nextNodes);
      } finally {
        if (retryImageTaskId) {
          resumedImageTaskIdsRef.current.delete(retryImageTaskId);
        }
        if (
          retryVideoAttempt &&
          videoGenerationEntryLocksRef.current.get(node.id) ===
            retryVideoAttempt.id
        )
          videoGenerationEntryLocksRef.current.delete(node.id);
        setRunningNodeId(null);
      }
      } finally {
        nodeGenerationLocksRef.current.delete(node.id);
      }
    },
    [
      effectiveConfig,
      handleGenerateNode,
      isAiConfigReady,
      message,
      openConfigDialog,
      persistCanvasSnapshot,
      resumeCanvasVideoTask,
      resumeCustomerSeedanceTask,
    ],
  );

  useEffect(() => {
    handleRetryNodeRef.current = (node) => void handleRetryNode(node);
  }, [handleRetryNode]);

  const generateImageFromTextNode = useCallback(
    (node: CanvasNodeData) => {
      const prompt = (
        node.metadata?.content ||
        node.metadata?.prompt ||
        ""
      ).trim();
      if (!prompt) {
        message.warning("文本节点为空，无法生图");
        return;
      }
      const sourceNode = nodesRef.current.find((item) => item.id === node.id);
      if (!sourceNode) return;
      const nodeSize = getNodeSpec(CanvasNodeType.Config);
      const configNode = createCanvasNode(
        CanvasNodeType.Config,
        {
          x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
          y: sourceNode.position.y + sourceNode.height / 2,
        },
        {
          prompt: "",
          ...defaultCanvasProviderModelMetadata(effectiveConfig, "image"),
          size: effectiveConfig.size,
          quality: effectiveConfig.quality,
          count: getGenerationCount(
            effectiveConfig.canvasImageCount || effectiveConfig.count,
          ),
        },
      );
      const connection = {
        id: nanoid(),
        fromNodeId: sourceNode.id,
        toNodeId: configNode.id,
      };
      const nextNodes = nodesRef.current
        .map((item) =>
          item.id === sourceNode.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  content: prompt,
                  prompt,
                  status: NODE_STATUS_SUCCESS,
                },
              }
            : item,
        )
        .concat(configNode);
      const nextConnections = [...connectionsRef.current, connection];
      nodesRef.current = nextNodes;
      connectionsRef.current = nextConnections;
      setNodes(nextNodes);
      setConnections(nextConnections);
      setSelectedNodeIds(new Set([configNode.id]));
      setSelectedConnectionId(null);
      setDialogNodeId(configNode.id);
    },
    [
      effectiveConfig.canvasImageCount,
      effectiveConfig.count,
      effectiveConfig.imageModel,
      effectiveConfig.model,
      effectiveConfig.quality,
      effectiveConfig.size,
      message,
    ],
  );

  useEffect(() => {
    generateImageFromTextNodeRef.current = generateImageFromTextNode;
  }, [generateImageFromTextNode]);

  const insertAssistantImage = useCallback(
    async (image: CanvasAssistantImage) => {
      if (image.storageKey)
        await setStoredImagesRetained([image.storageKey], true);
      const storedImage = image.storageKey
        ? {
            url: image.dataUrl,
            storageKey: image.storageKey,
            width: 1,
            height: 1,
            bytes: 0,
            mimeType: "image/png",
          }
        : await uploadImage(image.dataUrl, CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS);
      const meta =
        storedImage.width === 1 && storedImage.height === 1
          ? await readImageMeta(storedImage.url)
          : storedImage;
      const config = imageNodeSize(meta.width, meta.height);
      const center = screenToCanvas(
        (containerRef.current?.getBoundingClientRect().left || 0) +
          size.width / 2,
        (containerRef.current?.getBoundingClientRect().top || 0) +
          size.height / 2,
      );
      const id = `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const node: CanvasNodeData = {
        id,
        type: CanvasNodeType.Image,
        title: image.prompt.slice(0, 32) || "Generated Image",
        position: {
          x: center.x - config.width / 2,
          y: center.y - config.height / 2,
        },
        width: config.width,
        height: config.height,
        metadata: {
          ...imageMetadata({
            ...storedImage,
            width: meta.width,
            height: meta.height,
          }),
          imageSequenceNumber: nextImageSequenceNumber(nodesRef.current),
          prompt: image.prompt,
        },
      };

      setNodes((prev) => [...prev, node]);
      setSelectedNodeIds(new Set([id]));
      setSelectedConnectionId(null);
      setDialogNodeId(id);
    },
    [screenToCanvas, size.height, size.width],
  );

  const insertAssistantText = useCallback(
    (text: string) => {
      const center = screenToCanvas(
        (containerRef.current?.getBoundingClientRect().left || 0) +
          size.width / 2,
        (containerRef.current?.getBoundingClientRect().top || 0) +
          size.height / 2,
      );
      const node = {
        ...createCanvasNode(CanvasNodeType.Text, center, {
          content: text,
          status: NODE_STATUS_SUCCESS,
        }),
        title: text.slice(0, 32) || "Assistant Text",
      };

      setNodes((prev) => [...prev, node]);
      setSelectedNodeIds(new Set([node.id]));
      setSelectedConnectionId(null);
    },
    [screenToCanvas, size.height, size.width],
  );

  const handleAssetInsert = useCallback(
    (payload: InsertAssetPayload) => {
      if (payload.kind === "text") {
        insertAssistantText(payload.content);
      } else if (payload.kind === "video") {
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Video];
        const center = screenToCanvas(
          (containerRef.current?.getBoundingClientRect().left || 0) +
            size.width / 2,
          (containerRef.current?.getBoundingClientRect().top || 0) +
            size.height / 2,
        );
        const id = `video-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const nextSize = fitNodeSize(
          payload.width || spec.width,
          payload.height || spec.height,
          VIDEO_NODE_MAX_WIDTH,
          VIDEO_NODE_MAX_HEIGHT,
        );
        setNodes((prev) => [
          ...prev,
          {
            id,
            type: CanvasNodeType.Video,
            title: payload.title,
            position: {
              x: center.x - nextSize.width / 2,
              y: center.y - nextSize.height / 2,
            },
            width: nextSize.width,
            height: nextSize.height,
            metadata: {
              content: payload.url,
              storageKey: payload.storageKey,
              status: NODE_STATUS_SUCCESS,
              naturalWidth: payload.width,
              naturalHeight: payload.height,
            },
          },
        ]);
        setSelectedNodeIds(new Set([id]));
      } else {
        insertAssistantImage({
          id: `asset-${Date.now()}`,
          prompt: payload.title,
          dataUrl: payload.dataUrl,
          storageKey: payload.storageKey,
        });
      }
      setAssetPickerOpen(false);
    },
    [
      insertAssistantImage,
      insertAssistantText,
      screenToCanvas,
      size.height,
      size.width,
    ],
  );

  const handleCanvasVideoGeneration = useCallback(
    (node: CanvasNodeData) => {
      if (node.metadata?.seedanceWorkflowRole === "placeholder") {
        void generateSeedance2VideoFromPlaceholder(node);
        return;
      }
      if (node.type !== CanvasNodeType.Video || node.metadata?.content) return;
      void handleGenerateNode(
        node.id,
        "video",
        String(node.metadata?.prompt || "").trim(),
      );
    },
    [generateSeedance2VideoFromPlaceholder, handleGenerateNode],
  );

  const handleViewportChange = useCallback((next: ViewportTransform) => {
    setViewport(next);
    if (contextMenuRef.current) {
      setContextMenu(null);
    }
  }, []);

  const handleNodeHoverStart = useCallback(
    (nodeId: string) => {
      if (nodeDraggingRef.current) return;
      keepNodeToolbar(nodeId);
      pendingHoveredNodeIdRef.current = nodeId;
      if (hoveredNodeIdRef.current === nodeId) {
        if (hoverRafRef.current != null) {
          cancelAnimationFrame(hoverRafRef.current);
          hoverRafRef.current = null;
        }
        return;
      }
      if (hoverRafRef.current != null) return;
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const next = pendingHoveredNodeIdRef.current;
        if (next == null || hoveredNodeIdRef.current === next) return;
        setHoveredNodeId(next);
      });
    },
    [keepNodeToolbar],
  );

  const handleNodeHoverEnd = useCallback(
    (nodeId: string) => {
      if (pendingHoveredNodeIdRef.current === nodeId) {
        pendingHoveredNodeIdRef.current = null;
      }
      if (hoverRafRef.current != null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
      if (hoveredNodeIdRef.current === nodeId) {
        hoverRafRef.current = requestAnimationFrame(() => {
          hoverRafRef.current = null;
          if (pendingHoveredNodeIdRef.current != null) {
            if (hoveredNodeIdRef.current !== pendingHoveredNodeIdRef.current) {
              setHoveredNodeId(pendingHoveredNodeIdRef.current);
            }
            return;
          }
          if (hoveredNodeIdRef.current === nodeId) setHoveredNodeId(null);
        });
      }
      if (toolbarNodeIdRef.current) hideNodeToolbar();
    },
    [hideNodeToolbar],
  );

  useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
    };
  }, []);

  const handleNodeRetry = useCallback(
    (node: CanvasNodeData) => {
      void handleRetryNode(node);
    },
    [handleRetryNode],
  );

  const handleExtractVideoFrame = useCallback(
    (
      node: CanvasNodeData,
      frame: { dataUrl: string; width: number; height: number; currentTime: number },
    ) => {
      void createImageNodeFromVideoFrame(node, frame);
    },
    [createImageNodeFromVideoFrame],
  );

  const handleViewCharacterDerivedViews = useCallback(
    (node: CanvasNodeData) => {
      void viewCharacterDerivedViews(node);
    },
    [viewCharacterDerivedViews],
  );

  const handleExpandCharacterDerivedViews = useCallback(
    (node: CanvasNodeData) => {
      void expandCharacterDerivedViews(node);
    },
    [expandCharacterDerivedViews],
  );

  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent, id: string) => {
      event.preventDefault();
      event.stopPropagation();
      const currentSelected = selectedNodeIdsRef.current;
      const targetNode = nodesRef.current.find((item) => item.id === id);
      const selectedImages = nodesRef.current.filter(
        (item) =>
          currentSelected.has(item.id) &&
          item.type === CanvasNodeType.Image &&
          Boolean(item.metadata?.content),
      );
      const keepSelection =
        currentSelected.has(id) &&
        selectedImages.length > 1 &&
        targetNode?.type === CanvasNodeType.Image;
      if (!keepSelection) setSelectedNodeIds(new Set([id]));
      if (selectedConnectionIdRef.current) setSelectedConnectionId(null);
      if (toolbarNodeIdRef.current) setToolbarNodeId(null);
      setContextMenu(
        keepSelection
          ? {
              type: "selection",
              x: event.clientX,
              y: event.clientY,
              nodeIds: Array.from(currentSelected),
            }
          : {
              type: "node",
              x: event.clientX,
              y: event.clientY,
              nodeId: id,
            },
      );
    },
    [],
  );

  const renderPanel = useCallback(
    (panelNode: CanvasNodeData) =>
      panelNode.type === CanvasNodeType.Config ? (
        <CanvasConfigComposer
          value={
            panelNode.metadata?.composerContent ??
            panelNode.metadata?.prompt ??
            ""
          }
          inputs={configInputsById.get(panelNode.id) || []}
          onChange={(composerContent) =>
            handleConfigNodeChange(panelNode.id, { composerContent })
          }
          onClose={() => setDialogNodeId(null)}
        />
      ) : (
        <CanvasNodePromptPanel
          node={panelNode}
          isRunning={runningNodeId === panelNode.id}
          mentionReferences={
            mentionReferencesByNodeId.get(panelNode.id) || EMPTY_MENTION_REFERENCES
          }
          onPromptChange={handleNodePromptChange}
          onConfigChange={handleConfigNodeChange}
          onGenerate={handleGenerateNode}
          onImageSettingsOpenChange={(open) => {
            setNodeImageSettingsOpen(open);
            if (open) setToolbarNodeId(null);
          }}
        />
      ),
    [
      configInputsById,
      handleConfigNodeChange,
      handleGenerateNode,
      handleNodePromptChange,
      mentionReferencesByNodeId,
      runningNodeId,
    ],
  );

  const renderNodeContent = useCallback(
    (contentNode: CanvasNodeData) =>
      contentNode.type === CanvasNodeType.StoryDirector ? (
        <CanvasStoryDirectorPanel
          node={contentNode}
          embedded
          storyDirectorInheritedTextModel={storyDirectorInheritedTextModel}
          storyDirectorTextModels={storyDirectorTextModels}
          storyDirectorInheritedImageModel={storyDirectorInheritedImageModel}
          storyDirectorImageModels={storyDirectorImageModels}
          config={effectiveConfig}
          onConfigChange={handleConfigNodeChange}
          onAnalyzeStory={(target) => void analyzeStoryDirector(target)}
          onGenerateCharacters={(target) =>
            void generateStoryCharacters(target)
          }
          onGenerateShots={(target) => void generateStoryShots(target)}
          onRunAll={(target) => void runStoryDirectorAll(target)}
          onCreateCharacterConfig={(target) =>
            void createStoryDirectorConfig(target, "character")
          }
          onCreateShotConfig={(target) =>
            void createStoryDirectorConfig(target, "shot")
          }
          onImageSettingsOpenChange={(open) => {
            setNodeImageSettingsOpen(open);
            if (open) setToolbarNodeId(null);
          }}
        />
      ) : contentNode.type === CanvasNodeType.Seedance2Workflow ? (
        <Seedance2WorkflowPanel
          node={contentNode}
          embedded
          isCreatingPlaceholders={runningNodeId === contentNode.id}
          rewriteStreamingChars={
            runningNodeId === contentNode.id ? rewriteStreamingChars : 0
          }
          pendingPlaceholderCount={
            listPendingSeedance2Placeholders(nodes, contentNode.id).length
          }
          videoBatch={
            seedance2VideoBatch?.workflowId === contentNode.id
              ? seedance2VideoBatch
              : null
          }
          onConfigChange={handleConfigNodeChange}
          onCreatePlaceholders={rebuildSeedance2Placeholders}
          onGenerateVideos={(target) =>
            void generateAllSeedance2PlaceholderVideos(target)
          }
          storyDirectorSourceResolution={
            seedance2StoryDirectorSourceByNodeId.get(contentNode.id) || {
              status: "missing",
            }
          }
        />
      ) : contentNode.type === CanvasNodeType.Config ? (
        <CanvasConfigNodePanel
          node={contentNode}
          isRunning={runningNodeId === contentNode.id}
          inputSummary={getInputSummary(
            configInputsById.get(contentNode.id) || [],
          )}
          onConfigChange={handleConfigNodeChange}
          onComposerToggle={() =>
            setDialogNodeId((current) =>
              current === contentNode.id ? null : contentNode.id,
            )
          }
          onGenerate={(nodeId) => {
            const target = nodesRef.current.find((item) => item.id === nodeId);
            void handleGenerateNode(
              nodeId,
              target?.metadata?.generationMode || "image",
              target?.metadata?.composerContent ??
                target?.metadata?.prompt ??
                "",
            );
          }}
        />
      ) : undefined,
    [
      analyzeStoryDirector,
      configInputsById,
      createStoryDirectorConfig,
      effectiveConfig,
      generateStoryCharacters,
      generateStoryShots,
      generateAllSeedance2PlaceholderVideos,
      handleConfigNodeChange,
      handleGenerateNode,
      nodes,
      rebuildSeedance2Placeholders,
      rewriteStreamingChars,
      runningNodeId,
      runStoryDirectorAll,
      seedance2StoryDirectorSourceByNodeId,
      seedance2VideoBatch,
      storyDirectorImageModels,
      storyDirectorInheritedImageModel,
      storyDirectorInheritedTextModel,
      storyDirectorTextModels,
    ],
  );

  if (!hydrated && canvasHydrationStatus === "error") {
    return (
      <CanvasRestoreErrorShell
        message={`${canvasHydrationError || "读取本地画布失败"}。已保留本地数据，未创建或写入空画布。`}
        onRetry={() => void retryCanvasHydration()}
        retrying={false}
        onBack={() => router.push("/canvas/home")}
        onRepair={() => router.push("/canvas-repair")}
      />
    );
  }

  if (restoreError) {
    return (
      <CanvasRestoreErrorShell
        message={restoreError}
        onRetry={() => {
          setRestoreError(null);
          setLoadedProjectId(null);
          setRestoreAttempt((value) => value + 1);
        }}
        onBack={() => router.push("/canvas/home")}
        onRepair={() => router.push("/canvas-repair")}
      />
    );
  }

  return (
    <main
      className="canvas-workspace-board relative flex h-full min-h-full w-full flex-1 overflow-hidden"
      aria-busy={!projectLoaded}
      style={{
        background: theme.canvas.background,
        color: theme.node.text,
        pointerEvents: "auto",
      }}
    >
      {readingBanner ? (
        <div
          className="absolute left-4 top-4 z-[120] rounded-md border px-3 py-2 text-xs shadow-sm"
          style={{
            background: theme.node.panel,
            borderColor: theme.node.stroke,
            color: theme.node.muted,
          }}
        >
          正在读取画布...
        </div>
      ) : null}
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <CanvasTopBar
          title={currentProject?.title || "未命名画布"}
          titleDraft={titleDraft}
          isTitleEditing={titleEditing}
          onTitleDraftChange={setTitleDraft}
          onStartTitleEditing={startTitleEditing}
          onFinishTitleEditing={finishTitleEditing}
          onCancelTitleEditing={() => setTitleEditing(false)}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onHome={() => router.push("/canvas/home")}
          onProjects={() => router.push("/canvas/home")}
          onCreateProject={createAndOpenProject}
          onDeleteProject={() => setDeleteProjectConfirmId(projectId)}
          onImportImage={() => handleUploadRequest()}
          onUndo={undoCanvas}
          onRedo={redoCanvas}
          generationHistoryOpen={generationHistoryOpen}
          onToggleGenerationHistory={() =>
            setGenerationHistoryOpen((value) => !value)
          }
          assistantCollapsed={assistantCollapsed}
          onExpandAssistant={() => {
            setAssistantMounted(true);
            setAssistantCollapsed(false);
          }}
        />

        <div className="absolute inset-0 min-h-[calc(100vh-64px)]">
        <InfiniteCanvas
          containerRef={containerRef}
          viewport={viewport}
          backgroundMode={backgroundMode}
          zoomOnWheel={!selectedConnectionId}
          onViewportChange={handleViewportChange}
          onCanvasMouseDown={handleCanvasMouseDown}
          onCanvasDeselect={deselectCanvas}
          onContextMenu={preventCanvasContextMenu}
          onDrop={handleDrop}
        >
          <svg
            className="absolute left-0 top-0 h-[10000px] w-[10000px] overflow-visible"
            style={{
              pointerEvents: "none",
              transform: "translateZ(0)",
              zIndex: 0,
            }}
          >
            <CanvasConnectionDefs />
            {connections
              .filter((connection) => {
                const from = nodeById.get(connection.fromNodeId);
                const to = nodeById.get(connection.toNodeId);
                const hidesOldResult = [from, to].some(
                  (node) =>
                    node?.metadata?.seedanceWorkflowRole === "result" &&
                    !displayedSeedance2ResultNodeIds.has(node.id),
                );
                return !hidesOldResult && shouldRenderCanvasConnection(connection, from, to, nodes);
              })
              .map((connection) => {
                const from = nodeById.get(connection.fromNodeId);
                const to = nodeById.get(connection.toNodeId);
                if (!from || !to) return null;

                return (
                  <ConnectionPath
                    key={connection.id}
                    connection={connection}
                    from={from}
                    to={to}
                    toPanelOpen={shouldRouteConnectionToFloatingPanel(to, dialogNodeId)}
                    active={
                      selectedConnectionId === connection.id ||
                      relatedHighlight.connectionIds.has(connection.id)
                    }
                    onSelect={() => {
                      setSelectedConnectionId(connection.id);
                      setSelectedNodeIds(new Set());
                      setContextMenu(null);
                    }}
                    onContextMenu={(event) => {
                      setSelectedConnectionId(connection.id);
                      setSelectedNodeIds(new Set());
                      setContextMenu({
                        type: "connection",
                        x: event.clientX,
                        y: event.clientY,
                        connectionId: connection.id,
                      });
                    }}
                  />
                );
              })}
            {connectingParams ? (
              <ActiveConnectionPath
                node={nodeById.get(connectingParams.nodeId)}
                handle={connectingParams}
                mouseWorld={mouseWorld}
                target={connectionTargetNode}
                targetHandleId={connectionTargetHandleId}
                targetPanelOpen={Boolean(
                  connectionTargetNode &&
                  shouldRouteConnectionToFloatingPanel(connectionTargetNode, dialogNodeId),
                )}
              />
            ) : null}
          </svg>

          {visibleNodes.map((node) => (
            <CanvasNode
              key={node.id}
              data={node}
              isSelected={selectedNodeIds.has(node.id)}
              isRelated={relatedHighlight.nodeIds.has(node.id)}
              isFocusRelated={activeNodeId === node.id}
              isConnectionTarget={connectionTargetNodeId === node.id}
              connectionTargetHandleId={connectionTargetHandleId}
              isConnecting={Boolean(connectingParams)}
              isRunning={
                runningNodeId === node.id ||
                hasNonterminalVideoTask(node.metadata)
              }
              editRequestNonce={
                editingNodeId === node.id ? editRequestNonce : 0
              }
              showPanel={dialogNodeId === node.id && !selectionBox}
              batchCount={batchChildCountById.get(node.id) || 0}
              batchExpanded={Boolean(node.metadata?.imageBatchExpanded)}
              batchClosing={Boolean(
                node.metadata?.batchRootId &&
                collapsingBatchIds.has(node.metadata.batchRootId),
              )}
              batchOpening={openingBatchIds.has(node.id)}
              batchRecovering={collapsingBatchIds.has(node.id)}
              batchMotion={batchMotionById.get(node.id)}
              showImageInfo={showImageInfo}
              resourceLabel={resourceReferenceByNodeId.get(node.id)}
              mentionReferences={
                mentionReferencesByNodeId.get(node.id) || EMPTY_MENTION_REFERENCES
              }
              seedance2AspectRatioSources={seedance2AspectRatioSourcesByNodeId.get(node.id)}
              seedance2ReferenceSlots={seedance2ReferenceSlotsByNodeId.get(node.id)}
              referenceVideos={
                referenceVideosByNodeId.get(node.id) || EMPTY_REFERENCE_VIDEOS
              }
              seedance2ResultVersions={seedance2ResultVersionsByNodeId.get(node.id)}
              onMetadataChange={handleNodeMetadataChange}
              onDeleteConnection={deleteConnection}
              onUpdateConnectionUseAs={updateConnectionUseAs}
              renderPanel={renderPanel}
              renderNodeContent={renderNodeContent}
              onMouseDown={handleNodeMouseDown}
              onHoverStart={handleNodeHoverStart}
              onHoverEnd={handleNodeHoverEnd}
              onConnectStart={handleConnectStart}
              onResize={handleNodeResize}
              onContentChange={handleNodeContentChange}
              onToggleBatch={toggleBatchExpanded}
              onSetBatchPrimary={setBatchPrimary}
              onRetry={handleNodeRetry}
              onGenerateImage={generateImageFromTextNode}
              onGenerateVideo={handleCanvasVideoGeneration}
              onExtractVideoFrame={handleExtractVideoFrame}
              onViewImage={previewNodeImage}
              onViewCharacterDerivedViews={handleViewCharacterDerivedViews}
              onExpandCharacterDerivedViews={handleExpandCharacterDerivedViews}
              onContextMenu={handleNodeContextMenu}
            />
          ))}

          {selectionBox ? (
            <div
              className="pointer-events-none absolute z-[100] border"
              style={{
                left: Math.min(
                  selectionBox.startWorldX,
                  selectionBox.currentWorldX,
                ),
                top: Math.min(
                  selectionBox.startWorldY,
                  selectionBox.currentWorldY,
                ),
                width: Math.abs(
                  selectionBox.currentWorldX - selectionBox.startWorldX,
                ),
                height: Math.abs(
                  selectionBox.currentWorldY - selectionBox.startWorldY,
                ),
                borderColor: theme.canvas.selectionStroke,
                background: theme.canvas.selectionFill,
              }}
            />
          ) : null}
          {pendingConnectionCreate ? (
            <ConnectionCreateMenu
              pending={pendingConnectionCreate}
              onCreate={(type) =>
                createConnectedNode(type, pendingConnectionCreate)
              }
              onClose={cancelPendingConnectionCreate}
            />
          ) : null}
        </InfiniteCanvas>
        </div>

        {!nodes.length && !dialogNodeId ? (
          <CanvasEmptyStarter
            theme={theme}
            onUpload={() => handleUploadRequest()}
            onTextToImage={() => createNode(CanvasNodeType.Config)}
            onOpenAssets={() => {
              setAssetPickerTab("my-assets");
              setAssetPickerOpen(true);
            }}
            onSeedance2Workflow={() => createSeedance2Workflow()}
            onStoryDirector={() => createStoryDirectorFromImages([])}
            onAddText={() => createNode(CanvasNodeType.Text)}
          />
        ) : null}

        <CanvasToolbar
          selectedCount={selectedNodeIds.size}
          dock={viewport.k < 0.5 ? "side" : "auto"}
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          backgroundMode={backgroundMode}
          showImageInfo={showImageInfo}
          onAddImage={() => createNode(CanvasNodeType.Image)}
          onAddVideo={() => createNode(CanvasNodeType.Video)}
          onAddAudio={() => createNode(CanvasNodeType.Audio)}
          onAddText={() => createNode(CanvasNodeType.Text)}
          onAddConfig={() => createNode(CanvasNodeType.Config)}
          onAddStoryDirector={() => createStoryDirectorFromImages([])}
          onAddSeedance2Workflow={() => createSeedance2Workflow()}
          onUndo={undoCanvas}
          onRedo={redoCanvas}
          onUpload={() => handleUploadRequest()}
          onDelete={() => requestDeleteNodes(new Set(selectedNodeIds))}
          onClear={() => setClearConfirmProjectId(projectId)}
          onDeselect={deselectCanvas}
          onBackgroundModeChange={setBackgroundMode}
          onShowImageInfoChange={setShowImageInfo}
          onOpenAssetLibrary={() => {
            setAssetPickerTab("library");
            setAssetPickerOpen(true);
          }}
          onOpenMyAssets={() => {
            setAssetPickerTab("my-assets");
            setAssetPickerOpen(true);
          }}
        />

        {isMiniMapOpen ? (
          <Minimap
            nodes={nodes}
            viewport={viewport}
            viewportSize={size}
            onViewportChange={setViewport}
          />
        ) : null}

        {generationHistoryOpen ? (
          <CanvasGenerationHistoryPanel
            nodes={nodes}
            selectedId={
              selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null
            }
            onSelect={(nodeId) => {
              setSelectedNodeIds(new Set([nodeId]));
              setSelectedConnectionId(null);
              setDialogNodeId(nodeId);
            }}
            onInsert={(node) => duplicateNode(node.id)}
            canReference={resolveCanvasImageOperationOptions(effectiveConfig, 1, { compatibleOnly: true }).some(
              (option) => option.value === "edit",
            )}
            onReference={(node) =>
              createReferenceGenerationFromImages([node], {
                imageOperation: "edit",
              })
            }
            onSave={(node) => void saveNodeAsset(node)}
            onDownload={downloadNodeImage}
            onDelete={(node) => requestDeleteNodes(new Set([node.id]))}
            onClose={() => setGenerationHistoryOpen(false)}
          />
        ) : null}

        <CanvasZoomControls
          scale={viewport.k}
          onScaleChange={setZoomScale}
          onReset={resetViewport}
          isMiniMapOpen={isMiniMapOpen}
          onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)}
        />

        {contextMenu ? (
          <CanvasNodeContextMenu
            menu={contextMenu}
            groups={buildContextMenuGroups(contextMenu)}
            onClose={() => setContextMenu(null)}
          />
        ) : null}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
          className="hidden"
          multiple
          onChange={handleImageInputChange}
        />

        <CanvasNodeInfoModal
          node={infoNode}
          open={Boolean(infoNode)}
          onClose={() => setInfoNodeId(null)}
        />

        {cropNode?.metadata?.content ? (
          <CanvasNodeCropDialog
            dataUrl={cropNode.metadata.content}
            open={Boolean(cropNode)}
            onClose={() => setCropNodeId(null)}
            onConfirm={(crop) => void cropImageNode(cropNode!, crop)}
          />
        ) : null}

        {layerEditNode?.metadata?.content ? (
          <CanvasNodeLayerEditDialog
            dataUrl={layerEditNode.metadata.content}
            open={Boolean(layerEditNode)}
            onClose={() => setLayerEditNodeId(null)}
            onConfirm={(payload) =>
              void layerEditImageNode(layerEditNode!, payload)
            }
          />
        ) : null}

        {maskEditNode?.metadata?.content ? (
          <CanvasNodeMaskEditDialog
            dataUrl={maskEditNode.metadata.content}
            open={Boolean(maskEditNode)}
            onClose={() => setMaskEditNodeId(null)}
            onConfirm={(payload) =>
              void maskEditImageNode(maskEditNode!, payload)
            }
          />
        ) : null}

        {seedance2FaceEditNode ? (
          <CanvasNodeSeedance2FaceEditDialog
            dataUrl={seedance2FaceEditDataUrl || ""}
            open={Boolean(seedance2FaceEditNode && seedance2FaceEditDataUrl)}
            onClose={() => setSeedance2FaceEditNodeId(null)}
            onConfirm={(payload) =>
              saveSeedance2FaceEditImageNode(seedance2FaceEditNode!, payload)
            }
          />
        ) : null}

        {splitNode?.metadata?.content ? (
          <CanvasNodeSplitDialog
            dataUrl={splitNode.metadata.content}
            open={Boolean(splitNode)}
            onClose={() => setSplitNodeId(null)}
            onConfirm={(params) => void splitImageNode(splitNode!, params)}
          />
        ) : null}

        {upscaleNode?.metadata?.content ? (
          <CanvasNodeUpscaleDialog
            dataUrl={upscaleNode.metadata.content}
            open={Boolean(upscaleNode)}
            onClose={() => setUpscaleNodeId(null)}
            onConfirm={(params) =>
              void aiUpscaleImageNode(upscaleNode!, params)
            }
          />
        ) : null}

        {superResolveNode?.metadata?.content ? (
          <CanvasNodeUpscaleDialog
            dataUrl={superResolveNode.metadata.content}
            open={Boolean(superResolveNode)}
            onClose={() => setSuperResolveNodeId(null)}
            onConfirm={(params) =>
              void aiUpscaleImageNode(superResolveNode, params)
            }
          />
        ) : null}

        {angleNode?.metadata?.content ? (
          <CanvasNodeAngleDialog
            dataUrl={angleNode.metadata.content}
            open={Boolean(angleNode)}
            onClose={() => setAngleNodeId(null)}
            onConfirm={(params) => void generateAngleNode(angleNode!, params)}
          />
        ) : null}

        <CanvasImageCompareDialog
          open={compareNodes.length >= 2}
          nodes={compareNodes}
          primaryId={comparePrimaryNodeId}
          onPrimaryChange={(nodeId) => {
            setComparePrimaryNodeId(nodeId);
            setSelectedNodeIds(new Set([nodeId]));
          }}
          onClose={() => {
            setCompareNodeIds([]);
            setComparePrimaryNodeId(null);
          }}
        />

        <CanvasCharacterDerivedViewsDialog
          open={Boolean(characterDerivedViewsNodeId)}
          views={resolvedCharacterDerivedViews}
          onClose={() => {
            setCharacterDerivedViewsNodeId(null);
            setResolvedCharacterDerivedViews([]);
          }}
          onExpand={() => void expandCharacterDerivedViews()}
        />

        <Modal
          title="从画布选择图片替换"
          open={Boolean(replacePickerNode)}
          centered
          footer={null}
          width={760}
          onCancel={() => setReplacePickerNodeId(null)}
        >
          {replacePickerImages.length ? (
            <div className="grid max-h-[62vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {replacePickerImages.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className="group overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition hover:border-cyan-400 hover:shadow-md"
                  onClick={() =>
                    void (
                      replacePickerNode &&
                      replaceNodeFromCanvasImage(replacePickerNode, image)
                    )
                  }
                >
                  <div className="aspect-[4/3] overflow-hidden bg-stone-100">
                    <img
                      src={image.metadata!.content!}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                      draggable={false}
                    />
                  </div>
                  <div className="flex items-center gap-2 p-3">
                    <Check className="size-4 shrink-0 text-cyan-600 opacity-0 transition group-hover:opacity-100" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-900">
                        {image.title || "画布图片"}
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {Math.round(
                          image.metadata?.naturalWidth || image.width,
                        )}{" "}
                        x{" "}
                        {Math.round(
                          image.metadata?.naturalHeight || image.height,
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center text-center text-stone-500">
              <Images className="mb-3 size-8 text-stone-300" />
              <div className="text-sm">画布里还没有其它可替换的图片</div>
            </div>
          )}
        </Modal>

        <Modal
          title="图片详情"
          open={Boolean(previewNode && canvasPreviewableSrc(previewNode))}
          centered
          onCancel={() => setPreviewNodeId(null)}
          footer={null}
          width={720}
          styles={{
            body: {
              padding: 16,
              maxHeight: "80vh",
              overflow: "auto",
            },
          }}
        >
          {previewNode ? (
            <div className="grid gap-3">
              {canvasPreviewableSrc(previewNode) ? (
                <img
                  src={canvasPreviewableSrc(previewNode)}
                  alt={previewNode.title || "图片"}
                  style={{
                    width: "100%",
                    maxHeight: "56vh",
                    objectFit: "contain",
                    background: "#0F172A",
                    borderRadius: 12,
                  }}
                />
              ) : (
                <div className="rounded-xl border px-4 py-10 text-center text-sm" role="status">
                  这张节点还没有可预览的图。提示词可以先看下面。
                </div>
              )}
              <div className="grid gap-1 text-sm">
                <div className="font-medium">{previewNode.title || "画布图片"}</div>
                {canvasPreviewPrompt(previewNode) ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 opacity-80">
                    {canvasPreviewPrompt(previewNode)}
                  </p>
                ) : (
                  <p className="text-sm opacity-60">没有保存提示词。</p>
                )}
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal
          title="确认删除节点？"
          open={pendingDeleteNodeIds.length > 0}
          centered
          onCancel={() => setPendingDeleteNodeIds([])}
          footer={
            <>
              <Button onClick={() => setPendingDeleteNodeIds([])}>取消</Button>
              <Button danger type="primary" onClick={confirmDeleteNodes}>
                删除节点
              </Button>
            </>
          }
        >
          <p className="text-sm opacity-60">
            将删除所选 {pendingDeleteNodeIds.length} 个节点及相关连线。生成中的任务不会继续显示结果，此操作可按 Ctrl/Cmd+Z 撤销。
          </p>
        </Modal>

        <Modal
          title="清空画布？"
          open={clearConfirmProjectId === projectId}
          centered
          onCancel={() => setClearConfirmProjectId(null)}
          footer={
            <>
              <Button onClick={() => setClearConfirmProjectId(null)}>取消</Button>
              <Button danger type="primary" onClick={clearCanvas}>
                清空
              </Button>
            </>
          }
        >
          <p className="text-sm opacity-60">
            这会删除当前画布上的所有节点和连线。
          </p>
        </Modal>

        <Modal
          title="删除当前画布？"
          open={deleteProjectConfirmId === projectId}
          centered
          onCancel={() => setDeleteProjectConfirmId(null)}
          footer={
            <>
              <Button onClick={() => setDeleteProjectConfirmId(null)}>取消</Button>
              <Button danger type="primary" onClick={deleteCurrentProject}>
                删除画布
              </Button>
            </>
          }
        >
          <p className="text-sm opacity-60">
            将删除“{currentProject?.title || "未命名画布"}”及其节点、连线和画布内记录；相关默认路由和其它画布不会被修改。
          </p>
        </Modal>

        <AssetPickerModal
          open={assetPickerOpen}
          defaultTab={assetPickerTab}
          onInsert={handleAssetInsert}
          onClose={() => setAssetPickerOpen(false)}
        />
      </section>
      {assistantMounted ? (
        <div className="absolute inset-x-0 bottom-0 top-14 z-[85] flex justify-end">
        <CanvasAssistantPanel
          nodes={nodes}
          selectedNodeIds={selectedNodeIds}
          sessions={chatSessions}
          activeSessionId={activeChatId}
          onSelectNodeIds={setSelectedNodeIds}
          onSessionsChange={handleAssistantSessionsChange}
          onInsertImage={insertAssistantImage}
          onInsertText={insertAssistantText}
          onPasteImage={pasteAssistantImage}
          onCollapseStart={() => setAssistantCollapsed(true)}
          onCollapse={() => setAssistantMounted(false)}
        />
        </div>
      ) : null}
    </main>
  );
}

function CanvasTopBar({
  title,
  titleDraft,
  isTitleEditing,
  onTitleDraftChange,
  onStartTitleEditing,
  onFinishTitleEditing,
  onCancelTitleEditing,
  canUndo,
  canRedo,
  onHome,
  onProjects,
  onCreateProject,
  onDeleteProject,
  onImportImage,
  onUndo,
  onRedo,
  generationHistoryOpen,
  onToggleGenerationHistory,
  assistantCollapsed,
  onExpandAssistant,
}: {
  title: string;
  titleDraft: string;
  isTitleEditing: boolean;
  onTitleDraftChange: (value: string) => void;
  onStartTitleEditing: () => void;
  onFinishTitleEditing: () => void;
  onCancelTitleEditing: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onHome: () => void;
  onProjects: () => void;
  onCreateProject: () => void;
  onDeleteProject: () => void;
  onImportImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  generationHistoryOpen: boolean;
  onToggleGenerationHistory: () => void;
  assistantCollapsed: boolean;
  onExpandAssistant: () => void;
}) {
  const colorTheme = useThemeStore((state) => state.theme);
  const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
  const theme = canvasThemes[colorTheme] || canvasThemes.light;
  const titleRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (!isTitleEditing) return;
    const close = (event: PointerEvent) => {
      if (!titleRef.current?.contains(event.target as Node))
        onFinishTitleEditing();
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [isTitleEditing, onFinishTitleEditing]);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [accountOpen]);

  useEffect(() => {
    const openShortcuts = () => {
      setShortcutsOpen(true);
      setAccountOpen(false);
    };
    window.addEventListener(CANVAS_SHORTCUT_EVENT, openShortcuts);
    return () =>
      window.removeEventListener(CANVAS_SHORTCUT_EVENT, openShortcuts);
  }, []);

  return (
    <>
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex h-[calc(56px+env(safe-area-inset-top))] items-center justify-between px-2 pt-[env(safe-area-inset-top)] sm:h-16 sm:px-4 sm:pt-0">
        <div className="pointer-events-auto flex min-w-0 items-center gap-1.5 sm:gap-3">
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                {
                  key: "home",
                  icon: <Home className="size-4" />,
                  label: "主页",
                  onClick: onHome,
                },
                {
                  key: "projects",
                  icon: <Images className="size-4" />,
                  label: "我的画布",
                  onClick: onProjects,
                },
                { type: "divider" },
                {
                  key: "new",
                  icon: <Plus className="size-4" />,
                  label: "新建画布",
                  onClick: onCreateProject,
                },
                {
                  key: "delete",
                  danger: true,
                  icon: <Trash2 className="size-4" />,
                  label: "删除当前画布",
                  onClick: onDeleteProject,
                },
                { type: "divider" },
                {
                  key: "import",
                  icon: <Upload className="size-4" />,
                  label: "导入素材",
                  onClick: onImportImage,
                },
                { type: "divider" },
                {
                  key: "undo",
                  disabled: !canUndo,
                  icon: <Undo2 className="size-4" />,
                  label: <MenuLabel text="撤销" shortcut="⌘ Z" />,
                  onClick: onUndo,
                },
                {
                  key: "redo",
                  disabled: !canRedo,
                  icon: <Redo2 className="size-4" />,
                  label: <MenuLabel text="重做" shortcut="⌘ ⇧ Z / ⌘ Y" />,
                  onClick: onRedo,
                },
              ],
            }}
          >
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full transition hover:bg-black/5 sm:size-9 dark:hover:bg-white/10"
              style={{ color: theme.node.text }}
              aria-label="打开画布菜单"
            >
              <Menu className="size-5" />
            </button>
          </Dropdown>

          <div ref={titleRef} className="flex min-w-0 items-center gap-2">
            {isTitleEditing ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(event) => onTitleDraftChange(event.target.value)}
                onBlur={onFinishTitleEditing}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onFinishTitleEditing();
                  if (event.key === "Escape") onCancelTitleEditing();
                }}
                className="max-w-[42vw] bg-transparent p-0 text-left text-base font-semibold tracking-normal outline-none sm:max-w-[280px] sm:text-lg"
                style={{ color: theme.node.text }}
              />
            ) : (
              <button
                type="button"
                className="max-w-[42vw] truncate border-b border-dashed border-transparent text-left text-base font-semibold tracking-normal transition hover:border-current sm:max-w-[280px] sm:text-lg"
                onDoubleClick={onStartTitleEditing}
                title="双击修改画布名称"
              >
                {title}
              </button>
            )}
          </div>
        </div>

        <div className="pointer-events-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
          <Button
            type="text"
            className="!h-10 !rounded-xl !px-2 !font-medium sm:!px-3"
            style={{
              background: generationHistoryOpen
                ? theme.toolbar.activeBg
                : theme.toolbar.panel,
              color: generationHistoryOpen
                ? theme.toolbar.activeText
                : theme.node.text,
              boxShadow: "0 10px 30px rgba(28,25,23,.10)",
            }}
            icon={<PanelRightOpen className="size-4" />}
            onClick={onToggleGenerationHistory}
          >
            <span className="hidden sm:inline">历史</span>
          </Button>
          <UserStatusActions
            variant="canvas"
            showDocs={false}
            showConfig={false}
            accountOpen={accountOpen}
            onAccountOpenChange={setAccountOpen}
            accountRef={accountRef}
            getPopupContainer={(node) => node.parentElement || document.body}
            onOpenShortcuts={() => {
              setShortcutsOpen(true);
              setAccountOpen(false);
            }}
          />
          {assistantCollapsed ? (
            <>
              <span
                className="h-6 w-px"
                style={{ background: theme.toolbar.border }}
              />
              <Button
                type="text"
                className="!h-10 !rounded-xl !px-2 !font-medium sm:!px-3"
                style={{
                  background: theme.toolbar.panel,
                  color: theme.node.text,
                  boxShadow: "0 10px 30px rgba(28,25,23,.10)",
                }}
                icon={<MessageSquare className="size-4" />}
                onClick={onExpandAssistant}
              >
                <span className="hidden sm:inline">助手</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <Modal
        title="快捷键"
        open={shortcutsOpen}
        onCancel={() => setShortcutsOpen(false)}
        footer={null}
        centered
      >
        <div
          className="space-y-2 border-t pt-4 text-sm"
          style={{ borderColor: theme.node.stroke }}
        >
          <Shortcut keys={["拖动画布"]} value="平移视图" />
          <Shortcut keys={["滚轮"]} value="缩放画布" />
          <Shortcut keys={["缩放滑杆"]} value="精确调整缩放" />
          <Shortcut keys={["点击板块"]} value="出现蓝色选中框" />
          <Shortcut
            keys={["选中板块", "Delete / Backspace"]}
            value="删除板块"
          />
          <Shortcut keys={["Ctrl / Cmd", "拖动"]} value="框选多个节点" />
          <Shortcut
            keys={["Shift / Ctrl / Cmd", "点击"]}
            value="追加选择节点"
          />
          <Shortcut keys={["Ctrl / Cmd", "A"]} value="全选节点" />
          <Shortcut
            keys={["Ctrl / Cmd", "C / V"]}
            value="复制 / 粘贴节点，或粘贴剪切板文本/图片"
          />
          <Shortcut keys={["Ctrl / Cmd", "D"]} value="复制一份选中节点" />
          <Shortcut keys={["Ctrl / Cmd", "Z"]} value="撤销" />
          <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value="重做" />
          <Shortcut keys={["Ctrl / Cmd", "Y"]} value="重做" />
          <Shortcut keys={["Ctrl / Cmd", "+ / -"]} value="放大 / 缩小" />
          <Shortcut keys={["Ctrl / Cmd", "0"]} value="重置视图" />
          <Shortcut keys={["Ctrl / Cmd", "N"]} value="新建画布" />
          <Shortcut keys={["Ctrl / Cmd", "O"]} value="导入素材" />
          <Shortcut keys={["I / T / G"]} value="新增图片 / 文本 / 配置节点" />
          <Shortcut keys={["V / A"]} value="新增视频 / 音频节点" />
          <Shortcut keys={["U"]} value="导入素材" />
          <Shortcut keys={["L / B"]} value="打开素材库 / 我的素材" />
          <Shortcut keys={["M"]} value="显示或隐藏小地图" />
          <Shortcut keys={["H"]} value="打开画布助手" />
          <Shortcut keys={["?"]} value="打开快捷键" />
          <Shortcut keys={["Delete / Backspace"]} value="删除选中板块或连线" />
          <Shortcut keys={["Esc"]} value="取消选择并关闭浮层" />
          <Shortcut keys={["按住图片", "滚轮"]} value="按预设比例缩放图片" />
          <Shortcut keys={["Cmd", "滚轮"]} value="上下平移画布" />
          <Shortcut keys={["滚轮 / 侧滚轮"]} value="左右平移画布" />
          <Shortcut keys={["拖入图片/视频/音频"]} value="上传到画布" />
        </div>
      </Modal>
    </>
  );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
  return (
    <span className="flex min-w-36 items-center justify-between gap-8">
      <span>{text}</span>
      <span className="text-xs opacity-45">{shortcut}</span>
    </span>
  );
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-6 rounded-lg px-1 py-1.5">
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {keys.map((key, index) => (
          <span key={`${key}-${index}`} className="flex items-center gap-1.5">
            {index ? <span className="text-xs opacity-35">+</span> : null}
            <kbd
              className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.06)]"
              style={{
                borderColor: "rgba(120,113,108,.28)",
                background: "linear-gradient(#fff, rgba(245,245,244,.92))",
                color: "rgb(68,64,60)",
              }}
            >
              {key}
            </kbd>
          </span>
        ))}
      </span>
      <span className="text-right text-sm opacity-55">{value}</span>
    </div>
  );
}

function imageExtension(dataUrl: string) {
  return (
    dataUrl.match(/^data:image[/]([^;]+)/)?.[1] ||
    dataUrl.match(/image[/]([^;]+)/)?.[1] ||
    "png"
  );
}

async function clipboardImageBlob(dataUrl: string) {
  const sourceBlob = await (await fetch(dataUrl)).blob();
  if (sourceBlob.type === "image/png") return sourceBlob;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("图片解码失败"));
    element.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, image.naturalWidth || image.width);
  canvas.height = Math.max(1, image.naturalHeight || image.height);
  const context = canvas.getContext("2d");
  if (!context) return sourceBlob;
  context.drawImage(image, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片转换失败"))),
      "image/png",
    );
  });
}

function copyImageWithLegacySelection(dataUrl: string) {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("contenteditable", "true");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "1px";
  wrapper.style.height = "1px";
  wrapper.style.overflow = "hidden";
  const image = document.createElement("img");
  image.src = dataUrl;
  image.alt = "canvas image";
  wrapper.appendChild(image);
  document.body.appendChild(wrapper);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNode(image);
  selection?.removeAllRanges();
  selection?.addRange(range);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    selection?.removeAllRanges();
    document.body.removeChild(wrapper);
  }
  return copied;
}

function audioExtension(mimeType?: string) {
  if (mimeType?.includes("wav")) return "wav";
  if (mimeType?.includes("opus")) return "opus";
  if (mimeType?.includes("aac")) return "aac";
  if (mimeType?.includes("flac")) return "flac";
  if (mimeType?.includes("pcm")) return "pcm";
  return "mp3";
}

function referencesImageLabel(prompt: string) {
  return /图片\s*\d+/.test(prompt);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientImageLimitError(message: string) {
  return /Concurrency|429|Too Many Requests|OAuth|503|Service Unavailable/i.test(
    message,
  );
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  const limit = Math.max(1, Math.floor(concurrency));
  let nextIndex = 0;
  const errors: unknown[] = [];
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          await worker(items[currentIndex], currentIndex);
        } catch (error) {
          errors.push(error);
        }
      }
    },
  );
  await Promise.all(runners);
  if (errors.length) {
    const first = errors[0];
    throw first instanceof Error ? first : new Error("批量生成失败");
  }
}

type CanvasImageBatchTarget = {
  targetId: string;
  taskId: string;
};

type CanvasImageTaskBindingTarget = {
  targetId: string;
  binding: CanvasImageTaskBinding;
};

async function requestCanvasImageBatch(
  targets: CanvasImageBatchTarget[],
  config: AiConfig,
  operation: ImageRequestOperation,
  prompt: string,
  references: ReferenceImage[],
  options: {
    useReferenceLabels?: boolean;
    boardRouteKey?: ApiBoardRouteKey;
    mask?: ReferenceImage;
    onNativeTaskSubmitted?: (
      bindings: readonly CanvasImageTaskBindingTarget[],
    ) => Promise<void>;
  } = {},
): Promise<CanvasImageBatchOutcome<GeneratedImageResult>[]> {
  const boardRouteKey = options.boardRouteKey || "imageGeneration";
  const requestPreflight = await preflightImageRequest(
    config,
    operation,
    prompt,
    references,
    options.mask,
    boardRouteKey,
    { useReferenceLabels: options.useReferenceLabels },
  );
  const route = requestPreflight.route;
  const settingsContext = resolveImageSettingsContext(
    config,
    operation,
  );
  const imageAdvancedSettings = readImageAdvancedSettings(
    config.imageAdvancedSettingsByScope,
    settingsContext.scope,
  );
  const resultPolicy = canvasImageBatchResultPolicy(
    requestPreflight.capability,
    imageAdvancedSettings,
  );
  const targetById = new Map(targets.map((target) => [target.targetId, target]));
  let nativeTargetCursor = 0;

  return dispatchCanvasImageBatch({
    targets: targets.map((target) => target.targetId),
    transport:
      route.mode === "local" || route.mode === "localPool"
        ? "local-batch"
        : "remote-single-task",
    resultPolicy,
    runLocalBatch: async (outputCount) => {
      if (options.mask && !references.length) {
        throw new Error(
          "蒙版编辑至少需要 1 张源图；已阻止无源图提交，不会降级为整图生成。",
        );
      }
      const hydratedMask = options.mask
        ? { ...options.mask, dataUrl: await imageToDataUrl(options.mask) }
        : undefined;
      const batchConfig = { ...config, count: String(outputCount) };
      const persistSubmittedTask = options.onNativeTaskSubmitted;
      const onNativeTaskSubmitted = persistSubmittedTask
        ? async (submitted: Parameters<typeof snapshotSubmittedNativeImageTask>[1]) => {
            const snapshot = snapshotSubmittedNativeImageTask(route, submitted, {
              operation,
              capabilityId: requestPreflight.capability.id,
              resultPolicy,
            });
            const batchTargets = targets.slice(
              nativeTargetCursor,
              nativeTargetCursor + submitted.expectedOutputs,
            );
            if (batchTargets.length !== submitted.expectedOutputs) {
              throw new Error("原生图片任务输出与画布目标数量不一致，已停止轮询");
            }
            nativeTargetCursor += submitted.expectedOutputs;
            await persistSubmittedTask(
              batchTargets.map((target, outputIndex) => ({
                targetId: target.targetId,
                binding: {
                  snapshot,
                  attemptId: target.taskId,
                  outputIndex,
                },
              })),
            );
          }
        : undefined;
      if (operation === "edit") return requestEdit(
            batchConfig,
            prompt,
            references,
            hydratedMask,
            boardRouteKey,
            {
              useReferenceLabels: options.useReferenceLabels,
              onNativeTaskSubmitted,
            },
          );
      if (operation === "variation") return requestVariation(batchConfig, references[0], boardRouteKey, {
        prompt,
        onNativeTaskSubmitted,
      });
      if (operation === "responses-tool") return requestResponsesImage(batchConfig, prompt, references, hydratedMask, boardRouteKey, {
        onNativeTaskSubmitted,
      });
      return requestGeneration(batchConfig, prompt, boardRouteKey, {
            references,
            onNativeTaskSubmitted,
          });
    },
    runRemoteSingle: async (targetId, outputCount) => {
      const target = targetById.get(targetId);
      if (!target) throw new Error(`图片批量目标不存在：${targetId}`);
      const singleConfig = { ...config, count: String(outputCount) };
      if (operation === "variation" || operation === "responses-tool") {
        const images = operation === "variation"
          ? await requestVariation(singleConfig, references[0], boardRouteKey, { prompt })
          : await requestResponsesImage(singleConfig, prompt, references, options.mask, boardRouteKey);
        assertExactCanvasImageBatchCardinality(outputCount, images.length);
        return images[0];
      }
      const pollTaskId = await submitCanvasImageTask(
        target.taskId,
        singleConfig,
        operation,
        prompt,
        references,
        {
          useReferenceLabels: options.useReferenceLabels,
          boardRouteKey: options.boardRouteKey,
          mask: options.mask,
        },
      );
      return pollCanvasImageTask(pollTaskId);
    },
  });
}

async function submitCanvasImageTask(
  taskId: string,
  config: AiConfig,
  operation: ImageRequestOperation,
  prompt: string,
  references: ReferenceImage[],
  options: {
    useReferenceLabels?: boolean;
    boardRouteKey?: ApiBoardRouteKey;
    mask?: ReferenceImage;
    onNativeTaskSubmitted?: NativeImageTaskSubmissionObserver;
  } = {},
): Promise<string> {
  const boardRouteKey = options.boardRouteKey || "imageGeneration";
  const requestPreflight = await preflightImageRequest(config, operation, prompt, references, options.mask, boardRouteKey, {
    useReferenceLabels: options.useReferenceLabels,
    onNativeTaskSubmitted: options.onNativeTaskSubmitted,
  });
  const route = requestPreflight.route;
  if (options.mask && !references.length) {
    throw new Error("蒙版编辑至少需要 1 张源图；已阻止无源图提交，不会降级为整图生成。");
  }
  const hydratedMask = options.mask
    ? { ...options.mask, dataUrl: await imageToDataUrl(options.mask) }
    : undefined;
  if (route.mode === "local" || route.mode === "localPool") {
    const localTask = (
      operation === "edit"
        ? requestEdit(config, prompt, references, hydratedMask, boardRouteKey, {
            useReferenceLabels: options.useReferenceLabels,
            onNativeTaskSubmitted: options.onNativeTaskSubmitted,
          })
        : operation === "variation"
          ? requestVariation(config, references[0], boardRouteKey, { prompt, onNativeTaskSubmitted: options.onNativeTaskSubmitted })
          : operation === "responses-tool"
            ? requestResponsesImage(config, prompt, references, hydratedMask, boardRouteKey, { onNativeTaskSubmitted: options.onNativeTaskSubmitted })
            : requestGeneration(config, prompt, boardRouteKey, {
            references,
            onNativeTaskSubmitted: options.onNativeTaskSubmitted,
          })
    ).then((images) => {
      assertExactCanvasImageBatchCardinality(1, images.length);
      return images[0];
    });
    localCanvasImageTasks.set(taskId, localTask);
    return taskId;
  }

  if (operation === "generate" && references.length) {
    throw new Error(
      "平台通用图片生成任务没有已验证的参考图合同；已停止提交，不会改写为图片编辑任务。",
    );
  }
  if (references.length) {
    const hydratedReferences = await Promise.all(
      references.map(async (image) => ({
        ...image,
        dataUrl: await imageToDataUrl(image),
      })),
    );
    const files = hydratedReferences.map((image) => dataUrlToFile(image));
    const maskFile = hydratedMask ? dataUrlToFile(hydratedMask) : undefined;
    const promptText = options.useReferenceLabels
      ? buildImageReferencePromptText(prompt, references)
      : prompt;
    const response = await createImageEditTask(
      taskId,
      files,
      promptText,
      route.model,
      config.size,
      outputSizeForCanvasTask(config.quality),
      undefined,
      undefined,
      undefined,
      maskFile,
    );
    return canvasImageSubmittedTaskId(response, taskId);
  }
  const response = await createImageGenerationTask(
    taskId,
    prompt,
    route.model,
    config.size,
    outputSizeForCanvasTask(config.quality),
  );
  return canvasImageSubmittedTaskId(response, taskId);
}

function canvasImageSubmittedTaskId(response: unknown, fallbackTaskId: string) {
  if (!response || typeof response !== "object") return fallbackTaskId;
  const record = response as Record<string, unknown>;
  const task =
    record.task && typeof record.task === "object"
      ? (record.task as Record<string, unknown>)
      : undefined;
  return (
    stringValue(record.task_id) ||
    stringValue(record.id) ||
    stringValue(task?.task_id) ||
    stringValue(task?.id) ||
    fallbackTaskId
  );
}

async function pollCanvasImageTask(
  taskId: string,
): Promise<GeneratedImageResult> {
  const localTask = localCanvasImageTasks.get(taskId);
  if (localTask) {
    try {
      return await localTask;
    } finally {
      localCanvasImageTasks.delete(taskId);
    }
  }

  let failureCount = 0;
  let missingSince: number | null = null;
  while (true) {
    let taskList: Awaited<ReturnType<typeof fetchImageTasks>>;
    try {
      taskList = await fetchImageTasks([taskId]);
      failureCount = 0;
    } catch (error) {
      failureCount += 1;
      if (failureCount >= CANVAS_IMAGE_TASK_POLL_RETRY_LIMIT) {
        throw error instanceof Error
          ? error
          : new Error("图片任务状态查询失败，请刷新后重试");
      }
      await sleep(CANVAS_IMAGE_TASK_POLL_INTERVAL_MS);
      continue;
    }
    const task = taskList.items.find((item) => item.id === taskId);
    if (task) {
      missingSince = null;
    }
    if (isCanvasImageTaskSuccess(task?.status)) {
      const image = imageTaskToGeneratedImage(task);
      if (image) return image;
      throw new Error("图片任务完成但没有返回可用图片");
    }
    if (isCanvasImageTaskFailure(task?.status)) {
      throw new Error(task.error || "图片任务失败");
    }
    if (taskList.missing_ids?.includes(taskId)) {
      const now = Date.now();
      missingSince ??= now;
      if (now - missingSince >= CANVAS_IMAGE_TASK_MISSING_GRACE_MS) {
        throw new Error("图片任务状态同步超时，请刷新后查看生成结果或重新生成");
      }
      await sleep(CANVAS_IMAGE_TASK_POLL_INTERVAL_MS);
      continue;
    }
    missingSince = null;
    await sleep(CANVAS_IMAGE_TASK_POLL_INTERVAL_MS);
  }
}

function isCanvasImageTaskSuccess(status?: string) {
  return (
    status === "success" ||
    status === "completed" ||
    status === "done" ||
    status === "succeeded"
  );
}

function isCanvasImageTaskFailure(status?: string) {
  return (
    status === "error" ||
    status === "failed" ||
    status === "canceled" ||
    status === "cancelled"
  );
}

function imageTaskToGeneratedImage(
  task: ImageTask,
): GeneratedImageResult | null {
  const item = task.data?.find((entry) => entry.b64_json || entry.url);
  if (!item) return null;
  const backendUrl = normalizeCanvasImageUrl(item.url?.trim() || "");
  const dataUrl = item.b64_json
    ? base64ImageDataUrl(item.b64_json)
    : backendUrl;
  if (!dataUrl) return null;
  return {
    id: task.id,
    dataUrl,
    backendUrl: backendUrl || undefined,
    backendRel: extractBackendImageRel(backendUrl),
    revisedPrompt: item.revised_prompt,
  };
}

function extractBackendImageRel(url: string) {
  const marker = "/images/";
  const index = url.indexOf(marker);
  if (index < 0) return undefined;
  return (
    decodeURIComponent(
      url
        .slice(index + marker.length)
        .split("?", 1)[0]
        .split("#", 1)[0],
    ).replace(/^\/+/, "") || undefined
  );
}

let lastProtectedCanvasImageKey = "";

function protectBackendImagesForCanvas(
  nodes: CanvasNodeData[],
  projectId: string,
) {
  const paths = Array.from(
    new Set(
      nodes
        .filter((node) => node.type === CanvasNodeType.Image)
        .map(
          (node) =>
            node.metadata?.backendRel ||
            extractBackendImageRel(
              node.metadata?.backendUrl || node.metadata?.content || "",
            ),
        )
        .filter((path): path is string => Boolean(path)),
    ),
  ).sort();
  if (!paths.length) return;
  const key = `${projectId}:${paths.join("|")}`;
  if (key === lastProtectedCanvasImageKey) return;
  lastProtectedCanvasImageKey = key;
  void protectCanvasImages(paths, projectId).catch(() => {
    lastProtectedCanvasImageKey = "";
  });
}

function outputSizeForCanvasTask(quality: string | undefined) {
  const normalized = String(quality || "")
    .trim()
    .toLowerCase();
  if (normalized === "medium" || normalized === "2k") return "2k";
  if (normalized === "high" || normalized === "4k") return "4k";
  return "1k";
}

function storyDirectorShotNodeSize(size: string | undefined) {
  return (
    nodeSizeFromRatio(
      size || "9:16",
      STORY_DIRECTOR_SHOT_NODE_WIDTH,
      STORY_DIRECTOR_SHOT_NODE_HEIGHT,
    ) || {
      width: STORY_DIRECTOR_SHOT_NODE_WIDTH,
      height: STORY_DIRECTOR_SHOT_NODE_HEIGHT,
    }
  );
}

function storyDirectorGridPosition(
  baseX: number,
  baseY: number,
  index: number,
  size: { width: number; height: number },
): Position {
  return {
    x:
      baseX +
      (index % STORY_DIRECTOR_SHOT_COLUMNS) *
        (size.width + STORY_DIRECTOR_SHOT_COLUMN_GAP),
    y:
      baseY +
      Math.floor(index / STORY_DIRECTOR_SHOT_COLUMNS) *
        (size.height + STORY_DIRECTOR_SHOT_ROW_GAP),
  };
}

function imageMetadata(
  image: UploadedImage,
  generated?: Pick<GeneratedImageResult, "backendUrl" | "backendRel">,
): CanvasNodeMetadata {
  const backendUrl = normalizeCanvasImageUrl(generated?.backendUrl || "");
  return {
    // The upstream URL may be a short-lived signed URL. uploadImage() has
    // already stored a durable local copy, which must drive the canvas preview.
    content: image.url,
    backendUrl,
    backendRel: generated?.backendRel,
    storageKey: image.storageKey,
    status: "success",
    errorDetails: undefined,
    sourceImageTaskId: undefined,
    imageGenerationAttemptId: undefined,
    imageGenerationTask: undefined,
    naturalWidth: image.width,
    naturalHeight: image.height,
    bytes: image.bytes,
    mimeType: image.mimeType,
    retained: true,
  };
}

function videoMetadata(video: UploadedFile): CanvasNodeMetadata {
  return {
    content: video.url,
    storageKey: video.storageKey,
    status: "success",
    naturalWidth: video.width,
    naturalHeight: video.height,
    bytes: video.bytes,
    mimeType: video.mimeType,
    durationMs: video.durationMs,
  };
}

function audioMetadata(audio: UploadedFile): CanvasNodeMetadata {
  return {
    content: audio.url,
    storageKey: audio.storageKey,
    status: "success",
    bytes: audio.bytes,
    mimeType: audio.mimeType,
    durationMs: audio.durationMs,
  };
}

function resolveGenerationMetadataModelIdentity(
  config: AiConfig,
  capability: CanvasNodeGenerationMode,
  boardRouteKey?: ApiBoardRouteKey,
): Pick<CanvasNodeMetadata, "model" | "modelProviderId"> {
  const boardRoute = boardRouteKey
    ? config.apiBoardRouting[boardRouteKey]
    : undefined;
  const capabilityRoute = config.apiRouting[capability];
  const preferredSelection =
    boardRoute?.mode === "custom" && boardRoute.providerId && boardRoute.model
      ? { providerId: boardRoute.providerId, model: boardRoute.model }
      : capabilityRoute?.providerId && capabilityRoute.model
        ? {
            providerId: capabilityRoute.providerId,
            model: capabilityRoute.model,
          }
        : config.model;
  const route = resolveApiRequestRoute(
    config,
    capability,
    preferredSelection,
    boardRouteKey,
  );
  return {
    model: route.model,
    ...(route.mode === "local"
      ? { modelProviderId: route.provider.id }
      : {}),
  };
}

function defaultCanvasProviderModelMetadata(
  config: AiConfig,
  capability: CanvasNodeGenerationMode,
): Pick<CanvasNodeMetadata, "model" | "modelProviderId"> {
  const boardRouteKey: ApiBoardRouteKey | undefined =
    capability === "image"
      ? "imageGeneration"
      : capability === "video"
        ? "videoGeneration"
        : capability === "text"
          ? "imagePrompt"
          : undefined;
  const boardRoute = boardRouteKey
    ? config.apiBoardRouting[boardRouteKey]
    : undefined;
  const route =
    boardRoute?.mode === "custom"
      ? boardRoute
      : config.apiRouting[capability];
  const fallbackModel =
    capability === "image"
      ? config.imageModel
      : capability === "video"
        ? config.videoModel
        : capability === "audio"
          ? config.audioModel
          : config.textModel;
  const model = String(route?.model || fallbackModel || config.model || "").trim();
  return {
    model,
    ...(route?.providerId && route.model === model
      ? { modelProviderId: route.providerId }
      : {}),
  };
}

function buildImageGenerationMetadata(
  operation: CanvasImageOperation,
  config: AiConfig,
  count: number,
  references: ReferenceImage[],
): CanvasNodeMetadata {
  const advancedSnapshot = snapshotCanvasImageAdvancedSettings(config, operation);
  const storyImageReferenceSnapshots = snapshotStoryImageReferences(references);
  return {
    imageOperation: operation,
    generationType: legacyCanvasImageGenerationType(operation),
    ...resolveGenerationMetadataModelIdentity(
      config,
      "image",
      "imageGeneration",
    ),
    size: config.size,
    quality: config.quality,
    count,
    references: snapshotCanvasImageReferenceUrls(references),
    ...(storyImageReferenceSnapshots.length
      ? { storyImageReferenceSnapshots }
      : {}),
    ...advancedSnapshot,
  };
}

function snapshotStoryImageReferences(
  references: ReferenceImage[],
): StoryImageReferenceSemanticSnapshot[] {
  return references.flatMap((reference) => {
    const semantic = reference as ReferenceImage &
      Partial<StoryImageReferenceSemanticSnapshot>;
    if (
      !reference.storageKey ||
      !semantic.sourceNodeId ||
      !isStoryImageReferenceRole(semantic.role)
    )
      return [];
    return [
      {
        id: reference.id,
        sourceNodeId: semantic.sourceNodeId,
        storageKey: reference.storageKey,
        role: semantic.role,
        ...(semantic.entityId ? { entityId: semantic.entityId } : {}),
        ...(semantic.angle ? { angle: semantic.angle } : {}),
      },
    ];
  });
}

function isStoryImageReferenceRole(
  value: unknown,
): value is StoryImageReferenceSemanticSnapshot["role"] {
  return (
    value === "identity" ||
    value === "scene" ||
    value === "prop" ||
    value === "story" ||
    value === "style"
  );
}

function snapshotCanvasImageAdvancedSettings(
  config: AiConfig,
  operation: CanvasImageOperation,
): Pick<
  CanvasNodeMetadata,
  "imageAdvancedSettings" | "imageAdvancedScope"
> {
  try {
    const route = resolveApiRequestRoute(
      config,
      "image",
      explicitMediaRequestModel(config, "image"),
      "imageGeneration",
    );
    if (route.mode !== "local") return {};
    const scope = {
      providerId: route.provider.id,
      model: route.model,
      operation,
    };
    return {
      imageAdvancedScope: scope,
      imageAdvancedSettings: readImageAdvancedSettings(
        config.imageAdvancedSettingsByScope,
        scope,
      ),
    };
  } catch {
    // Submission performs the authoritative route preflight. Metadata capture
    // must not make an unresolved route look valid or replace its error.
    return {};
  }
}

function buildAudioGenerationMetadata(config: AiConfig): CanvasNodeMetadata {
  return {
    ...resolveGenerationMetadataModelIdentity(config, "audio"),
    audioVoice: config.audioVoice,
    audioFormat: config.audioFormat,
    audioSpeed: config.audioSpeed,
    audioInstructions: config.audioInstructions,
  };
}

function referenceUrl(image: ReferenceImage) {
  return (
    image.storageKey ||
    image.url ||
    (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined)
  );
}

function generationReferenceUrls(context: {
  referenceImages: ReferenceImage[];
  referenceVideos: Array<{ storageKey?: string; url?: string }>;
  referenceAudios?: Array<{ storageKey?: string; url?: string }>;
}) {
  return [
    ...context.referenceImages
      .map(referenceUrl)
      .filter((url): url is string => Boolean(url)),
    ...context.referenceVideos
      .map((video) => video.storageKey || video.url)
      .filter((url): url is string => Boolean(url)),
    ...(context.referenceAudios || [])
      .map((audio) => audio.storageKey || audio.url)
      .filter((url): url is string => Boolean(url)),
  ];
}

async function resolveMetadataReferences(
  metadata: CanvasNodeMetadata,
  nodes: readonly CanvasNodeData[] = [],
) {
  if (metadata.references?.length) {
    return resolveSavedReferenceUrls(
      metadata.references,
      metadata.storyImageReferenceSnapshots,
    );
  }
  if (
    metadata.imageOperation === "generate" ||
    (!metadata.imageOperation && metadata.generationType !== "edit")
  ) {
    return [];
  }
  return null;
}

async function resolveImageNodeSavedReferences(
  metadata: CanvasNodeMetadata,
  nodes: readonly CanvasNodeData[] = [],
) {
  return resolveSavedReferenceUrls(
    metadata.references,
    metadata.storyImageReferenceSnapshots,
  );
}

async function resolveSavedReferenceUrls(
  urls: string[] | undefined,
  storySnapshots?: StoryImageReferenceSemanticSnapshot[],
) {
  if (!urls?.length) return [];
  const references = await Promise.all(
    urls.map(async (url, index) => {
      const dataUrl = url.startsWith("image:")
        ? await resolveImageUrl(url, "")
        : url;
      const storySnapshot = storyImageReferenceSnapshotForStorageKey(
        storySnapshots,
        url,
      );
      return dataUrl
        ? {
            id: storySnapshot?.id || `${index}`,
            name: `reference-${index}.png`,
            type: "image/png",
            dataUrl,
            storageKey: url.startsWith("image:") ? url : undefined,
            ...(url.startsWith("image:") ? {} : { url }),
            ...(storySnapshot
              ? {
                  sourceNodeId: storySnapshot.sourceNodeId,
                  role: storySnapshot.role,
                  entityId: storySnapshot.entityId,
                  angle: storySnapshot.angle,
                }
              : {}),
          }
        : null;
    }),
  );
  return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

function storyImageReferenceSnapshotForStorageKey(
  snapshots: StoryImageReferenceSemanticSnapshot[] | undefined,
  storageKey: string,
) {
  if (!Array.isArray(snapshots)) return undefined;
  return snapshots.find(
    (snapshot) =>
      snapshot &&
      typeof snapshot.id === "string" &&
      typeof snapshot.sourceNodeId === "string" &&
      snapshot.storageKey === storageKey &&
      isStoryImageReferenceRole(snapshot.role),
  );
}

async function hydrateCanvasImages(nodes: CanvasNodeData[], signal?: AbortSignal) {
  const restored = [...nodes];
  for (
    let index = 0;
    index < nodes.length;
    index += CANVAS_RESTORE_CHUNK_SIZE
  ) {
    const chunk = await Promise.all(
      nodes
        .slice(index, index + CANVAS_RESTORE_CHUNK_SIZE)
        .map((node) => hydrateCanvasNode(node, signal)),
    );
    if (signal?.aborted) throw signal.reason;
    restored.splice(index, chunk.length, ...chunk);
    await yieldToBrowser();
  }
  return restored;
}

function stripExpiredPersistedCanvasObjectUrls(nodes: CanvasNodeData[]) {
  return nodes.map((node) => {
    if (
      !node.metadata?.storageKey ||
      !node.metadata.content?.startsWith("blob:")
    )
      return node;
    return {
      ...node,
      metadata: { ...node.metadata, content: "" },
    };
  });
}

function stripExpiredPersistedAssistantObjectUrls(
  sessions: CanvasAssistantSession[],
) {
  const sanitizeItem = <T extends { dataUrl?: string; storageKey?: string }>(
    item: T,
  ) =>
    item.storageKey && item.dataUrl?.startsWith("blob:")
      ? { ...item, dataUrl: "" }
      : item;
  return sessions.map((session) => ({
    ...session,
    messages: session.messages.map((message) => ({
      ...message,
      references: message.references?.map(sanitizeItem),
      images: message.images?.map(sanitizeItem),
    })),
  }));
}

const CANVAS_MEDIA_SOURCE_KEYS: (keyof CanvasNodeMetadata)[] = [
  "content",
  "storageKey",
  "backendUrl",
  "backendRel",
  "sourceImageTaskId",
  "status",
  "errorDetails",
  "retained",
];

function mergeHydratedCanvasMedia(
  currentNodes: CanvasNodeData[],
  sourceNodes: CanvasNodeData[],
  hydratedNodes: CanvasNodeData[],
) {
  const sourceById = new Map(sourceNodes.map((node) => [node.id, node]));
  const hydratedById = new Map(hydratedNodes.map((node) => [node.id, node]));
  return currentNodes.map((currentNode) => {
    const sourceNode = sourceById.get(currentNode.id);
    const hydratedNode = hydratedById.get(currentNode.id);
    if (
      !sourceNode ||
      !hydratedNode ||
      currentNode.type !== sourceNode.type ||
      currentNode.type !== hydratedNode.type ||
      !CANVAS_MEDIA_SOURCE_KEYS.every((key) =>
        Object.is(currentNode.metadata?.[key], sourceNode.metadata?.[key]),
      )
    )
      return currentNode;
    return {
      ...currentNode,
      metadata: {
        ...currentNode.metadata,
        content: hydratedNode.metadata?.content,
        storageKey: hydratedNode.metadata?.storageKey,
        backendUrl: hydratedNode.metadata?.backendUrl,
        backendRel: hydratedNode.metadata?.backendRel,
        status: hydratedNode.metadata?.status,
        errorDetails: hydratedNode.metadata?.errorDetails,
        sourceImageTaskId: hydratedNode.metadata?.sourceImageTaskId,
        naturalWidth: hydratedNode.metadata?.naturalWidth,
        naturalHeight: hydratedNode.metadata?.naturalHeight,
        bytes: hydratedNode.metadata?.bytes,
        mimeType: hydratedNode.metadata?.mimeType,
        retained: hydratedNode.metadata?.retained,
      },
    };
  });
}

function mergeHydratedAssistantMedia(
  currentSessions: CanvasAssistantSession[],
  sourceSessions: CanvasAssistantSession[],
  hydratedSessions: CanvasAssistantSession[],
) {
  const sourceById = new Map(sourceSessions.map((session) => [session.id, session]));
  const hydratedById = new Map(
    hydratedSessions.map((session) => [session.id, session]),
  );
  return currentSessions.map((currentSession) => {
    const sourceSession = sourceById.get(currentSession.id);
    const hydratedSession = hydratedById.get(currentSession.id);
    if (!sourceSession || !hydratedSession) return currentSession;
    const sourceMessages = new Map(
      sourceSession.messages.map((message) => [message.id, message]),
    );
    const hydratedMessages = new Map(
      hydratedSession.messages.map((message) => [message.id, message]),
    );
    return {
      ...currentSession,
      messages: currentSession.messages.map((currentMessage) => {
        const sourceMessage = sourceMessages.get(currentMessage.id);
        const hydratedMessage = hydratedMessages.get(currentMessage.id);
        if (!sourceMessage || !hydratedMessage) return currentMessage;
        return {
          ...currentMessage,
          references: mergeHydratedAssistantItems(
            currentMessage.references || [],
            sourceMessage.references || [],
            hydratedMessage.references || [],
          ),
          images: mergeHydratedAssistantItems(
            currentMessage.images || [],
            sourceMessage.images || [],
            hydratedMessage.images || [],
          ),
        };
      }),
    };
  });
}

function mergeHydratedCanvasHistoryEntry(
  entry: CanvasHistoryEntry,
  sourceNodes: CanvasNodeData[],
  hydratedNodes: CanvasNodeData[],
  sourceSessions: CanvasAssistantSession[],
  hydratedSessions: CanvasAssistantSession[],
): CanvasHistoryEntry {
  return {
    ...entry,
    nodes: mergeHydratedCanvasMedia(entry.nodes, sourceNodes, hydratedNodes),
    chatSessions: mergeHydratedAssistantMedia(
      entry.chatSessions,
      sourceSessions,
      hydratedSessions,
    ),
  };
}

function mergeHydratedAssistantItems<
  T extends { id: string; dataUrl?: string; storageKey?: string },
>(currentItems: T[], sourceItems: T[], hydratedItems: T[]) {
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const hydratedById = new Map(hydratedItems.map((item) => [item.id, item]));
  return currentItems.map((currentItem) => {
    const sourceItem = sourceById.get(currentItem.id);
    const hydratedItem = hydratedById.get(currentItem.id);
    if (
      !sourceItem ||
      !hydratedItem ||
      currentItem.storageKey !== sourceItem.storageKey ||
      currentItem.dataUrl !== sourceItem.dataUrl
    )
      return currentItem;
    return { ...currentItem, dataUrl: hydratedItem.dataUrl } as T;
  });
}

async function hydrateCanvasNode(node: CanvasNodeData, signal?: AbortSignal) {
  try {
    const content = node.metadata?.content || "";
    if (
      (node.type === CanvasNodeType.Video ||
        node.type === CanvasNodeType.Audio) &&
      node.metadata?.storageKey
    ) {
      const resolved = await withCanvasRestoreTimeout(
        resolveMediaUrl(node.metadata.storageKey, restoreFallbackUrl(content)),
        restoreFallbackUrl(content),
        CANVAS_RESTORE_ITEM_TIMEOUT_MS,
      );
      return {
        ...node,
        metadata: { ...node.metadata, content: resolved || content },
      };
    }
    if (node.type !== CanvasNodeType.Image) return node;
    const recovered = recoverInterruptedCanvasImageNode(node);
    if (
      !content &&
      !node.metadata?.backendUrl &&
      !node.metadata?.backendRel &&
      !node.metadata?.storageKey
    )
      return recovered;
    return await recoverCanvasImageNode(recovered, signal);
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    return markCanvasNodeRestoreError(
      node,
      "图片本地缓存和远程源均无法恢复，请重新上传。",
    );
  }
}

async function recoverCanvasImageNode(
  node: CanvasNodeData,
  signal?: AbortSignal,
) {
  const metadata = node.metadata || {};
  const hasActiveGeneration = hasActiveCanvasImageGeneration(metadata);
  if (metadata.storageKey) {
    const resolved = await withCanvasRestoreTimeout(
      resolveImageUrl(metadata.storageKey, ""),
      "",
      CANVAS_RESTORE_ITEM_TIMEOUT_MS,
    );
    if (resolved) {
      await setStoredImagesRetained([metadata.storageKey], true).catch(
        () => undefined,
      );
      const legacyPatch = recoveredLegacyImageMetadataPatch(metadata);
      return {
        ...node,
        metadata: {
          ...metadata,
          content: resolved,
          retained: true,
          ...(legacyPatch
            ? legacyPatch
            : hasActiveGeneration
            ? {}
            : {
                status: NODE_STATUS_SUCCESS,
                errorDetails: undefined,
              }),
        },
      };
    }
  }

  const backendRel = normalizeCanvasBackendRel(
    String(metadata.backendRel || "").trim().replace(/^\/+/, "") ||
      extractBackendImageRel(metadata.backendUrl || metadata.content || ""),
  );
  for (const source of canvasImageRecoverySources(metadata, backendRel)) {
    if (signal?.aborted) throw signal.reason;
    const uploaded = await uploadCanvasRecoverySource(source, signal);
    if (signal?.aborted) throw signal.reason;
    if (!uploaded) continue;
    const sourceBackendUrl = /^(?:https?:\/\/|\/images\/)/i.test(source)
      ? source
      : "";
    const legacyPatch = recoveredLegacyImageMetadataPatch(metadata);
    return {
      ...node,
      metadata: {
        ...metadata,
        ...imageMetadata(uploaded, {
          backendUrl: metadata.backendUrl || sourceBackendUrl,
          backendRel,
        }),
        ...(legacyPatch
          ? legacyPatch
          : hasActiveGeneration
          ? {
              status: metadata.status,
              errorDetails: metadata.errorDetails,
              sourceImageTaskId: metadata.sourceImageTaskId,
              imageGenerationAttemptId: metadata.imageGenerationAttemptId,
              imageGenerationTask: metadata.imageGenerationTask,
            }
          : {}),
        retained: true,
      },
    };
  }

  return markCanvasNodeRestoreError(
    node,
    "图片本地缓存和远程源均无法恢复，请重新上传。",
  );
}

function hasActiveCanvasImageGeneration(
  metadata: CanvasNodeMetadata | undefined,
) {
  return Boolean(
    metadata?.imageGenerationTask ||
      metadata?.sourceImageTaskId ||
      metadata?.imageGenerationAttemptId,
  );
}

function hasResumableCanvasImageTask(
  metadata: CanvasNodeMetadata | undefined,
) {
  return isResumableCanvasImageTask(metadata);
}

async function uploadCanvasRecoverySource(
  source: string,
  parentSignal?: AbortSignal,
): Promise<UploadedImage | null> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = window.setTimeout(
    () =>
      controller.abort(
        new DOMException("Canvas image restore timed out", "TimeoutError"),
      ),
    CANVAS_RECOVERY_SOURCE_TIMEOUT_MS,
  );
  try {
    return await uploadImage(source, {
      ...CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function normalizeCanvasBackendRel(value?: string) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("\\")) return "";
  const segments = raw.replace(/^\/+/, "").split("/");
  if (!segments.length || segments.some(isUnsafeCanvasPathSegment)) return "";
  return segments.join("/");
}

function isUnsafeCanvasPathSegment(segment: string) {
  if (!segment) return true;
  let decoded = segment;
  try {
    // Decode repeatedly so double-encoded dot segments and separators cannot
    // become route traversal only after the browser or upstream decodes again.
    for (let pass = 0; pass <= segment.length; pass += 1) {
      if (
        decoded === "." ||
        decoded === ".." ||
        decoded.includes("/") ||
        decoded.includes("\\")
      )
        return true;
      const next = decodeURIComponent(decoded);
      if (next === decoded) return false;
      decoded = next;
    }
    return true;
  } catch {
    return true;
  }
}

function canvasImageRecoverySources(
  metadata: CanvasNodeMetadata,
  backendRel?: string,
) {
  const relativeSource = backendRel
    ? `/images/${backendRel
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`
    : "";
  return Array.from(
    new Set(
      [relativeSource, metadata.backendUrl, metadata.content]
        .map((value) => normalizeCanvasBackendImageSource(String(value || "")))
        .filter((value) => Boolean(value) && !value.startsWith("blob:")),
    ),
  );
}
function markCanvasNodeRestoreError(
  node: CanvasNodeData,
  errorDetails: string,
): CanvasNodeData {
  if (node.type !== CanvasNodeType.Image) return node;
  return {
    ...node,
    metadata: {
      ...node.metadata,
      content: "",
      status: NODE_STATUS_ERROR,
      errorDetails,
    },
  };
}

type Seedance2AspectRatioSources = {
  upstreamNaturalRatio?: string | null;
  currentShotRatio?: string | null;
};

function findMissingSeedance2RequiredReferences(
  placeholder: CanvasNodeData,
  references: Seedance2CustomerVideoReference[],
) {
  const requiredReferences = Array.isArray(
    placeholder.metadata?.seedanceRequiredReferences,
  )
    ? placeholder.metadata.seedanceRequiredReferences
    : [];
  const availableLabels = new Set(
    references
      .filter((reference) => Boolean(String(reference.value || "").trim()))
      .map((reference) => reference.label),
  );
  return requiredReferences.filter((label) => !availableLabels.has(label));
}

function buildSeedance2AspectRatioSources(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const map = new Map<string, Seedance2AspectRatioSources>();
  const incomingConnectionsByToNodeId = new Map<string, CanvasConnection[]>();
  connections.forEach((connection) => {
    const incoming = incomingConnectionsByToNodeId.get(connection.toNodeId) || [];
    incoming.push(connection);
    incomingConnectionsByToNodeId.set(connection.toNodeId, incoming);
  });
  nodes.forEach((node) => {
    if (node.type !== CanvasNodeType.Video || node.metadata?.seedanceWorkflowRole !== "placeholder") return;
    let upstreamNaturalRatio: string | null = null;
    let currentShotRatio: string | null = null;
    collectUpstreamImageNodes(node.id, nodeById, incomingConnectionsByToNodeId).forEach((source) => {
      const width = Number(source.metadata?.naturalWidth || source.width);
      const height = Number(source.metadata?.naturalHeight || source.height);
      const ratio = seedance2SourceRatioFromNaturalSize(width, height);
      if (!ratio) return;
      if (isCurrentShotImage(source, node)) {
        currentShotRatio ||= ratio;
        return;
      }
      upstreamNaturalRatio ||= ratio;
    });
    if (!upstreamNaturalRatio && !currentShotRatio) return;
    map.set(node.id, { upstreamNaturalRatio, currentShotRatio });
  });
  return map;
}

function collectUpstreamImageNodes(nodeId: string, nodeById: Map<string, CanvasNodeData>, incomingConnectionsByToNodeId: Map<string, CanvasConnection[]>) {
  const visited = new Set<string>([nodeId]);
  const images: CanvasNodeData[] = [];
  const queue = (incomingConnectionsByToNodeId.get(nodeId) || []).map((connection) => connection.fromNodeId);
  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    const current = nodeById.get(currentId);
    if (current?.type === CanvasNodeType.Image && seedance2CanOccupyReferenceSlot(current)) images.push(current);
    (incomingConnectionsByToNodeId.get(currentId) || []).forEach((connection) => {
      if (!visited.has(connection.fromNodeId)) queue.push(connection.fromNodeId);
    });
  }
  return images;
}

function isCurrentShotImage(source: CanvasNodeData | undefined, placeholder: CanvasNodeData) {
  if (!source) return false;
  const shot = String(placeholder.metadata?.seedanceShotIndex || "");
  const text = `${source.title || ""}
${source.metadata?.storyLabel || ""}`.toLowerCase();
  return text.includes("当前分镜") || (Boolean(shot) && (text.includes(`第${shot}镜`) || text.includes(`镜头${shot}`)));
}

function withCanvasRestoreTimeout<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs = CANVAS_RESTORE_TIMEOUT_MS,
) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) =>
      window.setTimeout(() => resolve(fallback), timeoutMs),
    ),
  ]);
}

function restoreFallbackUrl(content: string) {
  if (!content || content.startsWith("blob:")) return "";
  return normalizeCanvasImageUrl(content);
}

function seedance2FaceEditFallbackSource(metadata: CanvasNodeMetadata | undefined) {
  const content = String(metadata?.content || "").trim();
  if (isLocalCanvasImageSource(content)) return content;

  const normalizedContent = normalizeCanvasBackendImageSource(content);
  const normalizedBackendUrl = normalizeCanvasBackendImageSource(metadata?.backendUrl || "");
  const backendRel = normalizeCanvasBackendRel(metadata?.backendRel);
  return normalizedContent || normalizedBackendUrl || (backendRel ? `/images/${backendRel}` : "");
}

function isLocalCanvasImageSource(value: string) {
  return /^(data:image\/|blob:)/i.test(String(value || "").trim());
}

function normalizeCanvasBackendImageSource(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isLocalCanvasImageSource(raw)) return raw;
  const relative = /^images\//i.test(raw)
    ? `/${raw}`
    : raw.match(/\/images\/.*$/i)?.[0] || "";
  if (relative) {
    const path = relative.split(/[?#]/, 1)[0];
    if (
      path.includes("\\") ||
      path
        .replace(/^\/images\//i, "")
        .split("/")
        .some(isUnsafeCanvasPathSegment)
    )
      return "";
    return relative;
  }
  return normalizeCanvasImageUrl(raw);
}

function normalizeCanvasImageUrl(url: string) {
  if (
    typeof window === "undefined" ||
    window.location.protocol !== "https:" ||
    !url.startsWith("http://")
  )
    return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === window.location.hostname) {
      parsed.protocol = "https:";
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function fitViewportToNodes(
  nodes: CanvasNodeData[],
  width: number,
  height: number,
): ViewportTransform | null {
  if (!nodes.length || width < 40 || height < 40) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + Math.max(node.width || 0, 80));
    maxY = Math.max(maxY, node.position.y + Math.max(node.height || 0, 80));
  }
  const pad = 72;
  const worldW = Math.max(maxX - minX, 1) + pad * 2;
  const worldH = Math.max(maxY - minY, 1) + pad * 2;
  const k = Math.min(Math.max(Math.min(width / worldW, height / worldH), 0.2), 1);
  return {
    x: (width - worldW * k) / 2 - (minX - pad) * k,
    y: (height - worldH * k) / 2 - (minY - pad) * k,
    k,
  };
}

function sanitizeCanvasNodes(nodes: CanvasNodeData[] | undefined) {
  if (!Array.isArray(nodes)) return [];
  return compactBulkSeedance2PlaceholderPanels(removeLegacySeedance2TextNodes(
    nodes
      .filter((node): node is CanvasNodeData =>
        Boolean(
          node && typeof node.id === "string" && typeof node.type === "string",
        ),
      )
      .map((node) => {
        const spec = getNodeSpec(node.type);
        const width = readFiniteNumber(node.width, spec.width);
        const height = readFiniteNumber(node.height, spec.height);
        const position = {
          x: readFiniteNumber(node.position?.x, 0),
          y: readFiniteNumber(node.position?.y, 0),
        };
        return normalizeEmptyVideoNodeToSeedance2Placeholder(normalizeStoryDirectorNode({
          ...node,
          title:
            typeof node.title === "string" && node.title.trim()
              ? node.title
              : spec.title,
          position,
          width,
          height,
          metadata:
            node.metadata && typeof node.metadata === "object"
              ? node.metadata
              : {},
        }));
      }),
  ));
}

function normalizeStoryDirectorNode(node: CanvasNodeData): CanvasNodeData {
  if (node.type !== CanvasNodeType.StoryDirector) return node;
  const metadata = node.metadata && typeof node.metadata === "object" ? node.metadata : {};
  const shots = Array.isArray(metadata.storyShots) ? metadata.storyShots : [];
  const characters = Array.isArray(metadata.storyCharacters) ? metadata.storyCharacters : [];
  const scenes = Array.isArray(metadata.storyScenes) ? metadata.storyScenes : [];
  return {
    ...node,
    metadata: {
      ...metadata,
      storyShots: shots.map((shot, index) => ({
        id: shot?.id || `shot-${index + 1}`,
        index: typeof shot?.index === "number" ? shot.index : index + 1,
        title: shot?.title || `镜头 ${index + 1}`,
        sceneId: shot?.sceneId,
        appearingCharacterIds: Array.isArray(shot?.appearingCharacterIds) ? shot.appearingCharacterIds : [],
        excludedCharacterIds: Array.isArray(shot?.excludedCharacterIds) ? shot.excludedCharacterIds : [],
        action: shot?.action || "",
        camera: shot?.camera || "",
        emotion: shot?.emotion,
        continuityNote: shot?.continuityNote,
        characterState: shot?.characterState,
        visualContent: shot?.visualContent,
        voiceover: shot?.voiceover,
        imagePrompt: shot?.imagePrompt || "",
        finalPrompt: shot?.finalPrompt,
        resultNodeIds: Array.isArray(shot?.resultNodeIds) ? shot.resultNodeIds : [],
        status: shot?.status || "pending",
        errorDetails: shot?.errorDetails,
      })),
      storyCharacters: characters.map((character, index) => ({
        id: character?.id || `char-${index + 1}`,
        name: character?.name || `角色 ${index + 1}`,
        aliases: character?.aliases,
        roleType: character?.roleType || "protagonist",
        importance: character?.importance || "main",
        appearance: character?.appearance || "",
        personality: character?.personality,
        relationshipSummary: character?.relationshipSummary,
        visualPrompt: character?.visualPrompt || "",
        negativePrompt: character?.negativePrompt,
        referenceNodeId: character?.referenceNodeId,
        referenceImageUrl: character?.referenceImageUrl,
        assetSource: character?.assetSource,
        assetLocked: character?.assetLocked,
        status: character?.status || "draft",
        errorDetails: character?.errorDetails,
      })),
      storyScenes: scenes.map((scene, index) => ({
        id: scene?.id || `scene-${index + 1}`,
        name: scene?.name || `场景 ${index + 1}`,
        description: scene?.description || "",
        mood: scene?.mood,
        visualStyle: scene?.visualStyle,
        referenceNodeId: scene?.referenceNodeId,
        referenceImageUrl: scene?.referenceImageUrl,
      })),
    },
  };
}

function normalizeEmptyVideoNodeToSeedance2Placeholder(
  node: CanvasNodeData,
): CanvasNodeData {
  if (node.type !== CanvasNodeType.Video || node.metadata?.content) return node;
  const sourceMetadata = node.metadata || {};
  const isExistingSeedance2Placeholder = sourceMetadata.seedanceWorkflowRole === "placeholder";
  const seedanceLegacyMetadataKeys = [
    "seedanceRatio",
    "seedanceWorkflowNodeId",
    "seedanceModel",
    "seedanceStoryShotId",
    "seedancePromptPanelMode",
    "seedanceReferenceOrder",
    "seedanceReferenceSlotBindings",
    "seedanceReferenceExtraSlotBindings",
    "seedanceShotIndex",
    "seedanceStoryShotIndex",
    "seedanceWorkflowMode",
    "seedanceRequiredReferences",
  ] as const;
  const hasSeedanceLegacyMetadata = seedanceLegacyMetadataKeys.some((key) =>
    Object.prototype.hasOwnProperty.call(sourceMetadata, key),
  );
  if (!isExistingSeedance2Placeholder && !hasSeedanceLegacyMetadata) return node;
  const ratio = normalizeSeedance2CreationAspectRatio(
    node.metadata?.seedanceRatio || node.metadata?.size || "9:16",
  );
  const metadata: CanvasNodeMetadata = {
    ...createSeedance2VideoPlaceholderMetadata({
      ratio,
      duration:
        node.metadata?.seedanceDuration || node.metadata?.seconds || "5",
      prompt: node.metadata?.prompt || "描述当前镜头的视频内容。",
      inheritSourceRatio: node.metadata?.seedanceInheritSourceRatio ?? true,
      ratioTouched: node.metadata?.seedanceRatioTouched ?? false,
    }),
    ...node.metadata,
    content: "",
    generationMode: "video",
    seedanceWorkflowRole: "placeholder",
    seedanceRatio: ratio,
    size: ratio,
  };
  const size = seedance2PlaceholderSize(ratio);
  return {
    ...node,
    title:
      node.title && node.title !== "Video"
        ? node.title
        : "分镜视频占位框",
    width: isExistingSeedance2Placeholder ? Math.max(size.width, node.width) : size.width,
    height: isExistingSeedance2Placeholder ? Math.max(size.height, node.height) : size.height,
    metadata,
  };
}

function sanitizeCanvasConnections(
  connections: CanvasConnection[] | undefined,
  nodes: CanvasNodeData[],
) {
  if (!Array.isArray(connections)) return [];
  const ids = new Set(nodes.map((node) => node.id));
  return connections.filter((connection): connection is CanvasConnection =>
    Boolean(
      connection &&
      ids.has(connection.fromNodeId) &&
      ids.has(connection.toNodeId),
    ),
  );
}

function readFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function shouldRouteConnectionToFloatingPanel(node: CanvasNodeData | undefined, dialogNodeId: string | null) {
  if (!node || dialogNodeId !== node.id) return false;
  if (node.type === CanvasNodeType.StoryDirector) return false;
  if (node.type === CanvasNodeType.Seedance2Workflow) return false;
  if (node.type === CanvasNodeType.Video && node.metadata?.seedanceWorkflowRole === "placeholder") return false;
  if (node.type === CanvasNodeType.Video && node.metadata?.content) return false;
  return true;
}

function shouldRenderCanvasConnection(
  _connection: CanvasConnection,
  from: CanvasNodeData | undefined,
  to: CanvasNodeData | undefined,
  nodes: CanvasNodeData[],
) {
  if (!from || !to) return false;
  if (isHiddenBatchConnectionEndpoint(from, nodes) || isHiddenBatchConnectionEndpoint(to, nodes)) return false;
  if (isSeedance2WorkflowControlConnection(from, to)) return false;
  if (isSeedance2IdleEmptyReferenceConnection(from, to)) return false;
  return true;
}

function isSeedance2WorkflowControlConnection(
  from: CanvasNodeData,
  to: CanvasNodeData,
) {
  return (
    from.type === CanvasNodeType.Seedance2Workflow &&
    to.type === CanvasNodeType.Video &&
    to.metadata?.seedanceWorkflowRole === "placeholder" &&
    to.metadata?.seedanceWorkflowNodeId === from.id
  );
}

function isSeedance2IdleEmptyReferenceConnection(
  from: CanvasNodeData,
  to: CanvasNodeData,
) {
  return (
    from.type === CanvasNodeType.Image &&
    to.type === CanvasNodeType.Video &&
    to.metadata?.seedanceWorkflowRole === "placeholder" &&
    !seedance2CanOccupyReferenceSlot(from)
  );
}

function normalizeConfigNodeSize(nodes: CanvasNodeData[]) {
  const configSpec = NODE_DEFAULT_SIZE[CanvasNodeType.Config];
  const storySpec = NODE_DEFAULT_SIZE[CanvasNodeType.StoryDirector];
  const seedance2Spec = NODE_DEFAULT_SIZE[CanvasNodeType.Seedance2Workflow];
  return nodes.map((node) => {
    if (node.type === CanvasNodeType.StoryDirector) {
      return {
        ...node,
        width: Math.max(node.width, storySpec.width),
        height: Math.max(node.height, storySpec.height),
      };
    }
    if (node.type === CanvasNodeType.Seedance2Workflow) {
      if ((node.width === 720 && node.height === 780) || (node.width === 960 && node.height === 640))
        return { ...node, width: seedance2Spec.width, height: seedance2Spec.height };
      return node;
    }
    if (node.type === CanvasNodeType.Video && node.metadata?.seedanceWorkflowRole === "placeholder" && !node.metadata?.content) {
      const placeholderRatio = normalizeSeedance2CreationAspectRatio(
        node.metadata?.seedanceRatio || node.metadata?.size || SEEDANCE2_CREATION_FALLBACK_RATIO,
      );
      const placeholderSpec = seedance2PlaceholderSize(placeholderRatio);
      if (node.width >= placeholderSpec.width && node.height >= placeholderSpec.height) return node;
      return {
        ...node,
        width: Math.max(placeholderSpec.width, node.width),
        height: Math.max(placeholderSpec.height, node.height),
      };
    }
    if (node.type !== CanvasNodeType.Config) return node;
    if (node.width >= configSpec.width && node.height >= configSpec.height)
      return node;
    return {
      ...node,
      width: Math.max(node.width, configSpec.width),
      height: Math.max(node.height, configSpec.height),
    };
  });
}

async function hydrateAssistantImages(
  sessions: CanvasAssistantSession[],
  signal?: AbortSignal,
) {
  const hydrateItem = async <
    T extends { dataUrl?: string; storageKey?: string },
  >(
    item: T,
  ) => {
    try {
      if (signal?.aborted) throw signal.reason;
      if (item.storageKey)
        return {
          ...item,
          dataUrl: await withCanvasRestoreTimeout(
            resolveImageUrl(
              item.storageKey,
              restoreFallbackUrl(item.dataUrl || ""),
            ),
            restoreFallbackUrl(item.dataUrl || ""),
            CANVAS_RESTORE_ITEM_TIMEOUT_MS,
          ),
        };
      if (item.dataUrl?.startsWith("data:image/")) return item;
    } catch {
      return { ...item, dataUrl: "" };
    }
    return item;
  };
  return Promise.all(
    sessions.map(async (session) => ({
      ...session,
      messages: await Promise.all(
        session.messages.map(async (message) => ({
          ...message,
          references: await Promise.all(
            (message.references || []).map(hydrateItem),
          ),
          images: await Promise.all((message.images || []).map(hydrateItem)),
        })),
      ),
    })),
  );
}

function getGenerationCount(count: string) {
  return parseCanvasGenerationCount(count);
}

function formatVideoFrameTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minute = Math.floor(total / 60);
  const second = total % 60;
  return `${minute}:${String(second).padStart(2, "0")}`;
}

function nextImageSequenceNumber(nodes: CanvasNodeData[]) {
  return (
    nodes.reduce((max, node) => {
      if (node.type !== CanvasNodeType.Image) return max;
      return Math.max(max, Number(node.metadata?.imageSequenceNumber) || 0);
    }, 0) + 1
  );
}

function withImageSequenceNumbers(nodes: CanvasNodeData[]) {
  let next = nextImageSequenceNumber(nodes);
  let changed = false;
  const result = nodes.map((node) => {
    if (
      node.type !== CanvasNodeType.Image ||
      node.metadata?.imageSequenceNumber
    )
      return node;
    changed = true;
    return {
      ...node,
      metadata: { ...node.metadata, imageSequenceNumber: next++ },
    };
  });
  return changed ? result : nodes;
}

function applyNodeConfigPatch(
  node: CanvasNodeData,
  patch: Partial<CanvasNodeData["metadata"]>,
) {
  const safePatch = patch || {};
  const next = { ...node, metadata: { ...node.metadata, ...safePatch } };
  const spec =
    node.type === CanvasNodeType.Video
      ? NODE_DEFAULT_SIZE[CanvasNodeType.Video]
      : NODE_DEFAULT_SIZE[CanvasNodeType.Image];
  const size =
    typeof safePatch.size === "string" && !node.metadata?.content
      ? nodeSizeFromRatio(safePatch.size, spec.width, spec.height)
      : null;
  return size &&
    (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video)
    ? {
        ...next,
        ...size,
        position: {
          x: node.position.x + node.width / 2 - size.width / 2,
          y: node.position.y + node.height / 2 - size.height / 2,
        },
      }
    : next;
}

const SEEDANCE_WORKFLOW_SNAPSHOT_FIELDS = [
  "model",
  "seedanceModel",
  "modelProviderId",
  "videoGenerationSettings",
  "videoGenerationScope",
  "videoGenerationCapabilityId",
  "videoWireFormat",
  "videoGenerationOperationMigration",
] as const;

function synchronizeSeedanceWorkflowPlaceholderSnapshots(
  nodes: CanvasNodeData[],
  workflowNode: CanvasNodeData,
) {
  const workflowMetadata = workflowNode.metadata || {};
  const workflowModel = String(
    workflowMetadata.seedanceModel || workflowMetadata.model || "",
  ).trim();
  const workflowProviderId = String(workflowMetadata.modelProviderId || "").trim();
  if (!workflowModel || !workflowProviderId) return nodes;
  return nodes.map((node) => {
    const taskState = node.metadata?.seedanceGenerationTaskState;
    if (
      node.type !== CanvasNodeType.Video ||
      node.metadata?.seedanceWorkflowRole !== "placeholder" ||
      node.metadata?.seedanceWorkflowNodeId !== workflowNode.id ||
      node.metadata?.content ||
      node.metadata?.status && node.metadata.status !== "idle" ||
      node.metadata?.videoGenerationTask ||
      node.metadata?.videoGenerationAttempt ||
      node.metadata?.seedanceTaskId ||
      taskState?.taskId ||
      taskState?.startedAt ||
      taskState?.attemptId ||
      taskState?.status !== undefined && taskState.status !== "idle"
    ) {
      return node;
    }
    return {
      ...node,
      metadata: {
        ...node.metadata,
        model: workflowMetadata.model || workflowMetadata.seedanceModel,
        seedanceModel: workflowMetadata.seedanceModel || workflowMetadata.model,
        modelProviderId: workflowMetadata.modelProviderId,
        videoGenerationSettings: workflowMetadata.videoGenerationSettings,
        videoGenerationScope: workflowMetadata.videoGenerationScope,
        videoGenerationCapabilityId: workflowMetadata.videoGenerationCapabilityId,
        videoWireFormat: workflowMetadata.videoWireFormat,
        videoGenerationOperationMigration: workflowMetadata.videoGenerationOperationMigration,
      },
    };
  });
}

function synchronizeSeedanceWorkflowPlaceholderSnapshotsOnLoad(
  nodes: CanvasNodeData[],
) {
  return nodes
    .filter((node) => node.type === CanvasNodeType.Seedance2Workflow)
    .reduce(
      (currentNodes, workflowNode) =>
        synchronizeSeedanceWorkflowPlaceholderSnapshots(
          currentNodes,
          workflowNode,
        ),
      nodes,
    );
}

function getConnectionTargetAnchor(
  node: CanvasNodeData,
  current: ConnectionHandle,
  pointerX?: number,
  pointerY?: number,
): Position & { handleId?: string } {
  if (
    current.handleType === "source" &&
    node.type === CanvasNodeType.StoryDirector
  ) {
    const handle = nearestStoryDirectorInputHandle(node, pointerX, pointerY);
    return {
      x:
        node.position.x +
        node.width * storyDirectorHandleLeftRatio(handle.index),
      y:
        node.position.y +
        node.height * storyDirectorHandleTopRatio(handle.index),
      handleId: handle.id,
    };
  }

  return {
    x:
      current.handleType === "source"
        ? node.position.x
        : node.position.x + node.width,
    y: node.position.y + node.height / 2,
  };
}

function normalizeConnection(
  firstNodeId: string,
  secondNodeId: string,
  nodes: CanvasNodeData[],
  firstHandleType: "source" | "target",
  firstHandleId?: string,
  secondHandleId?: string,
): Omit<CanvasConnection, "id"> | null {
  const first = nodes.find((node) => node.id === firstNodeId);
  const second = nodes.find((node) => node.id === secondNodeId);
  if (!first || !second || first.id === second.id) return null;
  if (
    first.type === CanvasNodeType.Config &&
    second.type === CanvasNodeType.Config
  )
    return null;
  const raw =
    firstHandleType === "source"
      ? {
          fromNodeId: first.id,
          toNodeId: second.id,
          fromHandleId: firstHandleId,
          toHandleId: secondHandleId,
        }
      : {
          fromNodeId: second.id,
          toNodeId: first.id,
          fromHandleId: secondHandleId,
          toHandleId: firstHandleId,
        };

  if (second.type === CanvasNodeType.Config)
    return {
      fromNodeId: first.id,
      toNodeId: second.id,
      fromHandleId: firstHandleId,
      toHandleId: secondHandleId,
    };
  if (first.type === CanvasNodeType.Config && firstHandleType === "target")
    return raw;
  if (first.type === CanvasNodeType.Config)
    return {
      fromNodeId: first.id,
      toNodeId: second.id,
      fromHandleId: firstHandleId,
      toHandleId: secondHandleId,
    };
  return raw;
}

function nearestStoryDirectorInputHandle(
  node: CanvasNodeData,
  pointerX?: number,
  pointerY?: number,
) {
  const leftRatios = [0, 0, 0, 0];
  const topRatios = [0.46, 0.55, 0.64, 0.73];
  const index =
    typeof pointerX === "number" && typeof pointerY === "number"
      ? leftRatios.reduce((best, leftRatio, nextIndex) => {
          const dx = pointerX - (node.position.x + node.width * leftRatio);
          const dy =
            pointerY - (node.position.y + node.height * topRatios[nextIndex]);
          const bestDx =
            pointerX - (node.position.x + node.width * leftRatios[best]);
          const bestDy =
            pointerY - (node.position.y + node.height * topRatios[best]);
          return dx * dx + dy * dy < bestDx * bestDx + bestDy * bestDy
            ? nextIndex
            : best;
        }, 0)
      : 0;
  return { ...STORY_DIRECTOR_INPUT_HANDLES[index], index };
}

function storyDirectorHandleTopRatio(index: number) {
  return [0.46, 0.55, 0.64, 0.73][index] || 0.55;
}

function storyDirectorHandleLeftRatio(index: number) {
  return [0, 0, 0, 0][index] || 0;
}

function isStoryDirectorConnection(
  connection: CanvasConnection,
  nodes: CanvasNodeData[],
) {
  const from = nodes.find((node) => node.id === connection.fromNodeId);
  const to = nodes.find((node) => node.id === connection.toNodeId);
  return (
    from?.type === CanvasNodeType.StoryDirector ||
    to?.type === CanvasNodeType.StoryDirector ||
    Boolean(
      connection.fromHandleId?.startsWith("story:") ||
      connection.toHandleId?.startsWith("story:"),
    )
  );
}

function hasStoryDirectorAncestor(
  nodeId: string,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const queue = connections
    .filter((connection) => connection.toNodeId === nodeId)
    .map((connection) => connection.fromNodeId);
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeById.get(id);
    if (node?.type === CanvasNodeType.StoryDirector) return true;
    connections
      .filter((connection) => connection.toNodeId === id)
      .forEach((connection) => queue.push(connection.fromNodeId));
  }
  return false;
}

function hasDirectStoryDirectorSource(
  nodeId: string,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return connections.some(
    (connection) =>
      connection.toNodeId === nodeId &&
      nodeById.get(connection.fromNodeId)?.type ===
        CanvasNodeType.StoryDirector,
  );
}

function isStoryDirectorGeneratedImage(
  node: CanvasNodeData | undefined,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  return Boolean(
    node?.type === CanvasNodeType.Image &&
    (node.metadata?.storyLabel || node.metadata?.storyGrid9GroupIndex),
  );
}

function shouldUseStoryDirectorGenerationRules(
  node: CanvasNodeData | undefined,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  if (!node) return false;
  if (node.type !== CanvasNodeType.StoryDirector) {
    return Boolean(node.metadata?.storyWorkflow);
  }
  const hasIncomingStoryConnection = connections.some(
    (connection) =>
      connection.toNodeId === node.id &&
      isStoryDirectorConnection(connection, nodes),
  );
  return (
    node.type === CanvasNodeType.StoryDirector ||
    Boolean(node.metadata?.storyWorkflow) ||
    isStoryDirectorGeneratedImage(node, nodes, connections) ||
    hasIncomingStoryConnection
  );
}

function getInputSummary(inputs: NodeGenerationInput[]) {
  const imageInputs = inputs.filter((input) => input.image);
  const videoInputs = inputs.filter((input) => input.video);
  return {
    textCount: inputs.filter((input) => input.type === "text").length,
    imageCount: inputs.filter((input) => input.type === "image").length,
    videoCount: inputs.filter((input) => input.type === "video").length,
    videoFirstClipCount: inputs.filter((input) => input.video?.useAs === "first_clip").length,
    audioCount: inputs.filter((input) => input.type === "audio").length,
    imageReferences: imageInputs.flatMap((input) => input.image ? [input.image] : []),
    videoReferences: videoInputs.flatMap((input) => input.video ? [input.video] : []),
    referenceErrors: inputs.flatMap((input) => input.inputError ? [input.inputError] : []),
  };
}

function buildStoryDevelopmentText(
  analysis: StoryAnalysisResult,
  node: CanvasNodeData,
  originalStoryText: string,
) {
  const textValue = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("，");
    return "";
  };
  const shots = [...(analysis.shots || [])].sort(
    (left, right) => left.index - right.index,
  );
  const importantCharacters = (analysis.characters || []).filter(
    (character) =>
      character.importance === "main" || character.importance === "supporting",
  );
  const characterById = new Map(
    (analysis.characters || []).map((character) => [character.id, character]),
  );
  const characterNames = importantCharacters
    .map((character) => character.name)
    .filter(Boolean);
  const firstShot = shots[0];
  const lastShot = shots[shots.length - 1];
  const shotChain =
    shots.map((shot) => `第${shot.index}镜《${shot.title}》`).join(" -> ") ||
    "未形成镜头链";
  const style = textValue(node.metadata?.storyStyle) || "电影感写实";
  const aspectRatio = textValue(node.metadata?.storyAspectRatio) || "16:9";
  const originalLine = originalStoryText.trim()
    ? `原始故事输入：${originalStoryText.trim()}`
    : "原始故事输入：未填写";

  const roleBlocks = importantCharacters.length
    ? importantCharacters
        .map((character) => {
          const relatedShots = shots.filter((shot) =>
            (shot.appearingCharacterIds || []).includes(character.id),
          );
          const firstRelated = relatedShots[0];
          const middleRelated =
            relatedShots[Math.floor((relatedShots.length - 1) / 2)] ||
            firstRelated;
          const lastRelated = relatedShots[relatedShots.length - 1] || firstRelated;
          return `${character.name}：
初始状态：${
            firstRelated
              ? `在第${firstRelated.index}镜进入剧情，目标围绕“${firstRelated.title}”展开。`
              : "在故事开端建立身份和目标。"
          }
中段变化：${
            middleRelated
              ? `在第${middleRelated.index}镜随“${middleRelated.title}”继续推进，行动压力逐步增加。`
              : "随主要冲突推进产生变化。"
          }
最终状态：${
            lastRelated
              ? `在第${lastRelated.index}镜停留在“${lastRelated.title}”后的剧情状态。`
              : "在结尾保留与主线冲突相关的结果。"
          }`;
        })
        .join("\n\n")
    : "暂无明确主角或重要配角，按镜头剧情推进理解角色状态。";

  const shotBlocks = shots.length
    ? shots
        .map((shot, index) => {
          const previous = shots[index - 1];
          const next = shots[index + 1];
          const names = (shot.appearingCharacterIds || [])
            .map((id) => characterById.get(id)?.name || id)
            .filter(Boolean);
          const intentSubject = names.length ? names.join("、") : "本镜关键角色";
          return `第${shot.index}镜：${shot.title}
剧情功能：${storyDevelopmentFunctionLabel(index, shots.length)}，推动“${shot.title}”这一剧情节点。
上一镜承接：${previous ? `承接第${previous.index}镜《${previous.title}》后的行动结果。` : "开场镜头，无上一镜"}
本镜发生的变化：${shot.action || shot.title}。
角色意图：${intentSubject}围绕当前冲突继续行动，目标随本镜剧情推进而变得更明确。
动作发展方向：${shot.action || shot.title}${shot.camera ? `；运动节奏参考“${shot.camera}”。` : "。"}
结尾落点：${shot.continuityNote || `本镜结束在“${shot.title}”后的新状态，为后续动作留下衔接点。`}
下一镜引出：${next ? `第${next.index}镜《${next.title}》` : "最终镜头，不再引出下一镜"}`;
        })
        .join("\n\n")
    : "暂无镜头剧情推进。";

  return `故事内容发展

【故事总线】
${originalLine}
整体风格：${style}
画面比例：${aspectRatio}
故事从什么状态开始：${firstShot ? `第${firstShot.index}镜《${firstShot.title}》，${firstShot.action || "建立开场冲突"}。` : "尚未生成开场镜头。"}
核心冲突：${characterNames.length ? `${characterNames.join("、")}之间围绕原始故事目标形成冲突。` : "围绕原始故事目标形成冲突。"}
剧情如何升级：${shotChain}
最终走向：${lastShot ? `第${lastShot.index}镜《${lastShot.title}》，${lastShot.action || "完成本轮剧情收束"}。` : "尚未生成结尾镜头。"}

【角色状态发展】
${roleBlocks}

【镜头剧情推进】
${shotBlocks}`;
}

function storyDevelopmentFunctionLabel(index: number, total: number) {
  if (total <= 1) return "完整剧情节点";
  if (index === 0) return "开场建立冲突";
  if (index === total - 1) return "结尾收束结果";
  if (index === Math.floor(total / 2)) return "中段转折升级";
  return "过程推进";
}

function draftStoryDirectorAnalysis(
  idea: string,
  style: string,
  shotCount: number,
): StoryAnalysisResult {
  const plan = draftPlan(idea, style, shotCount);
  return parseStoryAnalysis(
    JSON.stringify({
      characters: plan.cast.map((person) => ({
        id: person.id,
        name: person.name,
        importance: person.importance,
        appearance: person.appearance || person.look,
        visualPrompt: person.visualPrompt || person.look,
        personality: person.personality,
        negativePrompt: person.negativePrompt,
      })),
      scenes: plan.sceneBoard.map((scene) => ({
        id: scene.id,
        name: scene.name,
        description: scene.description,
        mood: scene.mood,
      })),
      shots: plan.shots.map((shot) => ({
        id: shot.id,
        index: shot.index,
        title: shot.title,
        sceneId: shot.sceneId,
        appearingCharacterIds: shot.appearingCharacterIds,
        excludedCharacterIds: shot.excludedCharacterIds,
        action: shot.action || shot.prompt,
        camera: shot.camera,
        emotion: shot.emotion,
        continuityNote: shot.continuityNote,
        visualContent: shot.visualContent || shot.prompt,
        imagePrompt: shot.imagePrompt || shot.prompt,
        prompt: shot.prompt,
      })),
    }),
  );
}

function listPendingSeedance2Placeholders(
  nodes: CanvasNodeData[],
  workflowNodeId: string,
) {
  return nodes
    .filter(
      (node) =>
        node.type === CanvasNodeType.Video &&
        node.metadata?.seedanceWorkflowRole === "placeholder" &&
        node.metadata?.seedanceWorkflowNodeId === workflowNodeId &&
        !String(node.metadata?.content || "").trim() &&
        !hasNonterminalVideoTask(node.metadata),
    )
    .sort(
      (left, right) =>
        Number(left.metadata?.seedanceStoryShotIndex || 0) -
        Number(right.metadata?.seedanceStoryShotIndex || 0),
    );
}

function reusableStoryDirectorAnalysis(
  node: CanvasNodeData,
): StoryAnalysisResult | null {
  const metadata = node.metadata;
  const raw = String(metadata?.storyAnalysisRaw || "").trim();
  const source = String(metadata?.storyAnalysisSourceText || "").trim();
  const storyText = storyDirectorEditableText(metadata);
  const requestedShotCount = metadata?.storyShotCount || 5;
  if (
    metadata?.storyAnalysisStatus !== NODE_STATUS_SUCCESS ||
    !raw ||
    !source ||
    metadata.storyAnalysisShotCount !== requestedShotCount ||
    !storyText ||
    source !== storyText ||
    detectTextApiResponseError(raw)
  ) {
    return null;
  }
  try {
    const analysis = parseStoryAnalysis(raw);
    return analysis.shots.length === requestedShotCount ? analysis : null;
  } catch {
    return null;
  }
}

function parseStoryAnalysis(raw: string): StoryAnalysisResult {
  const parsed = parseLooseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("故事分析没有返回可解析的 JSON");
  }
  const data = parsed as Record<string, unknown>;
  const rawCharacters = Array.isArray(data.characters) ? data.characters : [];
  const rawScenes = Array.isArray(data.scenes)
    ? data.scenes
    : Object.prototype.hasOwnProperty.call(data, "scenes")
      ? []
      : Array.isArray(data.scences)
        ? data.scences
        : [];
  const rawShots = Array.isArray(data.shots) ? data.shots : [];
  const characters = rawCharacters
    .map(normalizeStoryCharacter)
    .filter((item): item is StoryCharacter => Boolean(item));
  const scenes = rawScenes
    .map(normalizeStoryScene)
    .filter((item): item is StoryScene => Boolean(item));
  const shots = rawShots
    .map((item, index) => normalizeStoryShot(item, index, characters))
    .filter((item): item is StoryShot => Boolean(item));
  if (!characters.length && !shots.length)
    throw new Error("故事分析 JSON 缺少 characters 或 shots");
  return { characters, scenes, shots };
}

function videoNodeSizePatch(node: CanvasNodeData, video: UploadedFile): Pick<CanvasNodeData, "width" | "height" | "position"> {
  const size = fitNodeSize(video.width || node.width, video.height || node.height, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
  return {
    width: size.width,
    height: size.height,
    position: {
      x: node.position.x + node.width / 2 - size.width / 2,
      y: node.position.y + node.height / 2 - size.height / 2,
    },
  };
}

function parseLooseJson(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("故事分析没有返回内容");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first)
      return JSON.parse(candidate.slice(first, last + 1));
    throw new Error(`无法解析故事分析 JSON：${previewText(candidate)}`);
  }
}

function previewText(value: string, maxLength = 120) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "模型返回为空";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeStoryCharacter(value: unknown): StoryCharacter | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id =
    stringValue(item.id) || `char_${Math.random().toString(36).slice(2, 8)}`;
  const name = stringValue(item.name) || id;
  const importance = storyImportance(item.importance);
  const visualPrompt =
    stringValue(item.visualPrompt) || stringValue(item.appearance) || name;
  return {
    id,
    name,
    aliases: stringArray(item.aliases || item.alias),
    roleType: stringValue(item.roleType),
    importance,
    appearance: stringValue(item.appearance) || visualPrompt,
    personality: stringValue(item.personality),
    relationshipSummary: stringValue(
      item.relationshipSummary || item.relationship,
    ),
    visualPrompt,
    negativePrompt: stringValue(item.negativePrompt || item.avoid),
    status: "draft",
  };
}

function normalizeStoryScene(value: unknown): StoryScene | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id =
    stringValue(item.id) || `scene_${Math.random().toString(36).slice(2, 8)}`;
  const name = stringValue(item.name) || id;
  return {
    id,
    name,
    description: stringValue(item.description) || name,
    mood: stringValue(item.mood),
    visualStyle: stringValue(item.visualStyle),
  };
}

function normalizeStoryShot(
  value: unknown,
  index: number,
  characters: StoryCharacter[],
): StoryShot | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = stringValue(item.id) || `shot_${index + 1}`;
  const title = stringValue(item.title) || `镜头 ${index + 1}`;
  const characterIds = new Set(characters.map((character) => character.id));
  const appearing = stringArray(
    item.appearingCharacterIds || item.appearingCharacters,
  ).filter((id: string) => !characterIds.size || characterIds.has(id));
  const excluded = stringArray(
    item.excludedCharacterIds || item.excludedCharacters,
  ).filter((id: string) => !characterIds.size || characterIds.has(id));
  const characterState = stringValue(
    item.characterState ||
      item.characterStatus ||
      item.personStatus ||
      item["人物状态"],
  );
  const camera = stringValue(
    item.camera ||
      item.framing ||
      item.shotSize ||
      item.viewSize ||
      item["景别"] ||
      item["镜头"] ||
      item["镜头语言"],
  );
  const visualContent = stringValue(
    item.visualContent ||
      item.screenContent ||
      item.frameContent ||
      item.pictureContent ||
      item["画面内容"],
  );
  return {
    id,
    index: Number(item.index) || index + 1,
    title,
    sceneId: stringValue(item.sceneId),
    appearingCharacterIds: appearing,
    excludedCharacterIds: excluded,
    action: stringValue(item.action) || title,
    camera: camera || "电影感中景",
    emotion: stringValue(item.emotion),
    continuityNote: stringValue(item.continuityNote),
    characterState,
    visualContent,
    imagePrompt:
      stringValue(item.imagePrompt) ||
      visualContent ||
      stringValue(item.prompt) ||
      title,
    resultNodeIds: [],
    status: "pending",
  };
}

function storyImportance(value: unknown): StoryCharacter["importance"] {
  return value === "main" ||
    value === "supporting" ||
    value === "minor" ||
    value === "background"
    ? value
    : "supporting";
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value))
    return value.map(stringValue).filter(Boolean).join("，");
  return "";
}

function stringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  const text = stringValue(value);
  return text
    ? text
        .split(/[,，、\s]+/)
        .map((item: string) => item.trim())
        .filter(Boolean)
    : [];
}

function updateStoryCharacterStatus(
  node: CanvasNodeData,
  characterId: string,
  patch: Partial<StoryCharacter>,
): CanvasNodeData {
  return {
    ...node,
    metadata: {
      ...node.metadata,
      storyCharacters: (node.metadata?.storyCharacters || []).map(
        (character) =>
          character.id === characterId ? { ...character, ...patch } : character,
      ),
    },
  };
}

function updateStoryShotStatus(
  node: CanvasNodeData,
  shotId: string,
  patch: Partial<StoryShot>,
): CanvasNodeData {
  return {
    ...node,
    metadata: {
      ...node.metadata,
      storyShots: (node.metadata?.storyShots || []).map((shot) =>
        shot.id === shotId ? { ...shot, ...patch } : shot,
      ),
    },
  };
}

function updateStoryShotsStatus(
  node: CanvasNodeData,
  shotIds: string[],
  patch: Partial<StoryShot>,
): CanvasNodeData {
  const targetIds = new Set(shotIds);
  return {
    ...node,
    metadata: {
      ...node.metadata,
      storyShots: (node.metadata?.storyShots || []).map((shot) =>
        targetIds.has(shot.id)
          ? {
              ...shot,
              ...patch,
              resultNodeIds: patch.resultNodeIds
                ? [
                    ...new Set([
                      ...(shot.resultNodeIds || []),
                      ...patch.resultNodeIds,
                    ]),
                  ]
                : patch.resultNodeIds === undefined
                  ? shot.resultNodeIds
                  : patch.resultNodeIds,
            }
          : shot,
      ),
    },
  };
}

function reconcileStoryDirectorImageResults(
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  let changed = false;
  const syncedNodes = syncStoryDirectorInputMetadata(nodes, connections);
  if (syncedNodes !== nodes) {
    nodes = syncedNodes;
    changed = true;
  }

  const storyOutputImages = storyDirectorOutputImages(nodes, connections);

  const storyCharacterInputImages = storyDirectorCharacterInputImages(
    nodes,
    connections,
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nextNodes = nodes.map((node) => {
    if (node.type !== CanvasNodeType.StoryDirector) return node;
    const shots = node.metadata?.storyShots || [];
    const characters = node.metadata?.storyCharacters || [];

    const latestOutputByIndex = new Map<
      number,
      | { kind: "active" }
      | { kind: "error"; errorDetails: string }
      | { kind: "done"; nodeId: string; prompt?: string }
    >();

    (storyOutputImages.get(node.id) || []).forEach((imageNode) => {
      const indexes = storyShotIndexesFromImageNode(imageNode);
      if (!indexes.length) return;
      const metadata = imageNode.metadata || {};
      if (
        metadata.status === NODE_STATUS_LOADING &&
        hasActiveCanvasImageGeneration(metadata)
      ) {
        indexes.forEach((index) =>
          latestOutputByIndex.set(index, { kind: "active" }),
        );
        return;
      }
      if (metadata.status === NODE_STATUS_ERROR) {
        indexes.forEach((index) =>
          latestOutputByIndex.set(index, {
            kind: "error",
            errorDetails: metadata.errorDetails || "分镜图生成失败",
          }),
        );
        return;
      }
      if (metadata.content) {
        indexes.forEach((index) =>
          latestOutputByIndex.set(index, {
            kind: "done",
            nodeId: imageNode.id,
            prompt: metadata.prompt,
          }),
        );
      }
    });

    let shotChanged = false;
    const nextShots = shots.map((shot) => {
      const output = latestOutputByIndex.get(shot.index);
      if (output?.kind === "active") {
        if (shot.status === "generating" && !shot.errorDetails) return shot;
        shotChanged = true;
        return {
          ...shot,
          status: "generating" as const,
          errorDetails: undefined,
        };
      }

      if (output?.kind === "done") {
        const resultNodeIds = [
          ...new Set([...(shot.resultNodeIds || []), output.nodeId]),
        ];
        const finalPrompt = output.prompt || shot.finalPrompt;
        const nextShot = {
          ...shot,
          status: "done" as const,
          resultNodeIds,
          finalPrompt,
          errorDetails: undefined,
        };
        if (
          shot.status !== nextShot.status ||
          shot.finalPrompt !== nextShot.finalPrompt ||
          shot.errorDetails !== nextShot.errorDetails ||
          !shot.resultNodeIds?.includes(output.nodeId)
        )
          shotChanged = true;
        return nextShot;
      }

      if (output?.kind === "error") {
        if (
          shot.status === "error" &&
          shot.errorDetails === output.errorDetails
        )
          return shot;
        shotChanged = true;
        return {
          ...shot,
          status: "error" as const,
          errorDetails: output.errorDetails,
        };
      }

      if (shot.status === "generating") {
        shotChanged = true;
        return { ...shot, status: "pending" as const, errorDetails: undefined };
      }

      return shot;
    });

    const inputImages = storyCharacterInputImages.get(node.id) || [];
    const usedCharacterImageIds = new Set<string>();
    const retryCharacters = characters.filter(
      (character) =>
        (character.importance === "main" ||
          character.importance === "supporting") &&
        (character.status === "generating" || character.status === "error"),
    );
    let characterChanged = false;
    const nextCharacters = characters.map((character) => {
      const unclaimedImages = inputImages.filter(
        (imageNode) => !usedCharacterImageIds.has(imageNode.id),
      );
      let imageNode = character.referenceNodeId
        ? unclaimedImages.find(
            (candidate) => candidate.id === character.referenceNodeId,
          )
        : undefined;
      if (!imageNode) {
        const orderedCandidateIds = [...unclaimedImages]
          .sort(
            (left, right) =>
              storyImageTaskPriority(left) - storyImageTaskPriority(right),
          )
          .map((candidate) => candidate.id);
        const matchId = findCharacterReferenceCandidate(
          character,
          orderedCandidateIds,
          nodeById,
        );
        imageNode = matchId ? nodeById.get(matchId) : undefined;
      }
      if (!imageNode && retryCharacters.length === 1) {
        const retryImages = unclaimedImages.filter(
          (candidate) =>
            isActiveStoryImageTask(candidate) ||
            candidate.metadata?.status === NODE_STATUS_ERROR,
        );
        if (
          retryCharacters[0].id === character.id &&
          retryImages.length === 1
        ) {
          imageNode = retryImages[0];
        }
      }
      if (!imageNode) return character;
      usedCharacterImageIds.add(imageNode.id);

      if (isActiveStoryImageTask(imageNode)) {
        if (character.status === "generating" && !character.errorDetails)
          return character;
        characterChanged = true;
        return {
          ...character,
          status: "generating" as const,
          errorDetails: undefined,
        };
      }

      if (imageNode.metadata?.status === NODE_STATUS_ERROR) {
        const errorDetails =
          imageNode.metadata.errorDetails || "角色图生成失败";
        if (
          character.status === "error" &&
          character.errorDetails === errorDetails
        )
          return character;
        characterChanged = true;
        return { ...character, status: "error" as const, errorDetails };
      }

      const referenceImageUrl =
        imageNode.metadata?.content ||
        imageNode.metadata?.backendUrl ||
        imageNode.metadata?.storageKey;
      if (!referenceImageUrl) return character;
      const readyStatus =
        character.assetSource === "generated"
          ? ("ready" as const)
          : ("locked" as const);
      if (
        character.referenceNodeId === imageNode.id &&
        character.referenceImageUrl === referenceImageUrl &&
        character.status === readyStatus &&
        !character.errorDetails
      )
        return character;
      characterChanged = true;
      return {
        ...character,
        referenceNodeId: imageNode.id,
        referenceImageUrl,
        assetSource: character.assetSource || ("upstream" as const),
        assetLocked: true,
        status: readyStatus,
        errorDetails: undefined,
      };
    });

    const hasGeneratingShot = nextShots.some(
      (shot) => shot.status === "generating",
    );
    const hasGeneratingCharacter = nextCharacters.some(
      (character) => character.status === "generating",
    );
    const hasActiveGeneration = hasGeneratingShot || hasGeneratingCharacter;
    const hasErrorShot = nextShots.some((shot) => shot.status === "error");
    const errorCharacter = nextCharacters.find(
      (character) => character.status === "error",
    );
    const hasGenerationError = hasErrorShot || Boolean(errorCharacter);
    const allShotsDone =
      shots.length > 0 && nextShots.every((shot) => shot.status === "done");
    const requiredCharacters = nextCharacters.filter(
      (character) =>
        character.importance === "main" || character.importance === "supporting",
    );
    const allRequiredCharactersReady =
      requiredCharacters.length > 0 &&
      requiredCharacters.every((character) => {
        if (character.status === "ready" || character.status === "locked")
          return true;
        return Boolean(
          character.referenceNodeId &&
            hasCanvasImageReference(nodeById.get(character.referenceNodeId)),
        );
      });
    const generationCompleted = allShotsDone || allRequiredCharactersReady;
    const analysisFailed =
      node.metadata?.storyAnalysisStatus === NODE_STATUS_ERROR;
    const analysisLoading =
      node.metadata?.storyAnalysisStatus === NODE_STATUS_LOADING;
    const shouldStartStoryRetry =
      hasActiveGeneration &&
      !analysisFailed &&
      !analysisLoading &&
      (node.metadata?.status !== NODE_STATUS_LOADING ||
        node.metadata?.storyGenerationStatus !== NODE_STATUS_LOADING ||
        Boolean(node.metadata?.errorDetails));
    const shouldClearStoryLoading =
      !hasActiveGeneration &&
      !analysisFailed &&
      !analysisLoading &&
      (node.metadata?.storyGenerationStatus === NODE_STATUS_LOADING ||
        node.metadata?.status === NODE_STATUS_LOADING);
    const shouldRecoverCompletedStory =
      generationCompleted &&
      !hasGenerationError &&
      !hasActiveGeneration &&
      !analysisFailed &&
      (node.metadata?.status === NODE_STATUS_ERROR ||
        node.metadata?.storyGenerationStatus === NODE_STATUS_ERROR ||
        Boolean(node.metadata?.errorDetails));
    const shouldSettleDetectedError =
      hasGenerationError &&
      !analysisFailed &&
      (shotChanged || characterChanged);
    const shouldSettleStoryGeneration =
      shouldClearStoryLoading ||
      shouldRecoverCompletedStory ||
      shouldSettleDetectedError;
    if (
      !shotChanged &&
      !characterChanged &&
      !shouldStartStoryRetry &&
      !shouldSettleStoryGeneration
    )
      return node;

    const generationErrorDetails =
      nextShots.find((shot) => shot.status === "error")?.errorDetails ||
      errorCharacter?.errorDetails ||
      node.metadata?.errorDetails;
    changed = true;
    return {
      ...node,
      metadata: {
        ...node.metadata,
        storyShots: nextShots,
        storyCharacters: nextCharacters,
        ...(shouldStartStoryRetry
          ? {
              status: NODE_STATUS_LOADING,
              storyGenerationStatus: NODE_STATUS_LOADING,
              errorDetails: undefined,
            }
          : shouldSettleStoryGeneration
            ? {
                status: hasGenerationError
                  ? NODE_STATUS_ERROR
                  : NODE_STATUS_SUCCESS,
                storyGenerationStatus: hasGenerationError
                  ? NODE_STATUS_ERROR
                  : generationCompleted
                    ? NODE_STATUS_SUCCESS
                    : ("idle" as const),
                errorDetails: hasGenerationError
                  ? generationErrorDetails
                  : undefined,
              }
            : null),
      },
    };
  });

  return changed ? nextNodes : nodes;
}

function isActiveStoryImageTask(node: CanvasNodeData) {
  return Boolean(
    node.metadata?.status === NODE_STATUS_LOADING &&
      hasActiveCanvasImageGeneration(node.metadata),
  );
}

function storyImageTaskPriority(node: CanvasNodeData) {
  if (isActiveStoryImageTask(node)) return 0;
  if (
    node.metadata?.content &&
    node.metadata?.status !== NODE_STATUS_ERROR &&
    node.metadata?.status !== NODE_STATUS_LOADING
  )
    return 1;
  if (node.metadata?.status === NODE_STATUS_ERROR) return 2;
  return 3;
}

function storyDirectorCharacterInputImages(
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const characterInputImages = new Map<string, CanvasNodeData[]>();
  connections.forEach((connection) => {
    const from = nodeById.get(connection.fromNodeId);
    const to = nodeById.get(connection.toNodeId);
    if (
      connection.toHandleId !== "story:character" ||
      from?.type !== CanvasNodeType.Image ||
      to?.type !== CanvasNodeType.StoryDirector
    )
      return;
    characterInputImages.set(to.id, [
      ...(characterInputImages.get(to.id) || []),
      from,
    ]);
  });
  return characterInputImages;
}

function storyDirectorOutputImages(
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const storyOutputImages = new Map<string, CanvasNodeData[]>();
  connections.forEach((connection) => {
    const from = nodeById.get(connection.fromNodeId);
    const to = nodeById.get(connection.toNodeId);
    if (
      from?.type !== CanvasNodeType.StoryDirector ||
      to?.type !== CanvasNodeType.Image
    )
      return;
    storyOutputImages.set(from.id, [
      ...(storyOutputImages.get(from.id) || []),
      to,
    ]);
  });
  return storyOutputImages;
}

function staleStoryDirectorErrorImageIds(
  storyOutputImages: Map<string, CanvasNodeData[]>,
) {
  const staleIds = new Set<string>();
  storyOutputImages.forEach((images) => {
    const successfulKeys = new Set<string>();
    images.forEach((imageNode) => {
      if (
        !imageNode.metadata?.content ||
        imageNode.metadata?.status === NODE_STATUS_ERROR ||
        imageNode.metadata?.status === NODE_STATUS_LOADING
      )
        return;
      const key = storyDirectorImageResultKey(imageNode);
      if (key) successfulKeys.add(key);
    });
    if (!successfulKeys.size) return;
    images.forEach((imageNode) => {
      if (imageNode.metadata?.status !== NODE_STATUS_ERROR) return;
      const key = storyDirectorImageResultKey(imageNode);
      if (key && successfulKeys.has(key)) {
        staleIds.add(imageNode.id);
      }
    });
  });
  return staleIds;
}

function storyDirectorImageResultKey(node: CanvasNodeData) {
  const shotIndexes = storyShotIndexesFromImageNode(node);
  if (shotIndexes.length) return `shot:${shotIndexes.join(",")}`;
  const label = String(node.metadata?.storyLabel || node.title || "").trim();
  return label ? `label:${label}` : "";
}

function storyShotIndexesFromImageNode(node: CanvasNodeData) {
  const metadata = node.metadata || {};
  const rangeStart = numberValue(metadata.storyGrid9ShotStart);
  const rangeEnd = numberValue(metadata.storyGrid9ShotEnd);
  if (rangeStart && rangeEnd && rangeEnd >= rangeStart) {
    return Array.from(
      { length: rangeEnd - rangeStart + 1 },
      (_, offset) => rangeStart + offset,
    );
  }
  const index =
    parseStoryShotIndex(metadata.storyLabel) || parseStoryShotIndex(node.title);
  return index ? [index] : [];
}

function parseStoryShotIndex(value: unknown) {
  const text = stringValue(value);
  if (!text) return 0;
  const match = text.match(/第\s*(\d+)\s*镜/) || text.match(/镜头\s*(\d+)/);
  return match ? Number(match[1]) || 0 : 0;
}

function numberValue(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function syncStoryDirectorInputMetadata(
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.type !== CanvasNodeType.StoryDirector) return node;
    const inputs = storyDirectorInputIds(node.id, nodes, connections);
    const storyCharacters = bindStoryCharactersFromInputs(
      node.metadata?.storyCharacters || [],
      inputs.character,
      nodeById,
    );
    const metadata = {
      ...node.metadata,
      storySourceImageNodeId: inputs.reference[0],
      storySourceImageNodeIds: inputs.reference,
      storyCharacterSourceImageNodeIds: inputs.character,
      storySceneSourceImageNodeIds: inputs.scene,
      storyPropSourceImageNodeIds: inputs.prop,
      storyCharacters,
    };
    if (
      node.metadata?.storySourceImageNodeId ===
        metadata.storySourceImageNodeId &&
      sameStringArray(
        node.metadata?.storySourceImageNodeIds,
        metadata.storySourceImageNodeIds,
      ) &&
      sameStringArray(
        node.metadata?.storyCharacterSourceImageNodeIds,
        metadata.storyCharacterSourceImageNodeIds,
      ) &&
      sameStringArray(
        node.metadata?.storySceneSourceImageNodeIds,
        metadata.storySceneSourceImageNodeIds,
      ) &&
      sameStringArray(
        node.metadata?.storyPropSourceImageNodeIds,
        metadata.storyPropSourceImageNodeIds,
      ) &&
      node.metadata?.storyCharacters === storyCharacters
    ) {
      return node;
    }
    changed = true;
    return { ...node, metadata };
  });
  return changed ? nextNodes : nodes;
}

function storyDirectorInputIds(
  nodeId: string,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const result: Record<StoryDirectorInputKind, string[]> = {
    reference: [],
    character: [],
    scene: [],
    prop: [],
  };
  connections
    .filter((connection) => connection.toNodeId === nodeId)
    .forEach((connection) => {
      const source = nodeById.get(connection.fromNodeId);
      if (source && source.type !== CanvasNodeType.Image) return;
      const kind = storyDirectorKindFromHandleId(connection.toHandleId);
      if (!result[kind].includes(connection.fromNodeId))
        result[kind].push(connection.fromNodeId);
    });
  return result;
}

function hasCanvasImageReference(
  node: CanvasNodeData | undefined | null,
): node is CanvasNodeData {
  return Boolean(
    node?.type === CanvasNodeType.Image &&
      (node.metadata?.content ||
        node.metadata?.storageKey ||
        node.metadata?.backendUrl),
  );
}

function storyDirectorKindFromHandleId(
  handleId?: string,
): StoryDirectorInputKind {
  return (
    STORY_DIRECTOR_INPUT_HANDLES.find((handle) => handle.id === handleId)
      ?.kind || "reference"
  );
}

function bindStoryCharactersFromInputs(
  characters: StoryCharacter[],
  characterNodeIds: string[],
  nodeById: Map<string, CanvasNodeData>,
) {
  if (!characters.length) return characters;
  const connectedIds = new Set(characterNodeIds);
  const usedIds = new Set<string>();
  let changed = false;
  const cleared = characters.map((character) => {
    if (character.referenceNodeId && character.assetSource === "upstream") {
      if (!connectedIds.has(character.referenceNodeId)) {
        changed = true;
        return {
          ...character,
          referenceNodeId: undefined,
          referenceImageUrl: undefined,
          assetSource: undefined,
          assetLocked: false,
          status: "draft" as const,
        };
      }
      usedIds.add(character.referenceNodeId);
      const source = nodeById.get(character.referenceNodeId);
      const referenceImageUrl =
        source?.metadata?.content ||
        source?.metadata?.backendUrl ||
        source?.metadata?.storageKey;
      if (referenceImageUrl) {
        if (
          character.referenceImageUrl === referenceImageUrl &&
          character.assetLocked &&
          character.status === "locked"
        ) {
          return character;
        }
        changed = true;
        return {
          ...character,
          referenceImageUrl,
          assetLocked: true,
          status: "locked" as const,
        };
      }
      if (
        !character.referenceImageUrl &&
        !character.assetLocked &&
        character.status === "draft"
      ) {
        return character;
      }
      changed = true;
      return {
        ...character,
        referenceImageUrl: undefined,
        assetLocked: false,
        status: "draft" as const,
      };
    }
    if (character.referenceNodeId) usedIds.add(character.referenceNodeId);
    return character;
  });
  const candidates = characterNodeIds.filter((id) => !usedIds.has(id));
  if (!candidates.length) return changed ? cleared : characters;

  const next = cleared.map((character) => {
    if (
      character.referenceNodeId ||
      character.importance === "minor" ||
      character.importance === "background"
    )
      return character;
    const availableCandidates = candidates.filter((id) => !usedIds.has(id));
    const matchId =
      findCharacterReferenceCandidate(
        character,
        availableCandidates,
        nodeById,
      ) ||
      (availableCandidates.length === 1 ? availableCandidates[0] : undefined);
    if (!matchId) return character;
    const source = nodeById.get(matchId);
    const referenceImageUrl =
      source?.metadata?.content ||
      source?.metadata?.backendUrl ||
      source?.metadata?.storageKey;
    usedIds.add(matchId);
    changed = true;
    return {
      ...character,
      referenceNodeId: matchId,
      ...(referenceImageUrl
        ? { referenceImageUrl }
        : { referenceImageUrl: undefined }),
      assetSource: "upstream" as const,
      assetLocked: Boolean(referenceImageUrl),
      status: referenceImageUrl ? ("locked" as const) : ("draft" as const),
    };
  });

  return changed ? next : characters;
}

function findCharacterReferenceCandidate(
  character: StoryCharacter,
  candidateIds: string[],
  nodeById: Map<string, CanvasNodeData>,
) {
  const names = [character.name, ...(character.aliases || [])]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!names.length) return null;
  return (
    candidateIds.find((id) => {
      const node = nodeById.get(id);
      const haystack = `${node?.title || ""}\n${
        node?.metadata?.storyLabel || ""
      }\n${node?.metadata?.prompt || ""}`.toLowerCase();
      return names.some((name) => haystack.includes(name));
    }) || null
  );
}

function sameStringArray(
  first: string[] | undefined,
  second: string[] | undefined,
) {
  const left = first || [];
  const right = second || [];
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function buildStoryCharacterImagePrompt(
  character: StoryCharacter,
  director: CanvasNodeData,
  referenceCount = 0,
) {
  const style = director.metadata?.storyStyle || "电影感写实";
  const referenceLine = referenceCount
    ? `参考图只用于统一整体画风、质感、世界观和色彩标准；不要复制参考图中的构图、背景、人物数量、道具或无关主体。`
    : "";
  const subjectRule = storyCharacterIsAnimal(character)
    ? "如果角色本体是动物，只画该动物角色的正面、侧面、背面和头部特写；不要加入人类形态、主人、桌椅、城市、室内场景或其它动物。"
    : "角色必须是单一人类角色；不要出现动物、宠物、猫、狗、桌椅、房间、城市街景、额外人物或剧情场景。";
  return `生成角色设定图，16:9 横版，纯白背景，${style}。

最高优先级统一模板：
- 本故事所有角色图必须像同一套角色资产表，使用完全一致的模板、白底、棚拍光线、镜头距离、色彩风格和渲染质感。
- 画面是 production character sheet / turnaround reference sheet，不是剧情插画、电影截图、写真、海报或场景图。
- 纯白无缝背景，柔和均匀棚拍光，不要任何室内、城市、自然、夜景、桌面、窗户、墙面、地面透视或复杂阴影。
- 固定四区布局，从左到右依次为：正面全身站姿、侧面全身站姿、背面全身站姿、右侧上半身面部特写。
- 四个区域必须是同一个角色、同一套服装、同一发型、同一脸型和同一材质表现；全身视图比例统一，站姿中性。
- 视觉关键词只用于角色身份、外貌、服装和气质；忽略其中的背景、灯光、构图、道具、宠物、场景和剧情动作。
- ${subjectRule}

角色：${character.name}
身份：${character.roleType || character.importance}
外貌：${character.appearance}
性格：${character.personality || "按故事气质表现"}
视觉关键词：${character.visualPrompt}
${referenceLine}

不要出现文字、水印、logo、编号、标签、边框线、拼贴说明。${character.negativePrompt ? `\n避免：${character.negativePrompt}` : ""}`;
}

function upgradeStoryCharacterPromptForRegeneration(
  prompt: string,
  node: CanvasNodeData | undefined,
) {
  if (!prompt || prompt.includes("最高优先级统一模板")) return prompt;
  const isCharacterSheet =
    node?.title?.startsWith("角色-") || prompt.includes("生成角色设定图");
  if (!isCharacterSheet) return prompt;
  const characterLine = prompt.match(/角色：([^\n]+)/)?.[1] || "";
  const identityLine = prompt.match(/身份：([^\n]+)/)?.[1] || "";
  const appearanceLine = prompt.match(/外貌：([^\n]+)/)?.[1] || "";
  const isAnimal =
    /转生后为|本体.*(?:猫|狗|狐|狼|虎|豹|鸟|兽)|猫|狗|狐|狼|虎|豹|鸟|兽|灵兽|妖兽|dragon|cat|dog|fox|wolf|tiger|leopard|bird|beast|animal/i.test(
      `${characterLine} ${identityLine} ${appearanceLine}`,
    );
  const subjectRule = isAnimal
    ? "如果角色本体是动物，只画该动物角色的正面、侧面、背面和头部特写；不要加入人类形态、主人、桌椅、城市、室内场景或其它动物。"
    : "角色必须是单一人类角色；不要出现动物、宠物、猫、狗、桌椅、房间、城市街景、额外人物或剧情场景。";
  return `最高优先级统一模板：
- 本故事所有角色图必须像同一套角色资产表，使用完全一致的模板、白底、棚拍光线、镜头距离、色彩风格和渲染质感。
- 画面是 production character sheet / turnaround reference sheet，不是剧情插画、电影截图、写真、海报或场景图。
- 纯白无缝背景，柔和均匀棚拍光，不要任何室内、城市、自然、夜景、桌面、窗户、墙面、地面透视或复杂阴影。
- 固定四区布局，从左到右依次为：正面全身站姿、侧面全身站姿、背面全身站姿、右侧上半身面部特写。
- 四个区域必须是同一个角色、同一套服装、同一发型、同一脸型和同一材质表现；全身视图比例统一，站姿中性。
- 旧提示词里的背景、灯光、构图、道具、宠物、场景和剧情动作全部忽略，只保留角色身份、外貌、服装和气质。
- ${subjectRule}

${prompt}`;
}

function storyCharacterIsAnimal(character: StoryCharacter) {
  const text =
    `${character.name} ${character.roleType || ""} ${character.appearance}`.toLowerCase();
  return /猫|狗|狐|狼|虎|豹|鸟|兽|灵兽|妖兽|dragon|cat|dog|fox|wolf|tiger|leopard|bird|beast|animal/.test(
    text,
  );
}

function storyCharacterDisplayName(character: StoryCharacter, index: number) {
  return character.name?.trim() || `角色-${index + 1}`;
}

function sourceReferenceImagesForStoryDirector(
  director: CanvasNodeData,
  nodes: CanvasNodeData[],
  kinds: StoryDirectorInputKind[] = ["reference", "scene", "prop"],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return kinds.flatMap((kind) =>
    storyDirectorSourceIdsForKind(director, kind).flatMap((id, index) => {
      const source = nodeById.get(id);
      return source
        ? canvasImageReferenceFromNode(
            source,
            `${storyDirectorInputKindLabel(kind)}${index + 1}.png`,
          )
        : [];
    }),
  );
}

function storyDirectorSourceIdsForKind(
  director: CanvasNodeData,
  kind: StoryDirectorInputKind,
) {
  if (kind === "character")
    return director.metadata?.storyCharacterSourceImageNodeIds || [];
  if (kind === "scene")
    return director.metadata?.storySceneSourceImageNodeIds || [];
  if (kind === "prop")
    return director.metadata?.storyPropSourceImageNodeIds || [];
  return director.metadata?.storySourceImageNodeIds?.length
    ? director.metadata.storySourceImageNodeIds
    : director.metadata?.storySourceImageNodeId
      ? [director.metadata.storySourceImageNodeId]
      : [];
}

function storyDirectorInputKindLabel(kind: StoryDirectorInputKind) {
  if (kind === "character") return "角色参考图";
  if (kind === "scene") return "场景参考图";
  if (kind === "prop") return "其它参考图";
  return "故事参考图";
}

function sourceImagesForStoryShot(
  shot: StoryShot,
  nodes: CanvasNodeData[],
  characterById: Map<string, StoryCharacter>,
): ReferenceImage[] {
  return (shot.appearingCharacterIds || []).flatMap((characterId) => {
    const character = characterById.get(characterId);
    const node = character?.referenceNodeId
      ? nodes.find((item) => item.id === character.referenceNodeId)
      : null;
    return node
      ? canvasImageReferenceFromNode(
          node,
          `${character?.name || node.title || node.id}.png`,
        )
      : [];
  });
}

/** Synthetic shot context for the character stage: story-level references only, never per-shot identity binding. */
const CHARACTER_STAGE_REFERENCE_SHOT: StoryShot = {
  id: "story-character-stage",
  index: 0,
  title: "角色图",
  appearingCharacterIds: [],
  excludedCharacterIds: [],
  action: "",
  camera: "",
  imagePrompt: "",
  resultNodeIds: [],
  status: "pending",
};

/** Story-level reference candidates (role "story") for the character generation stage. */
function storyReferenceCandidatesFor(
  director: CanvasNodeData,
  nodes: readonly CanvasNodeData[],
): StoryImageReferenceCandidate[] {
  const storyReferenceIds = director.metadata?.storySourceImageNodeIds?.length
    ? director.metadata.storySourceImageNodeIds
    : director.metadata?.storySourceImageNodeId
      ? [director.metadata.storySourceImageNodeId]
      : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return storyReferenceIds.flatMap((id) => {
    const node = nodeById.get(id);
    return node ? [{ node, role: "story" as const, label: node.title }] : [];
  });
}

export function planStoryImageReferences(
  director: CanvasNodeData,
  shot: StoryShot,
  nodes: CanvasNodeData[],
  capability: Awaited<
    ReturnType<typeof resolveImageRequestCapability>
  >["capability"],
  gridSceneIds?: ReadonlySet<string>,
  promptScope: "single" | "grid9" = "single",
  gridShots?: readonly StoryShot[],
  deliveryOptions?: StoryImageReferenceDeliveryOptions,
) {
  const storyReferenceIds = director.metadata?.storySourceImageNodeIds?.length
    ? director.metadata.storySourceImageNodeIds
    : director.metadata?.storySourceImageNodeId
      ? [director.metadata.storySourceImageNodeId]
      : [];
  const characterReferenceIds = new Set([
    ...(director.metadata?.storyCharacterSourceImageNodeIds || []),
    ...(director.metadata?.storyCharacters || []).flatMap((character) =>
      character.referenceNodeId ? [character.referenceNodeId] : [],
    ),
  ]);
  const planningNodes = nodes.map((node) =>
    characterReferenceIds.has(node.id) &&
    node.type === CanvasNodeType.Image &&
    !node.metadata?.storyCharacterAssetKind
      ? {
          ...node,
          metadata: {
            ...node.metadata,
            storyCharacterAssetKind: "identity_reference" as const,
          },
        }
      : node,
  );
  const knownNodeIds = new Set(planningNodes.map((node) => node.id));
  [
    ...storyReferenceIds,
    ...(director.metadata?.storySceneSourceImageNodeIds || []),
    ...(director.metadata?.storyPropSourceImageNodeIds || []),
    ...characterReferenceIds,
  ].forEach((id) => {
    if (knownNodeIds.has(id)) return;
    knownNodeIds.add(id);
    planningNodes.push({
      id,
      type: CanvasNodeType.Image,
      title: id,
      position: { x: 0, y: 0 },
      width: 0,
      height: 0,
      metadata: characterReferenceIds.has(id)
        ? { storyCharacterAssetKind: "identity_reference" }
        : {},
    });
  });
  const nodeById = new Map(planningNodes.map((node) => [node.id, node]));
  const candidatesForIds = (
    ids: string[] | undefined,
    build: (node: CanvasNodeData) => StoryImageReferenceCandidate,
  ) =>
    (ids || []).flatMap((id) => {
      const node = nodeById.get(id);
      return node ? [build(node)] : [];
    });
  const boundCharacterReferenceIds = new Set(
    (director.metadata?.storyCharacters || []).flatMap((character) =>
      character.referenceNodeId ? [character.referenceNodeId] : [],
    ),
  );
  const unboundCharacterReferences = candidatesForIds(
    (director.metadata?.storyCharacterSourceImageNodeIds || []).filter(
      (id) => !boundCharacterReferenceIds.has(id),
    ),
    (node) => ({ node, role: "other", label: node.title }),
  );
  const classifiedSceneReferences = classifyStorySceneReferenceCandidates(
    director,
    planningNodes,
  );
  const resolvedSceneReferences: StoryImageReferenceCandidate[] = [];
  classifiedSceneReferences.resolved.forEach((candidate) => {
    resolvedSceneReferences.push(
      gridSceneIds
        ? {
            ...candidate,
            entityId:
              candidate.entityId && gridSceneIds.has(candidate.entityId)
                ? "__grid_scenes__"
                : candidate.entityId,
          }
        : candidate,
    );
  });
  const propReferences = candidatesForIds(
    director.metadata?.storyPropSourceImageNodeIds,
    (node) => ({ node, role: "prop", label: node.title }),
  );
  const otherReferences = [
    ...candidatesForIds(
      storyReferenceIds,
      (node) => ({ node, role: "story", label: node.title }),
    ),
    ...classifiedSceneReferences.unresolved,
  ];
  if (!deliveryOptions) {
    throw new Error("Story 图片参考账本缺少精确 provider/model 路由，已阻止规划");
  }
  const selection = selectStoryImageReferences({
    shot,
    characters: director.metadata?.storyCharacters || [],
    nodes: planningNodes,
    capability,
    promptScope,
    ...(gridShots?.length ? { gridShots } : {}),
    unboundCharacterReferences,
    sceneReferences: resolvedSceneReferences,
    propReferences,
    otherReferences,
    requestedOperation: deliveryOptions.operation,
  });
  const delivery = buildStoryImageReferenceDelivery(selection, deliveryOptions);
  return {
    selection,
    references: delivery.references,
    sourceNodeIds: delivery.sourceNodeIds,
    delivery,
  };
}

function storyImageReferenceDeliveryOptions(
  resolution: Awaited<ReturnType<typeof resolveImageRequestCapability>>,
  operation: CanvasImageOperation,
): StoryImageReferenceDeliveryOptions {
  return {
    providerId:
      resolution.route.mode === "local"
        ? resolution.route.provider.id
        : resolution.route.mode,
    providerLabel: resolution.capability.providerLabel,
    model: resolution.route.model,
    operation,
    referenceCapacity: storyImageReferenceCapacity(
      resolution.capability.referenceCount,
    ),
  };
}

async function persistStoryImageReferenceSelection(
  selection: StoryImageReferenceSelection,
): Promise<StoryImageReferenceSelection> {
  const submitted = await Promise.all(
    selection.submitted.map(async (reference) => {
      if (reference.mediaSource === "storage-key" && reference.storageKey) {
        return reference;
      }
      const source = reference.dataUrl || reference.url;
      if (!source) {
        throw new Error(
          `Story 参考图「${reference.label}」缺少可保存的原始素材，已停止提交`,
        );
      }
      try {
        const uploaded = await uploadImage(
          source,
          CANVAS_RETAINED_IMAGE_UPLOAD_OPTIONS,
        );
        return {
          ...reference,
          storageKey: uploaded.storageKey,
          dataUrl: uploaded.url,
          url: undefined,
          mediaSource: "storage-key" as const,
          mimeType: uploaded.mimeType || reference.mimeType,
        };
      } catch {
        throw new Error(
          `Story 参考图「${reference.label}」无法保存原始快照，已停止提交`,
        );
      }
    }),
  );
  return { ...selection, submitted, semanticDescriptors: submitted };
}

function storyImageReferenceCapacity(
  capacity: Awaited<
    ReturnType<typeof resolveImageRequestCapability>
  >["capability"]["referenceCount"],
): StoryImageReferenceDeliverySnapshot["referenceCapacity"] {
  if (capacity.state === "unknown") return { state: "unverified" };
  if (capacity.state === "unsupported") return { state: "verified", max: 0 };
  return capacity.max === null
    ? { state: "official-unpublished" }
    : { state: "verified", max: capacity.max };
}

function applyStoryDirectorImageModel(
  imageConfig: AiConfig,
  storyDirector: CanvasNodeData,
  inheritedImageModel: StoryDirectorTextModelSelection | null,
  availableImageModels: readonly unknown[],
) {
  const resolution = resolveStoryDirectorImageModelSelection(
    storyDirector.metadata,
    inheritedImageModel,
    availableImageModels,
  );
  if (!resolution.selection) return imageConfig;
  return applyExplicitCanvasGenerationModel(imageConfig, "image", resolution.selection);
}

async function resolveStoryWorkflowImageRequest(
  imageConfig: AiConfig,
  referenceIntent: boolean,
) {
  const generate = await resolveImageRequestCapability(
    imageConfig,
    "generate",
    "imageGeneration",
  );
  const edit = referenceIntent
    ? await resolveImageRequestCapability(imageConfig, "edit", "imageGeneration")
    : undefined;
  const operation = resolveStoryWorkflowImageOperation(
    { generate: generate.capability, edit: edit?.capability },
    referenceIntent,
  );
  return operation === "generate" ? generate : edit!;
}

function stableFrontGridStoryShot(shots: StoryShot[]): StoryShot {
  const first = shots[0]!;
  const appearingCharacterIds = [
    ...new Set(shots.flatMap((shot) => shot.appearingCharacterIds || [])),
  ];
  return {
    ...first,
    id: `${first.id}:grid-reference-plan`,
    title: "",
    action: "",
    camera: "",
    visualContent: "",
    imagePrompt: "",
    finalPrompt: "",
    sceneId: "__grid_scenes__",
    appearingCharacterIds,
  };
}

function storyImageReferenceWarningText(selection: StoryImageReferenceSelection) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const warning of selection.warnings) {
    const key = `${warning.code}:${warning.entityId || ""}:${warning.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(warning.message);
  }
  return lines.join("；");
}

function canvasImageReferenceFromNode(
  node: CanvasNodeData,
  name: string,
): ReferenceImage[] {
  if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
  return [
    {
      id: node.id,
      name,
      type: node.metadata.mimeType || "image/png",
      dataUrl: node.metadata.content,
      storageKey: node.metadata.storageKey,
      url: node.metadata.backendUrl,
    },
  ];
}

function mergeReferenceImages(images: ReferenceImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.id)) return false;
    seen.add(image.id);
    return true;
  });
}

function buildStoryDirectorPrompt(
  node: CanvasNodeData,
  kind: StoryDirectorConfigKind,
) {
  const shotCount = node.metadata?.storyShotCount || 5;
  const style = node.metadata?.storyStyle || "电影感写实";
  const aspectRatio = node.metadata?.storyAspectRatio || "16:9";

  if (kind === "analysis") {
    return `你是故事导演节点的剧本分析模型。请读取上游“故事导演”文本，输出严格 JSON，不要输出解释。

任务：
1. 提取主要角色、重要配角、场景、人物关系。
2. 将剧情拆成 ${shotCount} 个镜头。
3. 每个镜头必须明确 appearingCharacterIds 和 excludedCharacterIds，防止不该出现的人物乱入。
4. characters[].visualPrompt 只能写角色本体的外貌、发型、服装、年龄、体型、气质和关键识别点；不要写背景、城市、房间、桌面、灯光、镜头、构图、剧情动作、宠物或其它角色。宠物/动物只能在该角色本体就是动物时写入。
5. characters[].negativePrompt 要补充会破坏角色资产统一性的内容，例如背景、场景、道具、其它人物、宠物、文字、水印、不同画风。
6. shots[].camera 要写景别和镜头语言，例如远景/中景/近景/特写、静态/推拉/摇移/俯拍/仰拍。
7. shots[].visualContent 要单独写画面内容，包括画面里看得见的主体、环境、道具、人物姿态、表情、空间关系、光线和关键视觉事件。
8. 输入文本可能是小说、章节大纲、脱口秀脚本、PPT 条目、对白、弹幕或分镜清单；这些都只是剧情内容，不是 JSON 源码。
9. 所有字符串字段必须是合法 JSON 字符串。对白、百分比、项目符号、书名号、引号和换行都要被安全写入字符串值；不要输出未转义换行、裸引号、Markdown、代码块或解释文字。

JSON 结构：
{
  "characters": [
    {
      "id": "char_001",
      "name": "角色名",
      "aliases": ["别名/称呼"],
      "roleType": "male_lead/supporting/villain/other",
      "importance": "main/supporting/minor/background",
      "appearance": "外貌",
      "personality": "性格",
      "visualPrompt": "可直接用于角色设定图的视觉提示词",
      "negativePrompt": "不要出现的特征"
    }
  ],
  "scenes": [
    {
      "id": "scene_001",
      "name": "场景名",
      "description": "场景描述",
      "mood": "氛围"
    }
  ],
  "shots": [
    {
      "id": "shot_001",
      "index": 1,
      "title": "镜头标题",
      "sceneId": "scene_001",
      "appearingCharacterIds": ["char_001"],
      "excludedCharacterIds": ["char_002"],
      "action": "动作",
      "camera": "景别和镜头语言，例如中景静态、近景推镜、远景俯拍",
      "emotion": "情绪",
      "visualContent": "画面内容：主体、环境、道具、光线、空间关系、关键视觉事件",
      "imagePrompt": "用于生成该镜头图片的提示词"
    }
  ]
}`;
  }

  if (kind === "character") {
    return `根据上游故事文本，为主要角色和重要配角生成角色设定图。画风：${style}。

请生成一张 16:9 横版角色资产图：纯白背景，包含多个角色设定区；每个重要角色需要正面、侧面、背面和上半身面部特写。保持同一角色的脸型、发型、服装和关键识别点一致。

要求：
- 只画故事中的 main 和 supporting 角色。
- 不要复杂背景。
- 不要水印、logo、无关文字。
- 每个角色要有清晰独立区域，避免串脸和混合人物。`;
  }

  return `根据上游故事文本生成分镜图片。画风：${style}。画面比例：${aspectRatio}。镜头数量：${shotCount}。

生成规则：
- 每个镜头只出现该镜头应该出现的角色。
- 每个出现角色在单张分镜里只能出现一次；如果只出现 1 个角色，最终画面就只能有 1 个角色实体。
- 没出现在当前镜头中的主要角色必须明确不要出现。
- 如果已连接首帧/参考图，请只把它作为风格、连续性、身份或末帧状态参考，不要复制参考图中的多视角、多姿态、多个站位或无关角色。
- 强调镜头语言、场景、动作、情绪和光线。
- 输出连续分镜感的一组图片，每张图代表一个镜头。`;
}

function buildStoryAnalysisRepairPrompt(
  node: CanvasNodeData,
  storyText: string,
  brokenOutput: string,
  error: unknown,
) {
  const reason =
    error instanceof Error ? error.message : String(error || "JSON 解析失败");
  return `你是故事导演节点的 JSON/合同修复模型。上一轮“故事分析”没有返回符合任务要求的 JSON，请根据原故事和错误输出，重新生成一个严格合法且满足任务要求的 JSON 对象。

必须遵守：
1. 只输出 JSON 对象，不要 Markdown、代码块、解释、前后缀。
2. 顶层只能包含 characters、scenes、shots 三个数组。
3. 原故事可能包含 PPT 标题、项目符号、百分比、对白、弹幕、章节号和镜头号；它们都只是剧情内容。请转写成合法 JSON 字符串，不要把原文格式当成 JSON 语法。
4. 字符串中如需保留对白或多条内容，用一句通顺描述概括，避免原样复制多行对白造成 JSON 破损。
5. shots 数量按原任务要求整理；如果原文已有镜头清单，优先保留其顺序和核心内容。

目标结构：
${buildStoryDirectorPrompt(node, "analysis")}

结果错误：
${reason}

上一轮错误输出：
${clipForPrompt(brokenOutput)}

原故事文本：
${clipForPrompt(storyText)}`;
}

function clipForPrompt(value: string, maxLength = 12000) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  const half = Math.floor((maxLength - 80) / 2);
  return `${text.slice(0, half)}\n\n...中间内容已省略...\n\n${text.slice(-half)}`;
}

function supportsStoryDirectorJsonResponseFormat(model: string) {
  return !/^gemini(?:[-_.]|$)/i.test(model.trim());
}

function buildGenerationConfig(
  config: AiConfig,
  node: CanvasNodeData | undefined,
  mode: CanvasNodeGenerationMode,
): AiConfig {
  const nodeModelResolution = resolveCanvasGenerationModelSelection(
    config,
    node?.metadata,
    mode,
  );
  const defaultModel =
    mode === "image"
      ? config.imageModel
      : mode === "video"
        ? config.videoModel
        : mode === "audio"
          ? config.audioModel
          : config.textModel;
  // The workflow picker stores its video choice in seedanceModel.  Prefer it over
  // a legacy metadata.model so the settings panel cannot inherit another provider.
  const nodeVideoModel = mode === "video"
    ? replayableCanvasGenerationModel(config, node?.metadata, "video")
    : "";
  const recordedVideoScope = mode === "video" ? node?.metadata?.videoGenerationScope : undefined;
  const selectedVideoModel = nodeVideoModel || recordedVideoScope?.model || "";
  const nodeModel = mode === "video"
    ? selectedVideoModel
    : replayableCanvasGenerationModel(config, node?.metadata, mode);
  let selectedVideoRoute: Extract<ApiRequestRoute, { mode: "local" }> | undefined;
  if (mode === "video" && selectedVideoModel) {
    try {
      const route = resolveApiRequestRoute(
        config,
        "video",
        nodeModelResolution.selection || selectedVideoModel,
        "videoGeneration",
      );
      if (route.mode === "local") selectedVideoRoute = route;
    } catch {
      // Preserve the explicit model below with no provider. Submission preflight
      // will reject it instead of silently reusing the board's old provider.
    }
  }
  const videoScope = replayableVideoGenerationScope(
    recordedVideoScope,
    selectedVideoModel,
    nodeModelResolution.selection?.providerId || selectedVideoRoute?.provider.id,
  );
  const nodeBoardRouteKey: ApiBoardRouteKey | undefined =
    mode === "image"
      ? "imageGeneration"
      : mode === "video"
        ? "videoGeneration"
        : mode === "text"
          ? "imagePrompt"
          : undefined;
  const nodeBoardRoute =
    nodeModel && nodeBoardRouteKey
      ? {
          mode: "custom" as const,
          providerId: nodeModelResolution.selection?.providerId || "",
          model: nodeModel,
        }
      : undefined;
  const generationConfig = applyExplicitCanvasGenerationModel({
    ...config,
    // The node picker is authoritative for a new submission. Retry replay is
    // applied separately by restoreCanvasImageRetryConfig at the retry entry.
    apiBoardRouting:
      videoScope?.providerId && videoScope.model
        ? {
            ...config.apiBoardRouting,
            videoGeneration: {
              mode: "custom",
              providerId: videoScope.providerId,
              model: videoScope.model,
            },
          }
        : nodeBoardRoute && nodeBoardRouteKey
          ? {
              ...config.apiBoardRouting,
              [nodeBoardRouteKey]: nodeBoardRoute,
            }
          : config.apiBoardRouting,
    videoGenerationSettingsByScope:
      node?.metadata?.videoGenerationSettings && videoScope
        ? writeVideoGenerationSettings(
            config.videoGenerationSettingsByScope,
            videoScope,
            node.metadata.videoGenerationSettings,
          )
        : config.videoGenerationSettingsByScope,
    model:
      nodeModel ||
      defaultModel ||
      (mode === "audio"
        ? defaultConfig.audioModel
        : config.model || defaultConfig.model),
    // Node metadata is an explicit request override.  Its missing fields are
    // intentionally absent so preflight can read the exact
    // provider/model/operation-scoped setting instead of a legacy global.
    imageRequestBasicSettings:
      mode === "image"
        ? node?.metadata?.storyWorkflow === "character" ||
            node?.metadata?.storyWorkflow === "shot" ||
            !node
          // Story's generated count/size/quality are assigned immediately
          // after this builder returns. Record exactly those request-local
          // fields so preflight merges them over the exact route scope; this
          // is deliberately not a global all-or-nothing bypass.
          ? { fromConfig: ["quality", "size", "count"] as const }
          : imageRequestBasicSettingsFromNode(node.metadata)
        : config.imageRequestBasicSettings,
    quality: node?.metadata?.quality || config.quality || defaultConfig.quality,
    size: node?.metadata?.size || config.size || defaultConfig.size,
    videoSeconds:
      node?.metadata?.seconds ||
      config.videoSeconds ||
      defaultConfig.videoSeconds,
    vquality:
      node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
    videoGenerateAudio:
      node?.metadata?.generateAudio ||
      config.videoGenerateAudio ||
      defaultConfig.videoGenerateAudio,
    videoWatermark:
      node?.metadata?.watermark ||
      config.videoWatermark ||
      defaultConfig.videoWatermark,
    audioVoice:
      node?.metadata?.audioVoice ||
      config.audioVoice ||
      defaultConfig.audioVoice,
    audioFormat:
      node?.metadata?.audioFormat ||
      config.audioFormat ||
      defaultConfig.audioFormat,
    audioSpeed:
      node?.metadata?.audioSpeed ||
      config.audioSpeed ||
      defaultConfig.audioSpeed,
    audioInstructions:
      node?.metadata?.audioInstructions ||
      config.audioInstructions ||
      defaultConfig.audioInstructions,
    count: String(
      node?.metadata?.count ||
        (mode === "image"
          ? config.canvasImageCount || config.count
          : config.count) ||
        defaultConfig.count,
    ),
  }, mode, nodeModelResolution.selection || nodeModel);
  return generationConfig;
}

function imageRequestBasicSettingsFromNode(
  metadata: CanvasNodeMetadata | undefined,
): AiConfig["imageRequestBasicSettings"] {
  const settings: Exclude<AiConfig["imageRequestBasicSettings"], true> = {};
  if (typeof metadata?.quality === "string") settings.quality = metadata.quality;
  if (typeof metadata?.size === "string") settings.size = metadata.size;
  if (typeof metadata?.count === "number") settings.count = String(metadata.count);
  return Object.keys(settings).length ? settings : undefined;
}

function applyActiveNodeImageAdvancedSnapshot(
  config: AiConfig,
  metadata: CanvasNodeMetadata | undefined,
  operation: CanvasImageOperation,
): AiConfig {
  return applyActiveCanvasImageAdvancedSnapshot(config, operation, {
    scope: metadata?.imageAdvancedScope,
    settings: metadata?.imageAdvancedSettings,
  });
}

function canvasMaskEditCapabilityError(config: AiConfig) {
  const { capability, routeError } = resolveImageSettingsContext(config, "edit");
  if (routeError) return `局部编辑不可用：${routeError}`;
  return canvasResolvedMaskEditCapabilityError(capability);
}

function canvasResolvedMaskEditCapabilityError(
  capability: ResolvedImageModelCapability,
) {
  if (capability.availability.state !== "supported") {
    return `局部编辑不可用：${capability.availability.reason}`;
  }
  if (capability.mask.state !== "supported") {
    return `局部编辑不可用：${capability.mask.reason}`;
  }
  if (
    capability.referenceCount.state !== "supported" ||
    capability.referenceCount.min > 1 ||
    (capability.referenceCount.max !== null && capability.referenceCount.max < 1)
  ) {
    const reason =
      capability.referenceCount.state === "supported"
        ? "该模型不能以 1 张源图执行蒙版编辑"
        : capability.referenceCount.reason;
    return `局部编辑不可用：${reason}`;
  }
  return "";
}

function assertNoOmittedAutomaticStoryVideoReferences(
  capability: Pick<ResolvedVideoModelCapability, "providerLabel" | "model">,
  preparedReferences: {
    omittedAutomaticReferences: readonly Pick<
      VideoReferenceImage,
      "id" | "name" | "label"
    >[];
    omittedReasons: readonly string[];
  },
) {
  const omittedReferences = preparedReferences.omittedAutomaticReferences;
  if (!omittedReferences.length) return;
  const labels = omittedReferences.map(
    (reference, index) =>
      reference.label || reference.name || reference.id || `自动引用 ${index + 1}`,
  );
  const reasons = Array.from(
    new Set(preparedReferences.omittedReasons.filter(Boolean)),
  );
  throw new Error(
    `${capability.providerLabel} / ${capability.model || "未命名模型"}：${omittedReferences.length} 张 Story 自动视频引用不会由当前 operation 提交（${labels.join("、")}；${reasons.join("；") || "用途不支持、能力未知或超过引用上限"}）。请手工删除这些引用、更换为当前 provider/model 支持的引用用途，或切换 provider/model 后重试；已阻止提交，未发送 HTTP 请求`,
  );
}

function requireVideoGenerationOperation(
  operation: VideoGenerationOperation | undefined,
  context: string,
): VideoGenerationOperation {
  if (!operation) {
    throw new Error(
      `${context}：缺少显式视频 operation，已阻止按引用数量猜测付费请求类型`,
    );
  }
  return operation;
}

function buildVideoParameterSnapshot(
  config: AiConfig,
  references: readonly VideoReferenceImage[],
  referenceVideos: readonly import("@/types/media").ReferenceVideo[],
  explicitOperation: VideoGenerationOperation,
  explicitSettings: VideoGenerationSettings = {},
  ledgerReferences: readonly VideoReferenceImage[] = references,
  options: { tolerateReferenceContract?: boolean } = {},
) {
  const routeScope = resolveVideoGenerationSettingsScope(
    config,
    explicitOperation,
  );
  if (!routeScope.providerId || !routeScope.model) {
    throw new Error(`视频模型“${routeScope.model || "未选择"}”没有可唯一确定的已配置 provider，已阻止参数解析和提交`);
  }
  const provider = config.apiRelays.find((item) => item.id === routeScope.providerId);
  const capability = resolveCanvasVideoModelCapability(config, routeScope.model, provider);
  const slotContract = resolveVideoReferenceSlotContract({
    capability,
    operation: explicitOperation,
    references,
    videos: referenceVideos,
  });
  // 创建/预检阶段（tolerateReferenceContract）不拦截参考媒体合同：占位框和提示词
  // 不该被单镜素材问题整批阻断；生成提交路径（默认严格）仍会逐镜抛出真实原因。
  if (slotContract.state === "blocked" && !options.tolerateReferenceContract) {
    throw new Error(
      `${capability.providerLabel} / ${routeScope.model}：${slotContract.reason || "当前视频 operation 的参考媒体合同未验证"}`,
    );
  }
  if (slotContract.notSubmitted.length && !options.tolerateReferenceContract) {
    const reasons = Array.from(
      new Set(slotContract.notSubmitted.map((item) => item.reason)),
    ).join("；");
    throw new Error(
      `${capability.providerLabel} / ${routeScope.model}：${slotContract.notSubmitted.length} 张参考图不会由当前 operation 提交（${reasons}）`,
    );
  }
  const ledgerContract = ledgerReferences === references
    ? slotContract
    : resolveVideoReferenceSlotContract({
        capability,
        operation: explicitOperation,
        references: ledgerReferences,
        videos: referenceVideos,
      });
  const hasFirstClip = referenceVideos.some((video) => video.useAs === "first_clip");
  const referenceIntent = buildVideoReferenceIntent(capability, references, {
    allowLoneLastFrame: hasFirstClip && capability.id === "dashscope-wan27-i2v",
  });
  const inferredOperation = videoGenerationOperationFromIntent({
    capability,
    referenceIntent,
    hasReferenceVideo: referenceVideos.length > 0,
    hasFirstClip,
  });
  if (explicitOperation !== inferredOperation && !options.tolerateReferenceContract) {
    throw new Error(
      `${capability.providerLabel} / ${routeScope.model}：显式 operation ${explicitOperation} 与当前引用用途解析出的 ${inferredOperation} 不一致`,
    );
  }
  const scope = { ...routeScope, operation: explicitOperation };
  const settings = readVideoGenerationSettings(config, scope, capability, explicitSettings);
  const capabilityId = capability.generationParameters.id;
  return {
    scope,
    settings,
    capability,
    referenceIntent,
    capabilityId,
    wireFormat: snapshotVideoWireFormat(settings, capability),
  };
}

function buildStoryVideoBatchPreview(
  workflowNode: CanvasNodeData,
  storyDirector: CanvasNodeData,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
  capability?: ResolvedVideoModelCapability,
) {
  const priorPlaceholderNodeIds = new Set<string>();
  for (const node of nodes) {
    if (
      node.type === CanvasNodeType.Video &&
      node.metadata?.seedanceWorkflowRole === "placeholder" &&
      node.metadata?.seedanceWorkflowNodeId === workflowNode.id
    ) {
      priorPlaceholderNodeIds.add(node.id);
    }
  }
  const preview = buildStoryDirectorSlicePlaceholders({
    workflowNode,
    storyDirector,
    nodes: nodes.filter((node) => !priorPlaceholderNodeIds.has(node.id)),
    connections: connections.filter(
      (connection) =>
        !priorPlaceholderNodeIds.has(connection.fromNodeId) &&
        !priorPlaceholderNodeIds.has(connection.toNodeId),
    ),
    capability,
  });
  const draftNodeIds = new Set<string>(
    preview.nodes
      .filter(
        (node) =>
          node.type === CanvasNodeType.Video &&
          node.metadata?.seedanceWorkflowRole === "placeholder" &&
          node.metadata?.seedanceWorkflowNodeId === workflowNode.id,
      )
      .map((node) => node.id),
  );
  return { ...preview, draftNodeIds };
}

function buildStoryVideoParameterSnapshots({
  workflowNode,
  nodes,
  connections,
  draftNodeIds,
  config,
  effectiveConfig,
}: {
  workflowNode: CanvasNodeData;
  nodes: readonly CanvasNodeData[];
  connections: readonly CanvasConnection[];
  draftNodeIds: ReadonlySet<string>;
  config: AiConfig;
  effectiveConfig: AiConfig;
}) {
  const snapshots = new Map<number, ReturnType<typeof buildVideoParameterSnapshot>>();
  const workflowMetadata = workflowNode.metadata || {};
  for (const placeholder of nodes) {
    if (
      placeholder.type !== CanvasNodeType.Video ||
      placeholder.metadata?.seedanceWorkflowRole !== "placeholder" ||
      placeholder.metadata?.seedanceWorkflowNodeId !== workflowNode.id ||
      !draftNodeIds.has(placeholder.id)
    ) continue;
    if (isVideoTaskSnapshotLocked(placeholder.metadata)) {
      throw new Error("视频批量预检草稿包含已开始或已完成的任务，已阻止复制旧版本参数快照");
    }
    const workflowModel = workflowMetadata.seedanceModel || workflowMetadata.model;
    const snapshotSource: CanvasNodeData = {
      ...placeholder,
      metadata: {
        ...placeholder.metadata,
        model: workflowModel,
        seedanceModel: workflowModel,
        modelProviderId: workflowMetadata.modelProviderId,
        videoGenerationSettings: placeholder.metadata?.videoGenerationSettings || workflowMetadata.videoGenerationSettings,
        videoGenerationScope: placeholder.metadata?.videoGenerationScope || workflowMetadata.videoGenerationScope,
        videoGenerationCapabilityId: placeholder.metadata?.videoGenerationCapabilityId || workflowMetadata.videoGenerationCapabilityId,
        videoWireFormat: placeholder.metadata?.videoWireFormat || workflowMetadata.videoWireFormat,
      },
    };
    const slots = resolveCapabilityReferenceSlots(
      snapshotSource,
      nodes,
      connections,
      config,
      effectiveConfig,
    );
    const references: VideoReferenceImage[] = seedance2ResolvedSlotsToCustomerReferences(slots).map(
      (reference, index) => ({
        id: reference.referenceId || reference.id || reference.nodeId || `story-video-ref-${index}`,
        name: reference.label,
        label: reference.label,
        nodeId: reference.nodeId,
        type: "image/png",
        dataUrl: reference.value,
        role: reference.role,
        useAs: reference.useAs,
        referenceOrigin: reference.referenceOrigin,
      }),
    );
    const generationConfig = buildGenerationConfig(effectiveConfig, snapshotSource, "video");
    const routeScope = resolveVideoGenerationSettingsScope(generationConfig, "text-to-video");
    const provider = generationConfig.apiRelays.find((item) => item.id === routeScope.providerId);
    const capability = resolveCanvasVideoModelCapability(generationConfig, routeScope.model, provider);
    let operation = snapshotSource.metadata?.videoGenerationScope?.operation;
    // Validate saved operation against current model capability
    const savedOperationStillValid = operation && capability?.supportedOperations?.includes(operation);
    if (!operation || !savedOperationStillValid) {
      operation = undefined;
    }
    if (!operation) {
      operation = requireVideoGenerationOperation(
        snapshotSource.metadata?.videoGenerationScope?.operation,
        snapshotSource.title || "视频占位框",
      );
    }
    let shotReferences = references;
    // 关键帧模式按镜适配：凑不齐最低关键帧数的镜（典型是末镜，结构上没有下一镜可拿）
    // 自动降级为首帧图生视频，而不是让整批 0/N 全灭；快照记录每镜真实 operation，
    // 生成与重试按快照逐镜复现 provider/model/operation。
    if (operation === "keyframes-to-video") {
      const keyframeMinimum = capability.keyframeImageMinimum;
      const supportsImageToVideo = capability.supportedOperations
        ? capability.supportedOperations.includes("image-to-video")
        : capability.supportsFirstFrame !== false;
      if (typeof keyframeMinimum === "number" && keyframeMinimum > 1 && supportsImageToVideo) {
        const temporalFrameCount = references.filter(
          (reference) =>
            reference.useAs === "first_frame" ||
            reference.useAs === "keyframe" ||
            reference.useAs === "last_frame",
        ).length;
        if (temporalFrameCount < keyframeMinimum) {
          operation = "image-to-video";
          shotReferences = references.filter((reference) => reference.useAs === "first_frame");
        }
      }
    }
    const preparedReferences = prepareStoryVideoReferencesForSubmission(
      capability,
      shotReferences,
      {
        operation,
      },
    );
    assertNoOmittedAutomaticStoryVideoReferences(capability, preparedReferences);
    const snapshot = buildVideoParameterSnapshot(
      generationConfig,
      preparedReferences.references,
      [],
      operation,
      snapshotSource.metadata?.videoGenerationSettings || {},
      shotReferences,
      { tolerateReferenceContract: true },
    );
    videoGenerationSettingsToRequest(snapshot.settings, capability);
    const shotIndex = Number(
      placeholder.metadata?.seedanceStoryShotIndex || placeholder.metadata?.seedanceShotIndex || 0,
    );
    if (!shotIndex) throw new Error("视频占位框缺少分镜编号，无法保存参数快照");
    snapshots.set(shotIndex, snapshot);
  }
  if (!snapshots.size) throw new Error("没有可预检的视频占位框");
  return snapshots;
}

function recoverInterruptedGeneration(nodes: CanvasNodeData[]) {
  return nodes.map((node) => {
    if (node.type === CanvasNodeType.StoryDirector)
      return recoverInterruptedStoryDirector(node);
    if (node.type === CanvasNodeType.Image) {
      return recoverInterruptedCanvasImageNode(node);
    }
    if (node.metadata?.status !== NODE_STATUS_LOADING) return node;
    if (node.type === CanvasNodeType.Video && node.metadata.videoGenerationTask)
      return node;
    if (
      node.type === CanvasNodeType.Video &&
      node.metadata.seedanceGenerationTaskState?.status === "generating" &&
      node.metadata.seedanceGenerationTaskState.taskId
    )
      return node;
    if (
      node.type === CanvasNodeType.Config ||
      (node.metadata.isBatchRoot && node.metadata.batchChildIds?.length)
    ) {
      return {
        ...node,
        metadata: {
          ...node.metadata,
          status: NODE_STATUS_SUCCESS,
          errorDetails: undefined,
        },
      };
    }
    return { ...node, metadata: clearCanvasGenerationTrace(node.metadata) };
  });
}

function recoverInterruptedStoryDirector(node: CanvasNodeData) {
  const metadata = node.metadata || {};
  const storyAnalysisStatus =
    metadata.storyAnalysisStatus === NODE_STATUS_LOADING
      ? "idle"
      : metadata.storyAnalysisStatus;
  const storyGenerationStatus =
    metadata.storyGenerationStatus === NODE_STATUS_LOADING
      ? "idle"
      : metadata.storyGenerationStatus;
  const hasLoadingStory =
    storyAnalysisStatus !== metadata.storyAnalysisStatus ||
    storyGenerationStatus !== metadata.storyGenerationStatus ||
    metadata.status === NODE_STATUS_LOADING;
  if (!hasLoadingStory) return node;
  const recoverableRaw =
    metadata.storyAnalysisPreviousRaw &&
    !detectTextApiResponseError(metadata.storyAnalysisPreviousRaw)
      ? metadata.storyAnalysisPreviousRaw
      : metadata.storyAnalysisRaw &&
          !detectTextApiResponseError(metadata.storyAnalysisRaw)
        ? metadata.storyAnalysisRaw
        : undefined;
  return {
    ...node,
    metadata: {
      ...metadata,
      status: metadata.errorDetails
        ? NODE_STATUS_ERROR
        : NODE_STATUS_SUCCESS,
      storyAnalysisStatus,
      storyGenerationStatus,
      storyAnalysisRaw: recoverableRaw,
      storyCharacters: metadata.storyCharacters || [],
      storyShots: metadata.storyShots || [],
    },
  };
}

function clearCanvasGenerationTrace(metadata: CanvasNodeMetadata | undefined) {
  const {
    status,
    errorDetails,
    sourceImageTaskId,
    imageGenerationAttemptId,
    imageGenerationTask,
    videoGenerationAttempt,
    videoGenerationTask,
    seedanceGenerationTaskState,
    seedanceTaskId,
    ...rest
  } = metadata || {};
  return rest;
}

function findRetrySourceNode(
  nodeId: string,
  nodes: CanvasNodeData[],
  connections: CanvasConnection[],
) {
  const queue = connections
    .filter((connection) => connection.toNodeId === nodeId)
    .map((connection) => connection.fromNodeId);
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.find((item) => item.id === id);
    if (node?.type === CanvasNodeType.Config) return node;
    connections
      .filter((connection) => connection.toNodeId === id)
      .forEach((connection) => queue.push(connection.fromNodeId));
  }
  return null;
}

function sourceNodeReferenceImages(node: CanvasNodeData | null) {
  if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content)
    return [];
  return [
    {
      id: node.id,
      name: `${node.title || node.id}.png`,
      type: node.metadata.mimeType || "image/png",
      dataUrl: node.metadata.content,
      storageKey: node.metadata.storageKey,
      url: node.metadata.backendUrl,
    },
  ];
}

function validateStoryImageRetryReferences(
  references: ReferenceImage[],
  nodes: CanvasNodeData[],
): { references: ReferenceImage[]; errorDetails?: string } {
  const turnaroundNodes = nodes.filter(
    (node) =>
      node.type === CanvasNodeType.Image &&
      node.metadata?.storyCharacterAssetKind === "turnaround_sheet",
  );
  const enriched: ReferenceImage[] = [];
  for (const reference of references) {
    const parentAsset = turnaroundNodes.find((node) =>
      storyImageReferenceMatchesNode(reference, node),
    );
    if (parentAsset) {
      return {
        references: [],
        errorDetails:
          "Story 分镜保存的是角色四视图父图，不能把它作为单一身份参考重试；请重新生成完整单视图派生资产",
      };
    }

    const semantic = reference as ReferenceImage &
      Partial<StoryImageReferenceSemanticSnapshot>;
    const derivedMatch = turnaroundNodes.flatMap((parent) => {
      const sourceStorageKey = parent.metadata?.storageKey || "";
      const views = parent.metadata?.characterDerivedViews;
      if (
        !sourceStorageKey ||
        !hasCompleteCharacterDerivedViews(
          views,
          sourceStorageKey,
          parent.id,
        )
      )
        return [];
      const view = views?.find(
        (candidate) =>
          candidate.id === reference.id ||
          candidate.storageKey === reference.storageKey,
      );
      return view ? [{ parent, view }] : [];
    })[0];

    if (semantic.role === "identity") {
      const source = nodes.find((candidate) => candidate.id === semantic.sourceNodeId);
      if (
        source?.metadata?.storyCharacterAssetKind === "identity_reference" &&
        source.id === reference.id &&
        semantic.angle === "identity"
      ) {
        enriched.push(reference);
        continue;
      }
      if (
        !derivedMatch ||
        derivedMatch.parent.id !== semantic.sourceNodeId ||
        derivedMatch.view.id !== reference.id ||
        derivedMatch.view.storageKey !== reference.storageKey ||
        derivedMatch.view.angle !== semantic.angle
      ) {
        return {
          references: [],
          errorDetails:
            "Story 分镜的角色单视图语义参考不完整或已变化，无法安全重试",
        };
      }
      enriched.push(reference);
      continue;
    }

    if (derivedMatch) {
      const recoveredReference: ReferenceImage &
        Partial<StoryImageReferenceSemanticSnapshot> = {
        ...reference,
        id: derivedMatch.view.id,
        sourceNodeId: derivedMatch.parent.id,
        role: "identity",
        entityId: derivedMatch.parent.metadata?.storyCharacterId,
        angle: derivedMatch.view.angle,
      };
      enriched.push(recoveredReference);
      continue;
    }
    enriched.push(reference);
  }
  return { references: enriched };
}

function storyImageReferenceMatchesNode(
  reference: ReferenceImage,
  node: CanvasNodeData,
) {
  const referenceValues = [
    reference.storageKey,
    reference.url,
    reference.dataUrl,
  ].filter((value): value is string => Boolean(value));
  const nodeValues = [
    node.metadata?.storageKey,
    node.metadata?.backendUrl,
    node.metadata?.content,
  ].filter((value): value is string => Boolean(value));
  return referenceValues.some((value) => nodeValues.includes(value));
}

function isAudioFile(file: File) {
  return file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name);
}

function isSupportedCanvasFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    file.type.startsWith("video/") ||
    isAudioFile(file)
  );
}

function getGridPosition(
  anchor: Position,
  index: number,
  total: number,
): Position {
  const columns = Math.min(4, Math.ceil(Math.sqrt(total)));
  const row = Math.floor(index / columns);
  const column = index % columns;
  return {
    x: anchor.x + (column - (columns - 1) / 2) * CANVAS_FILE_GRID_GAP_X,
    y:
      anchor.y +
      (row - (Math.ceil(total / columns) - 1) / 2) * CANVAS_FILE_GRID_GAP_Y,
  };
}

function isHiddenBatchChild(
  node: CanvasNodeData,
  nodes: CanvasNodeData[],
  collapsingBatchIds?: Set<string>,
) {
  const rootId = node.metadata?.batchRootId;
  if (!rootId) return false;
  const root = nodes.find((item) => item.id === rootId);
  if (root && collapsingBatchIds?.has(rootId)) return false;
  return Boolean(root && !root.metadata?.imageBatchExpanded);
}

function isHiddenBatchConnectionEndpoint(
  node: CanvasNodeData,
  nodes: CanvasNodeData[],
) {
  const rootId = node.metadata?.batchRootId;
  if (!rootId) return false;
  const root = nodes.find((item) => item.id === rootId);
  return Boolean(root && !root.metadata?.imageBatchExpanded);
}

function buildAngleLabel(params: CanvasImageAngleParams) {
  const horizontal =
    params.horizontalAngle === 0
      ? "正面视角"
      : params.horizontalAngle > 0
        ? `向右旋转 ${params.horizontalAngle} 度`
        : `向左旋转 ${Math.abs(params.horizontalAngle)} 度`;
  const pitch =
    params.pitchAngle === 0
      ? "水平视角"
      : params.pitchAngle > 0
        ? `俯视 ${params.pitchAngle} 度`
        : `仰视 ${Math.abs(params.pitchAngle)} 度`;
  return `AI 多角度：${horizontal}，${pitch}，镜头距离 ${params.cameraDistance.toFixed(1)}，${params.wideAngle ? "广角" : "标准"}镜头`;
}

function buildAnglePrompt(params: CanvasImageAngleParams) {
  return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`;
}
