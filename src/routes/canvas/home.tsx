import { createFileRoute } from "@tanstack/react-router";
import BoundlessCanvasHome from "@/pages/boundless-canvas-home";

export const Route = createFileRoute("/canvas/home")({
  ssr: false,
  component: BoundlessCanvasHome,
});
