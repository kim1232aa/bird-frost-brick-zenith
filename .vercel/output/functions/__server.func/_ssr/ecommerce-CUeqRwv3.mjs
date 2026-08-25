import { i as __toESM } from "../_runtime.mjs";
import { r as STUDIO_ROUTES } from "./catalog-D989O0dv.mjs";
import { n as require_react, r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { t as CompactModelSelect } from "./model-select-DRPQgnXW.mjs";
import { r as useStudioSession } from "./session-DOM_npBX.mjs";
import { t as generateStudioImage } from "./image-y7lxNirW.mjs";
import { t as useStudioHistory } from "./history-CHYV9PLQ.mjs";
import { i as useMembershipStore } from "./router-CvpcwDwX.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ecommerce-CUeqRwv3.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var SHOTS = {
	hero: {
		id: "hero",
		label: "正面主图",
		prompt: "clean white-background catalog photo, camera level, product centered occupying about 85% of frame, no props, no text"
	},
	threeQuarter: {
		id: "threeQuarter",
		label: "3/4 主图",
		prompt: "premium 3/4 view showing volume and depth, same product, studio lighting, seamless white or very light gray"
	},
	left: {
		id: "left",
		label: "左侧面",
		prompt: "accurate left profile, keep structure and proportions, studio catalog lighting"
	},
	back: {
		id: "back",
		label: "背面图",
		prompt: "level rear view of the same product, white background, commercial catalog"
	},
	detail: {
		id: "detail",
		label: "细节特写",
		prompt: "close-up of the most important material, craft or function detail, sharp, commercial"
	},
	lifestyle: {
		id: "lifestyle",
		label: "使用场景",
		prompt: "place the same product in a realistic, conversion-oriented usage scene, keep product identity"
	},
	feature: {
		id: "feature",
		label: "功能演示",
		prompt: "demonstrate the key function of the product clearly, still photoreal, ecommerce"
	},
	scale: {
		id: "scale",
		label: "尺寸感",
		prompt: "show scale of the product with a subtle real-world cue, keep catalog quality"
	},
	pack: {
		id: "pack",
		label: "包装组合",
		prompt: "product with packaging, gift-ready ecommerce still life, clean and premium"
	}
};
var ECOMMERCE_PACKS = [
	{
		id: "amazon",
		label: "Amazon 套图",
		shots: [
			SHOTS.hero,
			SHOTS.threeQuarter,
			SHOTS.left,
			SHOTS.back,
			SHOTS.detail,
			SHOTS.lifestyle
		]
	},
	{
		id: "tmall",
		label: "天猫套图",
		shots: [
			SHOTS.hero,
			SHOTS.feature,
			SHOTS.detail,
			SHOTS.scale,
			SHOTS.lifestyle,
			SHOTS.pack
		]
	},
	{
		id: "temu",
		label: "Temu / Shopee",
		shots: [
			SHOTS.hero,
			SHOTS.threeQuarter,
			SHOTS.detail,
			SHOTS.scale,
			SHOTS.lifestyle,
			SHOTS.pack
		]
	},
	{
		id: "tiktok",
		label: "TikTok Shop",
		shots: [
			SHOTS.hero,
			SHOTS.lifestyle,
			SHOTS.feature,
			SHOTS.scale,
			SHOTS.detail,
			SHOTS.pack
		]
	},
	{
		id: "walmart",
		label: "Walmart 套图",
		shots: [
			SHOTS.hero,
			SHOTS.threeQuarter,
			SHOTS.left,
			SHOTS.detail,
			SHOTS.scale,
			SHOTS.lifestyle
		]
	},
	{
		id: "ozon",
		label: "Ozon 套图",
		shots: [
			SHOTS.hero,
			SHOTS.threeQuarter,
			SHOTS.feature,
			SHOTS.detail,
			SHOTS.scale,
			SHOTS.lifestyle
		]
	},
	{
		id: "basic4",
		label: "基础 4 视图",
		shots: [
			SHOTS.hero,
			SHOTS.threeQuarter,
			SHOTS.left,
			SHOTS.back
		]
	},
	{
		id: "full9",
		label: "完整 9 图",
		shots: [
			SHOTS.hero,
			SHOTS.threeQuarter,
			SHOTS.left,
			SHOTS.back,
			SHOTS.detail,
			SHOTS.scale,
			SHOTS.lifestyle,
			SHOTS.feature,
			SHOTS.pack
		]
	}
];
function composeEcommercePrompt(product, shot) {
	return `Ecommerce product photography of ${product.trim() || "the uploaded product"}. ${shot.prompt}. Photoreal, no watermark, no extra logos.`;
}
function EcommerceSuitePage() {
	const relays = useStudioSession((state) => state.relays);
	const addHistory = useStudioHistory((state) => state.add);
	const record = useMembershipStore((state) => state.record);
	const [packId, setPackId] = (0, import_react.useState)("amazon");
	const [product, setProduct] = (0, import_react.useState)("matte ceramic coffee mug");
	const [reference, setReference] = (0, import_react.useState)("");
	const [mode, setMode] = (0, import_react.useState)("single");
	const [selection, setSelection] = (0, import_react.useState)(`${STUDIO_ROUTES.image.providerId}::${STUDIO_ROUTES.image.model}`);
	const pack = (0, import_react.useMemo)(() => ECOMMERCE_PACKS.find((item) => item.id === packId) || ECOMMERCE_PACKS[0], [packId]);
	const [shots, setShots] = (0, import_react.useState)({});
	const patch = (id, next) => setShots((current) => {
		const prev = current[id] ?? {
			status: "idle",
			note: "",
			error: ""
		};
		return {
			...current,
			[id]: {
				...prev,
				...next
			}
		};
	});
	const generateOne = async (shotId) => {
		const shot = pack.shots.find((item) => item.id === shotId);
		if (!shot) return;
		patch(shot.id, {
			status: "running",
			error: ""
		});
		try {
			const extra = shots[shot.id]?.note || "";
			const [providerId, model] = selection.split("::");
			const result = await generateStudioImage({
				relays,
				prompt: `${composeEcommercePrompt(product, shot)}${extra ? ` Extra direction: ${extra}` : ""}`,
				imageUrl: reference || void 0,
				providerId,
				model,
				size: selection.includes("volcengine") ? "2K" : void 0
			});
			patch(shot.id, {
				status: "done",
				url: result.url
			});
			record("image");
			addHistory({
				kind: "ecommerce",
				title: `${pack.label} · ${shot.label}`,
				prompt: product,
				model: result.model,
				urls: [result.url]
			});
		} catch (err) {
			patch(shot.id, {
				status: "error",
				error: err instanceof Error ? err.message : "失败"
			});
		}
	};
	const generatePack = async () => {
		if (mode === "batch") {
			for (const shot of pack.shots) await generateOne(shot.id);
			return;
		}
		await generateOne(pack.shots[0].id);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "studio-split ecommerce",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
			className: "studio-form",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "电商套图" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-hint",
					children: "上传描述或参考后选平台方案。每张镜头可单独重拍，不必整套重来。"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["① 产品", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					rows: 4,
					value: product,
					onChange: (event) => setProduct(event.target.value),
					placeholder: "描述产品"
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["参考图（可选）", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
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
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompactModelSelect, {
					kind: "image",
					value: selection,
					onChange: setSelection
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["② 平台方案", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
					value: packId,
					onChange: (event) => setPackId(event.target.value),
					children: ECOMMERCE_PACKS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
						value: item.id,
						children: [
							item.label,
							" · ",
							item.shots.length,
							" 张"
						]
					}, item.id))
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "studio-seg",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: mode === "batch" ? "is-active" : void 0,
						onClick: () => setMode("batch"),
						children: "连续套图"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: mode === "single" ? "is-active" : void 0,
						onClick: () => setMode("single"),
						children: "独立高清"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "studio-primary",
					onClick: () => void generatePack(),
					children: mode === "batch" ? `生成整套 ${pack.shots.length}` : "生成当前镜头"
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "shot-board",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "分镜台" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [pack.shots.length, " 个镜头"] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "shot-grid",
				children: pack.shots.map((shot, index) => {
					const state = shots[shot.id] || {
						status: "idle",
						note: ""
					};
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "shot-card",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "shot-index",
								children: index + 1
							}),
							state.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: state.url,
								alt: shot.label
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "shot-empty",
								children: state.status === "running" ? "生成中" : "待生成"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "shot-body",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: shot.label }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: shot.prompt }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: state.note,
										placeholder: "补充要求",
										onChange: (event) => patch(shot.id, { note: event.target.value })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "shot-actions",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											onClick: () => void generateOne(shot.id),
											children: state.url ? "重拍" : "生成"
										}), state.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
											href: state.url,
											download: `${shot.label}.jpg`,
											target: "_blank",
											rel: "noreferrer",
											children: "下载"
										}) : null]
									}),
									state.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "studio-error",
										children: state.error
									}) : null
								]
							})
						]
					}, shot.id);
				})
			})]
		})]
	});
}
var SplitComponent = EcommerceSuitePage;
//#endregion
export { SplitComponent as component };
