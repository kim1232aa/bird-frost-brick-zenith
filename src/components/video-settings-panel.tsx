"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ImageSettingsTheme } from "@/components/image-settings-panel";
import {
    resolveVideoSettingsContext,
    type ResolvedVideoSettingsContext,
} from "@/components/provider-settings-context";
import { type CanvasTheme } from "@/lib/canvas-theme";
import {
    describeVideoGenerationParameters,
    formatVideoGenerationParameterCapability,
    formatVideoReferenceCapability,
    type ResolvedVideoModelCapability,
    type VideoGenerationParameterDescriptor,
    type VideoGenerationParameterName,
} from "@/services/api/video-model-capabilities";

import {
    readVideoDimensionsDraft,
    updateVideoDimensionsDraft,
    useConfigHydrationRuntimeStore,
    videoGenerationSettingsToRequest,
    type AiConfig,
    type VideoGenerationOperation,
    type VideoGenerationSettings,
    type VideoGenerationSettingsScope,
} from "@/stores/use-config-store";

type VideoSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "vquality" | "size" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "imageHostBaseUrl" | "imageHostApiKey", value: string) => void;
    onImageHostCredentialBlur?: () => void;
    onGenerationSettingsChange?: (settings: VideoGenerationSettings, scope: VideoGenerationSettingsScope, capabilityId: string) => void;
    operation?: VideoGenerationOperation;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export { resolveVideoSettingsContext, type ResolvedVideoSettingsContext } from "@/components/provider-settings-context";

const BASE_PARAMETER_NAMES = ["duration", "resolution", "dimensions", "aspectRatio", "audio", "watermark"] as const;
const ADVANCED_PARAMETER_NAMES = [
    "frames", "fps", "audioMode", "negativePrompt", "seed", "steps", "guidance", "sampler", "scheduler", "quantity",
    "modelVariant", "mode", "promptExpansion", "safetyChecker", "frameGuideStrength", "returnLastFrame", "shift", "turbo", "usePro",
] as const;

const GROK_DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
const GROK_RESOLUTION_OPTIONS = ["480p", "720p", "1080p"] as const;
const GROK_ASPECT_OPTIONS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;

function isGrokImagineVideo(capability: ResolvedVideoModelCapability, scope: VideoGenerationSettingsScope) {
    const model = String(scope.model || capability.model || "").trim();
    return capability.id === "xai-imagine-video" || /grok-imagine-video/i.test(model);
}

function withGrokImagineControls(
    capability: ResolvedVideoModelCapability,
    scope: VideoGenerationSettingsScope,
    descriptors: readonly VideoGenerationParameterDescriptor[],
): readonly VideoGenerationParameterDescriptor[] {
    if (!isGrokImagineVideo(capability, scope)) return descriptors;
    return descriptors.map((field) => {
        if (field.name === "duration") {
            return {
                ...field,
                status: "supported",
                valueType: "integer",
                transportName: "duration",
                integer: true,
                minimum: 1,
                maximum: 15,
                defaultValue: 8,
                enumValues: [...GROK_DURATION_OPTIONS],
                options: GROK_DURATION_OPTIONS.map((value) => ({ value, label: `${value} 秒` })),
                description: "出片时长，1 到 15 秒",
            };
        }
        if (field.name === "resolution") {
            return {
                ...field,
                status: "supported",
                valueType: "string",
                transportName: "resolution",
                enumValues: [...GROK_RESOLUTION_OPTIONS],
                options: GROK_RESOLUTION_OPTIONS.map((value) => ({ value, label: value })),
                defaultValue: "720p",
                description: "画面清晰度。1080p 只在 Grok 视频 1.5 的文生视频/图生视频可用",
            };
        }
        if (field.name === "aspectRatio") {
            return {
                ...field,
                status: "supported",
                valueType: "string",
                transportName: "aspect_ratio",
                enumValues: [...GROK_ASPECT_OPTIONS],
                options: GROK_ASPECT_OPTIONS.map((value) => ({ value, label: value })),
                defaultValue: "16:9",
                description: "画面比例。图生视频不选时跟原图走",
            };
        }
        return field;
    });
}

