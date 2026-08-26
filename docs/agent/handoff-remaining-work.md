# 交接文档 — 剩余工作清单

> 仓库：`kim1232aa/bird-frost-brick-zenith`（Grok App Builder 导出快照，需修复）
> 对照原版：`kim1232aa/Boundless-Studio`（Wails 桌面版，功能完整）
> 工作分支：`agent/audit-and-restore`
> 日期：2026-08-26

---

## 0. 先看这两个文件

- `docs/agent/audit-report.md` — 完整差距审计（功能矩阵 + UI 差距 + 修复清单 + bananapro 设计规范）
- `docs/agent/plan.md` — 总体计划

**总策略：接线 > 重写。** 大量功能代码仍在仓库里（`src/app/canvas/` 完整画布树、70KB 设置对话框、WebDAV 面板等），只是路由/事件被摘掉了。优先接回，不要重写。

---

## 1. 环境与构建

```bash
npm ci
npm run build        # = node scripts/with-app-env.mjs vite build && npm run db:migrate
```

技术栈：TanStack Start + React 19 + Tailwind v4 + Nitro(vercel) + zustand + @xyflow/react + antd + better-auth + PGlite/Neon。

已知构建期注意点：
- `src/services/api/civitai-client.ts` 里有 `import ... from "../../../wailsjs/go/main/App"`——wailsjs 是**活引用**，不能删（除非先改这里加浏览器端 fallback）。审计报告 P3 里"wailsjs 是死代码"的判断以此为准修正。
- `src/studio/story/prompts.ts` 引用 `../image-model-capabilities`，构建时确认解析路径是否正确。
- `npm ci` 较慢（曾观察到 18 分钟以上），耐心等待或换镜像。

---

## 2. P0 — 致命/安全（最先做）

1. **修 `/video` 页编译错误**：`src/pages/video-studio-page.tsx` 尾部有复制残留——1 个开标签 `<section className="bp-right">` 配了 2 个 `</section>`，删掉多余闭合即可。
2. **移除硬编码真实 API Key**：`src/studio/wiring.ts` 内有 4 条真实密钥（SuperXihe sk-… ×2、Volcengine ark-…、Civitai token）。改为环境变量/用户在设置页自配。⚠️ 这些 key 已进 git 历史，**必须通知拥有者轮换作废**，光删代码不够。
3. **修通多项目链路**：`/canvas/home` 新建/导入后跳 `/canvas/workspace?id=…`，但 Lite 画布（`FlowCanvasPage`）无视 `id`，只读单一 localStorage key `boundless-studio:canvas-graph-v7`。要么按 id 加载，要么直接做 P1-第5条换完整画布。
4. **恢复画布持久化**：Lite 版的保存/载入按钮被 CSS `.flow-side { display:none }` 隐藏，且无自动保存，刷新即丢数据。

## 3. P1 — 核心功能恢复（接线死树）

5. **完整画布路由恢复**：完整桌面移植版在 `src/app/canvas/`（`canvas-client-page.tsx` 约 770KB + 44 个组件），没有任何路由指向它；`/canvas/workspace` 目前接的是 50KB Lite 版。把路由接回完整版（推荐），Lite 版可留作轻量入口或删除。
6. **设置对话框接线**：`api-access-settings-dialog.tsx`（约 70KB，多 Key 池/模型发现/能力映射）是死树；canvas/home 的"设置"按钮 dispatch `openApiSettings()` 事件但无人监听。加监听器或直达入口。
7. **WebDAV 同步面板接线**：前端死树，后端代理活着。
8. 资产库 / AI 助手面板（44KB）/ 11 项图片工具 / Seedance2 参考槽位系统 / 故事导演 7 阶段状态机 —— 随第 5 条完整画布恢复自动回来，逐项验证。
9. **修路由**：`/login`、`/settings`、`/catalog` 目前全部 redirect 到 `/admin`，恢复或移除。
10. 独立故事导演页（约 18KB）只在死文件 `src/App.tsx` 被引用，接线或合并进画布。

## 4. P2 — UI 重做（bananapro 风格）

设计 token 和组件骨架已提取好，**直接照 `docs/agent/audit-report.md` 第四节执行**，要点：
- 亮色为主，品牌绿 `#00C758`→青 `#00D2EF` 渐变，字体 Outfit
- 生成器页骨架：左参数卡（ModelSelect→SegmentedControl→UploadZone→PromptTextarea→Slider→AspectRatioGrid→GenerateButton 全宽渐变+积分价+禁用原因）+ 右 ExamplePanel（大图+缩略图+提示词+一键回填）
- 页面骨架：header + hero + 生成器 + 案例 + 特性 + 教程 + FAQ + footer，max-w-7xl 居中
- **移动端修复**：≤1100px 时画布工具栏/inspector 目前直接 `display:none`，移动端不可用，必须修

## 5. P3 — 工程清理

- 删除确认无引用的死代码：`src/App.tsx` 手写路由、重复 CSS（studio.css 同一选择器定义 3-4 次）。删 wailsjs/ 前先处理第 1 节提到的活引用。
- `npm run build` + typecheck + 测试全绿。

## 6. 交付流程约定

- 在 `agent/audit-and-restore` 分支上继续，或另开功能分支往它上面合
- 完成 P0 即可先开一个 PR 让拥有者看；全部完成后 PR 到 main
- **改仓库状态的动作（合并 PR、关 issue、删分支）前先给拥有者看改动、等明确确认**
- 会员/额度目前是纯 localStorage 假账，至少标注，有条件再接 PGlite 后端

---

## 7. 已完成（不需要重做）

- ✅ 完整差距审计（audit-report.md）
- ✅ bananapro 三页 UI 规范提取（报告第四节，含全部设计 token）
- ✅ 修复计划与优先级划分
- ✅ 问题定位到文件级（JSX 错误位置、密钥位置、GRAPH_KEY、display:none 等均已确认）
