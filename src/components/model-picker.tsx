"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { ModelIcon, ModelLabel } from "@/components/model-icon";
import { providerModelTriggerAccessibility } from "@/components/provider-model-picker-accessibility";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    decodeProviderModelSelection,
    encodeProviderModelSelection,
    modelMatchesAllowedModel,
    normalizeModelList,
    providerDisplayName,
    resolveConfiguredModel,
    type ProviderModelOption,
    type ProviderModelSelection,
} from "@/stores/api-relay-config";
import { selectableModelsByCapability, selectableProviderModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

export type ModelSelectControlProps = {
    models: readonly string[];
    value?: string;
    onChange: (model: string) => void;
    placeholder?: string;
    emptyLabel?: string;
    disabled?: boolean;
    title?: string;
    triggerClassName?: string;
    contentClassName?: string;
    triggerStyle?: CSSProperties;
    contentAlign?: "start" | "center" | "end";
    contentSide?: "top" | "right" | "bottom" | "left";
    contentSideOffset?: number;
    onMissingConfig?: () => void;
};

export function ModelSelectControl({
    models,
    value,
    onChange,
    placeholder = "选择模型",
    emptyLabel = "暂无已配置模型",
    disabled = false,
    title,
    triggerClassName,
    contentClassName,
    triggerStyle,
    contentAlign = "start",
    contentSide = "bottom",
    contentSideOffset = 6,
    onMissingConfig,
}: ModelSelectControlProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const aliasMigrationRef = useRef("");
    const options = useMemo(() => normalizeModelList([...models]), [models]);
    const requested = String(value || "").trim();
    // Keep an explicit node model visible even while its provider is unavailable
    // or ambiguous. Submission routing will surface that state as an error; the
    // picker must not make the saved choice look as though it was silently lost.
    const current = resolveConfiguredModel(requested, options) || requested;

    useEffect(() => {
        const migrationKey = current && current !== requested ? `${requested}\u0000${current}` : "";
        if (!migrationKey) {
            aliasMigrationRef.current = "";
            return;
        }
        if (aliasMigrationRef.current === migrationKey) return;
        aliasMigrationRef.current = migrationKey;
        onChange(current);
    }, [current, onChange, requested]);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={current || undefined}
            disabled={disabled}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length) onMissingConfig?.();
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={(model) => {
                if (options.includes(model)) onChange(model);
            }}
        >
            <SelectTrigger
                className={cn(
                    "model-select-trigger h-10 min-w-0 select-none justify-start gap-2 rounded-xl border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    triggerClassName,
                )}
                style={triggerStyle}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={title || current || placeholder}
                aria-label={title || placeholder}
            >
                {current ? <ModelIcon model={current} /> : null}
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current || placeholder}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className={cn("z-[1200] w-80 max-w-[calc(100vw-24px)] select-none rounded-xl border border-border/70 bg-popover p-1 shadow-xl", contentClassName)}
                position="popper"
                align={contentAlign}
                side={contentSide}
                sideOffset={contentSideOffset}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.length ? (
                    options.map((model) => (
                        <SelectItem key={model} value={model} textValue={model}>
                            <ModelLabel model={model} />
                        </SelectItem>
                    ))
                ) : (
                    <SelectItem value="__empty_model_list__" disabled>
                        {emptyLabel}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

export type ProviderModelSelectControlProps = {
    options: readonly ProviderModelOption[];
    value?: ProviderModelSelection | null;
    legacyValue?: string;
    savedProviderName?: string;
    onChange: (selection: ProviderModelSelection) => void;
    placeholder?: string;
    emptyLabel?: string;
    disabled?: boolean;
    title?: string;
    triggerClassName?: string;
    contentClassName?: string;
    triggerStyle?: CSSProperties;
    contentAlign?: "start" | "center" | "end";
    contentSide?: "top" | "right" | "bottom" | "left";
    contentSideOffset?: number;
    onMissingConfig?: () => void;
};

/**
 * Global selector whose value is a provider/model pair. This is intentionally
 * separate from ModelSelectControl: settings rows already have an explicit
 * provider selector and should continue to persist a local model string.
 */
export function ProviderModelSelectControl({
    options,
    value,
    legacyValue = "",
    savedProviderName = "",
    onChange,
    placeholder = "选择模型",
    emptyLabel = "暂无已配置模型",
    disabled = false,
    title,
    triggerClassName,
    contentClassName,
    triggerStyle,
    contentAlign = "start",
    contentSide = "bottom",
    contentSideOffset = 6,
    onMissingConfig,
}: ProviderModelSelectControlProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const normalizedValue = value && value.providerId.trim() && value.model.trim()
        ? { providerId: value.providerId.trim(), model: value.model.trim() }
        : null;
    const currentOption = normalizedValue
        ? options.find((option) => option.providerId === normalizedValue.providerId && option.model === normalizedValue.model)
        : undefined;
    const normalizedLegacyValue = String(legacyValue || "").trim();
    // Keep an unavailable saved pair visible instead of silently replacing it
    // with the first provider after a catalog refresh or provider removal.
    const displayOption = currentOption || (normalizedValue
        ? {
              providerId: normalizedValue.providerId,
              model: normalizedValue.model,
              providerName: savedProviderName || normalizedValue.providerId,
              value: encodeProviderModelSelection(normalizedValue),
              label: `${savedProviderName || normalizedValue.providerId} · ${normalizedValue.model}`,
          }
        : normalizedLegacyValue
          ? {
                providerId: "",
                model: normalizedLegacyValue,
                providerName: "请选择中转",
                value: `legacy-provider-model:${encodeURIComponent(normalizedLegacyValue)}`,
                label: `请选择中转 · ${normalizedLegacyValue}`,
            }
          : undefined);
    const visibleOptions = currentOption || !displayOption
        ? options
        : [displayOption, ...options];
    const triggerAccessibility = providerModelTriggerAccessibility(title, displayOption?.label, placeholder);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={displayOption?.value || undefined}
            disabled={disabled}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !visibleOptions.length) onMissingConfig?.();
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={(encoded) => {
                const decoded = decodeProviderModelSelection(encoded);
                if (!decoded) return;
                const option = visibleOptions.find((candidate) => candidate.value === encoded);
                if (option) onChange({ providerId: option.providerId, model: option.model });
                else onChange(decoded);
            }}
        >
            <SelectTrigger
                className={cn(
                    "model-select-trigger min-h-10 h-auto min-w-0 select-none justify-start gap-2 rounded-xl border border-input bg-transparent px-3 py-1.5 text-sm font-normal shadow-sm transition-colors",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    triggerClassName,
                )}
                style={triggerStyle}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={triggerAccessibility.title}
                aria-label={triggerAccessibility.ariaLabel}
            >
                {displayOption ? <ModelIcon model={displayOption.model} /> : null}
                <ProviderModelTriggerLabel option={displayOption} placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className={cn("z-[1200] w-[28rem] max-w-[calc(100vw-24px)] select-none rounded-xl border border-border/70 bg-popover p-1 shadow-xl", contentClassName)}
                position="popper"
                align={contentAlign}
                side={contentSide}
                sideOffset={contentSideOffset}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {visibleOptions.length ? (
                    visibleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} textValue={option.label} disabled={!option.providerId}>
                            <ModelLabel model={option.model} label={option.label} />
                        </SelectItem>
                    ))
                ) : (
                    <SelectItem value="__empty_provider_model_list__" disabled>
                        {emptyLabel}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    allowedModels?: readonly string[];
    onMissingConfig?: () => void;
};

