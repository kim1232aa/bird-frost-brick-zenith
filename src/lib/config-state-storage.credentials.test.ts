import { register } from "node:module";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

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

const localValues = new Map<string, string>();
const indexedValues = new Map<string, string>();
const nativeValues = new Map<string, string>();
let desktopRequired = false;

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: { protocol: "https:", hostname: "studio.example.test" },
    localStorage: {
      getItem: (key: string) => localValues.get(key) ?? null,
      setItem: (key: string, value: string) => { localValues.set(key, value); },
      removeItem: (key: string) => { localValues.delete(key); },
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  },
});

mock.module("localforage", {
  defaultExport: {
    getItem: async (key: string) => indexedValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      indexedValues.set(key, value);
      return value;
    },
    removeItem: async (key: string) => { indexedValues.delete(key); },
  },
});

mock.module(new URL("../services/desktop-storage.ts", import.meta.url).href, {
  namedExports: {
    getDesktopState: async (key: string) => nativeValues.get(key) ?? null,
    setDesktopState: async (key: string, value: string) => { nativeValues.set(key, value); },
    removeDesktopState: async (key: string) => { nativeValues.delete(key); },
  },
});

mock.module(new URL("./localforage-storage.ts", import.meta.url).href, {
  namedExports: {
    getStrictLocalForageItem: async (key: string) => indexedValues.get(key) ?? localValues.get(key) ?? null,
    isDesktopStateStorageRequired: () => desktopRequired,
  },
});

const { CONFIG_RECOVERY_SUFFIX, flushRecoverableConfig, recoverableConfigStorage } = await import("./config-state-storage.ts");
const { browserSafeConfigEnvelope } = await import("./config-secret-redaction.ts");

const STORE_NAME = "test:config-store";
const RECOVERY_NAME = `${STORE_NAME}${CONFIG_RECOVERY_SUFFIX}`;
const RELAY_SECRET = "synthetic-recovery-relay-secret";
const POOLED_SECRET = "synthetic-recovery-pool-secret";
const GLOBAL_SECRET = "synthetic-recovery-global-secret";
const IMAGE_HOST_SECRET = "synthetic-recovery-image-host-secret";
const WEBDAV_SECRET = "synthetic-recovery-webdav-secret";
const PROXY_URL = "http://proxy.example.test:8080";

function rawRecoveryEnvelope() {
  return JSON.stringify({
    state: {
      config: {
        apiKey: GLOBAL_SECRET,
        imageHostApiKey: IMAGE_HOST_SECRET,
        apiRelays: [{
          id: "test-recovery-relay",
          name: "Visible recovery relay",
          baseUrl: "https://relay.example.test/v1",
          models: ["text-model"],
          capabilities: ["text"],
          apiKey: RELAY_SECRET,
          apiKeys: [POOLED_SECRET],
          hasApiKey: false,
          proxyMode: "custom",
          proxyUrl: PROXY_URL,
        }],
      },
      webdav: { password: WEBDAV_SECRET },
    },
    version: 0,
  });
}

test("browser-safe redaction keeps ordered opaque credential identities while removing raw keys", () => {
  const parsed = JSON.parse(rawRecoveryEnvelope()) as { state: { config: { apiRelays: Array<Record<string, unknown>> } } };
  parsed.state.config.apiRelays[0] = {
    ...parsed.state.config.apiRelays[0],
    apiKeyId: "credential-recovery-one",
    apiKeyIds: ["credential-recovery-two"],
  };

  const safe = browserSafeConfigEnvelope(JSON.stringify(parsed));
  const safeParsed = JSON.parse(safe) as { state: { config: { apiRelays: Array<Record<string, unknown>> } } };
  const relay = safeParsed.state.config.apiRelays[0];
  assert.equal(relay.apiKey, "");
  assert.equal(relay.apiKeys, undefined);
  assert.equal(relay.apiKeyId, "credential-recovery-one");
  assert.deepEqual(relay.apiKeyIds, ["credential-recovery-two"]);
  assert.equal(relay.hasApiKey, true);
  assert.equal(safe.includes(RELAY_SECRET), false);
  assert.equal(safe.includes(POOLED_SECRET), false);
});

