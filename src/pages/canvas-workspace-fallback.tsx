export function CanvasWorkspaceFallback({ label = "正在打开画布…" }: { label?: string }) {
  return (
    <main className="canvas-workspace-board relative grid h-full min-h-[calc(100vh-64px)] w-full flex-1 place-items-center bg-[#f4f2ed] text-stone-700">
      <div className="text-center">
        <p className="text-sm text-stone-500">{label}</p>
        <p className="mt-2 text-xs text-stone-400">画布模块较大，第一次会预加载，不是数据坏了。</p>
      </div>
    </main>
  );
}

export function prefetchCanvasWorkspace() {
  void import("@/pages/boundless-canvas-workspace");
  void import("@/app/canvas/workspace/canvas-client-page");
}
