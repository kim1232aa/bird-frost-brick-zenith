# 交接文档 — 当前修复状态与剩余工作

> ⚠️ 本文档写于 2026-09-04，已过期。最新交接见 `docs/agent/handoff-2026-09-14.md`。

> 仓库：`kim1232aa/bird-frost-brick-zenith`
> 分支：`main`
> 日期：2026-09-04
> 当前目标：每个板块都要前台真实点击、真实生成、截图验收；不能绕过 API；错误必须定位并修复，不能切换 provider 掩盖。

---

## 1. 当前工作树性质

这次提交是一个大范围交接快照，包含此前多轮修复和本回合修复。不要把它理解成“全部目标已完成”。

已验证过的基础命令：

- `npm run typecheck`：通过（最近一次在本交接文档写入前执行）。
- 定向 Canvas 测试：`canvas-generation-model` / `canvas-standalone-video-model` / `seedance2-workflow` 共 8 项通过。
- 先前凭据定向测试共 65 项通过；完整 `npm test` 曾在“空视频节点后续改动”前达到 863 pass / 0 fail。
- 先前 `npm run build` 曾通过；但本回合 Config 模式切换修复之后，**尚未重新跑完整测试与生产构建**，接手后必须先补跑。

---

## 2. 本回合已完成的修复

### 2.1 Config 节点模式切换回归

问题：无限画布“生成配置”节点从「生图」切到「视频」后，模型选择器仍显示 `Grok 中转 · grok-imagine-image`，预检和积分也继续拿图片模型，导致视频操作/参数被锁死。

根因：

- `canvas-config-node-panel.tsx` 的 Segmented 只写 `generationMode`，没有改 `model/modelProviderId`。
- `canvas-generation-model.ts` 对显式 `{providerId, model}` 直接短路，不校验 provider 对目标 capability 的分类。

已修：

- `src/app/canvas/components/canvas-config-node-panel.tsx`
  - `Segmented.onChange` 已接线到 `changeGenerationMode`。
  - 切到视频时写入 `standaloneSeedance2VideoModelPatch(...)`，并清掉旧视频参数快照。
  - 切回其它模式时写入该模式路由解析出的模型/供应商。
- `src/app/canvas/utils/canvas-generation-model.ts`
  - 对显式 provider/model 增加能力分类校验。
  - provider 明确把模型分类到其它能力时，不再把旧模型伪装成当前模式选择；回退到当前模式路由。
  - 未知/不透明模型仍不擅自猜 provider，保持 fail-closed。
- 新增 `src/app/canvas/utils/canvas-generation-model.test.ts`
  - RED→GREEN 覆盖：视频模式不得复用显式分类为 image 的 `grok-imagine-image`。
  - 测试 mock 了配置存储边界，避免导入真实配置时启动 PGLite。

仍需页面验收：

- 本地截图 RED 证据：`temp/qa/image-host-vault/07-generation-config-video-tab.png`。
- 修复后的 GREEN 页面截图尚未重新跑；需要重建隔离环境再验收。

### 2.2 原生图片任务凭据边界

已移除浏览器任务快照/恢复链路中的明文 `apiKey`：

- `src/services/api/native-image-task.ts`
- `src/services/api/dashscope.ts`
- `src/services/api/sensenova.ts`
- `src/services/api/image.ts`
- 新增/更新：
  - `src/services/api/native-image-adapters.credentials.test.ts`
  - `src/services/api/native-image-task.test.ts`
  - `src/services/api/image-civitai-routing.test.ts`
  - `src/services/api/image.relay-vault.test.ts`

原则：任务恢复只携带明确 `credentialId`；不得用 raw key 反查 ID；快照、恢复对象、Civitai observer 均不含明文 key。

### 2.3 图床 vault 保存/恢复生命周期

已修：

- `src/stores/use-config-store.ts`
  - `useConfigHydrationRuntimeStore` 增加非持久化 `imageHostCredentialError`。
  - hydrate 失败不再 unhandled rejection，不覆盖最后已知 marker，错误可见。
  - 保存失败提示 `图床密钥库保存失败：...` 并原样抛出；成功清旧错误。
  - `persistApiSettingsBeforeClose` 支持 `reportError(error)`，失败不关窗。
- `src/studio/runtime.tsx`
  - `pagehide` / `visibilitychange` 尽力 `flushConfigStore()`。
- `src/app/canvas/components/canvas-image-settings-popover.tsx`
  - pending 图床 Key 时关闭前等待保存；失败 toast 且保持弹窗。
- `src/app/canvas/components/canvas-video-settings-popover.tsx`
  - 同样关窗保存。
  - 图床 Base URL/Key 只写全局 transient config，不再写入节点 metadata。
- `src/components/image-settings-panel.tsx` / `video-settings-panel.tsx`
  - 显示图床保存错误。
  - 视频面板支持 `onImageHostCredentialBlur`，故事工作流失焦即可保存。
- `src/app/canvas/workspace/canvas-client-page.tsx`
  - 已接入失焦保存。

### 2.4 空视频节点模型/参数状态分裂

已修：

- `src/app/canvas/utils/seedance2-workflow.ts` / `.mjs`
  - 新建视频占位节点同时写 `model`、`seedanceModel`、`modelProviderId`。
