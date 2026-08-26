import type { StudioAdapter } from "./types";
import { allImageUrls, firstImageUrl, studioProxyJson } from "@/studio/generate/proxy";
import { imageRefs } from "@/studio/image-refs";

/** International API-Inference. The wired token is from modelscope.ai, not .cn. */
const MODELSCOPE_IMAGE_BASE = "https://api-inference.modelscope.ai/v1";

function modelscopeBase(raw?: string) {
  const value = String(raw || "").trim() || MODELSCOPE_IMAGE_BASE;
  return value.replace(/api-inference\.modelscope\.cn/gi, "api-inference.modelscope.ai").replace(/\/+$/, "");
}

function taskIdOf(data: Record<string, unknown>) {
  return String(data.task_id || data.taskId || (data.data as { task_id?: string } | undefined)?.task_id || "").trim();
}

async function pollImageTask(
  ctx: Parameters<NonNullable<StudioAdapter["generateImage"]>>[0],
  taskId: string,
  baseUrl: string,
) {
  for (let i = 0; i < 40; i += 1) {
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl,
      path: `/tasks/${encodeURIComponent(taskId)}`,
      method: "GET",
      timeoutMs: 30_000,
      extraHeaders: { "X-ModelScope-Task-Type": "image_generation" },
    });
    const status = String(data.task_status || data.status || "").toUpperCase();
    const urls = allImageUrls(data);
    if (["SUCCEED", "SUCCEEDED", "SUCCESS", "COMPLETED"].includes(status) || urls[0]) {
      if (!urls[0]) throw new Error("ModelScope 任务完成但没有图片地址");
      return urls;
    }
    if (["FAILED", "CANCELED", "CANCELLED", "ERROR"].includes(status)) {
      throw new Error(String(data.message || data.error || status));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  throw new Error("ModelScope 生图超时，请稍后重试");
}

export const modelscopeAdapter: StudioAdapter = {
  id: "modelscope",
  label: "ModelScope 魔搭",
  docs: "https://www.modelscope.ai/docs/model-service/API-Inference/intro",
  async generateImage(ctx, input) {
    const baseUrl = modelscopeBase(ctx.provider.baseUrl);
    const refs = imageRefs(input);
    const editing = input.operation === "edit" || /qwen-image-edit/i.test(input.model);
    if (editing && !refs.length) throw new Error("Qwen-Image-Edit 需要至少一张参考图");
    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      n: input.n || 1,
      ...(input.size ? { size: input.size } : {}),
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
    };
    if (refs.length === 1) {
      body.image_url = refs[0];
      body.image = refs[0];
    } else if (refs.length > 1) {
      body.image = refs;
      body.images = refs;
    }
    const data = await studioProxyJson<Record<string, unknown>>({
      provider: ctx.provider,
      baseUrl,
      path: "/images/generations",
      extraHeaders: { "X-ModelScope-Async-Mode": "true" },
      body,
      timeoutMs: 60_000,
    });
    const id = taskIdOf(data);
    if (id) {
      const urls = await pollImageTask(ctx, id, baseUrl);
      return { url: urls[0], urls };
    }
    const urls = allImageUrls(data);
    const url = urls[0] || firstImageUrl(data);
    if (!url) throw new Error("ModelScope 没有返回图片。编辑请用 Qwen/Qwen-Image-Edit，生图用 Qwen/Qwen-Image。");
    return { url, urls: urls.length ? urls : [url] };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 ModelScope Access Token" };
    const baseUrl = modelscopeBase(ctx.provider.baseUrl);
    try {
      await studioProxyJson({
        provider: ctx.provider,
        baseUrl,
        path: "/images/generations",
        extraHeaders: { "X-ModelScope-Async-Mode": "true" },
        body: { model: "Tongyi-MAI/Z-Image-Turbo", prompt: "probe", n: 1 },
        timeoutMs: 20_000,
      });
      return { ok: true, message: "魔搭推理端点可用" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      if (/401|invalid|unauthorized|forbidden/i.test(message)) return { ok: false, message: `Token 被拒绝：${message.slice(0, 160)}` };
      if (/404|not found/i.test(message)) return { ok: false, message: `端点 404。Base 应为 ${MODELSCOPE_IMAGE_BASE}` };
      return { ok: true, message: `端点在，厂商返回：${message.slice(0, 160)}` };
    }
  },
};
