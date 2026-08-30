import { readFileSync } from "node:fs";
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
      try {
        return await nextResolve(target + suffix, context);
      } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

const { STUDIO_PROVIDERS, STUDIO_ROUTES, studioRelays } = await import("./wiring.ts");
const { providerCanRunCapability } = await import("../stores/api-relay-config-provider.ts");
const { resolveCapabilityRoute } = await import("../stores/api-relay-config-routing.ts");
const { mergeRelaySources } = await import("./relay-merge.ts");

type StudioProvider = (typeof STUDIO_PROVIDERS)[number];

function providerById(id: string): StudioProvider {
  const provider = STUDIO_PROVIDERS.find((item) => item.id === id);
  assert.ok(provider, `missing provider ${id}`);
  return provider;
}

test("Agnes, Civitai, and OpenAI presets retain their runnable model pools", () => {
  const agnes = providerById("preset-agnes-ai");
  assert.ok(agnes.capabilities.includes("text"));
  assert.ok(agnes.capabilities.includes("image"));
  assert.ok(agnes.capabilities.includes("video"));
  assert.deepEqual(agnes.models, [...agnes.textModels, ...agnes.imageModels, ...agnes.videoModels]);

  const civitai = providerById("preset-civitai");
  assert.ok(civitai.capabilities.includes("image"));
  assert.ok(civitai.capabilities.includes("video"));
  assert.deepEqual(civitai.models, [...civitai.imageModels, ...civitai.videoModels]);
  assert.equal(civitai.endpoints.images, "/workflows");
  assert.equal(civitai.endpoints.videosCreate, "/workflows");
  assert.equal(civitai.endpoints.videosPoll, "/workflows/{id}");

  const openai = studioRelays().find((item) => item.id === "preset-openai");
  assert.ok(openai, "missing OpenAI relay");
  assert.equal(openai.protocol, "openai-official");
});

test("Token Plan, Agent Plan, and DashScope retain their supported model entries", () => {
  const tokenPlan = providerById("preset-aliyun-tokenplan");
  assert.ok(tokenPlan.imageModels.includes("qwen-image-2.0-pro"));
  assert.ok(tokenPlan.videoModels.includes("happyhorse-1.1-t2v"));
  assert.ok(tokenPlan.audioModels.includes("qwen-audio-3.0-tts-plus"));
  assert.match(tokenPlan.remark, /音频|TTS/);
  assert.deepEqual(STUDIO_ROUTES.audio, { providerId: "preset-aliyun-tokenplan", model: "qwen-audio-3.0-tts-plus" });
  assert.deepEqual(STUDIO_ROUTES.image, { providerId: "preset-grok-relay", model: "grok-imagine-image" });
  assert.deepEqual(STUDIO_ROUTES.video, { providerId: "preset-grok-relay", model: "grok-imagine-video" });
  assert.equal(tokenPlan.endpoints.audio, "/api/v1/services/audio/tts/SpeechSynthesizer");
  assert.equal(tokenPlan.endpoints.videosCreate, "/api/v1/services/aigc/video-generation/video-synthesis");
  assert.equal(tokenPlan.endpoints.videosPoll, "/api/v1/tasks/{id}");

  const ark = providerById("preset-volcengine-plan");
  assert.ok(ark.models.includes("doubao-seedream-5.0"));
  assert.ok(ark.imageModels.includes("doubao-seedream-5.0"));

  const dashscope = providerById("preset-aliyun-dashscope");
  assert.ok(dashscope.videoModels.includes("happyhorse-1.1-t2v"));
});

test("Fal preset retains its video pool while showing that video is not wired", () => {
  const fal = providerById("preset-fal");
  assert.ok(fal.capabilities.includes("video"));
  assert.ok(fal.imageModels.includes("flux-2-pro"));
  assert.deepEqual(fal.videoModels, ["kling-3-pro", "kling-3-turbo", "hailuo-2.3", "veo-3.1", "wan-pro", "minimax-h3"]);
  assert.ok(fal.models.includes("kling-3-pro"));
  assert.equal(fal.endpoints.videosCreate, "/fal-ai/kling-video/v3/pro/text-to-video");
  assert.match(`${fal.name} ${fal.remark}`, /视频.*未接线|未接线.*视频/);
});

