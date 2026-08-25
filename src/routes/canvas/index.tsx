import { createFileRoute } from "@tanstack/react-router";
import { FlowCanvasPage } from "@/pages/flow-canvas-page";

export const Route = createFileRoute("/canvas/")({
  ssr: false,
  component: FlowCanvasPage,
});
