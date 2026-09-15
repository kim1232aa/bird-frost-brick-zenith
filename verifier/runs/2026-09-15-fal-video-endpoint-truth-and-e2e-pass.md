# 2026-09-15 fal 视频端点真相重验 + 前端点击 E2E PASS

## 背景
上一轮（2026-09-14）以「submit 返回 200 IN_QUEUE」作为 fal 队列端点存活证据。
本轮发现该证据无效：**fal 队列对任意路径都收**（含明显 bogus 路径），
假端点秒回 0.05s「COMPLETED」，结果拉取才 404 `Path /xxx not found`。
之前前端点击 kling-3-turbo 报 `{"detail":"Path /v3/turbo/text-to-video not found"}`
即因此：映射的 `fal-ai/kling-video/v3/turbo/*` 根本不存在。

## 方法（结果拉取判别法）
对每个候选端点 submit 非法参数（duration "999"），6 秒后拉结果：
- 返回参数校验错误（loc/msg）或真实任务 → 端点真实存在；
- 返回 `{"detail":"Path /yyy not found"}` → 端点不存在。
（真实跑起来的探针任务一律立即 PUT cancel，已确认 CANCELLATION_REQUESTED。）

## 实测结论（2026-09-15）
| 端点 | 真伪 |
|---|---|
| fal-ai/kling-video/v3/pro t2v+i2v | 真（官方文档+探针双证；start/end_image_url 首尾帧，duration 3-15 字符串，generate_audio/negative_prompt/cfg_scale）|
| fal-ai/kling-video/v3/standard t2v+i2v | 真（同 pro 合同）|
| fal-ai/kling-video/v3/turbo/standard t2v+i2v | 真（image_url 仅首帧，duration 3-15，aspect_ratio 仅 t2v）|
| fal-ai/kling-video/v3/turbo/pro t2v+i2v | 真（同上）|
| fal-ai/kling-video/v3/turbo 直拼 | **假**（404 Path not found）← 旧映射 |
| fal-ai/kling-video/v3/master | **假** |
| fal-ai/veo3.1（根路径，t2v）| 真（duration 4s/6s/8s 字符串枚举实证）|
| fal-ai/veo3.1/image-to-video | 真 |
| fal-ai/veo3.1/text-to-video | **假** ← 旧映射 |
| fal-ai/minimax/hailuo-2.3/pro t2v+i2v | 真（image_url 首帧，prompt_optimizer）|
| fal-ai/wan-pro t2v+i2v | 真（seed、enable_safety_checker）|
| fal-ai/minimax/hailuo-03 t2v+i2v | 真且已 GA（duration 为数字 ≤15，非 early access）|

## 代码改动
- `src/studio/adapters/fal.ts`：FAL_VIDEO_PROFILES 全面修正（turbo 加 standard/pro 档、
  veo-3.1 t2v 走根路径 t2vPath/i2vPath 覆盖、minimax-h3 durationKind=hailuo03 数字 ≤15）；
  新增 kling-3-standard / kling-3-turbo-pro 档案。
- `src/services/api/video-model-capabilities.ts`：新增 fal-kling3-standard /
  fal-kling3-turbo-pro profile；minimax-h3 去 early-access 标签并给 duration 合同（1..15 整数）；
  FAL_VIDEO_EVIDENCE 重写为 2026-09-15 结果拉取实证。
- `src/studio/wiring.ts`：fal 预设 videoModels += kling-3-standard、kling-3-turbo-pro；remark 更新。
- `src/studio/catalog.ts`：补齐 8 个 fal 视频模型卡片；kling-3-turbo 标记 verified（已实测出片）。
- 状态/结果轮询仍走 app 命名空间（前两段），全路径 405 的结论本轮复验仍成立。

## 验证
1. `npm test`：910/910 通过（含新增 minimax-h3 duration、命名空间、端点映射用例）。
2. `npm run build`：0 error。
3. 前端真实点击 E2E（playwright，/video 页，访客态）：
   选择「Fal.ai · kling-3-turbo」→ 填提示词（纸船小溪，新提示词非复用）→ 点「生成视频」→
   页面出现 `<video src=https://v3b.fal.media/files/b/0aaa7e82/hh9AhIJqfK1GbwsQYVtWg_output.mp4>`，
   RESULT: PASS；作品栏「我的成片」出现该成片卡片。
   视频 URL 经 Range 请求验证为真实 H.264 mp4（ftypisom/avc1）。
   截图：fal-video-0-page / 1-selected / 2-submitted / 3-polling / 4-final（.png）。
4. 请求抓包实证：submit/status/result 三个请求均携带
   `x-local-relay-base-url: https://queue.fal.run` 提示头，服务端按子域规则放行，
   密钥始终由服务端 vault 附加，未进浏览器。
