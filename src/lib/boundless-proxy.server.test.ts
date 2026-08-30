import assert from "node:assert/strict";
import test, { mock } from "node:test";

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
    requireUserId: async () => "user-1",
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
  delete process.env.XAI_API_KEY;
});

test("relay, WebDAV, fetch-url, and image-host reject private destinations", async () => {
  const cases = [
    () =>
      proxyLocalRelay(
        new Request("http://boundless.test/local-relay-proxy/chat/completions", {
          method: "POST",
          headers: {
            "x-local-relay-base-url": "http://127.0.0.1:8080",
            authorization: "Bearer test-key",
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

test("relay does not forward control headers upstream", async () => {
  installFetch(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

  const response = await proxyLocalRelay(
    new Request("http://boundless.test/local-relay-proxy/chat/completions", {
      method: "POST",
      headers: {
        "x-local-relay-base-url": "http://203.0.113.10",
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
        authorization: "Bearer user-key",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    "chat/completions",
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 1);
  const sent = headerRecord(fetchCalls[0]?.init?.headers);
  assert.equal(sent.authorization, "Bearer user-key");
  assert.equal(sent["content-type"], "application/json");
  for (const name of [
    "cookie",
    "forwarded",
    "x-forwarded-for",
    "x-real-ip",
    "x-boundless-builtin",
    "x-boundless-relay-id",
    "x-boundless-desktop-token",
    "x-local-relay-base-url",
    "x-local-relay-proxy-url",
    "x-image-host-key",
    "x-grok-identity",
  ]) {
    assert.equal(sent[name], undefined, name);
  }
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

test("image-host upload keeps stream duplex and does not JSON-wrap a binary response", async () => {
  installFetch(async () => binaryUpstream());

  const response = await proxyImageHostUpload(
    new Request("http://boundless.test/client-api/upload-image-host", {
      method: "POST",
      headers: {
        "x-image-host-base-url": "http://203.0.113.10/host",
        "x-image-host-key": "host-key",
        "content-type": "multipart/form-data; boundary=test",
      },
      body: Buffer.from(PNG_BYTES),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(fetchCalls[0]?.url, "http://203.0.113.10/host/api/upload");
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
