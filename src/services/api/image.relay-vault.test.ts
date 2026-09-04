import { register } from "node:module";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const aliasLoader = `
const SRC = new URL("file://" + process.cwd() + "/src/").href;
const SUFFIXES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) target = SRC + specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) target = new URL(specifier, context.parentURL).href;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    if (!target.startsWith("file:")) throw error;
    for (const suffix of SUFFIXES) {
      try {
        return await nextResolve(target + suffix, context);
      } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

const axiosCalls: Array<{ url: string; config?: unknown }> = [];
const axiosMock = {
  get: async (url: string, config?: unknown) => {
    axiosCalls.push({ url, config });
    return { data: { data: [{ id: "should-not-be-used" }] } };
  },
  post: async () => ({ data: {} }),
  isAxiosError: () => false,
  interceptors: { request: { use: () => undefined } },
};
mock.module("axios", {
  defaultExport: axiosMock,
  namedExports: { isAxiosError: axiosMock.isAxiosError },
});

const routeError = new Error("没有稳定 relay-id 的图片路由");
mock.module("@/services/api/ai-routing", {
  namedExports: {
    explicitMediaRequestModel: () => "",
    explicitTextRequestModel: () => "",
    resolveApiRequestRoute: () => {
      throw routeError;
    },
    routedLocalApiUrl: () => "",
    routedLocalHeaders: () => ({}),
  },
});
mock.module("@/stores/use-config-store", {
  namedExports: {
    persistImageHostCredential: async () => ({ ok: true, baseUrl: "", hasApiKey: false }),
  },
});
mock.module("@/stores/use-user-store", {
  namedExports: { useUserStore: { getState: () => ({ token: "", hydrateUser: () => undefined }) } },
});
mock.module("@/store/auth", {
  namedExports: {
    clearStoredAuthSession: async () => undefined,
    getStoredAuthKey: async () => "",
    getStoredAuthSession: async () => null,
    setStoredAuthSession: async () => undefined,
  },
});
mock.module("@/studio/generate/image", {
  namedExports: { generateStudioImage: async () => { throw new Error("unexpected studio image request"); } },
});

const { fetchImageModels } = await import("./image.ts");

test("legacy image model discovery without a stable relay-id fails before sending browser credentials", async () => {
  axiosCalls.length = 0;
  const config = {
    channelMode: "local",
    models: ["configured-model"],
    baseUrl: "https://relay.example.test/v1",
    apiKey: "caller-key",
  } as unknown as Parameters<typeof fetchImageModels>[0];

  await assert.rejects(() => fetchImageModels(config), /稳定 relay-id/);
  assert.equal(axiosCalls.length, 0);
});
