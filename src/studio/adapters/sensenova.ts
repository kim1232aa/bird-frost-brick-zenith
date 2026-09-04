import type { ImageGenInput, StudioAdapter } from "./types.ts";
import { collectImageRefs } from "../image-refs.ts";
import { SAFE_IMAGE_REF_CAP, studioEndpoint } from "./contracts.ts";

function isSenseNovaU1Fast(model: string) {
  return /u1-fast/i.test(model);
}

function isSenseNovaU15(model: string) {
  return /u1\.5/i.test(model);
}

export function planSenseNovaImageRequest(input: ImageGenInput): { path: string; body: Record<string, unknown> } {
  const refs = collectImageRefs(input, SAFE_IMAGE_REF_CAP);
  if (refs.length && isSenseNovaU1Fast(input.model)) {
    throw new Error("SenseNova U1 Fast 不支持图像输入 / 参考图。请改用 U1.5 Lite 的 /images/edits。");
  }
  if (isSenseNovaU15(input.model) && (input.n || 1) !== 1) {
    throw new Error("SenseNova U1.5 仅允许 n=1。");
  }
  const editing = refs.length > 0;
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    size: input.size || "2048x2048",
    n: isSenseNovaU15(input.model) ? 1 : input.n || 1,
  };
  if (editing) body.images = refs.map((image_url) => ({ image_url }));
  return {
    path: editing ? "/images/edits" : "/images/generations",
    body,
  };
}

export const sensenovaAdapter: StudioAdapter = {
  id: "sensenova",
  label: "商汤日日新",
  docs: "https://platform.sensenova.cn/",
  async generateImage(ctx, input) {
    const { allImageUrls, studioProxyJson } = await import("@/studio/generate/proxy");
    const planned = planSenseNovaImageRequest(input);
    const path =
      planned.path === "/images/edits"
        ? "/images/edits"
        : studioEndpoint(ctx.provider.endpoints, "images", "/images/generations");
    const data = await studioProxyJson({
      provider: ctx.provider,
      path,
      body: planned.body,
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    if (!urls[0]) throw new Error("日日新生图没有返回图片");
    return { url: urls[0], urls };
  },
  async generateText(ctx, input) {
    const { studioProxyJson } = await import("@/studio/generate/proxy");
    const data = await studioProxyJson<{ choices?: Array<{ message?: { content?: string } }> }>({
      provider: ctx.provider,
      path: studioEndpoint(ctx.provider.endpoints, "chat", "/chat/completions"),
      body: {
        model: input.model,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          input.imageUrl
            ? {
                role: "user",
                content: [
                  { type: "text", text: input.prompt },
                  { type: "image_url", image_url: { url: input.imageUrl } },
                ],
              }
            : { role: "user", content: input.prompt },
        ],
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      },
      timeoutMs: input.timeoutMs || 90_000,
    });
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("日日新没有返回文本");
    return { text };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey && !ctx.provider.hasApiKey) return { ok: false, message: "缺少 SenseNova Key" };
    try {
      const { studioProxyJson } = await import("@/studio/generate/proxy");
      const data = await studioProxyJson<{ data?: Array<{ id?: string }> }>({
        provider: ctx.provider,
        path: "/models",
        method: "GET",
        timeoutMs: 20_000,
      });
      const models = (data.data || []).map((item) => String(item.id || "")).filter(Boolean);
      return { ok: true, message: `日日新已连通（${models.length} 模型）`, models: models.slice(0, 40) };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "连接失败" };
    }
  },
};
