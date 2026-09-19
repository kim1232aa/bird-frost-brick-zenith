import test from "node:test";
import assert from "node:assert/strict";
import {
  translateLorasForProvider,
  type UniversalLoraItem,
} from "./universal-lora-adapter.ts";

test("translateLorasForProvider formats correctly for Fal.ai", () => {
  const loras: UniversalLoraItem[] = [
    { id: "12345", path: "https://civitai.com/api/download/models/12345", scale: 0.8 },
    { id: "flux-realism", path: "hf://user/flux-realism", scale: 1.0 },
  ];

  const result = translateLorasForProvider(loras, "fal");
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 2);
  assert.equal(result[0].path, "https://civitai.com/api/download/models/12345");
  assert.equal(result[0].scale, 0.8);
});

test("translateLorasForProvider refuses to turn a bare numeric id into a guessed Fal URL", () => {
  assert.throws(
    () => translateLorasForProvider([{ id: "12345", path: "", scale: 1 }], "fal"),
    /path|URL|identity/i,
  );
});

test("translateLorasForProvider formats Civitai as an AIR-to-strength map", () => {
  const loras: UniversalLoraItem[] = [
    { id: "12345", path: "urn:air:sdxl:lora:civitai:12345@67890", scale: 0.75 },
  ];

  const result = translateLorasForProvider(loras, "civitai");
  assert.deepEqual(result, { "urn:air:sdxl:lora:civitai:12345@67890": 0.75 });
});

test("translateLorasForProvider normalizes Qwen Image weights for ModelScope", () => {
  const loras: UniversalLoraItem[] = [
    { id: "lora1", path: "org/style-one", scale: 1.0 },
    { id: "lora2", path: "org/style-two", scale: 1.0 },
  ];

  const normalized = translateLorasForProvider(loras, "modelscope", { model: "Qwen/Qwen-Image" });
  assert.deepEqual(normalized, { "org/style-one": 0.5, "org/style-two": 0.5 });
});

test("translateLorasForProvider uses a single Qwen Image ModelScope path without inventing a wrapper", () => {
  const result = translateLorasForProvider(
    [{ id: "style", path: "org/style", scale: 1 }],
    "modelscope",
    { model: "Qwen/Qwen-Image-2512" },
  );
  assert.equal(result, "org/style");
});

test("translateLorasForProvider preserves a non-unit single ModelScope weight as a normalized map", () => {
  const result = translateLorasForProvider(
    [{ id: "style", path: "org/style", scale: 0.5 }],
    "modelscope",
    { model: "Qwen/Qwen-Image" },
  );
  assert.deepEqual(result, { "org/style": 1 });
});

test("translateLorasForProvider rejects unverified provider contracts", () => {
  assert.throws(
    () => translateLorasForProvider([{ id: "style", path: "org/style", scale: 1 }], "comfyui"),
    /没有已验证|unsupported|未验证/i,
  );
  assert.throws(
    () => translateLorasForProvider([{ id: "style", path: "org/style", scale: 1 }], "modelscope", { model: "Tongyi-MAI/Z-Image-Turbo" }),
    /Qwen Image|合同|model/i,
  );
});
