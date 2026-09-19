"use client";

import { useState, type ReactNode } from "react";
import { ConfigProvider } from "antd";
import { Plus, X } from "lucide-react";

import { type CanvasTheme } from "@/lib/canvas-theme";
import { constrainImageDimensions } from "@/lib/image-settings-constraints";
import {
    resolveCivitaiLoraResource,
    type CivitaiLoraResourceKind,
} from "@/services/api/civitai-lora-resource";
import {
    imageOutputCountCapability,
    type ImageAdvancedFieldCapability,
    type ImageDimensionRules,
    type ImageOperation,
    type ResolvedImageModelCapability,
} from "@/services/api/image-model-capabilities";
import {
    resolveImageSettingsContext,
    type ResolvedImageSettingsContext,
} from "@/components/provider-settings-context";
import {
    applyCivitaiLoraResolution,
    imageLoraResolutionError,
    readImageAdvancedSettings,
    resetImageLoraResolution,
    useConfigHydrationRuntimeStore,
    type AiConfig,
    type ImageAdvancedSettings,
    type ImageAdvancedSettingsScope,
} from "@/stores/use-config-store";

export { constrainImageDimensions } from "@/lib/image-settings-constraints";

type ImageSettingsPanelProps = {
    config: AiConfig;
    operation: ImageOperation;
    onConfigChange: (key: "imageHostBaseUrl" | "imageHostApiKey", value: string) => void;
    onAdvancedSettingsChange?: (settings: ImageAdvancedSettings, scope: ImageAdvancedSettingsScope) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    quickCount?: number;
    sections?: ImageSettingsSection[];
};

export type ImageSettingsSection = "quality" | "size" | "count" | "advanced";

export { resolveImageSettingsContext, type ResolvedImageSettingsContext } from "@/components/provider-settings-context";

export function ImageSettingsPanel({
    config,
    operation,
    onConfigChange,
    onAdvancedSettingsChange,
    theme,
    showTitle = true,
    className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5",
    quickCount = 10,
    sections = ["quality", "size", "count", "advanced"],
}: ImageSettingsPanelProps) {
    const context = resolveImageSettingsContext(config, operation);
    const { capability, scope, routeError } = context;
    const advanced = readImageAdvancedSettings(config.imageAdvancedSettingsByScope, scope);
    const updateScopedSettings = (next: ImageAdvancedSettings) => onAdvancedSettingsChange?.(next, scope);

    return (
        <ImageSettingsTheme theme={theme}>
            <div
                className={className}
                style={{ color: theme.node.text }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
                    if (document.activeElement instanceof HTMLElement && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
                }}
            >
                {showTitle ? <div className="text-lg font-semibold">图像设置</div> : null}
                {routeError ? <div className="rounded-xl border border-red-500/50 px-3 py-2 text-[11px] leading-5 text-red-400">{routeError}</div> : null}
                <CapabilityBanner capability={capability} operation={operation} theme={theme} />
                {operation === "edit" && capability.serialization.kind === "sensenova-miaohua-image" ? (
                    <MiaohuaImageHostSettings config={config} onConfigChange={onConfigChange} theme={theme} />
                ) : null}
                {sections.includes("quality") ? <QualitySettings settings={advanced} capability={capability} theme={theme} onChange={(quality) => updateScopedSettings({ ...advanced, quality })} /> : null}
                {sections.includes("size") ? <SizeSettings settings={advanced} capability={capability} theme={theme} onChange={(size) => updateScopedSettings({ ...advanced, size })} /> : null}
                {sections.includes("count") ? <CountSettings capability={capability} settings={advanced} quickCount={quickCount} theme={theme} onChange={(count) => updateScopedSettings({ ...advanced, count })} /> : null}
                {sections.includes("advanced") ? (
                    <AdvancedSettings
                        settings={advanced}
                        capability={capability}
                        disabled={!scope.providerId || !scope.model || capability.availability.state !== "supported"}
                        theme={theme}
                        onChange={updateScopedSettings}
                    />
                ) : null}
            </div>
        </ImageSettingsTheme>
    );
}

