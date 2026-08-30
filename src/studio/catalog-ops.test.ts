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

const { cardsFromRelays } = await import("./catalog.ts");
const { liveCard, liveCatalog } = await import("./ops.ts");
const { studioRelays } = await import("./wiring.ts");
const { useStudioSession } = await import("./session.ts");

test("catalog and live ops treat a redacted hasApiKey relay as wired", () => {
  const template = studioRelays().find((item) => item.id === "preset-modelscope");
  assert.ok(template);
  const relay = { ...template, apiKey: "", apiKeys: undefined, hasApiKey: true, enabled: true };
  const card = cardsFromRelays([relay]).find((item) => item.model === "Qwen/Qwen-Image");
  assert.ok(card);
  assert.equal(card.wired, true);

  useStudioSession.setState({ relays: [relay] });
  assert.equal(liveCard(card).wired, true);
});

test("catalog lists explicitly unconnected video but generation catalog excludes it after key restore", () => {
  const template = studioRelays().find((item) => item.id === "preset-kling");
  assert.ok(template);
  const relay = { ...template, apiKey: "synthetic-kling-key", enabled: true };
  const listedCard = cardsFromRelays([relay]).find((item) => item.model === "kling-v3");
  assert.ok(listedCard);
  assert.equal(listedCard.wired, false);
  assert.ok(listedCard.tags.includes("未接线"));

  useStudioSession.setState({ relays: [relay] });
  assert.equal(liveCard(listedCard).wired, false);
  assert.ok(liveCatalog("video", false).some((item) => item.model === "kling-v3"));
  assert.equal(liveCatalog("video", true).some((item) => item.model === "kling-v3"), false);
});
