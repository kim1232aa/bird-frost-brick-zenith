export function CanvasWorkspaceFallback({ label = "正在打开无限画布…" }: { label?: string }) {
  return (
    <main className="canvas-workspace-board relative grid h-full min-h-[calc(100vh-64px)] w-full flex-1 place-items-center bg-[#f4f2ed] text-stone-700">
      <div className="text-center">
        <p className="text-sm text-stone-500">{label}</p>
        <p className="mt-2 text-xs text-stone-400">原版节点画布加载中，贝塞尔连线和工作流节点会一起出现。</p>
      </div>
    </main>
  );
}

export function prefetchCanvasWorkspace() {
  void import("@/pages/boundless-canvas-workspace");
  void import("@/app/canvas/workspace/canvas-client-page");
}
