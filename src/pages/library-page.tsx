"use client";

import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { downloadBlob, exportStudioLibrary, importStudioLibrary } from "@/studio/library-zip";
import { useMediaDraft } from "@/studio/media-draft";
import { dropToCanvas } from "@/studio/split";

export function LibraryPage() {
  const navigate = useNavigate();
  const local = useStudioHistory((state) => state.items);
  const add = useStudioHistory((state) => state.add);
  const remove = useStudioHistory((state) => state.remove);
  const clear = useStudioHistory((state) => state.clear);
  const items = [...local, ...GALLERY_SEED.filter((seed) => !local.some((item) => item.urls[0] === seed.urls[0]))];
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  const exportZip = async () => {
    setNote("");
    try {
      const blob = await exportStudioLibrary(local);
      downloadBlob(blob, `boundless-library-${new Date().toISOString().slice(0, 10)}.zip`);
      setNote(`已打包 ${local.filter((item) => item.urls[0]).length} 条本机作品。`);
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
          <p className="studio-lead">本机生成记录可回看、删除、送进画布，也可以 ZIP 导入导出。样张是已实测通的出片。</p>
        </div>
        <div className="result-actions">
          <button type="button" className="studio-ghost" onClick={() => inputRef.current?.click()}>
            导入 ZIP
          </button>
          <button type="button" className="studio-ghost" disabled={!local.length} onClick={() => void exportZip()}>
            导出 ZIP
          </button>
          {local.length ? (
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
              <p>
                {item.model}
                {item.urls.length > 1 ? ` · ${item.urls.length} 张` : ""}
              </p>
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
                {item.kind === "image" && item.urls[0] ? (
                  <button
                    type="button"
                    onClick={() => {
                      useMediaDraft.getState().setReferences(item.urls.filter(Boolean).slice(0, 3));
                      void navigate({ to: "/edit" });
                    }}
                  >
                    去编辑
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
