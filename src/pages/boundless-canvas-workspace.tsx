"use client";

import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CanvasProviders } from "@/app/canvas/canvas-providers";
import { CanvasWorkspaceFallback } from "@/pages/canvas-workspace-fallback";
import { importLatestStorySeed, useCanvasStore } from "@/app/canvas/stores/use-canvas-store";
import { mediaPayloadFromWorkspaceSearch } from "@/studio/canvas/media-workspace-project";
import { pushMediaToCanvasWorkspace } from "@/studio/canvas/push-to-workspace";

const CanvasPage = lazy(() =>
  import("@/app/canvas/workspace/canvas-client-page").catch((error) => {
    console.warn("canvas runtime unavailable, using story board", error);
    return import("@/pages/canvas-workspace-lite");
  }),
);

export function BoundlessCanvasWorkspace() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/canvas/workspace" });
  const { id } = search;
  const hydrated = useCanvasStore((state) => state.hydrated);

  useEffect(() => {
    try {
      sessionStorage.removeItem("boundless-canvas-retry");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      await importLatestStorySeed();
      if (cancelled) return;
      const store = useCanvasStore.getState();
      if (id && store.openProject(id)) return;
      const mediaPayload = id ? mediaPayloadFromWorkspaceSearch({ ...search, id }) : null;
      if (id && mediaPayload) {
        const rebuilt = pushMediaToCanvasWorkspace({
          ...mediaPayload,
          id,
          title: mediaPayload.title || mediaPayload.prompt,
        });
        if (rebuilt.id !== id) {
          void navigate({ to: "/canvas/workspace", search: { ...search, id: rebuilt.id } });
        }
        return;
      }
      const bannedSeed = /清凉写真|qingliang|nwsf/i;
      const fallback =
        store.projects.find((item) => item.title === "无限画布 1") ||
        store.projects.find((item) => item.title.includes("无限画布")) ||
        store.projects.find((item) => !bannedSeed.test(item.title || "") && !bannedSeed.test(item.id || "")) ||
        store.projects[0];
      if (fallback) {
        if (!id || id !== fallback.id) {
          void navigate({ to: "/canvas/workspace", search: { id: fallback.id } });
        }
        return;
      }
      if (!id) void navigate({ to: "/canvas/home" });
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, id, navigate, search]);

  return (
    <CanvasProviders>
      <div className="canvas-workspace-shell relative flex h-full min-h-[calc(100vh-64px)] flex-1 flex-col">
        <Suspense fallback={<CanvasWorkspaceFallback />}>
          <div className="absolute inset-0">
            <CanvasPage />
          </div>
        </Suspense>
      </div>
    </CanvasProviders>
  );
}

export default BoundlessCanvasWorkspace;
