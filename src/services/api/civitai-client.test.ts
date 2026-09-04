import assert from "node:assert/strict";
import { register } from "node:module";
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

mock.module("@/services/desktop-api-url", {
  namedExports: { shouldUseDesktopLoopback: () => false },
});
mock.module("@/services/api/ai-routing", {
  namedExports: { routedLocalApiUrl: (_route: unknown, path: string) => path },
});
mock.module("@/services/api/relay-proxy", {
  namedExports: {
    buildLocalRelayProxyHeaders: () => ({}),
    buildLocalRelayProxyUrl: (path: string) => `/local-relay-proxy${path}`,
    selectRelayCredential: () => ({ apiKey: "token", credentialId: "credential-test" }),
    resolveRelayCredentialId: () => "credential-test", 
  },
});

type AxiosCall = { url: string; config?: { params?: Record<string, unknown> } };
const axiosCalls: AxiosCall[] = [];

mock.module("axios", {
  defaultExport: {
    get: async (url: string, config?: AxiosCall["config"]) => {
      axiosCalls.push({ url, config });
      return { data: { id: "wf_poll", status: "processing" } };
    },
    post: async () => ({ data: {} }),
  },
  namedExports: { isAxiosError: () => false },
});

const { pollCivitaiWorkflow } = await import("./civitai-client.ts");
const { isCivitaiAdapterType } = await import("./civitai-orchestration.ts");

test("studio Civitai adapter alias routes to orchestration", () => {
  assert.equal(isCivitaiAdapterType("civitai"), true);
  assert.equal(isCivitaiAdapterType("civitai-orchestration"), true);
  assert.equal(isCivitaiAdapterType("openai-compat"), false);
});

function route(allowMatureContent?: boolean): Parameters<typeof pollCivitaiWorkflow>[0] {
  return {
    mode: "local" as const,
    capability: "video" as const,
    model: "ltx2.3",
    provider: {
      id: "civitai-provider",
      baseUrl: "https://orchestration.civitai.com/v2/consumer",
      apiKey: "token",
      apiKeys: [],
      adapterType: "civitai-orchestration",
      proxyMode: "direct" as const,
      proxyUrl: "",
      allowMatureContent,
    },
    timeoutMs: 30_000,
  } as unknown as Parameters<typeof pollCivitaiWorkflow>[0];
}

test.afterEach(() => {
  axiosCalls.length = 0;
});

test("SFW Civitai polling requests mature blobs to be hidden", async () => {
  await pollCivitaiWorkflow(route(false), "wf_poll", "token");

  assert.deepEqual(axiosCalls[0]?.config?.params, { hideMatureContent: true });
});

test("mature-enabled Civitai polling keeps mature blob URLs visible", async () => {
  await pollCivitaiWorkflow(route(true), "wf_poll", "token");

  assert.deepEqual(axiosCalls[0]?.config?.params, { hideMatureContent: false });
});