function MiaohuaImageHostSettings({ config, onConfigChange, theme }: Pick<ImageSettingsPanelProps, "config" | "onConfigChange" | "theme">) {
    const credentialError = useConfigHydrationRuntimeStore((state) => state.imageHostCredentialError);
    return (
        <SettingGroup title="秒画参考图公网化" color={theme.node.muted}>
            {credentialError ? <Hint text={credentialError} danger /> : null}
            <TextInput
                value={config.imageHostBaseUrl || ""}
                placeholder="图床地址，如 https://img.example.com"
                theme={theme}
                onChange={(value) => onConfigChange("imageHostBaseUrl", value)}
            />
            <input
                type="password"
                value={config.imageHostApiKey || ""}
                placeholder={config.imageHostHasApiKey ? "已保存到后端；输入新 Key 可替换" : "图床 API Key（不需要鉴权可留空）"}
                className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none"
                style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                onChange={(event) => onConfigChange("imageHostApiKey", event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
            />
            <Hint text="仅用于秒画编辑将本地原图转为公网 URL；Key 保存到后端密钥库，浏览器上传请求、节点和画布都不携带明文。原图须为 JPG/JPEG/PNG/WebP、小于 8 MiB，宽高 256–6000。" />
        </SettingGroup>
    );
}

function CapabilityBanner({ capability, operation, theme }: { capability: ResolvedImageModelCapability; operation: ImageOperation; theme: CanvasTheme }) {
    const status = capability.availability.state;
    const statusLabel = status === "supported" ? "完整支持" : status === "unsupported" ? "不支持" : "未验证";
    const reason = status === "supported" ? capability.resolutionReason : capability.availability.reason;
    return (
        <div className="rounded-xl border px-3 py-2 text-[11px] leading-5" style={{ borderColor: theme.node.stroke, color: status === "supported" ? theme.node.muted : theme.node.text }}>
            <div className="font-semibold">{capability.providerLabel} · {capability.model || "未选择模型"}</div>
            <div>{operationLabel(operation)} · {statusLabel}{reason ? `：${reason}` : ""}</div>
        </div>
    );
}

function QualitySettings({ settings, capability, theme, onChange }: { settings: ImageAdvancedSettings; capability: ResolvedImageModelCapability; theme: CanvasTheme; onChange: (value: string) => void }) {
    const tierValues = capability.size.state === "supported" && capability.size.kind === "tier-and-ratio" ? capability.size.tiers : [];
    const qualityValues = capability.quality.state === "supported" && capability.quality.requestable !== false ? capability.quality.values : [];
    const values = tierValues.length ? tierValues : qualityValues;
    const selected = matchingEnumValue(settings.quality || "", values);
    return (
        <SettingGroup title={tierValues.length ? "图片规格" : "质量"} color={theme.node.muted}>
            {values.length ? (
                <>
                    <div className="grid grid-cols-3 gap-2.5">
                        {values.map((value) => (
                            <OptionPill key={value} selected={selected === value} theme={theme} onClick={() => onChange(value)}>{value}</OptionPill>
                        ))}
                    </div>
                    {!selected && settings.quality ? <PreservedValue value={settings.quality} theme={theme} /> : null}
                </>
            ) : (
                <FieldState
                    capability={capability.quality}
                    savedValue={capability.quality.state === "unsupported" ? undefined : settings.quality}
                    theme={theme}
                />
            )}
        </SettingGroup>
    );
}

function SizeSettings({ settings, capability, theme, onChange }: { settings: ImageAdvancedSettings; capability: ResolvedImageModelCapability; theme: CanvasTheme; onChange: (value: string) => void }) {
    const size = capability.size;
    if (size.state !== "supported") {
        return (
            <SettingGroup title="尺寸" color={theme.node.muted}>
                {size.state === "unknown" ? (
                    <>
                        <FieldState capability={size} savedValue={settings.size} theme={theme} />
                        <TextInput value={settings.size || ""} placeholder="未验证，按原值保存" theme={theme} onChange={onChange} />
                    </>
                ) : <FieldState capability={size} savedValue={settings.size} theme={theme} />}
            </SettingGroup>
        );
    }
    if (size.kind === "enum") {
        const values = [...(size.allowAuto ? ["auto"] : []), ...size.values.filter((value) => value.toLowerCase() !== "auto")];
        return (
            <SettingGroup title="尺寸枚举" color={theme.node.muted}>
                <div className="grid grid-cols-2 gap-2.5">
                    {values.map((value) => <OptionPill key={value} selected={enumEquals(settings.size || "", value)} theme={theme} onClick={() => onChange(value)}>{value}</OptionPill>)}
                </div>
                {!matchingEnumValue(settings.size || "", values) && settings.size ? <PreservedValue value={settings.size} theme={theme} /> : null}
                {size.note ? <Hint text={size.note} /> : null}
            </SettingGroup>
        );
    }
    if (size.kind === "tier-and-ratio") {
        return (
            <>
                <SettingGroup title="宽高比" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {size.ratios.map((ratio) => <OptionPill key={ratio} selected={enumEquals(settings.size || "", ratio)} theme={theme} onClick={() => onChange(ratio)}>{ratio}</OptionPill>)}
                    </div>
                    {size.ratioRequired ? <Hint text="此模型要求选择宽高比。" /> : null}
                </SettingGroup>
                {size.dimensions ? (
                    <DimensionSettings
                        activeSize={settings.size || ""}
                        rules={size.dimensions.rules}
                        boundsPublished={size.dimensions.boundsPublished}
                        examples={size.dimensions.examples}
                        allowAuto={false}
                        theme={theme}
                        onChange={onChange}
                    />
                ) : null}
                {size.note ? <Hint text={size.note} /> : null}
            </>
        );
    }
    return (
        <DimensionSettings
            activeSize={settings.size || ""}
            rules={size.rules}
            boundsPublished={size.boundsPublished}
            examples={size.examples}
            allowAuto={Boolean(size.allowAuto)}
            theme={theme}
            onChange={onChange}
            note={size.note}
        />
    );
}

function DimensionSettings({ activeSize, rules, boundsPublished, examples = [], allowAuto, theme, onChange, note }: { activeSize: string; rules: ImageDimensionRules; boundsPublished: boolean; examples?: readonly string[]; allowAuto: boolean; theme: CanvasTheme; onChange: (value: string) => void; note?: string }) {
    const fallback = constrainImageDimensions(1024, 1024, rules);
    const dimensions = readSizeDimensions(activeSize, fallback);
    const update = (key: "width" | "height", value: number | null) => {
        const next = constrainImageDimensions(key === "width" ? value || dimensions.width : dimensions.width, key === "height" ? value || dimensions.height : dimensions.height, rules);
        onChange(`${next.width}x${next.height}`);
    };
    const choices = [...new Set(examples.filter(Boolean))];
    return (
        <SettingGroup title="精确尺寸" color={theme.node.muted}>
            {allowAuto ? <OptionPill selected={activeSize.toLowerCase() === "auto"} theme={theme} onClick={() => onChange("auto")}>auto</OptionPill> : null}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                <DimensionInput prefix="W" value={dimensions.width} min={rules.minWidth} max={rules.maxWidth} step={rules.multipleOf} theme={theme} onChange={(value) => update("width", value)} />
                <span className="text-lg opacity-45">×</span>
                <DimensionInput prefix="H" value={dimensions.height} min={rules.minHeight} max={rules.maxHeight} step={rules.multipleOf} theme={theme} onChange={(value) => update("height", value)} />
            </div>
            {choices.length ? <div className="grid grid-cols-2 gap-2.5">{choices.map((value) => <OptionPill key={value} selected={enumEquals(activeSize, value)} theme={theme} onClick={() => onChange(value)}>{value}</OptionPill>)}</div> : null}
            <Hint text={`${boundsPublished ? "已验证边界" : "完整边界未验证"}：${formatDimensionRules(rules)}`} />
            {note ? <Hint text={note} /> : null}
        </SettingGroup>
    );
}

function CountSettings({ capability, settings, quickCount, theme, onChange }: { capability: ResolvedImageModelCapability; settings: ImageAdvancedSettings; quickCount: number; theme: CanvasTheme; onChange: (value: string) => void }) {
    const countCapability = imageOutputCountCapability(capability, settings.sequential === true);
    const count = readPositiveInteger(settings.count || "1");
    const min = countCapability.state === "supported" ? countCapability.min : 1;
    const max = countCapability.state === "supported" ? countCapability.max : countCapability.state === "unsupported" ? 1 : null;
    const visibleQuickCount = quickCount ?? 10;
    const quickMax = Math.max(min, Math.min(max ?? visibleQuickCount, visibleQuickCount));
    const quickValues = Array.from({ length: quickMax - min + 1 }, (_, index) => min + index);
    const invalid = count < min || (max !== null && count > max);
    return (
        <SettingGroup title="生成张数" color={theme.node.muted}>
            <div className="grid grid-cols-4 gap-2.5">
                {quickValues.map((value) => <OptionPill key={value} selected={count === value} theme={theme} onClick={() => onChange(String(value))}>{value} 张</OptionPill>)}
                <CountInput value={count} min={min} max={max ?? undefined} theme={theme} onChange={(value) => onChange(String(value || min))} />
            </div>
            {countCapability.state === "supported" ? (
                <Hint text={`允许 ${min}–${max ?? "未公布上限"} 张；${countCapability.transport === "client-fanout" ? "客户端逐次生成" : "provider 原生批量"}。`} />
            ) : <FieldState capability={countCapability} savedValue={settings.count} theme={theme} />}
            {invalid ? <Hint text={`当前保存值 ${count} 超出该合同范围；不会静默截断，请选择有效张数。`} danger /> : null}
        </SettingGroup>
    );
}

function AdvancedSettings({ settings, capability, disabled, theme, onChange }: { settings: ImageAdvancedSettings; capability: ResolvedImageModelCapability; disabled: boolean; theme: CanvasTheme; onChange: (settings: ImageAdvancedSettings) => void }) {
    const fields = capability.advancedFields;
    const outputFormatSupported = capability.outputFormat.state === "supported" && capability.outputFormat.requestable !== false;
    const supportedCount = Object.values(fields).filter((field) => field.state === "supported").length + (outputFormatSupported ? 1 : 0);
    const unknownCount = Object.values(fields).filter((field) => field.state === "unknown").length;
    const patch = (next: Partial<ImageAdvancedSettings>) => onChange({ ...settings, ...next });
    return (
        <SettingGroup title="高级参数" color={theme.node.muted}>
            <Hint text="支持负面词、Seed、步数、CFG 以及直接添加 Civitai / Fal LoRA（支持 AIR、版本 ID、模型 ID、直链 URL）。" />
            {disabled && supportedCount ? <Hint text="请先选择可用的图片 provider 和模型。" danger /> : null}
            {outputFormatSupported ? (
                <AdvancedField label="输出格式" capability={capability.outputFormat}>
                    <EnumSelect value={settings.outputFormat || ""} values={capability.outputFormat.values} disabled={disabled} theme={theme} onChange={(value) => patch({ outputFormat: value })} />
                </AdvancedField>
            ) : null}
            <AdvancedField label="负面提示词" capability={fields.negativePrompt}>
                <textarea value={settings.negativePrompt || ""} maxLength={fields.negativePrompt && fields.negativePrompt.state === "supported" && fields.negativePrompt.kind === "string" ? fields.negativePrompt.maxLength : 2000} disabled={disabled} rows={3} className="w-full resize-y rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text }} placeholder="负面提示词（不想出现的内容，可空）" onChange={(event) => patch({ negativePrompt: event.target.value })} />
            </AdvancedField>
            <div className="grid grid-cols-2 gap-2.5">
                <AdvancedField label="Seed" capability={fields.seed}>
                    <div className="flex items-center gap-1.5">
                        <TextInput value={settings.seed || ""} disabled={disabled} inputMode="numeric" placeholder="默认 (-1 随机)" theme={theme} onChange={(value) => patch({ seed: value })} />
                        <button type="button" disabled={disabled} title="随机种子" className="grid size-9 shrink-0 place-items-center rounded-xl border text-sm hover:opacity-80 active:scale-95 transition-all" style={{ borderColor: theme.node.stroke, color: theme.node.text }} onClick={() => patch({ seed: String(Math.floor(Math.random() * 2147483647)) })}>🎲</button>
                    </div>
                </AdvancedField>
                <AdvancedField label="Steps (步数)" capability={fields.steps}>
                    <TextInput value={settings.steps !== undefined ? String(settings.steps) : ""} disabled={disabled} inputMode="numeric" placeholder="步数 (如 25)" theme={theme} onChange={(value) => patch({ steps: value ? Number(value) : undefined })} />
                </AdvancedField>
                <AdvancedField label="CFG / Guidance" capability={fields.cfgScale}>
                    <TextInput value={settings.cfgScale !== undefined ? String(settings.cfgScale) : ""} disabled={disabled} inputMode="text" placeholder="引导系数 (如 7)" theme={theme} onChange={(value) => patch({ cfgScale: value ? Number(value) : undefined })} />
                </AdvancedField>
                <AdvancedField label="CLIP Skip" capability={fields.clipSkip}>
                    <TextInput value={settings.clipSkip !== undefined ? String(settings.clipSkip) : ""} disabled={disabled} inputMode="numeric" placeholder="跳过层数 (如 1 或 2)" theme={theme} onChange={(value) => patch({ clipSkip: value ? Number(value) : undefined })} />
                </AdvancedField>
            </div>
            {fields.sampler.state === "supported" && fields.sampler.kind === "enum" ? <AdvancedField label="Sampler" capability={fields.sampler}><EnumSelect value={settings.sampler || ""} values={fields.sampler.values} disabled={disabled} theme={theme} onChange={(value) => patch({ sampler: value })} /></AdvancedField> : null}
            {fields.scheduler.state === "supported" && fields.scheduler.kind === "enum" ? <AdvancedField label="Scheduler" capability={fields.scheduler}><EnumSelect value={settings.scheduler || ""} values={fields.scheduler.values} disabled={disabled} theme={theme} onChange={(value) => patch({ scheduler: value })} /></AdvancedField> : null}
            {fields.sequential.state === "supported" && fields.sequential.kind === "boolean" ? (
                <AdvancedField label="连续组图" capability={fields.sequential}>
                    <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: theme.node.stroke }}>
                        <input type="checkbox" checked={settings.sequential === true} disabled={disabled} onChange={(event) => patch({ sequential: event.target.checked })} />
                        <span>{settings.sequential === true ? "已启用（最多 12 张）" : "未启用（最多 4 张）"}</span>
                    </label>
                </AdvancedField>
            ) : null}
            <LoraEditor
                settings={settings}
                capability={
                    fields.loras.state === "supported" && fields.loras.kind === "number-map"
                        ? fields.loras
                        : {
                            state: "supported",
                            kind: "number-map",
                            wireName: "loras",
                            min: 0,
                            max: 2,
                            note: "Civitai / Fal LoRA",
                        }
                }
                provider={capability.provider}
                targetModel={capability.model}
                disabled={disabled}
                theme={theme}
                onChange={(loras) => patch({ loras })}
            />
            <Hint text="已设置的高级参数与 LoRA 将在生成时自动提交给模型引擎。" />
        </SettingGroup>
    );
}

