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

const { shotImageRefs, storyImageReferenceMax } = await import("./director-helpers.ts");

const grokRelay = {
  adapterType: "xai-imagine",
  baseUrl: "https://relay.example.test/v1",
};

const cast = [
  { id: "hero", name: "林晚", look: "短发", importance: "main" as const, url: "https://example.test/hero.jpg" },
  { id: "suspect", name: "黑衣男子", look: "黑衣", importance: "supporting" as const, url: "https://example.test/suspect.jpg" },
];

const shots = [
  { id: "shot-1", index: 0, title: "码头", prompt: "雨夜码头", camera: "35mm", scene: "码头", characters: ["hero"], appearingCharacterIds: ["hero"], url: "https://example.test/shot-1.jpg" },
  { id: "shot-2", index: 1, title: "巷口", prompt: "巷口冲突", camera: "50mm", scene: "巷口", characters: ["hero", "suspect"], appearingCharacterIds: ["hero", "suspect"], url: "https://example.test/shot-2.jpg" },
  { id: "shot-3", index: 2, title: "收束", prompt: "回到码头", camera: "24mm", scene: "码头", characters: ["hero", "suspect"], appearingCharacterIds: ["hero", "suspect"] },
];

test("story director uses the selected image edit capability cap and preserves current-shot identities first", () => {
  assert.equal(typeof storyImageReferenceMax, "function");
  if (!storyImageReferenceMax) return;
  const max = storyImageReferenceMax("grok-imagine-image-quality", grokRelay);
  assert.equal(max, 3);
  assert.deepEqual(
    shotImageRefs(cast, shots, 2, max),
    ["https://example.test/hero.jpg", "https://example.test/suspect.jpg", "https://example.test/shot-1.jpg"],
  );
});
