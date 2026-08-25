import { i as __toESM } from "../_runtime.mjs";
import { n as STUDIO_PROVIDERS, t as STUDIO_CATALOG } from "./catalog-D989O0dv.mjs";
import { n as require_react, r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { n as listStudioAdapters, r as useStudioSession, t as adapterForProvider } from "./session-DOM_npBX.mjs";
import { i as useMembershipStore, n as planLabel, r as planLimits } from "./router-CvpcwDwX.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/settings-page-CjAQmf60.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function SettingsPage() {
	const plan = useMembershipStore((state) => state.plan);
	const remaining = useMembershipStore((state) => state.remaining);
	const upgrade = useMembershipStore((state) => state.upgrade);
	const limits = planLimits(plan);
	const relays = useStudioSession((state) => state.relays);
	const setRelayKey = useStudioSession((state) => state.setRelayKey);
	const setRelayEnabled = useStudioSession((state) => state.setRelayEnabled);
	const setRelayFields = useStudioSession((state) => state.setRelayFields);
	const addRelay = useStudioSession((state) => state.addRelay);
	const resetRelays = useStudioSession((state) => state.resetRelays);
	const [tests, setTests] = (0, import_react.useState)({});
	const [custom, setCustom] = (0, import_react.useState)({
		name: "我的中转",
		baseUrl: "https://api.example.com/v1",
		apiKey: "",
		adapterType: "openai-compat"
	});
	const test = async (id) => {
		const relay = relays.find((item) => item.id === id);
		if (!relay) return;
		setTests((current) => ({
			...current,
			[id]: "检测中…"
		}));
		const adapter = adapterForProvider(relay);
		try {
			const result = adapter.testConnection ? await adapter.testConnection({ provider: relay }) : {
				ok: Boolean(relay.apiKey),
				message: relay.apiKey ? "密钥已保存" : "缺少密钥"
			};
			setTests((current) => ({
				...current,
				[id]: `${result.ok ? "通过" : "失败"} · ${result.message}`
			}));
		} catch (err) {
			setTests((current) => ({
				...current,
				[id]: err instanceof Error ? err.message : "失败"
			}));
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "studio-library",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "studio-library-head",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "studio-kicker",
						children: "WIRING"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "接线与会员" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "studio-hint",
						children: "每个厂商独立适配器。加新 API 只需填一条中转，不必改生成页。"
					})
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "studio-ghost",
					onClick: resetRelays,
					children: "恢复默认密钥"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "studio-tool-grid",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "studio-tool-card",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "studio-tool-meta",
								children: planLabel(plan)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "本机额度" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
								"图 ",
								remaining("image"),
								" / ",
								limits.image,
								" · 视频 ",
								remaining("video"),
								" / ",
								limits.video,
								" · 文本 ",
								remaining("text"),
								" / ",
								limits.text
							] }),
							plan !== "pro" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "studio-primary",
								onClick: upgrade,
								children: "升到专业版额度"
							}) : null
						]
					}),
					relays.map((item) => {
						const blueprint = STUDIO_PROVIDERS.find((row) => row.id === item.id);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
							className: "studio-tool-card",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "studio-tool-meta",
									children: [
										item.adapterType || blueprint?.adapter,
										" · ",
										item.enabled && item.apiKey ? "启用" : "关闭"
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: item.name }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.baseUrl }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: blueprint?.remark || item.remark }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: [
									...item.imageModels || [],
									...item.videoModels || [],
									...item.textModels || [],
									...item.audioModels || []
								].join(" · ") || "无内置模型，可在检测后拉取" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "model-picker",
									children: ["API Key", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										type: "password",
										value: item.apiKey || "",
										onChange: (event) => setRelayKey(item.id, event.target.value),
										autoComplete: "off"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "model-picker",
									children: ["Base URL", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: item.baseUrl,
										onChange: (event) => setRelayFields(item.id, { baseUrl: event.target.value })
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "shot-actions",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "studio-ghost",
										onClick: () => setRelayEnabled(item.id, !item.enabled),
										children: item.enabled ? "关闭" : "启用"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "studio-ghost",
										onClick: () => void test(item.id),
										children: "检测接线"
									})]
								}),
								tests[item.id] ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "studio-hint",
									children: tests[item.id]
								}) : null
							]
						}, item.id);
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "studio-tool-card",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "studio-tool-meta",
								children: "扩展"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "添加自定义中转" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "model-picker",
								children: ["名称", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									value: custom.name,
									onChange: (event) => setCustom({
										...custom,
										name: event.target.value
									})
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "model-picker",
								children: ["适配器", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									value: custom.adapterType,
									onChange: (event) => setCustom({
										...custom,
										adapterType: event.target.value
									}),
									children: listStudioAdapters().map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: item.id,
										children: item.label
									}, item.id))
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "model-picker",
								children: ["Base URL", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									value: custom.baseUrl,
									onChange: (event) => setCustom({
										...custom,
										baseUrl: event.target.value
									})
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "model-picker",
								children: ["API Key", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "password",
									value: custom.apiKey,
									onChange: (event) => setCustom({
										...custom,
										apiKey: event.target.value
									})
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "studio-primary",
								onClick: () => {
									addRelay({
										name: custom.name,
										baseUrl: custom.baseUrl,
										apiKey: custom.apiKey,
										adapterType: custom.adapterType,
										enabled: Boolean(custom.apiKey)
									});
									setCustom({
										name: "我的中转",
										baseUrl: "https://api.example.com/v1",
										apiKey: "",
										adapterType: "openai-compat"
									});
								},
								children: "加入接线表"
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "studio-section-title",
				children: "模型目录"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "studio-tool-grid",
				children: STUDIO_CATALOG.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: item.kind === "video" ? `/video?model=${item.providerId}::${item.model}` : item.kind === "text" ? "/story" : item.kind === "audio" ? "/canvas" : `/image?model=${item.providerId}::${item.model}`,
					className: "studio-tool-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "studio-tool-meta",
							children: [
								item.provider,
								" · ",
								item.kind,
								item.nsfw ? " · mature" : "",
								item.wired ? " · 已接线" : " · 待接线"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: item.model }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.tags.join(" · ") }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.blurb })
					]
				}, `${item.providerId}-${item.model}`))
			})
		]
	});
}
//#endregion
export { SettingsPage as t };
