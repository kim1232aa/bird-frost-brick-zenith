"use client";

const TOOLS = [
  { href: "/image", title: "生图", copy: "选模型、写提示、出图。参考图可选。" },
  { href: "/video", title: "生视频", copy: "文生视频或首帧驱动，结果可播可下。" },
  { href: "/ecommerce", title: "电商套图", copy: "上传商品图，按平台一次出 4–9 张。" },
  { href: "/story", title: "故事导演", copy: "分析故事、定妆、分镜，再推进画布。" },
  { href: "/canvas", title: "无限画布", copy: "节点工作流：文本、角色、生图、Seedance。" },
  { href: "/library", title: "作品", copy: "回看生成结果，再编辑或送进画布。" },
];

export function DashboardPage() {
  return (
    <div className="home-hero">
      <p className="studio-kicker">无界创作台</p>
      <h1>把商品、故事和分镜一次做完</h1>
      <p className="studio-lead">生图、生视频、电商套图、故事导演、无限画布。选工具开始，不用先看接线。</p>
      <section className="home-tools">
        {TOOLS.map((tool) => (
          <a key={tool.href} href={tool.href} className="home-tool">
            <h2>{tool.title}</h2>
            <p>{tool.copy}</p>
          </a>
        ))}
      </section>
    </div>
  );
}
