"use client";

import { CanvasProviders } from "@/app/canvas/canvas-providers";
import CanvasPage from "@/app/canvas/workspace/canvas-client-page";

export function BoundlessCanvasWorkspace() {
  return (
    <CanvasProviders>
      <CanvasPage />
    </CanvasProviders>
  );
}
