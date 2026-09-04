import { register } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";

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
      try { return await nextResolve(target + suffix, context); } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

const {
  createCanvasVideoTaskProviderSnapshot,
  validateCanvasVideoTaskProviderSnapshot,
} = await import("./canvas-video-task-snapshot.ts");

const provider = {
  id: "relay-video-id-only",
  name: "Video relay",
  baseUrl: "https://relay.example.test/v1",
  apiKey: "synthetic-video-key-that-must-not-return",
  apiKeyId: "credential-video-one",
  apiKeys: [],
  apiKeyIds: [],
  adapterType: "openai-compatible",
  proxyMode: "direct" as const,
  proxyUrl: "",
  enabled: true,
  capabilities: ["video"] as const,
  models: ["video-model"],
  textModels: [],
  imageModels: [],
  videoModels: ["video-model"],
  audioModels: [],
  timeoutMs: 30_000,
  remark: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("video provider snapshot accepts an identity-only credential", () => {
  const result = createCanvasVideoTaskProviderSnapshot({
    provider: provider as never,
    model: "video-model",
    credentialId: "credential-video-one",
    operation: "text-to-video",
  });

  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(result.snapshot.credentialId, "credential-video-one");
});

test("video provider validation returns ready without exposing a browser key", () => {
  const created = createCanvasVideoTaskProviderSnapshot({
    provider: provider as never,
    model: "video-model",
    credentialId: "credential-video-one",
    operation: "text-to-video",
  });
  assert.equal(created.status, "ready");
  if (created.status !== "ready") return;

  const result = validateCanvasVideoTaskProviderSnapshot(
    created.snapshot,
    [provider as never],
    {
      providerId: "relay-video-id-only",
      model: "video-model",
      credentialId: "credential-video-one",
      capability: "video",
      operation: "text-to-video",
    },
  );

  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.provider.id, "relay-video-id-only");
    assert.equal(result.provider.apiKey, "");
    assert.equal(result.provider.apiKeys, undefined);
    assert.equal("apiKey" in result, false);
    assert.equal(JSON.stringify(result).includes("synthetic-video-key-that-must-not-return"), false);
  }
});
