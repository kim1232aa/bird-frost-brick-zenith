import { i as __toESM } from "../_runtime.mjs";
import { r as STUDIO_ROUTES } from "./catalog-D989O0dv.mjs";
import { n as require_react, r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { r as preferredVideoKey, t as CompactModelSelect } from "./model-select-DRPQgnXW.mjs";
import { r as useStudioSession } from "./session-DOM_npBX.mjs";
import { t as generateStudioImage } from "./image-y7lxNirW.mjs";
import { t as generateStudioText } from "./text-BXz9mbpP.mjs";
import { n as waitStudioVideo, t as createStudioVideo } from "./video-Bzh3-Yu8.mjs";
import { t as useStudioHistory } from "./history-CHYV9PLQ.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/story-m8ER6GeC.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function StoryDirectorPage() {
	const relays = useStudioSession((state) => state.relays);
	const addHistory = useStudioHistory((state) => state.add);
	const [idea, setIdea] = (0, import_react.useState)("雨夜码头，女警探追踪一枚会发光的铜铃，电影感写实，克制、潮湿、霓虹");
	const [logline, setLogline] = (0, import_react.useState)("");
	const [cast, setCast] = (0, import_react.useState)([]);
	const [shots, setShots] = (0, import_react.useState)([]);
	const [imageProvider, setImageProvider] = (0, import_react.useState)(`${STUDIO_ROUTES.image.providerId}::${STUDIO_ROUTES.image.model}`);
	const [videoProvider, setVideoProvider] = (0, import_react.useState)(preferredVideoKey());
	const [busy, setBusy] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)("");
	const [imageProviderId, imageModel] = imageProvider.split("::");
	const [videoProviderId, videoModel] = videoProvider.split("::");
	const plan = async () => {
		setBusy("分析故事…");
		setError("");
		try {
			const result = await generateStudioText({
				relays,
				json: true,
				system: "You are a film director. Return compact JSON only. No markdown.",
				prompt: `Break this story into a production board: ${idea}
JSON: {"logline":"zh","cast":[{"name":"zh","look":"english visual bible, face/wardrobe/age"}],"shots":[{"title":"zh","camera":"lens and move","prompt":"english photoreal cinematic still, include character names and wardrobe lock"}]}
5 shots max. Keep identity consistent.`
			});
			const parsed = JSON.parse(result.text.replace(/```json|```/g, "").trim());
			setLogline(parsed.logline || "");
			setCast((parsed.cast || []).slice(0, 6));
			setShots((parsed.shots || []).slice(0, 6));
			addHistory({
				kind: "story",
				title: idea.slice(0, 40),
				prompt: idea,
				model: result.model,
				urls: []
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "分析失败");
		} finally {
			setBusy("");
		}
	};
	const renderCharacter = async (index) => {
		const person = cast[index];
		if (!person) return;
		setBusy(`定妆 ${person.name}`);
		try {
			const result = await generateStudioImage({
				relays,
				providerId: imageProviderId,
				model: imageModel,
				prompt: `character bible portrait, locked identity, studio, ${person.look}, name ${person.name}`
			});
			setCast((current) => current.map((item, i) => i === index ? {
				...item,
				url: result.url
			} : item));
		} catch (err) {
			setError(err instanceof Error ? err.message : "定妆失败");
		} finally {
			setBusy("");
		}
	};
	const renderShot = async (index) => {
		const shot = shots[index];
		if (!shot) return;
		setBusy(`分镜 ${shot.title}`);
		try {
			const bible = cast.map((item) => `${item.name}: ${item.look}`).join("; ");
			const result = await generateStudioImage({
				relays,
				providerId: imageProviderId,
				model: imageModel,
				prompt: `${shot.prompt}. Camera: ${shot.camera || "35mm"}. Character lock: ${bible}`,
				imageUrl: cast.find((item) => item.url)?.url
			});
			setShots((current) => current.map((item, i) => i === index ? {
				...item,
				url: result.url
			} : item));
		} catch (err) {
			setError(err instanceof Error ? err.message : "出图失败");
		} finally {
			setBusy("");
		}
	};
	const renderVideo = async (index) => {
		const shot = shots[index];
		if (!shot) return;
		setBusy(`视频 ${shot.title}`);
		try {
			const created = await createStudioVideo({
				relays,
				prompt: `${shot.prompt}. Camera: ${shot.camera || "slow push in"}`,
				imageUrl: shot.url,
				duration: videoModel.includes("seedance") ? 5 : 6,
				providerId: videoProviderId,
				model: videoModel
			});
			const url = await waitStudioVideo({
				relays,
				providerId: created.providerId,
				taskId: created.id,
				model: created.model
			});
			setShots((current) => current.map((item, j) => j === index ? {
				...item,
				videoUrl: url
			} : item));
		} catch (err) {
			setError(err instanceof Error ? err.message : "视频失败");
		} finally {
			setBusy("");
		}
	};
	const afterPlanGenerate = async (people, board) => {
		for (let i = 0; i < people.length; i += 1) {
			setBusy(`定妆 ${people[i].name}`);
			try {
				const result = await generateStudioImage({
					relays,
					providerId: imageProviderId,
					model: imageModel,
					prompt: `character bible portrait, locked identity, studio, ${people[i].look}, name ${people[i].name}`
				});
				people[i] = {
					...people[i],
					url: result.url
				};
				setCast([...people]);
			} catch (err) {
				setError(err instanceof Error ? err.message : "定妆失败");
				return;
			}
		}
		const bible = people.map((item) => `${item.name}: ${item.look}`).join("; ");
		for (let i = 0; i < board.length; i += 1) {
			setBusy(`分镜 ${board[i].title}`);
			try {
				const result = await generateStudioImage({
					relays,
					providerId: imageProviderId,
					model: imageModel,
					prompt: `${board[i].prompt}. Camera: ${board[i].camera || "35mm"}. Character lock: ${bible}`,
					imageUrl: people.find((item) => item.url)?.url
				});
				board[i] = {
					...board[i],
					url: result.url
				};
				setShots([...board]);
			} catch (err) {
				setError(err instanceof Error ? err.message : "出图失败");
				return;
			}
		}
		setBusy("");
	};
	const oneClick = async () => {
		setBusy("分析故事…");
		setError("");
		try {
			const result = await generateStudioText({
				relays,
				json: true,
				system: "You are a film director. Return compact JSON only. No markdown.",
				prompt: `Break this story into a production board: ${idea}
JSON: {"logline":"zh","cast":[{"name":"zh","look":"english visual bible, face/wardrobe/age"}],"shots":[{"title":"zh","camera":"lens and move","prompt":"english photoreal cinematic still, include character names and wardrobe lock"}]}
4 shots max. Keep identity consistent.`
			});
			const parsed = JSON.parse(result.text.replace(/```json|```/g, "").trim());
			const people = (parsed.cast || []).slice(0, 4);
			const board = (parsed.shots || []).slice(0, 4);
			setLogline(parsed.logline || "");
			setCast(people);
			setShots(board);
			addHistory({
				kind: "story",
				title: idea.slice(0, 40),
				prompt: idea,
				model: result.model,
				urls: []
			});
			await afterPlanGenerate(people, board);
		} catch (err) {
			setError(err instanceof Error ? err.message : "流程失败");
			setBusy("");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "studio-split",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
			className: "studio-form",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-kicker",
					children: "STORY"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "故事导演" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-hint",
					children: "分析 → 角色定妆 → 分镜静帧 → 可选出视频。一键流程会把角色外貌写进每一镜。"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["故事", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					rows: 7,
					value: idea,
					onChange: (event) => setIdea(event.target.value)
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompactModelSelect, {
					kind: "image",
					value: imageProvider,
					onChange: setImageProvider
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompactModelSelect, {
					kind: "video",
					value: videoProvider,
					onChange: setVideoProvider
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "studio-primary",
					disabled: Boolean(busy),
					onClick: () => void plan(),
					children: busy || "分析并出分镜"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "studio-ghost",
					disabled: Boolean(busy),
					onClick: () => void oneClick(),
					children: "一键：分析 + 定妆 + 静帧"
				}),
				shots.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "studio-ghost",
					disabled: Boolean(busy),
					onClick: () => void (async () => {
						for (let i = 0; i < shots.length; i += 1) await renderShot(i);
					})(),
					children: "出全部静帧"
				}) : null,
				logline ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-logline",
					children: logline
				}) : null,
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-error",
					children: error
				}) : null
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "shot-board",
			children: [cast.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "cast-row",
				children: cast.map((person, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "cast-card",
					onClick: () => void renderCharacter(index),
					children: [person.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: person.url,
						alt: person.name
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "shot-empty",
						children: "定妆"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: person.name })]
				}, `${person.name}-${index}`))
			}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "shot-grid",
				style: { marginTop: 16 },
				children: shots.length ? shots.map((shot, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: "shot-card",
					children: [shot.videoUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
						src: shot.videoUrl,
						controls: true
					}) : shot.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: shot.url,
						alt: shot.title
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "shot-empty",
						children: ["镜头 ", index + 1]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "shot-body",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: shot.title }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [shot.camera ? `${shot.camera} · ` : "", shot.prompt] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "shot-actions",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void renderShot(index),
									children: shot.url ? "重拍静帧" : "出图"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => void renderVideo(index),
									children: "出视频"
								})]
							})
						]
					})]
				}, `${shot.title}-${index}`)) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "studio-placeholder",
					children: "分镜台空着。先分析故事，或用一键流程。"
				})
			})]
		})]
	});
}
var SplitComponent = StoryDirectorPage;
//#endregion
export { SplitComponent as component };
