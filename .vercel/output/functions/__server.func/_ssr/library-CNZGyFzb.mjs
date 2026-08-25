import { r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { t as useStudioHistory } from "./history-CHYV9PLQ.mjs";
import { t as GALLERY_SEED } from "./gallery-seed-CGm2Cxxu.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/library-CNZGyFzb.js
var import_jsx_runtime = require_jsx_runtime();
function LibraryPage() {
	const local = useStudioHistory((state) => state.items);
	const remove = useStudioHistory((state) => state.remove);
	const clear = useStudioHistory((state) => state.clear);
	const items = [...local, ...GALLERY_SEED.filter((seed) => !local.some((item) => item.urls[0] === seed.urls[0]))];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "studio-library",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "studio-library-head",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "创作记录" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "studio-lead",
				children: "上面是你在这个浏览器里生成的；下面样张是已实测通的出片，不是空壳。"
			})] }), local.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "studio-ghost",
				onClick: clear,
				children: "清空本机记录"
			}) : null]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "library-grid",
			children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
				className: "library-card",
				children: [item.urls[0] ? item.kind === "video" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
					src: item.urls[0],
					controls: true,
					muted: true
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: item.urls[0],
					alt: item.title
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "shot-empty",
					children: item.kind
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: item.title }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: item.model }),
					item.createdAt ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => remove(item.id),
						children: "删除"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "实测样张" })
				] })]
			}, item.id))
		})]
	});
}
var SplitComponent = LibraryPage;
//#endregion
export { SplitComponent as component };
