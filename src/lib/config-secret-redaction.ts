const BROWSER_SAFE_CONFIG_MARKER = "__boundlessStudioBrowserSecretsRedacted";

type PersistedConfigEnvelope = {
    state?: { config?: Record<string, unknown>; webdav?: Record<string, unknown> };
    [key: string]: unknown;
};

export function browserSafeConfigEnvelope(
    value: string,
    options: { redactProxy?: boolean } = {},
) {
    const parsed = JSON.parse(value) as PersistedConfigEnvelope;
    const config = parsed.state?.config;
    if (config && typeof config === "object") {
        config.apiKey = "";
        config.imageHostApiKey = "";
        if (Array.isArray(config.apiRelays)) {
            config.apiRelays = config.apiRelays.map((provider) => {
                if (!provider || typeof provider !== "object") return provider;
                const relay = provider as Record<string, unknown>;
                const apiKeys = Array.isArray(relay.apiKeys) ? relay.apiKeys : [];
                const credentialIds = browserSafeCredentialIds(relay, apiKeys);
                return {
                    ...relay,
                    apiKey: "",
                    apiKeys: undefined,
                    apiKeyId: credentialIds[0],
                    apiKeyIds: credentialIds.length > 1 ? credentialIds.slice(1) : undefined,
                    hasApiKey: Boolean(relay.hasApiKey || relay.apiKey || apiKeys.some(Boolean) || credentialIds.length),
                    // Native snapshots may retain the configured proxy; browser
                    // restore/write paths omit this option and normalize to direct.
                    ...(options.redactProxy === false ? {} : { proxyMode: "direct", proxyUrl: "" }),
                };
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

function browserSafeCredentialIds(relay: Record<string, unknown>, apiKeys: unknown[]) {
    const rawValues = [relay.apiKey, ...apiKeys]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
    const ids = [
        relay.apiKeyId,
        ...(Array.isArray(relay.apiKeyIds) ? relay.apiKeyIds : []),
    ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .filter((id, index, all) =>
            all.indexOf(id) === index && !rawValues.some((raw) => id === raw || id.includes(raw)),
        );
    return ids;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
