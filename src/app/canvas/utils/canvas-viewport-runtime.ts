import type { ViewportTransform } from "../types";

export const canvasViewportRuntime = {
  current: { x: 0, y: 0, k: 1 } as ViewportTransform,
  set(next: ViewportTransform) {
    this.current = next;
  },
};
