/** Instant first paint for web. These stay in the main route chunk. */

export function CanvasOpenShell() {
  return (
    <div className="canvas-workspace-shell canvas-open-shell" role="status" aria-live="polite">
      <div className="canvas-open-board">
        <div className="canvas-open-top">
          <b>无限画布</b>
          <span>正在打开…</span>
        </div>
        <div className="canvas-open-hero">
          <h1>开始创作</h1>
          <p>拖入图片、视频或音频，或从下面开始。</p>
          <div className="canvas-open-actions">
            <span>上传素材</span>
            <span>文生图</span>
            <span>Seedance2 工作流</span>
            <span>故事导演</span>
          </div>
        </div>
        <div className="canvas-open-dock" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CanvasHomeShell() {
  return (
    <section className="canvas-home-shell canvas-open-home" role="status">
      <div className="canvas-open-home-inner">
        <p className="studio-kicker">BOUNDLESS STUDIO</p>
        <h1>无限画布</h1>
        <p>在一张浅色无限画布上组织文本、图片、视频和故事导演。</p>
        <div className="canvas-open-home-cta">
          <span>新建画布</span>
          <span>导入画布</span>
        </div>
        <div className="canvas-open-home-empty">正在打开项目库…</div>
      </div>
    </section>
  );
}

export function StoryOpenShell() {
  return (
    <div className="bp-work story-open-shell" role="status" aria-live="polite">
      <aside className="bp-left">
        <p className="studio-kicker">故事导演</p>
        <h1>把故事拆成分镜</h1>
        <p className="studio-hint">正在打开分镜台…</p>
      </aside>
      <section className="bp-right story-board">
        <header className="bp-bar">
          <b>分镜台</b>
        </header>
        <div className="story-empty">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="story-empty-card">
              <b>{index + 1} 镜</b>
              <span>待拆分</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
