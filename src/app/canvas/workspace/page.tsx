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
        <main className="grid h-full min-h-[calc(100vh-64px)] place-items-center bg-[#f4f2ed] text-stone-700">
            <div className="text-sm text-stone-500">正在打开画布...</div>
        </main>
    );
}
