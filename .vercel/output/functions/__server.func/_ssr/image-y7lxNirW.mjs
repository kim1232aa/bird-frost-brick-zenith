import { n as STUDIO_PROVIDERS, r as STUDIO_ROUTES, u as providerById } from "./catalog-D989O0dv.mjs";
import { t as adapterForProvider } from "./session-DOM_npBX.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/image-y7lxNirW.js
async function generateStudioImage(input) {
	const prompt = input.prompt.trim();
	if (!prompt) throw new Error("请填写提示词");
	const providerId = input.providerId || STUDIO_ROUTES.image.providerId;
	const model = input.model || STUDIO_ROUTES.image.model;
	const provider = providerById(providerId, input.relays);
	const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
	const adapter = adapterForProvider({
		adapterType: blueprint?.adapter || provider.adapterType,
		baseUrl: provider.baseUrl
	}, model);
	if (!adapter.generateImage) throw new Error(`${adapter.label} 不支持生图`);
	return {
		url: (await adapter.generateImage({ provider }, {
			model,
			prompt,
			size: input.size,
			imageUrl: input.imageUrl,
			width: input.width,
			height: input.height,
			seed: input.seed,
			negativePrompt: input.negativePrompt,
			n: input.n
		})).url,
		model,
		providerId
	};
}
//#endregion
export { generateStudioImage as t };
