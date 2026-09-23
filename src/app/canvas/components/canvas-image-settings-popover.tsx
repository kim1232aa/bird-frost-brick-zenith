"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Settings2, X } from "lucide-react";
import { App, Button } from "antd";

import { IMAGE_SETTING_AUTO_LABEL, ImageSettingsPanel, imageAdvancedSettingsLabel, imageQualityLabel, imageSizeLabel, resolveImageSettingsContext, type ImageSettingsSection } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import type { ImageOperation, ResolvedImageModelCapability } from "@/services/api/image-model-capabilities";
import { useThemeStore } from "@/stores/use-theme-store";
import { flushConfigStore, persistApiSettingsBeforeClose, useConfigStore, readImageAdvancedSettings, writeImageAdvancedSettings, type AiConfig, type ImageAdvancedSettings, type ImageAdvancedSettingsScope } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    operation: ImageOperation;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onAdvancedSettingsChange?: (settings: ImageAdvancedSettings, scope: ImageAdvancedSettingsScope) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
    trigger?: ReactNode;
    sections?: ImageSettingsSection[];
    showTitle?: boolean;
};

function getModelParamsSummary(cap: ResolvedImageModelCapability): string {
    const parts: string[] = ["画幅"];
    const fields = cap.advancedFields;
    if (fields.steps.state === "supported") parts.push("精细度");
    if (fields.seed.state === "supported") parts.push("随机种子");
    if (fields.cfgScale.state === "supported") parts.push("引导强度");
    if (fields.loras.state === "supported") parts.push("风格权重");
    return parts.join(" · ");
}

