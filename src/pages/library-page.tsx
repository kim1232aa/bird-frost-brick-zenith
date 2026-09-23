"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { listStudioWorks } from "@/studio/server/works";
import {
  isFailedStudioHistoryItem,
  isSavedStudioHistoryItem,
  recordGeneratedWork,
  studioHistoryPersistStatus,
  useStudioHistory,
} from "@/studio/history";
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
  item: {
    id: string;
    kind: string;
    title: string;
    prompt: string;
    model: string;
    providerId?: string;
    urls: string[];
    persistStatus?: "pending" | "saved" | "failed";
    persistError?: string;
    persistWarning?: string;
  };
  sample?: boolean;
  onRemove?: (id: string) => void;
}) {
  const navigate = useNavigate();
  const rawUrl = item.urls[0] || "";
  const [useProxy, setUseProxy] = useState(false);
  const [broken, setBroken] = useState(false);
  const status = studioHistoryPersistStatus(item);

  const displayUrl = useMemo(() => {
    if (!rawUrl) return "";
    if (useProxy && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))) {
      return `/client-api/fetch-url?url=${encodeURIComponent(rawUrl)}`;
    }
    return rawUrl;
  }, [rawUrl, useProxy]);

  const handleMediaError = () => {
    if (!useProxy && (rawUrl.startsWith("http://") || rawUrl.startsWith("https://"))) {
      setUseProxy(true);
    } else {
      setBroken(true);
    }
  };

  return (
    <article className="library-card" data-persist-status={status}>
      <div className="library-card-media">
        {displayUrl && !broken ? (
          item.kind === "video" ? (
            <video
              src={displayUrl}
              controls
              muted
              playsInline
              preload="metadata"
              width={640}
              height={360}
              aria-label={`${item.title} 视频`}
              onError={handleMediaError}
            />
          ) : (
            <img
              src={displayUrl}
              alt={item.title}
              width={640}
              height={480}
              loading={sample ? "lazy" : "eager"}
              referrerPolicy="no-referrer"
              onError={handleMediaError}
            />
          )
        ) : (
          <div className="shot-empty flex flex-col items-center justify-center gap-1.5 p-2 text-center" role="img" aria-label={`${item.title} 媒体不可用`}>
            <span className="text-xs opacity-75">{broken ? (rawUrl.startsWith("http") ? "原图加载失败" : "历史文件未在服务器找到") : item.kind}</span>
            {broken && rawUrl.startsWith("http") ? (
              <button
                type="button"
                onClick={() => {
                  setBroken(false);
                  setUseProxy(true);
                }}
                className="text-[11px] text-blue-600 hover:underline px-2 py-0.5 rounded bg-white/80 shadow-sm"
              >
                代理重试
              </button>
            ) : null}
          </div>
        )}
      </div>
      <div className="library-card-body">
        <b title={item.title}>{item.title}</b>
        <p title={`${kindLabel(item.kind, item.title)} · ${item.model}`}>
          {kindLabel(item.kind, item.title)} · {item.model}
          {item.urls.length > 1 ? ` · ${item.urls.length} 张` : ""}
        </p>
        {status === "pending" ? <p className="studio-pending" role="status">正在保存到作品库…</p> : null}
        {item.persistError ? <p className="studio-error" role="alert">{item.persistError}</p> : null}
        {item.persistWarning ? <p className="studio-warning" role="status">{item.persistWarning}</p> : null}
        <div className="shot-actions">
          {item.urls[0] ? (
            <button
              type="button"
              onClick={() => {
                const kind = item.kind === "video" ? "video" : "upload";
                const modelSelection = item.providerId
                  ? `${item.providerId}::${item.model}`
                  : item.model;
                dropToCanvas({
                  kind,
                  url: item.urls[0],
                  prompt: item.prompt,
                  model: modelSelection,
                });
                const search = pushMediaToCanvasWorkspace({
                  kind,
                  url: item.urls[0],
                  urls: item.urls,
                  prompt: item.prompt,
                  model: modelSelection,
                  title: item.title,
                });
                void navigate({ to: "/canvas/workspace", search });
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
  const remove = useStudioHistory((state) => state.remove);
  const clear = useStudioHistory((state) => state.clear);
  const hydrate = useStudioHistory((state) => state.hydrate);
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [serverWorks, setServerWorks] = useState<any[]>([]);

  useEffect(() => {
    void hydrate();
    listStudioWorks().then((res: any) => {
      if (Array.isArray(res)) setServerWorks(res);
    }).catch(() => {});
  }, [hydrate]);

  useEffect(() => {
    if (!note || note.includes("失败")) return;
    const timer = window.setTimeout(() => setNote(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const mergedItems = useMemo(() => {
    const map = new Map<string, any>();
    local.forEach((item) => map.set(item.id, item));
    serverWorks.forEach((sw) => {
      if (!map.has(sw.id)) {
        map.set(sw.id, {
          id: sw.id,
          kind: sw.kind || "image",
          title: sw.title || "作品",
          prompt: sw.prompt || "",
          model: sw.model || "",
          providerId: sw.providerId,
          urls: (Array.isArray(sw.urls) && sw.urls.length > 0 ? sw.urls : [sw.url].filter(Boolean)) as string[],
          createdAt: sw.createdAt || new Date().toISOString(),
          persistStatus: "saved",
        });
      }
    });
    return Array.from(map.values());
  }, [local, serverWorks]);

  const saved = mergedItems.filter((item) => item.createdAt && item.urls[0] && isSavedStudioHistoryItem(item));
  const pending = local.filter((item) => item.createdAt && item.urls[0] && studioHistoryPersistStatus(item) === "pending");
  const failed = local.filter((item) => item.createdAt && item.urls[0] && isFailedStudioHistoryItem(item));
  const hasLocalItems = saved.length > 0 || pending.length > 0 || failed.length > 0;

  const exportZip = async () => {
    setNote("");
    try {
      const blob = await exportStudioLibrary(saved);
      downloadBlob(blob, `boundless-library-${new Date().toISOString().slice(0, 10)}.zip`);
      setNote(`已打包 ${saved.length} 条本机作品。`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "导出失败");
    }
  };

  const importZip = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setNote("");
    try {
      const imported = await importStudioLibrary(file);
      for (const item of imported) {
        const savedItem = await recordGeneratedWork(item);
        if (!savedItem || studioHistoryPersistStatus(savedItem) !== "saved") {
          throw new Error(savedItem?.persistError || "作品未能写入服务器");
        }
      }
      setNote(`已导入 ${imported.length} 条作品，并已保存到服务器。`);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "导入失败");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setBusy(false);
    }
  };

  return (
    <div className="studio-library">
      <header className="studio-library-head">
        <div>
          <h1>作品</h1>
          <p className="studio-lead">只有写入服务器成功的生图、视频、故事分镜和画布出片才会计入这里；样张单独列出。</p>
        </div>
        <div className="result-actions">
          <button
            type="button"
            className="studio-ghost"
            disabled={busy}
            aria-busy={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "导入中…" : "导入 ZIP"}
          </button>
          <button type="button" className="studio-ghost" disabled={busy || !saved.length} onClick={() => void exportZip()}>
            导出 ZIP
          </button>
          {hasLocalItems ? (
            <button type="button" className="studio-ghost" disabled={busy} onClick={clear}>
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
      {note ? <p className={note.includes("失败") ? "studio-error" : "studio-ok"} role="status">{note}</p> : null}

      <section aria-labelledby="saved-works-heading">
        <p className="studio-kicker" id="saved-works-heading">已保存作品 · {saved.length}</p>
        {!hydrated && !hasLocalItems ? <p className="studio-hint">正在读取作品库…</p> : null}
        {hydrated && !hasLocalItems ? (
          <div className="library-empty">
            <h2>还没有已保存作品</h2>
            <p>从任一入口生成并成功保存后，作品会出现在这里。参考样张不算你的作品。</p>
            <div className="library-empty-actions">
              <Link className="studio-primary" to="/image">去生图</Link>
              <Link className="studio-ghost" to="/video">去生视频</Link>
              <Link className="studio-ghost" to="/story">去故事导演</Link>
              <Link className="studio-ghost" to="/canvas/workspace">去无限画布</Link>
            </div>
          </div>
        ) : saved.length ? (
          <div className="library-grid">
            {saved.map((item) => (
              <WorkCard key={item.id} item={item} onRemove={remove} />
            ))}
          </div>
        ) : null}
      </section>

      {pending.length ? (
        <section className="library-status-section" aria-labelledby="pending-works-heading">
          <p className="studio-kicker" id="pending-works-heading">正在保存 · {pending.length}</p>
          <p className="studio-hint">保存完成前不会计入作品数，也不会出现在导出 ZIP 中。</p>
          <div className="library-grid">
            {pending.map((item) => <WorkCard key={item.id} item={item} onRemove={remove} />)}
          </div>
        </section>
      ) : null}

      {failed.length ? (
        <section className="library-status-section library-failed-section" aria-labelledby="failed-works-heading">
          <p className="studio-kicker" id="failed-works-heading">未保存到服务器 · {failed.length}</p>
          <p className="studio-error" role="alert">这些内容不会计入作品数或导出 ZIP。请先处理保存错误，再重新生成。</p>
          <div className="library-grid">
            {failed.map((item) => <WorkCard key={item.id} item={item} onRemove={remove} />)}
          </div>
        </section>
      ) : null}

      <details className="library-seeds">
        <summary>参考样张 · {GALLERY_SEED.length}</summary>
        <p className="studio-hint">以前实测通的出片，只用来对照效果。点「送入画布」只用图，不会写入本机作品。</p>
        <div className="library-grid">
          {GALLERY_SEED.map((item) => (
            <WorkCard key={item.id} item={item} sample />
          ))}
        </div>
      </details>
    </div>
  );
}
