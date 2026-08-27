"use client";

import { CheckCircle2, Clapperboard, FileText, Image as ImageIcon, Link2, ListChecks, LoaderCircle, Play, WandSparkles } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Input, Select } from "antd";

import { ModelLabel } from "@/components/model-icon";
import { resolveImageSettingsContext } from "@/components/image-settings-panel";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData, CanvasNodeMetadata } from "../types";
import {
    resolveStoryDirectorImageModelPresentation,
    resolveStoryDirectorTextModelPresentation,
    storyDirectorImageModelPatchForValue,
    storyDirectorTextModelPatchForValue,
    type StoryDirectorTextModelSelection,
    type StoryDirectorTextModelSourceOption,
    type StoryDirectorTextModelOption,
} from "../utils/story-director-text-model";
import { normalizeStoryImageQuality, storyImageQualityPatch } from "../utils/story-image-quality";
import { resolveStoryWorkflowImageOperation } from "../utils/canvas-image-operation";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";

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
const stylePresetValues = ["清凉写真", "电影感写实", "国风仙侠", "暗黑奇幻", "赛博朋克", "日系动画", "美式漫画", "水彩绘本", "黏土动画", "像素游戏", "黑白分镜"];
const customStyleValue = "__custom_style__";
const styleOptions = [...stylePresetValues.map((value) => ({ value, label: value })), { value: customStyleValue, label: "自定义" }];
const storyboardModeOptions = [
    { value: "single", label: "逐镜生成" },
    { value: "grid9", label: "9宫格分镜" },
];
const qualityOptions = [
    { value: "low", label: "1K" },
    { value: "medium", label: "2K" },
    { value: "high", label: "4K" },
];

type StorySelectKey = "textModel" | "imageModel" | "style" | "mode" | "aspect" | "quality";

