export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeLocalBackendBaseUrl(normalizedBaseUrl);
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    normalizedBaseUrl = normalizeOpenAiCompatibleBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeOpenAiCompatibleBaseUrl(baseUrl: string) {
    return normalizeKnownSuffix(baseUrl, "/v1") || normalizeKnownSuffix(baseUrl, "/api/v3") || normalizeKnownSuffix(baseUrl, "/api/plan/v3") || baseUrl;
}

function normalizeKnownSuffix(baseUrl: string, suffix: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        if (!lowerPath.endsWith(suffix)) return "";
        url.pathname = `${path.slice(0, path.length - suffix.length)}${suffix}`;
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return "";
    }
}

function normalizeLocalBackendBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);
        if (!localHosts.has(url.hostname) || url.port !== "3001") return baseUrl;
        const path = url.pathname.replace(/\/+$/, "");
        if (path.toLowerCase() === "/api/v1") url.pathname = "/v1";
        else if (path.toLowerCase() === "/api") url.pathname = "";
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, arkPlanIndex) + "/api/plan/v3";
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
