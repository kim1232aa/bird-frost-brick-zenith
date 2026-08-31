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

type ProxyCall = {
  path: string;
  method?: string;
  accept?: string;
  body?: unknown;
};
const proxyCalls: ProxyCall[] = [];
let proxyQueue: unknown[] = [];

mock.module(new URL("../generate/proxy.ts", import.meta.url).href, {
  namedExports: {
    allImageUrls: () => [],
    studioProxyJson: async (input: ProxyCall) => {
      proxyCalls.push(input);
      if (!proxyQueue.length) throw new Error(`unexpected proxy call ${input.path}`);
      const next = proxyQueue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  },
});

const { openaiCompatAdapter } = await import("./openai-compat.ts");

const provider = {
  id: "openai-official",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-test",
  apiKeys: [],
  protocol: "openai-official",
  endpoints: {},
} as Parameters<NonNullable<typeof openaiCompatAdapter.pollVideo>>[0]["provider"];

test("official OpenAI video content requests a media Accept value", async () => {
  proxyCalls.length = 0;
  proxyQueue = [{ status: "completed" }, { url: "blob:video/mp4" }];
  const pollVideo = openaiCompatAdapter.pollVideo;
  assert.ok(pollVideo);

  const result = await pollVideo({ provider }, "vid 1");

  assert.deepEqual(result, { status: "completed", url: "blob:video/mp4" });
  assert.equal(proxyCalls.length, 2);
  assert.equal(proxyCalls[0]?.path, "/videos/vid%201");
  assert.equal(proxyCalls[0]?.accept, undefined);
  assert.equal(proxyCalls[1]?.path, "/videos/vid%201/content");
  assert.equal(proxyCalls[1]?.method, "GET");
  assert.equal(proxyCalls[1]?.accept, "video/mp4, application/octet-stream;q=0.9, */*");
});

test("OpenAI-compatible relay forwards more than five video references without an invented cap", async () => {
  proxyCalls.length = 0;
  proxyQueue = [{ id: "vid-relay" }];
  const relayProvider = {
    ...provider,
    id: "relay",
    baseUrl: "https://relay.example.com/v1",
    protocol: "openai-compat",
  };
  const createVideo = openaiCompatAdapter.createVideo;
  assert.ok(createVideo);
  const imageUrls = Array.from({ length: 6 }, (_, index) => `https://example.test/${index}.png`);

  const created = await createVideo({ provider: relayProvider }, { model: "relay-video", prompt: "p", imageUrls });

  assert.deepEqual(created, { id: "vid-relay" });
  assert.equal(proxyCalls.length, 1);
  assert.deepEqual((proxyCalls[0]?.body as { image_urls?: string[] }).image_urls, imageUrls);
});

test("OpenAI-compatible TTS requests an audio Accept value", async () => {
  proxyCalls.length = 0;
  proxyQueue = [{ url: "blob:audio/mpeg" }];
  const generateAudio = openaiCompatAdapter.generateAudio;
  assert.ok(generateAudio);

  const result = await generateAudio({ provider }, { model: "tts-1", prompt: "p" });

  assert.deepEqual(result, { url: "blob:audio/mpeg" });
  assert.equal(proxyCalls.length, 1);
  assert.equal(proxyCalls[0]?.path, "/audio/speech");
  assert.equal(proxyCalls[0]?.accept, "audio/*, application/octet-stream;q=0.9, */*");
});