function AdvancedField({ label, capability, children }: { label: string; capability?: { readonly note?: string } | any; children: ReactNode }) {
    const note = capability && typeof capability === "object" && "note" in capability ? (capability as any).note : undefined;
    return <label className="block space-y-1.5"><span className="text-[11px] font-medium opacity-65">{label}</span>{children}{note ? <Hint text={note} /> : null}</label>;
}

function LoraEditor({ settings, capability, provider, targetModel, disabled, theme, onChange }: { settings: ImageAdvancedSettings; capability: Extract<ImageAdvancedFieldCapability, { state: "supported"; kind: "number-map" }>; provider: string; targetModel: string; disabled: boolean; theme: CanvasTheme; onChange: (loras: NonNullable<ImageAdvancedSettings["loras"]>) => void }) {
    const loras = settings.loras || [];
    const directPathMode = provider === "fal";
    const [resolvingIndex, setResolvingIndex] = useState<number | null>(null);
    const update = (index: number, patch: Partial<(typeof loras)[number]>) => onChange(loras.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
    const updateIdentity = (index: number, identity: { resource?: string; resourceKind?: CivitaiLoraResourceKind }) => {
        const entry = loras[index];
        if (!entry) return;
        const nextIdentity = directPathMode ? { ...identity, resourceKind: "url" as const } : identity;
        onChange(loras.map((candidate, entryIndex) => entryIndex === index ? resetImageLoraResolution(entry, nextIdentity) : candidate));
    };
    const resolveEntry = async (index: number, selectedVersionId?: string) => {
        if (directPathMode) return;
        const entry = loras[index];
        if (!entry || resolvingIndex !== null) return;
        setResolvingIndex(index);
        try {
            const resolution = await resolveCivitaiLoraResource({
                kind: entry.resourceKind,
                value: entry.resource,
                targetModel,
                ...(selectedVersionId ? { selectedVersionId } : {}),
            });
            onChange(loras.map((candidate, entryIndex) => entryIndex === index ? applyCivitaiLoraResolution(entry, resolution) : candidate));
        } catch (error) {
            onChange(loras.map((candidate, entryIndex) => entryIndex === index ? imageLoraResolutionError(entry, error) : candidate));
        } finally {
            setResolvingIndex(null);
        }
    };
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-[11px] font-medium opacity-65">{directPathMode ? "LoRA（公开权重 path）" : "LoRA（AIR / 模型 ID / 版本 ID）"}</span><button type="button" disabled={disabled} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] disabled:opacity-45" style={{ borderColor: theme.node.stroke }} onClick={() => onChange([...loras, { resource: "", resourceKind: directPathMode ? "url" : "air", weight: 1, resolutionStatus: "unresolved" }])}><Plus className="size-3" />添加</button></div>
            {loras.map((entry, index) => (
                <div key={index} className="space-y-1.5 rounded-xl border p-2" style={{ borderColor: theme.node.stroke }}>
                    <div className="grid grid-cols-[92px_minmax(0,1fr)_68px_30px] gap-2">
                        {directPathMode ? (
                            <div className="grid h-9 min-w-0 place-items-center rounded-xl border px-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>公开 path</div>
                        ) : (
                            <select aria-label={`LoRA ${index + 1} 资源类型`} value={entry.resourceKind} disabled={disabled || resolvingIndex === index} className="h-9 min-w-0 rounded-xl border bg-transparent px-2 text-xs outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.toolbar.panel }} onChange={(event) => updateIdentity(index, { resourceKind: event.target.value as CivitaiLoraResourceKind })}>
                                <option value="air">AIR</option>
                                <option value="version-id">版本 ID</option>
                                <option value="model-id">模型 ID</option>
                                {entry.resourceKind === "url" ? <option value="url" disabled>直链（不支持）</option> : null}
                            </select>
                        )}
                        <TextInput value={entry.resource} disabled={disabled || resolvingIndex === index} placeholder={directPathMode ? loraResourcePlaceholder("url") : loraResourcePlaceholder(entry.resourceKind)} theme={theme} onChange={(resource) => updateIdentity(index, { resource })} />
                        <input aria-label={`LoRA ${index + 1} 权重`} type="number" value={Number.isFinite(entry.weight) ? entry.weight : ""} min={capability.min} max={capability.max} step="any" disabled={disabled} className="h-9 min-w-0 rounded-xl border bg-transparent px-2 text-sm outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text }} onChange={(event) => update(index, { weight: Number(event.target.value) })} />
                        <button type="button" disabled={disabled || resolvingIndex === index} aria-label={`移除 LoRA ${index + 1}`} className="grid size-9 place-items-center rounded-xl border disabled:opacity-45" style={{ borderColor: theme.node.stroke }} onClick={() => onChange(loras.filter((_, entryIndex) => entryIndex !== index))}><X className="size-3.5" /></button>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                        {directPathMode ? <DirectLoraResolutionState entry={entry} theme={theme} /> : <LoraResolutionState entry={entry} theme={theme} onSelectVersion={(versionId) => void resolveEntry(index, versionId)} disabled={disabled || resolvingIndex === index} />}
                        {!directPathMode ? <button type="button" disabled={disabled || resolvingIndex !== null || !entry.resource.trim()} className="shrink-0 rounded-lg border px-2 py-1 text-[11px] disabled:opacity-45" style={{ borderColor: theme.node.stroke }} onClick={() => void resolveEntry(index)}>{resolvingIndex === index ? "解析中…" : entry.resolutionStatus === "resolved" ? "重新解析" : "解析"}</button> : null}
                    </div>
                </div>
            ))}
            {!loras.length ? <Hint text={directPathMode ? "未添加 LoRA。填写公开 https:// 权重 URL 或 hf:// repo/path；不会调用 Civitai 解析。" : "未添加 LoRA。ID 会通过 Civitai 官方只读接口解析为精确 model-version AIR；下载 URL 不支持反查；不会猜测缺失权重。"} /> : null}
            {capability.note ? <Hint text={capability.note} /> : null}
        </div>
    );
}

