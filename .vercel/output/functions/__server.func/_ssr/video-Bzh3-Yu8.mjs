import { n as STUDIO_PROVIDERS, r as STUDIO_ROUTES, u as providerById } from "./catalog-D989O0dv.mjs";
import { t as adapterForProvider } from "./session-DOM_npBX.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/video-Bzh3-Yu8.js
async function createStudioVideo(input) {
	const prompt = input.prompt.trim();
	if (!prompt) throw new Error("请填写视频提示词");
	const providerId = input.providerId || STUDIO_ROUTES.video.providerId;
	const model = input.model || STUDIO_ROUTES.video.model;
	const provider = providerById(providerId, input.relays);
	const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
	const adapter = adapterForProvider({
		adapterType: blueprint?.adapter || provider.adapterType,
		baseUrl: provider.baseUrl
	}, model);
	if (!adapter.createVideo) throw new Error(`${adapter.label} 不支持生视频`);
	return {
		id: (await adapter.createVideo({ provider }, {
			model,
			prompt,
			duration: input.duration,
			aspectRatio: input.aspectRatio,
			resolution: input.resolution,
			imageUrl: input.imageUrl,
			lastFrameUrl: input.lastFrameUrl,
			generateAudio: input.generateAudio,
			negativePrompt: input.negativePrompt
		})).id,
		model,
		providerId,
		adapter: adapter.id
	};
}
async function pollStudioVideo(input) {
	const provider = providerById(input.providerId, input.relays);
	const blueprint = STUDIO_PROVIDERS.find((item) => item.id === input.providerId);
	const adapter = adapterForProvider({
		adapterType: blueprint?.adapter || provider.adapterType,
		baseUrl: provider.baseUrl
	}, input.model);
	if (!adapter.pollVideo) throw new Error(`${adapter.label} 不支持视频轮询`);
	return adapter.pollVideo({ provider }, input.taskId);
}
async function waitStudioVideo(input) {
	for (let i = 0; i < 40; i += 1) {
		input.onTick?.(i + 1);
		const state = await pollStudioVideo(input);
		if (state.status === "completed" && state.url) return state.url;
		if (state.status === "failed") throw new Error(state.error || "视频生成失败");
		await new Promise((resolve) => window.setTimeout(resolve, 4e3));
	}
	throw new Error("视频生成超时");
}
//#endregion
export { waitStudioVideo as n, createStudioVideo as t };
