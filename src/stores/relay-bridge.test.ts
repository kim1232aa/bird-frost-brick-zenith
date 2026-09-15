import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

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

const { mergeRelayProviderLists, publishRelayProviders, subscribeRelayProviders } = await import("./relay-bridge.ts");
const { ensureApiRelaySettings, createApiRelayProvider } = await import("./api-relay-config.ts");

function relay(id: string, patch: Record<string, unknown> = {}) {
    return createApiRelayProvider({
        id,
        name: id,
        baseUrl: "https://example.com/v1",
        capabilities: ["image"],
        imageModels: ["model-a"],
        enabled: false,
        ...patch,
    });
}

test("bridge union-merge adds incoming-only providers with credential marker, raw key stripped", () => {
    const base = [relay("preset-a")];
    const incoming = [relay("preset-b", { enabled: true, apiKey: "sk-secret-1234567890", hasApiKey: true })];
    const merged = mergeRelayProviderLists(base, incoming);
    assert.equal(merged.length, 2);
    const added = merged.find((item) => item.id === "preset-b");
    assert.ok(added);
    assert.equal(added.enabled, true);
    assert.equal(added.hasApiKey, true);
    assert.equal(added.apiKey, "");
    assert.equal(added.apiKeys, undefined);
});

test("bridge merge lets incoming win enabled/baseUrl but never leaks raw keys across", () => {
    const base = [relay("preset-a", { enabled: false, hasApiKey: false })];
    const incoming = [relay("preset-a", { enabled: true, apiKey: "sk-secret-1234567890" })];
    const merged = mergeRelayProviderLists(base, incoming);
    assert.equal(merged[0].enabled, true);
    assert.equal(merged[0].hasApiKey, true);
    assert.equal(merged[0].apiKey, "");
});

test("bridge merge preserves a pending raw key already in base and never deletes base-only entries", () => {
    const base = [
        relay("preset-a", { apiKey: "sk-pending-1234567890" }),
        relay("preset-c"),
    ];
    const incoming = [relay("preset-a", { enabled: true, hasApiKey: true })];
    const merged = mergeRelayProviderLists(base, incoming);
    assert.equal(merged.length, 2);
    const kept = merged.find((item) => item.id === "preset-a");
    assert.equal(kept.apiKey, "sk-pending-1234567890");
    assert.equal(kept.enabled, true);
    assert.ok(merged.find((item) => item.id === "preset-c"));
});

test("bridge publish notifies listeners once and the re-entrancy guard blocks loops", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeRelayProviders((relays, source) => {
        seen.push(`${source}:${relays.length}`);
        // Simulate a listener that reacts by publishing back — must be ignored.
        publishRelayProviders([relay("preset-loop")], source === "session" ? "config" : "session");
    });
    publishRelayProviders([relay("preset-a")], "session");
    publishRelayProviders([relay("preset-a"), relay("preset-b")], "config");
    unsubscribe();
    assert.deepEqual(seen, ["session:1", "config:2"]);
});

function runnableRelay(id: string, model: string) {
    return relay(id, {
        enabled: true,
        hasApiKey: true,
        imageModels: [model],
        videoModels: [],
        textModels: [],
        audioModels: [],
    });
}

test("ensureRouting auto-binds the first runnable provider instead of returning an empty route", () => {
    const config = ensureApiRelaySettings({
        channelMode: "local",
        apiRelays: [relay("preset-off"), runnableRelay("preset-on", "model-a")],
        apiRouting: { image: { source: "relay", providerId: "", model: "" } },
    });
    assert.equal(config.apiRouting.image.providerId, "preset-on");
    assert.equal(config.apiRouting.image.model, "model-a");
});

test("ensureRouting keeps an empty route only when nothing runnable exists", () => {
    const config = ensureApiRelaySettings({
        channelMode: "local",
        apiRelays: [relay("preset-off")],
        apiRouting: { image: { source: "relay", providerId: "", model: "" } },
    });
    assert.equal(config.apiRouting.image.providerId, "");
});

test("ensureRouting rebinds away from a disabled provider carrying the same model", () => {
    const config = ensureApiRelaySettings({
        channelMode: "local",
        apiRelays: [
            relay("preset-dead", { imageModels: ["model-a"] }),
            runnableRelay("preset-live", "model-a"),
        ],
        apiRouting: { image: { source: "relay", providerId: "preset-dead", model: "model-a" } },
    });
    assert.equal(config.apiRouting.image.providerId, "preset-live");
    assert.equal(config.apiRouting.image.model, "model-a");
});

test("ensureRouting fills a runnable provider's missing model from its own list", () => {
    const config = ensureApiRelaySettings({
        channelMode: "local",
        apiRelays: [runnableRelay("preset-on", "model-a")],
        apiRouting: { image: { source: "relay", providerId: "preset-on", model: "" } },
    });
    assert.equal(config.apiRouting.image.model, "model-a");
});
