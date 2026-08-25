"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { Button, Select } from "antd";

import { ProviderModelPicker } from "@/components/model-picker";
import { audioGenerationPreflightError } from "@/services/api/audio";
import { buildVideoReferenceIntent } from "@/services/api/video-model-capabilities";
import { resolveVideoReferenceSlotContract } from "@/services/api/video-reference-slot-contract";
import {
  defaultConfig,
  resolveVideoGenerationSettingsScope,
  useConfigStore,
  useEffectiveConfig,
  writeImageAdvancedSettings,
  writeVideoGenerationSettings,
  type AiConfig,
  type VideoGenerationOperation,
} from "@/stores/use-config-store";
import {
  CreditSymbol,
  imageCreditCost,
  outputSizeForImageQuality,
  requestCreditCost,
} from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import {
  CanvasAudioSettingsPopover,
  type CanvasAudioSettingKey,
} from "./canvas-audio-settings-popover";
import { resolvePromptTextareaHeight } from "./canvas-prompt-panel-height";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import {
  CanvasNodeType,
  type CanvasGenerationMode,
  type CanvasNodeData,
} from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import {
  CANVAS_IMAGE_OPERATION_EMPTY_HINT,
  canvasImageOperationCapabilityError,
  canvasImageOperationInputError,
  legacyCanvasImageGenerationType,
  resolveCanvasImageOperation,
  resolveCanvasImageOperationChange,
  resolveCanvasImageOperationOptions,
} from "../utils/canvas-image-operation";
import {
  applyExplicitCanvasGenerationModel,
  replayableCanvasGenerationModel,
  resolveCanvasGenerationModelSelection,
} from "../utils/canvas-generation-model";
import { standaloneSeedance2VideoModelPatch } from "../utils/canvas-standalone-video-model";
import { resolveCanvasVideoModelCapability } from "../utils/canvas-video-capability";
import { resolveWorkflowVideoOperationSelection } from "../utils/canvas-video-operation-selection";
import { isVideoTaskSnapshotLocked } from "../utils/canvas-video-task-edit-lock";
import {
  buildSeedance2ReferenceSlotKeysFromOrder,
  parseSeedance2ExtraReferenceSlotIndex,
} from "../utils/seedance2-reference-slots";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
  node: CanvasNodeData;
  isRunning: boolean;
  onPromptChange: (nodeId: string, prompt: string) => void;
  onConfigChange: (
    nodeId: string,
    patch: Partial<CanvasNodeData["metadata"]>,
  ) => void;
  onGenerate: (
    nodeId: string,
    mode: CanvasNodeGenerationMode,
    prompt: string,
  ) => void;
  mentionReferences?: CanvasResourceReference[];
  onImageSettingsOpenChange?: (open: boolean) => void;
};

