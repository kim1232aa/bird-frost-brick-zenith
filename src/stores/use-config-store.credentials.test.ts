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

type VaultRequest = {
  data: {
    relays: Array<{ id: string; apiKey: string; apiKeys?: string[] }>;
    hiddenPresetIds?: string[];
  };
};

const flushedValues: string[] = [];
const persistedWrites: string[] = [];
const vaultRequests: VaultRequest[] = [];
const imageHostVaultRequests: Array<{ data: { baseUrl: string; apiKey: string } }> = [];
let persistedConfigValue: string | null = null;
let vaultError: Error | undefined;
let imageHostVaultError: Error | undefined;
let imageHostVaultLoadError: Error | undefined;
let imageHostVaultCredential: { baseUrl: string; hasApiKey: boolean } | null = null;
let vaultInvocation = 0;
let vaultStoredPrimarySecret = "";
let configFlushInvocation = 0;
let beforeVaultSave: ((request: VaultRequest, invocation: number) => Promise<void>) | undefined;
let beforeConfigFlush: ((value: string | undefined, invocation: number) => Promise<void>) | undefined;

mock.module(new URL("../lib/config-state-storage.ts", import.meta.url).href, {
  namedExports: {
    recoverableConfigStorage: {
      getItem: () => persistedConfigValue,
      setItem: (_name: string, value: string) => { persistedWrites.push(value); },
      removeItem: () => undefined,
    },
    flushRecoverableConfig: async (_name: string, value?: string) => {
      const invocation = ++configFlushInvocation;
      if (beforeConfigFlush) await beforeConfigFlush(value, invocation);
      if (value !== undefined) flushedValues.push(value);
    },
  },
});

mock.module(new URL("../studio/server/relay-vault.ts", import.meta.url).href, {
  namedExports: {
    loadRelayVault: async () => ({ relays: [], hiddenPresetIds: [], updatedAt: "", imageHost: null }),
    loadImageHostCredential: async () => {
      if (imageHostVaultLoadError) throw imageHostVaultLoadError;
      return imageHostVaultCredential;
    },
    saveImageHostCredential: async (request: { data: { baseUrl: string; apiKey: string } }) => {
      imageHostVaultRequests.push(request);
      if (imageHostVaultError) throw imageHostVaultError;
      return {
        ok: true as const,
        baseUrl: request.data.baseUrl,
        hasApiKey: Boolean(request.data.apiKey),
      };
    },
    saveRelayVault: async (request: VaultRequest) => {
      vaultRequests.push(request);
      const invocation = ++vaultInvocation;
      if (beforeVaultSave) await beforeVaultSave(request, invocation);
      if (vaultError) throw vaultError;
      vaultStoredPrimarySecret = request.data.relays.find((relay) => relay.id === "test-relay-vault-lifecycle")?.apiKey || "";
      return { ok: true as const };
    },
  },
});

const {
  defaultConfig,
  flushConfigStore,
  hydrateImageHostCredential,
  persistApiSettingsBeforeClose,
  useConfigHydrationRuntimeStore,
  useConfigStore,
} = await import("./use-config-store.ts");

const PRIMARY_SECRET = "synthetic-relay-secret-alpha";
const POOLED_SECRET = "synthetic-relay-secret-beta";

function setPendingCredentials(apiKey = PRIMARY_SECRET, apiKeys = [POOLED_SECRET]) {
  const template = defaultConfig.apiRelays[0];
  assert.ok(template);
  useConfigStore.setState({
    config: {
      ...defaultConfig,
      apiRelays: [{
        ...template,
        id: "test-relay-vault-lifecycle",
        name: "Synthetic relay",
        baseUrl: "https://relay.example.test/v1",
        apiKey,
        apiKeyId: apiKey ? "synthetic-primary-credential-id" : undefined,
        apiKeys,
        apiKeyIds: apiKeys.length ? apiKeys.map((_, index) => `synthetic-pool-credential-id-${index}`) : undefined,
        hasApiKey: false,
      }],
    },
  });
}