export function VideoSettingsPanel({
    config,
    onConfigChange,
    onImageHostCredentialBlur,
    onGenerationSettingsChange,
    operation,
    theme,
    showTitle = true,
    className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5",
}: VideoSettingsPanelProps) {
    const { capability, scope, settings, operationResolution, routeError } = resolveVideoSettingsContext(config, operation);
    if (operationResolution === "blocked") {
        return (
            <ImageSettingsTheme theme={theme}>
                <div
                    className={className}
                    style={{ color: theme.node.text }}
                    data-video-operation-resolution="blocked"
                    role="alert"
                    aria-live="polite"
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                    <CapabilityBanner capability={capability} scope={scope} theme={theme} />
                    <Hint text={routeError || "还没选好这次用哪种出片方式，参数先不能改。"} danger />
                </div>
            </ImageSettingsTheme>
        );
    }
    const descriptors = withGrokImagineControls(capability, scope, describeVideoGenerationParameters(capability));
    const descriptor = (name: VideoGenerationParameterName) => descriptors.find((item) => item.name === name)!;
    const patch = (name: VideoGenerationParameterName, value: VideoGenerationSettings[VideoGenerationParameterName] | undefined) => {
        const providerDefaultFields = new Set(settings.providerDefaultFields || []);
        if (value === undefined) providerDefaultFields.add(name);
        else providerDefaultFields.delete(name);
        const next = { ...settings, [name]: value, providerDefaultFields: [...providerDefaultFields] };
        onGenerationSettingsChange?.(next, scope, capability.generationParameters.id);
    };
    let validationError = "";
    try {
        if (!isGrokImagineVideo(capability, scope)) {
            videoGenerationSettingsToRequest(settings, capability);
        }
    } catch (error) {
        validationError = error instanceof Error ? error.message : "当前填写的视频参数这个模型不收";
    }
    const baseFields = BASE_PARAMETER_NAMES.map(descriptor).filter((field) => {
        if (field.status === "supported") return true;
        return isSettingProvided(settings[field.name]);
    });
    const supportedAdvanced = ADVANCED_PARAMETER_NAMES.filter((name) => descriptor(name).status === "supported");

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                {routeError ? <Hint text={routeError} danger /> : null}
                <CapabilityBanner capability={capability} scope={scope} theme={theme} />
                {validationError ? <Hint text={validationError} danger /> : null}
                <SettingGroup title="基础参数" color={theme.node.muted}>
                    {baseFields.length ? baseFields.map((field) => (
                        <VideoParameterEditor
                            key={field.name}
                            field={field}
                            value={settings[field.name]}
                            settings={settings}
                            theme={theme}
                            onChange={(value) => patch(field.name, value)}
                        />
                    )) : (
                        <Hint text="这个模型不让改时长、清晰度这些，按它自己的默认出片。" />
                    )}
                </SettingGroup>
                <SettingGroup title="高级参数" color={theme.node.muted}>
                    {ADVANCED_PARAMETER_NAMES.map((name) => {
                        const field = descriptor(name);
                        if (field.status === "unsupported" && !isSettingProvided(settings[name])) return null;
                        if (field.status !== "supported") return (field.status === "conflict" || isSettingProvided(settings[name])) ? <UnavailableParameter key={name} field={field} value={settings[name]} onClear={() => patch(name, undefined)} theme={theme} /> : null;
                        return <VideoParameterEditor key={name} field={field} value={settings[name]} settings={settings} theme={theme} onChange={(value) => patch(name, value)} />;
                    })}
                    {!supportedAdvanced.length ? (
                        <Hint text="这个模型没有可改的高级项，按默认出片就行。" />
                    ) : null}
                </SettingGroup>
                <ImageHostSettingGroup config={config} onConfigChange={onConfigChange} onImageHostCredentialBlur={onImageHostCredentialBlur} theme={theme} />
            </div>
        </ImageSettingsTheme>
    );
}

function CapabilityBanner({ capability, scope, theme }: { capability: ResolvedVideoModelCapability; scope: VideoGenerationSettingsScope; theme: CanvasTheme }) {
    return (
        <div className="rounded-xl border px-3 py-2 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
            <div className="font-semibold" style={{ color: theme.node.text }}>{capability.providerLabel} · {scope.model || "未选择模型"}</div>
            <div>{operationLabel(scope.operation)}</div>
            <details>
                <summary className="cursor-pointer select-none">能力合同详情（默认折叠）</summary>
                <div className="mt-1">{formatVideoGenerationParameterCapability(capability)}</div>
                <div>{formatVideoReferenceCapability(capability)}</div>
            </details>
        </div>
    );
}

