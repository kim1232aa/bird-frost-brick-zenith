"use client";

import React, { useEffect, useRef, useState } from "react";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ViewportTransform } from "../types";
import { canvasViewportRuntime } from "../utils/canvas-viewport-runtime";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    backgroundMode?: CanvasBackgroundMode;
    zoomOnWheel?: boolean;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onCanvasDeselect?: () => void;
    onContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
};

const PARENT_VIEWPORT_DEBOUNCE_MS = 100;
const WHEEL_IDLE_FLUSH_MS = 80;

function viewportEquals(a: ViewportTransform, b: ViewportTransform) {
    return a.x === b.x && a.y === b.y && a.k === b.k;
}

export function InfiniteCanvas({ containerRef, viewport, backgroundMode = "lines", zoomOnWheel = false, onViewportChange, onCanvasMouseDown, onCanvasDeselect, onContextMenu, onDrop, children }: InfiniteCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const panState = useRef({
        isPanning: false,
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        hasMoved: false,
    });
    const [visualViewport, setVisualViewport] = useState(() => {
        canvasViewportRuntime.set(viewport);
        return viewport;
    });
    const visualViewportRef = useRef(visualViewport);
    const lastEmittedRef = useRef(viewport);
    const scaleRef = useRef(visualViewport.k);
    const pinchState = useRef<{
        startDistance: number;
        startCenterX: number;
        startCenterY: number;
        startViewport: ViewportTransform;
    } | null>(null);
    const frameRef = useRef<number | null>(null);
    const nextViewportRef = useRef<ViewportTransform | null>(null);
    const parentNotifyTimerRef = useRef<number | null>(null);
    const wheelIdleTimerRef = useRef<number | null>(null);
    const previousCursorRef = useRef("");
    const onViewportChangeRef = useRef(onViewportChange);
    const onCanvasDeselectRef = useRef(onCanvasDeselect);
    const scheduleVisualViewportRef = useRef<(next: ViewportTransform) => void>(() => {});
    const flushParentViewportRef = useRef<(options?: { silent?: boolean }) => void>(() => {});
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    onViewportChangeRef.current = onViewportChange;
    onCanvasDeselectRef.current = onCanvasDeselect;

    const applyVisualViewport = (next: ViewportTransform, options?: { silent?: boolean }) => {
        if (viewportEquals(visualViewportRef.current, next)) {
            canvasViewportRuntime.set(visualViewportRef.current);
            return;
        }
        visualViewportRef.current = next;
        scaleRef.current = next.k;
        canvasViewportRuntime.set(next);
        if (!options?.silent) setVisualViewport(next);
    };

    const flushParentViewport = (options?: { silent?: boolean }) => {
        if (parentNotifyTimerRef.current != null) {
            window.clearTimeout(parentNotifyTimerRef.current);
            parentNotifyTimerRef.current = null;
        }
        if (wheelIdleTimerRef.current != null) {
            window.clearTimeout(wheelIdleTimerRef.current);
            wheelIdleTimerRef.current = null;
        }
        if (frameRef.current != null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        if (nextViewportRef.current) {
            applyVisualViewport(nextViewportRef.current, options);
            nextViewportRef.current = null;
        }
        const next = visualViewportRef.current;
        if (viewportEquals(next, lastEmittedRef.current)) return;
        lastEmittedRef.current = next;
        onViewportChangeRef.current(next);
    };

    const scheduleParentViewportNotify = () => {
        if (parentNotifyTimerRef.current != null) {
            window.clearTimeout(parentNotifyTimerRef.current);
        }
        parentNotifyTimerRef.current = window.setTimeout(() => {
            parentNotifyTimerRef.current = null;
            flushParentViewport();
        }, PARENT_VIEWPORT_DEBOUNCE_MS);
    };

    const scheduleWheelIdleFlush = () => {
        if (wheelIdleTimerRef.current != null) {
            window.clearTimeout(wheelIdleTimerRef.current);
        }
        wheelIdleTimerRef.current = window.setTimeout(() => {
            wheelIdleTimerRef.current = null;
            flushParentViewport();
        }, WHEEL_IDLE_FLUSH_MS);
    };

    const scheduleVisualViewport = (next: ViewportTransform) => {
        nextViewportRef.current = next;
        if (frameRef.current != null) return;
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            const pending = nextViewportRef.current;
            if (!pending) return;
            nextViewportRef.current = null;
            applyVisualViewport(pending);
            scheduleParentViewportNotify();
        });
    };
    scheduleVisualViewportRef.current = scheduleVisualViewport;
    flushParentViewportRef.current = flushParentViewport;

    useEffect(() => {
        if (viewportEquals(viewport, visualViewportRef.current)) return;
        if (viewportEquals(viewport, lastEmittedRef.current)) return;
        if (frameRef.current != null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
        nextViewportRef.current = null;
        if (parentNotifyTimerRef.current != null) {
            window.clearTimeout(parentNotifyTimerRef.current);
            parentNotifyTimerRef.current = null;
        }
        if (wheelIdleTimerRef.current != null) {
            window.clearTimeout(wheelIdleTimerRef.current);
            wheelIdleTimerRef.current = null;
        }
        applyVisualViewport(viewport);
        lastEmittedRef.current = viewport;
    }, [viewport]);

    useEffect(
        () => () => {
            flushParentViewportRef.current({ silent: true });
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            if (parentNotifyTimerRef.current != null) window.clearTimeout(parentNotifyTimerRef.current);
            if (wheelIdleTimerRef.current != null) window.clearTimeout(wheelIdleTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing || event.keyCode === 229) return;
            if (event.code !== "Space") return;
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom]")) return;
            setIsSpacePressed(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === "Space") setIsSpacePressed(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom],[data-canvas-wheel-scroll],textarea,input,select,[contenteditable='true'],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown")) return;

        const current = nextViewportRef.current || visualViewportRef.current;
        const zoomAtPointer = (deltaY: number) => {
            const delta = -deltaY;
            const factor = Math.pow(1.1, delta / 100);
            const newScale = Math.min(Math.max(current.k * factor, 0.05), 5);
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return false;

            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const worldX = (mouseX - current.x) / current.k;
            const worldY = (mouseY - current.y) / current.k;

            scheduleVisualViewport({
                x: mouseX - worldX * newScale,
                y: mouseY - worldY * newScale,
                k: newScale,
            });
            return true;
        };

        if (event.ctrlKey && !event.metaKey) {
            if (zoomAtPointer(event.deltaY)) {
                scheduleWheelIdleFlush();
                return;
            }
        }

        if (event.metaKey) {
            scheduleVisualViewport({
                ...current,
                y: current.y - event.deltaY,
            });
            scheduleWheelIdleFlush();
            return;
        }

        if (zoomOnWheel && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
            if (zoomAtPointer(event.deltaY)) {
                scheduleWheelIdleFlush();
                return;
            }
        }

        const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        scheduleVisualViewport({
            ...current,
            x: current.x - horizontalDelta,
        });
        scheduleWheelIdleFlush();
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-canvas-no-zoom]")) return;
        if (target?.closest("[data-connection-create-menu]")) return;
        const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]");

        if (event.button === 0 && (event.ctrlKey || event.metaKey) && isBackgroundClick) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onCanvasMouseDown?.(event);
            return;
        }

        if (event.button === 1 || (event.button === 0 && (isBackgroundClick || isSpacePressed))) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const current = visualViewportRef.current;
            panState.current = {
                isPanning: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: current.x,
                initialY: current.y,
                hasMoved: false,
            };
            previousCursorRef.current = document.body.style.cursor;
            document.body.style.cursor = "grabbing";
        }
    };

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!panState.current.isPanning) return;

            const dx = event.clientX - panState.current.startX;
            const dy = event.clientY - panState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                panState.current.hasMoved = true;
            }

            scheduleVisualViewportRef.current({
                x: panState.current.initialX + dx,
                y: panState.current.initialY + dy,
                k: scaleRef.current,
            });
        };

        const finishPan = () => {
            if (!panState.current.isPanning) return;

            if (!panState.current.hasMoved) {
                onCanvasDeselectRef.current?.();
            }
            panState.current.isPanning = false;
            document.body.style.cursor = previousCursorRef.current;
        };

        const handlePointerUp = () => {
            finishPan();
            flushParentViewportRef.current();
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        window.addEventListener("blur", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            window.removeEventListener("blur", handlePointerUp);
        };
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventWheelScroll = (event: WheelEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            // Keep wheel gestures inside form controls and embedded editors,
            // including when their scroll position is already at a boundary.
            // The React wheel handler also ignores these targets, so the same
            // gesture can never fall through to canvas zooming.
            if (target?.closest("[data-canvas-wheel-scroll],textarea,input,select,[contenteditable='true']")) return;
            event.preventDefault();
        };
        container.addEventListener("wheel", preventWheelScroll, { passive: false });
        return () => container.removeEventListener("wheel", preventWheelScroll);
    }, [containerRef]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const targetAllowsPageGesture = (target: EventTarget | null) =>
            target instanceof Element && Boolean(target.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown,.ant-select-dropdown,.ant-picker-dropdown"));

        const touchDistance = (touches: TouchList) => {
            const first = touches[0];
            const second = touches[1];
            if (!first || !second) return 0;
            return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
        };

        const touchCenter = (touches: TouchList) => {
            const first = touches[0];
            const second = touches[1];
            return {
                x: ((first?.clientX || 0) + (second?.clientX || 0)) / 2,
                y: ((first?.clientY || 0) + (second?.clientY || 0)) / 2,
            };
        };

        const handleTouchStart = (event: TouchEvent) => {
            if (targetAllowsPageGesture(event.target)) return;
            if (event.touches.length !== 2) return;
            const rect = container.getBoundingClientRect();
            const distance = touchDistance(event.touches);
            if (!distance) return;
            event.preventDefault();
            panState.current.isPanning = false;
            document.body.style.cursor = previousCursorRef.current;
            const center = touchCenter(event.touches);
            pinchState.current = {
                startDistance: distance,
                startCenterX: center.x - rect.left,
                startCenterY: center.y - rect.top,
                startViewport: visualViewportRef.current,
            };
        };

        const handleTouchMove = (event: TouchEvent) => {
            const pinch = pinchState.current;
            if (!pinch || event.touches.length !== 2) return;
            const distance = touchDistance(event.touches);
            if (!distance) return;
            const rect = container.getBoundingClientRect();
            const center = touchCenter(event.touches);
            const centerX = center.x - rect.left;
            const centerY = center.y - rect.top;
            const nextScale = Math.min(Math.max(pinch.startViewport.k * (distance / pinch.startDistance), 0.05), 5);
            const worldX = (pinch.startCenterX - pinch.startViewport.x) / pinch.startViewport.k;
            const worldY = (pinch.startCenterY - pinch.startViewport.y) / pinch.startViewport.k;
            event.preventDefault();
            scheduleVisualViewportRef.current({
                x: centerX - worldX * nextScale,
                y: centerY - worldY * nextScale,
                k: nextScale,
            });
        };

        const handleTouchEnd = (event: TouchEvent) => {
            if (event.touches.length < 2) pinchState.current = null;
            flushParentViewportRef.current();
        };

        container.addEventListener("touchstart", handleTouchStart, { passive: false });
        container.addEventListener("touchmove", handleTouchMove, { passive: false });
        container.addEventListener("touchend", handleTouchEnd, { passive: false });
        container.addEventListener("touchcancel", handleTouchEnd, { passive: false });
        return () => {
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
            container.removeEventListener("touchend", handleTouchEnd);
            container.removeEventListener("touchcancel", handleTouchEnd);
        };
    }, [containerRef]);

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full cursor-grab select-none overflow-hidden"
            style={{ background: theme.canvas.background, touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onWheel={handleWheel}
            onContextMenu={onContextMenu}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
        >
            <CanvasGrid viewport={visualViewport} mode={backgroundMode} />
            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${visualViewport.x}px, ${visualViewport.y}px) scale(${visualViewport.k})`,
                }}
            >
                {children}
            </div>
        </div>
    );
}

function CanvasGrid({ viewport, mode }: { viewport: ViewportTransform; mode: CanvasBackgroundMode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (mode === "blank") return null;

    const gridSize = 48 * viewport.k;
    const x = viewport.x % gridSize;
    const y = viewport.y % gridSize;
    const dotSize = viewport.k < 0.12 ? 0.8 : 1.15;
    const backgroundImage =
        mode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} ${dotSize}px, transparent ${dotSize + 0.2}px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`;

    return (
        <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
                backgroundImage,
                backgroundSize: `${gridSize}px ${gridSize}px`,
                backgroundPosition: `${x}px ${y}px`,
            }}
        />
    );
}
