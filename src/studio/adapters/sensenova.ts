import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";
import { imageRefs } from "@/studio/image-refs";

export const sensenovaAdapter: StudioAdapter = {
  id: "sensenova",
  label: "商汤日日新",
  docs: "https://platform.sensenova.cn/",
  async generateImage(ctx, input) {
    const refs = imageRefs(input);
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: "/images/generations",
      body: {
        model: input.model,
        prompt: input.prompt,
        size: input.size || "2048x2048",
        n: input.n || 1,
        ...(refs[0] ? { image: refs[0] } : {}),
        ...(refs.length > 1 ? { images: refs } : {}),
      },
      timeoutMs: 120_000,
    });
    const urls = allImageUrls(data);
    if (!urls[0]) throw new Error("日日新生图没有返回图片");
    return { url: urls[0], urls };
  },
  async generateText(ctx, input) {
    const data = await studioProxyJson<{ choices?: Array<{ message?: { content?: string } }> }>({
      provider: ctx.provider,
      path: "/chat/completions",
      body: {
        model: input.model,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt },
        ],
      },
    });
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) throw new Error("日日新没有返回文本");
    return { text };
  },
  async testConnection(ctx) {
    if (!ctx.provider.apiKey) return { ok: false, message: "缺少 SenseNova Key" };
    try {
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