export type ProviderModelPickerProps = {
    config: AiConfig;
    value?: ProviderModelSelection | null;
    legacyValue?: string;
    onChange: (selection: ProviderModelSelection) => void;
    capability: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    allowedModels?: readonly string[];
    onMissingConfig?: () => void;
};

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder = "选择模型", allowedModels, onMissingConfig }: ModelPickerProps) {
    const options = useMemo(() => {
        const configuredModels = selectableModelsByCapability(config, capability);
        if (!allowedModels?.length) return configuredModels;
        return configuredModels.filter((model) => modelMatchesAllowedModel(model, allowedModels));
    }, [allowedModels, capability, config]);
    return (
        <ModelSelectControl
            models={options}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            emptyLabel={emptyModelLabel(capability)}
            onMissingConfig={onMissingConfig}
            triggerClassName={cn(
                "canvas-composer-model-picker h-8 w-fit max-w-full rounded-full",
                fullWidth ? "w-full min-w-0" : "min-w-[9rem]",
                className,
            )}
        />
    );
}

/** Provider-aware counterpart for global/canvas selectors. */
export function ProviderModelPicker({
    config,
    value,
    legacyValue,
    onChange,
    capability,
    className,
    fullWidth = false,
    placeholder = "选择模型",
    allowedModels,
    onMissingConfig,
}: ProviderModelPickerProps) {
    const options = useMemo(() => {
        const configured = selectableProviderModelsByCapability(config, capability);
        if (!allowedModels?.length) return configured;
        return configured.filter((option) => modelMatchesAllowedModel(option.model, allowedModels));
    }, [allowedModels, capability, config]);
    const savedProvider = value?.providerId
        ? config.apiRelays.find((provider) => provider.id === value.providerId)
        : undefined;
    const savedProviderName = savedProvider
        ? providerDisplayName(savedProvider, config.apiRelays)
        : "";

    return (
        <ProviderModelSelectControl
            options={options}
            value={value}
            legacyValue={legacyValue}
            savedProviderName={savedProviderName}
            onChange={onChange}
            placeholder={placeholder}
            emptyLabel={emptyModelLabel(capability)}
            onMissingConfig={onMissingConfig}
            triggerClassName={cn(
                "canvas-composer-model-picker h-auto min-h-8 w-fit max-w-full rounded-xl",
                fullWidth ? "w-full min-w-0" : "min-w-[16rem]",
                className,
            )}
        />
    );
}

