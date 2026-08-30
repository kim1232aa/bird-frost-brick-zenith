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

const { assertCivitaiLoraCompatibility, parseCivitaiLoraAir } = await import("./civitai-lora-resource.ts");

const DEV_AIR = "urn:air:flux2:lora:civitai:2169780@2443422";
const WAN_AIR = "urn:air:wan:lora:civitai:123456@789012";

 test("array LoRA services accept complete AIR without guessing an ecosystem/base model", () => {
  const dev = parseCivitaiLoraAir(DEV_AIR);
  const wan = parseCivitaiLoraAir(WAN_AIR);
  assert.ok(dev);
  assert.ok(wan);
  assert.doesNotThrow(() => assertCivitaiLoraCompatibility(dev, "image/flux2/dev/createImage"));
  assert.doesNotThrow(() => assertCivitaiLoraCompatibility(wan, "image/wan/v2.7/fal/createImage"));
});

test("map LoRA services keep strict ecosystem compatibility checks", () => {
  const flux = parseCivitaiLoraAir("urn:air:flux2:lora:civitai:2169780@2443422");
  assert.ok(flux);
  assert.throws(
    () => assertCivitaiLoraCompatibility(flux, "image/sdcpp/anima/createImage"),
    /不兼容|需要|anima/,
  );
});
