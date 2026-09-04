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

const { sniffMedia } = await import("../adapters/contracts.ts");
const { allImageUrls, firstImageUrl, parseStudioProxyBody, studioProxyJson } = await import("./proxy.ts");

function fill(length: number, value: number) {
  const bytes = new Uint8Array(length);
  bytes.fill(value);
  return bytes;
}

function mp4Bytes(length = 320) {
  const bytes = fill(length, 0x11);
  bytes[4] = 0x66;
  bytes[5] = 0x74;
  bytes[6] = 0x79;
  bytes[7] = 0x70;
  bytes[8] = 0x69;
  bytes[9] = 0x73;
  bytes[10] = 0x6f;
  bytes[11] = 0x6d;
  return bytes;
}

function pngBytes(length = 320) {
  const bytes = fill(length, 0x22);
  bytes[0] = 0x89;
  bytes[1] = 0x50;
  bytes[2] = 0x4e;
  bytes[3] = 0x47;
  bytes[4] = 0x0d;
  bytes[5] = 0x0a;
  bytes[6] = 0x1a;
  bytes[7] = 0x0a;
  return bytes;
}

function jpegBytes(length = 320) {
  const bytes = fill(length, 0x33);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xe0;
  return bytes;
}

function wavBytes(length = 320) {
  const bytes = fill(length, 0x44);
  bytes[0] = 0x52;
  bytes[1] = 0x49;
  bytes[2] = 0x46;
  bytes[3] = 0x46;
  bytes[8] = 0x57;
  bytes[9] = 0x41;
  bytes[10] = 0x56;
  bytes[11] = 0x45;
  return bytes;
}

function id3Mp3Bytes(length = 320) {
  const bytes = fill(length, 0x55);
  bytes[0] = 0x49;
  bytes[1] = 0x44;
  bytes[2] = 0x33;
  return bytes;
}

function parse(input: {
  ok?: boolean;
  status?: number;
  contentType: string;
  bytes: Uint8Array;
  blobType?: string;
}) {
  let blobType = "";
  const data = parseStudioProxyBody({
    ok: input.ok ?? true,
    status: input.status ?? 200,
    contentType: input.contentType,
    bytes: input.bytes,
    sniffMedia,
    createObjectUrl: (blob) => {
      blobType = blob.type;
      return `blob:${blob.type}`;
    },
  });
  if (input.blobType !== undefined) assert.equal(blobType, input.blobType);
  return data as {
    url?: string;
    status?: string;
    video?: { url?: string };
    id?: string;
    data?: unknown;
  };
}

function assertRejectedAsError(bytes: Uint8Array, contentType: string, pattern: RegExp) {
  return assert.rejects(
    async () =>
      parseStudioProxyBody({
        ok: true,
        status: 200,
        contentType,
        bytes,
        sniffMedia,
        createObjectUrl: () => "blob:should-not-use",
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, pattern);
      assert.doesNotMatch(err.message, /blob:should-not-use/);
      return true;
    },
  );
}

test("studio proxy keeps JSON Accept by default and allows media Accept overrides", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = (globalThis as { window?: unknown }).window;
  const requests: RequestInit[] = [];
  (globalThis as { window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } }).window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(init || {});
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const provider = { id: "preset-grok-relay", baseUrl: "https://relay.example.test/v1", apiKey: "caller-key", apiKeys: [] };
    await studioProxyJson({ provider, path: "/chat/completions", method: "GET" });
    await studioProxyJson({
      provider,
      path: "/videos/vid-1/content",
      method: "GET",
      accept: "video/mp4, application/octet-stream;q=0.9, */*",
    });

    assert.equal(new Headers(requests[0]?.headers).get("accept"), "application/json");
    assert.equal(new Headers(requests[0]?.headers).get("x-boundless-relay-id"), "preset-grok-relay");
    assert.equal(new Headers(requests[0]?.headers).get("x-local-relay-base-url"), null);
    assert.equal(new Headers(requests[0]?.headers).get("authorization"), null);
    assert.equal(new Headers(requests[0]?.headers).get("x-api-key"), null);
    assert.equal(JSON.stringify(requests[0]?.headers).includes("caller-key"), false);
    assert.equal(
      new Headers(requests[1]?.headers).get("accept"),
      "video/mp4, application/octet-stream;q=0.9, */*",
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test("studio ordinary relay rejects a missing provider id before fetch", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = (globalThis as { window?: unknown }).window;
  let fetchCount = 0;
  (globalThis as { window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } }).window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      studioProxyJson({
        provider: { baseUrl: "https://relay.example.test/v1", apiKey: "caller-key", apiKeys: [] },
        path: "/chat/completions",
        method: "GET",
      }),
      /relay-id|中转 ID/i,
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test("studio built-in xAI sends neither provider key nor relay-id", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = (globalThis as { window?: unknown }).window;
  let sent = new Headers();
  (globalThis as { window?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } }).window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = new Headers(init?.headers);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await studioProxyJson({
      provider: { baseUrl: "https://api.x.ai/v1", apiKey: "caller-key", apiKeys: [] },
      path: "/chat/completions",
      method: "GET",
    });
    assert.equal(sent.get("x-boundless-builtin"), "xai");
    assert.equal(sent.get("x-boundless-relay-id"), null);
    assert.equal(sent.get("authorization"), null);
    assert.equal(sent.get("x-api-key"), null);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
  }
});

test("HTML success bodies are errors, not fabricated MP4 videos", async () => {
  const html = new TextEncoder().encode(`<!DOCTYPE html><html><body>${"error page ".repeat(40)}</body></html>`);
  assert.ok(html.length > 256);
  await assertRejectedAsError(html, "text/html; charset=utf-8", /text\/html|HTML|无法识别|不是 JSON|不是可识别/i);
});