function prettyRelayName(providerName: string, label?: string) {
    const known: Record<string, string> = {
        "preset-grok-relay": "Grok 中转",
        "preset-xai-official": "xAI 官方",
        "preset-agnes": "Agnes",
        "preset-sensenova": "商汤日日新",
        "preset-superxihe-grok": "SuperXihe Grok",
        "preset-superxihe-image": "SuperXihe 生图",
        "preset-openai": "OpenAI 官方",
        "preset-volcengine-plan": "火山方舟",
        "preset-aliyun-tokenplan": "阿里云百炼",
        "preset-minimax": "MiniMax 海螺",
        "preset-kling": "可灵 Kling",
        "preset-fal": "Fal",
    };
    if (known[providerName]) return known[providerName];
    if (/^preset-/.test(providerName)) {
        const fromLabel = String(label || "").split("·")[0]?.trim();
        if (fromLabel && !/^preset-/.test(fromLabel)) return fromLabel;
    }
    return providerName;
}

function ProviderModelTriggerLabel({
    option,
    placeholder,
}: {
    option?: { providerName?: string; model?: string; label?: string; providerId?: string };
    placeholder: string;
}) {
    if (!option) {
        return <span className="canvas-model-picker-text min-w-0 flex-1 text-left">{placeholder}</span>;
    }
    const providerName = String(option.providerName || option.providerId || "").trim();
    const model = String(option.model || "").trim();
    const prettyProvider = prettyRelayName(providerName, option.label);
    if (prettyProvider && model) {
        return (
            <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">
                <span className="opacity-70">{prettyProvider}</span>
                <span className="px-1 opacity-40">·</span>
                <span className="font-medium">{model}</span>
            </span>
        );
    }
    return <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{option.label || placeholder}</span>;
}

function emptyModelLabel(capability?: ModelCapability) {
    const label = capability === "image" ? "生图" : capability === "video" ? "视频" : capability === "text" ? "文本" : capability === "audio" ? "音频" : "";
    return `暂无已配置${label}模型`;
}

export function StudioModelPicker({ capability, value, onChange }: { capability: "image" | "video" | "text"; value: string; onChange: (value: string) => void }) {
    const groups = [
        { id: "preset-volcengine-plan", name: "火山方舟", models: capability === "image" ? ["doubao-seedream-5.0-lite"] : [] },
        { id: "preset-superxihe-grok", name: "Grok Imagine", models: capability === "video" ? ["grok-imagine-video"] : capability === "text" ? ["grok-4.6"] : ["grok-imagine-image"] },
        { id: "preset-superxihe-image", name: "GPT Image", models: capability === "image" ? ["gpt-image-2", "gpt-image-1.5"] : [] },
        { id: "preset-civitai", name: "Civitai · mature", models: capability === "image" ? ["krea2-turbo", "seedream-4.5", "seedream-5.0-pro"] : [] },
    ].filter((item) => item.models.length);
    return (
        <label className="model-picker">
            模型
            <select value={value} onChange={(event) => onChange(event.target.value)}>
                {groups.map((group) => (
                    <optgroup key={group.id} label={group.name}>
                        {group.models.map((model) => (
                            <option key={`${group.id}::${model}`} value={`${group.id}::${model}`}>{model}</option>
                        ))}
                    </optgroup>
                ))}
            </select>
        </label>
    );
}