export function CanvasStoryDirectorPanel({ node, embedded = false, storyDirectorInheritedTextModel = null, storyDirectorTextModels = [], storyDirectorInheritedImageModel = null, storyDirectorImageModels = [], config, onConfigChange, onAnalyzeStory, onGenerateCharacters, onGenerateShots, onRunAll, onCreateCharacterConfig, onCreateShotConfig, onImageSettingsOpenChange }: CanvasStoryDirectorPanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [openSelect, setOpenSelect] = useState<StorySelectKey | null>(null);
    const storyText = node.metadata?.storyText ?? node.metadata?.content ?? "";
    const canRun = Boolean(storyText.trim()) && storyText.trim() !== "在这里粘贴小说、章节或剧情梗概。\n\n建议包含：人物、场景、关键事件、对白、画风要求。";
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
    const getPopupContainer = useCallback((trigger: HTMLElement) => trigger.parentElement || document.body, []);
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
            getPopupContainer,
        }),
        [getPopupContainer, openSelect],
    );

    return (
        <div
            ref={panelRef}
            data-story-director-panel
            className={`${embedded ? "flex min-h-full w-full flex-col overflow-visible" : "flex w-[560px] flex-col"} rounded-2xl border p-4 shadow-2xl backdrop-blur`}
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={embedded ? undefined : (event) => event.stopPropagation()}
            onPointerDown={embedded ? undefined : (event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <Clapperboard className="size-4" />
                        故事导演
                    </div>
                    <div className="mt-1 text-xs" style={{ color: theme.node.muted }}>
                        分析故事，生成角色资产，再按镜头批量生成分镜
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2" data-canvas-no-drag>
                    <StoryDirectorTextModelSelect
                        value={storyDirectorTextModelPresentation.selectedValue}
                        options={storyDirectorTextModelPresentation.options}
                        title={storyDirectorTextModelPresentation.title}
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
                    <StoryDirectorTextModelSelect
                        value={storyDirectorImageModelPresentation.selectedValue}
                        options={storyDirectorImageModelPresentation.options}
                        title={storyDirectorImageModelPresentation.title}
                        placeholder="选择图片模型"
                        selectProps={selectOpenProps("imageModel")}
                        onChange={(value) => {
                            closeSelect();
                            const patch = storyDirectorImageModelPatchForValue(
                                value,
                                storyDirectorImageModels,
                            );
                            if (patch) onConfigChange(node.id, patch);
                        }}
                    />
                    <StatusPill analyzing={isAnalyzing} generating={isGenerating} done={hasAnalysis} error={hasError} />
                </div>
            </div>

            <div className="shrink-0" data-canvas-no-drag>
                <Input.TextArea
                    className="thin-scrollbar !resize-y !overflow-y-auto !rounded-xl"
                    style={{ ...controlStyle, height: 128, minHeight: 128, overflowY: "auto" }}
                    value={storyText}
                    placeholder="粘贴小说、章节或剧情梗概。可包含角色、场景、对白和画风要求。"
                    onChange={(event) => onConfigChange(node.id, { storyText: event.target.value, content: event.target.value })}
                />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 [&>*]:min-w-0" data-canvas-no-drag>
                <DirectorAction
                    icon={isAnalyzing || isGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                    title="一键全流程"
                    description="分析、角色图、分镜图"
                    disabled={!canRun || isAnalyzing || isGenerating}
                    onClick={() => onRunAll(node)}
                />
                <DirectorAction
                    icon={<FileText className="size-4" />}
                    title="分析故事"
                    description="生成角色/场景/分镜 JSON"
                    disabled={!canRun || isAnalyzing || isGenerating}
                    onClick={() => onAnalyzeStory(node)}
                />
                <DirectorAction
                    icon={<ImageIcon className="size-4" />}
                    title="补齐缺失角色图"
                    description={hasAnalysis ? (missingCharacterCount ? `缺 ${missingCharacterCount} 个，5并发` : "角色图已齐全") : "需先分析故事"}
                    disabled={!hasAnalysis || !missingCharacterCount || isAnalyzing || isGenerating}
                    onClick={() => onGenerateCharacters(node)}
                />
                <DirectorAction
                    icon={<ListChecks className="size-4" />}
                    title={storyboardMode === "grid9" ? "生成9宫格" : "生成分镜图"}
                    description={storyboardMode === "grid9" ? "每9镜一张，5并发" : "按镜头提交"}
                    disabled={!shots.length || isAnalyzing || isGenerating}
                    onClick={() => onGenerateShots(node)}
                />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2" data-canvas-no-drag>
                <Button className="!rounded-xl" disabled={!canRun || isAnalyzing || isGenerating} onClick={() => onCreateCharacterConfig(node)}>
                    角色图配置节点
                </Button>
                <Button className="!rounded-xl" disabled={!canRun || isAnalyzing || isGenerating} onClick={() => onCreateShotConfig(node)}>
                    分镜图配置节点
                </Button>
            </div>

            <div data-story-director-config-area className="thin-scrollbar mt-auto max-h-[240px] shrink-0 overflow-y-auto pt-3">
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
                        <Input
                            className="!w-full"
                            style={controlStyle}
                            type="number"
                            min={storyboardMode === "grid9" ? 9 : 1}
                            max={storyboardMode === "grid9" ? 99 : 100}
                            step={storyboardMode === "grid9" ? 9 : 1}
                            value={storyShotCount}
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
                    <LabeledControl label="质量">
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
                </div>
                {isCustomStyle ? (
                    <div className="mt-2" data-canvas-no-drag>
                        <LabeledControl label="自定义画风">
                            <Input
                                className="!w-full"
                                style={controlStyle}
                                value={customStyle}
                                placeholder="输入自定义画风，生成角色图和分镜图时会使用这里的画风"
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
                        <Select
                            className="!w-full"
                            value={storyDirectorImageModelPresentation.selectedValue}
                            options={storyDirectorImageModelPresentation.options}
                            {...selectOpenProps("imageModel")}
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

                <div
                    role="note"
                    aria-label="故事快捷生成参数说明"
                    className="mt-2 text-[10px] leading-4 opacity-70"
                    data-canvas-no-drag
                >
                    图片模型在本面板选择。角色图/分镜图优先用这里选的 provider/model；连了 Config 节点时仍用 Config。生成还是编辑由模型能力决定，不用先选手动 operation。
                </div>

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

                {node.metadata?.errorDetails ? <div className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">{node.metadata.errorDetails}</div> : null}

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
            </div>
        </div>
    );
}

function StoryDirectorTextModelSelect({
    value,
    options,
    title,
    placeholder = "选择模型",
    selectProps,
    onChange,
}: {
    value: string;
    options: StoryDirectorTextModelOption[];
    title: string;
    placeholder?: string;
    selectProps: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        getPopupContainer: (trigger: HTMLElement) => HTMLElement;
    };
    onChange: (value: string) => void;
}) {
    return (
        <Select
            size="small"
            className="!w-[164px]"
            value={value || undefined}
            options={options.map((option) => ({ ...option, label: option.model ? <ModelLabel model={option.model} label={option.label} /> : option.label }))}
            placeholder={placeholder}
            title={title}
            optionLabelProp="label"
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 220 } } }}
            {...selectProps}
            onChange={onChange}
        />
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

function DirectorAction({ icon, title, description, disabled, onClick }: { icon: ReactNode; title: string; description: string; disabled?: boolean; onClick: () => void }) {
    return (
        <Button type="default" className="!flex !h-auto !min-h-[72px] !w-full !justify-start !rounded-xl !px-3 !py-2.5 text-left" disabled={disabled} onClick={onClick}>
            <span className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 shrink-0">{icon}</span>
                <span className="min-w-0">
                    <span className="block text-xs font-semibold">{title}</span>
                    <span className="mt-1 block whitespace-normal text-[11px] leading-4 opacity-60">{description}</span>
                </span>
            </span>
        </Button>
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
