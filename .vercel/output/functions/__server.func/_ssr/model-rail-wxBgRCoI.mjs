import { a as catalogKey, i as catalogByKind } from "./catalog-D989O0dv.mjs";
import { r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/model-rail-wxBgRCoI.js
var import_jsx_runtime = require_jsx_runtime();
function ModelRail({ kind, value, onChange }) {
	const groups = /* @__PURE__ */ new Map();
	for (const card of catalogByKind(kind)) {
		const list = groups.get(card.provider) || [];
		list.push(card);
		groups.set(card.provider, list);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "model-rail",
		children: [...groups.entries()].map(([provider, cards]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "studio-kicker",
			children: [provider, cards.some((card) => card.wired) ? "" : " · 待接线"]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "model-rail-grid",
			children: cards.map((card) => {
				const key = catalogKey(card);
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: value === key ? "model-card is-on" : "model-card",
					onClick: () => onChange(key),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: card.model }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "model-card-tags",
							children: [
								card.nsfw ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "tag tag-nsfw",
									children: "NSFW"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "tag",
									children: "安全"
								}),
								card.wired ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "tag",
									children: "已接线"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "tag",
									children: "待接线"
								}),
								card.tags.slice(0, 2).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "tag",
									children: tag
								}, tag))
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
							card.cost,
							" · ",
							card.size
						] })
					]
				}, key);
			})
		})] }, provider))
	});
}
//#endregion
export { ModelRail as t };
