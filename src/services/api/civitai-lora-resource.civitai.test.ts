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

const {
  assertCivitaiLoraCompatibility,
  createCivitaiLoraResolver,
  parseCivitaiLoraAir,
  resolveCivitaiLoraCompatibilityTarget,
} = await import("./civitai-lora-resource.ts");

/** Live GET /api/v1/model-versions/{id}.air samples (public, 2026-08-30). */
const LIVE = {
  flux2Dev: "urn:air:flux2:lora:civitai:2169780@2443422",
  flux2Klein4b: "urn:air:flux2:lora:civitai:2233658@2666766",
  flux2Klein9b: "urn:air:flux2:lora:civitai:2462105@2846977",
  flux2Klein4bBase: "urn:air:flux2:lora:civitai:1939453@2771678",
  flux2Klein9bBase: "urn:air:flux2:lora:civitai:1939453@2863285",
  zImageTurbo: "urn:air:zimageturbo:lora:civitai:2268008@2617751",
  zImageBase: "urn:air:zimagebase:lora:civitai:2186776@3042980",
  anima: "urn:air:anima:lora:civitai:929497@2961717",
  ernie: "urn:air:ernie:lora:civitai:1155749@2865961",
  qwen: "urn:air:qwen:lora:civitai:1939453@2585269",
  sdxlPony: "urn:air:sdxl:lora:civitai:264290@1558543",
  sdxlIllustrious: "urn:air:sdxl:lora:civitai:943607@1056404",
  sdxlNoob: "urn:air:sdxl:lora:civitai:987736@1209350",
  sdxlLightning: "urn:air:sdxl:lora:civitai:441533@491779",
  sdxlHyper: "urn:air:sdxl:lora:civitai:428790@477721",
  flux1D: "urn:air:flux1:lora:civitai:599757@2228091",
  flux1S: "urn:air:flux1:lora:civitai:715862@2257626",
  krea2: "urn:air:krea2:lora:civitai:2775340@3275645",
  hidream: "urn:air:hidream:lora:civitai:1132089@1734377",
  hidreamO1: "urn:air:hidream-o1:lora:civitai:2647859@2973135",
  wanImage27: "urn:air:wanimage27:lora:civitai:2757859@3103382",
} as const;

const DEV_AIR = LIVE.flux2Dev;
const WAN_AIR = "urn:air:wan:lora:civitai:123456@789012";

function mustParse(air: string) {
  const parsed = parseCivitaiLoraAir(air);
  assert.ok(parsed, `expected complete LoRA AIR: ${air}`);
  assert.equal(parsed.air, air);
  return parsed;
}

test("array LoRA services accept complete AIR without guessing an ecosystem/base model", () => {
  const dev = parseCivitaiLoraAir(DEV_AIR);
  const wan = parseCivitaiLoraAir(WAN_AIR);
  const wanImage = parseCivitaiLoraAir(LIVE.wanImage27);
  assert.ok(dev);
  assert.ok(wan);
  assert.ok(wanImage);
  assert.doesNotThrow(() => assertCivitaiLoraCompatibility(dev, "image/flux2/dev/createImage"));
  assert.doesNotThrow(() => assertCivitaiLoraCompatibility(dev, "image/sdcpp/flux2Dev/createVariant"));
  assert.doesNotThrow(() => assertCivitaiLoraCompatibility(wan, "image/wan/v2.7/fal/createImage"));
  assert.doesNotThrow(() => assertCivitaiLoraCompatibility(wanImage, "image/wan/v2.7/fal/createImage"));
});

test("map LoRA services keep strict ecosystem compatibility checks", () => {
  const flux = parseCivitaiLoraAir("urn:air:flux2:lora:civitai:2169780@2443422");
  assert.ok(flux);
  assert.throws(
    () => assertCivitaiLoraCompatibility(flux, "image/sdcpp/anima/createImage"),
    /不兼容|需要|anima/,
  );
});

