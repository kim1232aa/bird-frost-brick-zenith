"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { ApiAccessSettingsDialog } from "@/components/api-access-settings-dialog";
import { UpdateNotificationBridge } from "@/components/update-notification-bridge";
import { getAntThemeConfig } from "@/lib/app-theme";
import { cleanupExpiredStoredImages, collectImageStorageKeys, setStoredImagesRetained } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { retryConfigHydration, useConfigHydrationRuntimeStore, useConfigStore } from "@/stores/use-config-store";
import { useCanvasStore } from "./stores/use-canvas-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

export function CanvasProviders({ children }: { children: ReactNode }) {
  const configHydrated = useConfigStore((state) => state.hydrated);
  const configHydrationError = useConfigHydrationRuntimeStore((state) => state.error);
  const isConfigHydrationRetrying = useConfigHydrationRuntimeStore((state) => state.isRetrying);
  const channelMode = useConfigStore((state) => state.config.channelMode);
  const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
  const canvasHydrated = useCanvasStore((state) => state.hydrated);
  const assetHydrated = useAssetStore((state) => state.hydrated);
  const imageCleanupReadyRef = useRef(false);

  useEffect(() => {
    if (!configHydrated || channelMode !== "remote") return;
    void loadPublicSettings().catch(() => undefined);
  }, [channelMode, configHydrated, loadPublicSettings]);

  useEffect(() => {
    if (!canvasHydrated || !assetHydrated) {
      imageCleanupReadyRef.current = false;
      return;
    }
    if (imageCleanupReadyRef.current) return;

    let cancelled = false;
    const runCleanup = () => {
      if (cancelled || imageCleanupReadyRef.current) return;
      imageCleanupReadyRef.current = true;
      const { projects: liveProjects, hydrated: liveCanvasHydrated } = useCanvasStore.getState();
      const { assets: liveAssets, hydrated: liveAssetHydrated } = useAssetStore.getState();
      if (!liveCanvasHydrated || !liveAssetHydrated) {
        imageCleanupReadyRef.current = false;
        return;
      }
      const protectedImageKeys = collectImageStorageKeys({ projects: liveProjects, assets: liveAssets });
      void (async () => {
        // Retain the complete cross-store reference set before deleting any old
        // unretained image. This prevents either persistence store from cleaning
        // media while the other store is still restoring its references.
        await setStoredImagesRetained(protectedImageKeys, true);
        await cleanupExpiredStoredImages(undefined, protectedImageKeys);
      })().catch((error) => console.warn("Canvas image cleanup failed", error));
    };

    // First paint must not wait on a full project/asset scan.
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let idleHandle = 0;
    let timeoutHandle = 0;
    const onFirstInteraction = () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
      runCleanup();
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleHandle = idleWindow.requestIdleCallback(runCleanup, { timeout: 4_000 });
    } else {
      timeoutHandle = window.setTimeout(runCleanup, 1_500);
    }
    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true });

    return () => {
      cancelled = true;
      if (idleHandle && typeof idleWindow.cancelIdleCallback === "function") idleWindow.cancelIdleCallback(idleHandle);
      if (timeoutHandle) window.clearTimeout(timeoutHandle);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, [assetHydrated, canvasHydrated]);

  useEffect(() => {
    const root = document.documentElement;
    const previousColorScheme = root.style.colorScheme;
    // Keep studio chrome light. Canvas board theme is independent (canvasThemes).
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    return () => {
      root.style.colorScheme = previousColorScheme;
    };
  }, []);

  useEffect(() => {
    if (configHydrated) return;
    const timer = window.setTimeout(() => {
      if (!useConfigStore.getState().hydrated) {
        useConfigStore.getState().setHydrated(true);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [configHydrated]);

  useEffect(() => {
    if (canvasHydrated) return;
    const timer = window.setTimeout(() => {
      const state = useCanvasStore.getState();
      if (!state.hydrated && state.hydrationStatus === "loading") {
        void useCanvasStore.persist.rehydrate();
      }
    }, 4_000);
    return () => window.clearTimeout(timer);
  }, [canvasHydrated]);

  if (configHydrationError && !configHydrated) {
    return <ConfigHydrationErrorShell isRetrying={isConfigHydrationRetrying} onRetry={retryConfigHydration} />;
  }

  return (
    <ConfigProvider locale={zhCN} theme={getAntThemeConfig(false)}>
      <App className="canvas-ant-app h-full min-h-full flex-1">
        <QueryClientProvider client={queryClient}>
          <div className="flex h-full min-h-full flex-1 flex-col">
            {children}
            <UpdateNotificationBridge />
            <ApiAccessSettingsDialog />
          </div>
        </QueryClientProvider>
      </App>
    </ConfigProvider>
  );
}

function ConfigHydrationErrorShell({ isRetrying, onRetry }: { isRetrying: boolean; onRetry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f2ed] px-6 text-stone-800" aria-labelledby="config-hydration-error-title">
      <section className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-sm" role="alert">
        <h1 id="config-hydration-error-title" className="text-lg font-semibold">
          无法读取本地配置
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          已保留保存的设置，未写入默认配置。请检查本地应用数据访问权限后重试。
        </p>
        <button
          type="button"
          className="mt-5 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-wait disabled:opacity-60"
          onClick={onRetry}
          disabled={isRetrying}
          aria-label="Retry loading local configuration"
        >
          {isRetrying ? "正在重试…" : "重试读取配置"}
        </button>
      </section>
    </main>
  );
}
