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

mock.module(new URL("./server/relay-vault.ts", import.meta.url).href, {
  namedExports: {
    loadRelayVault: async () => ({ relays: [], hiddenPresetIds: [], updatedAt: "" }),
    saveRelayVault: async () => ({ ok: true }),
  },
});

const { vaultSnapshot } = await import("./session.ts");

test("vault snapshots never persist raw keys in the browser snapshot", () => {
  const snapshot = JSON.parse(vaultSnapshot({
    hiddenPresetIds: [],
    relays: [{
      id: "relay-1",
      name: "Test relay",
      baseUrl: "https://relay.example.test/v1",
      apiKey: "synthetic-browser-key",
      apiKeys: ["synthetic-pool-key"],
      hasApiKey: true,
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
    }],
  })) as {
    relays: Array<{
      apiKey: string;
      apiKeys?: string[];
      hasApiKey?: boolean;
      pendingKey?: boolean;
    }>;
  };
  assert.equal(snapshot.relays[0]?.apiKey, "");
  assert.equal(snapshot.relays[0]?.apiKeys, undefined);
  assert.equal(snapshot.relays[0]?.hasApiKey, true);
  assert.equal(snapshot.relays[0]?.pendingKey, true);
  assert.equal(JSON.stringify(snapshot).includes("synthetic-browser-key"), false);
  assert.equal(JSON.stringify(snapshot).includes("synthetic-pool-key"), false);
});

test("vault snapshots retain hasApiKey for redacted relays", () => {
  const snapshot = JSON.parse(vaultSnapshot({
    hiddenPresetIds: [],
    relays: [{
      id: "relay-1",
      name: "Test relay",
      baseUrl: "https://relay.example.test/v1",
      apiKey: "",
      hasApiKey: true,
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
    }],
  })) as { relays: Array<{ apiKey: string; hasApiKey?: boolean; runnableCapabilities?: string[] }> };
  assert.equal(snapshot.relays[0]?.apiKey, "");
  assert.equal(snapshot.relays[0]?.hasApiKey, true);
  assert.deepEqual(snapshot.relays[0]?.runnableCapabilities, []);
});