- `src/app/canvas/utils/canvas-standalone-video-model.ts`
  - 参数门闩可直接接受 provider/model selection。
- `src/app/canvas/workspace/canvas-client-page.tsx`
  - 底栏创建和连线创建视频节点都固定当前 provider/model。
  - 创建 callback 依赖完整 `effectiveConfig`，避免切换路由后创建旧模型节点。
- `src/app/canvas/components/canvas-node.tsx`
  - 参数门闩改用与模型选择器相同的解析。
  - 新节点 6 秒不再误标“旧节点只读”。

---

## 3. 已做过的环境/QA 状态

### 3.1 隔离镜像与容器

已有：

- `boundless-studio:test-v9` / `boundless-studio-clean-v9`
- `boundless-studio:test-v10` / `boundless-studio-clean-v10`

注意：

- 这些镜像是在 Config 模式切换最终接线前构建的，**不包含最新修复**。
- 不要覆盖/删除旧容器；下一步应新建 `boundless-studio:test-v11` / `boundless-studio-clean-v11`。

### 3.2 QA 脚本

脚本：`temp/qa/ui-image-host-vault.mjs`

当前用途：只点击页面和截图，不点击生成。

已知正确选择器：

```js
const configNode = page.locator(".node-element")
  .filter({ has: page.locator(".canvas-config-mode") })
  .last();
await configNode
  .locator(".canvas-config-mode label.ant-segmented-item")
  .filter({ hasText: /^视频$/ })
  .click();
```

要求：

- 浏览器串行。
- 每次测试前清理测试 Profile 的旧标签页。
- 不允许脚本或 `curl` 直接调生成 API。
- 真实生成只能点击前台按钮。

### 3.3 浏览器下载残留

用户发现 `chrome://downloads` 有历史记录。调查结果：

- 这些记录全部是 `/library` 页面导出的 ZIP Blob。
- 文件落在 `/tmp/playwright-artifacts-*`，MIME 是 `application/zip`。
- 用户确认这是产品本来的导出功能，不是问题。
- 我已删除数据库指向的 13 个临时文件和空目录。
- 下载历史条目尚未完全清空：Chrome 页面里仍显示 9 条“文件已被外部移除”的历史记录。后续只需清历史记录，不要再查下载来源。

---

## 4. 目前明确未完成

1. Config 节点模式切换：
   - 代码与定向测试已修。
   - 还需要重建 v11，跑页面脚本，确认视频页签显示 `grok-imagine-video`，不再引用 `grok-imagine-image`。
   - 截图必须交子 agent 挑刺。

2. 图床 vault 页面验收：
   - 需要 synthetic provider Key 解锁参数 UI。
   - 填 synthetic 图床 HTTPS Base URL 和 synthetic Key。
   - 关闭、重开、reload 后验证 marker 恢复、输入框不回显明文。
   - 检查 localStorage、sessionStorage、IndexedDB、节点 metadata、URL、请求 headers 不含 synthetic secret。
   - 不点击生成。

3. 全仓验证：
   - 需要重新跑 `npm test`、`npm run typecheck`、`npm run build`。
   - 需要全仓凭据扫描。

4. 后续功能合同：
   - `src/services/api/image.ts` Studio 生图 advanced 字段丢失/双写风险。
   - `src/studio/generate/video.ts` operation/reference/parameter fail-closed。
   - `src/pages/story-director-page.tsx` 按 provider capability 裁剪参考图、尾帧、多图、音频。
   - LTX i2v 尾帧、`ltx2.3` 短名默认 first-last 错误。
   - Grok R2V 多参考图入口。
   - “测试连接”不能触发生成/what-if 消耗。

5. 真实生成验收：
   - 只能使用全新的 Civitai NSFW 素材和未登记 prompt。
   - 禁用苹果、杯子、旧素材、重复 prompt。
   - 人物四视图不能送视频。
   - 每个 provider 按能力分配参考图/视频工作流。

6. 公网预览：
   - `https://thunder-apex-berry-oasis.grok.me/` 先前 `/`、`/library`、某 `/works/*.mp4` 是 HTTP 500。
   - 当前没有把本地修复部署到公网。
   - `/works` 仍缺 S3/R2/Vercel Blob 等一等对象存储；不能自行发明配置或部署。

---

## 5. 接手后的第一步

严格按顺序：

```bash
npm run typecheck
node --experimental-strip-types --experimental-test-module-mocks --test \
  src/app/canvas/utils/canvas-generation-model.test.ts \
  src/app/canvas/utils/canvas-standalone-video-model.test.ts \
  src/app/canvas/utils/seedance2-workflow.test.ts
npm test
npm run build
```

然后新建 v11 隔离镜像/容器，更新 `temp/qa/ui-image-host-vault.mjs` BASE，重跑页面截图。确认：

- 视频页签选中。
- 模型是 `Grok 中转 · grok-imagine-video`。
- 不再出现 `grok-imagine-image`。
- 视频操作、参数入口、预检文案都属于视频能力。

---

## 6. 硬性边界

- 未经明确授权，不要再 commit/push/reset/rebase。
- 不要删除旧容器、卷、作品或数据。
- 不要安装新依赖。
- 不要绕过前台点击生成。
- 不要把真实密钥写进代码、截图、文档或测试 fixture。
- 不要用切换 provider 掩盖错误。
- 不要把本地容器通过说成公网通过。