function VideoParameterEditor({ field, value, settings, theme, onChange }: { field: VideoGenerationParameterDescriptor; value: VideoGenerationSettings[VideoGenerationParameterName] | undefined; settings: VideoGenerationSettings; theme: CanvasTheme; onChange: (value: VideoGenerationSettings[VideoGenerationParameterName] | undefined) => void }) {
    if (field.status !== "supported") return <UnavailableParameter field={field} value={value} onClear={() => onChange(undefined)} theme={theme} />;
    if (field.name === "duration" && field.derivedFrom?.includes("frames")) {
        const frames = settings.frames;
        const fps = settings.fps;
        const officialSeconds = typeof frames === "number" && typeof fps === "number" && fps > 0 ? frames / fps : null;
        return (
            <ParameterShell field={field} theme={theme}>
                <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: theme.node.stroke }}>
                    {officialSeconds === null ? "请设置合法帧数与帧率" : `约 ${Math.round(officialSeconds)} 秒（num_frames / frame_rate = ${officialSeconds.toFixed(3)}；仅作显示，API 不发送 seconds）`}
                </div>
            </ParameterShell>
        );
    }
    if (field.options.length) {
        const selected = field.options.find((option) => Object.is(option.value, value));
        return (
            <ParameterShell field={field} theme={theme}>
                <select
                    className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none"
                    style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                    value={selected ? String(selected.value) : ""}
                    onChange={(event) => {
                        const option = field.options.find((item) => String(item.value) === event.target.value);
                        onChange(option?.value);
                    }}
                >
                    {!field.required ? <option value="">使用 provider 默认</option> : <option value="" disabled>请选择</option>}
                    {field.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
                </select>
                {!selected && value !== undefined ? <Hint text={`已保存值 ${String(value)} 不在当前真实枚举中；提交会被阻止，不会静默替换。`} danger /> : null}
            </ParameterShell>
        );
    }
    if (field.valueType === "boolean") {
        return (
            <ParameterShell field={field} theme={theme}>
                <div className="grid grid-cols-2 gap-2">
                    <OptionPill selected={value === true} theme={theme} onClick={() => onChange(true)}>开启</OptionPill>
                    <OptionPill selected={value === false} theme={theme} onClick={() => onChange(false)}>关闭</OptionPill>
                </div>
            </ParameterShell>
        );
    }
    if (field.valueType === "integer" || field.valueType === "number") {
        return (
            <ParameterShell field={field} theme={theme}>
                <div className="flex items-center gap-1.5">
                    <input
                        type="number"
                        min={field.minimum}
                        max={field.maximum}
                        step={field.valueType === "integer" || field.integer ? 1 : "any"}
                        className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                        value={typeof value === "number" ? value : ""}
                        placeholder={field.defaultValue === undefined ? "使用 provider 默认" : String(field.defaultValue)}
                        onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
                    />
                    {field.name === "seed" ? (
                        <button
                            type="button"
                            title="生成随机 Seed"
                            className="grid size-9 shrink-0 place-items-center rounded-xl border text-sm hover:opacity-80 active:scale-95 transition-all"
                            style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                            onClick={() => onChange(Math.floor(Math.random() * 2147483647))}
                        >
                            🎲
                        </button>
                    ) : null}
                </div>
            </ParameterShell>
        );
    }
    if (field.valueType === "dimensions") {
        return <DimensionsEditor field={field} value={value as VideoGenerationSettings["dimensions"] | undefined} theme={theme} onChange={onChange} />;
    }
    if (field.valueType === "string-array") {
        return (
            <ParameterShell field={field} theme={theme}>
                <textarea rows={3} className="w-full resize-y rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text }} value={Array.isArray(value) ? value.join("\n") : ""} placeholder="每行一个已验证字符串值" onChange={(event) => onChange(event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))} />
            </ParameterShell>
        );
    }
    const stringValue = typeof value === "string" ? value : "";
    return (
        <ParameterShell field={field} theme={theme}>
            {field.name === "negativePrompt" ? (
                <textarea rows={3} maxLength={field.maxLength} className="w-full resize-y rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text }} value={stringValue} placeholder="留空使用 provider 默认" onChange={(event) => onChange(event.target.value)} />
            ) : (
                <input type="text" maxLength={field.maxLength} className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text }} value={stringValue} placeholder="使用 provider 默认" onChange={(event) => onChange(event.target.value)} />
            )}
        </ParameterShell>
    );
}

