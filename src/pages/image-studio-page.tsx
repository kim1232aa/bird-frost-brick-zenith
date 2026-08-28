"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { findCatalog, catalogKey } from "@/studio/catalog";
import { defaultEditKey, isEditModel, isEditOnlyModel } from "@/studio/edit-models";
import { generateStudioImage } from "@/studio/generate/image";
import { useStudioJobs } from "@/studio/generate/jobs";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { useMediaDraft } from "@/studio/media-draft";
import { filesToDataUrls } from "@/studio/image-refs";
import { useMembershipStore } from "@/studio/membership";
import { liveCatalog, liveCard, useOpsStore } from "@/studio/ops";
import { preferredImageKey, preferredTextKey, StudioModelField } from "@/studio/model-select";
import { IMAGE_TEMPLATES } from "@/studio/prompt-bank";
import { useStudioSession } from "@/studio/session";
import { dropToCanvas, queryParam, splitModel } from "@/studio/split";
import { enhancePrompt } from "@/studio/story/plan";
import { StageOverlay, WorkbenchStatus } from "@/studio/workbench-status";
import { GuestGenerateBanner, useGenerateAccess } from "@/studio/auth-gate";

const ASPECTS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "3:4": { w: 768, h: 1024 },
  "4:3": { w: 1024, h: 768 },
};

type ImageMode = "t2i" | "i2i" | "edit";

function engineFamily(selection: string) {
  if (/volcengine|seedream/i.test(selection)) return "ark" as const;
  if (selection.includes("civitai") || /krea2|flux2|sdxl|anima|z-image-turbo|qwen-3\.0/i.test(selection)) return "civitai" as const;
  if (/gpt-image/i.test(selection)) return "gpt" as const;
  if (/grok-imagine-image/i.test(selection)) return "grok" as const;
  if (/agnes-image/i.test(selection)) return "agnes" as const;
  if (/sensenova/i.test(selection)) return "sensenova" as const;
  return "generic" as const;
}

function aspectBox(ratio: string) {
  const [w, h] = ratio.split(":").map(Number);
  const max = 22;
  if (!w || !h) return { width: max, height: max };
  if (w >= h) return { width: max, height: Math.max(8, Math.round((max * h) / w)) };
  return { width: Math.max(8, Math.round((max * w) / h)), height: max };
}

function supportsLora(family: ReturnType<typeof engineFamily>, model: string) {
  return family === "civitai" && /sdxl|anima|flux1|krea|z-image/i.test(model);
}

