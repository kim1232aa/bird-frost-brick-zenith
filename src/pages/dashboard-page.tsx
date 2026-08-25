"use client";

import { STUDIO_NAV } from "@/shell/nav";
import { catalogKey } from "@/studio/catalog";
import { liveCatalog, useOpsStore } from "@/studio/ops";
import { useStudioSession } from "@/studio/session";
import { STUDIO_PROVIDERS } from "@/studio/wiring";

const TOOLS = [
  { href: "/image", title: "生图工作室", copy: "按厂商分组选模型。参数随模型切换。右侧是样张和结果。", model: "image" },
  { href: "/video", title: "生视频", copy: "Grok Imagine 已实测。Seedance Agent Plan、Civitai LTX 可选。", model: "video" },
  { href: "/ecommerce", title: "电商套图", copy: "产品描述或参考图，按平台一次出分镜。", model: "套图" },
  { href: "/story", title: "故事导演", copy: "可选文本模型。分析、定妆、分镜，再推进画布当节点。", model: "story" },
  { href: "/canvas", title: "无限画布", copy: "文本 / 角色 / 生图 / Seedance / 故事导演节点，可连线运行。", model: "xyflow" },
  { href: "/admin", title: "运营后台", copy: "接线、模型上下架、额度发放、审计日志。", model: "admin" },
];

function hrefFor(kind: string, providerId: string, model: string) {
  const key = `${providerId}::${model}`;
  if (kind === "video") return `/video?model=${encodeURIComponent(key)}`;
  if (kind === "text") return `/story?text=${encodeURIComponent(key)}`;
  if (kind === "audio") return `/canvas`;
  return `/image?model=${encodeURIComponent(key)}`;
}

export function DashboardPage() {
  useOpsStore((state) => state.unlisted);
  useStudioSession((state) => state.relays);
  const wired = STUDIO_PROVIDERS.filter((item) => item.enabled && item.apiKey);
  const ready = liveCatalog(undefined, true);
  const waiting = liveCatalog(undefined, false).filter((item) => !item.wired);
  return (
    <div className="studio-dash">
      <section className="studio-hero">
        <p className="studio-kicker">STUDIO</p>
        <h1>出图、出视频、出分镜，按厂商官方字段接线</h1>
        <p className="studio-lead">
          已启用 {wired.length} 条中转，前台可生成 {ready.length} 个已上架模型。点卡片会进入对应工作台并预选该模型。
        </p>
      </section>
      <section className="studio-tool-grid">
        {TOOLS.map((tool) => (
          <a key={tool.href} href={tool.href} className="studio-tool-card">
            <div className="studio-tool-meta">{tool.model}</div>
            <h2>{tool.title}</h2>
            <p>{tool.copy}</p>
          </a>
        ))}
      </section>
      <h2 className="studio-section-title">已接线模型 · 点进去就能选中</h2>
      <section className="studio-tool-grid">
        {ready.map((item) => (
          <a key={catalogKey(item)} href={hrefFor(item.kind, item.providerId, item.model)} className="studio-tool-card">
            <div className="studio-tool-meta">
              {item.provider} · {item.kind}
              {item.nsfw ? " · NSFW" : " · 安全"} · {item.cost}
            </div>
            <h2>{item.model}</h2>
            <p>{item.blurb}</p>
            <p>{item.tags.join(" · ")}</p>
          </a>
        ))}
      </section>
      <h2 className="studio-section-title">待接线（原版槽位，填密钥即出现在生成页）</h2>
      <section className="studio-tool-grid">
        {waiting.slice(0, 12).map((item) => (
            <a key={`${item.providerId}-${item.model}`} href="/settings" className="studio-tool-card">
              <div className="studio-tool-meta">
                {item.provider} · 待接线
              </div>
              <h2>{item.model}</h2>
              <p>{item.blurb}</p>
            </a>
          ))}
      </section>
      <p className="studio-footnote">{STUDIO_NAV.map((item) => item.label).join(" / ")}</p>
    </div>
  );
}
