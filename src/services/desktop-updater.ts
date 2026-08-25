import { CheckForUpdates, GetClientConfig, GetUpdateState, SetAutoCheckUpdates, StartUpdate } from "../../wailsjs/go/main/App";
import { BrowserOpenURL, EventsOn } from "../../wailsjs/runtime/runtime";

export const UPDATE_STATE_EVENT = "boundless:update-state";

export type DesktopUpdateState = {
    supported: boolean;
    phase: string;
    currentVersion: string;
    latestVersion: string;
    available: boolean;
    installable: boolean;
    releaseName: string;
    releaseNotes: string;
    releaseUrl: string;
    publishedAt: string;
    assetName: string;
    assetSize: number;
    downloadedBytes: number;
    totalBytes: number;
    progress: number;
    message: string;
    error: string;
    checkedAt: string;
};

export const emptyUpdateState: DesktopUpdateState = {
    supported: false,
    phase: "idle",
    currentVersion: "1.1.0",
    latestVersion: "",
    available: false,
    installable: false,
    releaseName: "",
    releaseNotes: "",
    releaseUrl: "",
    publishedAt: "",
    assetName: "",
    assetSize: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    progress: 0,
    message: "尚未检查更新",
    error: "",
    checkedAt: "",
};

export function isDesktopUpdaterAvailable() {
    if (typeof window === "undefined") return false;
    const runtimeWindow = window as typeof window & { go?: { main?: { App?: { GetUpdateState?: unknown } } } };
    return typeof runtimeWindow.go?.main?.App?.GetUpdateState === "function";
}

export async function loadDesktopUpdateSettings() {
    if (!isDesktopUpdaterAvailable()) {
        return { autoCheckUpdates: false, state: emptyUpdateState };
    }
    const [config, state] = await Promise.all([GetClientConfig(), GetUpdateState()]);
    return { autoCheckUpdates: Boolean(config.autoCheckUpdates), state: normalizeUpdateState(state) };
}

export async function checkDesktopUpdate() {
    return normalizeUpdateState(await CheckForUpdates());
}

export async function setDesktopAutoCheck(enabled: boolean) {
    await SetAutoCheckUpdates(enabled);
}

export async function startDesktopUpdate() {
    await StartUpdate();
}

export function subscribeDesktopUpdateState(listener: (state: DesktopUpdateState) => void) {
    if (!isDesktopUpdaterAvailable()) return () => undefined;
    return EventsOn(UPDATE_STATE_EVENT, ((state: DesktopUpdateState) => listener(normalizeUpdateState(state))) as (...args: unknown[]) => void);
}

export function openReleaseURL(url: string) {
    if (!url) return;
    if (isDesktopUpdaterAvailable()) {
        BrowserOpenURL(url);
        return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
}

export function normalizeUpdateState(value: Partial<DesktopUpdateState> | null | undefined): DesktopUpdateState {
    return {
        ...emptyUpdateState,
        ...(value || {}),
        progress: Number.isFinite(value?.progress) ? Math.max(0, Math.min(100, Number(value?.progress))) : 0,
        assetSize: Number(value?.assetSize) || 0,
        downloadedBytes: Number(value?.downloadedBytes) || 0,
        totalBytes: Number(value?.totalBytes) || 0,
    };
}

export function updateErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "更新操作失败，请稍后重试";
}
