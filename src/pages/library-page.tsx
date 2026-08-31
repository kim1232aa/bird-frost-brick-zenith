"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { downloadBlob, exportStudioLibrary, importStudioLibrary } from "@/studio/library-zip";
import { useMediaDraft } from "@/studio/media-draft";
import { dropToCanvas } from "@/studio/split";
import { pushMediaToCanvasWorkspace } from "@/studio/canvas/push-to-workspace";

function kindLabel(kind: string, title = "") {
  if (kind === "story" || title.startsWith("故事")) return "故事导演";
  if (title.startsWith("画布")) return "无限画布";
  if (kind === "ecommerce") return "电商套图";
  if (kind === "video") return "视频";
  return "图片";
}

function WorkCard({
  item,
  sample,
  onRemove,
}: {
  item: { id: string; kind: string; title: string; prompt: string; model: string; urls: string[] };
  sample?: boolean;
  onRemove?: (id: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <article className="library-card">
      {item.urls[0] ? (
        item.kind === "video" ? <video src={item.urls[0]} controls muted /> : <img src={item.urls[0]} alt={item.title} />
      ) : (
        <div className="shot-empty">{item.kind}</div>
      )}
      <div>
        <b>{item.title}</b>
        <p>
          {kindLabel(item.kind, item.title)} · {item.model}
          {item.urls.length > 1 ? ` · ${item.urls.length} 张` : ""}
        </p>
        <div className="shot-actions">
          {item.urls[0] ? (
            <button
              type="button"
              onClick={() => {
                const kind = item.kind === "video" ? "video" : "upload";
                dropToCanvas({
                  kind,
                  url: item.urls[0],
                  prompt: item.prompt,
                });
                const id = pushMediaToCanvasWorkspace({
                  kind,
                  url: item.urls[0],
                  urls: item.urls,
                  prompt: item.prompt,
                  title: item.title,
                });
                void navigate({ to: "/canvas/workspace", search: { id } });
              }}
            >
              送入画布
            </button>
          ) : null}
          {item.kind !== "video" && item.urls[0] ? (
            <button
              type="button"
              onClick={() => {
                // Pass every stored image; the edit page validates the selected
                // model's reference cap and errors explicitly instead of
                // silently dropping extras.
                useMediaDraft.getState().setReferences(item.urls.filter(Boolean));
                void navigate({ to: "/edit" });
              }}
            >
              去编辑
            </button>
          ) : null}
          {sample ? <span className="library-tag">参考样张</span> : null}
          {onRemove ? (
            <button type="button" onClick={() => onRemove(item.id)}>
              删除
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function LibraryPage() {
  const local = useStudioHistory((state) => state.items);
  const hydrated = useStudioHistory((state) => state.hydrated);
  const add = useStudioHistory((state) => state.add);
  const remove = useStudioHistory((state) => state.remove);
  const clear = useStudioHistory((state) => state.clear);
  const hydrate = useStudioHistory((state) => state.hydrate);
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const mine = local.filter((item) => item.createdAt && item.urls[0]);

  const exportZip = async () => {
    setNote("");
    try {
      const blob = await exportStudioLibrary(mine);
      downloadBlob(blob, `boundless-library-${new Date().toISOString().slice(0, 10)}.zip`);
      setNote(`已打包 ${mine.length} 条本机作品。`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "导出失败");
    }
  };

  const importZip = async (file?: File) => {
    if (!file) return;
    setNote("");
    try {
      const imported = await importStudioLibrary(file);
      imported.forEach((item) => add(item));
      setNote(`已导入 ${imported.length} 条作品。`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "导入失败");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="studio-library">
      <header className="studio-library-head">
        <div>
          <h1>作品</h1>
          <p className="studio-lead">生图、改图、故事导演分镜、无限画布出片，成功后都会进这里。样张在下面单独一栏。</p>
        </div>
        <div className="result-actions">
          <button type="button" className="studio-ghost" onClick={() => inputRef.current?.click()}>
            导入 ZIP
          </button>
          <button type="button" className="studio-ghost" disabled={!mine.length} onClick={() => void exportZip()}>
            导出 ZIP
          </button>
          {mine.length ? (
            <button type="button" className="studio-ghost" onClick={clear}>
              清空本机记录
            </button>
          ) : null}
        </div>
      </header>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => void importZip(event.target.files?.[0])}
      />
      {note ? <p className={note.includes("失败") ? "studio-error" : "studio-ok"}>{note}</p> : null}

      <section>
        <p className="studio-kicker">本机作品 · {mine.length}</p>
        {!hydrated && !mine.length ? <p className="studio-hint">正在读取作品库…</p> : null}
        {hydrated && !mine.length ? (
          <div className="library-empty">
            <h2>还没有本机作品</h2>
            <p>生图、故事导演分镜、无限画布出片成功后会出现在这里。参考样张不算你的作品。</p>
            <div className="shot-actions">
              <Link className="studio-primary" to="/image">
                去生图
              </Link>
              <Link className="studio-ghost" to="/story">
                去故事导演
              </Link>
            </div>
          </div>
        ) : (
          <div className="library-grid">
            {mine.map((item) => (
              <WorkCard key={item.id} item={item} onRemove={remove} />
            ))}
          </div>
        )}
      </section>

      <section className="library-seeds">
        <p className="studio-kicker">参考样张 · {GALLERY_SEED.length}</p>
        <p className="studio-hint">以前实测通的出片，只用来对照效果。点「送入画布」只用图，不会写入本机作品。</p>
        <div className="library-grid">
          {GALLERY_SEED.map((item) => (
            <WorkCard key={item.id} item={item} sample />
          ))}
        </div>
      </section>
    </div>
  );
}
