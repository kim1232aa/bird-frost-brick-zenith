import type { AudioGenInput } from "./types";

/**
 * Official Token Plan / Qwen-Audio-TTS HTTP contract (not Qwen-TTS).
 * https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api
 * https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide
 *
 * Qwen-TTS (`qwen3-tts-*`) uses POST /api/v1/services/aigc/multimodal-generation/generation
 * with input.{text,voice,language_type} and must not be mixed with this path.
 */
export const DASHSCOPE_AUDIO_TTS_PATH = "/api/v1/services/audio/tts/SpeechSynthesizer";
export const DASHSCOPE_QWEN_AUDIO_PLUS_DEFAULT_VOICE = "longanlingxin";
export const DASHSCOPE_AUDIO_DEFAULT_SAMPLE_RATE = 24_000;

const DASHSCOPE_AUDIO_FORMATS = ["mp3", "pcm", "wav", "opus"] as const;
const DASHSCOPE_UNSUPPORTED_UI_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

type DashscopeAudioResponse = {
  output?: {
    audio?: {
      url?: unknown;
    };
  };
  url?: unknown;
};

export function buildDashscopeAudioBody(input: AudioGenInput): Record<string, unknown> {
  const model = String(input.model || "").trim();
  const text = String(input.prompt || "").trim();
  if (!model) throw new Error("DashScope TTS 缺少 model；已停止提交");
  if (!text) throw new Error("DashScope TTS 缺少 input.text；已停止提交");

  const format = String(input.format || "mp3")
    .trim()
    .toLowerCase();
  if (!(DASHSCOPE_AUDIO_FORMATS as readonly string[]).includes(format)) {
    throw new Error(
      `DashScope TTS 不支持音频格式“${format}”；允许：${DASHSCOPE_AUDIO_FORMATS.join("、")}`,
    );
  }

  const voice =
    String(input.voice || "").trim() ||
    (model.toLowerCase() === "qwen-audio-3.0-tts-plus"
      ? DASHSCOPE_QWEN_AUDIO_PLUS_DEFAULT_VOICE
      : "");
  if (!voice) throw new Error("DashScope TTS 要求 voice；该模型没有已验证的默认音色");
  if (DASHSCOPE_UNSUPPORTED_UI_VOICES.has(voice.toLowerCase())) {
    throw new Error(`DashScope TTS 音色“${voice}”不支持 UI 音色选项；请使用该模型的官方 voice 或已创建的 DashScope voice ID`);
  }

  const rate = input.speed;
  if (rate !== undefined && (!Number.isFinite(rate) || rate < 0.5 || rate > 2)) {
    throw new Error("DashScope TTS 的 rate 必须在 0.5 到 2 之间");
  }

  return {
    model,
    input: {
      text,
      voice,
      format,
      sample_rate: DASHSCOPE_AUDIO_DEFAULT_SAMPLE_RATE,
      ...(rate !== undefined ? { rate } : {}),
    },
  };
}

export function buildDashscopeAudioRequest(input: AudioGenInput) {
  return {
    path: DASHSCOPE_AUDIO_TTS_PATH,
    authScheme: "Bearer" as const,
    body: buildDashscopeAudioBody(input),
  };
}

function audioUrl(value: unknown) {
  const url = String(value || "").trim();
  return /^(?:https?:\/\/|blob:|data:audio\/)/i.test(url) ? url : "";
}

export function readDashscopeAudioResult(data: unknown): { url: string } {
  if (typeof data === "string") {
    const url = audioUrl(data);
    if (url) return { url };
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const response = data as DashscopeAudioResponse;
    const url = audioUrl(response.output?.audio?.url) || audioUrl(response.url);
    if (url) return { url };
  }

  throw new Error(
    `DashScope TTS 没有返回音频 URL 或可识别的音频二进制；官方路径是 ${DASHSCOPE_AUDIO_TTS_PATH}`,
  );
}
