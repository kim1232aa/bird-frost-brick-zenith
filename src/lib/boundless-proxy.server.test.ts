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

type LookupAddress = { address: string; family: number };

const PUBLIC_TEST_NET3 = "203.0.113.10";
const PUBLIC_HOSTS = new Set(["api.x.ai", "public.example", "evil.example"]);

mock.module("node:dns/promises", {
  namedExports: {
    lookup: async (hostname: string, options: { all: true; verbatim: true }): Promise<LookupAddress[]> => {
      assert.equal(options.all, true);
      assert.equal(options.verbatim, true);
      const host = String(hostname || "")
        .replace(/\.$/, "")
        .toLowerCase();
      if (PUBLIC_HOSTS.has(host)) {
        return [{ address: PUBLIC_TEST_NET3, family: 4 }];
      }
      throw new Error(`unexpected dns lookup ${host}`);
    },
  },
});

mock.module(new URL("./auth/verify.server.ts", import.meta.url).href, {
  namedExports: {
    authConfigured: true,
    requireUserId: async () => "user-1",
  },
});
mock.module(new URL("./auth/gate-identity.server.ts", import.meta.url).href, {
  namedExports: {
    gateIdentityEnabled: () => false,
  },
});

type MockVaultEntry = {
  apiKey: string;
  apiKeyId?: string;
  apiKeys?: string[];
  apiKeyIds?: string[];
  baseUrl: string;
  authScheme: "Bearer" | "Key" | "x-api-key";
};
const vaultById = new Map<string, MockVaultEntry>();
const vaultLookups: Array<{ relayId: string; credentialId?: string }> = [];
let imageHostVaultKey: { apiKey: string; baseUrl: string } | null = null;
mock.module("@/studio/server/relay-vault", {
  namedExports: {
    readImageHostVaultKey: async (baseUrl: string) => imageHostVaultKey && imageHostVaultKey.baseUrl === baseUrl ? imageHostVaultKey : null,
    readRelayVaultKey: async (relayId: string, credentialId?: string) => {
      const normalizedRelayId = String(relayId || "").trim();
      const normalizedCredentialId = String(credentialId || "").trim();
      vaultLookups.push({ relayId: normalizedRelayId, ...(normalizedCredentialId ? { credentialId: normalizedCredentialId } : {}) });
      const entry = vaultById.get(normalizedRelayId);
      if (!entry) return null;
      if (!normalizedCredentialId) return entry;
      const ids = [entry.apiKeyId, ...(entry.apiKeyIds || [])].map((id) => String(id || "").trim());
      const index = ids.indexOf(normalizedCredentialId);
      if (index < 0) return null;
      const keys = [entry.apiKey, ...(entry.apiKeys || [])];
      return { ...entry, apiKey: keys[index] || "" };
    },
  },
});

const {
  buildRelayTarget,
  proxyFetchUrl,
  proxyImageHostUpload,
  proxyLocalRelay,
  proxyWebDav,
} = await import("./boundless-proxy.server.ts");

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
const originalFetch = globalThis.fetch;
const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

function jsonOf(response: Response) {
  return response.json() as Promise<{ message?: string; error?: { message?: string } }>;
}

function installFetch(handler: (url: URL, init?: RequestInit) => Promise<Response> | Response) {
  fetchCalls.length = 0;
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    fetchCalls.push({ url: url.href, init });
    return handler(url, init);
  }) as typeof fetch;
}

function headerRecord(headers?: HeadersInit) {
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

function binaryUpstream(bytes: Uint8Array = PNG_BYTES) {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "set-cookie": "session=secret; Path=/",
      "clear-site-data": "\"cookies\"",
      "x-boundless-relay-id": "should-not-leak",
    },
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  fetchCalls.length = 0;
  vaultById.clear();
  imageHostVaultKey = null;
  delete process.env.XAI_API_KEY;
});

