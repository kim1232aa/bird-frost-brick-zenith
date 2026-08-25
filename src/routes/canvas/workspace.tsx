import { createFileRoute } from "@tanstack/react-router";
import { FlowCanvasPage } from "@/pages/flow-canvas-page";

export const Route = createFileRoute("/canvas/workspace")({
  ssr: false,
  component: FlowCanvasPage,
});
