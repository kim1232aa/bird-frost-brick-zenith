import { createFileRoute } from "@tanstack/react-router";
import BoundlessCanvasWorkspace from "@/pages/boundless-canvas-workspace";

export const Route = createFileRoute("/canvas/workspace")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" && search.id.length > 0 ? search.id : undefined,
  }),
  component: BoundlessCanvasWorkspace,
});
