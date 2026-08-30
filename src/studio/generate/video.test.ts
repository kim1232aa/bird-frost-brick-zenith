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

mock.module(new URL("../server/relay-vault.ts", import.meta.url).href, {
  namedExports: {
    loadRelayVault: async () => ({ relays: [], hiddenPresetIds: [], updatedAt: "" }),
    saveRelayVault: async () => ({ ok: true }),
  },
});

const { createStudioVideo, pollStudioVideo } = await import("./video.ts");
const { studioRelays } = await import("../wiring.ts");

function restoredKlingRelay() {
  const relay = studioRelays().find((item) => item.id === "preset-kling");
  assert.ok(relay);
  return { ...relay, apiKey: "synthetic-kling-key", enabled: true };
}

test("video generation refuses an explicitly unconnected provider before adapter dispatch", async () => {
  const relay = restoredKlingRelay();
  await assert.rejects(
    () => createStudioVideo({
      relays: [relay],
      prompt: "synthetic test prompt",
      providerId: relay.id,
      model: "kling-v3",
    }),
    /视频能力尚未接线|未接线|阻止发送/u,
  );
});

test("video polling refuses an explicitly unconnected provider before adapter dispatch", async () => {
  const relay = restoredKlingRelay();
  await assert.rejects(
    () => pollStudioVideo({ relays: [relay], providerId: relay.id, taskId: "task-1", model: "kling-v3" }),
    /视频能力尚未接线|未接线|阻止发送/u,
  );
});
