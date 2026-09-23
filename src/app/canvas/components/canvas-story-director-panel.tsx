"use client";

import { CheckCircle2, Clapperboard, FileText, Image as ImageIcon, Link2, ListChecks, LoaderCircle, Play, WandSparkles, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Select } from "antd";

import { ModelIcon } from "@/components/model-icon";
import { resolveImageSettingsContext } from "@/components/image-settings-panel";
import { resolveImageModelCapability } from "@/services/api/image-model-capabilities";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "../types";
import {
    resolveStoryDirectorImageModelPresentation,
    resolveStoryDirectorTextModelPresentation,
    storyDirectorEditableText,
    storyDirectorImageModelPatchForValue,
    storyDirectorTextModelPatchForValue,
    STORY_DIRECTOR_IMAGE_MODEL_INHERIT,
    STORY_DIRECTOR_TEXT_MODEL_INHERIT,
    type StoryDirectorTextModelSelection,
    type StoryDirectorTextModelSourceOption,
    type StoryDirectorTextModelOption,
} from "../utils/story-director-text-model";
import { wiredStoryDirectorModels } from "../utils/story-director-wired-models";
import { normalizeStoryImageQuality, storyDirectorQualityOptions, storyImageQualityPatch } from "../utils/story-image-quality";
import { resolveStoryWorkflowImageOperation } from "../utils/canvas-image-operation";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { canvasSelectOverlayProps } from "../utils/canvas-overlay-popup";

type CanvasStoryDirectorPanelProps = {
    node: CanvasNodeData;
    embedded?: boolean;
    storyDirectorInheritedTextModel?: StoryDirectorTextModelSelection | null;
    storyDirectorTextModels?: readonly StoryDirectorTextModelSourceOption[];
    storyDirectorInheritedImageModel?: StoryDirectorTextModelSelection | null;
    storyDirectorImageModels?: readonly StoryDirectorTextModelSourceOption[];
    config?: AiConfig;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onAnalyzeStory: (node: CanvasNodeData) => void;
    onGenerateCharacters: (node: CanvasNodeData) => void;
    onGenerateShots: (node: CanvasNodeData) => void;
    onRunAll: (node: CanvasNodeData) => void;
    onCreateCharacterConfig: (node: CanvasNodeData) => void;
    onCreateShotConfig: (node: CanvasNodeData) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
};

const aspectOptions = ["16:9", "9:16", "1:1"].map((value) => ({ value, label: value }));
const stylePresetValues = ["电影感写实", "国风仙侠", "暗黑奇幻", "赛博朋克", "日系动画", "美式漫画", "水彩绘本", "黏土动画", "像素游戏", "黑白分镜", "清凉写真"];
const customStyleValue = "__custom_style__";
const styleOptions = [...stylePresetValues.map((value) => ({ value, label: value })), { value: customStyleValue, label: "自定义" }];
const storyboardModeOptions = [
    { value: "single", label: "逐镜生成" },
    { value: "grid9", label: "9宫格分镜" },
];

type StorySelectKey = "textModel" | "headerImageModel" | "imageModel" | "style" | "mode" | "aspect" | "quality";

