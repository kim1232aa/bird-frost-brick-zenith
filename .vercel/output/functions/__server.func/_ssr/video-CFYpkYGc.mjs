import { i as __toESM } from "../_runtime.mjs";
import { c as findCatalog } from "./catalog-D989O0dv.mjs";
import { n as require_react, r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { r as preferredVideoKey } from "./model-select-DRPQgnXW.mjs";
import { r as useStudioSession } from "./session-DOM_npBX.mjs";
import { n as waitStudioVideo, t as createStudioVideo } from "./video-Bzh3-Yu8.mjs";
import { t as useStudioHistory } from "./history-CHYV9PLQ.mjs";
import { i as useMembershipStore } from "./router-CvpcwDwX.mjs";
import { t as ModelRail } from "./model-rail-wxBgRCoI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/video-CFYpkYGc.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function queryModel() {
	if (typeof window === "undefined") return "";
	return new URLSearchParams(window.location.search).get("model") || "";
}
function VideoStudioPage() {
	const relays = useStudioSession((state) => state.relays);
	const addHistory = useStudioHistory((state) => state.add);
	const record = useMembershipStore((state) => state.record);
	const [selection, setSelection] = (0, import_react.useState)(preferredVideoKey());
	(0, import_react.useEffect)(() => {
		const next = queryModel();
		if (next) setSelection(next);
	}, []);
	const [prompt, setPrompt] = (0, import_react.useState)("a ceramic mug rotating slowly on a white studio turntable, cinematic lighting");
	const [duration, setDuration] = (0, import_react.useState)(6);
	const [ratio, setRatio] = (0, import_react.useState)("16:9");
	const [reference, setReference] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	const [url, setUrl] = (0, import_react.useState)("");
	const [status, setStatus] = (0, import_react.useState)("");
	const card = findCatalog(selection);
	const isArk = selection.includes("volcengine") || /seedance/i.test(selection);
	const generate = async () => {
		const [providerId, ...rest] = selection.split("::");
		const model = rest.join("::");
		setBusy(true);
		setError("");
		setStatus("提交任务…");
		try {
			const created = await createStudioVideo({
				relays,
				prompt,
				duration,
				aspectRatio: ratio,
				providerId,
				model,
				imageUrl: reference || void 0,
				generateAudio: isArk
			});
			const videoUrl = await waitStudioVideo({
				relays,
				providerId: created.providerId,
				taskId: created.id,
				model: created.model,
				onTick: (n) => setStatus(`轮询 ${n}…`)
			});
			setUrl(videoUrl);
			record("video");
			addHistory({
				kind: "video",
				title: prompt.slice(0, 40),
				prompt,
				model: created.model,
				urls: [videoUrl]
			});
			setStatus("完成");
		} catch (err) {
			const message = err instanceof Error ? err.message : "视频生成失败";
			setError(message.includes("eligible") ? "Grok 视频额度暂时用尽。这条接线之前已经出过片。" : message);
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
					children: "VIDEO"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "生视频" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-hint",
					children: "Grok Imagine 已实测出片。火山 Seedance 走官方 Agent Plan 任务接口，Small 档会提示未开通。Civitai LTX / Hunyuan 也可选。"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelRail, {
					kind: "video",
					value: selection,
					onChange: setSelection
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "ws-row",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["时长", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						value: duration,
						onChange: (event) => setDuration(Number(event.target.value)),
						children: [
							5,
							6,
							8,
							10
						].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
							value: item,
							children: [item, "s"]
						}, item))
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["画幅", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						value: ratio,
						onChange: (event) => setRatio(event.target.value),
						children: [
							"16:9",
							"9:16",
							"1:1",
							"adaptive"
						].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: item,
							children: item
						}, item))
					})] })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["首帧（可选，图生视频）", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
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
					children: busy ? status || "生成中…" : `用 ${card?.model || "当前模型"} 生成`
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-error",
					children: error
				}) : null,
				card ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-footnote",
					children: card.blurb
				}) : null
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
			className: "ws-main",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "ws-result",
				children: url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
					src: url,
					controls: true,
					autoPlay: true,
					loop: true
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "studio-placeholder",
					children: status || "视频出在这里"
				})
			})
		})]
	});
}
var SplitComponent = VideoStudioPage;
//#endregion
export { SplitComponent as component };
