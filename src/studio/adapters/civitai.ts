import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { imageRefs } from "@/studio/image-refs";

type Extra = {
  imageUrl?: string;
  imageUrls?: string[];
  width?: number;
  height?: number;
  seed?: number;
  negativePrompt?: string;
  quantity?: number;
  n?: number;
  loras?: Record<string, number> | Readonly<Record<string, number>>;
};

export type CivitaiEngine = {
  id: string;
  label: string;
  kind: "image" | "video";
  nsfw: boolean;
  tags: string[];
  body: (prompt: string, extra?: Extra) => Record<string, unknown>;
};

function refsOf(extra?: Extra) {
  return [...(extra?.imageUrls || []), ...(extra?.imageUrl ? [extra.imageUrl] : [])].filter(Boolean).slice(0, 3);
}

function qty(extra?: Extra) {
  return Math.max(1, Math.min(4, extra?.quantity || extra?.n || 1));
}

function loraPatch(extra?: Extra) {
  return extra?.loras && Object.keys(extra.loras).length ? { loras: extra.loras } : {};
}

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
      quantity: qty(extra),
      ...(typeof extra?.seed === "number" ? { seed: extra.seed } : {}),
      ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
      imageMetadata: JSON.stringify({ app: "boundless-studio", engine: "krea2-turbo" }),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
      ...loraPatch(extra),
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
      quantity: qty(extra),
      imageMetadata: JSON.stringify({ app: "boundless-studio", engine: "krea2-raw" }),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
      ...loraPatch(extra),
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
      quantity: qty(extra),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
      ...loraPatch(extra),
    }),
  },
  {
    id: "flux2-klein",
    label: "Flux 2 Klein",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Flux2", "便宜", "编辑"],
    body: (prompt, extra) => ({
      engine: "flux2",
      model: "klein",
      operation: refsOf(extra).length ? "editImage" : "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: qty(extra),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
    }),
  },
  {
    id: "flux2-pro",
    label: "Flux 2 Pro",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Flux2", "编辑"],
    body: (prompt, extra) => ({
      engine: "flux2",
      model: "pro",
      operation: refsOf(extra).length ? "editImage" : "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: qty(extra),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
    }),
  },
  {
    id: "z-image-turbo",
    label: "Z-Image Turbo",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Z-Image"],
    body: (prompt, extra) => ({
      engine: "sdcpp",
      ecosystem: "z-image",
      model: "turbo",
      operation: refsOf(extra).length ? "createVariant" : "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: qty(extra),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
      ...loraPatch(extra),
    }),
  },
  {
    id: "civitai-grok",
    label: "Grok Image (Civitai)",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Grok", "编辑"],
    body: (prompt, extra) => ({
      engine: "grok",
      operation: refsOf(extra).length ? "editImage" : "createImage",
      prompt,
      ...(extra?.width ? { width: extra.width } : {}),
      ...(extra?.height ? { height: extra.height } : {}),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
    }),
  },
  {
    id: "flux2-dev",
    label: "Flux 2 Dev",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Flux2", "编辑"],
    body: (prompt, extra) => ({
      engine: "flux2",
      model: "dev",
      operation: refsOf(extra).length ? "editImage" : "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: qty(extra),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
    }),
  },
  {
    id: "sdxl",
    label: "SDXL",
    kind: "image",
    nsfw: true,
    tags: ["mature", "SDXL", "LoRA"],
    body: (prompt, extra) => ({
      engine: "comfy",
      ecosystem: "sdxl",
      operation: "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: qty(extra),
      ...(extra?.negativePrompt ? { negativePrompt: extra.negativePrompt } : {}),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
      ...loraPatch(extra),
    }),
  },
  {
    id: "anima",
    label: "Anima",
    kind: "image",
    nsfw: true,
    tags: ["mature", "动漫", "LoRA"],
    body: (prompt, extra) => ({
      engine: "comfy",
      ecosystem: "anima",
      operation: "createImage",
      prompt,
      width: extra?.width || 1024,
      height: extra?.height || 1024,
      quantity: qty(extra),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
      ...loraPatch(extra),
    }),
  },
  {
    id: "qwen-3.0-pro",
    label: "Qwen Image 3.0 Pro",
    kind: "image",
    nsfw: true,
    tags: ["mature", "Qwen", "编辑"],
    body: (prompt, extra) => ({
      engine: "qwen",
      model: "3.0-pro",
      operation: refsOf(extra).length ? "editImage" : "createImage",
      prompt,
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
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
      quantity: qty(extra),
      ...(extra?.width ? { width: extra.width } : {}),
      ...(extra?.height ? { height: extra.height } : {}),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
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
      quantity: qty(extra),
      ...(extra?.width ? { width: extra.width } : {}),
      ...(extra?.height ? { height: extra.height } : {}),
      ...(refsOf(extra).length ? { images: refsOf(extra) } : {}),
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
      ...(extra?.imageUrl || extra?.imageUrls?.length ? { images: refsOf(extra) } : {}),
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
  return readCivitaiMediaUrls(data)[0] || "";
}

export function readCivitaiMediaUrls(data: unknown) {
  if (!data || typeof data !== "object") return [];
  const record = data as {
    images?: Array<{ url?: string; available?: boolean }>;
    videos?: Array<{ url?: string; available?: boolean }>;
    jobs?: Array<{ result?: { blobUrl?: string; blobUrlExpired?: boolean } }>;
    steps?: Array<{ output?: { videos?: Array<{ url?: string; available?: boolean }>; images?: Array<{ url?: string; available?: boolean }> } }>;
  };
  const stepMedia = (record.steps || []).flatMap((step) => [...(step.output?.videos || []), ...(step.output?.images || [])]);
  const media = [...(record.images || []), ...(record.videos || []), ...stepMedia];
  const urls = media.filter((item) => item.url && item.available !== false).map((item) => String(item.url).trim());
  const fallback = media.filter((item) => item.url).map((item) => String(item.url).trim());
  const jobUrl = String(record.jobs?.[0]?.result?.blobUrl || "").trim();
  return Array.from(new Set([...urls, ...fallback, ...(jobUrl ? [jobUrl] : []), ...allImageUrls(data)]));
}

function readJobId(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as { jobs?: Array<{ id?: string }>; id?: string; jobId?: string; token?: string };
  return String(record.jobs?.[0]?.id || record.jobId || record.id || record.token || "").trim();
}

const CIVITAI_WORKFLOWS = "https://orchestration.civitai.com/v2/consumer";

function workflowBody(type: "imageGen" | "videoGen", input: Record<string, unknown>) {
  return {
    allowMatureContent: true,
    currencies: ["yellow"],
    steps: [{ $type: type, input }],
  };
}

export const civitaiAdapter: StudioAdapter = {
  id: "civitai",
  label: "Civitai Orchestration",
  docs: "https://developer.civitai.com/orchestration/guide/submitting-work",
  async generateImage(ctx, input) {
    if (!ctx.provider.apiKey) throw new Error("Civitai 需要 API Token");
    const engine = civitaiEngine(input.model);
    const refs = imageRefs(input);
    if (input.operation === "edit" && !refs.length) throw new Error("编辑需要至少一张参考图");
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: "/workflows?wait=60&allowMatureContent=true",
      body: workflowBody(
        "imageGen",
        engine.body(input.prompt, {
          imageUrl: refs[0],
          imageUrls: refs,
          width: input.width,
          height: input.height,
          seed: input.seed,
          negativePrompt: input.negativePrompt,
          quantity: input.n || 1,
          n: input.n,
          loras: input.loras,
        }),
      ),
      timeoutMs: 180_000,
      baseUrl: CIVITAI_WORKFLOWS,
    });
    const urls = readCivitaiMediaUrls(data);
    if (!urls[0]) throw new Error(civitaiError(data) || "Civitai 没有返回图片地址");
    return { url: urls[0], urls };
  },
  async createVideo(ctx, input) {
    if (!ctx.provider.apiKey) throw new Error("Civitai 需要 API Token");
    const engine = civitaiEngine(input.model);
    const frames = [input.imageUrl, input.lastFrameUrl].filter(Boolean) as string[];
    const inputBody: Record<string, unknown> = {
      ...engine.body(input.prompt, { imageUrl: frames[0], imageUrls: frames }),
      duration: input.duration || 5,
      width: 1280,
      height: 720,
      fps: 24,
    };
    if (engine.id === "ltx2.3") {
      inputBody.model = "22b-distilled";
      if (frames.length) {
        inputBody.operation = "firstLastFrameToVideo";
        inputBody.images = frames;
      }
    }
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: "/workflows?wait=0&allowMatureContent=true",
      body: workflowBody("videoGen", inputBody),
      timeoutMs: 90_000,
      baseUrl: CIVITAI_WORKFLOWS,
    });
    const id = readJobId(data);
    const url = readCivitaiMediaUrl(data);
    if (url) return { id: id || `done:${url}` };
    if (!id) throw new Error(civitaiError(data) || "Civitai 视频没有返回任务 id");
    return { id };
  },
  async pollVideo(ctx, taskId) {
    if (taskId.startsWith("done:")) return { status: "completed", url: taskId.slice(5) };
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: `/workflows/${encodeURIComponent(taskId)}`,
      method: "GET",
      timeoutMs: 30_000,
      baseUrl: CIVITAI_WORKFLOWS,
    });
    const url = readCivitaiMediaUrl(data);
    if (url) return { status: "completed", url };
    const record = data as { status?: string; jobs?: Array<{ status?: string; error?: string }>; error?: string };
    const status = String(record.status || record.jobs?.[0]?.status || "").toLowerCase();
    if (["failed", "error", "cancelled"].includes(status)) {
      return { status: "failed", error: civitaiError(data) || status };
    }
    return { status: "pending" };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 Civitai Token" };
    try {
      await studioProxyJson({
        provider: ctx.provider,
        path: "/workflows?wait=0&whatif=true&allowMatureContent=true",
        body: workflowBody("imageGen", {
          engine: "comfy",
          ecosystem: "krea2",
          model: "turbo",
          operation: "createImage",
          prompt: "connectivity probe",
          width: 1024,
          height: 1024,
        }),
        timeoutMs: 20_000,
        baseUrl: CIVITAI_WORKFLOWS,
      });
      return { ok: true, message: "Civitai workflows 可访问", models: CIVITAI_ENGINES.map((item) => item.id) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Civitai 不可达" };
    }
  },
};

function civitaiError(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const record = data as {
    error?: string | { message?: string };
    message?: string;
    jobs?: Array<{ error?: string; errorMessage?: string }>;
    steps?: Array<{ error?: string }>;
  };
  const nested = typeof record.error === "string" ? record.error : record.error?.message;
  return String(nested || record.message || record.jobs?.[0]?.error || record.jobs?.[0]?.errorMessage || record.steps?.[0]?.error || "").trim();
}
