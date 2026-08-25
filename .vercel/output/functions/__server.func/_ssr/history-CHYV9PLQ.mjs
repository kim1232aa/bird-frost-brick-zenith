import { n as create, t as persist } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/history-CHYV9PLQ.js
var useStudioHistory = create()(persist((set, get) => ({
	items: [],
	add: (item) => set({ items: [{
		...item,
		id: crypto.randomUUID(),
		createdAt: Date.now()
	}, ...get().items].slice(0, 80) }),
	remove: (id) => set({ items: get().items.filter((item) => item.id !== id) }),
	clear: () => set({ items: [] })
}), { name: "boundless-studio:history" }));
//#endregion
export { useStudioHistory as t };
