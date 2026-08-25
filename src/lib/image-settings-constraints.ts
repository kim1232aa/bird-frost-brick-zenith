import type { ImageDimensionRules } from "../services/api/image-model-capabilities";

/** Apply only the dimension rules published by the selected capability. */
export function constrainImageDimensions(width: number, height: number, rules: ImageDimensionRules) {
    const step = Math.max(1, Math.floor(rules.multipleOf || 1));
    const minWidth = Math.max(1, rules.minWidth || 1);
    const minHeight = Math.max(1, rules.minHeight || 1);
    const rawMaxWidth = Math.max(minWidth, rules.maxWidth || Number.MAX_SAFE_INTEGER);
    const rawMaxHeight = Math.max(minHeight, rules.maxHeight || Number.MAX_SAFE_INTEGER);
    const alignUp = (value: number) => Math.ceil(value / step) * step;
    const alignDown = (value: number) => Math.max(step, Math.floor(value / step) * step);
    const maxWidth = rules.maxWidth === undefined ? rawMaxWidth : Math.max(minWidth, alignDown(rawMaxWidth));
    const maxHeight = rules.maxHeight === undefined ? rawMaxHeight : Math.max(minHeight, alignDown(rawMaxHeight));
    const clampEdge = (value: number, min: number, max: number) => Math.min(max, Math.max(alignUp(min), alignUp(Math.max(1, Math.floor(value || min)))));
    let nextWidth = clampEdge(width, minWidth, maxWidth);
    let nextHeight = clampEdge(height, minHeight, maxHeight);

    for (let index = 0; index < 4; index += 1) {
        const ratio = Math.max(nextWidth / nextHeight, nextHeight / nextWidth);
        if (rules.maxAspectRatio && ratio > rules.maxAspectRatio) {
            if (nextWidth > nextHeight) nextHeight = clampEdge(nextWidth / rules.maxAspectRatio, minHeight, maxHeight);
            else nextWidth = clampEdge(nextHeight / rules.maxAspectRatio, minWidth, maxWidth);
        }
        const area = nextWidth * nextHeight;
        if (rules.minPixels && area < rules.minPixels) {
            const scale = Math.sqrt(rules.minPixels / area);
            nextWidth = clampEdge(nextWidth * scale, minWidth, maxWidth);
            nextHeight = clampEdge(nextHeight * scale, minHeight, maxHeight);
        }
        if (rules.maxPixels && nextWidth * nextHeight > rules.maxPixels) {
            const scale = Math.sqrt(rules.maxPixels / (nextWidth * nextHeight));
            nextWidth = Math.min(maxWidth, Math.max(alignUp(minWidth), alignDown(nextWidth * scale)));
            nextHeight = Math.min(maxHeight, Math.max(alignUp(minHeight), alignDown(nextHeight * scale)));
        }
    }
    return { width: Math.floor(nextWidth), height: Math.floor(nextHeight) };
}