test("legacy raw browser recovery is redacted before restore and replaced in every browser copy", async () => {
  localValues.clear();
  indexedValues.clear();
  nativeValues.clear();
  const raw = rawRecoveryEnvelope();
  localValues.set(RECOVERY_NAME, raw);
  indexedValues.set(RECOVERY_NAME, raw);

  const restored = await recoverableConfigStorage.getItem(STORE_NAME);

  assert.ok(restored);
  for (const secret of [RELAY_SECRET, POOLED_SECRET, GLOBAL_SECRET, IMAGE_HOST_SECRET, WEBDAV_SECRET]) {
    assert.equal(restored.includes(secret), false, `restored state must not contain ${secret}`);
  }
  const parsed = JSON.parse(restored) as {
    state: { config: { apiRelays: Array<{ id?: string; name?: string; baseUrl?: string; models?: string[]; capabilities?: string[]; apiKey: string; apiKeys?: string[]; hasApiKey?: boolean; proxyMode?: string; proxyUrl?: string }> } };
  };
  assert.equal(parsed.state.config.apiRelays[0]?.id, "test-recovery-relay");
  assert.equal(parsed.state.config.apiRelays[0]?.name, "Visible recovery relay");
  assert.equal(parsed.state.config.apiRelays[0]?.baseUrl, "https://relay.example.test/v1");
  assert.deepEqual(parsed.state.config.apiRelays[0]?.models, ["text-model"]);
  assert.deepEqual(parsed.state.config.apiRelays[0]?.capabilities, ["text"]);
  assert.equal(parsed.state.config.apiRelays[0]?.apiKey, "");
  assert.equal(parsed.state.config.apiRelays[0]?.apiKeys, undefined);
  assert.equal(parsed.state.config.apiRelays[0]?.hasApiKey, true);
  assert.equal(parsed.state.config.apiRelays[0]?.proxyMode, "direct");
  assert.equal(parsed.state.config.apiRelays[0]?.proxyUrl, "");

  for (const key of [STORE_NAME, RECOVERY_NAME]) {
    const localCopy = localValues.get(key);
    const indexedCopy = indexedValues.get(key);
    assert.ok(localCopy, `${key} localStorage copy must be replaced`);
    assert.ok(indexedCopy, `${key} IndexedDB copy must be replaced`);
    for (const secret of [RELAY_SECRET, POOLED_SECRET, GLOBAL_SECRET, IMAGE_HOST_SECRET, WEBDAV_SECRET]) {
      assert.equal(localCopy.includes(secret), false);
      assert.equal(indexedCopy.includes(secret), false);
    }
  }
});

test("native raw config is redacted before hydration without overwriting the native credential copy", async () => {
  localValues.clear();
  indexedValues.clear();
  nativeValues.clear();
  const raw = rawRecoveryEnvelope();
  nativeValues.set(STORE_NAME, raw);
  localValues.set(STORE_NAME, raw);
  indexedValues.set(STORE_NAME, raw);
  localValues.set(RECOVERY_NAME, raw);
  indexedValues.set(RECOVERY_NAME, raw);

  const restored = await recoverableConfigStorage.getItem(STORE_NAME);

  assert.ok(restored);
  for (const secret of [RELAY_SECRET, POOLED_SECRET, GLOBAL_SECRET, IMAGE_HOST_SECRET, WEBDAV_SECRET]) {
    assert.equal(restored.includes(secret), false, `hydrated state must not contain ${secret}`);
  }
  assert.equal(nativeValues.get(STORE_NAME), raw);
  for (const key of [STORE_NAME, RECOVERY_NAME]) {
    const localCopy = localValues.get(key);
    const indexedCopy = indexedValues.get(key);
    assert.ok(localCopy, `${key} localStorage copy must remain available`);
    assert.ok(indexedCopy, `${key} IndexedDB copy must remain available`);
    for (const secret of [RELAY_SECRET, POOLED_SECRET, GLOBAL_SECRET, IMAGE_HOST_SECRET, WEBDAV_SECRET]) {
      assert.equal(localCopy.includes(secret), false);
      assert.equal(indexedCopy.includes(secret), false);
    }
  }
});

