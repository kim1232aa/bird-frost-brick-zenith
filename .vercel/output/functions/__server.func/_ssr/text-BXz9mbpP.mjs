import { n as STUDIO_PROVIDERS, r as STUDIO_ROUTES, u as providerById } from "./catalog-D989O0dv.mjs";
import { t as adapterForProvider } from "./session-DOM_npBX.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/text-BXz9mbpP.js
async function generateStudioText(input) {
	const providerId = input.providerId || STUDIO_ROUTES.text.providerId;
	const model = input.model || STUDIO_ROUTES.text.model;
	const provider = providerById(providerId, input.relays);
	const blueprint = STUDIO_PROVIDERS.find((item) => item.id === providerId);
	const adapter = adapterForProvider({
		adapterType: blueprint?.adapter || provider.adapterType,
		baseUrl: provider.baseUrl
	}, model);
	if (!adapter.generateText) throw new Error(`${adapter.label} 不支持文本`);
	return {
		text: (await adapter.generateText({ provider }, {
			model,
			prompt: input.prompt,
			system: input.system,
			json: input.json
		})).text,
		model,
		providerId
	};
}
//#endregion
export { generateStudioText as t };
