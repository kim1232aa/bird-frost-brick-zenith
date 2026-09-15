# 2026-09-16 双 provider 管理统一 + 路由自动绑定 + 误拦消除 — E2E PASS

## 用户投诉（本次修复对象）

1. 点「一键全流程」弹出配置模型对话框，后台已配好 key 模型却不列出（`暂无可选模型：请先在设置页接线`）。
2. 两套 provider 管理：中转设置对话框（`useConfigStore.config.apiRelays`）与接线页/studio 选择器（`useStudioSession.relays`）互不知道对方状态——对话框里配好并启用，接线页仍 `已启用 0/21`、选择器空。
3. 没必要的拦截：路由从未配置/供应商被停用时直接弹窗或报「当前选择的中转已停用」，而不是自动绑定可用供应商。

## 改动

| 文件 | 内容 |
| --- | --- |
| `src/stores/relay-bridge.ts`（新） | 两 store 双向桥：publish/subscribe + 按 id 并集合并；防重入环；**原始 key 不过桥**（只带 hasApiKey 标志），base 侧待保存明文 key 不被覆盖；桥不删条目（删除仍是各 UI 显式动作） |
| `src/studio/session.ts` | relays 变更即 publish；收到 config 侧列表后合并并 scheduleFlush 落密钥库 |
| `src/stores/use-config-store.ts` | apiRelays 变更即 publish；收到 session 侧列表后合并进 `config.apiRelays`；`redactRelayCredentials` 在密钥入库后 `enabled: true`（配好 key 不再被「未启用」拦截，仍可手动停用） |
| `src/stores/api-relay-config-provider.ts` `ensureRouting` | ① 路由为空时自动绑定第一个「已启用+有密钥+可跑该能力」的供应商并补默认模型，不再交空路由（空路由=生成时弹窗）；② 绑定供应商跑不动时优先换绑到带同型号且可跑的供应商；③ 供应商缺模型时回退其能力列表第一个模型 |
| `src/stores/relay-bridge.test.ts`（新） | 8 个用例：合并/脱敏/防环/自动绑定/换绑/补模型 |

## 验证

- 单测：**918/918 PASS**（含既有参考图分档：四视图禁入视频槽、Grok R2V 多窗、故事导演分镜不丢等用例，确认未改坏）。
- build：0 error。
- E2E（`/mnt/agents/work/e2e/bridge-sync.py`，真实点击，全新浏览器上下文）：
  1. 复现用户路径：画布视频节点显示「模型路由不可用，打开配置」→ 点击弹出中转设置对话框；
  2. 对话框内录入 Grok key → 完成；
  3. 节点警告消失（无「已停用/路由不可用」）；
  4. `/canvas/home` 现在用的模型：**已接线×3 待接线×0**；
  5. `/settings` 接线页：**已启用 1/21、已接线 1**，Grok 中转「启用·已填密钥·密钥已保存到数据库」（对话框→接线页同步实证）；
  6. `/image`、`/ecommerce` 选择器列出 Grok 全系列模型（已接线），无「暂无可选模型」；
  7. `/image` 真实点击生成：**无配置弹窗拦截**，任务提交。
- 真实出图（`/mnt/agents/work/e2e/grok-image-verify.py`，新提示词「清晨薄雾里的江南水乡…」）：返回真实 xAI CDN 图 `https://imgen.x.ai/xai-imgen/xai-tmp-imgen-a1596763-4033-9e01-9f15-e54f5fc5810e-d376630d.png`，「我的出图」栏落卡，无弹窗、无报错。
- 截图备份：`/mnt/agents/work/verifier/shots/bridge-*.png`、`grok-image-final.png`。

## 判据与结论

判据：对话框配 key 后 ① 接线页可见启用 ② 各页选择器列出模型 ③ 生成点击不弹配置窗 ④ 真实出图进作品栏。四条全部满足，**PASS**。

已知边界：桥不传播删除（一侧删除供应商另一侧仍显示，需各自删除）；停用传播为「最后写入者胜出」，密钥入库会自动重启用（用户可再手动停用）。
