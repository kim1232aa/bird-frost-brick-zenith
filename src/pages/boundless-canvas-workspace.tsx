"use client";

import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CanvasProviders } from "@/app/canvas/canvas-providers";
import { CanvasWorkspaceFallback } from "@/pages/canvas-workspace-fallback";
import { useCanvasStore } from "@/app/canvas/stores/use-canvas-store";

const CanvasPage = lazy(() => import("@/app/canvas/workspace/canvas-client-page"));

export function BoundlessCanvasWorkspace() {
  const navigate = useNavigate();
  const { id } = useSearch({ from: "/canvas/workspace" });
  const hydrated = useCanvasStore((state) => state.hydrated);
  const openProject = useCanvasStore((state) => state.openProject);

  useEffect(() => {
    if (!hydrated) return;
    if (id && !openProject(id)) {
      void navigate({ to: "/canvas/home" });
    }
  }, [hydrated, id, navigate, openProject]);

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