test("desktop-required storage keeps the native custom proxy while exposing direct browser copies", async () => {
  localValues.clear();
  indexedValues.clear();
  nativeValues.clear();
  desktopRequired = true;
  const raw = rawRecoveryEnvelope();

  try {
    await recoverableConfigStorage.setItem(STORE_NAME, raw);

    assert.equal(nativeValues.get(STORE_NAME), raw);
    assert.equal(nativeValues.get(RECOVERY_NAME), raw);
    for (const key of [STORE_NAME, RECOVERY_NAME]) {
      const localCopy = localValues.get(key);
      const indexedCopy = indexedValues.get(key);
      assert.ok(localCopy, `${key} localStorage copy must be written`);
      assert.ok(indexedCopy, `${key} IndexedDB copy must be written`);
      assert.equal(localCopy.includes(RELAY_SECRET), false);
      assert.equal(indexedCopy.includes(RELAY_SECRET), false);
      const parsed = JSON.parse(localCopy) as { state: { config: { apiRelays: Array<{ proxyMode?: string; proxyUrl?: string }> } } };
      assert.equal(parsed.state.config.apiRelays[0]?.proxyMode, "direct");
      assert.equal(parsed.state.config.apiRelays[0]?.proxyUrl, "");
    }
  } finally {
    desktopRequired = false;
  }
});

test("desktop flush preserves a proxy setting supplied in the native snapshot", async () => {
  localValues.clear();
  indexedValues.clear();
  nativeValues.clear();
  desktopRequired = true;
  const raw = rawRecoveryEnvelope();

  try {
    const nativeSnapshot = browserSafeConfigEnvelope(raw, { redactProxy: false });
    const nativeParsed = JSON.parse(nativeSnapshot) as { state: { config: { apiRelays: Array<{ proxyMode?: string; proxyUrl?: string }> } } };
    assert.equal(nativeParsed.state.config.apiRelays[0]?.proxyMode, "custom");
    assert.equal(nativeParsed.state.config.apiRelays[0]?.proxyUrl, PROXY_URL);

    await flushRecoverableConfig(STORE_NAME, nativeSnapshot);

    const savedNative = nativeValues.get(STORE_NAME);
    assert.ok(savedNative);
    const savedNativeParsed = JSON.parse(savedNative) as { state: { config: { apiRelays: Array<{ proxyMode?: string; proxyUrl?: string }> } } };
    assert.equal(savedNativeParsed.state.config.apiRelays[0]?.proxyMode, "custom");
    assert.equal(savedNativeParsed.state.config.apiRelays[0]?.proxyUrl, PROXY_URL);
    const savedBrowser = localValues.get(STORE_NAME);
    assert.ok(savedBrowser);
    const savedBrowserParsed = JSON.parse(savedBrowser) as { state: { config: { apiRelays: Array<{ proxyMode?: string; proxyUrl?: string }> } } };
    assert.equal(savedBrowserParsed.state.config.apiRelays[0]?.proxyMode, "direct");
    assert.equal(savedBrowserParsed.state.config.apiRelays[0]?.proxyUrl, "");
  } finally {
    desktopRequired = false;
  }
});

test("desktop migration keeps a legacy custom proxy in native storage but returns direct browser state", async () => {
  localValues.clear();
  indexedValues.clear();
  nativeValues.clear();
  desktopRequired = true;
  const raw = rawRecoveryEnvelope();
  localValues.set(RECOVERY_NAME, raw);
  indexedValues.set(RECOVERY_NAME, raw);

  try {
    const restored = await recoverableConfigStorage.getItem(STORE_NAME);
    assert.ok(restored);
    const restoredParsed = JSON.parse(restored) as { state: { config: { apiRelays: Array<{ proxyMode?: string; proxyUrl?: string }> } } };
    assert.equal(restoredParsed.state.config.apiRelays[0]?.proxyMode, "direct");
    assert.equal(restoredParsed.state.config.apiRelays[0]?.proxyUrl, "");

    const savedNative = nativeValues.get(STORE_NAME);
    assert.ok(savedNative);
    const savedNativeParsed = JSON.parse(savedNative) as { state: { config: { apiRelays: Array<{ proxyMode?: string; proxyUrl?: string }> } } };
    assert.equal(savedNativeParsed.state.config.apiRelays[0]?.proxyMode, "custom");
    assert.equal(savedNativeParsed.state.config.apiRelays[0]?.proxyUrl, PROXY_URL);
  } finally {
    desktopRequired = false;
  }
});
