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

const { buildCivitaiImageWorkflow } = await import("./civitai-orchestration.ts");

type ImageService = Parameters<typeof buildCivitaiImageWorkflow>[0]["service"];

function service(
  id: string,
  parameters: Record<string, string>,
  input: readonly string[] = ["text"],
): NonNullable<ImageService> {
  return {
    id,
    step: "imageGen",
    parameters,
    modalities: { input, output: ["image"] },
    status: "available",
  };
}

function inputOf(workflow: ReturnType<typeof buildCivitaiImageWorkflow>) {
  return workflow.steps[0].input as Record<string, unknown>;
}

const DEV_LORA = "urn:air:flux2:lora:civitai:2169780@2443422";
const WAN_LORA = "urn:air:wan:lora:civitai:123456@789012";

 test("Flux 2 Dev serializes logical LoRA map as the official air/strength array", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/flux2/dev/createImage",
      service: service("image/flux2/dev/createImage", { engine: "flux2", model: "dev", operation: "createImage" }),
      prompt: "p",
      quantity: 1,
      loras: { [DEV_LORA]: 0.8 },
    }),
  );

  assert.deepEqual(input.loras, [{ air: DEV_LORA, strength: 0.8 }]);
  assert.deepEqual(Object.keys((input.loras as Array<Record<string, unknown>>)[0]), ["air", "strength"]);
});

test("WAN image generation serializes LoRAs as the shared official air/strength array", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/wan/v2.7/fal/createImage",
      service: service("image/wan/v2.7/fal/createImage", {
        engine: "wan",
        version: "v2.7",
        provider: "fal",
        operation: "createImage",
      }),
      prompt: "p",
      quantity: 1,
      loras: { [WAN_LORA]: 1.2 },
    }),
  );

  assert.deepEqual(input.loras, [{ air: WAN_LORA, strength: 1.2 }]);
});

test("image LoRA array rejects strength outside the live 0..4 ImageGenInputLora range", () => {
  assert.throws(
    () =>
      buildCivitaiImageWorkflow({
        model: "image/flux2/dev/createImage",
        service: service("image/flux2/dev/createImage", { engine: "flux2", model: "dev", operation: "createImage" }),
        prompt: "p",
        quantity: 1,
        loras: { [DEV_LORA]: 4.1 },
      }),
    /strength|0.*4/,
  );
});

test("Krea FAL createImage maps connected references to imageStyleReferences and never images", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/fal/krea2/createImage",
      service: service("image/fal/krea2/createImage", { engine: "fal", model: "krea2", operation: "createImage" }),
      prompt: "p",
      quantity: 1,
      images: ["https://example.test/style.png"],
    }),
  );

  assert.deepEqual(input.imageStyleReferences, [{ imageUrl: "https://example.test/style.png" }]);
  assert.equal("images" in input, false);
});

test("Krea FAL createImage includes its required empty style-reference array", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/fal/krea2/createImage",
      service: service("image/fal/krea2/createImage", { engine: "fal", model: "krea2", operation: "createImage" }),
      prompt: "p",
      quantity: 1,
    }),
  );

  assert.deepEqual(input.imageStyleReferences, []);
  assert.equal("images" in input, false);
});

test("Krea FAL style references keep the official imageUrl/strength shape and range", () => {
  const options = {
    model: "image/fal/krea2/createImage",
    service: service("image/fal/krea2/createImage", { engine: "fal", model: "krea2", operation: "createImage" }),
    prompt: "p",
    quantity: 1,
    imageStyleReferences: [{ imageUrl: "https://example.test/style.png", strength: -2 }],
  };
  const input = inputOf(buildCivitaiImageWorkflow(options));

  assert.deepEqual(input.imageStyleReferences, options.imageStyleReferences);
  assert.throws(
    () => buildCivitaiImageWorkflow({ ...options, imageStyleReferences: [{ imageUrl: "https://example.test/style.png", strength: 2.1 }] }),
    /strength|\-2.*2/,
  );
});

test("Comfy Krea edit keeps images[] and does not leak FAL style references or denoiseStrength", () => {
  const input = inputOf(
    buildCivitaiImageWorkflow({
      model: "image/comfy/krea2/editImage",
      service: service(
        "image/comfy/krea2/editImage",
        { engine: "comfy", ecosystem: "krea2", model: "edit", operation: "editImage" },
        ["text", "image"],
      ),
      prompt: "p",
      quantity: 1,
      images: ["https://example.test/source.png"],
      strength: 0.7,
    }),
  );

  assert.equal(input.engine, "comfy");
  assert.equal(input.ecosystem, "krea2");
  assert.equal(input.model, "edit");
  assert.equal(input.operation, "editImage");
  assert.deepEqual(input.images, ["https://example.test/source.png"]);
  assert.equal("imageStyleReferences" in input, false);
  assert.equal("denoiseStrength" in input, false);
});
