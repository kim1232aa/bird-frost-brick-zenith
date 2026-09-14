"use client";

import { useState } from "react";
import {
  API_CAPABILITIES,
  API_CAPABILITY_LABELS,
  providerHasUsableCredential,
  classifyProviderModels,
  normalizeModelList,
  type ApiCapability,
  type ApiRelayProvider,
} from "@/stores/api-relay-config";
import { studioProxyJson } from "@/studio/generate/proxy";
import { useStudioSession } from "@/studio/session";

export function guessCapabilities(model: string): ApiCapability[] {
  const value = model.toLowerCase();
  const caps: ApiCapability[] = [];
  if (/(seedance|t2v|i2v|kling|sora|ltx|runway|hailuo|wan2\.|video)/.test(value) || /imagine-video/.test(value)) caps.push("video");
  if (/(seedream|gpt-image|dall-e|dalle|flux|sdxl|t2i|i2i|imagen|qwen-image|z-image|krea)/.test(value) || /imagine-image/.test(value)) caps.push("image");
  if (/(tts|audio|speech|voice)/.test(value)) caps.push("audio");
  if (!caps.length && /(gpt-|claude|qwen-plus|qwen-max|grok-4|llama|deepseek|chat|instruct)/.test(value)) caps.push("text");
  if (!caps.length) caps.push("text");
  return caps;
}

function modelPool(relay: ApiRelayProvider) {
  return normalizeModelList([
    ...(relay.models || []),
    ...(relay.textModels || []),
    ...(relay.imageModels || []),
    ...(relay.videoModels || []),
    ...(relay.audioModels || []),
  ]);
}

function parseModelIds(data: unknown): string[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((item) => (typeof item === "string" ? item : item && typeof item === "object" ? String((item as { id?: string }).id || (item as { name?: string }).name || "") : ""))
      .filter(Boolean);
  }
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    return parseModelIds(record.data || record.models || record.output);
  }
  return [];
}

