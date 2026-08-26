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
        <main className="fixed inset-0 z-[999] grid place-items-center bg-[#f4f2ed] text-stone-700">
            <div className="text-sm text-stone-500">正在打开画布...</div>
        </main>
    );
}
