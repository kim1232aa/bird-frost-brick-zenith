import { i as __toESM } from "../_runtime.mjs";
import { a as catalogKey, i as catalogByKind, n as STUDIO_PROVIDERS, r as STUDIO_ROUTES, u as providerById } from "./catalog-D989O0dv.mjs";
import { n as require_react, r as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { n as preferredImageKey, r as preferredVideoKey } from "./model-select-DRPQgnXW.mjs";
import { r as useStudioSession, t as adapterForProvider } from "./session-DOM_npBX.mjs";
import { t as generateStudioImage } from "./image-y7lxNirW.mjs";
import { t as generateStudioText } from "./text-BXz9mbpP.mjs";
import { n as waitStudioVideo, t as createStudioVideo } from "./video-Bzh3-Yu8.mjs";
import { t as useStudioHistory } from "./history-CHYV9PLQ.mjs";
import { a as Type, c as Save, d as Music2, f as Image, i as Upload, l as Plus, m as Clapperboard, n as Video, p as FolderOpen, r as UserRound, s as Trash2, t as WandSparkles, u as Play } from "../_libs/lucide-react.mjs";
import { a as ReactFlowProvider, c as useEdgesState, d as Position, i as MiniMap, l as useNodesState, n as Controls, o as addEdge, r as Handle, s as index, t as Background, u as useReactFlow } from "../_libs/@xyflow/react+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/flow-canvas-page-9cdw7PsB.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
async function generateStudioAudio(input) {
	const prompt = input.prompt.trim();
	if (!prompt) throw new Error("请填写旁白/台词");
	const providerId = input.providerId || STUDIO_ROUTES.audio.providerId;
	const model = input.model || STUDIO_ROUTES.audio.model;
	const provider = providerById(providerId, input.relays);
	const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
	const adapter = adapterForProvider({
		adapterType: blueprint?.adapter || provider.adapterType,
		baseUrl: provider.baseUrl
	}, model);
	if (!adapter.generateAudio) throw new Error(`${adapter.label} 不支持音频。到接线页填阿里云 Token Plan 或 OpenAI 兼容 TTS。`);
	return {
		url: (await adapter.generateAudio({ provider }, {
			model,
			prompt,
			voice: input.voice
		})).url,
		model,
		providerId
	};
}
var IMAGE_MODELS = catalogByKind("image");
var VIDEO_MODELS = catalogByKind("video");
var AUDIO_MODELS = catalogByKind("audio");
var TEXT_MODELS = catalogByKind("text");
var DEFAULT_IMAGE = preferredImageKey();
var DEFAULT_VIDEO = preferredVideoKey();
var DEFAULT_TEXT = TEXT_MODELS[0] ? catalogKey(TEXT_MODELS[0]) : "";
var DEFAULT_AUDIO = AUDIO_MODELS[0] ? catalogKey(AUDIO_MODELS[0]) : "";
var GRAPH_KEY = "boundless-studio:canvas-graph";
function splitModel(value) {
	const [providerId, ...rest] = value.split("::");
	return {
		providerId,
		model: rest.join("::")
	};
}
function ModelSelect({ value, kind, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
		value,
		onChange: (event) => onChange(event.target.value),
		children: (kind === "video" ? VIDEO_MODELS : kind === "text" ? TEXT_MODELS : kind === "audio" ? AUDIO_MODELS : IMAGE_MODELS).map((card) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
			value: catalogKey(card),
			children: [
				card.provider,
				" · ",
				card.model,
				card.nsfw ? " · NSFW" : "",
				card.wired ? "" : " · 待接线"
			]
		}, catalogKey(card)))
	});
}
function PromptNode({ id, data }) {
	const { updateNodeData } = useReactFlow();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-node",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "文本" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				rows: 4,
				value: data.text || "",
				onChange: (event) => updateNodeData(id, { text: event.target.value })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "source",
				position: Position.Right,
				id: "out"
			})
		]
	});
}
function ImageNode({ id, data }) {
	const { updateNodeData } = useReactFlow();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-node",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Left,
				id: "in"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Top,
				id: "ref"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "生图" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelSelect, {
				value: data.model || DEFAULT_IMAGE,
				kind: "image",
				onChange: (model) => updateNodeData(id, { model })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				rows: 3,
				value: data.prompt || "",
				onChange: (event) => updateNodeData(id, { prompt: event.target.value }),
				placeholder: "提示词，可接左边文本 / 上边角色"
			}),
			data.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: data.url,
				alt: ""
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: data.status || "未运行" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "source",
				position: Position.Right,
				id: "out"
			})
		]
	});
}
function VideoNode({ id, data }) {
	const { updateNodeData } = useReactFlow();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-node",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Left,
				id: "in"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "生视频" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelSelect, {
				value: data.model || DEFAULT_VIDEO,
				kind: "video",
				onChange: (model) => updateNodeData(id, { model })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				rows: 3,
				value: data.prompt || "",
				onChange: (event) => updateNodeData(id, { prompt: event.target.value })
			}),
			data.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
				src: data.url,
				muted: true,
				controls: true
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: data.status || "未运行" })
		]
	});
}
function SeedanceNode({ id, data }) {
	const { updateNodeData } = useReactFlow();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-node",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Left,
				id: "in"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Top,
				id: "frame"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Seedance 工作流" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelSelect, {
				value: data.model || DEFAULT_VIDEO,
				kind: "video",
				onChange: (model) => updateNodeData(id, { model })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["时长", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
				value: String(data.duration || 5),
				onChange: (event) => updateNodeData(id, { duration: Number(event.target.value) }),
				children: [
					4,
					5,
					8,
					10
				].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
					value: item,
					children: [item, "s"]
				}, item))
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["画幅", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
				value: data.ratio || "16:9",
				onChange: (event) => updateNodeData(id, { ratio: event.target.value }),
				children: [
					"16:9",
					"9:16",
					"1:1",
					"adaptive"
				].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
					value: item,
					children: item
				}, item))
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				rows: 3,
				value: data.prompt || "",
				onChange: (event) => updateNodeData(id, { prompt: event.target.value }),
				placeholder: "镜头运动 / 对白"
			}),
			data.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
				src: data.url,
				muted: true,
				controls: true
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: data.status || "接首帧或文本" })
		]
	});
}
function CharacterNode({ id, data }) {
	const { updateNodeData } = useReactFlow();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-node",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "角色定妆" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				value: data.name || "",
				placeholder: "名字",
				onChange: (event) => updateNodeData(id, { name: event.target.value })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				rows: 3,
				value: data.look || "",
				placeholder: "外形 / 服装锁定",
				onChange: (event) => updateNodeData(id, { look: event.target.value })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelSelect, {
				value: data.model || DEFAULT_IMAGE,
				kind: "image",
				onChange: (model) => updateNodeData(id, { model })
			}),
			data.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: data.url,
				alt: ""
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: data.status || "定妆后接到生图" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "source",
				position: Position.Right,
				id: "out"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "source",
				position: Position.Bottom,
				id: "look"
			})
		]
	});
}
function UpscaleNode({ id, data }) {
	const { updateNodeData } = useReactFlow();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-node",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Left,
				id: "in"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "放大" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelSelect, {
				value: data.model || DEFAULT_IMAGE,
				kind: "image",
				onChange: (model) => updateNodeData(id, { model })
			}),
			data.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: data.url,
				alt: ""
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: data.status || "接一张图进来" })
		]
	});
}
function StoryNode({ id, data }) {
	const { updateNodeData } = useReactFlow();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-node flow-node-wide",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "故事导演" }),
			TEXT_MODELS.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelSelect, {
				value: data.model || DEFAULT_TEXT,
				kind: "text",
				onChange: (model) => updateNodeData(id, { model })
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				rows: 5,
				value: data.text || "",
				onChange: (event) => updateNodeData(id, { text: event.target.value }),
				placeholder: "写下故事。运行工作流会分析分镜并生成角色/镜头节点。"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: data.status || "未分析" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "source",
				position: Position.Right,
				id: "out"
			})
		]
	});
}
function AudioNode({ id, data }) {
	const { updateNodeData } = useReactFlow();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-node",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Left,
				id: "in"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "音频" }),
			AUDIO_MODELS.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelSelect, {
				value: data.model || DEFAULT_AUDIO,
				kind: "audio",
				onChange: (model) => updateNodeData(id, { model })
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "接线页填阿里云 Token Plan 后可用" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				rows: 3,
				value: data.prompt || "",
				onChange: (event) => updateNodeData(id, { prompt: event.target.value })
			}),
			data.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", {
				src: data.url,
				controls: true
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: data.status || "未运行" })
		]
	});
}
function UploadNode({ id, data }) {
	const { updateNodeData } = useReactFlow();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-node",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "素材" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				type: "file",
				accept: "image/*",
				onChange: (event) => {
					const file = event.target.files?.[0];
					if (!file) return;
					const reader = new FileReader();
					reader.onload = () => updateNodeData(id, {
						url: String(reader.result || ""),
						status: "已上传"
					});
					reader.readAsDataURL(file);
				}
			}),
			data.url ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: data.url,
				alt: ""
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "上传参考图" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "source",
				position: Position.Right,
				id: "out"
			})
		]
	});
}
var nodeTypes = {
	prompt: PromptNode,
	image: ImageNode,
	video: VideoNode,
	character: CharacterNode,
	upscale: UpscaleNode,
	story: StoryNode,
	audio: AudioNode,
	upload: UploadNode,
	seedance: SeedanceNode
};
function topoOrder(nodes, edges) {
	const indeg = new Map(nodes.map((item) => [item.id, 0]));
	const adj = new Map(nodes.map((item) => [item.id, []]));
	for (const edge of edges) {
		adj.get(edge.source)?.push(edge.target);
		indeg.set(edge.target, (indeg.get(edge.target) || 0) + 1);
	}
	const queue = nodes.filter((item) => !indeg.get(item.id)).map((item) => item.id);
	const order = [];
	while (queue.length) {
		const id = queue.shift();
		order.push(id);
		for (const next of adj.get(id) || []) {
			const value = (indeg.get(next) || 1) - 1;
			indeg.set(next, value);
			if (value === 0) queue.push(next);
		}
	}
	for (const node of nodes) if (!order.includes(node.id)) order.push(node.id);
	return order;
}
function loadGraph() {
	try {
		const raw = localStorage.getItem(GRAPH_KEY);
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
function CanvasInner() {
	const relays = useStudioSession((state) => state.relays);
	const addHistory = useStudioHistory((state) => state.add);
	const saved = typeof window !== "undefined" ? loadGraph() : null;
	const [nodes, setNodes, onNodesChange] = useNodesState(saved?.nodes?.length ? saved.nodes : [{
		id: "prompt-1",
		type: "prompt",
		position: {
			x: 40,
			y: 120
		},
		data: {
			kind: "prompt",
			text: "rainy neon dock, cinematic still, photoreal"
		}
	}, {
		id: "image-1",
		type: "image",
		position: {
			x: 360,
			y: 80
		},
		data: {
			kind: "image",
			prompt: "",
			model: DEFAULT_IMAGE
		}
	}]);
	const [edges, setEdges, onEdgesChange] = useEdgesState(saved?.edges?.length ? saved.edges : [{
		id: "e1",
		source: "prompt-1",
		target: "image-1",
		sourceHandle: "out",
		targetHandle: "in",
		animated: true
	}]);
	const [busy, setBusy] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)("");
	const undoRef = (0, import_react.useRef)([]);
	const snapshot = () => {
		undoRef.current = undoRef.current.concat([{
			nodes,
			edges
		}]).slice(-20);
	};
	const onConnect = (0, import_react.useCallback)((connection) => setEdges((items) => addEdge({
		...connection,
		animated: true
	}, items)), [setEdges]);
	const add = (kind, extra, position) => {
		snapshot();
		const id = `${kind}-${Date.now()}`;
		const offset = nodes.length * 28;
		const data = kind === "prompt" ? {
			kind,
			text: extra?.text || "cinematic still, photoreal"
		} : kind === "character" ? {
			kind,
			name: extra?.name || "角色A",
			look: extra?.look || "black coat, wet hair, sharp jaw",
			model: DEFAULT_IMAGE
		} : kind === "video" || kind === "seedance" ? {
			kind,
			prompt: extra?.prompt || "slow push in, cinematic",
			model: DEFAULT_VIDEO,
			duration: 5,
			ratio: "16:9"
		} : kind === "story" ? {
			kind,
			text: extra?.text || "雨夜码头，女警探追踪一枚会发光的铜铃",
			model: DEFAULT_TEXT
		} : kind === "audio" ? {
			kind,
			prompt: extra?.prompt || "低沉旁白，潮湿港口",
			model: DEFAULT_AUDIO
		} : kind === "upload" ? { kind } : {
			kind,
			prompt: extra?.prompt || "",
			model: DEFAULT_IMAGE,
			...extra
		};
		setNodes((items) => items.concat({
			id,
			type: kind,
			position: position || {
				x: 80 + offset,
				y: 80 + (kind === "video" || kind === "seedance" ? 240 : 0)
			},
			data
		}));
		return id;
	};
	const applyStory = async () => {
		const story = nodes.find((item) => item.data.kind === "story");
		const idea = story?.data.text || "雨夜码头短片";
		setBusy("分析故事…");
		setError("");
		try {
			const selection = splitModel(story?.data.model || DEFAULT_TEXT);
			const result = await generateStudioText({
				relays,
				json: true,
				providerId: selection.providerId,
				model: selection.model,
				system: "You are a film director. Return compact JSON only.",
				prompt: `Break this story into a production board: ${idea}
JSON: {"logline":"zh","cast":[{"name":"zh","look":"english visual bible"}],"shots":[{"title":"zh","prompt":"english photoreal cinematic still, include character names and wardrobe lock"}]}
4 shots max.`
			});
			const parsed = JSON.parse(result.text.replace(/```json|```/g, "").trim());
			snapshot();
			const originX = story ? story.position.x + 320 : 80;
			const originY = story ? story.position.y : 80;
			const nextNodes = [...nodes];
			const nextEdges = [...edges];
			const characterIds = [];
			(parsed.cast || []).slice(0, 4).forEach((person, index) => {
				const id = `character-${Date.now()}-${index}`;
				characterIds.push(id);
				nextNodes.push({
					id,
					type: "character",
					position: {
						x: originX,
						y: originY + index * 220
					},
					data: {
						kind: "character",
						name: person.name,
						look: person.look,
						model: DEFAULT_IMAGE,
						status: parsed.logline
					}
				});
				if (story) nextEdges.push({
					id: `e-${story.id}-${id}`,
					source: story.id,
					target: id,
					sourceHandle: "out",
					targetHandle: "in",
					animated: true
				});
			});
			(parsed.shots || []).slice(0, 6).forEach((shot, index) => {
				const id = `image-shot-${Date.now()}-${index}`;
				nextNodes.push({
					id,
					type: "image",
					position: {
						x: originX + 320,
						y: originY + index * 200
					},
					data: {
						kind: "image",
						prompt: shot.prompt,
						model: DEFAULT_IMAGE,
						status: shot.title
					}
				});
				const source = characterIds[index % Math.max(characterIds.length, 1)];
				if (source) nextEdges.push({
					id: `e-${source}-${id}`,
					source,
					target: id,
					sourceHandle: "out",
					targetHandle: "in",
					animated: true
				});
			});
			setNodes(nextNodes);
			setEdges(nextEdges);
			if (story) setNodes((items) => items.map((item) => item.id === story.id ? {
				...item,
				data: {
					...item.data,
					status: parsed.logline || "已分析"
				}
			} : item));
		} catch (err) {
			setError(err instanceof Error ? err.message : "分析失败");
		} finally {
			setBusy("");
		}
	};
	const run = async () => {
		setBusy("运行工作流…");
		setError("");
		try {
			const snapshotNodes = nodes;
			const order = topoOrder(snapshotNodes, edges);
			const byId = new Map(snapshotNodes.map((item) => [item.id, item]));
			for (const id of order) {
				const node = byId.get(id);
				if (!node) continue;
				const sources = edges.filter((edge) => edge.target === id).map((edge) => byId.get(edge.source)).filter(Boolean);
				const promptNode = sources.find((item) => item.data.kind === "prompt" || item.data.kind === "story");
				const character = sources.find((item) => item.data.kind === "character");
				const image = sources.find((item) => item.data.url && [
					"image",
					"upscale",
					"character",
					"upload"
				].includes(item.data.kind));
				const prompt = [
					promptNode?.data.text,
					character ? `${character.data.name}, ${character.data.look}` : "",
					node.data.prompt || node.data.look || node.data.text || ""
				].filter(Boolean).join(", ");
				const imageUrl = image?.data.url;
				const patch = (data) => {
					setNodes((items) => items.map((item) => item.id === id ? {
						...item,
						data: {
							...item.data,
							...data
						}
					} : item));
					Object.assign(node.data, data);
				};
				if (node.data.kind === "prompt" || node.data.kind === "upload") continue;
				if (node.data.kind === "story") {
					patch({ status: "请用左侧「分析分镜」展开角色和镜头" });
					continue;
				}
				patch({ status: "生成中" });
				const { providerId, model } = splitModel(node.data.model || (node.data.kind === "video" || node.data.kind === "seedance" ? DEFAULT_VIDEO : node.data.kind === "audio" ? DEFAULT_AUDIO : DEFAULT_IMAGE));
				if (node.data.kind === "audio") {
					patch({
						url: (await generateStudioAudio({
							relays,
							prompt: prompt || "ambient score",
							providerId,
							model
						})).url,
						status: "完成"
					});
					continue;
				}
				if (node.data.kind === "video" || node.data.kind === "seedance") {
					const created = await createStudioVideo({
						relays,
						prompt: prompt || "cinematic motion",
						providerId,
						model,
						duration: node.data.duration || 6,
						aspectRatio: node.data.ratio || "16:9",
						imageUrl,
						generateAudio: true
					});
					const url = await waitStudioVideo({
						relays,
						providerId: created.providerId,
						taskId: created.id,
						model: created.model
					});
					patch({
						url,
						status: "完成"
					});
					addHistory({
						kind: "video",
						title: (prompt || "画布视频").slice(0, 40),
						prompt,
						model,
						urls: [url]
					});
					continue;
				}
				const result = await generateStudioImage({
					relays,
					prompt: prompt || "cinematic still",
					providerId,
					model,
					imageUrl: node.data.kind === "upscale" ? imageUrl : character?.data.url || imageUrl
				});
				patch({
					url: result.url,
					status: "完成"
				});
				addHistory({
					kind: "image",
					title: (prompt || "画布生图").slice(0, 40),
					prompt,
					model,
					urls: [result.url]
				});
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "运行失败");
		} finally {
			setBusy("");
		}
	};
	const save = () => {
		localStorage.setItem(GRAPH_KEY, JSON.stringify({
			nodes,
			edges
		}));
		setBusy("已保存到本机");
		window.setTimeout(() => setBusy(""), 1200);
	};
	const load = () => {
		const graph = loadGraph();
		if (!graph?.nodes?.length) {
			setError("没有已保存的画布");
			return;
		}
		setNodes(graph.nodes);
		setEdges(graph.edges);
	};
	const seedanceTemplate = () => {
		snapshot();
		const uploadId = `upload-${Date.now()}`;
		const seedId = `seedance-${Date.now()}`;
		setNodes((items) => items.concat({
			id: uploadId,
			type: "upload",
			position: {
				x: 80,
				y: 280
			},
			data: { kind: "upload" }
		}, {
			id: seedId,
			type: "seedance",
			position: {
				x: 400,
				y: 240
			},
			data: {
				kind: "seedance",
				prompt: "slow orbit around the subject, cinematic",
				model: DEFAULT_VIDEO,
				duration: 5,
				ratio: "16:9"
			}
		}));
		setEdges((items) => items.concat({
			id: `e-${uploadId}-${seedId}`,
			source: uploadId,
			target: seedId,
			sourceHandle: "out",
			targetHandle: "in",
			animated: true
		}));
	};
	const types = (0, import_react.useMemo)(() => nodeTypes, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flow-shell",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
			className: "flow-side",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-kicker",
					children: "CANVAS"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: "无限画布" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-hint",
					children: "文本 / 角色 / 素材 → 生图 → Seedance 或视频。故事导演会把分镜展开成节点。"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flow-start",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: () => add("prompt"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Type, { size: 14 }), " 文本"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: () => add("upload"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Upload, { size: 14 }), " 上传素材"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: () => add("character"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserRound, { size: 14 }), " 角色定妆"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: () => add("image"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Image, { size: 14 }), " 生图"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: () => add("video"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Video, { size: 14 }), " 生视频"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: seedanceTemplate,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clapperboard, { size: 14 }), " Seedance 工作流"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: () => add("story"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(WandSparkles, { size: 14 }), " 故事导演"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: () => add("audio"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Music2, { size: 14 }), " 音频"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: () => add("upscale"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { size: 14 }), " 放大"]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "studio-primary",
					disabled: Boolean(busy),
					onClick: () => void run(),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { size: 14 }),
						" ",
						busy || "运行工作流"
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "studio-ghost",
					disabled: Boolean(busy),
					onClick: () => void applyStory(),
					children: "分析分镜并展开节点"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flow-start",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: save,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { size: 14 }), " 保存"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: load,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { size: 14 }), " 载入"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "studio-ghost",
							onClick: () => {
								snapshot();
								setNodes([]);
								setEdges([]);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { size: 14 }), " 清空"]
						})
					]
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "studio-error",
					children: error
				}) : null
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flow-board",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(index, {
				nodes,
				edges,
				onNodesChange,
				onEdgesChange,
				onConnect,
				nodeTypes: types,
				fitView: true,
				colorMode: "dark",
				deleteKeyCode: ["Backspace", "Delete"],
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniMap, {
						pannable: true,
						zoomable: true
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Controls, {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Background, {
						gap: 22,
						color: "#2a2a32"
					})
				]
			})
		})]
	});
}
function FlowCanvasPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReactFlowProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CanvasInner, {}) });
}
//#endregion
export { FlowCanvasPage as t };
