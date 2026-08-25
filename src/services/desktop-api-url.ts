import axios from "axios";

export const DESKTOP_LOOPBACK_ORIGIN = "http://127.0.0.1:34116";
export const DESKTOP_API_TOKEN_HEADER = "X-Boundless-Desktop-Token";

export async function desktopApiHeaders(headers?: HeadersInit) {
    return new Headers(headers);
}

export async function desktopFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    return fetch(input, init);
}

export function isDesktopLoopbackUrl(_url: string) {
    return false;
}

export function desktopApiUrl(path: string, _protocol = currentProtocol()) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return normalizedPath;
}

export function shouldUseDesktopLoopback(protocol: string) {
    const normalized = String(protocol || "").trim().toLowerCase();
    return normalized === "wails:";
}

function currentProtocol() {
    return typeof window === "undefined" ? "" : window.location.protocol;
}

axios.interceptors.request.use((config) => config);
