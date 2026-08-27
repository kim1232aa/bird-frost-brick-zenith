import type { StudioAdapter } from "./types";
import { allImageUrls, studioProxyJson } from "@/studio/generate/proxy";

const U1_SIZES: Record<string, string> = {
  "1:1": "2048x2048",
  "16:9": "2752x1536",
  "9:16": "1536x2752",
  "3:4": "1760x2368",
  "4:3": "2368x1760",
  "2:3": "1664x2496",
  "3:2": "2496x1664",
};

function sensenovaSize(size?: string) {
  const raw = String(size || "").trim();
  if (/^\d+x\d+$/i.test(raw)) return raw;
  if (U1_SIZES[raw]) return U1_SIZES[raw];
  return "2048x2048";
}

export const sensenovaAdapter: StudioAdapter = {
  id: "sensenova",
  label: "商汤日日新",
  docs: "https://platform.sensenova.cn/docs",
  async generateImage(ctx, input) {
    const data = await studioProxyJson({
      provider: ctx.provider,
      path: "/images/generations",
      body: {
        model: input.model || "sensenova-u1-fast",
        prompt: input.prompt,
        size: sensenovaSize(input.size),
        n: input.n || 1,
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
      return { ok: true, message: `日日新已连通（${models.length} 模型）`, models };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "连接失败" };
    }
  },
};
