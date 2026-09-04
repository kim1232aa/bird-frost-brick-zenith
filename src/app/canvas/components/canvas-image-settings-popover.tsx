"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { App, Button } from "antd";

import { ImageSettingsPanel, imageAdvancedSettingsLabel, imageQualityLabel, imageSizeLabel, resolveImageSettingsContext, type ImageSettingsSection } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import type { ImageOperation } from "@/services/api/image-model-capabilities";
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
    const activeSize = scopedSettings.size || "provider 默认";
    const applyOpen = useCallback((nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    }, [onOpenChange]);
    const requestOpen = useCallback((nextOpen: boolean) => {
        if (nextOpen) {
            applyOpen(true);
            return;
        }
        if (!useConfigStore.getState().config.imageHostApiKey.trim()) {
            applyOpen(false);
            return;
        }
        if (closeInFlightRef.current) return;
        closeInFlightRef.current = true;
        void persistApiSettingsBeforeClose(
            flushConfigStore,
            () => applyOpen(false),
            (error) => { message.error(error); },
        ).finally(() => {
            closeInFlightRef.current = false;
        });
    }, [applyOpen, message]);

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
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
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

    const panel = open && buttonRect ? <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} operation={operation} sections={sections} showTitle={showTitle} onConfigChange={handleConfigChange} onAdvancedSettingsChange={handleAdvancedSettingsChange} /> : null;

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
                            <span className="text-[10px] opacity-70">
                                {imageSizeLabel(activeSize) === "provider 默认" ? "尺寸/步数/Seed/LoRA" : `${quality} · ${imageSizeLabel(activeSize)} · ${count} 张`}
                                {capability.availability.state === "unknown" ? " · 未验证" : capability.availability.state === "unsupported" ? " · 不支持" : ""}
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
    onConfigChange,
    onAdvancedSettingsChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    operation: ImageOperation;
    sections?: ImageSettingsSection[];
    showTitle?: boolean;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onAdvancedSettingsChange: (settings: ImageAdvancedSettings, scope: ImageAdvancedSettingsScope) => void;
}) {
    const width = 356;
    const gap = 8;
    const margin = 12;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(260, buttonRect.top - margin * 2) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(260, window.innerHeight - buttonRect.bottom - margin * 2) }),
        background: theme.toolbar.panel,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.24), 0 0 0 1px rgba(255,255,255,0.08)",
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <>
            <div
                aria-hidden
                className="fixed inset-0 backdrop-blur-[3px]"
                style={{ zIndex: 1199, background: "rgba(12, 10, 9, 0.28)" }}
            />
            <div
                ref={panelRef}
                className="canvas-image-settings-popover"
                style={style}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <ImageSettingsPanel config={config} operation={operation} onConfigChange={(key, value) => onConfigChange(key, value)} onAdvancedSettingsChange={onAdvancedSettingsChange} theme={theme} showTitle={showTitle} className="space-y-4" sections={sections} />
            </div>
        </>,
        document.body,
    );
}
