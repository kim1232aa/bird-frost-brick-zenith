import type { StudioAdapter } from "./types";
import { firstImageUrl, studioProxyJson } from "@/studio/generate/proxy";

export const sensenovaAdapter: StudioAdapter = {
  id: "sensenova",
  label: "商汤日日新",
  docs: "https://platform.sensenova.cn/",
  async generateImage(ctx, input) {
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: "/images/generations",
      body: {
        model: input.model,
        prompt: input.prompt,
        size: input.size || "2048x2048",
        n: 1,
      },
      timeoutMs: 120_000,
    });
    const url = firstImageUrl(data);
    if (!url) throw new Error("日日新生图没有返回图片");
    return { url };
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