export function RelayModelBoard({ relay }: { relay: ApiRelayProvider }) {
  const setRelayFields = useStudioSession((state) => state.setRelayFields);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const models = modelPool(relay);

  const apply = (patch: Partial<ApiRelayProvider>) => {
    const capabilities = API_CAPABILITIES.filter(
      (cap) => (patch[`${cap}Models`] || relay[`${cap}Models`] || []).length > 0,
    );
    setRelayFields(relay.id, { ...patch, capabilities: capabilities.length ? capabilities : relay.capabilities });
  };

  const toggle = (model: string, capability: ApiCapability, checked: boolean) => {
    const current = capability === "text" ? relay.textModels : capability === "image" ? relay.imageModels : capability === "video" ? relay.videoModels : relay.audioModels;
    const next = checked ? [...current, model] : current.filter((item) => item !== model);
    apply(classifyProviderModels(relay, capability, next));
  };

  const addModel = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (models.includes(name)) {
      setNote(`「${name}」已在列表里，直接勾选用途即可。`);
      setDraft("");
      return;
    }
    const guessed = guessCapabilities(name);
    let next: ApiRelayProvider = {
      ...relay,
      models: normalizeModelList([...relay.models, name]),
    };
    for (const cap of guessed) {
      const classified = classifyProviderModels(next, cap, [...(cap === "text" ? next.textModels : cap === "image" ? next.imageModels : cap === "video" ? next.videoModels : next.audioModels), name]);
      next = { ...next, ...classified };
    }
    apply({
      models: next.models,
      textModels: next.textModels,
      imageModels: next.imageModels,
      videoModels: next.videoModels,
      audioModels: next.audioModels,
      capabilities: next.capabilities,
    });
    setDraft("");
    setNote(`已加入 ${name}，可改勾选：${guessed.map((cap) => API_CAPABILITY_LABELS[cap]).join(" / ")}`);
  };

  const removeModel = (model: string) => {
    apply({
      models: relay.models.filter((item) => item !== model),
      textModels: relay.textModels.filter((item) => item !== model),
      imageModels: relay.imageModels.filter((item) => item !== model),
      videoModels: relay.videoModels.filter((item) => item !== model),
      audioModels: relay.audioModels.filter((item) => item !== model),
    });
  };

  const pull = async () => {
    if (!providerHasUsableCredential(relay)) {
      setNote("先填 API Key，再读取模型。");
      return;
    }
    setBusy("正在读取 /models…");
    setNote("");
    try {
      const path = relay.endpoints?.models || "/models";
      const data = await studioProxyJson({
        provider: relay,
        path,
        method: "GET",
        timeoutMs: 20_000,
      });
      const discovered = normalizeModelList(parseModelIds(data));
      if (!discovered.length) {
        setNote("上游没返回模型 ID。可以自己在下面添加，再勾选文本 / 图片 / 视频。");
        return;
      }
      const existing = new Set(models);
      let next: ApiRelayProvider = {
        ...relay,
        models: normalizeModelList([...relay.models, ...discovered]),
      };
      let classified = 0;
      for (const model of discovered) {
        if (existing.has(model)) continue;
        const guessed = guessCapabilities(model);
        classified += 1;
        for (const cap of guessed) {
          const list =
            cap === "text" ? next.textModels : cap === "image" ? next.imageModels : cap === "video" ? next.videoModels : next.audioModels;
          const patch = classifyProviderModels(next, cap, [...list, model]);
          next = { ...next, ...patch };
        }
      }
      apply({
        models: next.models,
        textModels: next.textModels,
        imageModels: next.imageModels,
        videoModels: next.videoModels,
        audioModels: next.audioModels,
        capabilities: next.capabilities,
      });
      setNote(`读到 ${discovered.length} 个模型，新分类 ${classified} 个。可在下面改勾选，同一模型可同时用于图和视频。`);
    } catch (err) {
      setNote(err instanceof Error ? `读取失败：${err.message}` : "读取失败");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="wire-models">
      <div className="acct-card-head">
        <div>
          <p className="studio-kicker">MODELS</p>
          <h2>模型 · {models.length}</h2>
        </div>
        <button type="button" className="studio-primary" disabled={Boolean(busy)} onClick={() => void pull()}>
          {busy || "自动读取模型"}
        </button>
      </div>
      <p className="studio-hint">一把 Key 就是一个供应商，不用按模型拆多条。读取后自己勾选用途；没出现的模型可以手动加。</p>
      <div className="wire-model-add">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="加模型 ID，如 grok-imagine-video"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addModel(draft);
            }
          }}
        />
        <button type="button" className="studio-ghost" onClick={() => addModel(draft)}>
          添加
        </button>
      </div>
      {note ? <p className={note.startsWith("读取失败") ? "studio-error" : "studio-ok"}>{note}</p> : null}
      {models.length === 0 ? <p className="studio-hint">还没有模型。点「自动读取模型」，或手动添加后再勾选文本 / 图片 / 视频 / 音频。</p> : null}
      <div className="wire-model-list">
        {models.map((model) => (
          <div key={model} className="wire-model-row">
            <code>{model}</code>
            <div className="wire-model-caps">
              {API_CAPABILITIES.map((capability) => {
                const list =
                  capability === "text"
                    ? relay.textModels
                    : capability === "image"
                      ? relay.imageModels
                      : capability === "video"
                        ? relay.videoModels
                        : relay.audioModels;
                return (
                  <label key={capability}>
                    <input type="checkbox" checked={list.includes(model)} onChange={(event) => toggle(model, capability, event.target.checked)} />
                    {API_CAPABILITY_LABELS[capability]}
                  </label>
                );
              })}
              <button type="button" className="wire-model-del" onClick={() => removeModel(model)} aria-label={`去掉 ${model}`}>
                去掉
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
