import { n as STUDIO_PROVIDERS, t as STUDIO_CATALOG } from "./catalog-D989O0dv.mjs";
import { r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { a as STUDIO_NAV } from "./router-CvpcwDwX.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-BuKSi8GD.js
var import_jsx_runtime = require_jsx_runtime();
var TOOLS = [
	{
		href: "/image",
		title: "生图工作室",
		copy: "火山 / Grok / GPT Image / Civitai mature，模型按厂商铺开可选。",
		model: "image"
	},
	{
		href: "/video",
		title: "生视频",
		copy: "Grok Imagine、Seedance Agent Plan、Civitai LTX。可上传首帧。",
		model: "video"
	},
	{
		href: "/ecommerce",
		title: "电商套图",
		copy: "产品描述或参考图，按平台一次出分镜。",
		model: "套图"
	},
	{
		href: "/story",
		title: "故事导演",
		copy: "分析、定妆、分镜、出视频。一键流程可用。",
		model: "story"
	},
	{
		href: "/canvas",
		title: "无限画布",
		copy: "节点工作流：文本、角色、Seedance、故事导演、音频。",
		model: "xyflow"
	},
	{
		href: "/settings",
		title: "接线与会员",
		copy: "原版厂商槽位全部保留，可检测、可加自定义中转。",
		model: "wiring"
	}
];
function DashboardPage() {
	const wired = STUDIO_PROVIDERS.filter((item) => item.enabled && item.apiKey);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "studio-dash",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "studio-hero",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "studio-kicker",
						children: "STUDIO"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "出图、出视频、出分镜，按厂商官方字段接线" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "studio-lead",
						children: [
							"已启用 ",
							wired.length,
							" 条中转，目录 ",
							STUDIO_CATALOG.length,
							" 个模型。Civitai mature、Grok Imagine、火山 Agent Plan 可直接生成。阿里云 / Agnes / Fal / 日日新保留原版槽位，填密钥即用。"
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "studio-tool-grid",
				children: TOOLS.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: tool.href,
					className: "studio-tool-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "studio-tool-meta",
							children: tool.model
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: tool.title }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: tool.copy })
					]
				}, tool.href))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "studio-section-title",
				children: "已接线模型"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "studio-tool-grid",
				children: STUDIO_CATALOG.filter((item) => item.wired).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: item.kind === "video" ? `/video?model=${item.providerId}::${item.model}` : item.kind === "text" ? "/story" : `/image?model=${item.providerId}::${item.model}`,
					className: "studio-tool-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "studio-tool-meta",
							children: [
								item.provider,
								item.nsfw ? " · NSFW" : "",
								" · ",
								item.cost
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: item.model }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.blurb }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.tags.join(" · ") })
					]
				}, `${item.providerId}-${item.model}`))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "studio-section-title",
				children: "待接线（原版槽位，填密钥即出现在生成页）"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "studio-tool-grid",
				children: STUDIO_CATALOG.filter((item) => !item.wired).slice(0, 12).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: "/settings",
					className: "studio-tool-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "studio-tool-meta",
							children: [item.provider, " · 待接线"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: item.model }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.blurb })
					]
				}, `${item.providerId}-${item.model}`))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "studio-footnote",
				children: STUDIO_NAV.map((item) => item.label).join(" / ")
			})
		]
	});
}
var SplitComponent = DashboardPage;
//#endregion
export { SplitComponent as component };