function DirectLoraResolutionState({ entry, theme }: { entry: NonNullable<ImageAdvancedSettings["loras"]>[number]; theme: CanvasTheme }) {
    const resource = entry.resource.trim();
    return <div className="min-w-0 text-[10px] leading-4" style={{ color: theme.node.muted }}>{resource ? "直接发送公开权重 path；不会调用 Civitai 解析。" : "填写 https:// 权重 URL 或 hf:// repo/path。"}</div>;
}

function LoraResolutionState({ entry, theme, onSelectVersion, disabled }: { entry: NonNullable<ImageAdvancedSettings["loras"]>[number]; theme: CanvasTheme; onSelectVersion: (versionId: string) => void; disabled: boolean }) {
    if (entry.resolutionStatus === "resolved" && entry.resolvedAir) {
        return <div className="min-w-0 text-[10px] leading-4" style={{ color: theme.node.muted }}><div className="font-medium">已解析 · {entry.versionName || entry.modelVersionId || "model-version"}</div><div className="break-all">{entry.resolvedAir}</div>{entry.baseModel ? <div>baseModel: {entry.baseModel}</div> : null}</div>;
    }
    if (entry.resolutionStatus === "version-selection-required" && entry.versionOptions?.length) {
        return (
            <label className="min-w-0 flex-1 space-y-1 text-[10px]" style={{ color: theme.node.muted }}>
                <span>模型包含多个版本，请明确选择；不会自动取第一项。</span>
                <select aria-label="选择精确 LoRA 版本" defaultValue="" disabled={disabled} className="h-8 w-full min-w-0 rounded-lg border px-2 text-[11px] outline-none" style={{ borderColor: theme.node.stroke, color: theme.node.text, background: theme.toolbar.panel }} onChange={(event) => event.target.value && onSelectVersion(event.target.value)}>
                    <option value="">选择版本…</option>
                    {entry.versionOptions.map((version) => <option key={version.modelVersionId} value={version.modelVersionId} disabled={version.compatible === false}>{version.name} · {version.modelVersionId}{version.baseModel ? ` · ${version.baseModel}` : " · 兼容性待版本接口确认"}{version.compatible === false ? " · 不兼容" : ""}</option>)}
                </select>
            </label>
        );
    }
    if (entry.resolutionStatus === "error" && entry.resolutionError) return <div className="min-w-0 break-words text-[10px] leading-4 text-red-400">{entry.resolutionError}</div>;
    return <div className="min-w-0 text-[10px] leading-4" style={{ color: theme.node.muted }}>未解析；数字 ID 不会直接写入请求。</div>;
}