test("flush saves pending relay credentials to the vault and persists only redacted browser config", async () => {
  flushedValues.length = 0;
  vaultRequests.length = 0;
  vaultError = undefined;
  vaultInvocation = 0;
  vaultStoredPrimarySecret = "";
  beforeVaultSave = undefined;
  setPendingCredentials();

  await flushConfigStore();

  assert.equal(flushedValues.length, 1);
  const browserSnapshot = flushedValues[0] || "";
  assert.equal(browserSnapshot.includes(PRIMARY_SECRET), false);
  assert.equal(browserSnapshot.includes(POOLED_SECRET), false);
  const persisted = JSON.parse(browserSnapshot) as {
    state: { config: { apiRelays: Array<{ id: string; name: string; baseUrl: string; apiKey: string; apiKeyId?: string; apiKeys?: string[]; apiKeyIds?: string[]; hasApiKey?: boolean }> } };
  };
  const persistedRelay = persisted.state.config.apiRelays.find((relay) => relay.id === "test-relay-vault-lifecycle");
  assert.equal(persistedRelay?.name, "Synthetic relay");
  assert.equal(persistedRelay?.baseUrl, "https://relay.example.test/v1");
  assert.equal(persistedRelay?.apiKey, "");
  assert.equal(persistedRelay?.apiKeyId, "synthetic-primary-credential-id");
  assert.equal(persistedRelay?.apiKeys, undefined);
  assert.deepEqual(persistedRelay?.apiKeyIds, ["synthetic-pool-credential-id-0"]);
  assert.equal(persistedRelay?.hasApiKey, true);

  assert.equal(vaultRequests.length, 1);
  const savedRelay = vaultRequests[0]?.data.relays.find((relay) => relay.id === "test-relay-vault-lifecycle");
  assert.equal(savedRelay?.apiKey, PRIMARY_SECRET);
  assert.deepEqual(savedRelay?.apiKeys, [POOLED_SECRET]);

  const browserRelay = useConfigStore.getState().config.apiRelays[0];
  assert.equal(browserRelay?.name, "Synthetic relay");
  assert.equal(browserRelay?.baseUrl, "https://relay.example.test/v1");
  assert.equal(browserRelay?.apiKey, "");
  assert.equal(browserRelay?.apiKeyId, "synthetic-primary-credential-id");
  assert.equal(browserRelay?.apiKeys, undefined);
  assert.deepEqual(browserRelay?.apiKeyIds, ["synthetic-pool-credential-id-0"]);
  assert.equal(browserRelay?.hasApiKey, true);
});

test("flush saves an image-host Key to the server vault and persists only its public marker", async () => {
  const imageHostSecret = "synthetic-image-host-secret";
  flushedValues.length = 0;
  imageHostVaultRequests.length = 0;
  imageHostVaultError = undefined;
  vaultError = undefined;
  useConfigStore.setState({
    config: {
      ...defaultConfig,
      imageHostBaseUrl: "https://images.example.test",
      imageHostApiKey: imageHostSecret,
      imageHostHasApiKey: false,
    },
  });
  useConfigHydrationRuntimeStore.setState({ imageHostCredentialError: "旧的图床密钥库错误" });

  await flushConfigStore();

  assert.deepEqual(imageHostVaultRequests, [{
    data: { baseUrl: "https://images.example.test", apiKey: imageHostSecret },
  }]);
  const current = useConfigStore.getState().config;
  assert.equal(current.imageHostApiKey, "");
  assert.equal(current.imageHostHasApiKey, true);
  assert.equal(useConfigHydrationRuntimeStore.getState().imageHostCredentialError, null);
  assert.equal(flushedValues.some((value) => value.includes(imageHostSecret)), false);
  const persisted = JSON.parse(flushedValues.at(-1) || "{}") as { state?: { config?: { imageHostApiKey?: string; imageHostHasApiKey?: boolean } } };
  assert.equal(persisted.state?.config?.imageHostApiKey, "");
  assert.equal(persisted.state?.config?.imageHostHasApiKey, true);
});

test("image-host vault failure leaves the pending Key in memory and never writes it to browser storage", async () => {
  const imageHostSecret = "synthetic-image-host-failure-secret";
  flushedValues.length = 0;
  persistedWrites.length = 0;
  imageHostVaultRequests.length = 0;
  imageHostVaultError = new Error("synthetic image-host vault failure");
  useConfigStore.setState({
    config: {
      ...defaultConfig,
      imageHostBaseUrl: "https://images.example.test",
      imageHostApiKey: imageHostSecret,
      imageHostHasApiKey: false,
    },
  });
  useConfigHydrationRuntimeStore.setState({ imageHostCredentialError: null });

  try {
    await assert.rejects(flushConfigStore(), /synthetic image-host vault failure/u);
    assert.equal(useConfigStore.getState().config.imageHostApiKey, imageHostSecret);
    assert.match(useConfigHydrationRuntimeStore.getState().imageHostCredentialError || "", /图床密钥库保存失败.*synthetic image-host vault failure/u);
    assert.equal(imageHostVaultRequests.length, 1);
    assert.equal(flushedValues.length, 0);
    assert.equal(persistedWrites.some((value) => value.includes(imageHostSecret)), false);
  } finally {
    imageHostVaultError = undefined;
  }
});