export function ImageStudioPage({ initialMode = "t2i" }: { initialMode?: ImageMode }) {
  const navigate = useNavigate();
  const relays = useStudioSession((state) => state.relays);
  const items = useStudioHistory((state) => state.items);
  const addHistory = useStudioHistory((state) => state.add);
  const remaining = useOpsStore((state) => state.credits.image);
  const record = useMembershipStore((state) => state.record);
  const startJob = useStudioJobs((state) => state.start);
  const succeedJob = useStudioJobs((state) => state.succeed);
  const failJob = useStudioJobs((state) => state.fail);
  const access = useGenerateAccess();
  const allModels = liveCatalog("image", false);
  const [prompt, setPrompt] = useState("");
  const [negative, setNegative] = useState("");
  const [selection, setSelection] = useState(preferredImageKey());
  const [textModel, setTextModel] = useState(preferredTextKey());
  const [mode, setMode] = useState<ImageMode>(initialMode);
  const [quality, setQuality] = useState<"eco" | "std" | "hq">("std");
  const [aspect, setAspect] = useState("1:1");
  const [size, setSize] = useState("2K");
  const [seed, setSeed] = useState("");
  const [count, setCount] = useState(1);
  const references = useMediaDraft((state) => state.references);
  const setReferences = useMediaDraft((state) => state.setReferences);
  const [loras, setLoras] = useState<Array<{ resource: string; weight: number }>>([{ resource: "", weight: 1 }]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [polishBusy, setPolishBusy] = useState(false);
  const [polishError, setPolishError] = useState("");
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const fromQuery = queryParam("mode");
    if (fromQuery === "edit" || fromQuery === "i2i" || fromQuery === "t2i") setMode(fromQuery);
    else setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const next = queryParam("model");
    if (next) setSelection(next);
  }, []);

  const models = useMemo(() => {
    if (mode === "edit") return allModels.filter((card) => isEditModel(card.model) && card.wired);
    return allModels.filter((card) => !isEditOnlyModel(card.model));
  }, [allModels, mode]);

  useEffect(() => {
    if (!models.length) return;
    if (!models.some((card) => catalogKey(card) === selection)) {
      setSelection(mode === "edit" ? defaultEditKey(models.map(catalogKey)) : catalogKey(models[0]));
    }
  }, [models, selection, mode]);

  const card = models.find((item) => catalogKey(item) === selection) || findCatalog(selection) || models[0];
  const family = engineFamily(selection);
  const selectedLive = card ? liveCard(card) : undefined;
  const mine = useMemo(
    () => items.filter((item) => item.kind === "image" && item.urls[0]),
    [items],
  );
  const seeds = useMemo(() => GALLERY_SEED.filter((item) => item.kind === "image"), []);
  const showLora = supportsLora(family, card?.model || "");

  useEffect(() => {
    if (family === "ark") setSize(quality === "hq" ? "3K" : "2K");
  }, [quality, family]);

  const dims = useMemo(() => {
    const base = ASPECTS[aspect] || ASPECTS["1:1"];
    const scale = quality === "eco" ? 0.75 : quality === "hq" ? 1.25 : 1;
    return { width: Math.round(base.w * scale), height: Math.round(base.h * scale) };
  }, [aspect, quality]);

  const goMode = (next: ImageMode) => {
    setMode(next);
    setError("");
    if (next === "edit") void navigate({ to: "/edit" });
    else void navigate({ to: "/image" });
  };

  const addRefs = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = await filesToDataUrls(files, 3);
    setReferences((current) => [...current, ...next].slice(0, 5));
    if (mode === "t2i") setMode("i2i");
  };

  const generate = async () => {
    if (!access.allowed) {
      setError(access.blockedReason || "请先登录");
      return;
    }
    const { providerId, model } = splitModel(selection);
    const refs = mode === "t2i" ? [] : references;
    if ((mode === "i2i" || mode === "edit") && !refs.length) {
      setError(mode === "edit" ? "编辑至少上传 1 张参考图" : "图生图至少上传 1 张参考图");
      return;
    }
    setBusy(`正在提交 ${card?.model || model}…`);
    setError("");
    const loraMap = showLora
      ? Object.fromEntries(loras.filter((item) => item.resource.trim()).map((item) => [item.resource.trim(), item.weight]))
      : undefined;
    const jobId = startJob({
      kind: mode === "edit" ? "edit" : "image",
      prompt,
      model,
      providerId,
      credits: (family === "ark" ? (size === "3K" ? 2 : 1) : quality === "hq" ? 2 : 1) * count,
    });
    try {
      const result = await generateStudioImage({
        relays,
        prompt,
        providerId,
        model,
        size: family === "ark" ? size : family === "gpt" ? (quality === "hq" ? "1536x1536" : "1024x1024") : family === "agnes" || family === "sensenova" ? aspect : size,
        aspectRatio: aspect,
        width: family === "civitai" || family === "grok" ? dims.width : undefined,
        height: family === "civitai" || family === "grok" ? dims.height : undefined,
        seed: family === "civitai" && seed ? Number(seed) : undefined,
        imageUrl: refs[0],
        imageUrls: refs,
        negativePrompt: negative || undefined,
        n: count,
        operation: mode === "edit" ? "edit" : "generate",
        loras: loraMap && Object.keys(loraMap).length ? loraMap : undefined,
      });
      setBusy("正在写入结果…");
      setUrls(result.urls);
      record("image");
      addHistory({ kind: "image", title: prompt.slice(0, 40), prompt, model: result.model, urls: result.urls });
      succeedJob(jobId, result.urls);
      setBusy("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "生图失败";
      setError(message);
      failJob(jobId, message);
      setBusy("");
    }
  };

  const polish = async () => {
    setPolishBusy(true);
    setPolishError("");
    try {
      const next = await enhancePrompt({ relays, prompt, textModel, kind: "image" });
      setPrompt(next);
    } catch (err) {
      setPolishError(err instanceof Error ? err.message : "润色失败");
    } finally {
      setPolishBusy(false);
    }
  };

  const sendCanvas = () => {
    dropToCanvas({ kind: urls[0] ? "image" : "prompt", url: urls[0] || undefined, prompt, model: selection, text: prompt });
    void navigate({ to: "/canvas" });
  };

  const unitCost = family === "ark" ? (size === "3K" ? 2 : 1) : quality === "hq" ? 2 : 1;
  const creditCost = unitCost * count;
  const disabledReason = busy
    ? busy
    : access.blockedReason
      ? access.blockedReason
      : !prompt.trim()
        ? "请先填写提示词"
        : !models.length
          ? mode === "edit"
            ? "没有可编辑模型。确认 Qwen-Image-Edit 或 FLUX.2-dev 已接线。"
            : "没有可选手模型"
          : (mode === "i2i" || mode === "edit") && !references.length
            ? "先上传 1–3 张参考图"
            : selectedLive && !selectedLive.wired
              ? `${card?.model || "该模型"} 待接线，换一个已填密钥的，或去设置填 Key`
              : remaining < creditCost
                ? `积分不足，需要 ${creditCost} 点`
                : "";

  const hero =
    mode === "edit"
      ? { kicker: "改图", title: "改图", copy: "上传 1 到 3 张要改的图，写下改哪里、留下什么。生成成功会从本账号额度扣点，失败不扣。" }
      : mode === "i2i"
        ? { kicker: "生图", title: "按图出图", copy: "参考图最多 3 张，都会送给模型，不会只传第一张。" }
        : { kicker: "生图", title: "文生图", copy: "选模型、写想法，一次可出 1 / 2 / 4 张。" };

  return (
    <div className="bp-page">
      <header className="bp-hero">
        <p className="studio-kicker">{hero.kicker}</p>
        <h1>{hero.title}</h1>
        <p>{hero.copy}</p>
      </header>
      <GuestGenerateBanner kind="image" />
      <div className="bp-work">
      <aside className="bp-left">
        <p className="studio-kicker">{card?.model || "生图"}</p>
        <h1>{card?.model || hero.title}</h1>
        <div className="studio-seg">
          <button type="button" className={mode === "t2i" ? "is-active" : undefined} onClick={() => goMode("t2i")}>
            文生图
          </button>
          <button type="button" className={mode === "i2i" ? "is-active" : undefined} onClick={() => goMode("i2i")}>
            按图出图
          </button>
          <button type="button" className={mode === "edit" ? "is-active" : undefined} onClick={() => goMode("edit")}>
            改图
          </button>
        </div>
        <div className="bp-model-fields">
          <StudioModelField kind="image" value={selection} onChange={setSelection} label={mode === "edit" ? "编辑模型" : "生图模型"} cards={models} />
          <StudioModelField kind="text" value={textModel} onChange={setTextModel} label="把句子写顺的模型" />
        </div>
        <label>
          描述你的想法
          <textarea rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === "edit" ? "说明要改哪里、保留什么" : "描述你的想法"} />
        </label>
        <div className="prompt-tools">
          <span className="bp-count">必填 · {prompt.length} / 20000</span>
          <button type="button" className="studio-ghost" disabled={Boolean(busy) || polishBusy} onClick={() => void polish()}>
            {polishBusy ? "正在写顺…" : "把提示词写顺"}
          </button>
        </div>
        {polishError ? <p className="studio-hint" role="alert">{polishError}</p> : null}
        {mode !== "t2i" ? (
          <div className="ref-stack">
            <div className="ref-grid">
              {references.map((url, index) => (
                <figure key={`${url.slice(0, 24)}-${index}`} className="ref-chip">
                  <img src={url} alt={`参考 ${index + 1}`} />
                  <button type="button" onClick={() => setReferences((current) => current.filter((_, i) => i !== index))}>
                    去掉
                  </button>
                </figure>
              ))}
              {references.length < 3 ? (
                <label className="dropzone dropzone-mini">
                  <span>{references.length ? `再加一张（${references.length}/3）` : mode === "edit" ? "上传要改的图，最多 3 张" : "上传参考图，最多 3 张"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      void addRefs(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              ) : null}
            </div>
            <small className="studio-hint">1–3 张都会提交给模型，不是只传第一张。</small>
          </div>
        ) : (
          <label className="dropzone">
            <span>可选：丢一张参考会自动切到图生图</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                void addRefs(event.target.files);
                event.target.value = "";
              }}
            />
            <small>不上传则走文生图</small>
          </label>
        )}
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
        {(family === "civitai" || family === "generic" || mode === "edit") && (
          <label>
            负面提示
            <textarea rows={2} value={negative} onChange={(event) => setNegative(event.target.value)} placeholder="不要出现的内容" />
          </label>
        )}
        <p className="studio-kicker">出图设置</p>
        <p className="cap-strip">
          {mode === "t2i" ? "文生图" : mode === "edit" ? "改图 · 参考 1–3 张" : "按图出图 · 参考 1–3 张"}
          {" · "}
          一次 {count} 张
          {showLora ? " · 可加风格插件" : ""}
          {family === "civitai" ? " · 可填种子" : ""}
          {family === "ark" ? ` · ${size}` : ` · ${quality === "eco" ? "省一点" : quality === "hq" ? "更清楚" : "普通"}`}
        </p>
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
              <div className="aspect-grid">
                {Object.keys(ASPECTS).map((item) => {
                  const box = aspectBox(item);
                  return (
                    <button key={item} type="button" className={aspect === item ? "is-active" : undefined} onClick={() => setAspect(item)}>
                      <span className="aspect-preview" style={box} />
                      {item}
                    </button>
                  );
                })}
              </div>
              <div className="studio-seg">
                {(["eco", "std", "hq"] as const).map((item) => (
                  <button key={item} type="button" className={quality === item ? "is-active" : undefined} onClick={() => setQuality(item)}>
                    {item === "eco" ? "省一点 · 1 点" : item === "hq" ? "更清楚 · 2 点" : "普通 · 1 点"}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="studio-seg">
            {[1, 2, 4].map((item) => (
              <button key={item} type="button" className={count === item ? "is-active" : undefined} onClick={() => setCount(item)}>
                {item} 张
              </button>
            ))}
          </div>
          {family === "civitai" ? (
            <label className="bp-seed">
              种子
              <input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="可空" />
            </label>
          ) : null}
          {showLora ? (
            <div className="lora-stack">
              <p className="studio-kicker">Civitai LoRA</p>
              {loras.map((item, index) => (
                <div key={index} className="lora-row">
                  <input
                    value={item.resource}
                    onChange={(event) =>
                      setLoras((current) => current.map((row, i) => (i === index ? { ...row, resource: event.target.value } : row)))
                    }
                    placeholder="urn:air:sdxl:lora:civitai:模型@版本"
                  />
                  <input
                    type="number"
                    min={-2}
                    max={2}
                    step={0.05}
                    value={item.weight}
                    onChange={(event) =>
                      setLoras((current) => current.map((row, i) => (i === index ? { ...row, weight: Number(event.target.value) } : row)))
                    }
                  />
                  <button
                    type="button"
                    className="studio-ghost"
                    onClick={() =>
                      setLoras((current) => {
                        const next = current.filter((_, i) => i !== index);
                        return next.length ? next : [{ resource: "", weight: 1 }];
                      })
                    }
                  >
                    去掉
                  </button>
                </div>
              ))}
              {loras.length < 4 ? (
                <button type="button" className="studio-ghost" onClick={() => setLoras((current) => [...current, { resource: "", weight: 1 }])}>
                  加 LoRA
                </button>
              ) : null}
              <small className="studio-hint">填完整 model-version AIR。SDXL / Anima / Flux1 / Krea 才提交。</small>
            </div>
          ) : null}
        </div>
        <div className="bp-cta">
          <button type="button" className="bp-generate bp-generate-image" disabled={Boolean(disabledReason)} onClick={() => void generate()}>
            <span>{busy ? busy : mode === "edit" ? "开始编辑" : "生成图片"}</span>
            <small>{disabledReason || `${creditCost} 点 · 剩余 ${remaining}`}</small>
          </button>
          {error ? <p className="studio-error">{error}</p> : null}
        </div>
      </aside>
      <section className="bp-right">
        <header className="bp-bar">
          <div>
            <p className="studio-kicker">{urls[0] || busy ? "生成结果" : "示例效果"}</p>
            <strong>{card?.model}</strong>
            <span className="studio-hint"> {card?.provider}</span>
          </div>
        </header>
        <WorkbenchStatus
          busy={busy}
          error={error}
          done={urls[0] ? `${card?.model || "模型"} 已出图 ×${urls.length}` : ""}
          idle="生成后图片会出现在上面。下面参考样片只带提示词，不会冒充当前模型的成图。"
        />
        {urls[0] || busy ? (
          <>
            <div className={urls.length > 1 ? "bp-stage-grid" : "bp-stage"}>
              {urls.map((url) => (
                <img key={url} src={url} alt={prompt} />
              ))}
              <StageOverlay busy={busy} />
            </div>
            {urls[0] ? (
              <div className="result-actions" style={{ padding: "0 16px 8px" }}>
                <a className="studio-ghost" href={urls[0]} download="studio.png" target="_blank" rel="noreferrer">
                  下载
                </a>
                <button type="button" className="studio-ghost" onClick={() => void generate()}>
                  再生成
                </button>
                <button
                  type="button"
                  className="studio-ghost"
                  onClick={() => {
                    setReferences((current) => [...urls, ...current].slice(0, 5));
                    goMode("edit");
                  }}
                >
                  拿去编辑
                </button>
                <button type="button" className="studio-ghost" onClick={sendCanvas}>
                  送入画布
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="bp-stage">
            <p className="studio-hint">还没有成图。写想法，点绿色按钮即可。</p>
          </div>
        )}
        {mine.length ? (
          <>
            <p className="bp-examples-title">我的出图</p>
            <div className="bp-examples">
              {mine.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={urls[0] === item.urls[0] ? "is-active" : undefined}
                  onClick={() => {
                    if (item.urls[0]) setUrls(item.urls);
                    if (item.prompt) setPrompt(item.prompt);
                  }}
                >
                  <img src={item.urls[0]} alt={item.title} />
                  <span>
                    {item.title}
                    <br />
                    {item.model}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <p className="bp-examples-title">参考样片（点一下只带提示词）</p>
        <div className="bp-examples">
          {seeds.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.prompt) setPrompt(item.prompt);
              }}
            >
              <img src={item.urls[0]} alt={item.title} />
              <span>
                {item.title}
                <br />
                参考 · {item.model}
              </span>
            </button>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
