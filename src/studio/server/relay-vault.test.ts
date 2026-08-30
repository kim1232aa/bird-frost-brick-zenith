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

type QueryCall = { text: string; params: unknown[] };
const queryCalls: QueryCall[] = [];
let selectRows: Array<Record<string, unknown>> = [];

mock.module(new URL("../../lib/db.ts", import.meta.url).href, {
  namedExports: {
    getSql: async () => ({
      query: async <T>(text: string, params: unknown[] = []) => {
        queryCalls.push({ text, params });
        if (/^select /i.test(text)) return selectRows.filter((row) => row.id === params[0]) as T[];
        return [] as T[];
      },
    }),
  },
});
mock.module("@tanstack/react-start", {
  namedExports: {
    createServerOnlyFn: (fn: unknown) => fn,
    createServerFn: () => {
      let validator: ((value: unknown) => unknown) | undefined;
      const builder = {
        middleware() {
          return builder;
        },
        validator(next: (value: unknown) => unknown) {
          validator = next;
          return builder;
        },
        handler(next: (input: { data?: unknown; context?: unknown }) => unknown) {
          return async (input: { data?: unknown; context?: unknown } = {}) => next({
            ...input,
            ...(validator ? { data: validator(input.data) } : {}),
          });
        },
      };
      return builder;
    },
  },
});
mock.module(new URL("../../lib/auth/middleware.ts", import.meta.url).href, {
  namedExports: { authMiddleware: {} },
});

const { loadRelayVault, saveRelayVault, redactRelay, envSeededRelays, seedRelayVaultFromEnv } = await import("./relay-vault.ts");
const invokeWithVerifiedContext = (fn: unknown) => fn as (input: { context: { userId: string }; data: unknown }) => Promise<unknown>;

test.beforeEach(() => {
  queryCalls.length = 0;
  selectRows = [];
  delete process.env.CIVITAI_API_KEY;
  delete process.env.CIVITAI_TOKEN;
  delete process.env.FAL_KEY;
  delete process.env.GROK_RELAY_API_KEY;
  delete process.env.GROK_RELAY_BASE_URL;
  delete process.env.OPENAI_COMPAT_API_KEY;
  delete process.env.OPENAI_COMPAT_BASE_URL;
});

test("vault reads and writes use the verified user row, never a client id", async () => {
  selectRows = [{
    id: "studio",
    relays_json: JSON.stringify([{ id: "legacy-global", apiKey: "synthetic-legacy-key" }]),
    hidden_json: "[]",
    updated_at: "2026-01-01T00:00:00.000Z",
  }];
  const loaded = await invokeWithVerifiedContext(loadRelayVault)({ context: { userId: "user-alice" }, data: { userId: "user-attacker" } }) as { relays: unknown[] };
  assert.match(queryCalls[0]?.text || "", /where id = \$1/iu);
  assert.deepEqual(queryCalls[0]?.params, ["user-alice"]);
  assert.deepEqual(loaded.relays, []);

  queryCalls.length = 0;
  await invokeWithVerifiedContext(saveRelayVault)({
    context: { userId: "user-alice" },
    data: { userId: "user-attacker", relays: [], hiddenPresetIds: [] },
  });
  assert.deepEqual(queryCalls.map((call) => call.params), [["user-alice"], ["user-alice", "[]", "[]", "user-alice"]]);
});

