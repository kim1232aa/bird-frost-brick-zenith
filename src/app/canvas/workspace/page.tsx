import { lazy, Suspense } from "react";
import { CanvasWorkspaceFallback } from "@/pages/canvas-workspace-fallback";

const CanvasClientPage = lazy(() => import("./canvas-client-page"));

export default function CanvasPage() {
    return (
        <Suspense fallback={<CanvasWorkspaceFallback />}>
            <CanvasClientPage />
        </Suspense>
    );
}
