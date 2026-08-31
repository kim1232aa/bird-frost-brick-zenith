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

const { buildStudioVideoCreateInput, createStudioVideo, pollStudioVideo } = await import("./video.ts");
const { studioRelays } = await import("../wiring.ts");

function restoredKlingRelay() {
  const relay = studioRelays().find((item) => item.id === "preset-kling");
  assert.ok(relay);
  return { ...relay, apiKey: "synthetic-kling-key", enabled: true };
}

test("pure Studio video input assembly preserves all configured fields", () => {
  const input = buildStudioVideoCreateInput({
    adapterId: "openai-compat",
    model: "relay-video",
    prompt: "p",
    duration: 16,
    aspectRatio: "21:9",
    resolution: "2k",
    imageUrl: "https://example.test/first.png",
    lastFrameUrl: "https://example.test/last.png",
    imageUrls: ["https://example.test/ref.png"],
    width: 2048,
    height: 858,
    generateAudio: false,
    negativePrompt: "blur",
    fps: 48,
    seed: 9,
    steps: 33,
    guidance: 7.5,
    modelVariant: "relay-v2",
    watermark: false,
    promptExpansion: false,
    returnLastFrame: true,
    audioUrl: "https://example.test/audio.mp3",
    loras: { "urn:air:test:lora:1@1": 0.7 },
    frames: 121,
    audioMode: "origin",
    quantity: 3,
    mode: "professional",
    frameGuideStrength: 0.8,
    safetyChecker: false,
    shift: 5,
    turbo: true,
    sampler: "euler",
    scheduler: "simple",
    usePro: false,
  });
  assert.equal(input.resolution, "2k");
  assert.equal(input.aspectRatio, "21:9");
  assert.equal(input.width, 2048);
  assert.equal(input.height, 858);
  assert.equal(input.negativePrompt, "blur");
  assert.equal(input.seed, 9);
  assert.equal(input.steps, 33);
  assert.equal(input.guidance, 7.5);
  assert.equal(input.modelVariant, "relay-v2");
  assert.equal(input.watermark, false);
  assert.equal(input.promptExpansion, false);
  assert.equal(input.returnLastFrame, true);
  assert.equal(input.audioUrl, "https://example.test/audio.mp3");
  assert.equal(input.frames, 121);
  assert.equal(input.audioMode, "origin");
  assert.equal(input.quantity, 3);
  assert.equal(input.mode, "professional");
  assert.equal(input.frameGuideStrength, 0.8);
  assert.equal(input.safetyChecker, false);
  assert.equal(input.shift, 5);
  assert.equal(input.turbo, true);
  assert.equal(input.sampler, "euler");
  assert.equal(input.scheduler, "simple");
  assert.equal(input.usePro, false);
});

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
