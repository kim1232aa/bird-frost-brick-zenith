"use client";

import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CanvasProviders } from "@/app/canvas/canvas-providers";
import { CanvasWorkspaceFallback } from "@/pages/canvas-workspace-fallback";
import { importLatestStorySeed, useCanvasStore } from "@/app/canvas/stores/use-canvas-store";

const CanvasPage = lazy(() => import("@/app/canvas/workspace/canvas-client-page"));

export function BoundlessCanvasWorkspace() {
  const navigate = useNavigate();
  const { id } = useSearch({ from: "/canvas/workspace" });
  const hydrated = useCanvasStore((state) => state.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void (async () => {
      await importLatestStorySeed();
      if (cancelled) return;
      const store = useCanvasStore.getState();
      if (id && store.openProject(id)) return;
      const fallback = store.projects.find((item) => item.title.includes("清凉写真")) || store.projects[0];
      if (fallback) {
        if (!id || id !== fallback.id) {
          void navigate({ to: "/canvas/workspace", search: { id: fallback.id } });
        }
        return;
      }
      void navigate({ to: "/canvas/home" });
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, id, navigate]);

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