test("official site-API AIR ecosystems map to the matching imageGen service", () => {
  const cases: Array<[air: string, service: string, ecosystem: string, baseModel: string]> = [
    [LIVE.zImageTurbo, "image/sdcpp/zImage/turbo/createImage", "zimageturbo", "ZImageTurbo"],
    [LIVE.zImageBase, "image/sdcpp/zImage/base/createImage", "zimagebase", "ZImageBase"],
    [LIVE.anima, "image/sdcpp/anima/createImage", "anima", "Anima"],
    [LIVE.ernie, "image/comfy/ernie/ernie/createImage", "ernie", "Ernie"],
    [LIVE.qwen, "image/sdcpp/qwen/20b/createImage", "qwen", "Qwen"],
    [LIVE.sdxlPony, "image/sdcpp/sdxl/createImage", "sdxl", "Pony"],
    [LIVE.sdxlIllustrious, "image/comfy/sdxl/createImage", "sdxl", "Illustrious"],
    [LIVE.sdxlNoob, "image/sdcpp/sdxl/createImage", "sdxl", "NoobAI"],
    [LIVE.sdxlLightning, "image/sdcpp/sdxl/createImage", "sdxl", "SDXL Lightning"],
    [LIVE.sdxlHyper, "image/sdcpp/sdxl/createImage", "sdxl", "SDXL Hyper"],
    [LIVE.flux2Klein4b, "image/flux2/klein/createImage/4b", "flux2", "Flux.2 Klein 4B"],
    [LIVE.flux2Klein9b, "image/flux2/klein/createImage/9b", "flux2", "Flux.2 Klein 9B"],
    [LIVE.flux2Klein4bBase, "image/flux2/klein/createImage/4b-base", "flux2", "Flux.2 Klein 4B-base"],
    [LIVE.flux2Klein9bBase, "image/sdcpp/flux2Klein/createVariant/9b", "flux2", "Flux.2 Klein 9B-base"],
    [LIVE.flux1D, "image/comfy/flux1/createImage", "flux1", "Flux.1 D"],
    [LIVE.flux1S, "image/comfy/flux1/createVariant", "flux1", "Flux.1 S"],
    [LIVE.krea2, "image/comfy/krea2/turbo/createImage", "krea2", "Krea 2"],
    [LIVE.hidream, "image/comfy/hidream/createImage", "hidream", "HiDream"],
    [LIVE.hidreamO1, "image/comfy/hidream-o1/HiDream-O1-Image-dev/editImage", "hidream-o1", "HiDream-O1"],
  ];

  for (const [air, service, ecosystem, baseModel] of cases) {
    const parsed = mustParse(air);
    assert.equal(parsed.ecosystem, ecosystem, air);
    const target = resolveCivitaiLoraCompatibilityTarget(service);
    assert.ok(target, `missing compatibility target for ${service}`);
    assert.doesNotThrow(() => assertCivitaiLoraCompatibility({ ...parsed, baseModel }, service), `${air} vs ${service}`);
  }
});

test("recipe zImage ecosystem is not a live Turbo or Base LoRA AIR", () => {
  const recipe = mustParse("urn:air:zImage:lora:civitai:123456@789012");
  assert.equal(recipe.ecosystem, "zimage");
  assert.throws(
    () => assertCivitaiLoraCompatibility(recipe, "image/sdcpp/zImage/turbo/createImage"),
    /zimageturbo|不兼容/,
  );
  assert.throws(
    () => assertCivitaiLoraCompatibility(recipe, "image/sdcpp/zImage/base/createImage"),
    /zimagebase|不兼容/,
  );
});

test("Z-Image Turbo and Base LoRAs are not interchangeable", () => {
  const turbo = { ...mustParse(LIVE.zImageTurbo), baseModel: "ZImageTurbo" };
  const base = { ...mustParse(LIVE.zImageBase), baseModel: "ZImageBase" };
  assert.throws(() => assertCivitaiLoraCompatibility(turbo, "image/sdcpp/zImage/base/createImage"), /ZImageTurbo|zimagebase|不兼容/);
  assert.throws(() => assertCivitaiLoraCompatibility(base, "image/sdcpp/zImage/turbo/createImage"), /ZImageBase|zimageturbo|不兼容/);
});

test("HiDream and HiDream-O1 keep distinct official AIR ecosystems", () => {
  const hidream = { ...mustParse(LIVE.hidream), baseModel: "HiDream" };
  const o1 = { ...mustParse(LIVE.hidreamO1), baseModel: "HiDream-O1" };
  assert.equal(resolveCivitaiLoraCompatibilityTarget("image/comfy/hidream-o1/HiDream-O1-Image-dev/editImage")?.ecosystems[0], "hidream-o1");
  assert.equal(resolveCivitaiLoraCompatibilityTarget("image/comfy/hidream/createImage")?.ecosystems[0], "hidream");
  assert.throws(() => assertCivitaiLoraCompatibility(hidream, "image/comfy/hidream-o1/HiDream-O1-Image-dev/editImage"), /hidream-o1|不兼容/);
  assert.throws(() => assertCivitaiLoraCompatibility(o1, "image/comfy/hidream/createImage"), /HiDream-O1|不兼容/);
});

test("FAL Krea and Qwen API image services stay outside the map LoRA allow-list", () => {
  assert.equal(resolveCivitaiLoraCompatibilityTarget("image/fal/krea2/createImage"), undefined);
  assert.equal(resolveCivitaiLoraCompatibilityTarget("image/qwen/createImage/3.0-pro"), undefined);
  assert.equal(resolveCivitaiLoraCompatibilityTarget("image/flux1-kontext/pro"), undefined);
  const krea = mustParse(LIVE.krea2);
  assert.throws(() => assertCivitaiLoraCompatibility(krea, "image/fal/krea2/createImage"), /不接受 LoRA|array \{air,strength\}/);
});

