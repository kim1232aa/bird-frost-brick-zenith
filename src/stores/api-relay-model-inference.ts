import type { ApiCapability } from "./api-relay-config-models";

export function isHappyHorseVideoModelName(model: string) {
    return model.trim().toLowerCase().includes("happyhorse");
}

function normalizeModelHint(model: string) {
    return String(model || "")
        .trim()
        .toLowerCase()
        .replace(/[._]+/g, "-")
        .replace(/-+/g, "-");
}

function hasToken(model: string, tokens: readonly string[]) {
    const value = normalizeModelHint(model);
    return tokens.some((token) => new RegExp(`(?:^|-)${token}(?:-|$)`).test(value));
}

function hasExplicitImageSuffix(model: string) {
    return hasToken(model, ["t2i", "i2i", "image"]);
}

function hasExplicitVideoSuffix(model: string) {
    return hasToken(model, ["t2v", "i2v", "video"]);
}

export function isVideoModelName(model: string) {
    const value = model.toLowerCase();
    if (value.includes("imagine-image") || value.includes("imagine-edit")) return false;
    if (hasExplicitVideoSuffix(model)) return true;
    if (hasExplicitImageSuffix(model)) return false;
    return (
        value.includes("seedance") ||
        value.includes("video") ||
        value.includes("sora") ||
        value.includes("veo") ||
        value.includes("kling") ||
        value.includes("wan") ||
        value.includes("hailuo") ||
        value.includes("imagine-video") ||
        isHappyHorseVideoModelName(value)
    );
}

export function isAudioModelName(model: string) {
    const value = model.toLowerCase();
    return (
        value.includes("audio") ||
        value.includes("tts") ||
        value.includes("speech") ||
        value.includes("voice") ||
        value.includes("music") ||
        value.includes("sound")
    );
}

export function isImageModelName(model: string) {
    if (isAudioModelName(model)) return false;
    if (hasExplicitVideoSuffix(model) && !hasExplicitImageSuffix(model)) return false;
    if (hasExplicitImageSuffix(model) && !hasExplicitVideoSuffix(model)) return true;
    const value = model.toLowerCase();
    return (
        !isVideoModelName(model) &&
        (value.includes("seedream") ||
            value.includes("gpt-image") ||
            value.includes("image") ||
            value.includes("dall-e") ||
            value.includes("dalle") ||
            value.includes("imagen") ||
            value.includes("flux") ||
            value.includes("sdxl") ||
            value.includes("stable-diffusion") ||
            value.includes("midjourney"))
    );
}

export function isTextModelName(model: string) {
    if (isImageModelName(model) || isVideoModelName(model) || isAudioModelName(model)) return false;
    const value = model.trim().toLowerCase();
    return (
        /(^|[/_.-])(gpt|chatgpt|claude|gemini|qwen|deepseek|llama|mistral|mixtral|command|grok|glm|kimi|minimax|doubao|ernie|yi|phi|o[134])([/_.-]|$)/u.test(value) ||
        value.includes("chat") ||
        value.includes("instruct") ||
        value.includes("reasoning")
    );
}

export function inferCapabilityFromModelName(model: string): ApiCapability {
    if (isImageModelName(model)) return "image";
    if (isVideoModelName(model)) return "video";
    if (isAudioModelName(model)) return "audio";
    return "text";
}

export function buildAuthHeaders(
    apiKey: string,
    authScheme?: "Bearer" | "Key" | "x-api-key",
): Record<string, string> {
    const key = String(apiKey || "").trim();
    if (!key) return {};
    if (authScheme === "x-api-key") return { "x-api-key": key };
    const scheme = authScheme === "Key" ? "Key" : "Bearer";
    return { Authorization: `${scheme} ${key}` };
}

export function resolveUniqueModelOwner<T>(owners: readonly T[]):
    | { status: "empty"; owners: [] }
    | { status: "resolved"; owner: T; owners: [T] }
    | { status: "ambiguous"; owners: T[] } {
    if (!owners.length) return { status: "empty", owners: [] };
    if (owners.length > 1) return { status: "ambiguous", owners: [...owners] };
    return { status: "resolved", owner: owners[0], owners: [owners[0]] };
}

export function rejectUnsupportedCustomRelayProxy(proxyMode?: unknown) {
    if (proxyMode === "custom") {
        throw new Error("已开启中转专属代理，但该自定义代理尚未由服务端安全实现，请改用直连");
    }
}
