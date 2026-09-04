"use client";

import type { CSSProperties } from "react";
import { Image as ImageIcon, LoaderCircle, MessageSquare, Music2, Play, Settings2, Video } from "lucide-react";
import { Button, Segmented, Select } from "antd";

import { ProviderModelPicker } from "@/components/model-picker";
import { audioGenerationPreflightError } from "@/services/api/audio";
import { videoPromptPreflightError } from "@/services/api/video-prompt-contract";
import { imageAdvancedSettingsLabel, imageQualityLabel, imageSizeLabel, resolveImageSettingsContext } from "@/components/image-settings-panel";
import { videoSettingsSummary } from "@/components/video-settings-panel";
import { audioFormatLabel, audioSpeedLabel, audioVoiceLabel } from "@/lib/audio-generation";
import { defaultConfig, readImageAdvancedSettings, resolveVideoGenerationSettingsScope, useConfigStore, useEffectiveConfig, writeImageAdvancedSettings, writeVideoGenerationSettings, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, imageCreditCost, outputSizeForImageQuality, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { applyExplicitCanvasGenerationModel, replayableCanvasGenerationModel, resolveCanvasGenerationModelSelection } from "../utils/canvas-generation-model";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "../types";
import { resolveConfigNodeVideoReferencePreview } from "./canvas-node-generation";
import { CANVAS_IMAGE_OPERATION_EMPTY_HINT, canvasImageOperationCapabilityError, canvasImageOperationInputError, legacyCanvasImageGenerationType, resolveCanvasImageOperation, resolveCanvasImageOperationChange, resolveCanvasImageOperationOptions } from "../utils/canvas-image-operation";
import { standaloneSeedance2VideoModelPatch } from "../utils/canvas-standalone-video-model";
import { resolveCanvasVideoModelCapability } from "../utils/canvas-video-capability";
import { workflowVideoOperationOptionsForCapability } from "../utils/canvas-video-operation-selection";

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    inputSummary: {
        textCount: number;
        imageCount: number;
        videoCount: number;
        videoFirstClipCount: number;
        audioCount: number;
        imageReferences?: Array<{ useAs?: "first_frame" | "last_frame" | "keyframe" | "reference_image" }>;
        videoReferences?: Array<{ useAs?: "reference_video" | "first_clip" | "source_video" }>;
        referenceErrors?: string[];
    };
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string) => void;
    onComposerToggle: () => void;
};

