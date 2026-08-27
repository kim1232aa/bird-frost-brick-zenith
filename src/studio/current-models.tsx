"use client";

import { Link } from "@tanstack/react-router";
import { findCatalog } from "@/studio/catalog";
import { liveCard } from "@/studio/ops";
import { preferredImageKey, preferredTextKey, preferredVideoKey, StudioModelField } from "@/studio/model-select";
import { useCurrentModels } from "@/studio/current-models-store";
import { useStudioSession } from "@/studio/session";

function slot(kind: "text" | "image" | "video", value: string) {
  const card = findCatalog(value, kind);
  const live = card ? liveCard(card) : undefined;
  return {
    model: card?.model || value.split("::")[1] || "未选",
    provider: card?.provider || "",
    wired: Boolean(live?.wired),
  };
}

export function CurrentModelsCard() {
  useStudioSession((state) => state.relays);
  const text = useCurrentModels((state) => state.text) || preferredTextKey();
  const image = useCurrentModels((state) => state.image) || preferredImageKey();
  const video = useCurrentModels((state) => state.video) || preferredVideoKey();
  const setKind = useCurrentModels((state) => state.setKind);
  const textSlot = slot("text", text);
  const imageSlot = slot("image", image);
  const videoSlot = slot("video", video);

  return (
    <section className="acct-card" style={{ marginBottom: 24 }}>
      <div className="acct-card-head">
        <div>
          <p className="studio-kicker">现在用的模型</p>
          <h2>这三项就是各页默认选中的模型</h2>
        </div>
        <Link to="/settings" className="studio-ghost">
          去设置填密钥
        </Link>
      </div>
      <p className="studio-hint">
        不是写死的 Grok。这里改了，生图 / 生视频 / 故事导演打开时会带着这个选择。密钥在设置里按供应商填，选哪个供应商就走哪个，不会偷偷换线路。
      </p>
      <div className="acct-stats">
        <article className="acct-stat">
          <span>文本</span>
          <strong>{textSlot.model}</strong>
          <span>
            {textSlot.provider || "未选供应商"} · {textSlot.wired ? "已接线" : "待接线"}
          </span>
          <StudioModelField kind="text" value={text} onChange={(value) => setKind("text", value)} label="改文本模型" />
        </article>
        <article className="acct-stat">
          <span>生图</span>
          <strong>{imageSlot.model}</strong>
          <span>
            {imageSlot.provider || "未选供应商"} · {imageSlot.wired ? "已接线" : "待接线"}
          </span>
          <StudioModelField kind="image" value={image} onChange={(value) => setKind("image", value)} label="改生图模型" />
        </article>
        <article className="acct-stat">
          <span>生视频</span>
          <strong>{videoSlot.model}</strong>
          <span>
            {videoSlot.provider || "未选供应商"} · {videoSlot.wired ? "已接线" : "待接线"}
          </span>
          <StudioModelField kind="video" value={video} onChange={(value) => setKind("video", value)} label="改视频模型" />
        </article>
      </div>
    </section>
  );
}
