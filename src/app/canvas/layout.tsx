import type { ReactNode } from "react";

import { CanvasProviders } from "./canvas-providers";

export default function CanvasLayout({ children }: { children: ReactNode }) {
  return <CanvasProviders>{children}</CanvasProviders>;
}