test("Fal keeps Authorization Key through preset, vault, and browser relay merges", () => {
  const template = studioRelays().find((item) => item.id === "preset-fal");
  assert.ok(template, "missing Fal relay");
  assert.equal(template.authScheme, "Key");

  const redactedVaultRelay = { ...template, apiKey: "", apiKeys: undefined, hasApiKey: true, authScheme: undefined };
  const fromVault = mergeRelaySources([redactedVaultRelay], []).find((item) => item.id === template.id);
  assert.equal(fromVault?.authScheme, "Key");

  const fromBrowser = mergeRelaySources([redactedVaultRelay], [{ ...redactedVaultRelay }]).find((item) => item.id === template.id);
  assert.equal(fromBrowser?.authScheme, "Key");
});

test("Kling and MiniMax retain video entries but stay explicitly unconnected", () => {
  const expected = {
    "preset-kling": ["kling-v3", "kling-v3-omni"],
    "preset-minimax": ["MiniMax-Hailuo-2.3", "MiniMax-Hailuo-02"],
  } as const;
  for (const [id, models] of Object.entries(expected)) {
    const provider = providerById(id);
    assert.equal(provider.enabled, false);
    assert.ok(provider.capabilities.includes("video"));
    assert.deepEqual(provider.videoModels, models);
    assert.deepEqual(provider.models, models);
    assert.match(`${provider.name} ${provider.remark}`, /未接线|未核实|专用 adapter|不可生成/);
  }
});

test("explicit runnable capabilities survive key restore without enabling unsupported video", () => {
  const expected = {
    "preset-fal": { runnableCapabilities: ["image"], image: true, video: false },
    "preset-kling": { runnableCapabilities: [], image: false, video: false },
    "preset-minimax": { runnableCapabilities: [], image: false, video: false },
  } as const;
  for (const [id, wanted] of Object.entries(expected)) {
    const template = providerById(id);
    assert.deepEqual(template.runnableCapabilities, wanted.runnableCapabilities);
    const relay = studioRelays().find((item) => item.id === id);
    assert.ok(relay);
    const restored = { ...relay, apiKey: "synthetic-provider-key", enabled: true };
    assert.equal(providerCanRunCapability(restored, "image"), wanted.image);
    assert.equal(providerCanRunCapability(restored, "video"), wanted.video);
  }

  const falRelay = studioRelays().find((item) => item.id === "preset-fal");
  assert.deepEqual(falRelay?.runnableCapabilities, ["image"]);
});

test("configured routes cannot dispatch a gated video capability", () => {
  const template = providerById("preset-kling");
  const provider = studioRelays().find((item) => item.id === template.id);
  assert.ok(provider);
  const restored = { ...provider, apiKey: "synthetic-kling-key", enabled: true };
  assert.throws(
    () => resolveCapabilityRoute({
      apiRelays: [restored],
      apiRouting: { video: { source: "relay", providerId: restored.id, model: "kling-v3" } },
    }, "video"),
    /未接线|不可运行|不支持视频/u,
  );
});

test("providers without an explicit runnable capability list keep legacy behavior", () => {
  const custom = providerById("preset-custom-compat");
  assert.equal(custom.runnableCapabilities, undefined);
  const customRelay = studioRelays().find((item) => item.id === custom.id);
  assert.ok(customRelay);
  assert.equal(providerCanRunCapability({ ...customRelay, apiKey: "synthetic-custom-key", enabled: true }, "video"), true);
});

test("shared wiring never reads or embeds provider secrets", () => {
  const source = readFileSync(new URL("./wiring.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /import\.meta\.env/u);
  assert.doesNotMatch(source, /\bVITE_[A-Z0-9_]*(?:KEY|TOKEN)\b/u);
  assert.doesNotMatch(source, /\breadEnvKey\b/u);
  for (const provider of STUDIO_PROVIDERS) {
    assert.equal(provider.apiKey, "", `${provider.id} must not carry a credential`);
    assert.equal(provider.enabled, false, `${provider.id} must not be env-enabled in shared wiring`);
  }
});