const PROMPT_TEXTAREA_COLLAPSED_HEIGHT = 96;
const PROMPT_TEXTAREA_EXPANDED_MIN_HEIGHT = 220;
const PROMPT_TEXTAREA_EXPANDED_MAX_HEIGHT = 640;
const PROMPT_TEXTAREA_VIEWPORT_MARGIN = 220;
const PROMPT_TEXTAREA_SCROLL_HEIGHT_BUFFER = 2;
export function CanvasNodePromptPanel({
  node,
  isRunning,
  onPromptChange,
  onConfigChange,
  onGenerate,
  mentionReferences = [],
  onImageSettingsOpenChange,
}: CanvasNodePromptPanelProps) {
  const globalConfig = useEffectiveConfig();
  const publicSettings = useConfigStore((state) => state.publicSettings);
  const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
  const theme = canvasThemes[useThemeStore((state) => state.theme)];
  const mode = defaultMode(node.type);
  const videoSnapshotLocked =
    mode === "video" && isVideoTaskSnapshotLocked(node.metadata);
  const config = buildNodeConfig(globalConfig, node, mode);
  const modelSelectionState = resolveCanvasGenerationModelSelection(
    globalConfig,
    node.metadata,
    mode,
  );
  const hasTextContent =
    node.type === CanvasNodeType.Text &&
    Boolean(node.metadata?.content?.trim());
  const hasImageContent =
    node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
  const activeImageReferenceCount =
    mentionReferences.filter(
      (reference) => reference.active && reference.kind === "image",
    ).length + (hasImageContent ? 1 : 0);
  const imageOperation = resolveCanvasImageOperation(node.metadata, {
    referenceCount: activeImageReferenceCount,
    hasImageContent,
  });
  const imageOperationOptions = resolveCanvasImageOperationOptions(
    config,
    activeImageReferenceCount > 0 ? activeImageReferenceCount : undefined,
  );
  const imageCapabilityError = canvasImageOperationCapabilityError(
    config,
    imageOperation,
    activeImageReferenceCount > 0 ? activeImageReferenceCount : undefined,
  );
  const videoReferenceState =
    mode === "video"
      ? resolveNodeVideoReferenceState(config, node, mentionReferences)
      : null;
  const videoOperation = videoReferenceState?.operation;
  const audioContractError =
    mode === "audio" ? audioGenerationPreflightError(config) : undefined;
  const isEditingExistingContent = hasTextContent || hasImageContent;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const manualPromptTextareaHeightRef = useRef<number | null>(null);
  const [prompt, setPrompt] = useState(
    hasImageContent
      ? node.metadata?.prompt || ""
      : isEditingExistingContent
        ? ""
        : node.metadata?.prompt || "",
  );
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [promptTextareaHeight, setPromptTextareaHeight] = useState(
    PROMPT_TEXTAREA_COLLAPSED_HEIGHT,
  );
  const credits =
    mode === "image"
      ? imageOperation
        ? imageCreditCost({
            channelMode: config.channelMode,
            prices: publicSettings?.billing?.prices,
            mode: legacyCanvasImageGenerationType(imageOperation),
            outputSize: outputSizeForImageQuality(config.quality),
            count: config.count,
          })
        : 0
      : requestCreditCost({
          channelMode: config.channelMode,
          modelCosts: publicSettings?.modelChannel.modelCosts,
          model: config.model,
          count: 1,
        });

  const measurePromptTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const viewportMax = getPromptTextareaViewportMax();
    const minimumHeight = isPromptExpanded
      ? PROMPT_TEXTAREA_EXPANDED_MIN_HEIGHT
      : PROMPT_TEXTAREA_COLLAPSED_HEIGHT;
    const manualHeight = manualPromptTextareaHeightRef.current;
    const contentHeight =
      manualHeight === null
        ? measurePromptTextareaContentHeight(textarea, "", viewportMax)
        : minimumHeight;
    const nextHeight = resolvePromptTextareaHeight({
      minimumHeight,
      maximumHeight: viewportMax,
      contentHeight,
      manualHeight: manualPromptTextareaHeightRef.current,
    });

    if (manualHeight !== null && Math.abs(manualHeight - nextHeight) > 1) {
      manualPromptTextareaHeightRef.current = nextHeight;
      textarea.style.height = `${nextHeight}px`;
    }

    setPromptTextareaHeight((current) =>
      Math.abs(current - nextHeight) > 1 ? nextHeight : current,
    );
  }, [isPromptExpanded]);

  const syncPromptTextareaResizeHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const manualResizeHeight = readInlinePromptTextareaHeight(
      textarea.style.height,
    );
    if (!manualResizeHeight) return;

    const minimumHeight = isPromptExpanded
      ? PROMPT_TEXTAREA_EXPANDED_MIN_HEIGHT
      : PROMPT_TEXTAREA_COLLAPSED_HEIGHT;
    const nextHeight = resolvePromptTextareaHeight({
      minimumHeight,
      maximumHeight: getPromptTextareaViewportMax(),
      contentHeight: minimumHeight,
      manualHeight: manualResizeHeight,
    });
    manualPromptTextareaHeightRef.current = nextHeight;
    if (Math.abs(manualResizeHeight - nextHeight) > 1)
      textarea.style.height = `${nextHeight}px`;
    setPromptTextareaHeight((current) =>
      Math.abs(current - nextHeight) > 1 ? nextHeight : current,
    );
  }, [isPromptExpanded]);

  const resetPromptTextareaManualHeight = useCallback(() => {
    manualPromptTextareaHeightRef.current = null;
    const textarea = textareaRef.current;
    if (textarea) textarea.style.height = "";
  }, []);

  useEffect(() => {
    setPrompt(
      hasImageContent
        ? node.metadata?.prompt || ""
        : isEditingExistingContent
          ? ""
          : node.metadata?.prompt || "",
    );
  }, [
    hasImageContent,
    isEditingExistingContent,
    node.id,
    node.metadata?.prompt,
  ]);

  useEffect(() => {
    resetPromptTextareaManualHeight();
    setIsPromptExpanded(false);
    setPromptTextareaHeight(PROMPT_TEXTAREA_COLLAPSED_HEIGHT);
  }, [node.id, resetPromptTextareaManualHeight]);

  useLayoutEffect(() => {
    measurePromptTextarea();
  }, [measurePromptTextarea, prompt]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => syncPromptTextareaResizeHeight());
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [syncPromptTextareaResizeHeight]);

  useEffect(() => {
    if (!isPromptExpanded) return;
    const handleWindowResize = () => measurePromptTextarea();
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [isPromptExpanded, measurePromptTextarea]);

  const updatePrompt = (value: string) => {
    setPrompt(value);
    onPromptChange(node.id, value);
    measurePromptTextarea();
  };

  const imageOperationError =
    mode === "image"
      ? imageCapabilityError || canvasImageOperationInputError(imageOperation, {
          prompt,
          referenceCount: activeImageReferenceCount,
        })
      : undefined;

  const submit = () => {
    const text = prompt.trim();
    if (
      isRunning ||
      (mode === "image" ? Boolean(imageOperationError) : !text) ||
      (mode === "video" && Boolean(videoReferenceState?.error))
    )
      return;
    onGenerate(node.id, mode, text);
  };

  return (
    <div
      className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
      style={{
        background: theme.toolbar.panel,
        borderColor: theme.toolbar.border,
        color: theme.node.text,
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasResourceMentionTextarea
        ref={textareaRef}
        value={prompt}
        references={mentionReferences}
        onChange={updatePrompt}
        onSubmit={submit}
        containerStyle={{
          height: promptTextareaHeight,
          minHeight: PROMPT_TEXTAREA_COLLAPSED_HEIGHT,
          transition: "none",
        }}
        className="thin-scrollbar block h-full w-full resize-y overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-sm leading-5 outline-none"
        style={{
          background: theme.node.fill,
          borderColor: theme.node.stroke,
          color: theme.node.text,
          minHeight: PROMPT_TEXTAREA_COLLAPSED_HEIGHT,
          transition: "none",
        }}
        highlightLabels={false}
        data-canvas-wheel-scroll="true"
        placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          resetPromptTextareaManualHeight();
          setIsPromptExpanded((expanded) => !expanded);
        }}
        onWheel={(event) => event.stopPropagation()}
      />

      <div className="mt-2 flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
          <CanvasPromptLibrary onSelect={updatePrompt} />
          {mode === "image" ? (
            <>
              <Select
                className="!min-w-[176px]"
                aria-label="图片 operation"
                placeholder="选择图片操作"
                value={imageOperationOptions.some((option) => option.value === imageOperation) ? imageOperation : undefined}
                options={imageOperationOptions}
                notFoundContent={CANVAS_IMAGE_OPERATION_EMPTY_HINT}
                popupMatchSelectWidth={false}
                data-image-operation-state={imageOperation && !imageCapabilityError ? "resolved" : "unresolved"}
                onChange={(value) =>
                  onConfigChange(node.id, resolveCanvasImageOperationChange(config, value))
                }
              />
              <ProviderModelPicker
                config={config}
                value={modelSelectionState.selection}
                legacyValue={modelSelectionState.legacyModel}
                onChange={(selection) =>
                  onConfigChange(node.id, {
                    model: selection.model,
                    modelProviderId: selection.providerId,
                  })
                }
                capability="image"
                onMissingConfig={() => openConfigDialog(true)}
              />
              {imageOperation ? (
                <CanvasImageSettingsPopover
                  config={config}
                  operation={imageOperation}
                  placement="topLeft"
                  buttonClassName="!h-auto !min-h-10 !min-w-[7.5rem] !justify-start !rounded-xl !px-3 !py-1"
                  onConfigChange={(key, value) =>
                    onConfigChange(
                      node.id,
                      key === "count"
                        ? { count: Number(value) || 1 }
                        : { [key]: value },
                    )
                  }
                  onAdvancedSettingsChange={(settings, scope) =>
                    onConfigChange(node.id, {
                      imageAdvancedSettings: settings,
                      imageAdvancedScope: scope,
                    })
                  }
                  onMissingConfig={() => openConfigDialog(true)}
                  onOpenChange={onImageSettingsOpenChange}
                />
              ) : (
                <Button data-image-settings-disabled disabled>
                  选择图片操作后配置参数
                </Button>
              )}
            </>
          ) : mode === "video" ? (
            videoSnapshotLocked ? (
              <div
                role="status"
                data-video-task-settings-locked
                className="rounded-full border px-3 py-2 text-xs"
                style={{ borderColor: theme.node.stroke, color: theme.node.muted }}
              >
                任务已提交或完成，provider / 模型 / 参数快照只读
              </div>
            ) : <>
              <ProviderModelPicker
                config={config}
                value={modelSelectionState.selection}
                legacyValue={modelSelectionState.legacyModel}
                onChange={(selection) =>
                  onConfigChange(
                    node.id,
                    standaloneSeedance2VideoModelPatch(selection),
                  )
                }
                capability="video"
                onMissingConfig={() => openConfigDialog(true)}
              />
              <Select
                aria-label="视频 operation"
                className="!min-w-[148px]"
                placeholder="选择视频 operation"
                value={videoOperation}
                options={videoReferenceState?.operationOptions}
                disabled={!videoReferenceState?.operationOptions.length}
                onChange={(operation) =>
                  onConfigChange(node.id, {
                    videoGenerationScope: {
                      providerId: videoReferenceState!.scope.providerId,
                      model: videoReferenceState!.scope.model,
                      operation,
                    },
                  })
                }
              />
              {videoOperation ? (
                <CanvasVideoSettingsPopover
                  config={config}
                  operation={videoOperation}
                  buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                  onConfigChange={(key, value) =>
                    onConfigChange(node.id, videoConfigPatch(key, value))
                  }
                  onGenerationSettingsChange={(settings, scope, capabilityId) =>
                    onConfigChange(node.id, {
                      videoGenerationSettings: settings,
                      videoGenerationScope: scope,
                      videoGenerationCapabilityId: capabilityId,
                    })
                  }
                />
              ) : (
                <div
                  role="status"
                  data-video-operation-scope-state="blocked"
                  className="rounded-full border px-3 py-2 text-xs"
                  style={{ borderColor: theme.node.stroke, color: theme.node.muted }}
                >
                  缺少已持久化的视频 operation
                </div>
              )}
            </>
          ) : mode === "audio" ? (
            <>
              <ProviderModelPicker
                config={config}
                value={modelSelectionState.selection}
                legacyValue={modelSelectionState.legacyModel}
                onChange={(selection) =>
                  onConfigChange(node.id, {
                    model: selection.model,
                    modelProviderId: selection.providerId,
                  })
                }
                capability="audio"
                onMissingConfig={() => openConfigDialog(true)}
              />
              <CanvasAudioSettingsPopover
                config={config}
                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                onConfigChange={(key, value) =>
                  onConfigChange(node.id, audioConfigPatch(key, value))
                }
              />
            </>
          ) : (
            <ProviderModelPicker
              config={config}
              value={modelSelectionState.selection}
              legacyValue={modelSelectionState.legacyModel}
              onChange={(selection) =>
                onConfigChange(node.id, {
                  model: selection.model,
                  modelProviderId: selection.providerId,
                })
              }
              capability="text"
              onMissingConfig={() => openConfigDialog(true)}
            />
          )}
        </div>
        <Button
          type="primary"
          className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
          disabled={
            isRunning ||
            (mode === "image"
              ? Boolean(imageOperationError)
              : !prompt.trim()) ||
            (mode === "video" && Boolean(videoReferenceState?.error)) ||
            (mode === "audio" && Boolean(audioContractError))
          }
          onClick={submit}
          aria-label="生成"
        >
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
              <CreditSymbol />
              {credits.toLocaleString()}
            </span>
            {isRunning ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </span>
        </Button>
      </div>
      {imageOperationError ? (
        <div
          className="mt-2 rounded-lg border border-orange-500/40 px-2 py-1.5 text-[11px] leading-4 text-orange-400"
          data-image-reference-count={activeImageReferenceCount}
        >
          {imageOperationError}
        </div>
      ) : null}
      {mode === "video" && videoReferenceState?.error ? (
        <div
          role="alert"
          data-video-reference-validation-state="blocked"
          data-video-operation-validation-state={
            videoOperation ? undefined : "blocked"
          }
          className="mt-2 rounded-lg border border-red-500/40 px-2 py-1.5 text-[11px] leading-4 text-red-400"
        >
          <div>{videoReferenceState.error}</div>
          <div className="mt-1">
            {videoOperation
              ? "所有引用保持原样；请调整引用用途或切换到支持该组合的 Provider / 模型后重试。"
              : "所有引用保持原样；请先选择当前 Provider / 模型的明确视频 operation。"}
          </div>
        </div>
      ) : null}
      {mode === "audio" && audioContractError ? (
        <div
          role="alert"
          data-audio-generation-contract-state="blocked"
          className="mt-2 rounded-lg border border-red-500/40 px-2 py-1.5 text-[11px] leading-4 text-red-400"
        >
          {audioContractError}
        </div>
      ) : null}
    </div>
  );
}

function getPromptTextareaViewportMax() {
  if (typeof window === "undefined") return PROMPT_TEXTAREA_EXPANDED_MAX_HEIGHT;
  return clampPromptTextareaHeight(
    window.innerHeight - PROMPT_TEXTAREA_VIEWPORT_MARGIN,
  );
}

function readInlinePromptTextareaHeight(height: string) {
  if (!height) return 0;
  const parsedHeight = Number.parseFloat(height);
  if (!Number.isFinite(parsedHeight)) return 0;
  return Math.max(PROMPT_TEXTAREA_COLLAPSED_HEIGHT, Math.ceil(parsedHeight));
}

function measurePromptTextareaContentHeight(
  textarea: HTMLTextAreaElement,
  restoreHeight: string,
  maxHeight: number,
) {
  textarea.style.height = "0px";
  try {
    return clampPromptTextareaHeight(
      textarea.scrollHeight + PROMPT_TEXTAREA_SCROLL_HEIGHT_BUFFER,
      maxHeight,
    );
  } finally {
    textarea.style.height = restoreHeight;
  }
}

function clampPromptTextareaHeight(
  height: number,
  maxHeight = PROMPT_TEXTAREA_EXPANDED_MAX_HEIGHT,
) {
  return Math.min(
    Math.max(height, PROMPT_TEXTAREA_COLLAPSED_HEIGHT),
    maxHeight,
  );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
  return type === CanvasNodeType.Text
    ? "text"
    : type === CanvasNodeType.Video
      ? "video"
      : type === CanvasNodeType.Audio
        ? "audio"
        : "image";
}

function buildNodeConfig(
  globalConfig: AiConfig,
  node: CanvasNodeData,
  mode: CanvasNodeGenerationMode,
): AiConfig {
  const configuredDefault =
    mode === "image"
      ? globalConfig.imageModel
      : mode === "video"
        ? globalConfig.videoModel
        : mode === "audio"
          ? globalConfig.audioModel
          : globalConfig.textModel;
  const nodeModel = replayableCanvasGenerationModel(
    globalConfig,
    node.metadata,
    mode,
  );
  const providerModelState = resolveCanvasGenerationModelSelection(
    globalConfig,
    node.metadata,
    mode,
  );
  const videoScope = node.metadata?.videoGenerationScope;
  return applyExplicitCanvasGenerationModel(
    {
      ...globalConfig,
      apiBoardRouting:
        videoScope?.providerId && videoScope.model
          ? {
              ...globalConfig.apiBoardRouting,
              videoGeneration: {
                mode: "custom",
                providerId: videoScope.providerId,
                model: videoScope.model,
              },
            }
          : globalConfig.apiBoardRouting,
      imageAdvancedSettingsByScope:
        node.metadata?.imageAdvancedSettings && node.metadata.imageAdvancedScope
          ? writeImageAdvancedSettings(
              globalConfig.imageAdvancedSettingsByScope,
              node.metadata.imageAdvancedScope,
              node.metadata.imageAdvancedSettings,
            )
          : globalConfig.imageAdvancedSettingsByScope,
      videoGenerationSettingsByScope:
        node.metadata?.videoGenerationSettings &&
        node.metadata.videoGenerationScope?.operation
          ? writeVideoGenerationSettings(
              globalConfig.videoGenerationSettingsByScope,
              node.metadata.videoGenerationScope,
              node.metadata.videoGenerationSettings,
            )
          : globalConfig.videoGenerationSettingsByScope,
      model: nodeModel || configuredDefault,
      quality:
        node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
      size: node.metadata?.size || globalConfig.size || defaultConfig.size,
      videoSeconds:
        node.metadata?.seconds ||
        globalConfig.videoSeconds ||
        defaultConfig.videoSeconds,
      vquality:
        node.metadata?.vquality ||
        globalConfig.vquality ||
        defaultConfig.vquality,
      videoGenerateAudio:
        node.metadata?.generateAudio ||
        globalConfig.videoGenerateAudio ||
        defaultConfig.videoGenerateAudio,
      videoWatermark:
        node.metadata?.watermark ||
        globalConfig.videoWatermark ||
        defaultConfig.videoWatermark,
      audioVoice:
        node.metadata?.audioVoice ||
        globalConfig.audioVoice ||
        defaultConfig.audioVoice,
      audioFormat:
        node.metadata?.audioFormat ||
        globalConfig.audioFormat ||
        defaultConfig.audioFormat,
      audioSpeed:
        node.metadata?.audioSpeed ||
        globalConfig.audioSpeed ||
        defaultConfig.audioSpeed,
      audioInstructions:
        node.metadata?.audioInstructions ||
        globalConfig.audioInstructions ||
        defaultConfig.audioInstructions,
      count: String(
        node.metadata?.count ||
          (mode === "image"
            ? globalConfig.canvasImageCount || globalConfig.count
            : globalConfig.count) ||
          defaultConfig.count,
      ),
    },
    mode,
    providerModelState.selection || nodeModel,
  );
}

function promptPlaceholder(
  mode: CanvasNodeGenerationMode,
  hasImageContent: boolean,
  hasTextContent: boolean,
) {
  if (mode === "video") return "描述要生成的视频内容";
  if (mode === "audio") return "描述要生成的音频内容";
  if (mode === "image")
    return hasImageContent
      ? "请输入你想要把这张图修改成什么"
      : "描述要生成的图片内容";
  return hasTextContent
    ? "请输入你想要将本段文本修改成什么"
    : "请输入你想要生成的文本内容";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
  if (key === "videoSeconds") return { seconds: value };
  if (key === "videoGenerateAudio") return { generateAudio: value };
  if (key === "videoWatermark") return { watermark: value };
  return { [key]: value };
}

function nodeVideoReferenceUses(node: CanvasNodeData) {
  const semanticBindings = node.metadata?.seedanceReferenceSlotBindings || {};
  const orderedSemanticBindings = buildSeedance2ReferenceSlotKeysFromOrder(
    node.metadata?.seedanceReferenceOrder,
  ).map((key) => semanticBindings[key]);
  const orderedExtraBindings = Object.entries(
    node.metadata?.seedanceReferenceExtraSlotBindings || {},
  )
    .flatMap(([key, binding]) => {
      const slotIndex = parseSeedance2ExtraReferenceSlotIndex(key);
      return slotIndex === null ? [] : [{ binding, slotIndex }];
    })
    .sort((left, right) => left.slotIndex - right.slotIndex)
    .map(({ binding }) => binding);

  return [...orderedSemanticBindings, ...orderedExtraBindings].flatMap(
    (binding) =>
      binding?.value || binding?.nodeId
        ? [binding.useAs || ("reference_image" as const)]
        : [],
  );
}

function resolveNodeVideoReferenceState(
  config: AiConfig,
  node: CanvasNodeData,
  mentionReferences: CanvasResourceReference[],
): {
  operation?: VideoGenerationOperation;
  operationOptions: ReturnType<
    typeof resolveWorkflowVideoOperationSelection
  >["options"];
  scope: { providerId: string; model: string };
  error: string;
} {
  const routeScope = resolveVideoGenerationSettingsScope(
    config,
    "text-to-video",
  );
  const videoProvider = config.apiRelays.find(
    (provider) => provider.id === routeScope.providerId,
  );
  const videoCapability = resolveCanvasVideoModelCapability(
    config,
    routeScope.model,
    videoProvider,
  );
  const operationSelection = resolveWorkflowVideoOperationSelection({
    capability: videoCapability,
    providerId: routeScope.providerId,
    model: routeScope.model,
    savedScope: node.metadata?.videoGenerationScope,
    savedCapabilityId: node.metadata?.videoGenerationCapabilityId,
  });
  const operation = operationSelection.operation;
  const baseState = {
    operationOptions: operationSelection.options,
    scope: {
      providerId: routeScope.providerId,
      model: routeScope.model,
    },
  };
  if (!operation) {
    return {
      ...baseState,
      error: operationSelection.blockedReason ||
        "当前模型提供多个视频 operation；必须显式选择视频 operation，不能按引用数量或用途猜测付费请求类型",
    };
  }

  const activeVideoImages = mentionReferences.filter(
    (reference) => reference.active && reference.kind === "image",
  );
  const activeVideoReferences = mentionReferences.filter(
    (reference) => reference.active && reference.kind === "video",
  );
  const hasFirstClip = mentionReferences.some(
    (reference) =>
      reference.active &&
      reference.kind === "video" &&
      reference.videoUseAs === "first_clip",
  );
  const explicitUsesAs = nodeVideoReferenceUses(node);
  const referenceUsesAs = explicitUsesAs.length
    ? explicitUsesAs
    : activeVideoImages.map(() => "reference_image" as const);
  const slotContract = resolveVideoReferenceSlotContract({
    capability: videoCapability,
    operation,
    references: referenceUsesAs.map((useAs) => ({ useAs })),
    videos: activeVideoReferences.map((reference) => ({
      useAs: reference.videoUseAs,
    })),
  });
  if (slotContract.state === "blocked" || slotContract.notSubmitted.length) {
    return {
      ...baseState,
      operation,
      error:
        slotContract.reason ||
        Array.from(
          new Set(slotContract.notSubmitted.map((reference) => reference.reason)),
        ).join("；") ||
        "当前已持久化的视频 operation 不支持这些引用用途",
    };
  }

  try {
    buildVideoReferenceIntent(
      videoCapability,
      slotContract.submitted,
      {
        allowLoneLastFrame:
          hasFirstClip && videoCapability.id === "dashscope-wan27-i2v",
      },
    );
    return {
      ...baseState,
      operation,
      error: "",
    };
  } catch (error) {
    return {
      ...baseState,
      operation,
      error:
        error instanceof Error
          ? error.message
          : "当前 Provider / 模型不支持这些视频引用用途",
    };
  }
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
  if (key === "audioVoice") return { audioVoice: value };
  if (key === "audioFormat") return { audioFormat: value };
  if (key === "audioSpeed") return { audioSpeed: value };
  return { audioInstructions: value };
}
