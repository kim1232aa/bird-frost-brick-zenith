"use client";

import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CanvasProviders } from "@/app/canvas/canvas-providers";
import CanvasPage from "@/app/canvas/workspace/canvas-client-page";
import { useCanvasStore } from "@/app/canvas/stores/use-canvas-store";

export function BoundlessCanvasWorkspace() {
  const navigate = useNavigate();
  const { id } = useSearch({ from: "/canvas/workspace" });
  const hydrated = useCanvasStore((state) => state.hydrated);
  const openProject = useCanvasStore((state) => state.openProject);

  useEffect(() => {
    if (!hydrated || !id) return;
    if (!openProject(id)) {
      void navigate({ to: "/canvas/home" });
    }
  }, [hydrated, id, navigate, openProject]);

  return (
    <CanvasProviders>
      <div className="canvas-workspace-shell">
        <CanvasPage />
      </div>
    </CanvasProviders>
  );
}