export function CanvasStoryDirectorPanel({ node, embedded = false, storyDirectorInheritedTextModel = null, storyDirectorTextModels: storyDirectorTextModelsProp = [], storyDirectorInheritedImageModel = null, storyDirectorImageModels: storyDirectorImageModelsProp = [], config, onConfigChange, onAnalyzeStory, onGenerateCharacters, onGenerateShots, onRunAll, onCreateCharacterConfig, onCreateShotConfig, onImageSettingsOpenChange }: CanvasStoryDirectorPanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [openSelect, setOpenSelect] = useState<StorySelectKey | null>(null);
    const storyDirectorTextModels = storyDirectorTextModelsProp.length
      ? storyDirectorTextModelsProp
      : wiredStoryDirectorModels("text");
    const storyDirectorImageModels = storyDirectorImageModelsProp.length
      ? storyDirectorImageModelsProp
      : wiredStoryDirectorModels("image");
    const storyText = storyDirectorEditableText(node.metadata);
    const storyStyle = node.metadata?.storyStyle || "电影感写实";
    const storyShotCount = node.metadata?.storyShotCount || 5;
    const storyAspectRatio = node.metadata?.storyAspectRatio || "16:9";
    const storyboardMode = node.metadata?.storyStoryboardMode || "single";
    const imageQuality = normalizeStoryImageQuality(
        node.metadata?.storyImageQuality,
        node.metadata?.storyImageQualityExplicit === true,
    );
    const characters = node.metadata?.storyCharacters || [];
    const scenes = node.metadata?.storyScenes || [];
    const shots = node.metadata?.storyShots || [];
    const referenceCount = node.metadata?.storySourceImageNodeIds?.length || (node.metadata?.storySourceImageNodeId ? 1 : 0);
    const characterInputCount = node.metadata?.storyCharacterSourceImageNodeIds?.length || 0;
    const sceneInputCount = node.metadata?.storySceneSourceImageNodeIds?.length || 0;
    const propInputCount = node.metadata?.storyPropSourceImageNodeIds?.length || 0;
    const importantCharacters = characters.filter((character) => character.importance === "main" || character.importance === "supporting");
    const missingCharacterCount = importantCharacters.filter((character) => !character.referenceNodeId && !character.assetLocked).length;
    const isAnalyzing = node.metadata?.storyAnalysisStatus === "loading";
    const isGenerating = node.metadata?.storyGenerationStatus === "loading";
    const hasError = node.metadata?.storyAnalysisStatus === "error" || node.metadata?.storyGenerationStatus === "error" || node.metadata?.status === "error";
    const hasAnalysis = characters.length > 0 || shots.length > 0;
    const controlStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const isCustomStyle = node.metadata?.storyStyleMode === "custom";
    const selectedStylePreset = isCustomStyle ? customStyleValue : stylePresetValues.includes(storyStyle) ? storyStyle : "电影感写实";
    const customStyle = node.metadata?.storyCustomStyle ?? (isCustomStyle ? storyStyle : "");
    const storyDirectorTextModelPresentation = resolveStoryDirectorTextModelPresentation(
        node.metadata,
        storyDirectorInheritedTextModel,
        storyDirectorTextModels,
    );
    const storyDirectorImageModelPresentation = resolveStoryDirectorImageModelPresentation(
        node.metadata,
        storyDirectorInheritedImageModel,
        storyDirectorImageModels,
    );
    const selectedImageOption = storyDirectorImageModelPresentation.options.find(
        (option) => option.value === storyDirectorImageModelPresentation.selectedValue,
    );
    const selectedImageModel = selectedImageOption?.model || storyDirectorInheritedImageModel?.model || "";
    const selectedImageProviderId = selectedImageOption?.providerId || storyDirectorInheritedImageModel?.providerId || "";
    const selectedImageCapability = config
        ? resolveImageModelCapability({
            model: selectedImageModel,
            operation: "generate",
            provider: config.apiRelays.find((relay) => relay.id === selectedImageProviderId),
        })
        : null;
    const qualityOptions = storyDirectorQualityOptions(selectedImageCapability);
    const overlaySelectProps = canvasSelectOverlayProps();
    const closeSelect = useCallback(() => {
        setOpenSelect(null);
        window.setTimeout(() => {
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement) activeElement.blur();
        }, 0);
    }, []);
    const selectOpenProps = useCallback(
        (key: StorySelectKey) => ({
            open: openSelect === key,
            onOpenChange: (open: boolean) => setOpenSelect(open ? key : null),
            ...overlaySelectProps,
        }),
        [openSelect, overlaySelectProps],
    );

    return (
        <div
            ref={panelRef}
            data-story-director-panel
            data-canvas-wheel-scroll="true"
            className={`${embedded ? "flex min-h-0 min-w-0 w-full flex-col" : "flex w-[560px] flex-col"} rounded-2xl border px-4 pb-6 pt-4 shadow-2xl backdrop-blur`}
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={embedded ? undefined : (event) => event.stopPropagation()}
            onPointerDown={embedded ? undefined : (event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className={`${embedded ? "mb-3 flex flex-col gap-3" : "mb-3 flex items-start justify-between gap-3"}`}>
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                        <Clapperboard className="size-4 shrink-0" />
                        <span className="min-w-0">故事导演</span>
                    </div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        分析故事，生成角色资产，再按镜头批量生成分镜
                    </div>
                </div>
                <div className={`${embedded ? "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end" : "flex shrink-0 items-center"} gap-2`} data-canvas-no-drag>
                    <label className={`${embedded ? "min-w-0" : "min-w-[148px]"} flex flex-col gap-0.5`}>
                        <span className="text-[10px] leading-none opacity-55">文本模型</span>
                        <StoryDirectorTextModelSelect
                            value={storyDirectorTextModelPresentation.selectedValue}
                            options={storyDirectorTextModelPresentation.options}
                            title={storyDirectorTextModelPresentation.title}
                            fullWidth={embedded}
                            selectProps={selectOpenProps("textModel")}
                            onChange={(value) => {
                                closeSelect();
                                const patch = storyDirectorTextModelPatchForValue(
                                    value,
                                    storyDirectorTextModels,
                                );
                                if (patch) onConfigChange(node.id, patch);
                            }}
                        />
                    </label>
                    <label className={`${embedded ? "min-w-0" : "min-w-[148px]"} flex flex-col gap-0.5`}>
                        <span className="text-[10px] leading-none opacity-55">图片模型</span>
                        <StoryDirectorTextModelSelect
                            value={storyDirectorImageModelPresentation.selectedValue}
                            options={storyDirectorImageModelPresentation.options}
                            title={storyDirectorImageModelPresentation.title}
                            placeholder="选择图片模型"
                            fullWidth={embedded}
                            selectProps={selectOpenProps("headerImageModel")}
                            onChange={(value) => {
                                closeSelect();
                                const patch = storyDirectorImageModelPatchForValue(
                                    value,
                                    storyDirectorImageModels,
                                );
                                if (patch) onConfigChange(node.id, patch);
                            }}
                        />
                    </label>
                    <StatusPill analyzing={isAnalyzing} generating={isGenerating} done={hasAnalysis} error={hasError} />
                </div>
            </div>

            <div className="shrink-0" data-canvas-no-drag>
                <textarea
                    className="thin-scrollbar w-full resize-y overflow-y-auto rounded-xl border p-2.5 outline-none focus:ring-1 focus:ring-amber-500/50"
                    style={{ ...controlStyle, height: 128, minHeight: 128, overflowY: "auto" }}
                    value={storyText}
                    placeholder="粘贴小说、章节或剧情梗概。可包含角色、场景、对白和画风要求。"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(event) => onConfigChange(node.id, { storyText: event.target.value, content: event.target.value, errorDetails: undefined })}
                />
            </div>

            <div className="mt-3 flex flex-col gap-2" data-canvas-no-drag>
                <DirectorAction
                    primary
                    icon={isAnalyzing || isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                    title={isAnalyzing ? "1/3 故事分析中…" : isGenerating ? "3/3 批量分镜生成中…" : "一键全流程"}
                    description={
                        isAnalyzing
                            ? `正在深度提炼角色设定与 ${storyShotCount} 组镜头脚本`
                            : isGenerating
                            ? "正在逐镜高精渲染画面并自动对焦"
                            : !storyText.trim()
                            ? "请先在上方输入故事内容"
                            : `分析故事 → 核心角色 → ${storyShotCount} 张分镜图`
                    }
                    disabled={!storyText.trim() || isAnalyzing || isGenerating}
                    onClick={() => {
                        onConfigChange(node.id, { errorDetails: undefined });
                        onRunAll(node);
                    }}
                />
                <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
                <DirectorAction
                    icon={isAnalyzing ? <LoaderCircle className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    title={isAnalyzing ? "正在分析…" : "分析故事"}
                    description={!storyText.trim() ? "需先输入故事" : "只拆角色 / 场景 / 分镜，不生图"}
                    disabled={!storyText.trim() || isAnalyzing || isGenerating}
                    onClick={() => {
                        onConfigChange(node.id, { errorDetails: undefined });
                        onAnalyzeStory(node);
                    }}
                />
                <DirectorAction
                    icon={<ImageIcon className="size-4" />}
                    title="补齐缺失角色图"
                    description={hasAnalysis ? (missingCharacterCount ? `还缺 ${missingCharacterCount} 张角色图` : "角色图已齐全") : "需先分析故事"}
                    disabled={!hasAnalysis || !missingCharacterCount || isAnalyzing || isGenerating}
                    onClick={() => {
                        onConfigChange(node.id, { errorDetails: undefined });
                        onGenerateCharacters(node);
                    }}
                />
                <DirectorAction
                    icon={isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <ListChecks className="size-4" />}
                    title={storyboardMode === "grid9" ? "生成9宫格" : "生成分镜图"}
                    description={!shots.length ? "需先分析故事" : storyboardMode === "grid9" ? "每 9 镜一张图" : `按镜头各生成一张 (${shots.length} 镜)`}
                    disabled={!shots.length || isAnalyzing || isGenerating}
                    onClick={() => {
                        onConfigChange(node.id, { errorDetails: undefined });
                        onGenerateShots(node);
                    }}
                />
                </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2" data-canvas-no-drag>
                <button
                    type="button"
                    className="flex h-9 items-center justify-center rounded-xl border border-stone-500/20 bg-stone-500/10 px-3 text-xs font-medium text-current transition hover:bg-stone-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isAnalyzing || isGenerating}
                    onClick={() => onCreateCharacterConfig(node)}
                >
                    添加独立角色配置
                </button>
                <button
                    type="button"
                    className="flex h-9 items-center justify-center rounded-xl border border-stone-500/20 bg-stone-500/10 px-3 text-xs font-medium text-current transition hover:bg-stone-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isAnalyzing || isGenerating}
                    onClick={() => onCreateShotConfig(node)}
                >
                    添加独立分镜配置
                </button>
            </div>

            <div data-story-director-config-area className="mt-auto shrink-0 pt-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-canvas-no-drag>
                    <LabeledControl label="画风预设">
                        <Select
                            className="!w-full"
                            value={selectedStylePreset}
                            options={styleOptions}
                            placeholder="预设"
                            popupMatchSelectWidth={false}
                            dropdownStyle={{ minWidth: 160 }}
                            {...selectOpenProps("style")}
                            onChange={(value) => {
                                closeSelect();
                                if (value === customStyleValue) {
                                    const nextCustomStyle = customStyle || "";
                                    onConfigChange(node.id, { storyStyleMode: "custom", storyCustomStyle: nextCustomStyle, storyStyle: nextCustomStyle || "自定义画风" });
                                    return;
                                }
                                onConfigChange(node.id, { storyStyleMode: "preset", storyCustomStyle: "", storyStyle: value });
                            }}
                        />
                    </LabeledControl>
                    <LabeledControl label="模式">
                        <Select
                            className="!w-full"
                            value={storyboardMode}
                            options={storyboardModeOptions}
                            {...selectOpenProps("mode")}
                            onChange={(value) => {
                                closeSelect();
                                const nextCount = value === "grid9" ? nearestGrid9ShotCount(storyShotCount) : storyShotCount;
                                onConfigChange(node.id, { storyStoryboardMode: value as "single" | "grid9", storyShotCount: nextCount });
                            }}
                        />
                    </LabeledControl>
                    <LabeledControl label="镜头数">
                        <input
                            className="w-full rounded-lg border px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-500/50"
                            style={controlStyle}
                            type="number"
                            min={storyboardMode === "grid9" ? 9 : 1}
                            max={storyboardMode === "grid9" ? 99 : 100}
                            step={storyboardMode === "grid9" ? 9 : 1}
                            value={storyShotCount}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onChange={(event) => {
                                const raw = Math.max(1, Math.min(100, Number(event.target.value) || 1));
                                onConfigChange(node.id, { storyShotCount: storyboardMode === "grid9" ? nearestGrid9ShotCount(raw) : raw });
                            }}
                        />
                    </LabeledControl>
                    <LabeledControl label="画幅">
                        <Select
                            className="!w-full"
                            value={storyAspectRatio}
                            options={aspectOptions}
                            {...selectOpenProps("aspect")}
                            onChange={(value) => {
                                closeSelect();
                                onConfigChange(node.id, { storyAspectRatio: value });
                            }}
                        />
                    </LabeledControl>
                    {qualityOptions.length ? (
                    <LabeledControl label="清晰度">
                        <Select
                            className="!w-full"
                            value={imageQuality || undefined}
                            options={qualityOptions}
                            placeholder="由模型决定"
                            popupMatchSelectWidth={false}
                            dropdownStyle={{ minWidth: 88 }}
                            {...selectOpenProps("quality")}
                            onChange={(value) => {
                                closeSelect();
                                onConfigChange(node.id, storyImageQualityPatch(value));
                            }}
                        />
                    </LabeledControl>
                    ) : null}
                </div>
                {isCustomStyle ? (
                    <div className="mt-2" data-canvas-no-drag>
                        <LabeledControl label="自定义画风">
                            <input
                                className="w-full rounded-lg border px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-amber-500/50"
                                style={controlStyle}
                                value={customStyle}
                                placeholder="输入自定义画风，生成角色图和分镜图时会使用这里的画风"
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onChange={(event) => onConfigChange(node.id, { storyStyleMode: "custom", storyCustomStyle: event.target.value, storyStyle: event.target.value })}
                            />
                        </LabeledControl>
                    </div>
                ) : null}

                <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium" style={{ color: theme.node.muted }}>
                        <ImageIcon className="size-3.5" />
                        图片生成模型与参数
                    </div>
                    <LabeledControl label="图片模型">
                        <StoryDirectorTextModelSelect
                            value={storyDirectorImageModelPresentation.selectedValue}
                            options={storyDirectorImageModelPresentation.options}
                            title={storyDirectorImageModelPresentation.title}
                            placeholder="选择图片模型"
                            fullWidth
                            selectProps={selectOpenProps("imageModel")}
                            onChange={(value) => {
                                closeSelect();
                                const patch = storyDirectorImageModelPatchForValue(value, storyDirectorImageModels);
                                if (patch) onConfigChange(node.id, patch);
                            }}
                        />
                    </LabeledControl>
                    {config && storyDirectorImageModelPresentation.selectedValue && storyDirectorImageModelPresentation.selectedValue !== "__inherit_story_director_image_model__" ? (
                        <LabeledControl label="图片参数">
                            <CanvasImageSettingsPopover
                                config={config}
                                operation={config ? (() => {
                                    try {
                                        const { capability } = resolveImageSettingsContext(config, "generate");
                                        return resolveStoryWorkflowImageOperation({ generate: capability });
                                    } catch {
                                        return "generate";
                                    }
                                })() : "generate"}
                                placement="topLeft"
                                buttonClassName="!h-auto !min-h-9 !w-full !justify-start !rounded-lg !px-3 !py-1.5"
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
                                onMissingConfig={() => {}}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </LabeledControl>
                    ) : null}
                </div>

                {selectedImageCapability?.advancedFields?.loras?.state === "supported" ? (
                    <StoryDirectorLoraSection
                        nodeId={node.id}
                        advancedSettings={(node as any).metadata?.imageAdvancedSettings || (node as any).imageAdvancedSettings}
                        theme={theme}
                        onConfigChange={onConfigChange}
                    />
                ) : null}

                <div className="mt-3 grid grid-cols-3 gap-2">
                    <SummaryTile label="角色" value={`${importantCharacters.length} 个 / 缺 ${missingCharacterCount}`} />
                    <SummaryTile label="场景" value={`${scenes.length} 个`} />
                    <SummaryTile label="镜头" value={`${shots.length} 个`} />
                </div>
                <section className="mt-3 rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                    <SectionHeader icon={<Link2 className="size-3.5" />} label="上游输入" />
                    <div className="mt-2 grid grid-cols-4 gap-2">
                        <SummaryTile label="故事参考" value={`${referenceCount} 张`} />
                        <SummaryTile label="角色参考" value={`${characterInputCount} 张`} />
                        <SummaryTile label="场景参考" value={`${sceneInputCount} 张`} />
                        <SummaryTile label="其它参考" value={`${propInputCount} 张`} />
                    </div>
                </section>
                {!hasAnalysis ? <div className="mt-2 text-xs leading-5 opacity-55">角色/场景/镜头会在“分析故事”成功后回填；没有上游参考图也可以直接按文案生成。</div> : null}

                {node.metadata?.errorDetails && !node.metadata.errorDetails.includes("无法恢复") && !node.metadata.errorDetails.includes("本地缓存") ? (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
                        <span className="flex-1">{node.metadata.errorDetails}</span>
                        <button
                            type="button"
                            className="ml-2 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-red-300 hover:bg-red-500/20"
                            onClick={() => onConfigChange(node.id, { errorDetails: undefined })}
                            title="关闭提示"
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>
                ) : null}

                {node.metadata?.storyAnalysisRenderedText && node.metadata.storyAnalysisRenderedText.trim() !== storyText.trim() ? (
                    <section className="mt-3 rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        <SectionHeader icon={<FileText className="size-3.5" />} label="故事内容发展" />
                        <pre className="thin-scrollbar mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-5 opacity-80">{node.metadata.storyAnalysisRenderedText}</pre>
                    </section>
                ) : null}

                {characters.length ? (
                    <section className="mt-3 rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        <SectionHeader icon={<WandSparkles className="size-3.5" />} label="角色资产" />
                        <div className="mt-2 space-y-1.5">
                            {characters.map((character) => (
                                <ResultRow key={character.id} title={character.name} meta={`${character.importance} · ${character.assetSource === "upstream" ? "上游已绑定" : character.assetSource === "generated" ? "已生成" : character.status}`} done={character.status === "ready" || character.status === "locked"} loading={character.status === "generating"} />
                            ))}
                        </div>
                    </section>
                ) : null}

                {shots.length ? (
                    <section className="mt-3 rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        <SectionHeader icon={<ListChecks className="size-3.5" />} label="分镜队列" />
                        <div className="mt-2 space-y-1.5">
                            {shots.map((shot) => (
                                <ResultRow key={shot.id} title={`${shot.index}. ${shot.title}`} meta={`${shot.appearingCharacterIds?.length || 0} 角色 · ${shot.status || "待生成"}`} done={shot.status === "done"} loading={shot.status === "generating"} />
                            ))}
                        </div>
                    </section>
                ) : null}
                <div aria-hidden className="h-4 shrink-0" />
            </div>
        </div>
    );
}

function StoryDirectorTextModelSelect({
    value,
    options,
    title,
    placeholder = "选择模型",
    fullWidth = false,
    selectProps,
    onChange,
}: {
    value: string;
    options: StoryDirectorTextModelOption[];
    title: string;
    placeholder?: string;
    fullWidth?: boolean;
    selectProps: Record<string, unknown>;
    onChange: (value: string) => void;
}) {
    const selectOptions = groupStoryDirectorModelOptions(options);
    return (
        <Select
            size="small"
            className={fullWidth ? "!w-full" : "!h-auto !w-[176px] min-h-8"}
            value={value || undefined}
            options={selectOptions}
            placeholder={placeholder}
            title={title}
            optionLabelProp="label"
            notFoundContent={<span className="text-xs">没有可用模型。去「设置」启用中转并填密钥。</span>}
            popupMatchSelectWidth={false}
            listHeight={360}
            styles={{ popup: { root: { minWidth: 280, zIndex: 4000 } } }}
            optionRender={(ori) => {
                const data = ori.data as unknown as StoryDirectorTextModelOption | undefined;
                if (!data?.value) return ori.label;
                return (
                    <StoryDirectorModelOptionLabel
                        model={data.model}
                        providerName={data.providerName}
                        label={data.label || data.model || String(ori.label ?? "")}
                        inherit={isStoryDirectorInheritValue(data.value)}
                    />
                );
            }}
            {...selectProps}
            onChange={onChange}
        />
    );
}

function isStoryDirectorInheritValue(value: string) {
    return value === STORY_DIRECTOR_TEXT_MODEL_INHERIT || value === STORY_DIRECTOR_IMAGE_MODEL_INHERIT;
}

function groupStoryDirectorModelOptions(options: StoryDirectorTextModelOption[]) {
    const specials: StoryDirectorTextModelOption[] = [];
    const rest: StoryDirectorTextModelOption[] = [];
    for (const option of options) {
        if (isStoryDirectorInheritValue(option.value) || option.value.startsWith("__unresolved_story_director_text_model__")) {
            specials.push(option);
        } else {
            rest.push(option);
        }
    }
    const groups = new Map<string, StoryDirectorTextModelOption[]>();
    for (const option of rest) {
        const key = option.providerName || option.providerId || "其它模型";
        const list = groups.get(key) || [];
        list.push(option);
        groups.set(key, list);
    }
    return [
        ...specials.map((option) => ({
            ...option,
            label: (
                <StoryDirectorModelOptionLabel
                    model={option.model}
                    providerName={option.providerName}
                    label={option.label}
                    inherit={isStoryDirectorInheritValue(option.value)}
                />
            ),
        })),
        ...[...groups.entries()].map(([groupLabel, list]) => ({
            label: groupLabel,
            options: list.map((option) => ({
                ...option,
                label: (
                    <StoryDirectorModelOptionLabel
                        model={option.model}
                        providerName={option.providerName}
                        label={option.model || option.label}
                    />
                ),
            })),
        })),
    ];
}

function StoryDirectorModelOptionLabel({
    model,
    providerName,
    label,
    inherit = false,
}: {
    model?: string;
    providerName?: string;
    label: string;
    inherit?: boolean;
}) {
    const name = model || label;
    const vendor = String(providerName || "").trim();
    return (
        <span className="flex min-w-0 items-center gap-1.5">
            {model ? <ModelIcon model={model} className="size-3.5 shrink-0" /> : null}
            <span className="min-w-0 truncate text-[12px] font-medium" title={vendor ? `${vendor} · ${name}` : name}>
                {vendor ? `${vendor} · ${name}` : name}
            </span>
        </span>
    );
}

function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block min-w-0">
            <span className="mb-1 block text-[11px] opacity-55">{label}</span>
            {children}
        </label>
    );
}

