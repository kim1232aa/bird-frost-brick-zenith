# 交接文档 — 剩余工作清单

> 仓库：`kim1232aa/bird-frost-brick-zenith`
> 对照原版：`kim1232aa/Boundless-Studio` / `xshentx/Boundless-Studio`
> 工作分支：`agent/audit-and-restore`
> 日期：2026-08-26（主题/接线修复回合）

---

## 0. 先看这两个文件

- `docs/agent/audit-report.md` — 完整差距审计
- `docs/agent/plan.md` — 总体计划

**总策略：接线 > 重写。**

---

## 本回合已修

1. **无限画布一点变黑**
   - `CanvasProviders` 在 `config.hydrated === false` 时渲染全屏黑壳；预览环境 desktop storage 抛错会卡住 hydration。
   - 全站 CSS 把 `html,body` 写死 `#101014`，画布首页再叠 `bg-[#0B0B0F]`。
   - 修复：主题默认 light；hydration 2.5s fail-open；loading 改为 `#f4f2ed`；新增 `src/studio-light.css`；`StudioRuntime` 同步主题 class。

2. **设置里 provider 手动启用仍显示关闭**
   - persist merge 用旧的 `enabled: false` 盖过接线表；列表用 `enabled && apiKey` 判断。
   - 画布走 `useConfigStore`，设置页走 session，双 store 不同步。
   - 修复：session persist v4 + `mergePersistedRelays()`；runtime 把 session relays 写回 config store。
   - 点「恢复内置密钥」会重新灌入接线表。

3. **Civitai 测试 token**
   - `src/studio/wiring.ts` → `preset-civitai`：`29d622653173c1960a0952118df72f49`，`enabled: true`。
   - 测试密钥临时使用，用完请轮换。未新增 `.env`。

4. **Boundless 画布对齐**
   - `/canvas/home` → 完整项目库
   - `/canvas/workspace` → 完整 770KB `canvas-client-page.tsx`
   - `ApiAccessSettingsDialog` 已挂在 `CanvasProviders`

---

## 仍待处理

- 测试密钥已进 git 历史，必须轮换。
- ZIP 导入 / `?id=` 实机验证。
- 移动端 ≤1100px 工具栏仍可能被藏。
- bananapro 生成器骨架未完整落地。
- 会员/额度仍是 localStorage 假账。

## 验证清单

1. `/settings`：SuperXihe / 火山 / Civitai 显示「启用」。
2. 若仍关闭：点「恢复内置密钥」，或清 `boundless-studio:session`。
3. 「无限画布」应是浅色项目库，不应停在纯黑屏。
4. 「新建画布」进入完整节点画布。
5. 测完立刻轮换 token。
