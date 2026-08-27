"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useNavigate } from "@tanstack/react-router";

import { UpdateNotificationBridge } from "@/components/update-notification-bridge";
import { getAntThemeConfig } from "@/lib/app-theme";
import { syncAppDataToWebdav } from "@/services/app-sync";
import { cleanupExpiredStoredImages, collectImageStorageKeys, setStoredImagesRetained } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { retryConfigHydration, useConfigHydrationRuntimeStore, useConfigStore } from "@/stores/use-config-store";
import { importLatestStorySeed, useCanvasStore } from "./stores/use-canvas-store";
import { STORY_SEED_STAMP } from "@/studio/canvas/seed-stamp";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const AUTO_WEBDAV_SYNC_DELAY_MS = 2_500;

export function CanvasProviders({ children }: { children: ReactNode }) {
  const configHydrated = useConfigStore((state) => state.hydrated);
  const configHydrationError = useConfigHydrationRuntimeStore((state) => state.error);
  const isConfigHydrationRetrying = useConfigHydrationRuntimeStore((state) => state.isRetrying);
  const channelMode = useConfigStore((state) => state.config.channelMode);
  const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
  const updateWebdavConfig = useConfigStore((state) => state.updateWebdavConfig);
  const webdav = useConfigStore((state) => state.webdav);
  const canvasHydrated = useCanvasStore((state) => state.hydrated);
  const projects = useCanvasStore((state) => state.projects);
  const assetHydrated = useAssetStore((state) => state.hydrated);
  const assets = useAssetStore((state) => state.assets);
  const syncTimerRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const lastSyncedFingerprintRef = useRef("");
  const imageCleanupReadyRef = useRef(false);
  const syncFingerprint = useMemo(() => buildSyncFingerprint(projects, assets), [projects, assets]);

  useEffect(() => {
    if (!canvasHydrated) return;
    void importLatestStorySeed();
  }, [canvasHydrated, STORY_SEED_STAMP]);

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
    imageCleanupReadyRef.current = true;

    const protectedImageKeys = collectImageStorageKeys({ projects, assets });
    void (async () => {
      // Retain the complete cross-store reference set before deleting any old
      // unretained image. This prevents either persistence store from cleaning
      // media while the other store is still restoring its references.
      await setStoredImagesRetained(protectedImageKeys, true);
      await cleanupExpiredStoredImages(undefined, protectedImageKeys);
    })().catch((error) => console.warn("Canvas image cleanup failed", error));
  }, [assetHydrated, assets, canvasHydrated, projects]);

  useEffect(() => {
    if (!canvasHydrated || !assetHydrated || !webdav.url.trim()) return;
    if (syncInFlightRef.current || syncFingerprint === lastSyncedFingerprintRef.current) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      void (async () => {
        try {
          await syncAppDataToWebdav(webdav);
          lastSyncedFingerprintRef.current = buildSyncFingerprint(useCanvasStore.getState().projects, useAssetStore.getState().assets);
          updateWebdavConfig("lastSyncedAt", new Date().toISOString());
        } catch (error) {
          console.warn("Canvas WebDAV auto sync failed", error);
        } finally {
          syncInFlightRef.current = false;
        }
      })();
    }, AUTO_WEBDAV_SYNC_DELAY_MS);
    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [assetHydrated, canvasHydrated, syncFingerprint, updateWebdavConfig, webdav]);

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
            <CanvasSettingsGate />
          </div>
        </QueryClientProvider>
      </App>
    </ConfigProvider>
  );
}

function CanvasSettingsGate() {
  const open = useConfigStore((state) => state.isConfigOpen);
  const setOpen = useConfigStore((state) => state.setConfigDialogOpen);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    setOpen(false);
    void navigate({ to: "/settings" });
  }, [open, navigate, setOpen]);
  return null;
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

function buildSyncFingerprint(projects: { id: string; updatedAt: string }[], assets: { id: string; updatedAt: string }[]) {
  return [
    "projects",
    projects.length,
    ...projects.map((project) => `${project.id}:${project.updatedAt}`),
    "assets",
    assets.length,
    ...assets.map((asset) => `${asset.id}:${asset.updatedAt}`),
  ].join("|");
}
