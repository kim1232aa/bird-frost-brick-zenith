"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

type AutoResizeTextareaOptions = {
    value: unknown;
    minHeight: number;
    maxHeight?: number;
    preserveManualResize?: boolean;
};

type AutoResizeTextareaMeasureOptions = {
    includeManualHeight?: boolean;
};

const TEXTAREA_SCROLL_HEIGHT_BUFFER = 2;

export function useAutoResizeTextarea({ value, minHeight, maxHeight = Number.POSITIVE_INFINITY, preserveManualResize = true }: AutoResizeTextareaOptions) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const manualHeightRef = useRef<number | null>(null);
    const lastAppliedHeightRef = useRef<number | null>(null);
    const isApplyingHeightRef = useRef(false);

    const measureTextarea = useCallback(({ includeManualHeight = true }: AutoResizeTextareaMeasureOptions = {}) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const nextContentHeight = measureTextareaContentHeight(textarea, minHeight, maxHeight);
        const manualHeight = includeManualHeight && preserveManualResize ? manualHeightRef.current || 0 : 0;
        const nextHeight = clampTextareaHeight(Math.max(nextContentHeight, manualHeight), minHeight, maxHeight);

        isApplyingHeightRef.current = true;
        textarea.style.height = `${nextHeight}px`;
        lastAppliedHeightRef.current = nextHeight;
        requestAnimationFrame(() => {
            isApplyingHeightRef.current = false;
        });
    }, [maxHeight, minHeight, preserveManualResize]);

    useLayoutEffect(() => {
        measureTextarea();
    }, [measureTextarea, value]);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea || typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(() => {
            if (isApplyingHeightRef.current) return;
            const currentHeight = readTextareaHeight(textarea);
            if (!currentHeight) return;
            const lastAppliedHeight = lastAppliedHeightRef.current;
            if (lastAppliedHeight !== null && Math.abs(currentHeight - lastAppliedHeight) <= 1) return;

            manualHeightRef.current = clampTextareaHeight(currentHeight, minHeight, maxHeight);
            lastAppliedHeightRef.current = manualHeightRef.current;
        });
        observer.observe(textarea);
        return () => observer.disconnect();
    }, [maxHeight, minHeight]);

    return { textareaRef, measureTextarea };
}

function measureTextareaContentHeight(textarea: HTMLTextAreaElement, minHeight: number, maxHeight: number) {
    const previousHeight = textarea.style.height;
    textarea.style.height = "0px";
    try {
        return clampTextareaHeight(textarea.scrollHeight + TEXTAREA_SCROLL_HEIGHT_BUFFER, minHeight, maxHeight);
    } finally {
        textarea.style.height = previousHeight;
    }
}

function readTextareaHeight(textarea: HTMLTextAreaElement) {
    const inlineHeight = Number.parseFloat(textarea.style.height);
    if (Number.isFinite(inlineHeight) && inlineHeight > 0) return Math.ceil(inlineHeight);
    const computedHeight = Number.parseFloat(window.getComputedStyle(textarea).height);
    return Number.isFinite(computedHeight) && computedHeight > 0 ? Math.ceil(computedHeight) : 0;
}

function clampTextareaHeight(height: number, minHeight: number, maxHeight: number) {
    return Math.min(Math.max(Math.ceil(height), minHeight), maxHeight);
}
