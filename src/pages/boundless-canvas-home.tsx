"use client";

import { CanvasProviders } from "@/app/canvas/canvas-providers";
import CanvasHomePage from "@/app/canvas/home/page";

export function BoundlessCanvasHome() {
  return (
    <CanvasProviders>
      <CanvasHomePage />
    </CanvasProviders>
  );
}
