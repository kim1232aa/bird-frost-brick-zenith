import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { CanvasWorkspaceFallback } from "@/pages/canvas-workspace-fallback";

const BoundlessCanvasWorkspace = lazy(() => import("@/pages/boundless-canvas-workspace"));

export const Route = createFileRoute("/canvas/workspace")({
  ssr: false,
  pendingComponent: CanvasWorkspaceFallback,
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" && search.id.length > 0 ? search.id : undefined,
  }),
  component: CanvasWorkspaceRoute,
});

function CanvasWorkspaceRoute() {
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem("boundless-canvas-retry");
    } catch {
      /* ignore */
    }
  }
  return (
    <Suspense fallback={<CanvasWorkspaceFallback />}>
      <BoundlessCanvasWorkspace />
    </Suspense>
  );
}
