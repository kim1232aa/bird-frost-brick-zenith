import CanvasClientPage from "./canvas-client-page";
import { Suspense } from "react";

export default function CanvasPage() {
    return (
        <Suspense fallback={<CanvasWorkspaceFallback />}>
            <CanvasClientPage />
        </Suspense>
    );
}

function CanvasWorkspaceFallback() {
    return (
        <main className="fixed inset-0 z-[999] grid place-items-center bg-[#0f0f0f] text-white">
            <div className="text-sm text-white/60">正在打开画布...</div>
        </main>
    );
}
