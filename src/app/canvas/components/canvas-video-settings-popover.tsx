"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { App, Button } from "antd";

import { VideoSettingsPanel, videoSettingsSummary } from "@/components/video-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import {
    flushConfigStore,
    persistApiSettingsBeforeClose,
    useConfigStore,
    writeVideoGenerationSettings,
    type AiConfig,
    type VideoGenerationOperation,
    type VideoGenerationSettings,
    type VideoGenerationSettingsScope,
} from "@/stores/use-config-store";

type CanvasVideoSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onGenerationSettingsChange?: (settings: VideoGenerationSettings, scope: VideoGenerationSettingsScope, capabilityId: string) => void;
    operation?: VideoGenerationOperation;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
};

export function CanvasVideoSettingsPopover({ config, onGenerationSettingsChange, operation, buttonClassName, placement = "topLeft" }: CanvasVideoSettingsPopoverProps) {
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const updateGlobalConfig = useConfigStore((state) => state.updateConfig);
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeInFlightRef = useRef(false);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const requestOpen = useCallback((nextOpen: boolean) => {
        if (nextOpen) {
            setOpen(true);
            return;
        }
        if (!useConfigStore.getState().config.imageHostApiKey.trim()) {
            setOpen(false);
            return;
        }
        if (closeInFlightRef.current) return;
        closeInFlightRef.current = true;
        void persistApiSettingsBeforeClose(
            flushConfigStore,
            () => setOpen(false),
            (error) => { message.error(error); },
        ).finally(() => {
            closeInFlightRef.current = false;
        });
    }, [message]);

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
            // Image-host credentials are global transient inputs and must never
            // be forwarded into persisted node metadata.
            updateGlobalConfig(key, value);
        }
    };
    const handleGenerationSettingsChange = (settings: VideoGenerationSettings, scope: VideoGenerationSettingsScope, capabilityId: string) => {
        const current = useConfigStore.getState().config.videoGenerationSettingsByScope;
        updateGlobalConfig("videoGenerationSettingsByScope", writeVideoGenerationSettings(current, scope, settings));
        onGenerationSettingsChange?.(settings, scope, capabilityId);
    };

    const panel = open && buttonRect ? <VideoSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} operation={operation} onConfigChange={handleConfigChange} onGenerationSettingsChange={handleGenerationSettingsChange} /> : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className={buttonClassName || "!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5"} style={{ background: theme.node.fill, color: theme.node.text }} icon={<Settings2 className="size-3.5" />} onClick={() => requestOpen(!open)}>
                    <span className="truncate">
                        {videoSettingsSummary(config, operation)}
                    </span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function VideoSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    operation,
    onConfigChange,
    onGenerationSettingsChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasVideoSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    operation?: VideoGenerationOperation;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onGenerationSettingsChange: (settings: VideoGenerationSettings, scope: VideoGenerationSettingsScope, capabilityId: string) => void;
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
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <>
            <div aria-hidden className="fixed inset-0 backdrop-blur-[3px]" style={{ zIndex: 1199, background: "rgba(12, 10, 9, 0.28)" }} />
            <div
                ref={panelRef}
                className="canvas-image-settings-popover"
                style={style}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <VideoSettingsPanel config={config} operation={operation} onConfigChange={(key, value) => onConfigChange(key, value)} onGenerationSettingsChange={onGenerationSettingsChange} theme={theme} className="space-y-4" />
            </div>
        </>,
        document.body,
    );
}
