# Boundless-Studio Web 版差距审计与修复计划

## 背景
- 原版: github.com/kim1232aa/Boundless-Studio (Wails 桌面应用, Go + React 19, 功能完整)
- 改版: github.com/kim1232aa/bird-frost-brick-zenith (Vite + React Web 版, 功能被砍, UI 未达参考标准)
- UI 参考: bananapro.site 的 gpt-image-2 / grok-imagine-video-15 / seedance2 页面
- 用户无偏好, 由 Orchestrator 决定: 审计 → 修复 → 新分支 + PR 交付

## Stage 1 — 差距审计 (explore 子代理并行)
- 1a. 原版功能清单: 读取 Boundless-Studio 的 docs/FEATURE_COMPARISON.md + frontend/src 结构, 输出完整功能矩阵
- 1b. 改版现状盘点: 读取 bird-frost-brick-zenith 的 src/routes, src/pages, src/app, src/studio, server, AGENTS.md, 列出现有功能与缺口
- 1c. bananapro 参考站 UI 分析: 抓取三个参考页面, 总结布局/配色/组件/交互风格
- 输出: /mnt/agents/output/audit-report.md (功能差距矩阵 + UI 差距 + 修复清单)

## Stage 2 — 修复实施 (加载 vibecoding-webapp-swarm + swarm-workspace 技能)
- 搭建工作区 (git worktree / 本地克隆)
- 按审计清单分组委派 coder 子代理:
  - 2a. 画布/节点/工作流核心功能恢复
  - 2b. API 中继/模型路由 (Web 版需 server 侧实现)
  - 2c. 项目/资产管理与导入导出
  - 2d. UI 按 bananapro 风格重做
- 每批完成后 reviewer 子代理审查, WARNING/REVISE 则派 fix 子代理

## Stage 3 — 验证与交付
- 构建 + typecheck + 测试通过
- 推送新分支到 kim1232aa/bird-frost-brick-zenith, 创建 Pull Request
- 输出修复说明