function loraResourcePlaceholder(kind: CivitaiLoraResourceKind) {
    if (kind === "model-id") return "Civitai 模型 ID";
    if (kind === "version-id") return "Civitai 版本 ID";
    if (kind === "url") return "https://...safetensors 或 hf://...";
    return "urn:air:…:lora:civitai:…@…";
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: { Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text } },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function normalizeImageQuality(value?: string) {
    const normalized = String(value || "").trim();
    return normalized || "1k";
}

export function imageQualityLabel(value: string, capability?: { quality?: { state?: string }; size?: { state?: string; kind?: string } }) {
    if (capability?.quality?.state === "unsupported" && capability.size?.kind !== "tier-and-ratio") {
        return "不支持";
    }
    const raw = String(value || "").trim();
    if (!raw) return "provider 默认";
    return raw;
}

export function imageSizeLabel(size: string) {
    return String(size || "").trim() || "provider 默认";
}

export function imageAdvancedSettingsLabel(settings: ImageAdvancedSettings | undefined) {
    if (!settings) return "未设置";
    const scalarCount = [settings.outputFormat, settings.negativePrompt, settings.seed, settings.steps, settings.cfgScale, settings.sampler, settings.scheduler]
        .filter((value) => value !== undefined && value !== "").length;
    const loraCount = (settings.loras || []).filter((entry) => entry.resource.trim() && Number.isFinite(entry.weight)).length;
    const count = scalarCount + loraCount;
    return count ? `${count} 项` : "未设置";
}

