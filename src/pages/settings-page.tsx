"use client";

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { adapterForProvider, listStudioAdapters } from "@/studio/adapters";
import { PROTOCOL_PRESETS, protocolById, type EndpointMap } from "@/studio/protocols";
import { isManagedRelayId } from "@/studio/relay-ids";
import { useStudioSession } from "@/studio/session";
import { RelayModelBoard, guessCapabilities } from "@/studio/relay-models";
import { RequireAdmin } from "@/studio/auth-gate";

type WireFilter = "all" | "ready" | "template" | "paused" | "custom";
type DeskMode = "edit" | "create";

function relayState(item: { enabled?: boolean; apiKey?: string }) {
  if (item.enabled && item.apiKey) return { label: "启用 · 已填密钥", className: "wire-state-on", filter: "ready" as const };
  if (item.enabled) return { label: "启用 · 待填密钥", className: "wire-state-on", filter: "template" as const };
  if (item.apiKey) return { label: "已填密钥 · 未启用", className: "wire-state-paused", filter: "paused" as const };
  return { label: "关闭 · 模板", className: "wire-state-off", filter: "template" as const };
}

function matchesQuery(item: { name: string; baseUrl: string; protocol?: string; adapterType?: string; remark?: string }, query: string) {
  if (!query) return true;
  const hay = `${item.name} ${item.baseUrl} ${item.protocol || ""} ${item.adapterType || ""} ${item.remark || ""}`.toLowerCase();
  return hay.includes(query);
}

function emptyDraft() {
  const proto = PROTOCOL_PRESETS[0];
  return {
    protocol: proto.id,
    name: "",
    baseUrl: proto.defaultBaseUrl,
    apiKey: "",
    authScheme: proto.authScheme,
    endpoints: { ...proto.endpoints },
    models: proto.exampleModels.join(", "),
  };
}