test("image-host vault hydrate failure is captured visibly without erasing the last known marker", async () => {
  imageHostVaultLoadError = new Error("synthetic image-host hydrate failure");
  imageHostVaultCredential = null;
  useConfigStore.setState({
    config: {
      ...defaultConfig,
      imageHostBaseUrl: "https://images.last-known.example.test",
      imageHostApiKey: "",
      imageHostHasApiKey: true,
    },
  });

  try {
    await assert.doesNotReject(() => hydrateImageHostCredential());
    const current = useConfigStore.getState().config;
    assert.equal(current.imageHostBaseUrl, "https://images.last-known.example.test");
    assert.equal(current.imageHostHasApiKey, true);
    const runtime = useConfigHydrationRuntimeStore.getState() as typeof useConfigHydrationRuntimeStore extends { getState: () => infer T } ? T & { imageHostCredentialError?: string | null } : never;
    assert.match(runtime.imageHostCredentialError || "", /图床密钥库读取失败.*synthetic image-host hydrate failure/u);
  } finally {
    imageHostVaultLoadError = undefined;
  }
});

test("vault failure rejects the flush and keeps the pending key available to the caller", async () => {
  flushedValues.length = 0;
  vaultRequests.length = 0;
  vaultInvocation = 0;
  beforeVaultSave = undefined;
  vaultError = new Error("synthetic vault write failed");
  setPendingCredentials();

  await assert.rejects(flushConfigStore(), /synthetic vault write failed/u);

  assert.equal(flushedValues.length, 0);
  assert.equal(vaultRequests.length, 1);
  const pendingRelay = useConfigStore.getState().config.apiRelays[0];
  assert.equal(pendingRelay?.apiKey, PRIMARY_SECRET);
  assert.deepEqual(pendingRelay?.apiKeys, [POOLED_SECRET]);
  vaultError = undefined;
});

test("vault failure never passes pending credentials to browser persistence", async () => {
  persistedWrites.length = 0;
  vaultRequests.length = 0;
  beforeVaultSave = undefined;
  vaultError = new Error("synthetic vault write failed");
  setPendingCredentials();

  try {
    await assert.rejects(flushConfigStore(), /synthetic vault write failed/u);
    assert.ok(persistedWrites.length > 0);
    for (const browserSnapshot of persistedWrites) {
      assert.equal(browserSnapshot.includes(PRIMARY_SECRET), false);
      assert.equal(browserSnapshot.includes(POOLED_SECRET), false);
    }
  } finally {
    vaultError = undefined;
  }
});

test("settings close keeps the dialog open and returns a visible vault error", async () => {
  assert.equal(typeof persistApiSettingsBeforeClose, "function");
  flushedValues.length = 0;
  vaultRequests.length = 0;
  vaultInvocation = 0;
  beforeVaultSave = undefined;
  vaultError = new Error("synthetic vault write failed");
  setPendingCredentials();
  let closed = false;
  let visibleError = "";

  try {
    const result = await persistApiSettingsBeforeClose(
      flushConfigStore,
      () => { closed = true; },
      (error) => { visibleError = error; },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /后端密钥库或本地配置未确认写入/u);
      assert.match(result.error, /synthetic vault write failed/u);
      assert.equal(visibleError, result.error);
    }
    assert.equal(closed, false);
    assert.equal(useConfigStore.getState().config.apiRelays[0]?.apiKey, PRIMARY_SECRET);
  } finally {
    vaultError = undefined;
  }
});

test("concurrent flushes cannot let an older vault write discard a newer pending key", async () => {
  const UPDATED_SECRET = "synthetic-relay-secret-newer";
  flushedValues.length = 0;
  vaultRequests.length = 0;
  vaultError = undefined;
  vaultInvocation = 0;
  vaultStoredPrimarySecret = "";
  let signalFirstSaveStarted = () => {};
  let releaseFirstSave = () => {};
  const firstSaveStarted = new Promise<void>((resolve) => { signalFirstSaveStarted = resolve; });
  const firstSaveBlocked = new Promise<void>((resolve) => { releaseFirstSave = resolve; });
  beforeVaultSave = async (_request, invocation) => {
    if (invocation !== 1) return;
    signalFirstSaveStarted();
    await firstSaveBlocked;
  };
  setPendingCredentials(PRIMARY_SECRET, []);

  const firstFlush = flushConfigStore();
  await firstSaveStarted;
  setPendingCredentials(UPDATED_SECRET, []);
  const secondFlush = flushConfigStore();
  releaseFirstSave();
  await Promise.all([firstFlush, secondFlush]);

  assert.equal(vaultStoredPrimarySecret, UPDATED_SECRET);
  assert.equal(vaultRequests.length, 2);
  const latestSavedRelay = vaultRequests[1]?.data.relays.find((relay) => relay.id === "test-relay-vault-lifecycle");
  assert.equal(latestSavedRelay?.apiKey, UPDATED_SECRET);
  const browserRelay = useConfigStore.getState().config.apiRelays[0];
  assert.equal(browserRelay?.apiKey, "");
  assert.equal(browserRelay?.hasApiKey, true);
  for (const browserSnapshot of flushedValues) {
    assert.equal(browserSnapshot.includes(UPDATED_SECRET), false);
  }
  beforeVaultSave = undefined;
});