export function CanvasConfigNodePanel({ node, isRunning, inputSummary, onConfigChange, onGenerate, onComposerToggle }: CanvasConfigNodePanelProps) {
    const globalConfig = useEffectiveConfig();
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = node.metadata?.generationMode || "image";
    const storyWorkflow = node.metadata?.storyWorkflow === "character" || node.metadata?.storyWorkflow === "shot" ? node.metadata.storyWorkflow : null;
    const isStoryImageConfig = Boolean(storyWorkflow && mode === "image");
    const config = buildNodeConfig(globalConfig, node, mode);
    const modelSelectionState = resolveCanvasGenerationModelSelection(globalConfig, node.metadata, mode);
    const imageOperation = resolveCanvasImageOperation(node.metadata, { referenceCount: inputSummary.imageCount });
    const imageOperationOptions = resolveCanvasImageOperationOptions(
        config,
        inputSummary.imageCount > 0 ? inputSummary.imageCount : undefined,
    );
    const imageCapabilityError = canvasImageOperationCapabilityError(
        config,
        imageOperation,
        inputSummary.imageCount > 0 ? inputSummary.imageCount : undefined,
    );
    const imageSettingsContext = imageOperation ? resolveImageSettingsContext(config, imageOperation) : undefined;
    const videoRouteScope = resolveVideoGenerationSettingsScope(config, "text-to-video");
    const videoProvider = config.apiRelays.find((provider) => provider.id === videoRouteScope.providerId);
    const videoCapability = resolveCanvasVideoModelCapability(config, videoRouteScope.model, videoProvider);
    const videoOperationOptions = workflowVideoOperationOptionsForCapability(videoCapability);
    const videoReferences = inputSummary.imageReferences || Array.from({ length: inputSummary.imageCount }, () => ({ useAs: undefined }));
    const videoReferencePreview = resolveConfigNodeVideoReferencePreview({
        node,
        capability: videoCapability,
        references: videoReferences,
        videos: inputSummary.videoReferences,
        hasReferenceAudio: inputSummary.audioCount > 0,
        connectionErrors: inputSummary.referenceErrors,
    });
    const videoReferenceError = videoReferencePreview.error;
    const videoOperation = videoReferencePreview.operation;
    const count = Number.isInteger(Number(config.count)) && Number(config.count) > 0 ? Number(config.count) : 1;
    const credits =
        mode === "image"
            ? imageOperation
              ? imageCreditCost({ channelMode: config.channelMode, prices: publicSettings?.billing?.prices, mode: legacyCanvasImageGenerationType(imageOperation), outputSize: outputSizeForImageQuality(config.quality), count })
              : 0
            : requestCreditCost({ channelMode: config.channelMode, modelCosts: publicSettings?.modelChannel.modelCosts, model: config.model, count: 1 });
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const sectionStyle = { background: theme.node.fill, borderColor: theme.node.stroke };
    const hasAnyInput = Boolean(inputSummary.textCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const hasComposerContent = Boolean((node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim());
    const videoPromptError = videoPromptPreflightError(
        videoCapability,
        hasComposerContent || inputSummary.textCount > 0 ? "provided" : "",
        {
            imageCount: inputSummary.imageCount,
            videoCount: inputSummary.videoCount,
            audioCount: inputSummary.audioCount,
        },
    );
    const imagePrompt = node.metadata?.composerContent ?? node.metadata?.prompt ?? "";
    const imageOperationError = imageCapabilityError || canvasImageOperationInputError(imageOperation, {
        prompt: imagePrompt || (inputSummary.textCount > 0 ? "provided" : ""),
        referenceCount: inputSummary.imageCount,
    });
    const audioContractError = mode === "audio" ? audioGenerationPreflightError(config) : undefined;
    const canGenerate = mode === "video"
        ? !videoPromptError && !videoReferenceError
        : mode === "image"
          ? !imageOperationError
          : mode === "audio"
            ? !audioContractError && (hasComposerContent || inputSummary.textCount > 0)
            : hasComposerContent || hasAnyInput;
    const updateImageConfig = (key: keyof AiConfig, value: string) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value });
    const changeGenerationMode = (value: string | number) => {
        const nextMode = value as CanvasGenerationMode;
        const nextModelState = resolveCanvasGenerationModelSelection(globalConfig, undefined, nextMode);
        const nextModel = nextModelState.selection?.model || nextModelState.legacyModel;
        const modelPatch: Partial<CanvasNodeMetadata> = nextMode === "video"
            ? standaloneSeedance2VideoModelPatch(nextModelState.selection || nextModel)
            : {
                model: nextModel,
                modelProviderId: nextModelState.selection?.providerId,
                seedanceModel: undefined,
                videoGenerationSettings: undefined,
                videoGenerationScope: undefined,
                videoGenerationCapabilityId: undefined,
                videoWireFormat: undefined,
            };
        onConfigChange(node.id, { generationMode: nextMode, ...modelPatch });
    };

    return (
        <div
            className={`flex h-full w-full cursor-move flex-col gap-2.5 px-4 pb-4 pt-8 text-sm ${storyWorkflow ? "thin-scrollbar overflow-x-hidden overflow-y-auto" : "overflow-hidden"}`}
            style={{ color: theme.node.text }}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="shrink-0 text-sm font-semibold">生成配置</div>
                <div className="cursor-default" onMouseDown={(event) => event.stopPropagation()}>
                    <Segmented
                        size="small"
                        className="canvas-config-mode !rounded-md !p-0.5"
                        value={mode}
                        onChange={changeGenerationMode}
                        options={[
                            {
                                value: "image",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <ImageIcon className="size-3.5" />
                                        生图
                                    </span>
                                ),
                            },
                            {
                                value: "text",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <MessageSquare className="size-3.5" />
                                        文本
                                    </span>
                                ),
                            },
                            {
                                value: "video",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Video className="size-3.5" />
                                        视频
                                    </span>
                                ),
                            },
                            {
                                value: "audio",
                                label: (
                                    <span className="inline-flex items-center gap-1">
                                        <Music2 className="size-3.5" />
                                        音频
                                    </span>
                                ),
                            },
                        ]}
                    />
                </div>
            </div>

            <section className="rounded-xl border p-3" style={sectionStyle}>
                <SectionTitle label="输入素材" muted={theme.node.muted} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <InputChip label="提示词" value={`${inputSummary.textCount} 个`} style={chipStyle} />
                    <InputChip label="参考图" value={`${inputSummary.imageCount} 张`} style={chipStyle} />
                    <InputChip label="参考视频" value={`${inputSummary.videoCount} 个`} style={chipStyle} />
                    <InputChip label="参考音频" value={`${inputSummary.audioCount} 个`} style={chipStyle} />
                </div>
                <button type="button" className="mt-2 inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium" style={chipStyle} onMouseDown={(event) => event.stopPropagation()} onClick={onComposerToggle}>
                    <Settings2 className="size-3.5" />
                    组装提示词
                </button>
            </section>

            <section className="rounded-xl border p-3" style={sectionStyle} onMouseDown={(event) => event.stopPropagation()}>
                <SectionTitle label="模型" muted={theme.node.muted} />
                <ProviderModelPicker className="canvas-compact-control mt-2 h-10" config={config} value={modelSelectionState.selection} legacyValue={modelSelectionState.legacyModel} onChange={(selection) => onConfigChange(node.id, mode === "video" ? standaloneSeedance2VideoModelPatch(selection) : { model: selection.model, modelProviderId: selection.providerId })} capability={mode} onMissingConfig={() => openConfigDialog(true)} fullWidth />
            </section>

            {storyWorkflow ? <StoryConfigScopeNotice workflow={storyWorkflow} mode={mode} style={sectionStyle} /> : null}

            {mode === "image" ? (
                <section className="rounded-xl border p-3" style={sectionStyle} onMouseDown={(event) => event.stopPropagation()}>
                    <SectionTitle label={isStoryImageConfig ? "操作与独立生成参数" : "图片参数"} muted={theme.node.muted} />
                    <Select
                        className="canvas-compact-control mt-2 w-full"
                        aria-label="图片 operation"
                        placeholder="选择图片操作"
                        value={imageOperationOptions.some((option) => option.value === imageOperation) ? imageOperation : undefined}
                        options={imageOperationOptions}
                        notFoundContent={CANVAS_IMAGE_OPERATION_EMPTY_HINT}
                        popupMatchSelectWidth={false}
                        data-image-operation-state={imageOperation && !imageCapabilityError ? "resolved" : "unresolved"}
                        onChange={(value) => onConfigChange(node.id, resolveCanvasImageOperationChange(config, value))}
                    />
                    {imageOperation ? <div className="mt-2 grid grid-cols-2 gap-2">
                        <CanvasImageSettingsPopover
                            config={config}
                            operation={imageOperation}
                            placement="topLeft"
                            autoAdjustOverflow={false}
                            sections={["quality"]}
                            showTitle={false}
                            trigger={
                                <SettingTile label="清晰度" value={imageQualityLabel(config.quality, imageSettingsContext?.capability)} style={chipStyle} interactive />
                            }
                            onConfigChange={updateImageConfig}
                        />
                        <CanvasImageSettingsPopover
                            config={config}
                            operation={imageOperation}
                            placement="top"
                            autoAdjustOverflow={false}
                            sections={["size"]}
                            showTitle={false}
                            trigger={
                                <SettingTile label="尺寸" value={imageSizeLabel(config.size)} style={chipStyle} interactive />
                            }
                            onConfigChange={updateImageConfig}
                        />
                        <CanvasImageSettingsPopover
                            config={config}
                            operation={imageOperation}
                            placement="topRight"
                            autoAdjustOverflow={false}
                            sections={["count"]}
                            showTitle={false}
                            trigger={
                                <SettingTile label="张数" value={`${count} 张`} style={chipStyle} interactive />
                            }
                            onConfigChange={updateImageConfig}
                        />
                        <CanvasImageSettingsPopover
                            config={config}
                            operation={imageOperation}
                            placement="topRight"
                            autoAdjustOverflow={false}
                            sections={["advanced"]}
                            showTitle={false}
                            trigger={
                                <SettingTile
                                    label="高级"
                                    value={imageAdvancedSettingsLabel(readImageAdvancedSettings(config.imageAdvancedSettingsByScope, {
                                        providerId: config.apiRouting.image.providerId,
                                        model: config.apiRouting.image.model,
                                        operation: imageOperation,
                                    }))}
                                    style={chipStyle}
                                    interactive
                                />
                            }
                            onConfigChange={updateImageConfig}
                            onAdvancedSettingsChange={(settings, scope) => onConfigChange(node.id, { imageAdvancedSettings: settings, imageAdvancedScope: scope })}
                        />
                    </div> : (
                        <Button className="canvas-compact-control !mt-2 !h-9 !w-full !justify-center !rounded-lg !px-2" data-image-settings-disabled disabled>
                            选择图片操作后配置参数
                        </Button>
                    )}
                    {imageOperationError ? <div className="mt-2 rounded-lg border border-orange-500/40 px-2 py-1.5 text-[10px] leading-4 text-orange-400">{imageOperationError}</div> : null}
                </section>
            ) : mode === "video" ? (
                <section className="rounded-xl border p-3" style={sectionStyle} onMouseDown={(event) => event.stopPropagation()}>
                    <SectionTitle label="视频参数" muted={theme.node.muted} />
                    <Select
                        className="canvas-compact-control mt-2 w-full"
                        placeholder="选择视频操作"
                        value={videoOperation}
                        options={videoOperationOptions}
                        onChange={(operation) => onConfigChange(node.id, {
                            videoGenerationScope: {
                                providerId: videoRouteScope.providerId,
                                model: videoRouteScope.model,
                                operation,
                            },
                            videoGenerationSettings: undefined,
                            videoGenerationCapabilityId: undefined,
                            videoWireFormat: undefined,
                        })}
                    />
                    <div className="mt-2">
                        <SettingTile label="当前合同参数" value={videoOperation ? videoSettingsSummary(config, videoOperation) : "待选择视频操作"} style={chipStyle} />
                    </div>
                    {videoOperation ? (
                        <CanvasVideoSettingsPopover
                            config={config}
                            operation={videoOperation}
                            placement="topRight"
                            buttonClassName="canvas-compact-control !mt-2 !h-9 !w-full !justify-center !rounded-lg !px-2"
                            onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                            onGenerationSettingsChange={(settings, scope, capabilityId) => onConfigChange(node.id, { videoGenerationSettings: settings, videoGenerationScope: scope, videoGenerationCapabilityId: capabilityId })}
                        />
                    ) : (
                        <Button className="canvas-compact-control !mt-2 !h-9 !w-full !justify-center !rounded-lg !px-2" disabled>
                            选择视频操作后配置参数
                        </Button>
                    )}
                    {videoPromptError || videoReferenceError ? <div className="mt-2 rounded-lg border border-orange-500/40 px-2 py-1.5 text-[10px] leading-4 text-orange-400">{videoPromptError || videoReferenceError}</div> : null}
                </section>
            ) : mode === "audio" ? (
                <section className="rounded-xl border p-3" style={sectionStyle} onMouseDown={(event) => event.stopPropagation()}>
                    <SectionTitle label="音频参数" muted={theme.node.muted} />
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        <SettingTile label="声音" value={audioVoiceLabel(config.audioVoice)} style={chipStyle} />
                        <SettingTile label="格式" value={audioFormatLabel(config.audioFormat)} style={chipStyle} />
                        <SettingTile label="语速" value={audioSpeedLabel(config.audioSpeed)} style={chipStyle} />
                    </div>
                    <CanvasAudioSettingsPopover config={config} placement="topRight" buttonClassName="canvas-compact-control !mt-2 !h-9 !w-full !justify-center !rounded-lg !px-2" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                    {audioContractError ? <div role="alert" data-audio-generation-contract-state="blocked" className="mt-2 rounded-lg border border-red-500/40 px-2 py-1.5 text-[10px] leading-4 text-red-400">{audioContractError}</div> : null}
                </section>
            ) : null}

            <Button
                type="primary"
                className="mt-auto !h-9 !w-full !cursor-pointer !rounded-lg"
                disabled={isRunning || !canGenerate}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => onGenerate(node.id)}
            >
                <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1">
                        <CreditSymbol />
                        {credits.toLocaleString()}
                    </span>
                    {isRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                    <span>{storyWorkflow ? "独立生成" : "开始生成"}</span>
                </span>
            </Button>
        </div>
    );
}

