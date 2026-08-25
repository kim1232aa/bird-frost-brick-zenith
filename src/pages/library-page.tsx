"use client";

import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";

export function LibraryPage() {
  const local = useStudioHistory((state) => state.items);
  const remove = useStudioHistory((state) => state.remove);
  const clear = useStudioHistory((state) => state.clear);
  const items = [...local, ...GALLERY_SEED.filter((seed) => !local.some((item) => item.urls[0] === seed.urls[0]))];

  return (
    <div className="studio-library">
      <header className="studio-library-head">
        <div>
          <h1>创作记录</h1>
          <p className="studio-lead">上面是你在这个浏览器里生成的；下面样张是已实测通的出片，不是空壳。</p>
        </div>
        {local.length ? <button type="button" className="studio-ghost" onClick={clear}>清空本机记录</button> : null}
      </header>
      <div className="library-grid">
        {items.map((item) => (
          <article key={item.id} className="library-card">
            {item.urls[0] ? (
              item.kind === "video" ? <video src={item.urls[0]} controls muted /> : <img src={item.urls[0]} alt={item.title} />
            ) : <div className="shot-empty">{item.kind}</div>}
            <div>
              <b>{item.title}</b>
              <p>{item.model}</p>
              {item.createdAt ? <button type="button" onClick={() => remove(item.id)}>删除</button> : <p>实测样张</p>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
