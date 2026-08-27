"use client";

import { lazy, Suspense } from "react";
import { CanvasProviders } from "@/app/canvas/canvas-providers";
import { CanvasWorkspaceFallback } from "@/pages/canvas-workspace-fallback";

const CanvasPage = lazy(() => import("@/app/canvas/workspace/canvas-client-page"));

export function BoundlessCanvasWorkspace() {
  return (
    <CanvasProviders>
      <div className="canvas-workspace-shell flex h-full min-h-full flex-1 flex-col">
        <Suspense fallback={<CanvasWorkspaceFallback />}>
          <CanvasPage />
        </Suspense>
      </div>
    </CanvasProviders>
  );
}

export default BoundlessCanvasWorkspace;
