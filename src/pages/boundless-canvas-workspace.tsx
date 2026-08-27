"use client";

import { CanvasProviders } from "@/app/canvas/canvas-providers";
import CanvasPage from "@/app/canvas/workspace/canvas-client-page";

export function BoundlessCanvasWorkspace() {
  return (
    <CanvasProviders>
      <div className="canvas-workspace-shell flex h-full min-h-full flex-1 flex-col">
        <CanvasPage />
      </div>
    </CanvasProviders>
  );
}

export default BoundlessCanvasWorkspace;
