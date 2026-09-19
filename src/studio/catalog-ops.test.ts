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
const { liveCard, liveCatalog, selectableCatalog } = await import("./ops.ts");
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

test("local mock credits never block a wired generation when the ledger is empty", async () => {
  const { MEMBERSHIP_IS_LOCAL_MOCK } = await import("./membership.ts");
  const { studioGenerateCreditGate, useOpsStore } = await import("./ops.ts");
  assert.equal(MEMBERSHIP_IS_LOCAL_MOCK, true);
  useOpsStore.setState({ credits: { text: 0, image: 0, video: 0 } });
  assert.equal(studioGenerateCreditGate("video", 5), "");
  const ticket = useOpsStore.getState().spend("video", "ltx2.3", 5);
  assert.equal(ticket.ok, true);
  assert.equal(ticket.delta, 0);
  assert.equal(useOpsStore.getState().credits.video, 0);
});

test("catalog falls back to template models when the live relays have no models for a capability", () => {
  const textOnlyRelay = studioRelays().find((item) => item.id === "preset-hansyai");
  assert.ok(textOnlyRelay);
  const previousRelays = useStudioSession.getState().relays;
  useStudioSession.setState({ relays: [textOnlyRelay] });
  try {
    const imageCards = liveCatalog("image", false);
    assert.ok(imageCards.some((item) => item.model === "Qwen/Qwen-Image"));
    assert.ok(imageCards.every((item) => !item.wired));
  } finally {
    useStudioSession.setState({ relays: previousRelays });
  }
});

test("selectable catalog keeps an unwired template pool when no provider can run the capability", () => {
  const textOnlyRelay = studioRelays().find((item) => item.id === "preset-hansyai");
  assert.ok(textOnlyRelay);
  const previousRelays = useStudioSession.getState().relays;
  useStudioSession.setState({ relays: [textOnlyRelay] });
  try {
    const imageCards = selectableCatalog("image");
    assert.ok(imageCards.some((item) => item.model === "grok-imagine-image"));
    assert.ok(imageCards.every((item) => !item.wired));
  } finally {
    useStudioSession.setState({ relays: previousRelays });
  }
});

test("template fallback never marks a model wired when its relay omits that capability model", () => {
  const template = studioRelays().find((item) => item.id === "preset-modelscope");
  assert.ok(template);
  const relay = {
    ...template,
    apiKey: "synthetic-modelscope-key",
    enabled: true,
    models: [],
    imageModels: [],
  };
  const previousRelays = useStudioSession.getState().relays;
  useStudioSession.setState({ relays: [relay] });
  try {
    assert.equal(liveCatalog("image", true).some((item) => item.providerId === relay.id), false);
    assert.equal(liveCatalog("image", false).find((item) => item.providerId === relay.id)?.wired, false);
  } finally {
    useStudioSession.setState({ relays: previousRelays });
  }
});
