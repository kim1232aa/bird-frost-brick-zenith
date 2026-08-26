"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { findCatalog, catalogKey } from "@/studio/catalog";
import { generateStudioImage } from "@/studio/generate/image";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { useMembershipStore } from "@/studio/membership";
import { liveCatalog, useOpsStore } from "@/studio/ops";
import { preferredTextKey } from "@/studio/model-select";
import { IMAGE_TEMPLATES } from "@/studio/prompt-bank";
import { useStudioSession } from "@/studio/session";
import { dropToCanvas, queryParam, splitModel } from "@/studio/split";
import { enhancePrompt } from "@/studio/story/plan";
import { STUDIO_ROUTES } from "@/studio/wiring";
import { StageOverlay, WorkbenchStatus } from "@/studio/workbench-status";

type DeskTab = "generate" | "edit" | "history";

const ASPECTS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "3:4": { w: 768, h: 1024 },
  "4:3": { w: 1024, h: 768 },
};

const QUALITY: Record<"eco" | "std" | "hq", { label: string; scale: number }> = {
  eco: { label: "标清", scale: 0.75 },
  std: { label: "高清 (HD)", scale: 1 },
  hq: { label: "超清", scale: 1.25 },
};

function engineFamily(selection: string) {
  if (/volcengine|seedream/i.test(selection)) return "ark" as const;
  if (selection.includes("civitai")) return "civitai" as const;
  if (/gpt-image/i.test(selection)) return "gpt" as const;
  if (/grok-imagine-image/i.test(selection)) return "grok" as const;
  if (/modelscope|qwen\/qwen-image|z-image/i.test(selection)) return "modelscope" as const;
  if (/huggingface|flux/i.test(selection)) return "huggingface" as const;
  return "generic" as const;
}

function isEditModel(model: string) {
  return /edit/i.test(model);
}