function DimensionsEditor({ field, value, theme, onChange }: { field: VideoGenerationParameterDescriptor; value: VideoGenerationSettings["dimensions"] | undefined; theme: CanvasTheme; onChange: (value: VideoGenerationSettings["dimensions"] | undefined) => void }) {
    const valueKey = dimensionsLabel(value);
    const [draft, setDraft] = useState(() => readVideoDimensionsDraft(value));

    useEffect(() => {
        setDraft(readVideoDimensionsDraft(value));
    }, [valueKey]);

    const update = (side: "width" | "height", nextValue: string) => {
        const result = updateVideoDimensionsDraft(draft, side, nextValue);
        setDraft(result.draft);
        if (result.value !== undefined) onChange(result.value);
    };
    const hasIncompleteDraft = Boolean(draft.width || draft.height)
        && updateVideoDimensionsDraft(draft, "width", draft.width).value === undefined;

    return (
        <ParameterShell field={field} theme={theme}>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                <DimensionInput prefix="W" value={draft.width} theme={theme} onChange={(next) => update("width", next)} />
                <span className="opacity-45">×</span>
                <DimensionInput prefix="H" value={draft.height} theme={theme} onChange={(next) => update("height", next)} />
            </div>
            {hasIncompleteDraft ? <Hint text="请输入完整的正整数宽高；完成前不会覆盖已保存值。" /> : null}
            {!field.required && value !== undefined ? (
                <button
                    type="button"
                    className="w-full rounded-lg border px-2 py-1 text-xs"
                    style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                    onClick={() => {
                        setDraft({ width: "", height: "" });
                        onChange(undefined);
                    }}
                >
                    使用 provider 默认
                </button>
            ) : null}
            {field.minimum === undefined && field.maximum === undefined ? <Hint text="宽高字段已验证，但官方未公布完整数值边界；不会套用其他 provider 的尺寸限制。" /> : null}
        </ParameterShell>
    );
}

function ParameterShell({ field, theme, children }: { field: VideoGenerationParameterDescriptor; theme: CanvasTheme; children: ReactNode }) {
    const range = field.enumValues?.length ? `枚举：${field.enumValues.join("、")}` : field.minimum !== undefined || field.maximum !== undefined ? `范围：${field.minimum ?? "未公布"}–${field.maximum ?? "未公布"}` : "";
    return (
        <div className="space-y-1.5 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
            <div className="flex items-center justify-between gap-2 text-xs font-medium"><span>{field.label}</span>{field.required ? <span className="text-[10px] opacity-60">必填</span> : null}</div>
            {children}
            <div className="text-[10px] leading-4 opacity-55">{range ? `${range} · ` : ""}{field.description}</div>
        </div>
    );
}

function UnavailableParameter({ field, value, onClear, theme }: { field: VideoGenerationParameterDescriptor; value?: VideoGenerationSettings[VideoGenerationParameterName]; onClear?: () => void; theme: CanvasTheme }) {
    const label = field.status === "conflict" ? "官方字段冲突，这项先不能改" : field.status === "unpublished" ? "这个模型不让改这一项，按默认出片" : "这项用不了，按默认出片";
    return (
        <div className="rounded-xl border px-3 py-2 text-[11px] leading-4" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
            <span className="font-semibold" style={{ color: theme.node.text }}>{field.label} · {label}</span>
            <div>{field.description}</div>
            {isSettingProvided(value) ? <div className="mt-1 text-red-500">已保存值 {formatSettingValue(value)} 与当前合同不兼容；值仍保留，提交会被明确阻止。</div> : null}
            {isSettingProvided(value) && onClear ? <button type="button" className="mt-1 rounded-lg border px-2 py-1" style={{ borderColor: theme.node.stroke, color: theme.node.text }} onClick={onClear}>清除此作用域值</button> : null}
        </div>
    );
}

function operationLabel(operation?: VideoGenerationOperation) {
    if (!operation) return "未选择 operation";
    return ({
        "text-to-video": "文生视频",
        "image-to-video": "图生视频",
        "reference-to-video": "参考素材生视频",
        "first-last-frame-to-video": "首尾帧生视频",
        "keyframes-to-video": "关键帧生视频",
        continuation: "视频续写",
        "video-edit": "视频编辑",
    } as const)[operation];
}

