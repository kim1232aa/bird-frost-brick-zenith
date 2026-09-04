import { register } from "node:module";
import assert from "node:assert/strict";
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

const { buildLocalRelayProxyHeaders, rotateRelayCredentialId, resolveRelayCredentialId } = await import("./relay-proxy.ts");

test("ordinary relay proxy headers send only the vault lookup id, not caller base URL", () => {
  const headers = buildLocalRelayProxyHeaders({
    id: "preset-grok-relay",
    baseUrl: "http://sub.example.test/v1",
    apiKey: "",
    authScheme: "Bearer",
  });
  assert.equal(headers["x-boundless-relay-id"], "preset-grok-relay");
  assert.equal(new Headers(headers).get("x-local-relay-base-url"), null);
});

test("relay proxy headers never send a client key when provider.id is set", () => {
  const headers = buildLocalRelayProxyHeaders({
    id: "preset-grok-relay",
    baseUrl: "http://sub.example.test/v1",
    apiKey: "sk-should-not-leave-browser",
    apiKeys: ["sk-pool-should-not-leave-browser"],
    authScheme: "Bearer",
  });
  assert.equal(headers["x-boundless-relay-id"], "preset-grok-relay");
  assert.equal("Authorization" in headers, false);
  assert.equal("x-api-key" in headers, false);
  assert.equal(JSON.stringify(headers).includes("sk-should-not-leave-browser"), false);
});

test("ordinary relay proxy headers reject a missing stable provider.id before sending a client key", () => {
  assert.throws(
    () =>
      buildLocalRelayProxyHeaders({
        baseUrl: "http://sub.example.test/v1",
        apiKey: "caller-key",
        authScheme: "Bearer",
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /relay-id|中转 ID/i);
      assert.doesNotMatch(error.message, /caller-key/);
      return true;
    },
  );
});

test("built-in xAI remains server-keyed without provider.id or browser Authorization", () => {
  const headers = buildLocalRelayProxyHeaders({
    baseUrl: "https://api.x.ai/v1",
    apiKey: "caller-key",
    authScheme: "Bearer",
  });
  assert.equal(new Headers(headers).get("x-boundless-builtin"), "xai");
  assert.equal("x-boundless-relay-id" in headers, false);
  assert.equal("Authorization" in headers, false);
  assert.equal("x-api-key" in headers, false);
  assert.equal(JSON.stringify(headers).includes("caller-key"), false);
});

test("ordinary relay proxy headers accept an opaque credential id without sending raw keys", () => {
  const headers = buildLocalRelayProxyHeaders(
    {
      id: "relay-with-pool",
      baseUrl: "https://relay.example.test/v1",
      apiKey: "synthetic-header-key-one",
      apiKeyId: "credential-header-one",
      apiKeys: ["synthetic-header-key-two"],
      apiKeyIds: ["credential-header-two"],
      authScheme: "Bearer",
    },
    "application/json",
    undefined,
    "credential-header-two",
  );

  assert.equal(headers["x-boundless-relay-credential-id"], "credential-header-two");
  assert.equal(JSON.stringify(headers).includes("synthetic-header-key-one"), false);
  assert.equal(JSON.stringify(headers).includes("synthetic-header-key-two"), false);
  assert.equal("Authorization" in headers, false);
  assert.equal("x-api-key" in headers, false);
});

test("legacy raw override resolves to its opaque identity and is never placed in headers", () => {
  const rawMarker = "synthetic-override-key-two";
  const headers = buildLocalRelayProxyHeaders(
    {
      id: "relay-override",
      baseUrl: "https://relay.example.test/v1",
      apiKey: "synthetic-override-key-one",
      apiKeyId: "credential-override-one",
      apiKeys: [rawMarker],
      apiKeyIds: ["credential-override-two"],
      authScheme: "Bearer",
    },
    undefined,
    rawMarker,
  );

  assert.equal(headers["x-boundless-relay-credential-id"], "credential-override-two");
  assert.equal(JSON.stringify(headers).includes(rawMarker), false);
  assert.equal("Authorization" in headers, false);
});

test("redacted providers rotate opaque credential identities in stable order", () => {
  const provider = {
    id: "relay-redacted-rotation",
    baseUrl: "https://relay.example.test/v1",
    apiKey: "",
    apiKeyId: "credential-rotation-one",
    apiKeys: [],
    apiKeyIds: ["credential-rotation-two"],
    hasApiKey: true,
  };

  assert.deepEqual(
    [rotateRelayCredentialId(provider), rotateRelayCredentialId(provider), rotateRelayCredentialId(provider)],
    ["credential-rotation-one", "credential-rotation-two", "credential-rotation-one"],
  );
  assert.equal(resolveRelayCredentialId(provider, "credential-rotation-two"), "credential-rotation-two");
});
