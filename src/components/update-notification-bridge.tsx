"use client";

import { useEffect } from "react";
import { App } from "antd";

import { Button } from "@/components/ui/button";
import {
    checkDesktopUpdate,
    loadDesktopUpdateSettings,
    subscribeDesktopUpdateState,
    type DesktopUpdateState,
} from "@/services/desktop-updater";
import { openApiSettings } from "@/services/settings-dialog";

const notifiedVersions = new Set<string>();

export function UpdateNotificationBridge() {
    const { notification } = App.useApp();

    useEffect(() => {
        let active = true;

        const showAvailableUpdate = (state: DesktopUpdateState) => {
            if (!active || !state.available || state.phase !== "available" || !state.latestVersion || notifiedVersions.has(state.latestVersion)) return;
            notifiedVersions.add(state.latestVersion);
            notification.info({
                key: `boundless-update-${state.latestVersion}`,
                message: `发现新版本 v${state.latestVersion}`,
                description: state.releaseName || "Boundless Studio 有可用更新",
                duration: 0,
                placement: "bottomRight",
                btn: (
                    <Button
                        type="button"
                        className="h-8 rounded-lg px-3 text-xs"
                        onClick={() => {
                            notification.destroy(`boundless-update-${state.latestVersion}`);
                            openApiSettings("update");
                        }}
                    >
                        查看更新
                    </Button>
                ),
            });
        };

        // Subscribe before starting the automatic check. The backend used to
        // start this from OnStartup, which could emit "available" before React
        // had mounted this bridge, so only a later manual check showed a prompt.
        const unsubscribe = subscribeDesktopUpdateState(showAvailableUpdate);
        void (async () => {
            try {
                const { autoCheckUpdates, state } = await loadDesktopUpdateSettings();
                if (!active) return;

                // Preserve an already-known available state (for example after
                // this component remounts) before deciding whether to check.
                showAvailableUpdate(state);
                if (!state.supported || !autoCheckUpdates || state.phase !== "idle" || state.checkedAt) return;

                // The listener is now ready, so an available result will always
                // surface immediately. Checking the returned state is an extra
                // safeguard if an event cannot be delivered by the webview.
                showAvailableUpdate(await checkDesktopUpdate());
            } catch {
                // Automatic checks are silent on network errors. The update
                // settings panel still exposes the error for a manual retry.
            }
        })();

        return () => {
            active = false;
            unsubscribe();
        };
    }, [notification]);

    return null;
}