export function ImageStudioPage() {
  const navigate = useNavigate();
  const relays = useStudioSession((state) => state.relays);
  const items = useStudioHistory((state) => state.items);
  const addHistory = useStudioHistory((state) => state.add);
  const remaining = useOpsStore((state) => state.credits.image);
  const record = useMembershipStore((state) => state.record);
  const allModels = liveCatalog("image", false);
  const [tab, setTab] = useState<DeskTab>("generate");
  const models = useMemo(() => {
    const filtered = allModels.filter((card) => (tab === "edit" ? isEditModel(card.model) : !isEditModel(card.model)));
    return filtered.length ? filtered : allModels;
  }, [allModels, tab]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof models>();
    for (const card of models) {
      const list = map.get(card.provider) || [];
      list.push(card);
      map.set(card.provider, list);
    }
    return [...map.entries()];
  }, [models]);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [selection, setSelection] = useState(`${STUDIO_ROUTES.image.providerId}::${STUDIO_ROUTES.image.model}`);
  const [textModel, setTextModel] = useState(preferredTextKey());
  const [quality, setQuality] = useState<"eco" | "std" | "hq">("std");
  const [aspect, setAspect] = useState("1:1");
  const [size, setSize] = useState("2K");
  const [seed, setSeed] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    const next = queryParam("model");
    if (next) setSelection(next);
  }, []);

  useEffect(() => {
    if (selection && models.length && !models.some((card) => catalogKey(card) === selection)) {
      setSelection(catalogKey(models[0]));
    }
  }, [models, selection]);

  const card = models.find((item) => catalogKey(item) === selection) || findCatalog(selection) || models[0];
  const family = engineFamily(selection);
  const recent = useMemo(
    () => [...items.filter((item) => item.kind === "image" && item.urls[0]), ...GALLERY_SEED.filter((item) => item.kind === "image")].slice(0, 12),
    [items],
  );

  useEffect(() => {
    if (family === "ark") setSize(quality === "hq" ? "3K" : "2K");
  }, [quality, family]);

  const dims = useMemo(() => {
    const base = ASPECTS[aspect] || ASPECTS["1:1"];
    const scale = QUALITY[quality].scale;
    return { width: Math.round(base.w * scale), height: Math.round(base.h * scale) };
  }, [aspect, quality]);

  const generate = async () => {
    if (!prompt.trim()) {
      setError("先写一句描述。");
      return;
    }
    if (tab === "edit" && !reference) {
      setError("编辑模式请先上传参考图。");
      return;
    }
    const fallback = models[0] || { providerId: STUDIO_ROUTES.image.providerId, model: STUDIO_ROUTES.image.model };
    const { providerId, model } = splitModel(selection || catalogKey(fallback));
    setBusy("正在生成…");
    setError("");
    try {
      const result = await generateStudioImage({
        relays,
        prompt,
        providerId,
        model,
        size: family === "ark" ? size : family === "gpt" ? (quality === "hq" ? "1536x1536" : "1024x1024") : `${dims.width}x${dims.height}`,
        width: dims.width,
        height: dims.height,
        seed: seed ? Number(seed) : undefined,
        imageUrl: reference || undefined,
        negativePrompt: negative || undefined,
      });
      setUrl(result.url);
      record("image");
      addHistory({ kind: "image", title: prompt.slice(0, 40), prompt, model: result.model, urls: [result.url] });
      setBusy("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生图失败");
      setBusy("");
    }
  };

  const polish = async () => {
    if (!prompt.trim()) return;
    setBusy("润色提示词…");
    setError("");
    try {
      setPrompt(await enhancePrompt({ relays, prompt, textModel, kind: "image" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "润色失败");
    } finally {
      setBusy("");
    }
  };

  const onUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setReference(String(reader.result || ""));
      setTab("edit");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="gen-page">
      <header className="gen-head">
        <div>
          <p className="studio-kicker">IMAGE</p>
          <h1>AI 生图</h1>
        </div>
        <div className="studio-seg">
          <button type="button" className={tab === "generate" ? "is-active" : undefined} onClick={() => setTab("generate")}>
            生成
          </button>
          <button type="button" className={tab === "edit" ? "is-active" : undefined} onClick={() => setTab("edit")}>
            编辑
          </button>
          <button type="button" className={tab === "history" ? "is-active" : undefined} onClick={() => setTab("history")}>
            历史
          </button>
        </div>
      </header>

      {tab === "history" ? (
        <div className="bp-examples">
          {recent.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.urls[0]) setUrl(item.urls[0]);
                if (item.prompt) setPrompt(item.prompt);
                setTab("generate");
              }}
            >
              <img src={item.urls[0]} alt={item.title} />
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="gen-composer">
            <label className="gen-prompt">
              <span>描述你的想法</span>
              <textarea
                rows={8}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={tab === "edit" ? "例如：给图中的狗戴上生日帽" : "例如：一只可爱的猫在阳光下睡觉"}
              />
              <div className="prompt-tools">
                <span className="bp-count">{prompt.length} 字</span>
                <button type="button" className="studio-ghost" disabled={Boolean(busy)} onClick={() => void polish()}>
                  润色
                </button>
              </div>
            </label>
            <aside className="gen-side">
              <label className="model-picker">
                服务商
                <select
                  value={card?.providerId || ""}
                  onChange={(event) => {
                    const next = models.find((item) => item.providerId === event.target.value);
                    if (next) setSelection(catalogKey(next));
                  }}
                >
                  {groups.map(([provider, list]) => (
                    <option key={provider} value={list[0].providerId}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <label className="model-picker">
                模型
                <select value={selection} onChange={(event) => setSelection(event.target.value)}>
                  {models.map((item) => (
                    <option key={catalogKey(item)} value={catalogKey(item)}>
                      {item.model}
                    </option>
                  ))}
                </select>
              </label>
              {family === "ark" ? (
                <label className="model-picker">
                  画质
                  <select value={size} onChange={(event) => setSize(event.target.value)}>
                    <option value="2K">2K</option>
                    <option value="3K">3K</option>
                  </select>
                </label>
              ) : (
                <div className="gen-row">
                  <label className="model-picker">
                    画质
                    <select value={quality} onChange={(event) => setQuality(event.target.value as "eco" | "std" | "hq")}>
                      <option value="eco">标清</option>
                      <option value="std">高清 (HD)</option>
                      <option value="hq">超清</option>
                    </select>
                  </label>
                  <label className="model-picker">
                    比例
                    <select value={aspect} onChange={(event) => setAspect(event.target.value)}>
                      {Object.keys(ASPECTS).map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <p className="studio-hint">
                {family === "ark" ? size : `${dims.width}x${dims.height}`} · 剩余 {remaining} 点
              </p>
            </aside>
          </div>

          <div className="gen-submit-wrap">
            <button type="button" className="studio-primary gen-submit" disabled={Boolean(busy) || !prompt.trim()} onClick={() => void generate()}>
              {busy ? busy : tab === "edit" ? "编辑图片" : "生成图片"}
            </button>
            {!prompt.trim() ? <p className="studio-hint">写完描述就可以点生成。</p> : null}
            {error ? <p className="studio-error">{error}</p> : null}
          </div>

          <div className="gen-extra">
            <label className="dropzone">
              <span>{tab === "edit" ? "参考图（编辑必填）" : "参考图（可选）"}</span>
              <input type="file" accept="image/*" onChange={(event) => onUpload(event.target.files?.[0])} />
              {reference ? <img src={reference} alt="" className="ref-thumb" /> : <small>不上传就是文生图</small>}
            </label>
            <div className="chip-row">
              {IMAGE_TEMPLATES.map((item) => (
                <button key={item.label} type="button" className={prompt === item.prompt ? "is-active" : undefined} onClick={() => setPrompt(item.prompt)}>
                  {item.label}
                </button>
              ))}
            </div>
            <label className="model-picker">
              负面提示（可选）
              <input value={negative} onChange={(event) => setNegative(event.target.value)} placeholder="不要出现的内容" />
            </label>
          </div>
        </>
      )}

      <section className="gen-result">
        <WorkbenchStatus busy={busy} error={error} done={url ? `${card?.model || "模型"} 已出图` : ""} idle="结果出在这里。" />
        <div className="bp-stage">
          {url ? <img src={url} alt={prompt} /> : <p className="studio-hint">还没有图。上面写描述，点生成。</p>}
          <StageOverlay busy={busy} />
        </div>
        {url ? (
          <div className="result-actions">
            <a className="studio-ghost" href={url} download="studio.png" target="_blank" rel="noreferrer">
              下载
            </a>
            <button type="button" className="studio-ghost" onClick={() => void generate()}>
              再生成
            </button>
            <button type="button" className="studio-ghost" onClick={() => { setReference(url); setTab("edit"); }}>
              用作参考
            </button>
            <button type="button" className="studio-ghost" onClick={() => { dropToCanvas({ kind: "image", url, prompt, model: selection, text: prompt }); void navigate({ to: "/canvas" }); }}>
              送入画布
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
