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

type AxiosCall = {
  url: string;
  config?: { headers?: Record<string, string>; params?: Record<string, unknown> };
};
const axiosCalls: AxiosCall[] = [];
const axiosMock = {
  get: async (url: string, config?: AxiosCall["config"]) => {
    axiosCalls.push({ url, config });
    return { data: { status: "processing" } };
  },
  post: async () => ({ data: {} }),
  isAxiosError: () => false,
  interceptors: { request: { use: () => undefined } },
};
mock.module("axios", {
  defaultExport: axiosMock,
  namedExports: { isAxiosError: axiosMock.isAxiosError },
});
mock.module("@/stores/use-user-store", {
  namedExports: { useUserStore: { getState: () => ({ token: "", hydrateUser: () => undefined }) } },
});
mock.module("@/stores/use-config-store", {
  namedExports: {
    useConfigStore: { getState: () => ({ config: {} }) },
    persistImageHostCredential: async () => ({ ok: true, baseUrl: "", hasApiKey: false }),
    videoConfigToGenerationParameters: () => ({}),
    videoGenerationOperationFromIntent: () => "text_to_video",
  },
});
mock.module("@/studio/membership", {
  namedExports: { useMembershipStore: { getState: () => ({ record: () => undefined }) } },
});
mock.module("@/services/api/local-pool", {
  namedExports: { routedLocalPoolHeaders: async () => ({}) },
});
mock.module("@/store/auth", {
  namedExports: {
    clearStoredAuthSession: async () => undefined,
    getStoredAuthKey: async () => "",
    getStoredAuthSession: async () => null,
    setStoredAuthSession: async () => undefined,
  },
});

const { pollVideoGenerationTask } = await import("./video.ts");

test("Agnes video polling stays on the relay-vault path and never sends task.apiKey", async () => {
  axiosCalls.length = 0;
  const route = {
    mode: "local",
    capability: "video",
    model: "agnes-video-v2.0",
    timeoutMs: 30_000,
    provider: {
      id: "preset-agnes",
      name: "Agnes",
      baseUrl: "https://apihub.agnes-ai.com/v1",
      apiKey: "",
      apiKeys: undefined,
      adapterType: "agnes",
      authScheme: "Bearer",
      proxyMode: "direct",
      proxyUrl: "",
    },
  } as const;
  const task = {
    id: "task-1",
    provider: "agnes",
    model: "agnes-video-v2.0",
    route,
    agnesVideoId: "video-1",
    apiKey: "caller-key",
  } as const;

  const state = await pollVideoGenerationTask(
    { channelMode: "local" } as unknown as Parameters<typeof pollVideoGenerationTask>[0],
    task as unknown as Parameters<typeof pollVideoGenerationTask>[1],
  );

  assert.deepEqual(state, { status: "pending" });
  assert.equal(axiosCalls.length, 1);
  assert.equal(axiosCalls[0]?.url, "/local-relay-proxy/agnesapi/");
  assert.deepEqual(axiosCalls[0]?.config?.params, { video_id: "video-1" });
  const headers = new Headers(axiosCalls[0]?.config?.headers);
  assert.equal(headers.get("x-boundless-relay-id"), "preset-agnes");
  assert.equal(headers.get("x-local-relay-base-url"), null);
  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("x-api-key"), null);
  assert.equal(JSON.stringify(axiosCalls[0]?.config).includes("caller-key"), false);
});
