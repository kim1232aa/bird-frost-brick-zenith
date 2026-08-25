export function formatCanvasGenerationError(error: unknown, fallback = "生成失败") {
    const message = error instanceof Error ? error.message : String(error || "");
    const trimmed = message.trim();
    return trimmed || fallback;
}

export function canvasErrorMessageKey(text: string) {
    return `canvas-error:${text}`;
}

export function withCanvasErrorMessageKey(content: unknown) {
    const text = typeof content === "string"
        ? content
        : content && typeof content === "object" && "content" in content
            ? String((content as { content?: unknown }).content || "")
            : "";
    if (!text.trim()) return content;
    if (content && typeof content === "object") {
        const existingKey = (content as { key?: unknown }).key;
        return {
            ...content,
            key: typeof existingKey === "string" && existingKey.trim()
                ? existingKey
                : canvasErrorMessageKey(text),
        };
    }
    return { content: text, key: canvasErrorMessageKey(text) };
}
