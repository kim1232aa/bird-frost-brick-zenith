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
  snapshotSubmittedNativeImageTask,
  restoreNativeImageTaskCredential,
} = await import("./native-image-task.ts");

const browserSecret = "sk-native-image-browser-secret";

const route = {
  mode: "local",
  capability: "image",
  model: "qwen-image",
  timeoutMs: 30_000,
  provider: {
    id: "relay-image-id-only",
    name: "Image relay",
    baseUrl: "https://relay.example.test/v1",
    apiKey: browserSecret,
    apiKeyId: "credential-image-one",
    apiKeys: [],
    apiKeyIds: [],
    adapterType: "dashscope",
    proxyMode: "direct",
    proxyUrl: "",
    enabled: true,
    capabilities: ["image"],
    models: ["qwen-image"],
    textModels: [],
    imageModels: ["qwen-image"],
    videoModels: [],
    audioModels: [],
    timeoutMs: 30_000,
    remark: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
} as const;

test("native image snapshot accepts an explicit credential identity without persisting a legacy raw key", () => {
  const legacySubmitted = {
    provider: "dashscope",
    taskId: "task-image-1",
    apiKey: browserSecret,
    credentialId: "credential-image-one",
    startedAt: "2026-01-01T00:00:00.000Z",
    expectedOutputs: 1,
  } as const;
  const snapshot = snapshotSubmittedNativeImageTask(
    route as unknown as Parameters<typeof snapshotSubmittedNativeImageTask>[0],
    legacySubmitted,
    { operation: "generate", capabilityId: "dashscope-qwen-single-generate", resultPolicy: "exact-count" },
  );

  assert.equal(snapshot.credentialId, "credential-image-one");
  assert.equal(JSON.stringify(snapshot).includes(browserSecret), false);
  assert.equal(JSON.stringify(snapshot).includes("apiKey"), false);
});

test("native image snapshot rejects raw-key fallback when the submitted identity is missing", () => {
  const legacySubmitted = {
    provider: "dashscope",
    taskId: "task-image-without-id",
    apiKey: browserSecret,
    startedAt: "2026-01-01T00:00:00.000Z",
    expectedOutputs: 1,
  } as const;

  assert.throws(
    () => snapshotSubmittedNativeImageTask(
      route as unknown as Parameters<typeof snapshotSubmittedNativeImageTask>[0],
      legacySubmitted as Parameters<typeof snapshotSubmittedNativeImageTask>[1],
      { operation: "generate", capabilityId: "dashscope-qwen-single-generate", resultPolicy: "exact-count" },
    ),
    /没有稳定槽位 ID/,
  );
});

test("native image restore returns identity-only readiness without a browser key", () => {
  const snapshot = {
    schemaVersion: 1,
    taskId: "task-image-1",
    provider: "dashscope",
    providerId: "relay-image-id-only",
    providerRevision: "2026-01-01T00:00:00.000Z",
    adapterType: "dashscope",
    credentialId: "credential-image-one",
    model: "qwen-image",
    operation: "generate",
    capabilityId: "dashscope-qwen-single-generate",
    expectedOutputs: 1,
    resultPolicy: "exact-count",
    startedAt: "2026-01-01T00:00:00.000Z",
  } as const;

  const restored = restoreNativeImageTaskCredential(
    snapshot,
    route as unknown as Parameters<typeof restoreNativeImageTaskCredential>[1],
  );

  assert.deepEqual(restored, {
    status: "ready",
    credentialId: "credential-image-one",
  });
  assert.equal(JSON.stringify(restored).includes(browserSecret), false);
  assert.equal("apiKey" in restored, false);
});