function nearestGrid9ShotCount(value: number) {
    return Math.max(9, Math.min(99, Math.round((Number(value) || 9) / 9) * 9));
}

function DirectorAction({ icon, title, description, disabled, onClick, primary = false }: { icon: ReactNode; title: string; description: string; disabled?: boolean; onClick: () => void; primary?: boolean }) {
    return (
        <button
            type="button"
            className={`flex h-auto min-h-[72px] w-full justify-start rounded-xl px-3 py-2.5 text-left border transition ${
                primary
                    ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-600/50 shadow-sm"
                    : "bg-stone-500/10 hover:bg-stone-500/20 text-current border-stone-500/20"
            } ${disabled ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
            disabled={disabled}
            onClick={onClick}
        >
            <span className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 shrink-0">{icon}</span>
                <span className="min-w-0">
                    <span className="block text-xs font-semibold">{title}</span>
                    <span className="mt-1 block whitespace-normal text-[11px] leading-4 opacity-80">{description}</span>
                </span>
            </span>
        </button>
    );
}

function StatusPill({ analyzing, generating, done, error }: { analyzing: boolean; generating: boolean; done: boolean; error: boolean }) {
    if (analyzing || generating) {
        return (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                <LoaderCircle className="size-3.5 animate-spin" />
                {analyzing ? "分析中" : "生图中"}
            </span>
        );
    }
    if (error) return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-400/50 px-2.5 py-1 text-xs text-red-200">失败</span>;
    if (done) {
        return (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                <CheckCircle2 className="size-3.5" />
                已分析
            </span>
        );
    }
    return <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs opacity-70">待分析</span>;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-white/10 px-3 py-2">
            <div className="text-[11px] opacity-55">{label}</div>
            <div className="mt-1 text-sm font-semibold">{value}</div>
        </div>
    );
}

function SectionHeader({ icon, label }: { icon: ReactNode; label: string }) {
    return (
        <div className="flex items-center gap-1.5 text-xs font-semibold opacity-75">
            {icon}
            {label}
        </div>
    );
}

function ResultRow({ title, meta, done, loading }: { title: string; meta: string; done?: boolean; loading?: boolean }) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-xs">
            <span className="min-w-0 truncate">{title}</span>
            <span className="inline-flex shrink-0 items-center gap-1 opacity-65">
                {loading ? <LoaderCircle className="size-3 animate-spin" /> : done ? <CheckCircle2 className="size-3" /> : null}
                {meta}
            </span>
        </div>
    );
}

function StoryDirectorLoraSection({
    nodeId,
    advancedSettings,
    theme,
    onConfigChange,
}: {
    nodeId: string;
    advancedSettings: any;
    theme: CanvasTheme;
    onConfigChange: (nodeId: string, patch: Record<string, any>) => void;
}) {
    const [input, setInput] = useState("");
    const loras = (advancedSettings?.loras || []) as any[];

    const handleAdd = () => {
        const text = input.trim();
        if (!text) return;
        const newLora = {
            resource: text,
            resourceKind: text.startsWith("urn:air:") ? "air" : /^\d+$/.test(text) ? "versionId" : "modelId",
            weight: 1.0,
            resolvedAir: text.startsWith("urn:air:") ? text : undefined,
            modelName: text,
        };
        const nextLoras = [...loras, newLora];
        onConfigChange(nodeId, {
            imageAdvancedSettings: {
                ...(advancedSettings || {}),
                loras: nextLoras,
            },
        });
        setInput("");
    };

    const handleRemove = (index: number) => {
        const nextLoras = loras.filter((_, i) => i !== index);
        onConfigChange(nodeId, {
            imageAdvancedSettings: {
                ...(advancedSettings || {}),
                loras: nextLoras,
            },
        });
    };

    const handleWeightChange = (index: number, weight: number) => {
        const nextLoras = loras.map((item, i) => (i === index ? { ...item, weight } : item));
        onConfigChange(nodeId, {
            imageAdvancedSettings: {
                ...(advancedSettings || {}),
                loras: nextLoras,
            },
        });
    };

    const [collapsed, setCollapsed] = useState(loras.length === 0);

    return (
        <div className="mt-2.5 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setCollapsed(!collapsed)}
            >
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] opacity-60">{collapsed ? "▶" : "▼"}</span>
                    <span className="text-[11px] font-medium opacity-85">LoRA 资源挂载</span>
                </div>
                <span className="text-[10px] opacity-55">{loras.length > 0 ? `已挂载 ${loras.length} 个` : "展开添加"}</span>
            </div>

            {!collapsed ? (
                <div className="mt-2">
                    <div className="flex items-center gap-1.5 nodrag nopan" onKeyDown={(e) => e.stopPropagation()}>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="输入 LoRA 名称 / AIR / 版本ID / 直链"
                            className="flex-1 rounded-lg border bg-transparent px-2.5 py-1 text-xs outline-none focus:border-blue-500"
                            style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") handleAdd();
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleAdd}
                            className="rounded-lg px-2.5 py-1 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
                        >
                            + 添加
                        </button>
                    </div>

                    {loras.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                            {loras.map((lora, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between gap-2 rounded-lg border p-1.5 text-xs nodrag nopan"
                                    style={{ borderColor: theme.node.stroke, background: "rgba(0,0,0,0.03)" }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                >
                                    <span className="truncate flex-1 font-mono text-[11px]" title={lora.resource || lora.modelName}>
                                        {lora.modelName || lora.resource}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] opacity-60">权重:</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="2"
                                            value={lora.weight ?? 1.0}
                                            onChange={(e) => handleWeightChange(idx, parseFloat(e.target.value) || 1.0)}
                                            className="w-12 rounded border bg-transparent px-1 py-0.5 text-center text-xs font-mono outline-none"
                                            style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleRemove(idx)}
                                            className="text-red-500 hover:text-red-700 px-1 py-0.5 text-xs"
                                            title="删除"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