test("a key entered while the browser snapshot is flushing reaches the vault before flush resolves", async () => {
  const LATE_SECRET = "synthetic-relay-secret-during-local-flush";
  flushedValues.length = 0;
  vaultRequests.length = 0;
  vaultError = undefined;
  vaultInvocation = 0;
  configFlushInvocation = 0;
  vaultStoredPrimarySecret = "";
  beforeVaultSave = undefined;
  let signalLocalFlushStarted = () => {};
  let releaseLocalFlush = () => {};
  const localFlushStarted = new Promise<void>((resolve) => { signalLocalFlushStarted = resolve; });
  const localFlushBlocked = new Promise<void>((resolve) => { releaseLocalFlush = resolve; });
  beforeConfigFlush = async (_value, invocation) => {
    if (invocation !== 1) return;
    signalLocalFlushStarted();
    await localFlushBlocked;
  };
  setPendingCredentials("", []);

  const flushing = flushConfigStore();
  await localFlushStarted;
  setPendingCredentials(LATE_SECRET, []);
  releaseLocalFlush();
  await flushing;

  assert.equal(vaultRequests.length, 1);
  assert.equal(vaultStoredPrimarySecret, LATE_SECRET);
  assert.equal(flushedValues.length, 2);
  assert.equal(useConfigStore.getState().config.apiRelays[0]?.apiKey, "");
  assert.equal(useConfigStore.getState().config.apiRelays[0]?.hasApiKey, true);
  for (const browserSnapshot of flushedValues) {
    assert.equal(browserSnapshot.includes(LATE_SECRET), false);
  }
  beforeConfigFlush = undefined;
});

test("same-version raw relay credentials are redacted before entering live Zustand during hydration", async () => {
  const HYDRATION_PRIMARY_SECRET = "synthetic-hydration-primary-secret";
  const HYDRATION_POOL_SECRET = "synthetic-hydration-pool-secret";
  const HYDRATION_GLOBAL_SECRET = "synthetic-hydration-global-secret";
  const HYDRATION_IMAGE_HOST_SECRET = "synthetic-hydration-image-host-secret";
  const template = defaultConfig.apiRelays[0];
  assert.ok(template);

  persistedConfigValue = JSON.stringify({
    state: {
      config: {
        ...defaultConfig,
        apiKey: HYDRATION_GLOBAL_SECRET,
        imageHostApiKey: HYDRATION_IMAGE_HOST_SECRET,
        apiRelays: [{
          ...template,
          id: "test-relay-hydration-lifecycle",
          name: "Synthetic hydration relay",
          baseUrl: "https://relay.example.test/v1",
          apiKey: HYDRATION_PRIMARY_SECRET,
          apiKeys: [HYDRATION_POOL_SECRET],
          hasApiKey: false,
        }],
      },
    },
    version: 0,
  });

  try {
    await useConfigStore.persist.rehydrate();
    const state = useConfigStore.getState();
    const relay = state.config.apiRelays.find((item) => item.id === "test-relay-hydration-lifecycle");
    assert.ok(relay);
    assert.equal(relay.apiKey, "");
    assert.equal(relay.apiKeys, undefined);
    assert.equal(relay.hasApiKey, true);
    assert.equal(state.config.apiKey, "");
    assert.equal(state.config.imageHostApiKey, "");
    const liveState = JSON.stringify(state);
    for (const secret of [
      HYDRATION_PRIMARY_SECRET,
      HYDRATION_POOL_SECRET,
      HYDRATION_GLOBAL_SECRET,
      HYDRATION_IMAGE_HOST_SECRET,
    ]) {
      assert.equal(liveState.includes(secret), false, `live Zustand state must not contain ${secret}`);
    }
  } finally {
    persistedConfigValue = null;
  }
});
