import assert from "node:assert/strict";
import test from "node:test";
import { createId } from "./create-id.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("createId returns a UUID even when crypto.randomUUID is missing", () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: original.getRandomValues.bind(original) },
  });
  try {
    assert.equal(typeof globalThis.crypto?.randomUUID, "undefined");
    const id = createId();
    assert.match(id, UUID_RE);
    assert.notEqual(createId(), id);
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: original });
  }
});

test("createId uses crypto.randomUUID when present", () => {
  const id = createId();
  assert.match(id, UUID_RE);
});
