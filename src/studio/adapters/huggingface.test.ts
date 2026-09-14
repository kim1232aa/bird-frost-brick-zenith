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

const { huggingfaceImageSize } = await import("./huggingface.ts");

test("huggingfaceImageSize passes explicit dimensions through", () => {
  assert.equal(huggingfaceImageSize("1024x1024"), "1024x1024");
  assert.equal(huggingfaceImageSize("768x1344"), "768x1344");
});

test("huggingfaceImageSize maps tiers to pixel squares", () => {
  assert.equal(huggingfaceImageSize("1K"), "1024x1024");
  assert.equal(huggingfaceImageSize("2K"), "2048x2048");
});

test("huggingfaceImageSize maps aspect ratios at 1K base", () => {
  assert.equal(huggingfaceImageSize("", "16:9"), "1344x768");
  assert.equal(huggingfaceImageSize(undefined, "9:16"), "768x1344");
  assert.equal(huggingfaceImageSize("", "1:1"), "1024x1024");
});

test("huggingfaceImageSize scales aspect ratio by tier long side", () => {
  const mapped = huggingfaceImageSize("2K", "16:9");
  assert.ok(mapped);
  const [w, h] = mapped.split("x").map(Number);
  assert.ok(Math.max(w, h) <= 2048 + 16, `long side ${Math.max(w, h)} should stay near 2048`);
  assert.ok(Math.abs(w / h - 16 / 9) < 0.05, `ratio ${w / h} should stay near 16:9`);
});

test("huggingfaceImageSize returns undefined for empty input without ratio", () => {
  assert.equal(huggingfaceImageSize("", ""), undefined);
  assert.equal(huggingfaceImageSize(undefined, undefined), undefined);
});
