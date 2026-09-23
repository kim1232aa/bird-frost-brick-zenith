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

const { getStudioAdapter, resolveAdapterId, listStudioAdapters } = await import("./index.ts");

test("listStudioAdapters lists all registered official adapters", () => {
  const adapters = listStudioAdapters();
  const ids = adapters.map((a) => a.id);
  assert.ok(ids.includes("openai-compat"));
  assert.ok(ids.includes("xai-imagine"));
  assert.ok(ids.includes("ark-plan"));
  assert.ok(ids.includes("civitai"));
  assert.ok(ids.includes("agnes"));
  assert.ok(ids.includes("dashscope"));
  assert.ok(ids.includes("fal"));
  assert.ok(ids.includes("sensenova"));
  assert.ok(ids.includes("modelscope"));
  assert.ok(ids.includes("huggingface"));
});

test("getStudioAdapter throws on unknown adapter id without silently falling back to openai-compat", () => {
  assert.throws(
    () => getStudioAdapter("unknown-adapter-id"),
    /未知的 Studio 适配器.*未注册.*禁止静默回退/u,
  );
  assert.throws(
    () => getStudioAdapter("some-random-provider"),
    /未知的 Studio 适配器.*未注册.*禁止静默回退/u,
  );
  assert.equal(getStudioAdapter("openai-compat").id, "openai-compat");
  assert.equal(getStudioAdapter("fal").id, "fal");
});

test("resolveAdapterId maps explicit adapter/adapterType correctly", () => {
  assert.equal(resolveAdapterId({ adapterType: "civitai" }), "civitai");
  assert.equal(resolveAdapterId({ adapterType: "fal" }), "fal");
  assert.equal(resolveAdapterId({ adapterType: "ark-plan" }), "ark-plan");
  assert.equal(resolveAdapterId({ adapterType: "dashscope" }), "dashscope");
  assert.equal(resolveAdapterId({ adapterType: "sensenova" }), "sensenova");
  assert.equal(resolveAdapterId({ adapterType: "openai-compat" }), "openai-compat");
  assert.equal(resolveAdapterId({ adapter: "hf" }), "huggingface");
});

test("resolveAdapterId throws on unknown or missing adapterType instead of guessing by model/host regex", () => {
  // 未配置 adapterType 时，即便 model 叫 grok-imagine 或 seedream，也不盲猜
  assert.throws(
    () => resolveAdapterId({ model: "grok-imagine-image", baseUrl: "https://api.x.ai/v1" }),
    /缺少明确的 adapterType 配置，禁止通过模型名或域名正则隐式猜测适配器/u,
  );
  assert.throws(
    () => resolveAdapterId({ model: "doubao-seedream-4.5", baseUrl: "https://ark.cn-beijing.volces.com" }),
    /缺少明确的 adapterType 配置，禁止通过模型名或域名正则隐式猜测适配器/u,
  );
  // 未知 adapterType 明确报错
  assert.throws(
    () => resolveAdapterId({ adapterType: "non-existent-type" }),
    /未知的适配器类型 "non-existent-type"，未在注册表中注册/u,
  );
});