test("relay, WebDAV, fetch-url, and image-host reject private destinations", async () => {
  vaultById.set("private-relay", {
    apiKey: "vault-key",
    baseUrl: "https://127.0.0.1:8080",
    authScheme: "Bearer",
  });
  const cases = [
    () =>
      proxyLocalRelay(
        new Request("http://boundless.test/local-relay-proxy/chat/completions", {
          method: "POST",
          headers: {
            "x-local-relay-base-url": "https://public.example/v1",
            "x-boundless-relay-id": "private-relay",
            authorization: "Bearer caller-key",
            "content-type": "application/json",
          },
          body: "{}",
        }),
        "chat/completions",
      ),
    () =>
      proxyWebDav(
        new Request("http://boundless.test/webdav-proxy", {
          method: "POST",
          headers: {
            "x-webdav-target": "http://127.0.0.1/files",
            "x-webdav-method": "PROPFIND",
          },
        }),
      ),
    () =>
      proxyFetchUrl(
        new Request("http://boundless.test/client-api/fetch-url?url=" + encodeURIComponent("http://169.254.169.254/latest/meta-data/")),
      ),
    () =>
      proxyImageHostUpload(
        new Request("http://boundless.test/client-api/upload-image-host", {
          method: "POST",
          headers: { "x-image-host-base-url": "http://[::ffff:127.0.0.1]" },
          body: "file",
        }),
      ),
  ];

  for (const send of cases) {
    const response = await send();
    assert.equal(response.status, 400);
    const payload = await jsonOf(response);
    assert.match(String(payload.message), /受保护的网络|无效/);
  }
  assert.equal(fetchCalls.length, 0);
});

