import assert from "node:assert/strict";
import test from "node:test";

import {
  providerCredentialPool,
  reconcileProviderCredentialPool,
} from "./provider-credentials.ts";

test("provider credential pool keeps primary-first order and removes duplicate raw keys", () => {
  const pool = providerCredentialPool({
    apiKey: "synthetic-key-one",
    apiKeyId: "credential-one",
    apiKeys: ["synthetic-key-two", "synthetic-key-one"],
    apiKeyIds: ["credential-two", "duplicate-credential"],
  });

  assert.deepEqual(pool.keys, ["synthetic-key-one", "synthetic-key-two"]);
  assert.deepEqual(pool.ids, ["credential-one", "credential-two"]);
});

test("reconciling a pool retains existing opaque identities and creates one for a new raw slot", () => {
  const reconciled = reconcileProviderCredentialPool(
    ["synthetic-key-one", "synthetic-key-three"],
    {
      apiKey: "synthetic-key-one",
      apiKeyId: "credential-one",
      apiKeys: ["synthetic-key-two"],
      apiKeyIds: ["credential-two"],
    },
  );

  assert.equal(reconciled.apiKeyId, "credential-one");
  assert.deepEqual(reconciled.apiKeys, ["synthetic-key-three"]);
  assert.match(String(reconciled.apiKeyIds?.[0]), /^credential-/u);
  assert.notEqual(reconciled.apiKeyIds?.[0], "synthetic-key-three");
});

test("identity-only provider state exposes its ordered opaque ids without raw keys", async () => {
  const { orderedProviderCredentialIds } = await import("./provider-credentials.ts");
  const ids = orderedProviderCredentialIds({
    apiKeyId: "credential-one",
    apiKeyIds: ["credential-two", "credential-one"],
  });

  assert.deepEqual(ids, ["credential-one", "credential-two"]);
  assert.equal(JSON.stringify(ids).includes("synthetic-key"), false);
});
