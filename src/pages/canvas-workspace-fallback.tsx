export function CanvasWorkspaceFallback({ label = "正在打开画布…" }: { label?: string }) {
  return (
    <main className="canvas-workspace-board relative grid h-full min-h-[calc(100vh-64px)] w-full flex-1 place-items-center bg-[#f4f2ed] text-stone-700">
      <div className="text-center">
        <p className="text-sm text-stone-500">{label}</p>
        <p className="mt-2 text-xs text-stone-400">工作区已改成即时故事板，不再加载超大画布模块。</p>
      </div>
    </main>
  );
}

export function prefetchCanvasWorkspace() {
  void import("@/pages/boundless-canvas-workspace");
  void import("@/pages/canvas-workspace-board");
}