function OptionPill({ selected, theme, onClick, children, disabled = false }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode; disabled?: boolean }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: selected ? theme.node.fill : "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function DimensionInput({ prefix, value, min, max, step, theme, onChange }: { prefix: string; value: number; min?: number; max?: number; step?: number; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    const commit = (input: HTMLInputElement) => {
        const next = Math.max(1, Math.floor(Number(input.value) || value || 1024));
        input.value = String(next);
        onChange(next);
    };

    return (
        <label className="flex h-9 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text }}>
            <span className="grid w-9 place-items-center" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input
                type="number"
                min={min ?? 1}
                max={max}
                step={step ?? 1}
                className="min-w-0 flex-1 bg-transparent px-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                defaultValue={value || ""}
                key={`${prefix}-${value}`}
                onBlur={(event) => commit(event.currentTarget)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                }}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function CountInput({ value, min, max, theme, onChange }: { value: number; min: number; max?: number; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="col-span-2 flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input
                type="number"
                min={min}
                max={max}
                className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                value={value || ""}
                onChange={(event) => onChange(Number(event.target.value) || null)}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function TextInput({ value, placeholder, disabled = false, inputMode, theme, onChange }: { value: string; placeholder?: string; disabled?: boolean; inputMode?: "numeric" | "text"; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <input
            type="text"
            value={value}
            inputMode={inputMode}
            placeholder={placeholder}
            disabled={disabled}
            className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none disabled:opacity-45"
            style={{ borderColor: theme.node.stroke, color: theme.node.text }}
            onChange={(event) => onChange(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
        />
    );
}

function NumberInput({ value, capability, disabled, theme, onChange }: { value?: number; capability: Extract<ImageAdvancedFieldCapability, { state: "supported"; kind: "number" }>; disabled: boolean; theme: CanvasTheme; onChange: (value: number | undefined) => void }) {
    return (
        <input
            type="number"
            value={value ?? ""}
            min={capability.min}
            max={capability.max}
            step={capability.integer ? 1 : "any"}
            disabled={disabled}
            placeholder="provider 默认"
            className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none disabled:opacity-45"
            style={{ borderColor: theme.node.stroke, color: theme.node.text }}
            onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
        />
    );
}

function EnumSelect({ value, values, disabled, theme, onChange }: { value: string; values: readonly string[]; disabled: boolean; theme: CanvasTheme; onChange: (value: string) => void }) {
    const selected = matchingEnumValue(value, values);
    return (
        <select value={selected || (value ? "__preserved__" : "")} disabled={disabled} className="h-9 w-full rounded-xl border bg-transparent px-3 text-sm outline-none disabled:opacity-45" style={{ borderColor: theme.node.stroke, color: theme.node.text }} onChange={(event) => onChange(event.target.value === "__preserved__" ? value : event.target.value)}>
            <option value="">provider 默认</option>
            {!selected && value ? <option value="__preserved__">已保存但当前不支持：{value}</option> : null}
            {values.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return <div className="space-y-2.5"><div className="text-xs font-medium" style={{ color }}>{title}</div>{children}</div>;
}

function Hint({ text, danger = false }: { text: string; danger?: boolean }) {
    return <div className="text-[11px] leading-4" style={{ color: danger ? "#ef4444" : undefined, opacity: danger ? 1 : 0.58 }}>{text}</div>;
}

function PreservedValue({ value, theme }: { value: string; theme: CanvasTheme }) {
    return <div className="rounded-lg border px-2.5 py-1.5 text-[11px]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>已保留旧值“{value}”，但当前合同不接受；选择有效值后才会替换。</div>;
}

function FieldState({ capability, savedValue, theme }: { capability: { state: string; reason?: string }; savedValue?: string; theme: CanvasTheme }) {
    const label = capability.state === "unsupported" ? "不支持" : capability.state === "unknown" ? "未验证" : "不可配置";
    return (
        <div className="rounded-lg border px-2.5 py-2 text-[11px] leading-4" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
            <div className="font-semibold">{label}{capability.reason ? `：${capability.reason}` : ""}</div>
            {savedValue ? <div className="mt-1">已保存值“{savedValue}”会保留，但不会作为当前 capability 字段提交。</div> : null}
        </div>
    );
}

function readSizeDimensions(size: string, fallback: { width: number; height: number }) {
    const match = String(size || "").match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
    return {
        width: match ? Number(match[1]) : fallback.width,
        height: match ? Number(match[2]) : fallback.height,
    };
}

function formatDimensionRules(rules: ImageDimensionRules) {
    const parts: string[] = [];
    if (rules.minWidth !== undefined || rules.maxWidth !== undefined) parts.push(`宽 ${rules.minWidth ?? 1}–${rules.maxWidth ?? "未公布"}`);
    if (rules.minHeight !== undefined || rules.maxHeight !== undefined) parts.push(`高 ${rules.minHeight ?? 1}–${rules.maxHeight ?? "未公布"}`);
    if (rules.minPixels !== undefined) parts.push(`至少 ${rules.minPixels.toLocaleString()} 像素`);
    if (rules.maxPixels !== undefined) parts.push(`至多 ${rules.maxPixels.toLocaleString()} 像素`);
    if (rules.multipleOf !== undefined) parts.push(`宽高均为 ${rules.multipleOf} 的倍数`);
    if (rules.maxAspectRatio !== undefined) parts.push(`长短边 ≤ ${rules.maxAspectRatio}:1`);
    return parts.length ? parts.join("；") : "官方未公布数值边界，输入值保持原样";
}

function readPositiveInteger(value: string) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function operationLabel(operation: ImageOperation) {
    if (operation === "edit") return "参考图编辑";
    if (operation === "variation") return "图片变体";
    if (operation === "responses-tool") return "Responses 图片工具";
    return "文生图";
}

function matchingEnumValue(value: string, values: readonly string[]) {
    const direct = values.find((candidate) => enumEquals(value, candidate));
    if (direct) return direct;
    const aliases: Record<string, readonly string[]> = {
        "1k": ["low", "1k"],
        "2k": ["medium", "2k"],
        "4k": ["high", "3k", "4k"],
        auto: ["auto", "low", "1k"],
        low: ["low", "1k"],
        medium: ["medium", "2k"],
        high: ["high", "4k"],
    };
    const candidates = aliases[String(value || "").trim().toLowerCase()] || [];
    return values.find((candidate) => candidates.some((alias) => enumEquals(candidate, alias))) || "";
}

function enumEquals(left: string, right: string) {
    return String(left || "").trim().toLowerCase().replace(/[×*]/g, "x") === String(right || "").trim().toLowerCase().replace(/[×*]/g, "x");
}