test("redacted relay responses contain only the hasApiKey marker", () => {
  const publicRelay = redactRelay({
    id: "relay-1",
    name: "Test relay",
    baseUrl: "https://relay.example.test/v1",
    apiKey: "synthetic-test-key",
    runnableCapabilities: [],
    enabled: true,
    capabilities: ["text"],
    models: ["test-model"],
    textModels: ["test-model"],
    imageModels: [],
    videoModels: [],
    audioModels: [],
    proxyMode: "direct",
    proxyUrl: "",
    timeoutMs: 30_000,
    remark: "test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(publicRelay.apiKey, "");
  assert.equal(publicRelay.hasApiKey, true);
  assert.deepEqual(publicRelay.runnableCapabilities, []);
  assert.equal(JSON.stringify(publicRelay).includes("synthetic-test-key"), false);
});

test("saving a redacted relay preserves the existing server key", async () => {
  selectRows = [{
    id: "user-alice",
    relays_json: JSON.stringify([{
      id: "relay-1",
      name: "Test relay",
      baseUrl: "https://relay.example.test/v1",
      apiKey: "synthetic-server-key",
      enabled: true,
      capabilities: ["text"],
      models: ["test-model"],
      textModels: ["test-model"],
      imageModels: [],
      videoModels: [],
      audioModels: [],
      proxyMode: "direct",
      proxyUrl: "",
      timeoutMs: 30_000,
      remark: "test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }]),
    hidden_json: "[]",
    updated_at: "2026-01-01T00:00:00.000Z",
  }];
  await invokeWithVerifiedContext(saveRelayVault)({
    context: { userId: "user-alice" },
    data: {
      relays: [{
        id: "relay-1",
        name: "Test relay",
        baseUrl: "https://relay.example.test/v1",
        apiKey: "",
        hasApiKey: true,
        enabled: true,
        capabilities: ["text"],
        models: ["test-model"],
        textModels: ["test-model"],
        imageModels: [],
        videoModels: [],
        audioModels: [],
        proxyMode: "direct",
        proxyUrl: "",
        timeoutMs: 30_000,
        remark: "test",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      hiddenPresetIds: [],
    },
  });
  const write = queryCalls.find((call) => /insert into studio_relay_vault/iu.test(call.text));
  assert.ok(write);
  const persisted = JSON.parse(String(write.params[1])) as Array<{ apiKey?: string }>;
  assert.equal(persisted[0]?.apiKey, "synthetic-server-key");
});

test("env seed maps Civitai/Fal/Grok/OpenAI-compat without leaking empty templates", () => {
  process.env.CIVITAI_API_KEY = "synthetic-civitai";
  process.env.FAL_KEY = "synthetic-fal";
  process.env.GROK_RELAY_API_KEY = "synthetic-grok";
  process.env.GROK_RELAY_BASE_URL = "http://sub.example.test/v1";
  process.env.OPENAI_COMPAT_API_KEY = "synthetic-openai-compat";
  process.env.OPENAI_COMPAT_BASE_URL = "https://compat.example.test/v1";
  const seeds = envSeededRelays();
  delete process.env.CIVITAI_API_KEY;
  delete process.env.FAL_KEY;
  delete process.env.GROK_RELAY_API_KEY;
  delete process.env.GROK_RELAY_BASE_URL;
  delete process.env.OPENAI_COMPAT_API_KEY;
  delete process.env.OPENAI_COMPAT_BASE_URL;
  assert.deepEqual(seeds.map((item) => item.id), [
    "preset-grok-relay",
    "preset-civitai",
    "preset-fal",
    "preset-custom-compat",
  ]);
  assert.equal(seeds.find((item) => item.id === "preset-fal")?.authScheme, "Key");
  assert.equal(seeds.find((item) => item.id === "preset-grok-relay")?.baseUrl, "http://sub.example.test/v1");
});

test("seedRelayVaultFromEnv writes the auth-off vault row and preserves later redacted saves", async () => {
  process.env.CIVITAI_API_KEY = "synthetic-civitai-seed";
  process.env.FAL_KEY = "synthetic-fal-seed";
  selectRows = [];
  await seedRelayVaultFromEnv();
  delete process.env.CIVITAI_API_KEY;
  delete process.env.FAL_KEY;
  const write = queryCalls.find((call) => /insert into studio_relay_vault/iu.test(call.text));
  assert.ok(write);
  assert.equal(write.params[0], "dev-user");
  const persisted = JSON.parse(String(write.params[1])) as Array<{ id?: string; apiKey?: string; enabled?: boolean; authScheme?: string }>;
  const civitai = persisted.find((item) => item.id === "preset-civitai");
  const fal = persisted.find((item) => item.id === "preset-fal");
  assert.equal(civitai?.apiKey, "synthetic-civitai-seed");
  assert.equal(civitai?.enabled, true);
  assert.equal(fal?.apiKey, "synthetic-fal-seed");
  assert.equal(fal?.authScheme, "Key");
  assert.equal(JSON.stringify(persisted).includes("synthetic-civitai-seed"), true);
});

test("empty incoming keys keep the env-seeded server key even without hasApiKey", async () => {
  selectRows = [{
    id: "dev-user",
    relays_json: JSON.stringify([{
      id: "preset-civitai",
      name: "Civitai Orchestration",
      baseUrl: "https://orchestration.civitai.com/v2/consumer",
      apiKey: "synthetic-seeded-key",
      enabled: true,
      capabilities: ["image"],
      models: ["krea2-turbo"],
      textModels: [],
      imageModels: ["krea2-turbo"],
      videoModels: [],
      audioModels: [],
      proxyMode: "direct",
      proxyUrl: "",
      timeoutMs: 30_000,
      remark: "test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }]),
    hidden_json: "[]",
    updated_at: "2026-01-01T00:00:00.000Z",
  }];
  await invokeWithVerifiedContext(saveRelayVault)({
    context: { userId: "dev-user" },
    data: {
      relays: [{
        id: "preset-civitai",
        name: "Civitai Orchestration",
        baseUrl: "https://orchestration.civitai.com/v2/consumer",
        apiKey: "",
        enabled: true,
        capabilities: ["image"],
        models: ["krea2-turbo"],
        textModels: [],
        imageModels: ["krea2-turbo"],
        videoModels: [],
        audioModels: [],
        proxyMode: "direct",
        proxyUrl: "",
        timeoutMs: 30_000,
        remark: "test",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }],
      hiddenPresetIds: [],
    },
  });
  const write = queryCalls.find((call) => /insert into studio_relay_vault/iu.test(call.text));
  assert.ok(write);
  const persisted = JSON.parse(String(write.params[1])) as Array<{ apiKey?: string }>;
  assert.equal(persisted[0]?.apiKey, "synthetic-seeded-key");
});
