import { createFileRoute } from "@tanstack/react-router";
import { CanvasRepairPage } from "@/pages/canvas-repair-page";

export const Route = createFileRoute("/canvas-repair")({
  ssr: false,
  component: CanvasRepairPage,
});
