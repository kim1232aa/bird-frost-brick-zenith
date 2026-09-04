import assert from "node:assert/strict";
import test from "node:test";
import { createSeedance2PromptRewriteFingerprint } from "./seedance2-prompt-rewrite.mjs";

// Fingerprint hashes JSON.stringify("abc") === `"abc"`, not raw abc bytes.
const FINGERPRINT_ABC = "6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25";
const HEX64 = /^[0-9a-f]{64}$/;

test("fingerprint still returns SHA-256 hex when crypto.subtle is missing", async () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: original.getRandomValues.bind(original) },
  });
  try {
    assert.equal(globalThis.crypto?.subtle, undefined);
    const first = await createSeedance2PromptRewriteFingerprint("abc");
    const second = await createSeedance2PromptRewriteFingerprint("abc");
    const other = await createSeedance2PromptRewriteFingerprint("abd");
    assert.match(first, HEX64);
    assert.equal(first, second);
    assert.equal(first, FINGERPRINT_ABC);
    assert.notEqual(other, first);
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: original });
  }
});

test("fingerprint uses WebCrypto SHA-256 when subtle exists", async () => {
  const digest = await createSeedance2PromptRewriteFingerprint("abc");
  assert.equal(digest, FINGERPRINT_ABC);
});
