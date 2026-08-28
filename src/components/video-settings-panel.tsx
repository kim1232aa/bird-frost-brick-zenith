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
    type ResolvedVideoModelCapability,
    type VideoGenerationParameterDescriptor,
    type VideoGenerationParameterName,
} from "@/services/api/video-model-capabilities";
import {
    readVideoDimensionsDraft,
    updateVideoDimensionsDraft,
    videoGenerationSettingsToRequest,
    type AiConfig,
    type VideoGenerationOperation,
    type VideoGenerationSettings,
    type VideoGenerationSettingsScope,
} from "@/stores/use-config-store";

type VideoSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "vquality" | "size" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "imageHostBaseUrl" | "imageHostApiKey", value: string) => void;
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
                <ImageHostSettingGroup config={config} onConfigChange={onConfigChange} theme={theme} />
            </div>
        </ImageSettingsTheme>
    );
}