test("parseCivitaiLoraAir keeps the official air string including optional file pin", () => {
  const pinned = "urn:air:sdxl:lora:civitai:264290@1558543+2402203";
  const parsed = mustParse(pinned);
  assert.equal(parsed.air, pinned);
  assert.equal(parsed.modelId, "264290");
  assert.equal(parsed.modelVersionId, "1558543");
  // Shorthand without urn: prefix is accepted per the official OpenAPI pattern
  // and normalized to the canonical urn:air: form.
  assert.equal(parseCivitaiLoraAir("air:sdxl:lora:civitai:264290@1558543")?.air, "urn:air:sdxl:lora:civitai:264290@1558543");
  assert.equal(parseCivitaiLoraAir("https://civitai.com/api/download/models/1558543"), undefined);
  assert.equal(parseCivitaiLoraAir("264290@1558543"), undefined);
});

test("resolver reads model-version air verbatim and never synthesizes an AIR", async () => {
  const officialAir = LIVE.zImageTurbo;
  const requests: string[] = [];
  const resolver = createCivitaiLoraResolver({
    request: async (path) => {
      requests.push(path);
      if (path === "/model-versions/2617751") {
        return {
          id: 2617751,
          modelId: 2268008,
          name: "v1",
          baseModel: "ZImageTurbo",
          baseModelType: "Standard",
          air: officialAir,
          model: { name: "Realistic Snapshot", type: "LORA" },
        };
      }
      throw new Error(`unexpected path ${path}`);
    },
  });

  const resolved = await resolver.resolve({
    kind: "version-id",
    value: "2617751",
    targetModel: "image/sdcpp/zImage/turbo/createImage",
  });
  assert.equal(resolved.status, "resolved");
  if (resolved.status !== "resolved") return;
  assert.equal(resolved.resource.air, officialAir);
  assert.equal(resolved.resource.ecosystem, "zimageturbo");
  assert.equal(resolved.resource.baseModel, "ZImageTurbo");
  assert.deepEqual(requests, ["/model-versions/2617751"]);
});

test("resolver refuses to invent AIR when model-version omits air", async () => {
  const resolver = createCivitaiLoraResolver({
    request: async () => ({
      id: 2617751,
      modelId: 2268008,
      baseModel: "ZImageTurbo",
      model: { type: "LORA" },
    }),
  });
  await assert.rejects(
    () => resolver.resolve({ kind: "version-id", value: "2617751", targetModel: "image/sdcpp/zImage/turbo/createImage" }),
    /不会自行拼接|未返回有效的完整 LoRA AIR/,
  );
});

test("model-id with multiple versions requires an explicit version choice", async () => {
  const resolver = createCivitaiLoraResolver({
    request: async (path) => {
      if (path === "/models/2186776") {
        return {
          id: 2186776,
          name: "Z-Image-Art",
          type: "LORA",
          modelVersions: [
            { id: 3042980, name: "base", baseModel: "ZImageBase" },
            { id: 2543201, name: "turbo", baseModel: "ZImageTurbo" },
          ],
        };
      }
      throw new Error(`unexpected path ${path}`);
    },
  });
  const resolution = await resolver.resolve({
    kind: "model-id",
    value: "2186776",
    targetModel: "image/sdcpp/zImage/base/createImage",
  });
  assert.equal(resolution.status, "version-selection-required");
  if (resolution.status !== "version-selection-required") return;
  assert.equal(resolution.modelId, "2186776");
  assert.equal(resolution.versions[0]?.compatible, true);
  assert.equal(resolution.versions[1]?.compatible, false);
});

test("resolver rejects download URLs and non-LoRA versions", async () => {
  const resolver = createCivitaiLoraResolver({
    request: async () => ({
      id: 2514310,
      modelId: 827184,
      air: "urn:air:sdxl:checkpoint:civitai:827184@2514310",
      model: { type: "Checkpoint" },
    }),
  });
  await assert.rejects(
    () => resolver.resolve({
      kind: "air",
      value: "https://civitai.com/api/download/models/1558543",
      targetModel: "image/sdcpp/sdxl/createImage",
    }),
    /下载 URL/,
  );
  await assert.rejects(
    () => resolver.resolve({
      kind: "version-id",
      value: "2514310",
      targetModel: "image/sdcpp/sdxl/createImage",
    }),
    /不是 LoRA/,
  );
});

test("resolver never presents a direct URL as a Civitai AIR", async () => {
  const resolver = createCivitaiLoraResolver({
    request: async () => {
      throw new Error("direct URLs must not trigger a Civitai lookup");
    },
  });
  await assert.rejects(
    () => resolver.resolve({
      kind: "url",
      value: "https://example.test/style.safetensors",
      targetModel: "image/sdcpp/sdxl/createImage",
    }),
    /Civitai.*AIR|下载 URL|直链.*Fal/i,
  );
});