function InputChip({ label, value, style }: { label: string; value: string; style: CSSProperties }) {
    return (
        <div className="inline-flex h-8 min-w-0 items-center justify-between gap-1 rounded-md border px-2 text-[11px]" style={style}>
            <span className="truncate opacity-70">{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function SectionTitle({ label, muted }: { label: string; muted: string }) {
    return (
        <div className="text-xs font-medium" style={{ color: muted }}>
            {label}
        </div>
    );
}

function StoryConfigScopeNotice({ workflow, mode, style }: { workflow: "character" | "shot"; mode: CanvasGenerationMode; style: CSSProperties }) {
    if (mode !== "image") {
        const currentModeLabel = mode === "text" ? "文本" : mode === "video" ? "视频" : "音频";
        return (
            <aside aria-label="故事快捷生成参数范围" className="rounded-lg border px-3 py-2 text-[10px] leading-4" style={style} data-canvas-no-drag>
                <div className="text-[11px] font-semibold">故事快捷生成</div>
                <div className="mt-0.5 opacity-85">故事快捷生成需要“生图”模式；当前“{currentModeLabel}”模式仅用于 Config 独立生成。</div>
            </aside>
        );
    }

    return (
        <aside aria-label="故事快捷生成参数范围" className="rounded-lg border px-3 py-2 text-[10px] leading-4" style={style} data-canvas-no-drag>
            <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[11px] font-semibold">故事快捷生成</span>
                <span className="opacity-70">连接到对应故事导演时，快捷生成使用本节点 Provider / 模型</span>
            </div>
            <div className="mt-0.5 opacity-85">
                {workflow === "character"
                    ? "每个角色 1 张 · 固定 16:9 · 清晰度跟随故事导演 · 图片操作跟随本 Config"
                    : "逐镜模式每镜 1 张 · 九宫格模式每 9 镜 1 张 · 画幅/清晰度跟随故事导演 · 图片操作跟随本 Config"}
            </div>
            <div className="opacity-70">高级参数在当前 Provider / 模型与实际生成/编辑操作完全匹配时，也用于故事快捷生成。</div>
            <div className="mt-0.5 border-t pt-0.5 opacity-85" style={{ borderColor: style.borderColor }}>
                <span className="font-semibold">参数范围：</span>
                图片操作同时用于故事快捷生成；尺寸、清晰度、张数及“独立生成”按钮只影响本 Config 独立生成。
            </div>
        </aside>
    );
}

function SettingTile({ label, value, style, interactive = false }: { label: string; value: string; style: CSSProperties; interactive?: boolean }) {
    return (
        <div
            className={`relative min-w-0 overflow-hidden rounded-lg border px-2.5 py-2.5 transition ${
                interactive ? "cursor-pointer shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.08)] group-focus-visible:-translate-y-0.5" : ""
            }`}
            style={style}
        >
            {interactive ? <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-current opacity-55" /> : null}
            <div className="flex min-w-0 items-center justify-between gap-1.5">
                <div className="truncate text-[10px] opacity-60">{label}</div>
                {interactive ? (
                    <span
                        className="grid size-6 shrink-0 place-items-center rounded-full border opacity-85 shadow-[0_6px_14px_rgba(0,0,0,0.14)] transition group-hover:scale-105 group-hover:opacity-100"
                        style={{ background: "rgba(255,255,255,0.08)", borderColor: "currentColor" }}
                    >
                        <Settings2 className="size-3.5" />
                    </span>
                ) : null}
            </div>
            <div className="mt-1 truncate text-xs font-semibold">{value || "-"}</div>
        </div>
    );
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
    const nodeModel = replayableCanvasGenerationModel(globalConfig, node.metadata, mode);
    const providerModelState = resolveCanvasGenerationModelSelection(globalConfig, node.metadata, mode);
    const videoScope = node.metadata?.videoGenerationScope;
    return applyExplicitCanvasGenerationModel({
        ...globalConfig,
        apiBoardRouting: videoScope?.providerId && videoScope.model
            ? {
                ...globalConfig.apiBoardRouting,
                videoGeneration: { mode: "custom", providerId: videoScope.providerId, model: videoScope.model },
            }
            : globalConfig.apiBoardRouting,
        imageAdvancedSettingsByScope: node.metadata?.imageAdvancedSettings && node.metadata.imageAdvancedScope
            ? writeImageAdvancedSettings(globalConfig.imageAdvancedSettingsByScope, node.metadata.imageAdvancedScope, node.metadata.imageAdvancedSettings)
            : globalConfig.imageAdvancedSettingsByScope,
        videoGenerationSettingsByScope: node.metadata?.videoGenerationSettings && node.metadata.videoGenerationScope
            ? writeVideoGenerationSettings(globalConfig.videoGenerationSettingsByScope, node.metadata.videoGenerationScope, node.metadata.videoGenerationSettings)
            : globalConfig.videoGenerationSettingsByScope,
        model: nodeModel || defaultModel || (mode === "audio" ? defaultConfig.audioModel : globalConfig.model || defaultConfig.model),
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    }, mode, providerModelState.selection || nodeModel);
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
