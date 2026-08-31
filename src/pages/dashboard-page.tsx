"use client";

import { Link } from "@tanstack/react-router";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { CurrentModelsCard } from "@/studio/current-models";

const TOOLS = [
  { href: "/image", title: "生图", copy: "选模型、写提示，一次出图数量按当前模型合同。" },
  { href: "/edit", title: "编辑", copy: "参考图上限按当前模型合同提交，不会只传第一张。" },
  { href: "/video", title: "生视频", copy: "文生视频。首尾帧走独立入口。" },
  { href: "/i2v", title: "图生视频", copy: "必填首帧，尾帧可选，火山 last_frame 已接通。" },
  { href: "/ecommerce", title: "电商套图", copy: "上传商品图，按平台一次出 4–9 张。" },
  { href: "/story", title: "故事导演", copy: "分析故事、定妆、分镜，再推进画布。" },
  { href: "/canvas", title: "无限画布", copy: "节点工作流：文本、角色、生图、Seedance。" },
  { href: "/library", title: "作品", copy: "回看、ZIP 导入导出，再送进画布。" },
] as const;

const FEATURES = [
  { n: "01", title: "多模型接线", copy: "Seedream、GPT Image、Grok Imagine、Civitai 等，在设置里填自己的中转。" },
  { n: "02", title: "无限画布", copy: "完整节点工作流：文本、角色、生图、视频、故事导演和 Seedance 参考槽。" },
  { n: "03", title: "电商套图", copy: "一张商品图按平台方案连出主图、细节和场景，再打包 ZIP。" },
  { n: "04", title: "故事导演", copy: "拆角色、定妆、分镜，再把镜头送进画布继续改。" },
] as const;

const STEPS = [
  { n: "1", title: "选工具", copy: "生图、视频、电商或故事导演，从首页一键进入。" },
  { n: "2", title: "写提示或上传", copy: "用模板起步，也可以丢一张参考图。" },
  { n: "3", title: "生成", copy: "按钮会写明积分和禁用原因，结果在右侧预览。" },
  { n: "4", title: "带走", copy: "下载、再编辑，或送进无限画布做分镜。" },
] as const;

const FAQS = [
  {
    q: "积分会不会真扣？",
    a: "会。生成成功后从本账号额度账本扣点，失败不扣。模型调用走你在设置里选的供应商 Key，不是代扣别家平台。",
  },
  {
    q: "API Key 写在哪里？",
    a: "打开顶栏的设置页，点哪个供应商就编辑哪个。不要把密钥提交进仓库。也可以用环境变量注入内置模板。",
  },
  {
    q: "画布刷新会丢吗？",
    a: "完整画布会按项目自动保存到本机。从画布首页新建或导入后进入工作区，刷新后节点还在。",
  },
  {
    q: "手机上能用画布吗？",
    a: "可以。工具栏和检查器在窄屏会收成底部可滚动条和抽屉，不再被直接藏掉。",
  },
] as const;

export function DashboardPage() {
  return (
    <div>
      <div className="home-hero">
        <p className="studio-kicker">无界创作台</p>
        <h1>把商品、故事和分镜一次做完</h1>
        <p className="studio-lead">生图、生视频、电商套图、故事导演、无限画布。选工具开始，密钥只写在设置里。</p>
        <CurrentModelsCard />
        <section className="home-tools">
          {TOOLS.map((tool) => (
            <Link key={tool.href} to={tool.href} className="home-tool">
              <h2>{tool.title}</h2>
              <p>{tool.copy}</p>
            </Link>
          ))}
        </section>
      </div>

      <section className="home-section">
        <p className="studio-kicker">案例</p>
        <h2>点一张就能带进生图页</h2>
        <p>这些是标明模型来源的参考样张，用来看布局和提示词。点进去不会改你当前选的供应商。</p>
        <div className="case-masonry">
          {GALLERY_SEED.map((item) => (
            <Link key={item.id} to={item.kind === "video" ? "/video" : "/image"} className="case-card">
              {item.kind === "video" ? <video src={item.urls[0]} muted playsInline /> : <img src={item.urls[0]} alt="" />}
              <span>
                {item.title}
                <br />
                {item.prompt}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <p className="studio-kicker">能力</p>
        <h2>从单张图到整条工作流</h2>
        <div className="feature-grid">
          {FEATURES.map((item) => (
            <article key={item.n} className="feature-card">
              <b>{item.n}</b>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <p className="studio-kicker">怎么用</p>
        <h2>四步出片</h2>
        <div className="step-grid">
          {STEPS.map((item) => (
            <article key={item.n} className="step-card">
              <b>STEP {item.n}</b>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <p className="studio-kicker">常见问题</p>
        <h2>先看这几条</h2>
        <div className="faq-list">
          {FAQS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <p>
          无界创作台 · <Link to="/settings">设置接线</Link> · <Link to="/catalog">模型目录</Link> ·{" "}
          <Link to="/account">账户</Link>
        </p>
      </footer>
    </div>
  );
}
