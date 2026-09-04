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

mock.module(new URL("../../../lib/config-state-storage.ts", import.meta.url).href, {
  namedExports: {
    recoverableConfigStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
    flushRecoverableConfig: async () => undefined,
  },
});
mock.module(new URL("../../../studio/server/relay-vault.ts", import.meta.url).href, {
  namedExports: {
    loadRelayVault: async () => ({ relays: [], hiddenPresetIds: [], updatedAt: "", imageHost: null }),
    loadImageHostCredential: async () => null,
    saveImageHostCredential: async () => ({ ok: true, baseUrl: "", hasApiKey: false }),
    saveRelayVault: async () => ({ ok: true }),
  },
});

const { ensureApiRelaySettings, providerModelsForCapability } = await import("@/stores/api-relay-config");
const { defaultConfig } = await import("@/stores/use-config-store");
const { resolveCanvasGenerationModelSelection } = await import("./canvas-generation-model.ts");

function grokVideoConfig() {
  const config = ensureApiRelaySettings({ ...defaultConfig, channelMode: "local" });
  const relay = config.apiRelays.find((provider) =>
    providerModelsForCapability(provider, "image").includes("grok-imagine-image") &&
    providerModelsForCapability(provider, "video").includes("grok-imagine-video"),
  );
  assert.ok(relay, "test requires one relay exposing the Grok image and video models");
  return {
    ...config,
    apiRouting: {
      ...config.apiRouting,
      image: { source: "relay" as const, providerId: relay.id, model: "grok-imagine-image" },
      video: { source: "relay" as const, providerId: relay.id, model: "grok-imagine-video" },
    },
  };
}

test("mode switch falls back to the video route instead of reusing the image model", () => {
  const config = grokVideoConfig();

  const state = resolveCanvasGenerationModelSelection(config, undefined, "video");

  assert.deepEqual(state.selection, {
    providerId: config.apiRouting.video?.providerId,
    model: "grok-imagine-video",
  });
});

test("an explicitly classified stale image model is not reused as the selected video model", () => {
  const config = grokVideoConfig();

  const state = resolveCanvasGenerationModelSelection(
    config,
    {
      model: "grok-imagine-image",
      modelProviderId: config.apiRouting.image?.providerId,
    },
    "video",
  );

  assert.deepEqual(state.selection, {
    providerId: config.apiRouting.video?.providerId,
    model: "grok-imagine-video",
  });
  assert.equal(state.legacyModel, "");
});
