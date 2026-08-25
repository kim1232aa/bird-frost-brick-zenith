"use client";

import { useCanvasStore } from "@/app/canvas/stores/use-canvas-store";

function nextTitle(projects: ReadonlyArray<{ title: string }>) {
  let largest = 0n;
  for (const project of projects) {
    const match = /^无限画布 ([0-9]+)$/.exec(project.title);
    if (!match) continue;
    const number = BigInt(match[1]);
    if (number > largest) largest = number;
  }
  return `无限画布 ${largest + 1n}`;
}

export function CanvasLibraryPage() {
  const hydrated = useCanvasStore((state) => state.hydrated);
  const projects = useCanvasStore((state) => state.projects);
  const createProject = useCanvasStore((state) => state.createProject);

  const open = (id: string) => {
    window.location.href = `/canvas/workspace?id=${encodeURIComponent(id)}`;
  };

  const create = () => {
    const id = createProject(nextTitle(projects));
    open(id);
  };

  return (
    <div className="studio-library">
      <header className="studio-library-head">
        <div>
          <p className="studio-kicker">CANVAS</p>
          <h1>无限画布</h1>
          <p className="studio-lead">节点工作台留给长线项目。日常出片请用故事导演和视频工作流。</p>
        </div>
        <button type="button" className="studio-primary" disabled={!hydrated} onClick={create}>
          新建画布
        </button>
      </header>
      {hydrated && projects.length ? (
        <div className="library-grid">
          {projects.map((project) => (
            <button key={project.id} type="button" className="studio-tool-card" onClick={() => open(project.id)}>
              <div className="studio-tool-meta">{new Date(project.updatedAt).toLocaleString("zh-CN")}</div>
              <h2>{project.title}</h2>
              <p>{project.nodes?.length || 0} 个节点</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="studio-placeholder">{hydrated ? "还没有画布" : "正在读取本地画布…"}</div>
      )}
    </div>
  );
}
