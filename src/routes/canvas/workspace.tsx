import { createFileRoute } from "@tanstack/react-router";
import { BoundlessCanvasWorkspace } from "@/pages/boundless-canvas-workspace";

export const Route = createFileRoute("/canvas/workspace")({
  ssr: false,
  component: BoundlessCanvasWorkspace,
});
