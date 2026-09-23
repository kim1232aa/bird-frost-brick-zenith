export type ApiSettingsTab = "relay" | "routing";

export const OPEN_API_SETTINGS_EVENT = "boundless:open-api-settings";

export function openApiSettings(tab: ApiSettingsTab) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<ApiSettingsTab>(OPEN_API_SETTINGS_EVENT, { detail: tab }));
}
