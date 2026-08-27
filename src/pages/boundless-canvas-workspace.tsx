"use client";

import { CanvasProviders } from "@/app/canvas/canvas-providers";
import { CanvasWorkspaceBoard } from "@/pages/canvas-workspace-board";

export function BoundlessCanvasWorkspace() {
  return (
    <CanvasProviders>
      <div className="canvas-workspace-shell relative flex h-full min-h-[calc(100vh-64px)] flex-1 flex-col">
        <CanvasWorkspaceBoard />
      </div>
    </CanvasProviders>
  );
}

export default BoundlessCanvasWorkspace;
