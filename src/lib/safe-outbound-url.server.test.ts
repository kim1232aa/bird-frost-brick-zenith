import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeOutboundUrl,
  fetchSafeRedirecting,
  readResponseWithLimit,
} from "./safe-outbound-url.server.ts";

type LookupResult = Array<{ address: string; family: number }>;

test("rejects a literal loopback destination", async () => {
  await assert.rejects(
    () => assertSafeOutboundUrl("http://127.0.0.1/internal"),
    /受保护的网络/,
  );
});

test("rejects a hostname that resolves to a private address", async () => {
  await assert.rejects(
    () =>
      assertSafeOutboundUrl("http://internal.example", {
        lookup: async (): Promise<LookupResult> => [
          { address: "127.0.0.1", family: 4 },
        ],
      }),
    /受保护的网络/,
  );
});

test("requires every DNS answer to be public", async () => {
  await assert.rejects(
    () =>
      assertSafeOutboundUrl("https://mixed.example", {
        lookup: async (): Promise<LookupResult> => [
          { address: "203.0.113.10", family: 4 },
          { address: "10.0.0.4", family: 4 },
        ],
      }),
    /受保护的网络/,
  );
});

test("accepts a public documentation address returned by DNS", async () => {
  const result = await assertSafeOutboundUrl("https://api.example.com", {
    lookup: async (): Promise<LookupResult> => [
      { address: "203.0.113.10", family: 4 },
    ],
  });
  assert.equal(result.protocol, "https:");
  assert.equal(result.hostname, "api.example.com");
});

test("revalidates a redirect destination before fetching it", async () => {
  const fetched: string[] = [];
  const response = new Response(null, {
    status: 302,
    headers: { location: "http://redirect-internal.example/final" },
  });

  await assert.rejects(
    () =>
      fetchSafeRedirecting(
        new URL("https://public.example/start"),
        { method: "GET" },
        {
          maxRedirects: 5,
          lookup: async (hostname: string): Promise<LookupResult> => {
            if (hostname === "redirect-internal.example") {
              return [{ address: "192.168.1.10", family: 4 }];
            }
            return [{ address: "203.0.113.10", family: 4 }];
          },
          fetch: async (input: URL) => {
            fetched.push(input.href);
            return response;
          },
        },
      ),
    /受保护的网络/,
  );
  assert.deepEqual(fetched, ["https://public.example/start"]);
});

test("uses manual redirects and stops after five hops", async () => {
  const fetched: string[] = [];
  await assert.rejects(
    () =>
      fetchSafeRedirecting(
        new URL("https://redirect.example/0"),
        { method: "GET" },
        {
          maxRedirects: 5,
          lookup: async (): Promise<LookupResult> => [
            { address: "203.0.113.10", family: 4 },
          ],
          fetch: async (input: URL, init?: RequestInit) => {
            fetched.push(input.href);
            assert.equal(init?.redirect, "manual");
            const hop = Number(input.pathname.slice(1));
            return new Response(null, {
              status: 302,
              headers: { location: `https://redirect.example/${hop + 1}` },
            });
          },
        },
      ),
    /重定向/,
  );
  assert.equal(fetched.length, 6);
});

test("rejects private IPv4 values embedded in NAT64 and 6to4 literals", async () => {
  const cases = [
    ["NAT64 loopback", "http://[64:ff9b::7f00:1]/"],
    ["NAT64 private", "http://[64:ff9b::a00:1]/"],
    ["NAT64 link-local", "http://[64:ff9b::a9fe:1]/"],
    ["NAT64 metadata", "http://[64:ff9b::a9fe:a9fe]/"],
    ["6to4 loopback", "http://[2002:7f00:101::1]/"],
    ["6to4 private", "http://[2002:c0a8:1::1]/"],
    ["6to4 link-local", "http://[2002:a9fe:101::1]/"],
    ["6to4 metadata", "http://[2002:a9fe:a9fe::1]/"],
  ] as const;

  for (const [label, raw] of cases) {
    await assert.rejects(
      () => assertSafeOutboundUrl(raw),
      /受保护的网络/,
      label,
    );
  }
});

test("rejects DNS AAAA answers that embed private IPv4 addresses", async () => {
  const cases = [
    ["NAT64 DNS private", "nat64-private.example", "64:ff9b::a00:1"],
    ["6to4 DNS metadata", "six-to-four-metadata.example", "2002:a9fe:a9fe::1"],
  ] as const;

  for (const [label, hostname, address] of cases) {
    await assert.rejects(
      () =>
        assertSafeOutboundUrl(`https://${hostname}`, {
          lookup: async (resolvedHostname: string, options: { all: true; verbatim: true }): Promise<LookupResult> => {
            assert.equal(resolvedHostname, hostname);
            assert.deepEqual(options, { all: true, verbatim: true });
            return [{ address, family: 6 }];
          },
        }),
      /受保护的网络/,
      label,
    );
  }
});

test("reads a response stream without Content-Length", async () => {
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    }),
  );
  const bytes = await readResponseWithLimit(response, 3);
  assert.deepEqual([...bytes], [1, 2, 3]);
});

test("cancels and reports 413 when a response stream exceeds the limit", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );

  await assert.rejects(
    () => readResponseWithLimit(response, 3),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          (error as { status?: number }).status === 413,
      ),
  );
  assert.equal(cancelled, true);
});
