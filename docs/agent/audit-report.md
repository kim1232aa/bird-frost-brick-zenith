# bird-frost-brick-zenith 差距审计报告

> 对比基准: Boundless-Studio v1.1.0 (桌面版, 约 80 项功能) + bananapro.site 三个生成器页面 UI
> 审计日期: 2026-08-26

---

## 一、核心结论

改版仓库是 **Grok App Builder 导出快照**（仅 3 个 "Export from Grok" commit），不是正常维护的工程。它把桌面版的功能以"**代码保留、路由摘除**"的方式砍掉：

- 完整桌面移植版画布在 `src/app/canvas/`（`canvas-client-page.tsx` 单文件 770KB + 44 个组件），**没有任何路由指向它**——`/canvas/workspace` 被改接到 50KB 的 Lite 版 `FlowCanvasPage`。
- 大量功能（高级设置、WebDAV 同步、AI 助手、资产管理、Seedance2 脸部编辑等）代码都在，UI 进不去。

**修复总策略：接线 > 重写。** 把死树重新接回路由，修断头路，再按 bananapro 风格重做 UI。

---

## 二、功能差距矩阵

### 画布系统
| 功能 | 原版 | 改版现状 | 处置 |
|---|---|---|---|
| 完整 7 种富节点（文本/图片/视频/音频/配置/故事导演/Seedance2 工作流） | ✅ | ❌ 死树；live 是 10 节点 Lite 版 | 恢复完整画布路由 |
| 画布 AI 助手面板（44KB） | ✅ | ❌ 死树 | 接线 |
| 图片工具：裁剪/拆分/放大/蒙版/图层/角度/对比/人脸编辑/派生视图 | ✅ 11 项 | ⚠️ Lite 仅 5 项简化版；完整版在死树 | 接线完整版 |
| Seedance2 参考槽位系统（首帧/尾帧/关键帧/12+ 槽位） | ✅ | ❌ 死树 | 接线 |
| 故事导演分阶段状态机（7 阶段 + 版本快照） | ✅ | ⚠️ Lite 有简化版；完整版死树 | 接线完整版 |
| 生成历史面板 / 批量生图节点 / 右键菜单 / 缩放控件 | ✅ | ❌ | 接线 |
| 撤销重做/小地图/连线 | ✅ | ✅ Lite 有 | 保留 |

### 设置与路由
| 功能 | 原版 | 改版现状 | 处置 |
|---|---|---|---|
| 完整设置对话框（70KB，多 Key 池/模型发现/能力映射/板块路由） | ✅ | ❌ 死树；canvas/home 的"设置"是死按钮（事件无人监听） | 接线 + 监听 |
| `/local-relay-proxy` 同源中继 | ✅ Go 版 | ✅ server 端已实现（含 SSRF 防护） | 保留 |
| 中转预设 | ✅ 用户自配 | ⚠️ **硬编码 4 条真实 API Key 入库** | 🔴 安全修复：移除密钥，改为用户配置 |
| WebDAV 同步 | ✅ | ❌ 前端死树（后端代理活着） | 接线 |

### 项目与资产管理
| 功能 | 原版 | 改版现状 | 处置 |
|---|---|---|---|
| 多项目管理 | ✅ | 🔴 断头路：/canvas/home 新建/导入后跳 `/canvas/workspace?id=…`，但 Lite 画布无视 id 只读单一 localStorage key | 修通 |
| ZIP 导入/导出（v3 校验） | ✅ | ⚠️ 首页有，但导入后打不开 | 修通 |
| 资产库 / 资产选择器 | ✅ | ❌ 死树 | 接线 |
| 画布持久化 | ✅ SQLite | 🔴 Lite 版保存/载入按钮被 CSS `display:none` 隐藏，无自动保存，刷新即丢 | 修复 |

### 页面级问题
| 页面 | 状态 | 处置 |
|---|---|---|
| `/video` VideoStudioPage | 🔴 **疑似 JSX 不闭合编译错误**（尾部复制残留，1 开 2 合 `</section>`） | 必须修复 |
| `/login`、`/settings`、`/catalog` | ❌ 全部 redirect 到 /admin | 恢复或移除 |
| 独立故事导演页（18KB，功能完整） | ❌ 只在死文件 App.tsx 被引用 | 接线或合并 |
| 会员/额度 | ⚠️ 纯 localStorage 假账 | 至少标注，或接 PGlite 后端 |