test("plain text success bodies larger than 256 bytes are errors, not videos", async () => {
  const text = new TextEncoder().encode("upstream failure: quota exceeded. ".repeat(20));
  assert.ok(text.length > 256);
  await assertRejectedAsError(text, "text/plain", /text\/plain|无法识别|不是 JSON|不是可识别/i);
});

test("unknown binary success bodies are errors, not default video/mp4", async () => {
  await assertRejectedAsError(fill(400, 7), "application/octet-stream", /octet-stream|无法识别|不是 JSON|不是可识别/i);
});

test("official OpenAI /content MP4 bytes become a video blob url", () => {
  const result = parse({
    contentType: "video/mp4",
    bytes: mp4Bytes(),
    blobType: "video/mp4",
  });
  assert.equal(result.url, "blob:video/mp4");
  assert.equal(result.status, "done");
  assert.deepEqual(result.video, { url: "blob:video/mp4" });
});

test("MP4 magic still works when Content-Type is octet-stream", () => {
  const result = parse({
    contentType: "application/octet-stream",
    bytes: mp4Bytes(),
    blobType: "video/mp4",
  });
  assert.equal(result.url, "blob:video/mp4");
  assert.deepEqual(result.video, { url: "blob:video/mp4" });
});

test("explicit video content-type is accepted even when sniffMedia cannot classify it", () => {
  const result = parse({
    contentType: "video/webm; codecs=vp9",
    bytes: fill(320, 9),
    blobType: "video/webm",
  });
  assert.equal(result.url, "blob:video/webm");
  assert.deepEqual(result.video, { url: "blob:video/webm" });
});

test("explicit audio content-type returns {url} and never a video object", () => {
  const result = parse({
    contentType: "audio/mpeg",
    bytes: fill(320, 0xab),
    blobType: "audio/mpeg",
  });
  assert.equal(result.url, "blob:audio/mpeg");
  assert.equal(result.video, undefined);
  assert.equal(result.status, undefined);
});

test("sniffed ID3 MP3 and WAV return audio urls without video", () => {
  const mp3 = parse({
    contentType: "application/octet-stream",
    bytes: id3Mp3Bytes(),
    blobType: "audio/mpeg",
  });
  assert.equal(mp3.url, "blob:audio/mpeg");
  assert.equal(mp3.video, undefined);

  const wav = parse({
    contentType: "",
    bytes: wavBytes(),
    blobType: "audio/wav",
  });
  assert.equal(wav.url, "blob:audio/wav");
  assert.equal(wav.video, undefined);
});

test("image content-type without sniffable magic is an error, not a video or image url", async () => {
  await assertRejectedAsError(fill(320, 7), "image/png", /image\/png|无法识别|不是 JSON|不是可识别/i);
});

test("sniffed PNG and JPEG return image urls usable by allImageUrls", () => {
  const png = parse({
    contentType: "application/octet-stream",
    bytes: pngBytes(),
    blobType: "image/png",
  });
  assert.equal(png.url, "blob:image/png");
  assert.equal(png.video, undefined);
  assert.deepEqual(allImageUrls(png), ["blob:image/png"]);
  assert.equal(firstImageUrl(png), "blob:image/png");

  const jpeg = parse({
    contentType: "image/jpeg",
    bytes: jpegBytes(),
    blobType: "image/jpeg",
  });
  assert.equal(jpeg.url, "blob:image/jpeg");
  assert.equal(jpeg.video, undefined);
  assert.equal(firstImageUrl(jpeg), "blob:image/jpeg");
});

test("JSON create/poll and image payloads stay JSON", () => {
  const poll = parse({
    contentType: "application/json",
    bytes: new TextEncoder().encode(JSON.stringify({ id: "video_1", status: "queued" })),
  });
  assert.equal(poll.id, "video_1");
  assert.equal(poll.status, "queued");
  assert.equal(poll.url, undefined);
  assert.equal(poll.video, undefined);

  const images = parse({
    contentType: "application/json; charset=utf-8",
    bytes: new TextEncoder().encode(JSON.stringify({ data: [{ b64_json: "abc" }] })),
  });
  assert.deepEqual(allImageUrls(images), ["data:image/png;base64,abc"]);
});

test("invalid JSON that only looks like JSON is an error, not a video", async () => {
  const truncated = new TextEncoder().encode(`{"id": "video_1", "status": "${"x".repeat(280)}"`);
  assert.ok(truncated.length > 256);
  await assertRejectedAsError(truncated, "application/json", /JSON|无法解析|无法识别|不是可识别/i);
});

test("JSON error bodies still surface the upstream payload", async () => {
  await assert.rejects(
    async () =>
      parseStudioProxyBody({
        ok: false,
        status: 400,
        contentType: "application/json",
        bytes: new TextEncoder().encode(JSON.stringify({ error: { message: "insufficient_quota" } })),
        sniffMedia,
        createObjectUrl: () => "blob:should-not-use",
      }),
    /insufficient_quota/,
  );
});

test("policy JSON errors show the message, not the raw object", async () => {
  const { formatProviderError } = await import("./proxy.ts");
  const raw = JSON.stringify({
    error: {
      code: "content_policy_violation",
      message: "生成的图片可能违反了关于裸露、色情或情色内容的防护限制。",
      type: "invalid_request_error",
    },
  });
  const text = formatProviderError(400, raw);
  assert.match(text, /防护限制/);
  assert.doesNotMatch(text, /"code"/);
});
