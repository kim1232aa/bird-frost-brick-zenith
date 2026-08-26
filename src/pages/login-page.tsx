"use client";

import { Link } from "@tanstack/react-router";

export function LoginPage() {
  return (
    <div className="home-hero">
      <p className="studio-kicker">ACCOUNT</p>
      <h1>本地创作台</h1>
      <p className="studio-lead">
        当前 Web 版以浏览器本地会话为主。会员积分是 localStorage 假账，仅用于界面演示，不会向服务器扣费。
      </p>
      <p className="studio-hint">API Key 请在设置页自行填写，或通过环境变量注入。运营上下架在 /admin。</p>
      <section className="home-tools">
        <Link to="/settings" className="home-tool">
          <h2>接线 / 设置</h2>
          <p>填写中转 Base URL 和 API Key。</p>
        </Link>
        <Link to="/canvas/home" className="home-tool">
          <h2>无限画布</h2>
          <p>多项目列表，打开完整桌面移植版画布。</p>
        </Link>
        <Link to="/admin" className="home-tool">
          <h2>运营</h2>
          <p>模型上下架与本地额度（演示用）。</p>
        </Link>
      </section>
    </div>
  );
}