export function SettingsPage({ embedded = false }: { embedded?: boolean }) {
  const relays = useStudioSession((state) => state.relays);
  const setRelayKey = useStudioSession((state) => state.setRelayKey);
  const setRelayEnabled = useStudioSession((state) => state.setRelayEnabled);
  const setRelayFields = useStudioSession((state) => state.setRelayFields);
  const addRelay = useStudioSession((state) => state.addRelay);
  const removeRelay = useStudioSession((state) => state.removeRelay);
  const enableWiredRelays = useStudioSession((state) => state.enableWiredRelays);
  const enableAllRelays = useStudioSession((state) => state.enableAllRelays);
  const resetRelays = useStudioSession((state) => state.resetRelays);
  const [active, setActive] = useState(() => relays.find((item) => item.enabled && item.apiKey)?.id || relays[0]?.id || "");
  const [mode, setMode] = useState<DeskMode>("edit");
  const [tests, setTests] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WireFilter>("all");
  const [showKey, setShowKey] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [pane, setPane] = useState<"list" | "editor">("list");

  const current = relays.find((item) => item.id === active) || relays[0];
  const counts = useMemo(() => {
    const ready = relays.filter((item) => item.enabled && item.apiKey).length;
    const paused = relays.filter((item) => item.apiKey && !item.enabled).length;
    const template = relays.filter((item) => !item.apiKey).length;
    const custom = relays.filter((item) => !isManagedRelayId(item.id)).length;
    return { ready, paused, template, custom, total: relays.length };
  }, [relays]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return relays.filter((item) => {
      const state = relayState(item);
      if (filter === "custom") return !isManagedRelayId(item.id) && matchesQuery(item, q);
      if (filter !== "all" && state.filter !== filter) return false;
      return matchesQuery(item, q);
    });
  }, [relays, query, filter]);

  const openCreate = () => {
    setMode("create");
    setDraft(emptyDraft());
    setShowKey(false);
    setNotice("");
    setPane("editor");
  };

  const openEdit = (id: string) => {
    setActive(id);
    setMode("edit");
    setShowKey(false);
    setNotice("");
    setPane("editor");
  };

  const deleteRelay = (id: string, name: string) => {
    const preset = isManagedRelayId(id);
    const ok = window.confirm(
      preset
        ? `从接线表去掉「${name}」？内置模板不会从代码里消失，以后可点「恢复内置模板」加回来。`
        : `删除自定义供应商「${name}」？此操作只影响本机，不可撤销。`,
    );
    if (!ok) return;
    const leftover = relays.filter((item) => item.id !== id);
    removeRelay(id);
    if (active === id) {
      setActive(leftover[0]?.id || "");
      setMode(leftover[0] ? "edit" : "create");
    }
    setNotice(preset ? `已隐藏「${name}」，可用「恢复内置模板」加回。` : `已删除「${name}」。`);
  };

  const test = async (id: string) => {
    const relay = relays.find((item) => item.id === id);
    if (!relay) return;
    setTests((now) => ({ ...now, [id]: "正在打测试端点…" }));
    const adapter = adapterForProvider(relay);
    const start = Date.now();
    try {
      const result = adapter.testConnection
        ? await adapter.testConnection({ provider: relay })
        : { ok: Boolean(relay.apiKey), message: relay.apiKey ? "密钥已保存，该协议未实现独立探测" : "缺少密钥" };
      setTests((now) => ({
        ...now,
        [id]: `${result.ok ? "通过" : "失败"} · ${Date.now() - start}ms · ${result.message}${result.models?.length ? ` · 模型 ${result.models.slice(0, 6).join(", ")}` : ""}`,
      }));
    } catch (err) {
      setTests((now) => ({ ...now, [id]: `失败 · ${err instanceof Error ? err.message : "错误"}` }));
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

  const submitCreate = () => {
    const proto = protocolById(draft.protocol);
    const name = draft.name.trim() || proto.label;
    const baseUrl = draft.baseUrl.trim();
    if (!baseUrl) {
      setNotice("请先填写 Base URL，再加入接线表。");
      return;
    }
    const models = draft.models.split(/[,，\s]+/).filter(Boolean);
    const textModels = models.filter((model) => guessCapabilities(model).includes("text"));
    const imageModels = models.filter((model) => guessCapabilities(model).includes("image"));
    const videoModels = models.filter((model) => guessCapabilities(model).includes("video"));
    const audioModels = models.filter((model) => guessCapabilities(model).includes("audio"));
    const created = addRelay({
      name,
      baseUrl,
      apiKey: draft.apiKey,
      adapterType: proto.id,
      protocol: proto.id,
      authScheme: proto.authScheme,
      endpoints: draft.endpoints,
      enabled: true,
      models,
      textModels,
      imageModels,
      videoModels,
      audioModels,
      capabilities: [
        ...(textModels.length ? (["text"] as const) : []),
        ...(imageModels.length ? (["image"] as const) : []),
        ...(videoModels.length ? (["video"] as const) : []),
        ...(audioModels.length ? (["audio"] as const) : []),
      ],
      remark: proto.docs,
    });
    setDraft(emptyDraft());
    setActive(created.id);
    setMode("edit");
    setPane("editor");
    setNotice(`已新增「${name}」。填密钥后点测试连通即可使用。`);
  };

  const desk = (
    <div className={pane === "editor" ? `wire-desk ${mode === "create" ? "is-creating" : "is-editing"}` : "wire-desk"}>
      <aside className="wire-list">
        <header>
          <p className="studio-kicker">WIRING</p>
          <h1>接线</h1>
          <p className="studio-hint">
            可新增自己的中转，也可删除列表里的供应商。内置模板删了能恢复，自定义删除只影响本机。已启用 {counts.ready} / {counts.total}
          </p>
        </header>
        <ol className="acct-steps acct-steps-compact">
          <li>
            <b>1</b>
            <span>点「新增供应商」或左边选一个</span>
          </li>
          <li>
            <b>2</b>
            <span>右边贴名称、Base URL、API Key</span>
          </li>
          <li>
            <b>3</b>
            <span>启用并测试；不要的点删除</span>
          </li>
        </ol>
        <button type="button" className="studio-primary wire-add-btn" onClick={openCreate}>
          新增供应商
        </button>
        <input
          className="wire-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索名称 / 协议 / 域名"
          aria-label="搜索供应商"
        />
        <div className="wire-filters" role="tablist" aria-label="按状态筛选">
          {(
            [
              ["all", `全部 ${counts.total}`],
              ["ready", `已接线 ${counts.ready}`],
              ["paused", `未启用 ${counts.paused}`],
              ["template", `模板 ${counts.template}`],
              ["custom", `自定义 ${counts.custom}`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? "is-active" : undefined} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        {visible.length === 0 ? <p className="studio-hint">没有匹配的供应商。清空搜索，或点「新增供应商」。</p> : null}
        {visible.map((item) => {
          const state = relayState(item);
          const custom = !isManagedRelayId(item.id);
          return (
            <div key={item.id} className={item.id === current?.id && mode === "edit" ? "wire-row is-on" : "wire-row"}>
              <button type="button" className={item.id === current?.id && mode === "edit" ? "wire-item is-on" : "wire-item"} onClick={() => openEdit(item.id)}>
                <b>
                  {item.name}
                  {custom ? <em className="wire-tag">自定义</em> : null}
                </b>
                <small>
                  {item.protocol || item.adapterType || "openai-compat"} · <span className={state.className}>{state.label}</span>
                </small>
              </button>
              <button type="button" className="wire-item-del" onClick={() => deleteRelay(item.id, item.name)} aria-label={`删除 ${item.name}`}>
                删除
              </button>
            </div>
          );
        })}
        <button type="button" className="studio-primary" onClick={enableAllRelays}>
          全部启用
        </button>
        <button type="button" className="studio-ghost" onClick={enableWiredRelays}>
          启用所有已填密钥
        </button>
        <button type="button" className="studio-ghost" onClick={resetRelays}>
          恢复内置模板并全部启用
        </button>
        <p className="studio-hint">「恢复内置模板」会把隐藏的预置加回来，不会清掉你新增的自定义中转。密钥只存在本机。</p>
      </aside>
      <section className="wire-editor">
        {mode === "create" ? (
          <>
            <div className="acct-card-head">
              <div>
                <p className="studio-kicker">NEW PROVIDER</p>
                <h2>新增供应商</h2>
              </div>
              <button type="button" className="studio-ghost wire-back" onClick={() => setPane("list")}>
                返回列表
              </button>
              {current ? (
                <button type="button" className="studio-ghost" onClick={() => setMode("edit")}>
                  取消
                </button>
              ) : null}
            </div>
            <p className="studio-hint">选协议会自动填端点。名称和 Base URL 必填。模型可先空着，加入后点「自动读取模型」再勾选文本 / 图片 / 视频。</p>
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
              <input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://…" />
            </label>
            <label className="model-picker">
              API Key
              <input type="password" value={draft.apiKey} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder="可先空着，加入后再填" />
            </label>
            <label className="model-picker">
              模型（可选，逗号分隔；加入后也能自动读取）
              <input value={draft.models} onChange={(event) => setDraft({ ...draft, models: event.target.value })} />
            </label>
            <details className="wire-advanced">
              <summary>高级：自定义新接入的端点</summary>
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
            </details>
            {notice ? <p className="studio-ok">{notice}</p> : null}
            <button type="button" className="studio-primary" onClick={submitCreate}>
              加入接线表
            </button>
            <p className="studio-footnote">已装适配器：{listStudioAdapters().map((item) => item.label).join(" / ")}</p>
          </>
        ) : current ? (
          <>
            <div className="acct-card-head">
              <div>
                <p className="studio-kicker">{relayState(current).label}</p>
                <h2>{current.name}</h2>
              </div>
              <div className="result-actions">
                <button type="button" className="studio-ghost wire-back" onClick={() => setPane("list")}>
                  返回列表
                </button>
                <button type="button" className="studio-primary" onClick={openCreate}>
                  新增
                </button>
                <Link to="/account" className="studio-ghost">
                  回账户
                </Link>
              </div>
            </div>
            <p className="studio-hint">
              {isManagedRelayId(current.id) ? "内置模板。删除只是从本机列表隐藏。" : "这是你新增的自定义供应商，删除后不会自动回来。"}
              <br />
              {protocolById(current.protocol || current.adapterType || "").blurb}
              <br />
              文档：
              <a href={protocolById(current.protocol || current.adapterType || "").docs} target="_blank" rel="noreferrer">
                {protocolById(current.protocol || current.adapterType || "").docs}
              </a>
            </p>
            <label className="model-picker">
              名称
              <input value={current.name} onChange={(event) => setRelayFields(current.id, { name: event.target.value })} />
            </label>
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
            <label className="model-picker">
              Base URL
              <input
                value={current.baseUrl}
                onChange={(event) => setRelayFields(current.id, { baseUrl: event.target.value })}
                placeholder="https://…"
              />
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
              <input
                type={showKey ? "text" : "password"}
                value={current.apiKey || ""}
                onChange={(event) => setRelayKey(current.id, event.target.value)}
                autoComplete="off"
                placeholder="粘贴密钥，只保存在这台浏览器"
              />
            </label>
            <div className="result-actions">
              <button type="button" className="studio-ghost" onClick={() => setShowKey((value) => !value)}>
                {showKey ? "隐藏密钥" : "显示密钥"}
              </button>
              <button type="button" className="studio-ghost" onClick={() => setRelayEnabled(current.id, !current.enabled)}>
                {current.enabled ? "停用" : "启用"}
              </button>
              <button type="button" className="studio-primary" onClick={() => void test(current.id)}>
                测试连通
              </button>
              <button type="button" className="studio-danger" onClick={() => deleteRelay(current.id, current.name)}>
                删除此供应商
              </button>
            </div>
            {notice ? <p className="studio-ok">{notice}</p> : null}
            {tests[current.id] ? <p className={tests[current.id].startsWith("通过") ? "studio-ok" : "studio-hint"}>{tests[current.id]}</p> : <p className="studio-hint">填好 Key 后点测试。通过即可去生图 / 生视频使用。</p>}
            <RelayModelBoard relay={current} />
            <details className="wire-advanced">
              <summary>高级：改接口路径（一般不用动）</summary>
              <div className="param-block">
                <p className="studio-hint">默认来自协议模板。只有中转站路径特殊时才改。</p>
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
            </details>
          </>
        ) : (
          <div>
            <h2>还没有供应商</h2>
            <p className="studio-hint">点左边「新增供应商」接入自己的中转，或点「恢复内置模板」载入预置列表。</p>
            <button type="button" className="studio-primary" onClick={openCreate}>
              新增供应商
            </button>
          </div>
        )}
      </section>
    </div>
  );
  if (embedded) return desk;
  return <RequireAdmin>{desk}</RequireAdmin>;
}