test("WebDAV MOVE destination is re-checked before forwarding", async () => {
  const response = await proxyWebDav(
    new Request("http://boundless.test/webdav-proxy", {
      method: "POST",
      headers: {
        "x-webdav-target": "http://203.0.113.10/src",
        "x-webdav-method": "MOVE",
        "x-webdav-destination": "http://127.0.0.1/dest",
      },
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(fetchCalls.length, 0);
});

test("fetch-url revalidates redirect targets instead of following blindly", async () => {
  installFetch(async (url) => {
    if (url.hostname === "203.0.113.10") {
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } });
    }
    throw new Error(`unexpected fetch ${url.href}`);
  });

  const response = await proxyFetchUrl(
    new Request("http://boundless.test/client-api/fetch-url?url=" + encodeURIComponent("http://203.0.113.10/start")),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(
    fetchCalls.map((call) => call.url),
    ["http://203.0.113.10/start"],
  );
});

test("fetch-url never forwards caller Authorization to the requested media URL", async () => {
  installFetch(async () => binaryUpstream());

  const response = await proxyFetchUrl(
    new Request("http://boundless.test/client-api/fetch-url?url=" + encodeURIComponent("http://203.0.113.10/photo.png"), {
      headers: { authorization: "Bearer caller-secret" },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);
  const sent = headerRecord(fetchCalls[0]?.init?.headers);
  assert.equal(sent.authorization, undefined);
  assert.equal(JSON.stringify(fetchCalls[0]?.init || {}).includes("caller-secret"), false);
});

test("relay does not forward control headers or caller credentials upstream", async () => {
  vaultById.set("relay-1", {
    apiKey: "vault-key",
    baseUrl: "https://public.example",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://evil.example/v1",
        "x-local-relay-proxy-url": "http://attacker.test",
        "x-boundless-builtin": "custom",
        "x-boundless-relay-id": "relay-1",
        "x-boundless-desktop-token": "desktop-secret",
        "x-image-host-key": "image-secret",
        "x-grok-identity": "viewer",
        "x-forwarded-for": "10.0.0.8",
        forwarded: "for=10.0.0.8",
        "x-real-ip": "10.0.0.8",
        cookie: "session=abc",
        authorization: "Bearer caller-key",
        "x-api-key": "caller-x-api-key",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);
  const sent = headerRecord(fetchCalls[0]?.init?.headers);
  assert.equal(sent.authorization, "Bearer vault-key");
  assert.equal(sent["x-api-key"], undefined);
  assert.equal(sent["content-type"], "application/json");
  assert.equal(new URL(fetchCalls[0]?.url || "").origin, "https://public.example");
  for (const name of [
    "cookie",
    "forwarded",
    "x-forwarded-for",
    "x-real-ip",
    "x-boundless-builtin",
    "x-boundless-relay-id",
    "x-boundless-relay-credential-id",
    "x-boundless-desktop-token",
    "x-local-relay-base-url",
    "x-local-relay-proxy-url",
    "x-image-host-key",
    "x-grok-identity",
  ]) {
    assert.equal(sent[name], undefined, name);
  }
});

test("ordinary relay rejects a missing relay-id without forwarding caller credentials", async () => {
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://public.example/v1",
        authorization: "Bearer caller-key",
        "x-api-key": "caller-x-api-key",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 401);
  assert.match((await jsonOf(response)).message || "", /relay-id/i);
  assert.equal(fetchCalls.length, 0);
});

test("ordinary relay rejects an unknown relay-id without using caller base URL or credentials", async () => {
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://public.example/v1",
        "x-boundless-relay-id": "unknown-relay",
        authorization: "Bearer caller-key",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 401);
  assert.match((await jsonOf(response)).message || "", /unknown-relay|密钥库|Key/i);
  assert.equal(fetchCalls.length, 0);
});

test("ordinary relay rejects a vault entry without a Key instead of using caller credentials", async () => {
  vaultById.set("relay-without-key", {
    apiKey: "",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://evil.example/v1",
        "x-boundless-relay-id": "relay-without-key",
        authorization: "Bearer caller-key",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 401);
  assert.match((await jsonOf(response)).message || "", /密钥库|Key/i);
  assert.equal(fetchCalls.length, 0);
});

test("ordinary relay rejects a vault entry without baseUrl instead of using the caller base URL", async () => {
  vaultById.set("relay-without-base", {
    apiKey: "vault-key",
    baseUrl: "",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://public.example/v1",
        "x-boundless-relay-id": "relay-without-base",
        authorization: "Bearer caller-key",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 400);
  assert.match((await jsonOf(response)).message || "", /Base URL/i);
  assert.equal(fetchCalls.length, 0);
});

test("relay-id uses vault key instead of client Authorization or x-api-key headers", async () => {
  vaultById.set("preset-grok-relay", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://evil.example/v1",
        "x-boundless-relay-id": "preset-grok-relay",
        authorization: "Bearer caller-placeholder",
        "x-api-key": "caller-x-api-key",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);
  const sent = headerRecord(fetchCalls[0]?.init?.headers);
  assert.equal(sent.authorization, "Bearer vault-secret");
  assert.equal(sent["x-api-key"], undefined);
  assert.equal(new URL(fetchCalls[0]?.url || "").origin, "https://public.example");
});

test("relay honors a same-origin caller base URL hint (HF router per-provider failover)", async () => {
  vaultById.set("preset-huggingface", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/nscale/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/images/generations", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://public.example/fal-ai/v1",
        "x-boundless-relay-id": "preset-huggingface",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "images/generations",
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);
  const sent = headerRecord(fetchCalls[0]?.init?.headers);
  assert.equal(sent.authorization, "Bearer vault-secret");
  assert.equal(new URL(fetchCalls[0]?.url || "").href, "https://public.example/fal-ai/v1/images/generations");
});

test("relay ignores a cross-origin caller base URL hint even on a lookalike host", async () => {
  vaultById.set("preset-huggingface", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/nscale/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/images/generations", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://evil.example/v1",
        "x-boundless-relay-id": "preset-huggingface",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "images/generations",
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);
  const target = new URL(fetchCalls[0]?.url || "");
  assert.equal(target.origin, "https://public.example");
  assert.equal(target.pathname, "/nscale/v1/images/generations");
});

test("ordinary relay rejects a plaintext vault target before the first upstream hop", async () => {
  vaultById.set("plaintext-relay", {
    apiKey: "vault-secret",
    baseUrl: "http://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  const response = await proxyLocalRelay(
    new Request("https://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-boundless-relay-id": "plaintext-relay",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 400);
  assert.match((await jsonOf(response)).message || "", /HTTPS/i);
  assert.equal(fetchCalls.length, 0);
});

test("ordinary relay rejects a mismatched browser Origin before vault forwarding", async () => {
  vaultById.set("same-origin-relay", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  const response = await proxyLocalRelay(
    new Request("https://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "x-boundless-relay-id": "same-origin-relay",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 403);
  assert.equal(fetchCalls.length, 0);
});

test("ordinary relay accepts a configured public origin through TLS-terminating forwarding", async () => {
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://public.example";
  vaultById.set("forwarded-origin-relay", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

  try {
    const response = await proxyLocalRelay(
      new Request("http://internal.service/local-relay-proxy/chat/completions", {
        method: "POST",
        headers: {
          origin: "https://public.example",
          "x-forwarded-host": "public.example",
          "x-forwarded-proto": "https",
          "x-boundless-relay-id": "forwarded-origin-relay",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      "chat/completions",
    );

    assert.equal(response.status, 200);
    assert.equal(fetchCalls.length, 1);
  } finally {
    if (previousBetterAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
  }
});

test("ordinary relay rejects forwarded origins that do not match the configured public origin", async () => {
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "https://public.example";
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  try {
    const response = await proxyLocalRelay(
      new Request("http://internal.service/local-relay-proxy/chat/completions", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "https",
          "x-boundless-relay-id": "forwarded-origin-forgery",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      "chat/completions",
    );

    assert.equal(response.status, 403);
    assert.equal(fetchCalls.length, 0);
  } finally {
    if (previousBetterAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
  }
});

test("ordinary relay fails closed when forwarded origin has no explicit public-origin configuration", async () => {
  const previousBetterAuthUrl = process.env.BETTER_AUTH_URL;
  delete process.env.BETTER_AUTH_URL;
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  try {
    const response = await proxyLocalRelay(
      new Request("http://internal.service/local-relay-proxy/chat/completions", {
        method: "POST",
        headers: {
          origin: "https://public.example",
          "x-forwarded-host": "public.example",
          "x-forwarded-proto": "https",
          "x-boundless-relay-id": "unconfigured-forwarded-origin",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      "chat/completions",
    );

    assert.equal(response.status, 403);
    assert.equal(fetchCalls.length, 0);
  } finally {
    if (previousBetterAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previousBetterAuthUrl;
  }
});

test("ordinary relay rejects cross-site Fetch Metadata before vault forwarding", async () => {
  vaultById.set("fetch-metadata-relay", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  const response = await proxyLocalRelay(
    new Request("https://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
        "x-boundless-relay-id": "fetch-metadata-relay",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 403);
  assert.equal(fetchCalls.length, 0);
});

test("ordinary relay fails closed when auth and gate are disabled in production with a real database", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAuthEnabled = process.env.VITE_AUTH_ENABLED;
  const previousProjectId = process.env.GROK_PROJECT_ID;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.NODE_ENV = "production";
  process.env.VITE_AUTH_ENABLED = "false";
  process.env.DATABASE_URL = "postgresql://test.invalid/boundless";
  delete process.env.GROK_PROJECT_ID;
  vaultById.set("unprotected-production-relay", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  try {
    const response = await proxyLocalRelay(
      new Request("https://boundless.test/local-relay-proxy/chat/completions", {
        method: "POST",
        headers: {
          "x-boundless-relay-id": "unprotected-production-relay",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      "chat/completions",
    );

    assert.equal(response.status, 503);
    assert.equal(fetchCalls.length, 0);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAuthEnabled === undefined) delete process.env.VITE_AUTH_ENABLED;
    else process.env.VITE_AUTH_ENABLED = previousAuthEnabled;
    if (previousProjectId === undefined) delete process.env.GROK_PROJECT_ID;
    else process.env.GROK_PROJECT_ID = previousProjectId;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("ordinary relay remains available for an isolated no-database preview", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAuthEnabled = process.env.VITE_AUTH_ENABLED;
  const previousProjectId = process.env.GROK_PROJECT_ID;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.NODE_ENV = "production";
  process.env.VITE_AUTH_ENABLED = "false";
  delete process.env.DATABASE_URL;
  delete process.env.GROK_PROJECT_ID;
  vaultById.set("isolated-preview-relay", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("{}", { status: 200 }));

  try {
    const response = await proxyLocalRelay(
      new Request("https://boundless.test/local-relay-proxy/chat/completions", {
        method: "POST",
        headers: {
          "x-boundless-relay-id": "isolated-preview-relay",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      "chat/completions",
    );

    assert.equal(response.status, 200);
    assert.equal(fetchCalls.length, 1);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAuthEnabled === undefined) delete process.env.VITE_AUTH_ENABLED;
    else process.env.VITE_AUTH_ENABLED = previousAuthEnabled;
    if (previousProjectId === undefined) delete process.env.GROK_PROJECT_ID;
    else process.env.GROK_PROJECT_ID = previousProjectId;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("built-in xAI fails closed in production when auth and gate are disabled", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAuthEnabled = process.env.VITE_AUTH_ENABLED;
  const previousProjectId = process.env.GROK_PROJECT_ID;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.NODE_ENV = "production";
  process.env.VITE_AUTH_ENABLED = "false";
  process.env.DATABASE_URL = "postgresql://test.invalid/boundless";
  delete process.env.GROK_PROJECT_ID;
  process.env.XAI_API_KEY = "test-xai-key";
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  try {
    const response = await proxyLocalRelay(
      new Request("https://boundless.test/local-relay-proxy/chat/completions", {
        method: "POST",
        headers: {
          "x-local-relay-base-url": "https://api.x.ai/v1",
          "x-boundless-builtin": "xai",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      "chat/completions",
    );

    assert.equal(response.status, 503);
    assert.equal(fetchCalls.length, 0);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAuthEnabled === undefined) delete process.env.VITE_AUTH_ENABLED;
    else process.env.VITE_AUTH_ENABLED = previousAuthEnabled;
    if (previousProjectId === undefined) delete process.env.GROK_PROJECT_ID;
    else process.env.GROK_PROJECT_ID = previousProjectId;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("built-in xAI remains available in production when auth is enabled", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAuthEnabled = process.env.VITE_AUTH_ENABLED;
  const previousProjectId = process.env.GROK_PROJECT_ID;
  process.env.NODE_ENV = "production";
  process.env.VITE_AUTH_ENABLED = "true";
  delete process.env.GROK_PROJECT_ID;
  process.env.XAI_API_KEY = "test-xai-key";
  installFetch(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

  try {
    const response = await proxyLocalRelay(
      new Request("https://boundless.test/local-relay-proxy/chat/completions", {
        method: "POST",
        headers: {
          "x-local-relay-base-url": "https://api.x.ai/v1",
          "x-boundless-builtin": "xai",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      "chat/completions",
    );

    assert.equal(response.status, 200);
    assert.equal(fetchCalls.length, 1);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAuthEnabled === undefined) delete process.env.VITE_AUTH_ENABLED;
    else process.env.VITE_AUTH_ENABLED = previousAuthEnabled;
    if (previousProjectId === undefined) delete process.env.GROK_PROJECT_ID;
    else process.env.GROK_PROJECT_ID = previousProjectId;
  }
});

test("POST relay returns the first 502 without replaying the request", async () => {
  vaultById.set("post-retry-relay", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("upstream unavailable", { status: 502 }));

  const response = await proxyLocalRelay(
    new Request("https://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-boundless-relay-id": "post-retry-relay",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 502);
  assert.equal(fetchCalls.length, 1);
});

test("GET relay keeps one controlled retry after a 5xx response", async () => {
  vaultById.set("get-retry-relay", {
    apiKey: "vault-secret",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () =>
    fetchCalls.length === 1
      ? new Response("upstream unavailable", { status: 502 })
      : new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
  );

  const response = await proxyLocalRelay(
    new Request("https://boundless.test/local-relay-proxy/models", {
      method: "GET",
      headers: { "x-boundless-relay-id": "get-retry-relay" },
    }),
    "models",
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 2);
});

test("proxy responses keep binary media and drop upstream set-cookie", async () => {
  installFetch(async () => binaryUpstream());

  const response = await proxyFetchUrl(
    new Request("http://boundless.test/client-api/fetch-url?url=" + encodeURIComponent("http://203.0.113.10/photo.png")),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("clear-site-data"), null);
  assert.equal(response.headers.get("x-boundless-relay-id"), null);
  const probe = response.clone();
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes], [...PNG_BYTES]);
  await assert.rejects(() => probe.json());
});

test("fetch-url maps oversized Content-Length to 413 without JSON-decoding the body", async () => {
  installFetch(async () =>
    new Response("ignored", {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(3 * 1024 * 1024 * 1024),
      },
    }),
  );

  const response = await proxyFetchUrl(
    new Request("http://boundless.test/client-api/fetch-url?url=" + encodeURIComponent("http://203.0.113.10/huge.bin")),
  );
  assert.equal(response.status, 413);
  const payload = await jsonOf(response);
  assert.match(String(payload.message), /2 GiB/);
});

test("image-host upload rejects a raw browser Key instead of accepting it as an upload credential", async () => {
  installFetch(async () => {
    throw new Error("raw image-host credential must be rejected before fetch");
  });

  const response = await proxyImageHostUpload(
    new Request("http://boundless.test/client-api/upload-image-host", {
      method: "POST",
      headers: {
        "x-image-host-base-url": "http://203.0.113.10/host",
        "x-image-host-key": "browser-secret",
      },
      body: Buffer.from(PNG_BYTES),
    }),
  );

  assert.equal(response.status, 400);
  assert.match(String((await jsonOf(response)).message), /后端密钥库|浏览器/u);
  assert.equal(fetchCalls.length, 0);
});

test("image-host upload keeps stream duplex and uses only the server-vault credential", async () => {
  imageHostVaultKey = { apiKey: "host-key", baseUrl: "https://203.0.113.10/host" };
  installFetch(async () => binaryUpstream());

  const response = await proxyImageHostUpload(
    new Request("http://boundless.test/client-api/upload-image-host", {
      method: "POST",
      headers: {
        "x-image-host-base-url": "https://203.0.113.10/host",
        "content-type": "multipart/form-data; boundary=test",
      },
      body: Buffer.from(PNG_BYTES),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls[0]?.url, "https://203.0.113.10/host/api/upload");
  assert.equal((fetchCalls[0]?.init as RequestInit & { duplex?: string })?.duplex, "half");
  const sent = headerRecord(fetchCalls[0]?.init?.headers);
  assert.equal(sent.authorization, "Bearer host-key");
  assert.equal(sent["x-image-host-key"], undefined);
  assert.equal(sent["x-image-host-base-url"], undefined);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...PNG_BYTES]);
});

test("built-in xAI pinning rejects the wrong host and plaintext HTTP", async () => {
  process.env.XAI_API_KEY = "test-xai-key";
  installFetch(async () => {
    throw new Error("xAI pin must fail closed before fetch");
  });

  const wrongHost = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://evil.example/v1",
        "x-boundless-builtin": "xai",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );
  assert.equal(wrongHost.status, 400);
  assert.match((await jsonOf(wrongHost)).message || "", /api\.x\.ai/);

  const plaintext = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "http://api.x.ai/v1",
        "x-boundless-builtin": "xai",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );
  assert.equal(plaintext.status, 400);
  assert.match((await jsonOf(plaintext)).message || "", /HTTPS/);
  assert.equal(fetchCalls.length, 0);
});

test("built-in xAI keeps 400 when a redirect leaves api.x.ai", async () => {
  process.env.XAI_API_KEY = "test-xai-key";
  installFetch(async (url) => {
    if (url.hostname === "api.x.ai") {
      return new Response(null, { status: 302, headers: { location: "https://evil.example/exfil" } });
    }
    throw new Error(`xAI redirect escaped to ${url.href}`);
  });

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://api.x.ai/v1",
        "x-boundless-builtin": "xai",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );
  assert.equal(response.status, 400);
  assert.match((await jsonOf(response)).message || "", /api\.x\.ai/);
  assert.deepEqual(
    fetchCalls.map((call) => new URL(call.url).hostname),
    ["api.x.ai"],
  );
});

test("built-in xAI accepts the official FQDN and injects the server key", async () => {
  process.env.XAI_API_KEY = "test-xai-key";
  installFetch(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "https://api.x.ai./v1",
        "x-boundless-builtin": "xai",
        authorization: "Bearer client-key",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );
  assert.equal(response.status, 200);
  const sent = headerRecord(fetchCalls[0]?.init?.headers);
  assert.equal(sent.authorization, "Bearer test-xai-key");
  const upstream = new URL(fetchCalls[0]?.url || "");
  assert.equal(upstream.protocol, "https:");
  assert.equal(upstream.hostname.replace(/\.$/, ""), "api.x.ai");
  assert.equal(upstream.pathname, "/v1/chat/completions");
  assert.equal((fetchCalls[0]?.init as RequestInit)?.redirect, "manual");
});

test("buildRelayTarget keeps the official DashScope native path at the origin", () => {
  const target = buildRelayTarget(
    "https://dashscope.aliyuncs.com",
    "api/v1/services/aigc/multimodal-generation/generation",
    "",
  );
  assert.equal(target.toString(), "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
});

test("buildRelayTarget keeps the Token Plan DashScope native path at the origin", () => {
  const path = "api/v1/services/audio/tts/SpeechSynthesizer";
  const target = buildRelayTarget("https://token-plan.cn-beijing.maas.aliyuncs.com", path, "");
  const configured = buildRelayTarget(
    "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    path,
    "",
  );
  assert.equal(
    target.toString(),
    "https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
  );
  assert.equal(
    configured.toString(),
    "https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
  );
});

test("buildRelayTarget keeps the official Fal model path at the fal.run origin", () => {
  const target = buildRelayTarget("https://fal.run", "fal-ai/flux/dev", "");
  assert.equal(target.toString(), "https://fal.run/fal-ai/flux/dev");
});

test("buildRelayTarget retains /v1 for a generic OpenAI-compatible base", () => {
  const target = buildRelayTarget("https://relay.example.test/v1", "chat/completions", "");
  assert.equal(target.toString(), "https://relay.example.test/v1/chat/completions");
});

test("buildRelayTarget does not double-prefix /v1 on grok2api video content paths", () => {
  assert.equal(
    buildRelayTarget("https://relay.example.test/v1", "v1/videos/abc/content", "").toString(),
    "https://relay.example.test/v1/videos/abc/content",
  );
  assert.equal(
    buildRelayTarget("https://relay.example.test", "v1/videos/abc/content", "").toString(),
    "https://relay.example.test/v1/videos/abc/content",
  );
  assert.equal(
    buildRelayTarget("https://relay.example.test/v1", "videos/abc/content", "").toString(),
    "https://relay.example.test/v1/videos/abc/content",
  );
  assert.equal(
    buildRelayTarget("https://relay.example.test/v1", "v1/media/videos/asset-1", "").toString(),
    "https://relay.example.test/v1/media/videos/asset-1",
  );
});

test("buildRelayTarget does not infer native paths from an unrelated host", () => {
  assert.equal(
    buildRelayTarget("https://relay.example.test", "api/v1/services/aigc/video-generation/video-synthesis", "").toString(),
    "https://relay.example.test/v1/api/v1/services/aigc/video-generation/video-synthesis",
  );
  assert.equal(
    buildRelayTarget("https://relay.example.test", "fal-ai/flux/dev", "").toString(),
    "https://relay.example.test/v1/fal-ai/flux/dev",
  );
});

test("ordinary relay uses the requested credential id and strips it before upstream forwarding", async () => {
  const keyOne = "synthetic-proxy-vault-key-one";
  const keyTwo = "synthetic-proxy-vault-key-two";
  vaultById.set("relay-credential-routing", {
    apiKey: keyOne,
    apiKeyId: "credential-proxy-one",
    apiKeys: [keyTwo],
    apiKeyIds: ["credential-proxy-two"],
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

  const response = await proxyLocalRelay(
    new Request("https://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-boundless-relay-id": "relay-credential-routing",
        "x-boundless-relay-credential-id": "credential-proxy-two",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 200);
  const sent = headerRecord(fetchCalls[0]?.init?.headers);
  assert.equal(sent.authorization, `Bearer ${keyTwo}`);
  assert.equal(sent["x-boundless-relay-credential-id"], undefined);
  assert.deepEqual(vaultLookups.at(-1), {
    relayId: "relay-credential-routing",
    credentialId: "credential-proxy-two",
  });
});

test("ordinary relay rejects an unknown credential id without an upstream request", async () => {
  vaultById.set("relay-credential-unknown", {
    apiKey: "synthetic-unknown-vault-key",
    apiKeyId: "credential-known",
    baseUrl: "https://public.example/v1",
    authScheme: "Bearer",
  });
  installFetch(async () => new Response("should not be reached", { status: 200 }));

  const response = await proxyLocalRelay(
    new Request("https://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-boundless-relay-id": "relay-credential-unknown",
        "x-boundless-relay-credential-id": "credential-not-present",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 401);
  assert.equal(fetchCalls.length, 0);
  assert.deepEqual(vaultLookups.at(-1), {
    relayId: "relay-credential-unknown",
    credentialId: "credential-not-present",
  });
});
