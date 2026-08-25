import type { StudioAdapter } from "./types";
import { studioProxyJson } from "@/studio/generate/proxy";

type Extra = { imageUrl?: string; width?: number; height?: number; seed?: number; negativePrompt?: string };

export type CivitaiEngine = {
  id: string;
  label: string;
  kind: "image" | "video";
  nsfw: boolean;
  tags: string[];
  body: (prompt: string, extra?: Extra) => Record<string, unknown>;
};

export const CIVITAI_ENGINES: CivitaiEngine[] = [
  {
    id: "krea2-turbo",
    label: "Krea 2 Turbo",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Comfy"],
    body: (prompt, extra) => ({
      engine: "comfy",
      ecosystem: "krea2",
      model: "turbo",
      operation: "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: 1,
      ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
      ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
      imageMetadata: JSON.stringify({ app: "boundless-studio", engine: "krea2-turbo" }),
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "krea2-raw",
    label: "Krea 2 Raw",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Comfy"],
    body: (prompt, extra) => ({
      engine: "comfy",
      ecosystem: "krea2",
      model: "raw",
      operation: "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: 1,
      imageMetadata: JSON.stringify({ app: "boundless-studio", engine: "krea2-raw" }),
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "flux1",
    label: "Flux 1",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Flux"],
    body: (prompt, extra) => ({
      engine: "comfy",
      ecosystem: "flux1",
      operation: "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: 1,
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "flux2-dev",
    label: "Flux 2 Dev",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Flux"],
    body: (prompt, extra) => ({
      engine: "flux2",
      model: "dev",
      operation: "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: 1,
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "sdxl",
    label: "SDXL",
    kind: "image",
    nsfw: true,
    tags: ["mature", "SDXL"],
    body: (prompt, extra) => ({
      engine: "comfy",
      ecosystem: "sdxl",
      operation: "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: 1,
      ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "anima",
    label: "Anima",
    kind: "image",
    nsfw: true,
    tags: ["mature", "动漫"],
    body: (prompt, extra) => ({
      engine: "comfy",
      ecosystem: "anima",
      operation: "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: 1,
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "qwen-3.0-pro",
    label: "Qwen Image 3.0 Pro",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Qwen"],
    body: (prompt, extra) => ({
      engine: "qwen",
      model: "3.0-pro",
      operation: extra?.imageUrl ? "editImage" : "createImage",
      prompt,
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "seedream-4.5",
    label: "Seedream 4.5",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Seedream"],
    body: (prompt, extra) => ({
      engine: "seedream",
      version: "v4.5",
      prompt,
      enableSafetyChecker: false,
      quantity: 1,
      ...(extra?.width ? { width: extra.width } : {}),
      ...(extra?.height ? { height: extra.height } : {}),
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "seedream-5.0-pro",
    label: "Seedream 5.0 Pro",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Seedream"],
    body: (prompt, extra) => ({
      engine: "seedream",
      version: "v5.0-pro",
      prompt,
      enableSafetyChecker: false,
      quantity: 1,
      ...(extra?.width ? { width: extra.width } : {}),
      ...(extra?.height ? { height: extra.height } : {}),
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "ltx2.3",
    label: "LTX 2.3",
    kind: "video",
    nsfw: true,
    tags: ["mature", "视频"],
    body: (prompt, extra) => ({
      engine: "ltx2.3",
      operation: extra?.imageUrl ? "firstLastFrameToVideo" : "createVideo",
      prompt,
      ...(extra?.imageUrl ? { images: [extra.imageUrl] } : {}),
    }),
  },
  {
    id: "hunyuan",
    label: "Hunyuan Video",
    kind: "video",
    nsfw: true,
    tags: ["mature", "视频"],
    body: (prompt) => ({ engine: "hunyuan", prompt }),
  },
];

export function civitaiEngine(model: string) {
  return CIVITAI_ENGINES.find((item) => item.id === model) || CIVITAI_ENGINES[0];
}

export function readCivitaiMediaUrl(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as {
    images?: Array<{ url?: string; available?: boolean }>;
    videos?: Array<{ url?: string; available?: boolean }>;
    jobs?: Array<{ result?: { blobUrl?: string; blobUrlExpired?: boolean } }>;
  };
  const media = [...(record.images || []), ...(record.videos || [])];
  const ready = media.find((item) => item.url && item.available !== false) || media.find((item) => item.url);
  if (ready?.url) return String(ready.url).trim();
  const jobUrl = record.jobs?.[0]?.result?.blobUrl;
  return String(jobUrl || "").trim();
}

function readJobId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as { jobs?: Array<{ id?: string }>; id?: string; jobId?: string };
  return String(record.jobs?.[0]?.id || record.jobId || record.id || "").trim();
}

export const civitaiAdapter: StudioAdapter = {
  id: "civitai",
  label: "Civitai Orchestration",
  docs: "https://developer.civitai.com/docs/api/orchestration",
  async generateImage(ctx, input) {
    if (!ctx.provider.apiKey) throw new Error("Civitai 需要 API Token");
    const engine = civitaiEngine(input.model);
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: "/imageGen?wait=1",
      body: engine.body(input.prompt, {
        imageUrl: input.imageUrl,
        width: input.width,
        height: input.height,
        seed: input.seed,
        negativePrompt: input.negativePrompt,
      }),
      timeoutMs: 180_000,
    });
    const url = readCivitaiMediaUrl(data);
    if (!url) throw new Error("Civitai 没有返回图片地址");
    return { url };
  },
  async createVideo(ctx, input) {
    if (!ctx.provider.apiKey) throw new Error("Civitai 需要 API Token");
    const engine = civitaiEngine(input.model);
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: "/videoGen?wait=0",
      body: engine.body(input.prompt, { imageUrl: input.imageUrl }),
      timeoutMs: 60_000,
    });
    const id = readJobId(data);
    const url = readCivitaiMediaUrl(data);
    if (url) return { id: id || `done:${url}` };
    if (!id) throw new Error("Civitai 视频没有返回任务 id");
    return { id };
  },
  async pollVideo(ctx, taskId) {
    if (taskId.startsWith("done:")) return { status: "completed", url: taskId.slice(5) };
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: `/jobs/${encodeURIComponent(taskId)}`,
      method: "GET",
      timeoutMs: 30_000,
      baseUrl: "https://orchestration.civitai.com/v2/consumer",
    });
    const url = readCivitaiMediaUrl(data);
    if (url) return { status: "completed", url };
    const record = data as { jobs?: Array<{ status?: string; error?: string }> };
    const status = String(record.jobs?.[0]?.status || "").toLowerCase();
    if (["failed", "error", "cancelled"].includes(status)) {
      return { status: "failed", error: record.jobs?.[0]?.error || status };
    }
    return { status: "pending" };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Civitai Token" };
    try {
      await studioProxyJson({
        provider: ctx.provider,
        path: "/imageGen?wait=0",
        body: {
          $type: "imageGen",
          engine: "comfy",
          ecosystem: "krea2",
          model: "turbo",
          operation: "createImage",
          prompt: "probe",
          width: 64,
          height: 64,
          quantity: 1,
        },
        timeoutMs: 20_000,
      });
      return { ok: true, message: "生图端点 POST /imageGen 可用" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/404/i.test(message)) return { ok: false, message: `Civitai /imageGen 404：${message}` };
      if (/401|403|invalid|unauthorized|token|buzz|parameter|engine/i.test(message)) {
        return { ok: true, message: `生图端点在，厂商返回：${message.slice(0, 160)}` };
      }
      return { ok: false, message };
    }
  },
};
