# 交接文档 — 剩余工作清单

> 仓库：`kim1232aa/bird-frost-brick-zenith`
> 正确对照：`basketikun/infinite-canvas`（浅色 Vite 无限画布）
> 错误对照：`kim1232aa/Boundless-Studio`（暗色 Next 移植，禁止再照搬）
> 工作分支：`agent/audit-and-restore`
> 日期：2026-08-27（无限画布浅色纠偏 + 代办续做）

---

## 0. 策略

**接线 > 重写。** 770KB `canvas-client-page.tsx`、Seedance2、故事导演、ZIP、`?id=` 一律保留，不准删功能。

无限画布视觉应对齐 `basketikun/infinite-canvas`：
- 项目库 / 工作区底 `#f7f5f1` / `#f4f2ed`
- 品牌强调 `#00C758` `#00D2EF`
- 不使用 Boundless-Studio `#0B0B0F` / `#101014` / `#0c0c10` 作为画布默认底

---

## 本回合已修

1. 项目库从暗色 `bg-[#0B0B0F]` 改成浅色 `canvas-home-shell`，TanStack `navigate({ to: "/canvas/workspace", search: { id } })` 打开项目。
2. 项目卡片改白底 + 品牌选中色，打开项目走 TanStack 而不是 Next `router.push`。
3. `CanvasProviders` 进入画布时去掉 `html.dark`，Ant 主题固定 light，避免 persist 里的旧 dark 把整页刷黑。
4. `studio-light.css` 覆盖 `studio.css` 的 `#101014` / `.flow-board #0c0c10`，即便残留 `html.dark` 画布仍是浅色。
5. Next 兼容层补 `tanstack-router-sync`，`?id=` 与返回项目库不再脱节。
6. `styles.css` 补上 `studio-kit.css`（多参考图 / LoRA / jobs / ≤1100px 工具栏）。
7. 主题 persist 升到 v3，迁移时强制 light，清掉 `infinite-canvas:theme_store` 里的旧 dark。

---

## 仍待处理

- 测试密钥已进 git 历史，必须轮换（ModelScope / Hugging Face / 其它 live key）。
- ZIP 导入 / `?id=` 打开项目需要实机点一次确认。
- BananaPro 生成器骨架（jobs ledger）已有 store，完整远端账本未接。
- 会员/额度仍是 localStorage 假账（`MEMBERSHIP_IS_LOCAL_MOCK`），界面已标「本地演示」。
- 770KB 工作区内部个别节点 chrome 若仍偏暗，只改皮肤，不删 Seedance2 / 故事导演。

## 验证清单

1. `/canvas`、`/canvas/home` 是浅米底项目库，不是纯黑屏。
2. 新建画布进入 `/canvas/workspace?id=`，工作区底是 `#f4f2ed`，工具栏在 ≤1100px 仍可见。
3. 导入 ZIP、导出 ZIP、删除/重命名项目功能都在。
4. `/image` `/edit` `/i2v` `/frames` `/account` `/settings` 不 404。
5. 测完立刻轮换 token。
