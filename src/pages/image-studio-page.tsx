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

const ASPECTS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "3:4": { w: 768, h: 1024 },
  "4:3": { w: 1024, h: 768 },
};

function engineFamily(selection: string) {
  if (/volcengine|seedream/i.test(selection)) return "ark" as const;
  if (selection.includes("civitai")) return "civitai" as const;
  if (/gpt-image/i.test(selection)) return "gpt" as const;
  if (/grok-imagine-image/i.test(selection)) return "grok" as const;
  return "generic" as const;
}

export function ImageStudioPage() {
  const navigate = useNavigate();
  const relays = useStudioSession((state) => state.relays);
  const items = useStudioHistory((state) => state.items);
  const addHistory = useStudioHistory((state) => state.add);
  const remaining = useOpsStore((state) => state.credits.image);
  const record = useMembershipStore((state) => state.record);
  const models = liveCatalog("image", true);
  const groups = useMemo(() => {
    const map = new Map<string, typeof models>();
    for (const card of models) {
      const list = map.get(card.provider) || [];
      list.push(card);
      map.set(card.provider, list);
    }
    return [...map.entries()];
  }, [models]);
  const [prompt, setPrompt] = useState(IMAGE_TEMPLATES[0].prompt);
  const [negative, setNegative] = useState("");
  const [selection, setSelection] = useState(`${STUDIO_ROUTES.image.providerId}::${STUDIO_ROUTES.image.model}`);
  const [textModel, setTextModel] = useState(preferredTextKey());
  const [mode, setMode] = useState<"t2i" | "i2i">("t2i");
  const [quality, setQuality] = useState<"eco" | "std" | "hq">("std");
  const [aspect, setAspect] = useState("1:1");
  const [size, setSize] = useState("2K");
  const [seed, setSeed] = useState("");
  const [count, setCount] = useState(1);
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

  const card = findCatalog(selection) || models[0];
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
    const scale = quality === "eco" ? 0.75 : quality === "hq" ? 1.25 : 1;
    return { width: Math.round(base.w * scale), height: Math.round(base.h * scale) };
  }, [aspect, quality]);

  const generate = async () => {
    const { providerId, model } = splitModel(selection);
    setBusy(`正在提交 ${card?.label || card?.model || model}…`);
    setError("");
    try {
      const result = await generateStudioImage({
        relays,
        prompt,
        providerId,
        model,
        size: family === "ark" ? size : family === "gpt" ? (quality === "hq" ? "1536x1536" : "1024x1024") : undefined,
        width: family === "civitai" || family === "grok" ? dims.width : undefined,
        height: family === "civitai" || family === "grok" ? dims.height : undefined,
        seed: family === "civitai" && seed ? Number(seed) : undefined,
        imageUrl: mode === "i2i" && reference ? reference : undefined,
        negativePrompt: negative || undefined,
        n: count > 1 ? count : undefined,
      });
      setBusy("正在写入结果…");
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
    setBusy("润色提示词…");
    setError("");
    try {
      const next = await enhancePrompt({ relays, prompt, textModel, kind: "image" });
      setPrompt(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "润色失败");
    } finally {
      setBusy("");
    }
  };

  const sendCanvas = () => {
    dropToCanvas({ kind: url ? "image" : "prompt", url: url || undefined, prompt, model: selection, text: prompt });
    void navigate({ to: "/canvas" });
  };

  return (
    <div className="bp-work">
      <aside className="bp-left">
        <p className="studio-kicker">{card?.model || "生图"}</p>
        <h1>{card?.label || "文生图 / 图生图"}</h1>
        <label>
          描述你的想法
          <textarea rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你的想法" />
        </label>
        <div className="prompt-tools">
          <span className="bp-count">必填 · {prompt.length} / 20000</span>
          <button type="button" className="studio-ghost" disabled={Boolean(busy)} onClick={() => void polish()}>
            提示词模板 / 润色
          </button>
        </div>
        <label className="dropzone">
          <span>点击上传图片，如需标注可再次点击</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                setReference(String(reader.result || ""));
                setMode("i2i");
              };
              reader.readAsDataURL(file);
            }}
          />
          {reference ? <img src={reference} alt="" className="ref-thumb" /> : <small>没思路？先点下面模板，或右边看示例</small>}
        </label>
        <div className="studio-seg">
          <button type="button" className={mode === "t2i" ? "is-active" : undefined} onClick={() => setMode("t2i")}>
            文生图
          </button>
          <button type="button" className={mode === "i2i" ? "is-active" : undefined} onClick={() => setMode("i2i")}>
            图生图
          </button>
        </div>
        <p className="studio-kicker">没思路？点模板</p>
        <div className="chip-row">
          {IMAGE_TEMPLATES.map((item) => (
            <button
              key={item.label}
              type="button"
              className={prompt === item.prompt ? "is-active" : undefined}
              onClick={() => setPrompt(item.prompt)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {(family === "civitai" || family === "generic") && (
          <label>
            负面提示
            <textarea rows={2} value={negative} onChange={(event) => setNegative(event.target.value)} placeholder="不要出现的内容" />
          </label>
        )}
        <p className="studio-kicker">选择模型 · {models.length}</p>
        <div className="bp-pick" data-testid="image-models">
          {groups.map(([provider, list]) => (
            <div key={provider}>
              <small>{provider}</small>
              {list.map((item) => {
                const key = catalogKey(item);
                return (
                  <button key={key} type="button" className={key === selection ? "is-on" : undefined} onClick={() => setSelection(key)}>
                    <b>{item.model}</b>
                    <span>
                      {item.nsfw ? "NSFW" : "安全"} · {item.cost || "1 点"}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="studio-kicker">参数</p>
        <div className="bp-params-col">
          {family === "ark" ? (
            <div className="studio-seg">
              {["2K", "3K"].map((item) => (
                <button key={item} type="button" className={size === item ? "is-active" : undefined} onClick={() => setSize(item)}>
                  {item} · {item === "3K" ? "2 点" : "1 点"}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="studio-seg">
                {Object.keys(ASPECTS).map((item) => (
                  <button key={item} type="button" className={aspect === item ? "is-active" : undefined} onClick={() => setAspect(item)}>
                    {item}
                  </button>
                ))}
              </div>
              <div className="studio-seg">
                {(["eco", "std", "hq"] as const).map((item) => (
                  <button key={item} type="button" className={quality === item ? "is-active" : undefined} onClick={() => setQuality(item)}>
                    {item === "eco" ? "经济 · 1 点" : item === "hq" ? "稳定 · 2 点" : "标准 · 1 点"}
                  </button>
                ))}
              </div>
            </>
          )}
          {(family === "civitai" || family === "gpt") && (
            <div className="studio-seg">
              {[1, 2, 4].map((item) => (
                <button key={item} type="button" className={count === item ? "is-active" : undefined} onClick={() => setCount(item)}>
                  {item} 张
                </button>
              ))}
            </div>
          )}
          {family === "civitai" ? (
            <label className="bp-seed">
              种子
              <input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="可空" />
            </label>
          ) : null}
        </div>
        <div className="bp-cta">
          <p className="studio-hint">
            {card?.nsfw ? "NSFW 允许" : "安全档"} · 剩余 {remaining} 点
          </p>
          <button type="button" className="studio-primary" disabled={Boolean(busy) || !prompt.trim()} onClick={() => void generate()}>
            {busy ? busy : "生成"}
          </button>
          {error ? <p className="studio-error">{error}</p> : null}
        </div>
      </aside>
      <section className="bp-right">
        <header className="bp-bar">
          <div>
            <p className="studio-kicker">{url || busy ? "生成结果" : "示例效果"}</p>
            <strong>{card?.model}</strong>
            <span className="studio-hint"> {card?.provider}</span>
          </div>
        </header>
        <WorkbenchStatus
          busy={busy}
          error={error}
          done={url ? `${card?.model || "模型"} 已出图` : ""}
          idle="右侧先看示例。生成后结果会盖在上面。"
        />
        {url || busy ? (
          <>
            <div className="bp-stage">
              {url ? <img src={url} alt={prompt} /> : null}
              <StageOverlay busy={busy} />
            </div>
            {url ? (
              <div className="result-actions" style={{ padding: "0 16px 8px" }}>
                <a className="studio-ghost" href={url} download="studio.png" target="_blank" rel="noreferrer">
                  下载
                </a>
                <button type="button" className="studio-ghost" onClick={() => void generate()}>
                  再生成
                </button>
                <button
                  type="button"
                  className="studio-ghost"
                  onClick={() => {
                    setReference(url);
                    setMode("i2i");
                  }}
                >
                  用作参考
                </button>
                <button type="button" className="studio-ghost" onClick={sendCanvas}>
                  送入画布
                </button>
              </div>
            ) : null}
          </>
        ) : null}
        <p className="bp-examples-title">示例效果 · 点一张可带入提示词</p>
        <div className="bp-examples">
          {recent.map((item) => (
            <button
              key={item.id}
              type="button"
              className={url === item.urls[0] ? "is-active" : undefined}
              onClick={() => {
                if (item.urls[0]) setUrl(item.urls[0]);
                if (item.prompt) setPrompt(item.prompt);
              }}
            >
              <img src={item.urls[0]} alt={item.title} />
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
