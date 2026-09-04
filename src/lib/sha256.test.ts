import assert from "node:assert/strict";
import test from "node:test";
import { sha256BytesHex, sha256Hex } from "./sha256.mjs";

const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

test("sha256Hex matches WebCrypto for abc", async () => {
  assert.equal(await sha256Hex("abc"), SHA256_ABC);
});

test("sha256Hex fallback matches SHA-256 when subtle is missing", async () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: original.getRandomValues.bind(original) },
  });
  try {
    assert.equal(globalThis.crypto?.subtle, undefined);
    assert.equal(await sha256Hex("abc"), SHA256_ABC);
    assert.equal(await sha256Hex("abc"), await sha256Hex("abc"));
    assert.notEqual(await sha256Hex("abd"), SHA256_ABC);
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: original });
  }
});

test("sha256BytesHex fallback hashes blob bytes when subtle is missing", async () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: original.getRandomValues.bind(original) },
  });
  try {
    const bytes = new TextEncoder().encode("abc");
    assert.equal(await sha256BytesHex(bytes), SHA256_ABC);
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: original });
  }
});
