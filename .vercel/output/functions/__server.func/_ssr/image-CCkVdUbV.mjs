import { i as __toESM } from "../_runtime.mjs";
import { c as findCatalog, r as STUDIO_ROUTES } from "./catalog-D989O0dv.mjs";
import { n as require_react, r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { r as useStudioSession } from "./session-DOM_npBX.mjs";
import { t as generateStudioImage } from "./image-y7lxNirW.mjs";
import { t as useStudioHistory } from "./history-CHYV9PLQ.mjs";
import { i as useMembershipStore } from "./router-CvpcwDwX.mjs";
import { t as GALLERY_SEED } from "./gallery-seed-CGm2Cxxu.mjs";
import { t as ModelRail } from "./model-rail-wxBgRCoI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/image-CCkVdUbV.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function queryModel() {
	if (typeof window === "undefined") return "";
	return new URLSearchParams(window.location.search).get("model") || "";
}
function ImageStudioPage() {
	const relays = useStudioSession((state) => state.relays);
	const items = useStudioHistory((state) => state.items);
	const addHistory = useStudioHistory((state) => state.add);
	const record = useMembershipStore((state) => state.record);
	const [prompt, setPrompt] = (0, import_react.useState)("studio product photo of a matte ceramic mug on seamless white, catalog lighting");
	const [negative, setNegative] = (0, import_react.useState)("");
	const [selection, setSelection] = (0, import_react.useState)(`${STUDIO_ROUTES.image.providerId}::${STUDIO_ROUTES.image.model}`);
	(0, import_react.useEffect)(() => {
		const next = queryModel();
		if (next) setSelection(next);
	}, []);
	const [size, setSize] = (0, import_react.useState)("2K");
	const [width, setWidth] = (0, import_react.useState)(1024);
	const [height, setHeight] = (0, import_react.useState)(1024);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const [url, setUrl] = (0, import_react.useState)("");
	const [seed, setSeed] = (0, import_react.useState)("");
	const [reference, setReference] = (0, import_react.useState)("");
	const card = findCatalog(selection);
	const isArk = selection.includes("volcengine");
	const isCivitai = selection.includes("civitai");
	const recent = (0, import_react.useMemo)(() => [...items.filter((item) => item.kind === "image"), ...GALLERY_SEED.filter((item) => item.kind === "image")].slice(0, 10), [items]);
	const generate = async () => {
		const [providerId, ...rest] = selection.split("::");
		const model = rest.join("::");
		setBusy(true);
		setError("");
		try {
			const result = await generateStudioImage({
				relays,
				prompt,
				providerId,
				model,
				size: isArk ? size : void 0,
				width: isCivitai ? width : void 0,
				height: isCivitai ? height : void 0,
				seed: isCivitai && seed ? Number(seed) : void 0,
				imageUrl: reference || void 0,
				negativePrompt: negative || void 0
			});
			setUrl(result.url);
			record("image");
			addHistory({
				kind: "image",
				title: prompt.slice(0, 40),
				prompt,
				model: result.model,
				urls: [result.url]
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "生图失败");
		} finally {
			setBusy(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "ws",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
			className: "ws-side",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-kicker",
					children: "IMAGE"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "生图" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-hint",
					children: card ? `${card.provider} · ${card.blurb}` : "从下面点一个模型。所有已接线厂商都会出现。"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelRail, {
					kind: "image",
					value: selection,
					onChange: setSelection
				}),
				isArk ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["分辨率", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
					value: size,
					onChange: (event) => setSize(event.target.value),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: "2K",
						children: "2K"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: "3K",
						children: "3K"
					})]
				})] }) : null,
				isCivitai ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "ws-row",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["宽", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "number",
						value: width,
						onChange: (event) => setWidth(Number(event.target.value) || 1024)
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["高", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "number",
						value: height,
						onChange: (event) => setHeight(Number(event.target.value) || 1024)
					})] })]
				}) : null,
				isCivitai ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Seed（可选，官方 metadata 可复现）", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: seed,
					onChange: (event) => setSeed(event.target.value),
					placeholder: "例如 237346588034641"
				})] }) : null,
				isCivitai ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["负向提示词", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: negative,
					onChange: (event) => setNegative(event.target.value),
					placeholder: "可选"
				})] }) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "chip-row",
					children: [
						"studio product photo of a matte ceramic mug on seamless white",
						"cinematic portrait, rainy neon dock, photoreal",
						"a photograph of a woman, solo, sitting on tatami, warm sunlight, natural skin texture"
					].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setPrompt(item),
						children: [item.slice(0, 18), "…"]
					}, item))
				}),
				card ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "spec-box",
					children: [
						card.nsfw ? "NSFW / mature" : "安全档",
						" · ",
						card.cost,
						" · ",
						card.size,
						" · ",
						card.wired ? "已接线" : "待接线",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
						card.docs
					]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["参考图（图生图，可选）", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "file",
					accept: "image/*",
					onChange: (event) => {
						const file = event.target.files?.[0];
						if (!file) return;
						const reader = new FileReader();
						reader.onload = () => setReference(String(reader.result || ""));
						reader.readAsDataURL(file);
					}
				})] }),
				reference ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: reference,
					alt: "",
					className: "ref-thumb"
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["提示词", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					rows: 7,
					value: prompt,
					onChange: (event) => setPrompt(event.target.value)
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "studio-primary",
					disabled: busy || !prompt.trim(),
					onClick: () => void generate(),
					children: busy ? "生成中…" : `用 ${card?.model || "当前模型"} 生成`
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-error",
					children: error
				}) : null
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "ws-main",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "ws-result",
				children: url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: url,
					alt: prompt
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "studio-placeholder",
					children: "选模型，写提示词，结果出在这里。最近样张在下面。"
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "ws-thumbs",
				children: recent.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "ws-thumb",
					onClick: () => item.urls[0] && setUrl(item.urls[0]),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: item.urls[0],
						alt: item.title
					})
				}, item.id))
			})]
		})]
	});
}
var SplitComponent = ImageStudioPage;
//#endregion
export { SplitComponent as component };
