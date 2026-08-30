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

const { mergeRelaySources } = await import("./relay-merge.ts");
const { studioRelays } = await import("./wiring.ts");

test("merging a redacted managed relay retains its hasApiKey marker", () => {
  const template = studioRelays().find((item) => item.id === "preset-modelscope");
  assert.ok(template);
  const remote = { ...template, apiKey: "", hasApiKey: true, enabled: true };
  const merged = mergeRelaySources([remote], []);
  const relay = merged.find((item) => item.id === template.id) as typeof remote | undefined;
  assert.ok(relay);
  assert.equal(relay.apiKey, "");
  assert.equal(relay.hasApiKey, true);
  assert.equal(relay.enabled, true);
});

test("server vault redacted keys win over an empty local browser copy", () => {
  const template = studioRelays().find((item) => item.id === "preset-civitai");
  assert.ok(template);
  const local = { ...template, apiKey: "", hasApiKey: false, enabled: false };
  const remote = { ...template, apiKey: "", hasApiKey: true, enabled: true };
  const merged = mergeRelaySources([local], [remote]);
  const relay = merged.find((item) => item.id === template.id);
  assert.ok(relay);
  assert.equal(relay.hasApiKey, true);
  assert.equal(relay.enabled, true);
});

test("merging Token Plan preserves explicit media models and profiles", () => {
  const template = studioRelays().find((item) => item.id === "preset-aliyun-tokenplan");
  assert.ok(template);
  const remote = {
    ...template,
    apiKey: "",
    hasApiKey: true,
    models: ["qwen-image-2.0", "happyhorse-1.1-t2v", "qwen-audio-3.0-tts-plus"],
    textModels: [],
    imageModels: ["qwen-image-2.0"],
    videoModels: ["happyhorse-1.1-t2v"],
    audioModels: ["qwen-audio-3.0-tts-plus"],
    imageCapabilityProfiles: { "qwen-image-2.0": { generate: "dashscope-qwen-multi-generate" as const } },
    videoCapabilityProfiles: { "happyhorse-1.1-t2v": "dashscope-t2v" as const },
  };
  const merged = mergeRelaySources([remote], []);
  const relay = merged.find((item) => item.id === template.id);
  assert.ok(relay);
  assert.ok(relay.imageModels.includes("qwen-image-2.0"));
  assert.ok(relay.videoModels.includes("happyhorse-1.1-t2v"));
  assert.ok(relay.audioModels.includes("qwen-audio-3.0-tts-plus"));
  assert.ok(relay.models.includes("qwen-audio-3.0-tts-plus"));
  assert.deepEqual(relay.imageCapabilityProfiles?.["qwen-image-2.0"], { generate: "dashscope-qwen-multi-generate" });
  assert.equal(relay.videoCapabilityProfiles?.["happyhorse-1.1-t2v"], "dashscope-t2v");
  assert.equal(relay.hasApiKey, true);
});

test("merging a later relay source retains its explicit runnable capability gate", () => {
  const template = studioRelays().find((item) => item.id === "preset-kling");
  assert.ok(template);
  const first = { ...template, id: "custom-gated-relay" };
  const later = { ...first, runnableCapabilities: ["image" as const] };
  const merged = mergeRelaySources([first], [later]);
  const relay = merged.find((item) => item.id === first.id);
  assert.ok(relay);
  assert.deepEqual(relay.runnableCapabilities, ["image"]);
});
