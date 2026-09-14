# 2026-09-14 HF failover 修复 + 六供应商前端复验

## 背景
- E2E 矩阵中 Hugging Face 报 "Model not supported by provider nscale"。
- 根因：`proxyLocalRelay` 总是用密钥库存的 baseUrl（nscale）覆盖客户端请求的中转基址，
  导致 HF 适配器的 nscale→together→fal-ai→wavespeed failover 全部打在 nscale 上。

## 修复
- `src/lib/boundless-proxy.server.ts`：新增 `resolveSameOriginBaseOverride`，
  仅当 `x-local-relay-base-url` 与密钥库 baseUrl **同源** 时才采纳（跨源忽略，密钥不可能泄露到其他主机）。
- `src/services/api/relay-proxy.ts`：`buildLocalRelayProxyHeaders` 增加 `baseUrlHint` 显式开关才发该头。
- `src/studio/adapters/huggingface.ts`：failover 循环带 `baseUrlHint: true`。
- `src/studio/wiring.ts`：HF 预设按 2026-09-14 实测裁剪——FLUX.1-schnell（nscale）可用；
  Z-Image-Turbo 在 fal-ai/replicate/wavespeed 路由路径均被拒、FLUX.2-dev 仅 i2i 且各 provider
  OpenAI 兼容端点均不可用，移出预设（remark 记录实测结论）。
- 测试：relay-proxy.headers.test.ts 新增 opt-in 用例；boundless-proxy.server.test.ts 新增
  同源采纳 + 相似域名跨源拒绝两个用例。
- 本地测试主 HF key 月度额度耗尽，按「额度没有就换key」切换到备用 key（local-test-keys.json，未入库）。

## 验证
- `npm test`：898/898 通过（node22, --experimental-test-module-mocks）。
- `npm run build`：✓ 4564 modules，nitro 构建成功。
- 前端真实点击 E2E（provider-matrix.py，截图 /tmp/shots/provider-*.png）6/6 PASS：
  - ModelScope 国际站 Z-Image-Turbo ✅
  - ModelScope 中国站 Z-Image-Turbo ✅
  - NanoGPT flux-2-turbo ✅
  - Hugging Face FLUX.1-schnell ✅（failover 修复后首验）
  - Civitai Orchestration krea2-turbo ✅（z-image-turbo 引擎上游审核/不可用，换引擎验证管线通畅）
  - Fal.ai flux-schnell ✅
- 作品栏非空、缩略图渲染正常（截图确认）。

## 上游实测留档（2026-09-14，HF router）
- nscale: FLUX.1-schnell ✅ t2i；FLUX.2-dev / Z-Image-Turbo "Model not supported"。
- fal-ai: HF id 一律 "Model not supported by provider fal-ai"；providerId 直传报 fal 端 "Application images not found"。
- wavespeed / replicate: "Not allowed to POST /v1/images/generations"。
- 结论：Z-Image-Turbo / FLUX.2-dev 目前无法经 HF router OpenAI 兼容端点出图，属上游限制，非客户端缺陷。
