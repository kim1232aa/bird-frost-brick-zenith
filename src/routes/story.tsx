import { createFileRoute } from "@tanstack/react-router";
import { FlowCanvasPage } from "@/pages/flow-canvas-page";

export const Route = createFileRoute("/story")({
  ssr: false,
  component: FlowCanvasPage,
});