### UI 差距（对照 bananapro 规范）
| 项 | bananapro 基准 | 改版现状 |
|---|---|---|
| 主题 | 亮色为主 + 暗色可选，品牌绿 `#00C758`→青 `#00D2EF` 渐变 | 深色 `#101014` 自写 CSS |
| 字体 | Outfit | DM Sans + Noto Sans SC |
| 生成器布局 | 左参数卡 + 右示例/结果卡（max-w-7xl），分段选择器/比例卡网格/滑块/虚线上传区 | 简化双栏工作台 |
| 生成按钮 | 全宽渐变（图：绿→青；视频：橙系）+ 积分价 + 禁用原因 | 无此规范 |
| 上传区 | 虚线绿边框 `#5FE9B5` + 浅绿底 `#D0FAE5` | 无 |
| 页面骨架 | header + hero + 生成器 + 案例 + 特性 + 教程 + FAQ + footer | 顶栏 + 全高工具页 |
| 移动端 | 完整可用 | 🔴 ≤1100px 画布工具栏/inspector 直接 `display:none`，移动端不可用 |

### 代码质量
- 🔴 真实 API Key（火山 ark-…、Civitai token 等 4 条）提交进 git —— 必须移除并轮换
- 死代码体量超过 live 代码（App.tsx 手写路由、wailsjs/、desktop-updater、整个 src/app/canvas 树）
- studio.css 同一选择器重复定义 3-4 次；GRAPH_KEY 已迭代到 v7
- 适配器层/代理层/ZIP 校验质量不错，可保留

---

## 三、修复清单（按优先级）

### P0 — 致命/安全
1. 修复 `/video` 页 JSX 语法错误
2. 移除 wiring.ts 硬编码 API Key，改为环境变量/用户配置
3. 修通多项目链路：workspace 按 id 加载项目，ZIP 导入能打开
4. 恢复画布持久化（自动保存 + 保存/载入按钮可见）

### P1 — 核心功能恢复（接线死树）
5. 完整画布路由恢复：`/canvas/workspace` 接回 `src/app/canvas` 完整版（或把 Lite 缺失能力逐项补齐——推荐前者）
6. 设置对话框接线（事件监听或直达入口）
7. WebDAV 同步面板接线
8. 资产库/AI 助手/图片工具/Seedance2 系统随完整画布恢复
9. 修复 `/login`、`/settings`、`/catalog` 路由

### P2 — UI 重做（bananapro 风格）
10. 全站设计 token 替换（配色/字体/圆角/阴影），亮色为主
11. 生成器页（图/视频/电商）按"左参数卡+右示例卡"骨架重做：分段选择器、比例卡网格、虚线上传区、渐变生成按钮（带积分价+禁用原因）、示例回填
12. 首页 hero + 案例 + 特性 + 教程 + FAQ 骨架
13. 移动端响应式修复（画布工具栏/inspector 不再 display:none）

### P3 — 工程清理
14. 删除死代码（App.tsx 手写路由、wailsjs/、重复 CSS）
15. typecheck + build + 测试全绿

---

## 四、UI 设计规范（bananapro 实测提取，编码代理照此执行）

```css
--brand-green: #00C758; --brand-green-light: #05DF72; --brand-cyan: #00D2EF;
--accent-purple: #AC4BFF; --accent-orange: #F99C00;
--gen-btn-image: linear-gradient(90deg, #05DF72, #00D2EF);
--gen-btn-video: linear-gradient(90deg, #FFBC67, #FFAB68);
--bg: #FFFFFF; --card-bg: #FFFFFF; --card-border: #E2E8F0;
--upload-bg: #D0FAE5; --upload-border: #5FE9B5; /* dashed 2px */
--selected-bg: #E5F8F1; --selected-border: #00C758;
--banner-info-bg: #F5F4FF; --banner-warn-bg: #FFF7ED;
--text-primary: #0F172A; --text-secondary: #64748B; --text-muted: #94A3B8;
--slider-blue: #1D68F9;
--radius-sm: 8px; --radius-md: 10px; --radius-lg: 14px; --radius-card: 16px;
--shadow-card: 0 1px 3px rgba(0,0,0,.05);
font-family: 'Outfit', system-ui, sans-serif;
```

组件：PromoBanner / sticky Header / HeroTitle(渐变文字) / AlertBanner(紫info/橙warn) /
GeneratorPanel(ModelSelect→SegmentedControl→UploadZone→PromptTextarea(计数+魔法棒)→Slider→Select→AspectRatioGrid→Collapsible→GenerateButton(全宽渐变+积分+禁用原因)) /
ExamplePanel(大图+缩略图条+提示词+使用提示回填) / CaseMasonry / FeatureCards(01-04) /
StepsCards / FAQAccordion / Footer。
布局：max-w-7xl 居中；生成器区 lg:grid-cols-[1.15fr_1fr] gap-6；4px 栅格。
交互：异步轮询 loading + 预计时长；示例一键回填提示词；未满足条件按钮禁用写明原因。
