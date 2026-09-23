import assert from "node:assert/strict";
import { register } from "node:module";
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

const { planModelScopeImageRequest } = await import("./modelscope.ts");

test("ModelScope Qwen Image sends a single unit-weight LoRA as the documented path string", () => {
  const planned = planModelScopeImageRequest({
    model: "Qwen/Qwen-Image",
    prompt: "a paper crane",
    loras: { "org/style-one": 1 },
  });
  assert.equal(planned.path, "/images/generations");
  assert.equal(planned.body.loras, "org/style-one");
});

test("ModelScope Qwen Image normalizes multiple LoRA weights to a map summing to one", () => {
  const planned = planModelScopeImageRequest({
    model: "Qwen/Qwen-Image-2512",
    prompt: "a paper crane",
    loras: { "org/style-one": 2, "org/style-two": 1 },
  });
  assert.deepEqual(planned.body.loras, { "org/style-one": 0.666667, "org/style-two": 0.333333 });
});

test("ModelScope preserves a non-unit single LoRA weight as a normalized map", () => {
  const planned = planModelScopeImageRequest({
    model: "Qwen/Qwen-Image",
    prompt: "a paper crane",
    loras: { "org/style-one": 0.5 },
  });
  assert.deepEqual(planned.body.loras, { "org/style-one": 1 });
});

test("ModelScope refuses LoRA fields for unverified non-Qwen image models", () => {
  assert.throws(
    () => planModelScopeImageRequest({
      model: "Tongyi-MAI/Z-Image-Turbo",
      prompt: "a paper crane",
      loras: { "org/style-one": 1 },
    }),
    /Qwen Image|合同|LoRA/i,
  );
});

test("ModelScope does not add a LoRA field when no LoRA was requested", () => {
  const planned = planModelScopeImageRequest({
    model: "Tongyi-MAI/Z-Image-Turbo",
    prompt: "a paper crane",
  });
  assert.equal("loras" in planned.body, false);
});

test("ModelScope image size preserves 4:3, 3:4, 3:2, 2:3 and does not collapse into 3 tiers", async () => {
  const { modelscopeImageSize } = await import("./modelscope.ts");
  assert.equal(modelscopeImageSize("", "4:3"), "1472x1140");
  assert.equal(modelscopeImageSize("", "3:4"), "1140x1472");
  assert.equal(modelscopeImageSize("", "3:2"), "1584x1056");
  assert.equal(modelscopeImageSize("", "2:3"), "1056x1584");
  assert.equal(modelscopeImageSize("1472x1140"), "1472x1140");
  assert.equal(modelscopeImageSize("1584x1056"), "1584x1056");
});
