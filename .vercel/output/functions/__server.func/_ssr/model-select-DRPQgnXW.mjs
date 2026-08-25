import { a as catalogKey, i as catalogByKind, p as wiredCatalogByKind } from "./catalog-D989O0dv.mjs";
import { r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/model-select-DRPQgnXW.js
var import_jsx_runtime = require_jsx_runtime();
function CompactModelSelect({ kind, value, onChange }) {
	const groups = /* @__PURE__ */ new Map();
	for (const card of catalogByKind(kind)) {
		const list = groups.get(card.provider) || [];
		list.push(card);
		groups.set(card.provider, list);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "model-picker",
		children: [kind === "image" ? "生图模型" : kind === "video" ? "视频模型" : kind === "audio" ? "音频模型" : "文本模型", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
			value,
			onChange: (event) => onChange(event.target.value),
			children: [...groups.entries()].map(([provider, cards]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("optgroup", {
				label: provider,
				children: cards.map((card) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
					value: catalogKey(card),
					children: [
						card.model,
						card.nsfw ? " · NSFW" : "",
						card.wired ? "" : " · 待接线",
						" · ",
						card.tags[0] || card.size
					]
				}, catalogKey(card)))
			}, provider))
		})]
	});
}
function preferredVideoKey() {
	const videos = wiredCatalogByKind("video");
	const grok = videos.find((item) => item.model === "grok-imagine-video");
	return catalogKey(grok || videos[0]);
}
function preferredImageKey() {
	const images = wiredCatalogByKind("image");
	const seedream = images.find((item) => item.model === "doubao-seedream-5.0-lite");
	return catalogKey(seedream || images[0]);
}
//#endregion
export { preferredImageKey as n, preferredVideoKey as r, CompactModelSelect as t };
