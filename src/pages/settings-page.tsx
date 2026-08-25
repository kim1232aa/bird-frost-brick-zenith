"use client";

import { useState } from "react";
import { adapterForProvider, listStudioAdapters } from "@/studio/adapters";
import { PROTOCOL_PRESETS, protocolById, type EndpointMap } from "@/studio/protocols";
import { useStudioSession } from "@/studio/session";

export function SettingsPage() {
  const relays = useStudioSession((state) => state.relays);
  const setRelayKey = useStudioSession((state) => state.setRelayKey);
  const setRelayEnabled = useStudioSession((state) => state.setRelayEnabled);
  const setRelayFields = useStudioSession((state) => state.setRelayFields);
  const addRelay = useStudioSession((state) => state.addRelay);
  const resetRelays = useStudioSession((state) => state.resetRelays);
  const [active, setActive] = useState(relays[0]?.id || "");
  const [tests, setTests] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({
    protocol: "openai-compat",
    name: "",
    baseUrl: PROTOCOL_PRESETS[0].defaultBaseUrl,
    apiKey: "",
    authScheme: PROTOCOL_PRESETS[0].authScheme,
    endpoints: { ...PROTOCOL_PRESETS[0].endpoints },
    models: PROTOCOL_PRESETS[0].exampleModels.join(", "),
  });

  const current = relays.find((item) => item.id === active) || relays[0];

  const test = async (id: string) => {
    const relay = relays.find((item) => item.id === id);
    if (!relay) return;
    setTests((current) => ({ ...current, [id]: "正在打测试端点…" }));
    const adapter = adapterForProvider(relay);
    const start = Date.now();
    try {
      const result = adapter.testConnection
        ? await adapter.testConnection({ provider: relay })
        : { ok: Boolean(relay.apiKey), message: relay.apiKey ? "密钥已保存，该协议未实现独立探测" : "缺少密钥" };
      setTests((current) => ({
        ...current,
        [id]: `${result.ok ? "通过" : "失败"} · ${Date.now() - start}ms · ${result.message}${result.models?.length ? ` · 模型 ${result.models.slice(0, 6).join(", ")}` : ""}`,
      }));
    } catch (err) {
      setTests((current) => ({ ...current, [id]: `失败 · ${err instanceof Error ? err.message : "错误"}` }));
    }
  };

  const pickProtocol = (id: string) => {
    const proto = protocolById(id);
    setDraft({
      protocol: proto.id,
      name: draft.name || proto.label,
      baseUrl: proto.defaultBaseUrl,
      apiKey: draft.apiKey,
      authScheme: proto.authScheme,
      endpoints: { ...proto.endpoints },
      models: proto.exampleModels.join(", "),
    });
  };

  const patchEndpoint = (key: keyof EndpointMap, value: string) => {
    if (!current) return;
    setRelayFields(current.id, { endpoints: { ...(current.endpoints || {}), [key]: value } });
  };

  return (
    <div className="wire-desk">
      <aside className="wire-list">
        <header>
          <p className="studio-kicker">WIRING</p>
          <h1>接线</h1>
          <p className="studio-hint">先选协议，再填 Base URL / 端点 / Key。协议决定字段怎么发，不是只改一个 URL。</p>
        </header>
        {relays.map((item) => (
          <button key={item.id} type="button" className={item.id === current?.id ? "wire-item is-on" : "wire-item"} onClick={() => setActive(item.id)}>
            <b>{item.name}</b>
            <small>
              {item.protocol || item.adapterType || "openai-compat"} · {item.enabled && item.apiKey ? "启用" : "关闭"}
            </small>
          </button>
        ))}
        <button type="button" className="studio-ghost" onClick={resetRelays}>
          恢复内置密钥
        </button>
      </aside>
      <section className="wire-editor">
        {current ? (
          <>
            <h2>{current.name}</h2>
            <label className="model-picker">
              协议
              <select
                value={current.protocol || current.adapterType || "openai-compat"}
                onChange={(event) => {
                  const proto = protocolById(event.target.value);
                  setRelayFields(current.id, {
                    protocol: proto.id,
                    adapterType: proto.id,
                    baseUrl: current.baseUrl || proto.defaultBaseUrl,
                    authScheme: proto.authScheme,
                    endpoints: current.endpoints || proto.endpoints,
                    remark: proto.docs,
                  });
                }}
              >
                {PROTOCOL_PRESETS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="studio-hint">
              {protocolById(current.protocol || current.adapterType || "").blurb}
              <br />
              文档：{protocolById(current.protocol || current.adapterType || "").docs}
            </p>
            <label className="model-picker">
              Base URL
              <input value={current.baseUrl} onChange={(event) => setRelayFields(current.id, { baseUrl: event.target.value })} />
            </label>
            <label className="model-picker">
              鉴权
              <select
                value={current.authScheme || "Bearer"}
                onChange={(event) => setRelayFields(current.id, { authScheme: event.target.value as "Bearer" | "Key" | "x-api-key" })}
              >
                <option value="Bearer">Authorization: Bearer</option>
                <option value="Key">Authorization: Key</option>
                <option value="x-api-key">x-api-key</option>
              </select>
            </label>
            <label className="model-picker">
              API Key
              <input type="password" value={current.apiKey || ""} onChange={(event) => setRelayKey(current.id, event.target.value)} autoComplete="off" />
            </label>
            <div className="param-block">
              <p className="studio-kicker">端点（可改，默认来自协议）</p>
              {(["chat", "images", "videosCreate", "videosPoll", "models", "test"] as const).map((key) => (
                <label key={key} className="model-picker">
                  {key}
                  <input
                    value={(current.endpoints || {})[key] || protocolById(current.protocol || current.adapterType || "").endpoints[key] || ""}
                    onChange={(event) => patchEndpoint(key, event.target.value)}
                    placeholder="留空则用协议默认"
                  />
                </label>
              ))}
            </div>
            <div className="result-actions">
              <button type="button" className="studio-ghost" onClick={() => setRelayEnabled(current.id, !current.enabled)}>
                {current.enabled ? "停用" : "启用"}
              </button>
              <button type="button" className="studio-primary" onClick={() => void test(current.id)}>
                测试连通
              </button>
            </div>
            {tests[current.id] ? <p className="studio-hint">{tests[current.id]}</p> : null}
          </>
        ) : null}
        <hr />
        <h2>接入新 API</h2>
        <p className="studio-hint">选协议 → 端点自动填入 → 改 Base URL / Key → 加入接线表。生成页会按适配器发官方字段，不共用一套参数。</p>
        <label className="model-picker">
          协议
          <select value={draft.protocol} onChange={(event) => pickProtocol(event.target.value)}>
            {PROTOCOL_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="studio-hint">{protocolById(draft.protocol).blurb}</p>
        <label className="model-picker">
          名称
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={protocolById(draft.protocol).label} />
        </label>
        <label className="model-picker">
          Base URL
          <input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} />
        </label>
        <label className="model-picker">
          API Key
          <input type="password" value={draft.apiKey} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} />
        </label>
        <label className="model-picker">
          模型（逗号分隔，可后改）
          <input value={draft.models} onChange={(event) => setDraft({ ...draft, models: event.target.value })} />
        </label>
        <div className="param-block">
          {(["images", "videosCreate", "videosPoll", "chat"] as const).map((key) => (
            <label key={key} className="model-picker">
              {key}
              <input
                value={draft.endpoints[key] || ""}
                onChange={(event) => setDraft({ ...draft, endpoints: { ...draft.endpoints, [key]: event.target.value } })}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="studio-primary"
          onClick={() => {
            const proto = protocolById(draft.protocol);
            const models = draft.models.split(/[,，\s]+/).filter(Boolean);
            addRelay({
              name: draft.name || proto.label,
              baseUrl: draft.baseUrl,
              apiKey: draft.apiKey,
              adapterType: proto.id,
              protocol: proto.id,
              authScheme: proto.authScheme,
              endpoints: draft.endpoints,
              enabled: Boolean(draft.apiKey),
              imageModels: models,
              remark: proto.docs,
            });
            setDraft({ ...draft, name: "", apiKey: "" });
          }}
        >
          加入接线表
        </button>
        <p className="studio-footnote">已装适配器：{listStudioAdapters().map((item) => item.label).join(" / ")}</p>
      </section>
    </div>
  );
}
