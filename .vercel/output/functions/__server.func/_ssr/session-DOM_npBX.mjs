import { d as studioProxyJson, f as studioRelays, l as firstImageUrl, o as civitaiAdapter, s as createApiRelayProvider } from "./catalog-D989O0dv.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/session-DOM_npBX.js
var openaiCompatAdapter = {
	id: "openai-compat",
	label: "OpenAI 兼容",
	docs: "https://platform.openai.com/docs/api-reference",
	async generateImage(ctx, input) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/images/generations",
			body: {
				model: input.model,
				prompt: input.prompt,
				n: input.n || 1,
				...input.size ? { size: input.size } : {},
				...input.imageUrl ? { image: input.imageUrl } : {}
			},
			timeoutMs: 12e4
		});
		const url = firstImageUrl(data);
		if (!url) throw new Error("OpenAI 兼容生图没有返回图片");
		return { url };
	},
	async createVideo(ctx, input) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/videos/generations",
			body: {
				model: input.model,
				prompt: input.prompt,
				...typeof input.duration === "number" ? { duration: input.duration } : {},
				...input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {},
				...input.imageUrl ? { image: { url: input.imageUrl } } : {}
			},
			timeoutMs: 9e4
		});
		const id = String(data.request_id || data.id || "").trim();
		if (!id) throw new Error("视频任务没有返回 id");
		return { id };
	},
	async pollVideo(ctx, taskId) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: `/videos/${encodeURIComponent(taskId)}`,
			method: "GET",
			timeoutMs: 3e4
		});
		const status = String(data.status || "").toLowerCase();
		const video = data.video && typeof data.video === "object" ? data.video : void 0;
		const url = String(video?.url || data.video_url || data.url || "").trim();
		if ([
			"done",
			"completed",
			"succeeded",
			"success"
		].includes(status) || url) return url ? {
			status: "completed",
			url
		} : {
			status: "failed",
			error: "视频已完成但没有地址"
		};
		if ([
			"failed",
			"expired",
			"cancelled",
			"canceled"
		].includes(status)) return {
			status: "failed",
			error: String(data.error || data.message || status)
		};
		return { status: "pending" };
	},
	async generateText(ctx, input) {
		const text = (await studioProxyJson({
			provider: ctx.provider,
			path: "/chat/completions",
			body: {
				model: input.model,
				temperature: .7,
				messages: [...input.system ? [{
					role: "system",
					content: input.system
				}] : [], {
					role: "user",
					content: input.prompt
				}],
				...input.json ? { response_format: { type: "json_object" } } : {}
			},
			timeoutMs: 9e4
		})).choices?.[0]?.message?.content?.trim() || "";
		if (!text) throw new Error("文本模型没有返回内容");
		return { text };
	},
	async generateAudio(ctx, input) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/audio/speech",
			body: {
				model: input.model,
				input: input.prompt,
				voice: input.voice || "alloy"
			},
			timeoutMs: 9e4
		});
		const url = String(data.url || "").trim();
		if (url) return { url };
		throw new Error("音频接口没有返回地址。请确认该中转支持 /audio/speech。");
	},
	async testConnection(ctx) {
		try {
			const models = ((await studioProxyJson({
				provider: ctx.provider,
				path: "/models",
				method: "GET",
				timeoutMs: 2e4
			})).data || []).map((item) => String(item.id || "")).filter(Boolean).slice(0, 40);
			return {
				ok: true,
				message: models.length ? `已连通，${models.length} 个模型` : "已连通",
				models
			};
		} catch (err) {
			return {
				ok: false,
				message: err instanceof Error ? err.message : "连接失败"
			};
		}
	}
};
function pollState(data) {
	if (!data || typeof data !== "object") return {
		status: "failed",
		error: "视频任务返回为空"
	};
	const record = data;
	const status = String(record.status || "").toLowerCase();
	const video = record.video && typeof record.video === "object" ? record.video : void 0;
	const url = String(video?.url || record.video_url || record.url || "").trim();
	if ([
		"done",
		"completed",
		"succeeded",
		"success"
	].includes(status)) return url ? {
		status: "completed",
		url
	} : {
		status: "failed",
		error: "视频已完成但没有返回地址"
	};
	if ([
		"failed",
		"expired",
		"cancelled",
		"canceled"
	].includes(status)) return {
		status: "failed",
		error: String(record.error || record.message || status)
	};
	if (url) return {
		status: "completed",
		url
	};
	return { status: "pending" };
}
var xaiImagineAdapter = {
	id: "xai-imagine",
	label: "xAI Imagine",
	docs: "https://docs.x.ai/docs/guides/image-generation",
	async generateImage(ctx, input) {
		const body = {
			model: input.model,
			prompt: input.prompt,
			n: 1
		};
		if (input.imageUrl) body.image = { url: input.imageUrl };
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/images/generations",
			body,
			timeoutMs: 12e4
		});
		const url = firstImageUrl(data);
		if (!url) throw new Error("Grok Imagine 没有返回图片");
		return { url };
	},
	async createVideo(ctx, input) {
		const body = {
			model: input.model,
			prompt: input.prompt
		};
		if (typeof input.duration === "number") body.duration = input.duration;
		if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
		if (input.resolution) body.resolution = input.resolution;
		if (input.imageUrl) body.image = { url: input.imageUrl };
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/videos/generations",
			body,
			timeoutMs: 9e4
		});
		const id = String(data.request_id || data.id || "").trim();
		if (!id) throw new Error(`Imagine 视频没有返回 request_id：${JSON.stringify(data).slice(0, 200)}`);
		return { id };
	},
	async pollVideo(ctx, taskId) {
		const state = pollState(await studioProxyJson({
			provider: ctx.provider,
			path: `/videos/${encodeURIComponent(taskId)}`,
			method: "GET",
			timeoutMs: 3e4
		}));
		if (state.status !== "completed" || !state.url) return state;
		if (/^https?:\/\//i.test(state.url) && !state.url.includes("/videos/")) return state;
		const path = state.url.startsWith("/v1/") ? state.url.replace(/^\/v1/, "") : `/videos/${taskId}/content`;
		const response = await fetch(`/local-relay-proxy${path.startsWith("/") ? path : `/${path}`}`, { headers: {
			Authorization: ctx.provider.apiKey ? `Bearer ${ctx.provider.apiKey}` : "",
			"x-local-relay-base-url": ctx.provider.baseUrl,
			"Accept-Encoding": "identity"
		} });
		if (!response.ok) throw new Error(`视频文件下载失败 ${response.status}`);
		const blob = await response.blob();
		return {
			status: "completed",
			url: URL.createObjectURL(blob)
		};
	},
	async generateText(ctx, input) {
		const text = (await studioProxyJson({
			provider: ctx.provider,
			path: "/chat/completions",
			body: {
				model: input.model,
				temperature: .7,
				messages: [...input.system ? [{
					role: "system",
					content: input.system
				}] : [], {
					role: "user",
					content: input.prompt
				}],
				...input.json ? { response_format: { type: "json_object" } } : {}
			},
			timeoutMs: 9e4
		})).choices?.[0]?.message?.content?.trim() || "";
		if (!text) throw new Error("Grok 没有返回文本");
		return { text };
	},
	async testConnection(ctx) {
		try {
			const models = ((await studioProxyJson({
				provider: ctx.provider,
				path: "/models",
				method: "GET",
				timeoutMs: 2e4
			})).data || []).map((item) => String(item.id || "")).filter(Boolean);
			return {
				ok: true,
				message: `已连通 Grok 中转（${models.length} 模型）`,
				models: models.slice(0, 40)
			};
		} catch (err) {
			return {
				ok: false,
				message: err instanceof Error ? err.message : "连接失败"
			};
		}
	}
};
function explainVideoError(message) {
	if (/UnsupportedModel|does not support the agent plan/i.test(message)) return "当前 Agent Plan 档位未开通该 Seedance 模型。官方：Small 无视频；Medium 起 doubao-seedance-1.5-pro；Large/Max 才有 Seedance 2.0。生图 doubao-seedream-5.0-lite 已开通。";
	return message;
}
var arkPlanAdapter = {
	id: "ark-plan",
	label: "火山方舟 Agent Plan",
	docs: "https://www.volcengine.com/docs/82379/2375486",
	async generateImage(ctx, input) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/images/generations",
			body: {
				model: input.model,
				prompt: input.prompt,
				size: input.size || "2K",
				watermark: false,
				output_format: "png",
				response_format: "url",
				...input.imageUrl ? { image: [input.imageUrl] } : {}
			},
			timeoutMs: 12e4
		});
		const url = firstImageUrl(data);
		if (!url) throw new Error("火山 Agent Plan 生图没有返回图片地址");
		return { url };
	},
	async createVideo(ctx, input) {
		const content = [{
			type: "text",
			text: input.prompt
		}];
		if (input.imageUrl) content.push({
			type: "image_url",
			image_url: { url: input.imageUrl }
		});
		if (input.lastFrameUrl) content.push({
			type: "image_url",
			image_url: { url: input.lastFrameUrl },
			role: "last_frame"
		});
		try {
			const data = await studioProxyJson({
				provider: ctx.provider,
				path: "/contents/generations/tasks",
				body: {
					model: input.model,
					content,
					...typeof input.duration === "number" ? { duration: input.duration } : {},
					ratio: input.aspectRatio || "adaptive",
					generate_audio: input.generateAudio !== false,
					watermark: false
				},
				timeoutMs: 6e4
			});
			const id = String(data.id || "").trim();
			if (!id) throw new Error(`火山视频没有返回任务 id：${JSON.stringify(data).slice(0, 200)}`);
			return { id };
		} catch (err) {
			throw new Error(explainVideoError(err instanceof Error ? err.message : "火山视频失败"));
		}
	},
	async pollVideo(ctx, taskId) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: `/contents/generations/tasks/${encodeURIComponent(taskId)}`,
			method: "GET",
			timeoutMs: 3e4
		});
		const status = String(data.status || "").toLowerCase();
		const content = data.content && typeof data.content === "object" ? data.content : void 0;
		const url = String(content?.video_url || data.video_url || data.url || "").trim();
		if ([
			"succeeded",
			"success",
			"completed",
			"done"
		].includes(status)) return url ? {
			status: "completed",
			url
		} : {
			status: "failed",
			error: "视频已完成但没有返回地址"
		};
		if ([
			"failed",
			"expired",
			"cancelled",
			"canceled"
		].includes(status)) {
			const err = data.error && typeof data.error === "object" ? data.error.message : "";
			return {
				status: "failed",
				error: String(err || data.message || status)
			};
		}
		if (url) return {
			status: "completed",
			url
		};
		return { status: "pending" };
	},
	async testConnection(ctx) {
		if (!ctx.provider.apiKey) return {
			ok: false,
			message: "缺少 Agent Plan API Key"
		};
		if (!String(ctx.provider.baseUrl || "").includes("/api/plan/v3")) return {
			ok: false,
			message: "Agent Plan 必须使用 https://ark.cn-beijing.volces.com/api/plan/v3 ，不是 /api/v3"
		};
		return {
			ok: true,
			message: "密钥已保存。生图走 /images/generations，视频走 /contents/generations/tasks。"
		};
	}
};
var agnesAdapter = {
	id: "agnes",
	label: "Agnes AI",
	docs: "https://agnes-ai.com/en/docs/agnes-video-v20",
	async generateImage(ctx, input) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/images/generations",
			body: {
				model: input.model,
				prompt: input.prompt,
				n: 1
			},
			timeoutMs: 12e4
		});
		const url = firstImageUrl(data);
		if (!url) throw new Error("Agnes 生图没有返回图片");
		return { url };
	},
	async createVideo(ctx, input) {
		const body = {
			model: input.model || "agnes-video-v2.0",
			prompt: input.prompt
		};
		if (input.imageUrl) body.image = input.imageUrl;
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/videos",
			body,
			timeoutMs: 6e4
		});
		const id = String(data.task_id || data.video_id || data.id || "").trim();
		if (!id) throw new Error("Agnes 视频没有返回 task_id");
		return { id };
	},
	async pollVideo(ctx, taskId) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: `/videos/${encodeURIComponent(taskId)}`,
			method: "GET",
			timeoutMs: 3e4
		});
		const status = String(data.status || "").toLowerCase();
		const url = String(data.video_url || data.url || "").trim();
		if ([
			"succeeded",
			"success",
			"completed",
			"done"
		].includes(status) || url) return url ? {
			status: "completed",
			url
		} : {
			status: "failed",
			error: "Agnes 视频完成但无地址"
		};
		if (["failed", "error"].includes(status)) return {
			status: "failed",
			error: String(data.error || status)
		};
		return { status: "pending" };
	},
	async generateText(ctx, input) {
		const text = (await studioProxyJson({
			provider: ctx.provider,
			path: "/chat/completions",
			body: {
				model: input.model,
				messages: [...input.system ? [{
					role: "system",
					content: input.system
				}] : [], {
					role: "user",
					content: input.prompt
				}]
			}
		})).choices?.[0]?.message?.content?.trim() || "";
		if (!text) throw new Error("Agnes 没有返回文本");
		return { text };
	},
	async testConnection(ctx) {
		if (!ctx.provider.apiKey) return {
			ok: false,
			message: "缺少 Agnes Key"
		};
		try {
			const models = ((await studioProxyJson({
				provider: ctx.provider,
				path: "/models",
				method: "GET",
				timeoutMs: 2e4
			})).data || []).map((item) => String(item.id || "")).filter(Boolean);
			return {
				ok: true,
				message: `Agnes 已连通（${models.length} 模型）`,
				models: models.slice(0, 40)
			};
		} catch (err) {
			return {
				ok: false,
				message: err instanceof Error ? err.message : "连接失败"
			};
		}
	}
};
function nativeBase(baseUrl) {
	if (baseUrl.includes("token-plan")) return "https://token-plan.cn-beijing.maas.aliyuncs.com";
	return "https://dashscope.aliyuncs.com";
}
var dashscopeAdapter = {
	id: "dashscope",
	label: "阿里云百炼 DashScope",
	docs: "https://help.aliyun.com/zh/model-studio/developer-reference/api-details-9",
	async generateImage(ctx, input) {
		try {
			const data = await studioProxyJson({
				provider: ctx.provider,
				path: "/images/generations",
				body: {
					model: input.model,
					prompt: input.prompt,
					n: 1,
					...input.size ? { size: input.size } : {}
				},
				timeoutMs: 12e4
			});
			const url = firstImageUrl(data);
			if (url) return { url };
		} catch {}
		const url = (await studioProxyJson({
			provider: ctx.provider,
			baseUrl: nativeBase(ctx.provider.baseUrl),
			path: "/api/v1/services/aigc/multimodal-generation/generation",
			body: {
				model: input.model,
				input: { messages: [{
					role: "user",
					content: [{ text: input.prompt }, ...input.imageUrl ? [{ image: input.imageUrl }] : []]
				}] }
			},
			timeoutMs: 12e4
		})).output?.choices?.[0]?.message?.content?.find((item) => item.image || item.url);
		if (!url) throw new Error("DashScope 生图没有返回图片");
		return { url: String(url.image || url.url) };
	},
	async createVideo(ctx, input) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			baseUrl: nativeBase(ctx.provider.baseUrl),
			path: "/api/v1/services/aigc/video-generation/video-synthesis",
			extraHeaders: { "X-DashScope-Async": "enable" },
			body: {
				model: input.model,
				input: {
					prompt: input.prompt,
					...input.imageUrl ? { img_url: input.imageUrl } : {}
				},
				parameters: {
					...typeof input.duration === "number" ? { duration: input.duration } : {},
					...input.aspectRatio ? { size: input.aspectRatio } : {}
				}
			},
			timeoutMs: 6e4
		});
		const output = data.output;
		const id = String(output?.task_id || data.task_id || data.id || "").trim();
		if (!id) throw new Error("DashScope 视频没有返回 task_id");
		return { id };
	},
	async pollVideo(ctx, taskId) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			baseUrl: nativeBase(ctx.provider.baseUrl),
			path: `/api/v1/tasks/${encodeURIComponent(taskId)}`,
			method: "GET",
			timeoutMs: 3e4
		});
		const output = data.output || data;
		const status = String(output.task_status || output.status || "").toLowerCase();
		const url = String(output.video_url || output.url || "").trim();
		if ([
			"succeeded",
			"success",
			"completed"
		].includes(status) || url) return url ? {
			status: "completed",
			url
		} : {
			status: "failed",
			error: "DashScope 视频完成但无地址"
		};
		if (["failed", "canceled"].includes(status)) return {
			status: "failed",
			error: String(output.message || status)
		};
		return { status: "pending" };
	},
	async generateText(ctx, input) {
		const text = (await studioProxyJson({
			provider: ctx.provider,
			path: "/chat/completions",
			body: {
				model: input.model,
				messages: [...input.system ? [{
					role: "system",
					content: input.system
				}] : [], {
					role: "user",
					content: input.prompt
				}]
			}
		})).choices?.[0]?.message?.content?.trim() || "";
		if (!text) throw new Error("DashScope 没有返回文本");
		return { text };
	},
	async generateAudio(ctx, input) {
		const data = await studioProxyJson({
			provider: ctx.provider,
			path: "/audio/speech",
			body: {
				model: input.model,
				input: input.prompt,
				voice: input.voice || "Cherry"
			}
		});
		const url = String(data.url || "").trim();
		if (!url) throw new Error("DashScope 音频没有返回地址");
		return { url };
	},
	async testConnection(ctx) {
		if (!ctx.provider.apiKey) return {
			ok: false,
			message: "缺少 DashScope Key"
		};
		try {
			const models = ((await studioProxyJson({
				provider: ctx.provider,
				path: "/models",
				method: "GET",
				timeoutMs: 2e4
			})).data || []).map((item) => String(item.id || "")).filter(Boolean);
			return {
				ok: true,
				message: `百炼已连通（${models.length} 模型）`,
				models: models.slice(0, 40)
			};
		} catch (err) {
			return {
				ok: false,
				message: err instanceof Error ? err.message : "连接失败"
			};
		}
	}
};
var FAL_IMAGE_MODELS = {
	"flux-dev": "fal-ai/flux/dev",
	"flux-schnell": "fal-ai/flux/schnell",
	"flux-pro": "fal-ai/flux-pro"
};
var ADAPTERS = {
	"openai-compat": openaiCompatAdapter,
	"xai-imagine": xaiImagineAdapter,
	"ark-plan": arkPlanAdapter,
	civitai: civitaiAdapter,
	agnes: agnesAdapter,
	dashscope: dashscopeAdapter,
	fal: {
		id: "fal",
		label: "Fal.ai",
		docs: "https://fal.ai/models",
		async generateImage(ctx, input) {
			const path = `/${FAL_IMAGE_MODELS[input.model] || input.model}`;
			const data = await studioProxyJson({
				provider: ctx.provider,
				path,
				authScheme: "Key",
				body: {
					prompt: input.prompt,
					...input.imageUrl ? { image_url: input.imageUrl } : {},
					enable_safety_checker: false
				},
				timeoutMs: 12e4
			});
			const url = data.images?.[0]?.url || data.image?.url || "";
			if (!url) throw new Error("Fal 没有返回图片");
			return { url };
		},
		async testConnection(ctx) {
			if (!ctx.provider.apiKey) return {
				ok: false,
				message: "缺少 Fal Key"
			};
			return {
				ok: true,
				message: "已保存 Fal Key。生成时走 fal.run，Authorization: Key。"
			};
		}
	},
	sensenova: {
		id: "sensenova",
		label: "商汤日日新",
		docs: "https://platform.sensenova.cn/",
		async generateImage(ctx, input) {
			const data = await studioProxyJson({
				provider: ctx.provider,
				path: "/images/generations",
				body: {
					model: input.model,
					prompt: input.prompt,
					size: input.size || "2048x2048",
					n: 1
				},
				timeoutMs: 12e4
			});
			const url = firstImageUrl(data);
			if (!url) throw new Error("日日新生图没有返回图片");
			return { url };
		},
		async generateText(ctx, input) {
			const text = (await studioProxyJson({
				provider: ctx.provider,
				path: "/chat/completions",
				body: {
					model: input.model,
					messages: [...input.system ? [{
						role: "system",
						content: input.system
					}] : [], {
						role: "user",
						content: input.prompt
					}]
				}
			})).choices?.[0]?.message?.content?.trim() || "";
			if (!text) throw new Error("日日新没有返回文本");
			return { text };
		},
		async testConnection(ctx) {
			if (!ctx.provider.apiKey) return {
				ok: false,
				message: "缺少 SenseNova Key"
			};
			try {
				const models = ((await studioProxyJson({
					provider: ctx.provider,
					path: "/models",
					method: "GET",
					timeoutMs: 2e4
				})).data || []).map((item) => String(item.id || "")).filter(Boolean);
				return {
					ok: true,
					message: `日日新已连通（${models.length} 模型）`,
					models: models.slice(0, 40)
				};
			} catch (err) {
				return {
					ok: false,
					message: err instanceof Error ? err.message : "连接失败"
				};
			}
		}
	}
};
function listStudioAdapters() {
	return Object.values(ADAPTERS);
}
function getStudioAdapter(id) {
	return ADAPTERS[id] || ADAPTERS["openai-compat"];
}
function resolveAdapterId(input) {
	const named = String(input.adapter || input.adapterType || "").toLowerCase();
	if (named === "ark" || named === "ark-plan") return "ark-plan";
	if (named === "civitai" || named === "civitai-orchestration") return "civitai";
	if (named === "xai-imagine" || named === "xai") return "xai-imagine";
	if (named === "agnes") return "agnes";
	if (named === "dashscope") return "dashscope";
	if (named === "fal") return "fal";
	if (named === "sensenova" || named === "miaohua" || named === "sensenova-miaohua") return "sensenova";
	if (named === "openai" || named === "openai-compat") return "openai-compat";
	const model = String(input.model || "");
	if (/grok-imagine/i.test(model)) return "xai-imagine";
	if (/seedream|seedance/i.test(model)) return "ark-plan";
	const host = String(input.baseUrl || "").toLowerCase();
	if (host.includes("volces.com") || host.includes("/api/plan/v3")) return "ark-plan";
	if (host.includes("civitai.com")) return "civitai";
	if (host.includes("agnes-ai.com")) return "agnes";
	if (host.includes("dashscope") || host.includes("aliyuncs.com")) return "dashscope";
	if (host.includes("fal.run") || host.includes("fal.ai")) return "fal";
	if (host.includes("sensenova")) return "sensenova";
	if (host.includes("x.ai")) return "xai-imagine";
	return "openai-compat";
}
function adapterForProvider(provider, model) {
	return getStudioAdapter(resolveAdapterId({
		adapterType: provider.adapterType,
		baseUrl: provider.baseUrl,
		model
	}));
}
var useStudioSession = create()(persist((set, get) => ({
	relays: studioRelays(),
	setRelayKey: (id, apiKey) => set({ relays: get().relays.map((item) => item.id === id ? {
		...item,
		apiKey,
		enabled: Boolean(apiKey) || item.enabled
	} : item) }),
	setRelayEnabled: (id, enabled) => set({ relays: get().relays.map((item) => item.id === id ? {
		...item,
		enabled
	} : item) }),
	setRelayFields: (id, patch) => set({ relays: get().relays.map((item) => item.id === id ? {
		...item,
		...patch
	} : item) }),
	addRelay: (input) => set({ relays: get().relays.concat(createApiRelayProvider({
		...input,
		enabled: Boolean(input.apiKey),
		adapterType: input.adapterType || "openai-compat"
	})) }),
	removeRelay: (id) => set({ relays: get().relays.filter((item) => item.id !== id) }),
	resetRelays: () => set({ relays: studioRelays() })
}), {
	name: "boundless-studio:session",
	merge: (persisted, current) => {
		const saved = persisted?.relays || [];
		const base = studioRelays();
		const extras = saved.filter((row) => !base.some((item) => item.id === row.id));
		return {
			...current,
			relays: base.map((item) => {
				const override = saved.find((row) => row.id === item.id);
				if (!override) return item;
				return {
					...item,
					apiKey: override.apiKey ?? item.apiKey,
					enabled: override.enabled ?? item.enabled,
					baseUrl: override.baseUrl || item.baseUrl,
					name: override.name || item.name
				};
			}).concat(extras)
		};
	}
}));
//#endregion
export { listStudioAdapters as n, useStudioSession as r, adapterForProvider as t };
