import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { CanvasWorkspaceFallback } from "@/pages/canvas-workspace-fallback";

const BoundlessCanvasWorkspace = lazy(() => import("@/pages/boundless-canvas-workspace"));

export const Route = createFileRoute("/canvas/workspace")({
  ssr: false,
  pendingComponent: CanvasWorkspaceFallback,
  validateSearch: (search: Record<string, unknown>): {
    id?: string;
    kind?: "image" | "video" | "upload" | "prompt";
    src?: string;
    prompt?: string;
    title?: string;
    model?: string;
    entry?: "story";
  } => {
    const id = typeof search.id === "string" && search.id.length > 0 ? search.id : undefined;
    const kind =
      search.kind === "image" || search.kind === "video" || search.kind === "upload" || search.kind === "prompt"
        ? search.kind
        : undefined;
    const src = typeof search.src === "string" && search.src.startsWith("/") ? search.src : undefined;
    const prompt = typeof search.prompt === "string" && search.prompt.trim() ? search.prompt : undefined;
    const title = typeof search.title === "string" && search.title.trim() ? search.title : undefined;
    const model = typeof search.model === "string" && search.model.trim() ? search.model : undefined;
    const entry = search.entry === "story" ? "story" : undefined;
    return { id, kind, src, prompt, title, model, entry };
  },
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