export function CanvasImageSettingsPopover({ config, operation, onConfigChange, onAdvancedSettingsChange, onOpenChange, buttonClassName, placement = "topLeft", trigger, sections, showTitle }: CanvasImageSettingsPopoverProps) {
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const updateGlobalConfig = useConfigStore((state) => state.updateConfig);
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeInFlightRef = useRef(false);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const imageContext = resolveImageSettingsContext(config, operation);
    const capability = imageContext.capability;
    const scopedSettings = readImageAdvancedSettings(config.imageAdvancedSettingsByScope, imageContext.scope);
    const quality = imageQualityLabel(scopedSettings.quality || "", capability);
    const count = Number.isInteger(Number(scopedSettings.count)) && Number(scopedSettings.count) > 0 ? Number(scopedSettings.count) : 1;
    const activeSize = scopedSettings.size || IMAGE_SETTING_AUTO_LABEL;
    const applyOpen = useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    }, [onOpenChange]);
    const requestOpen = useCallback((nextOpen: boolean) => {
        if (nextOpen) {
            applyOpen(true);
            return;
        }
        applyOpen(false);
        if (!useConfigStore.getState().config.imageHostApiKey.trim()) {
            return;
        }
        if (closeInFlightRef.current) return;
        closeInFlightRef.current = true;
        void persistApiSettingsBeforeClose(
            flushConfigStore,
            () => {},
            (error) => { console.warn(error); },
        ).finally(() => {
            closeInFlightRef.current = false;
        });
    }, [applyOpen]);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            requestOpen(false);
        };

        syncPosition();
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            requestOpen(false);
        };
        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [open, requestOpen]);

    const handleConfigChange = (key: keyof AiConfig, value: string) => {
        if (key === "imageHostBaseUrl" || key === "imageHostApiKey") {
            updateGlobalConfig(key, value);
            return;
        }
        onConfigChange(key, value);
    };

    const handleAdvancedSettingsChange = (settings: ImageAdvancedSettings, scope: ImageAdvancedSettingsScope) => {
        updateGlobalConfig("imageAdvancedSettingsByScope", writeImageAdvancedSettings(config.imageAdvancedSettingsByScope, scope, settings));
        onAdvancedSettingsChange?.(settings, scope);
    };

    const panel = open && buttonRect ? <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} operation={operation} sections={sections} showTitle={showTitle} onClose={() => requestOpen(false)} onConfigChange={handleConfigChange} onAdvancedSettingsChange={handleAdvancedSettingsChange} messageInstance={message} /> : null;

    return (
        <>
            {trigger ? (
                <span
                    ref={buttonRef}
                    role="button"
                    tabIndex={0}
                    className="group block min-w-0 rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-white/70"
                    onClick={(event) => {
                        event.stopPropagation();
                        requestOpen(!open);
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        requestOpen(!open);
                    }}
                >
                    {trigger}
                </span>
            ) : (
                <span ref={buttonRef} className="inline-flex min-w-0">
                    <Button size="small" type="text" className={buttonClassName || "!h-auto !min-h-10 !min-w-[7.5rem] !justify-start !rounded-xl !px-2.5 !py-1"} style={{ background: theme.node.fill, color: theme.node.text }} icon={<Settings2 className="size-3.5" />} onClick={() => requestOpen(!open)}>
                        <span className="flex min-w-0 flex-col items-start leading-4">
                            <span>图片参数</span>
                            <span className="truncate text-[10px] opacity-70">
                                {imageSizeLabel(activeSize) === IMAGE_SETTING_AUTO_LABEL ? getModelParamsSummary(capability) : `${quality} · ${imageSizeLabel(activeSize)} · ${count} 张`}
                                {imageAdvancedSettingsLabel(scopedSettings) !== "未设置" ? ` · ${imageAdvancedSettingsLabel(scopedSettings)}` : ""}
                            </span>
                        </span>
                    </Button>
                </span>
            )}
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    operation,
    sections,
    showTitle,
    onClose,
    onConfigChange,
    onAdvancedSettingsChange,
    messageInstance,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    operation: ImageOperation;
    sections?: ImageSettingsSection[];
    showTitle?: boolean;
    onClose?: () => void;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onAdvancedSettingsChange: (settings: ImageAdvancedSettings, scope: ImageAdvancedSettingsScope) => void;
    messageInstance?: any;
}) {
    const width = 356;
    const gap = 8;
    const margin = 12;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const maxModalHeight = Math.min(640, window.innerHeight - 48);
    const spaceBelow = window.innerHeight - buttonRect.bottom - margin;
    const spaceAbove = buttonRect.top - margin;
    const placeAbove = topPlacement ? (spaceAbove >= 340 || spaceAbove > spaceBelow) : (spaceBelow < 340 && spaceAbove > spaceBelow);

    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        maxHeight: maxModalHeight,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(placeAbove
            ? { bottom: Math.max(margin, window.innerHeight - buttonRect.top + gap) }
            : { top: Math.max(margin, Math.min(window.innerHeight - maxModalHeight - margin, buttonRect.bottom + gap)) }),
        background: theme.toolbar.panel,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.24), 0 0 0 1px rgba(255,255,255,0.08)",
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        color: theme.node.text,
    } as const;

    return createPortal(
        <>
            <div
                aria-hidden
                className="fixed inset-0 backdrop-blur-[2px] cursor-pointer"
                style={{ zIndex: 1199, background: "rgba(12, 10, 9, 0.2)" }}
                onClick={onClose}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-label="图片参数"
                className="canvas-image-settings-popover"
                style={style}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 px-[18px] pb-2.5 pt-4">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">图像生成引擎配置</div>
                        <div className="mt-0.5 truncate text-[11px]" style={{ color: theme.node.muted }}>调整清晰度、画幅与生成张数</div>
                    </div>
                    <button
                        type="button"
                        aria-label="关闭"
                        className="grid size-8 shrink-0 place-items-center rounded-full border transition hover:opacity-80"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                        onClick={onClose}
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
                <div className="canvas-neutral-scrollbar min-h-0 flex-1 overflow-y-auto px-[18px] pb-12">
                    <ImageSettingsPanel config={config} operation={operation} onConfigChange={(key, value) => onConfigChange(key, value)} onAdvancedSettingsChange={onAdvancedSettingsChange} theme={theme} showTitle={showTitle ?? false} className="space-y-4" sections={sections} />
                </div>
                <div className="shrink-0 border-t px-[18px] pb-4 pt-3" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                    <button
                        type="button"
                        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition hover:opacity-90"
                        style={{ background: theme.node.activeStroke, color: theme.node.panel }}
                        onClick={() => {
                            messageInstance?.success?.("生图参数已应用");
                            onClose?.();
                        }}
                    >
                        <Check className="size-3.5" />
                        完成
                    </button>
                </div>
            </div>
        </>,
        document.body,
    );
}
