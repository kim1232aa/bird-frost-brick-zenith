const BROWSER_SAFE_CONFIG_MARKER = "__boundlessStudioBrowserSecretsRedacted";

type PersistedConfigEnvelope = {
    state?: { config?: Record<string, unknown>; webdav?: Record<string, unknown> };
    [key: string]: unknown;
};

export function browserSafeConfigEnvelope(value: string) {
    const parsed = JSON.parse(value) as PersistedConfigEnvelope;
    const config = parsed.state?.config;
    if (config && typeof config === "object") {
        config.apiKey = "";
        config.imageHostApiKey = "";
        if (Array.isArray(config.apiRelays)) {
            config.apiRelays = config.apiRelays.map((provider) => {
                if (!provider || typeof provider !== "object") return provider;
                return { ...provider, apiKey: "", apiKeys: [], proxyMode: "direct", proxyUrl: "" };
            });
        }
    }
    const webdav = parsed.state?.webdav;
    if (webdav && typeof webdav === "object") webdav.password = "";
    parsed[BROWSER_SAFE_CONFIG_MARKER] = true;
    return JSON.stringify(parsed);
}

export function isBrowserSafeConfigEnvelope(value: string | null) {
    if (!value) return false;
    try {
        const parsed = JSON.parse(value) as unknown;
        return isRecord(parsed) && parsed[BROWSER_SAFE_CONFIG_MARKER] === true;
    } catch {
        return false;
    }
}

export function browserConfigFallbackAction(value: string, desktopRequired: boolean): "restore" | "migrate" | "reject" {
    if (!desktopRequired) return "restore";
    return isBrowserSafeConfigEnvelope(value) ? "reject" : "migrate";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