function ImageHostSettingGroup({ config, onConfigChange, onImageHostCredentialBlur, theme }: Pick<VideoSettingsPanelProps, "config" | "onConfigChange" | "onImageHostCredentialBlur" | "theme">) {
    const credentialError = useConfigHydrationRuntimeStore((state) => state.imageHostCredentialError);
    return (
        <SettingGroup title="图床（参考图公网化）" color={theme.node.muted}>
            {credentialError ? <Hint text={credentialError} danger /> : null}
            <input
                type="text"
                placeholder="图床地址，如 https://img.example.com"
                className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none"
                style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                value={config.imageHostBaseUrl || ""}
                onChange={(event) => onConfigChange("imageHostBaseUrl", event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
            />
            <input
                type="password"
                placeholder={config.imageHostHasApiKey ? "已保存到后端；输入新 Key 可替换" : "图床 API Key（不需要鉴权可留空）"}
                className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none"
                style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                value={config.imageHostApiKey || ""}
                onChange={(event) => onConfigChange("imageHostApiKey", event.target.value)}
                onBlur={onImageHostCredentialBlur}
                onMouseDown={(event) => event.stopPropagation()}
            />
            <div className="text-[11px] leading-5" style={{ color: theme.node.muted }}>
                Key 保存到后端密钥库；浏览器上传请求不会携带明文。
            </div>
        </SettingGroup>
    );
}

export function videoResolutionLabel(value: string) {
    return String(value || "").trim() || "provider 默认/未验证";
}

export function videoSizeLabel(value: string) {
    const normalized = String(value || "").trim();
    if (normalized === "adaptive" || normalized === "auto") return "自适应";
    return normalized || "provider 默认/未验证";
}

export function videoSecondsLabel(value: string) {
    const normalized = String(value || "").trim();
    return normalized ? `${normalized}s` : "provider 默认/未验证";
}

export function normalizeVideoSizeValue(value: string) {
    return String(value || "").trim();
}

export function normalizeVideoResolutionValue(value: string) {
    return String(value || "").trim();
}

export function videoSettingsSummary(config: AiConfig, operation?: VideoGenerationOperation) {
    const { capability, settings } = resolveVideoSettingsContext(config, operation);
    const duration = capability.generationParameters.duration.derivedFrom?.includes("frames")
        ? approximateFrameDurationLabel(settings.frames, settings.fps)
        : settings.duration === undefined ? "默认" : `${settings.duration}s`;
    const format = settings.resolution || dimensionsLabel(settings.dimensions) || settings.aspectRatio || "默认";
    const status = Object.values(capability.generationParameters).some((field) => field && typeof field === "object" && "status" in field && field.status === "supported") ? "" : " · 参数未验证";
    return `${format} · ${duration}${status}`;
}

function OptionPill({ selected, disabled = false, theme, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" disabled={disabled} className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35" style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onClick}>
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function DimensionInput({ prefix, value, disabled = false, theme, onChange }: { prefix: string; value: string; disabled?: boolean; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text, opacity: disabled ? 0.55 : 1 }}>
            <span className="grid w-9 place-items-center" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input type="number" min={1} step={1} disabled={disabled} className="min-w-0 flex-1 bg-transparent px-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={value} onChange={(event) => onChange(event.target.value)} onMouseDown={(event) => event.stopPropagation()} />
        </label>
    );
}

function Hint({ text, danger = false }: { text: string; danger?: boolean }) {
    return <div className="rounded-lg border px-2.5 py-2 text-[10px] leading-4" style={{ borderColor: danger ? "rgba(239,68,68,0.5)" : "currentColor", color: danger ? "#ef4444" : "inherit", opacity: danger ? 1 : 0.6 }}>{text}</div>;
}

function dimensionsLabel(value: VideoGenerationSettings["dimensions"]) {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") return `${value.width}x${value.height}`;
    return "";
}

function approximateFrameDurationLabel(frames: number | undefined, fps: number | undefined) {
    if (typeof frames !== "number" || typeof fps !== "number" || fps <= 0) return "待设置帧数/FPS";
    const seconds = frames / fps;
    return `约 ${Math.round(seconds)}s`;
}

function isSettingProvided(value: unknown) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function formatSettingValue(value: VideoGenerationSettings[VideoGenerationParameterName]) {
    if (Array.isArray(value)) return value.join("、");
    if (value && typeof value === "object") return dimensionsLabel(value as VideoGenerationSettings["dimensions"]);
    return String(value);
}

