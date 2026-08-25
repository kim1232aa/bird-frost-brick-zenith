"use client";

import { useNavigate } from "@tanstack/react-router";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { dropToCanvas } from "@/studio/split";

export function LibraryPage() {
  const navigate = useNavigate();
  const local = useStudioHistory((state) => state.items);
  const remove = useStudioHistory((state) => state.remove);
  const clear = useStudioHistory((state) => state.clear);
  const items = [...local, ...GALLERY_SEED.filter((seed) => !local.some((item) => item.urls[0] === seed.urls[0]))];

  return (
    <div className="studio-library">
      <header className="studio-library-head">
        <div>
          <h1>作品</h1>
          <p className="studio-lead">本机生成记录可回看、删除、送进画布。样张是已实测通的出片。</p>
        </div>
        {local.length ? (
          <button type="button" className="studio-ghost" onClick={clear}>
            清空本机记录
          </button>
        ) : null}
      </header>
      <div className="library-grid">
        {items.map((item) => (
          <article key={item.id} className="library-card">
            {item.urls[0] ? (
              item.kind === "video" ? <video src={item.urls[0]} controls muted /> : <img src={item.urls[0]} alt={item.title} />
            ) : (
              <div className="shot-empty">{item.kind}</div>
            )}
            <div>
              <b>{item.title}</b>
              <p>{item.model}</p>
              <div className="shot-actions">
                {item.urls[0] ? (
                  <button
                    type="button"
                    onClick={() => {
                      dropToCanvas({
                        kind: item.kind === "video" ? "video" : "upload",
                        url: item.urls[0],
                        prompt: item.prompt,
                      });
                      void navigate({ to: "/canvas" });
                    }}
                  >
                    送入画布
                  </button>
                ) : null}
                {item.createdAt ? (
                  <button type="button" onClick={() => remove(item.id)}>
                    删除
                  </button>
                ) : (
                  <p>实测样张</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
