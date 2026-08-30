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
  baseUrl?: string;
  authScheme?: string;
  accept?: string;
  body?: unknown;
};
const proxyCalls: ProxyCall[] = [];
let proxyQueue: unknown[] = [];

mock.module(new URL("../generate/proxy.ts", import.meta.url).href, {
  namedExports: {
    allImageUrls: () => [],
    firstImageUrl: () => "",
    studioProxyJson: async (input: ProxyCall) => {
      proxyCalls.push(input);
      if (!proxyQueue.length) throw new Error(`unexpected proxy call ${input.path}`);
      const next = proxyQueue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  },
});

const { dashscopeAdapter } = await import("./dashscope.ts");
const {
  buildDashscopeAudioBody,
  buildDashscopeAudioRequest,
  DASHSCOPE_AUDIO_TTS_PATH,
  readDashscopeAudioResult,
} = await import("./dashscope-audio.ts");

const provider = {
  id: "preset-aliyun-tokenplan",
  baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
  apiKey: "sk-test",
  apiKeys: [],
  hasApiKey: true,
  adapterType: "dashscope",
  endpoints: { audio: "/api/v1/services/audio/tts/SpeechSynthesizer" },
  authScheme: "Bearer",
  protocol: "dashscope",
} as Parameters<NonNullable<typeof dashscopeAdapter.generateAudio>>[0]["provider"];

test("DashScope adapter exposes the Token Plan TTS operation", () => {
  assert.ok(dashscopeAdapter.generateAudio, "DashScope audio generation is not wired");
});

test("Token Plan qwen-audio TTS uses the official SpeechSynthesizer HTTP contract, not Qwen-TTS multimodal-generation", () => {
  assert.equal(DASHSCOPE_AUDIO_TTS_PATH, "/api/v1/services/audio/tts/SpeechSynthesizer");
  const request = buildDashscopeAudioRequest({
    model: "qwen-audio-3.0-tts-plus",
    prompt: "我家的后面有一个很大的花园。",
    voice: "longanlufeng",
    format: "wav",
    speed: 1.25,
  });
  assert.equal(request.path, "/api/v1/services/audio/tts/SpeechSynthesizer");
  assert.equal(request.authScheme, "Bearer");
  assert.deepEqual(request.body, {
    model: "qwen-audio-3.0-tts-plus",
    input: {
      text: "我家的后面有一个很大的花园。",
      voice: "longanlufeng",
      format: "wav",
      sample_rate: 24000,
      rate: 1.25,
    },
  });
  const input = request.body.input as Record<string, unknown>;
  assert.equal("language_type" in input, false);
  assert.notEqual(request.path, "/api/v1/services/aigc/multimodal-generation/generation");
});

test("Token Plan TTS maps UI speed onto the official SpeechSynthesizer rate field and rejects UI formats the HTTP contract does not accept", () => {
  const body = buildDashscopeAudioBody({
    model: "qwen-audio-3.0-tts-plus",
    prompt: "p",
    voice: "longanlingxin",
    format: "mp3",
    speed: 0.75,
  });
  const input = body.input as Record<string, unknown>;
  assert.equal(input.rate, 0.75);
  assert.equal("speed" in input, false);
  assert.throws(
    () => buildDashscopeAudioBody({ model: "qwen-audio-3.0-tts-plus", prompt: "p", format: "flac" }),
    /不支持音频格式“flac”|mp3.*pcm.*wav.*opus/,
  );
  assert.throws(
    () => buildDashscopeAudioBody({ model: "qwen-audio-3.0-tts-plus", prompt: "p", speed: 0.25 }),
    /rate 必须在 0\.5 到 2/,
  );
  assert.throws(
    () => buildDashscopeAudioBody({ model: "qwen-audio-3.0-tts-plus", prompt: "p", speed: 4 }),
    /rate 必须在 0\.5 到 2/,
  );
});

test("readDashscopeAudioResult unwraps the official non-streaming output.audio.url", () => {
  assert.equal(
    readDashscopeAudioResult({
      request_id: "ee88b03d-0457-9286-8c67-xxxxxxxxxxxx",
      output: {
        finish_reason: "stop",
        audio: {
          data: "",
          url: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/pre/audio.wav",
          id: "audio_ee88b03d-0457-9286-8c67-xxxxxxxxxxxx",
          expires_at: 1772697707,
        },
      },
    }).url,
    "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/pre/audio.wav",
  );
});

test("DashScope qwen-audio TTS sends the native request and unwraps the documented URL", async () => {
  proxyCalls.length = 0;
  proxyQueue = [{ output: { audio: { url: "https://dashscope-result.example/audio.wav" } } }];
  const generateAudio = dashscopeAdapter.generateAudio;
  assert.ok(generateAudio);

  const result = await generateAudio(
    { provider },
    {
      model: "qwen-audio-3.0-tts-plus",
      prompt: "你好，世界。",
      voice: "longanlufeng",
      format: "wav",
      speed: 1.25,
    },
  );

  assert.equal(result.url, "https://dashscope-result.example/audio.wav");
  assert.equal(proxyCalls.length, 1);
  assert.equal(proxyCalls[0]?.baseUrl, "https://token-plan.cn-beijing.maas.aliyuncs.com");
  assert.equal(proxyCalls[0]?.path, "/api/v1/services/audio/tts/SpeechSynthesizer");
  assert.equal(proxyCalls[0]?.authScheme, "Bearer");
  assert.equal(proxyCalls[0]?.accept, "audio/*, application/octet-stream;q=0.9, */*");
  assert.deepEqual(proxyCalls[0]?.body, {
    model: "qwen-audio-3.0-tts-plus",
    input: {
      text: "你好，世界。",
      voice: "longanlufeng",
      format: "wav",
      sample_rate: 24000,
      rate: 1.25,
    },
  });
});

test("DashScope qwen-audio TTS uses a documented plus voice and mp3 by default", () => {
  assert.deepEqual(buildDashscopeAudioBody({ model: "qwen-audio-3.0-tts-plus", prompt: "p" }), {
    model: "qwen-audio-3.0-tts-plus",
    input: { text: "p", voice: "longanlingxin", format: "mp3", sample_rate: 24000 },
  });
});

test("DashScope audio adapter accepts the proxy URL produced for binary audio responses", async () => {
  proxyCalls.length = 0;
  proxyQueue = [{ url: "blob:audio/wav" }];
  const generateAudio = dashscopeAdapter.generateAudio;
  assert.ok(generateAudio);
  const result = await generateAudio(
    { provider },
    { model: "qwen-audio-3.0-tts-plus", prompt: "p", format: "wav" },
  );
  assert.equal(result.url, "blob:audio/wav");
  assert.equal(readDashscopeAudioResult({ url: "blob:audio/wav" }).url, "blob:audio/wav");
});

test("DashScope audio builder rejects formats outside the official TTS contract", () => {
  assert.throws(
    () => buildDashscopeAudioBody({ model: "qwen-audio-3.0-tts-plus", prompt: "p", format: "aac" }),
    /不支持音频格式|mp3.*pcm.*wav.*opus/,
  );
});

test("DashScope qwen-audio rejects OpenAI-only UI voices before submission", () => {
  assert.throws(
    () => buildDashscopeAudioBody({ model: "qwen-audio-3.0-tts-plus", prompt: "p", voice: "alloy" }),
    /音色.*不支持|longanlingxin.*longanlufeng/,
  );
});
