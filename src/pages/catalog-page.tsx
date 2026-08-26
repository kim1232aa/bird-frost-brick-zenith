"use client";

import { Link } from "@tanstack/react-router";
import { catalogKey, STUDIO_CATALOG } from "@/studio/catalog";

export function CatalogPage() {
  return (
    <div className="admin-desk">
      <header className="admin-head">
        <div>
          <p className="studio-kicker">CATALOG</p>
          <h1>模型目录</h1>
          <p className="studio-hint">
            已接线的模型会出现在生图 / 生视频页。密钥请到{" "}
            <Link to="/settings">设置</Link> 自行填写，不要写进仓库。
          </p>
        </div>
      </header>
      <div className="admin-table">
        {STUDIO_CATALOG.map((item) => (
          <div key={catalogKey(item)} className="admin-row">
            <div>
              <b>{item.model}</b>
              <small>
                {item.provider} · {item.kind}
                {item.verified ? " · 已实测" : ""}
                {item.wired ? " · 已接线" : " · 待接线"}
                {item.nsfw ? " · NSFW" : ""}
              </small>
            </div>
            <p>{item.blurb}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
