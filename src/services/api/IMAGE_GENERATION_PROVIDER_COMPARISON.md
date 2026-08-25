# 图片与视频生成 Provider 能力对比

> 核验日期：2026-08-02（Asia/Tokyo）
> 范围：Boundless Studio 的图片、视频和 ComfyUI 工作流 provider 选型。
> 证据：当前官方文档、官方 OpenAPI、官方源码和不产生生成任务的只读请求。除项目已有的 Civitai 最小测试记录外，本次调研没有调用任何付费生成端点。

## 结论

### 1. 最适合精确复现任意 ComfyUI 工作流

1. **RunPod Serverless 自建 worker**：可以把完整 API workflow、自定义节点、模型文件和版本一起封装；控制面和运行时都可自主管理。代价是需要维护镜像、模型缓存、输入输出处理器和视频返回逻辑。
2. **RunComfy Serverless**：Cloud Save 将工作流、ComfyUI 版本、节点、模型和依赖打成不可变版本，部署体验最完整；调用的是已发布版本，不是每次随请求替换任意图。
3. **ComfyDeploy**：部署、staging/production、节点 git hash、工作流版本和 webhook 较完整；精确回滚仍受其官方“不能保证完全相同”警告约束。
4. **SaladCloud / Beam / Modal / Replicate Custom Cog / fal Serverless / Hugging Face Custom Container**：都能承载自定义 ComfyUI 容器，但需要自行实现标准化 handler、模型拉取、结果存储、鉴权和任务状态。它们是基础设施或部署平台，不是现成统一模型 API。
5. **Comfy Cloud API**：直接接受 Comfy API workflow JSON，接口最接近本地 ComfyUI；但 API 仍标为 experimental，任意自定义节点、私有模型上传和版本固定边界未被官方文档完整确认，当前只能列为部分支持。

对一个示例 Civitai 图片（`https://example.invalid/images/example`）做**高保真而非仅相似**复现，需要同时固定原 checkpoint、VAE、CLIP、全部 LoRA、节点实现、精度、seed、尺寸、步数和自定义 scheduler。只有允许安装原 scheduler/节点的自定义 ComfyUI 运行时具备这条路径；任何只暴露托管 sampler/scheduler 枚举的 API 都只能近似复现，不能承诺逐像素一致。本文不保留真实页面、工作流或账户运行标识。

### 2. 最适合直接调用大量托管模型

1. **fal.ai Model APIs**：模型目录和单模型 OpenAPI 可发现，图片/视频覆盖广，高级图片参数最完整；`fal-ai/lora` 支持任意模型 URL/Hugging Face ID、多 LoRA、ControlNet、IP-Adapter、自定义 timesteps/sigmas。
2. **Replicate Hosted Models**：官方/社区模型数量多，目录和 search API 完整，模型 schema 随版本发现；不同模型的字段、保留和稳定性并不统一。
3. **Runware**：统一 task API、AIR、Civitai 资源、多 LoRA和动态 model search 对 Boundless 很友好；视频和 scheduler 能力高度依赖模型 schema。
4. **Novita AI Hosted API**：SD 系列高级图片参数、模型目录、Civitai 来源模型和异步任务比较完整；不能直接把 Civitai AIR 当生成参数，也不能提交任意 Comfy workflow。
5. **Together AI**：图片和视频托管目录广、API 简单；高级 sampler/scheduler、任意 checkpoint/VAE/CLIP 和完整工作流不是其 Serverless API 的目标。

### 3. 最适合 Boundless Studio 作为通用 provider 集成

1. **Runware**：AIR 和 model-search 能直接解决“模型目录动态同步、Civitai 模型引用、多 LoRA、图片/视频统一任务”的核心需求，建议第一优先。
2. **fal.ai**：按模型 OpenAPI 做运行时能力发现，能避免在 Boundless 中硬编码失真的全局参数，建议第二优先。
3. **Replicate**：目录覆盖和 schema 发现优秀，建议作为第三优先的通用托管模型 provider。
4. **RunPod Serverless + RunComfy/ComfyDeploy**：建议作为独立的 `workflow-deployment` provider 类型，不与托管模型 API 假装共用同一请求体。
5. **Novita AI**：适合补充 SD/Civitai 生态和现成图片 API；之后再接其 Async Serverless 工作流形态。

`Stability AI` 适合作为窄而稳定的官方图片 API，`Together AI` 适合作为简单的大目录 provider；它们都不应被描述成“高级 Comfy 参数完整”。`Tensor.Art TAMS` 有较强参数和工作流图，但没有模型列表 API、节点/私有模型边界不完整，且内容政策存在新旧冲突，因此不进入首批。

## 判定规则

- **完整支持**：官方当前契约直接覆盖该能力，且关键字段/端点明确。
- **部分支持**：只在部分模型、部署形态或自定义容器中成立；括号内写明缺失项。
- **不支持**：官方当前契约明确没有该能力，或只能使用另一种不能等价替代的机制。
- **未验证**：当前一手资料没有足够证据，或官方资料互相冲突；括号内写明缺口。

“托管生成 API”和“工作流/容器部署平台”在下面分开。自定义容器理论上能运行某段代码，不等于平台有标准 ComfyUI API，也不等于 Boundless 可零配置调用。

## 完整能力矩阵

### 托管生成 API：模型与生成参数

| Provider                       | 图片     | 视频                           | Z-Image Turbo / Base                              | 自定义 checkpoint/VAE/CLIP/LoRA                            | Civitai 资源                                              | 多 LoRA                      | prompt/negative       | 尺寸/数量/seed                                  | steps/CFG                        | sampler/scheduler                                                      |
| ------------------------------ | -------- | ------------------------------ | ------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- | ---------------------------- | --------------------- | ----------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| Runware                        | 完整支持 | 完整支持（字段按模型）         | 完整支持 / 部分支持（Base AIR 需实时 search）     | 完整支持                                                   | 完整支持（AIR）                                           | 完整支持                     | 完整支持              | 完整支持                                        | 完整支持                         | 部分支持（单 `scheduler`，真实枚举按模型 schema；不支持 `capitanZiT`） |
| fal.ai Model APIs              | 完整支持 | 完整支持                       | 完整支持 / 完整支持                               | 完整支持（`fal-ai/lora`；VAE/CLIP 取决于端点）             | 部分支持（URL 可用，无 AIR/ID 语义）                      | 完整支持                     | 完整支持              | 完整支持                                        | 完整支持                         | 完整支持（官方枚举和自定义 timesteps/sigmas；无 `capitanZiT`）         |
| Replicate Hosted               | 完整支持 | 完整支持                       | 完整支持（官方 Turbo）/ 部分支持（Base 社区模型） | 部分支持（模型 schema 决定）                               | 部分支持（公开 URL 可作为输入；无 AIR/ID 语义）           | 部分支持（模型 schema 决定） | 完整支持（按 schema） | 完整支持（按 schema）                           | 部分支持（按 schema）            | 部分支持（按 schema；无全局枚举）                                      |
| Novita Hosted                  | 完整支持 | 完整支持                       | 完整支持 / 未验证（Base 未见当前官方模型）        | 部分支持（平台模型 ID；自有模型上传边界需账户验证）        | 部分支持（目录含 Civitai 来源元数据；生成不用 AIR）       | 完整支持                     | 完整支持              | 完整支持                                        | 完整支持                         | 部分支持（图片 sampler 可选；无独立自定义 scheduler/`capitanZiT`）     |
| Tensor.Art TAMS                | 完整支持 | 完整支持                       | 未验证（无公开目录可查）                          | 部分支持（Tensor model ID；任意私有 CLIP/节点未证实）      | 不支持（无 AIR/ID/下载 URL 契约）                         | 完整支持                     | 完整支持              | 完整支持                                        | 完整支持                         | 部分支持（sampler 和 scheduleName；真实可用枚举/`capitanZiT` 未验证）  |
| Stability AI v2beta            | 完整支持 | 不支持（旧视频路径当前不可用） | 不支持 / 不支持                                   | 不支持                                                     | 不支持                                                    | 不支持                       | 完整支持（端点相关）  | 部分支持（比例/seed；无任意尺寸和 quantity）    | 部分支持（SD3 有 cfg；无 steps） | 不支持                                                                 |
| Together Serverless            | 完整支持 | 完整支持                       | 不支持 / 不支持                                   | 部分支持（图片 `image_loras`；无任意 checkpoint/VAE/CLIP） | 不支持                                                    | 部分支持（模型字段允许时）   | 完整支持              | 部分支持（模型相关）                            | 部分支持（模型相关）             | 不支持（未见公开 sampler/scheduler）                                   |
| Hugging Face 原生 T2I Endpoint | 完整支持 | 不支持（需自定义容器）         | 部分支持（Hub 有模型，但非当前 one-click 目录）   | 部分支持（部署 Diffusers repo；组合能力由 handler 决定）   | 部分支持（可托管从 Civitai 获得且有权使用的文件；无 AIR） | 部分支持（自定义 handler）   | 完整支持              | 部分支持（单图二进制响应；quantity 需 handler） | 完整支持                         | 部分支持（Diffusers scheduler；无 `capitanZiT` 标准契约）              |

### 工作流/容器部署平台：精确复现能力

| Provider                      | 完整 Comfy API workflow JSON                     | 自定义节点                                           | 私有模型                                      | 固定节点/运行时版本                         | 图片/视频                      | 每请求任意 workflow                                              | `capitanZiT` 精确路径                     |
| ----------------------------- | ------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------- | ------------------------------------------- | ------------------------------ | ---------------------------------------------------------------- | ----------------------------------------- |
| RunPod Serverless 自建        | 完整支持                                         | 完整支持                                             | 完整支持                                      | 完整支持（镜像 digest/代码 SHA）            | 完整支持（视频需自写 handler） | 完整支持                                                         | 完整支持（装入原节点/实现）               |
| RunComfy Serverless           | 完整支持（发布 `workflow_api.json`）             | 完整支持                                             | 完整支持                                      | 完整支持（Cloud Save 不可变版本）           | 完整支持                       | 部分支持（调用固定部署版本，只覆盖声明输入）                     | 完整支持（部署中安装并固定）              |
| ComfyDeploy                   | 完整支持（导入并发布 workflow）                  | 完整支持                                             | 完整支持                                      | 完整支持（节点 git hash；回滚仍有官方警告） | 完整支持                       | 部分支持（调用固定 deployment/version）                          | 完整支持（部署中安装并固定）              |
| Comfy Cloud API               | 完整支持                                         | 部分支持（Cloud 可用节点；任意自定义节点上传未证实） | 部分支持（资产 API 存在；任意模型装载未证实） | 未验证（固定运行时/节点版本契约缺失）       | 完整支持                       | 完整支持                                                         | 未验证（取决于 Cloud 是否已有对应节点）   |
| Novita Async Serverless       | 完整支持（官方 Comfy worker）                    | 完整支持（自定义镜像）                               | 完整支持                                      | 完整支持（镜像 tag/digest）                 | 完整支持（handler 决定）       | 完整支持                                                         | 完整支持（自定义镜像）                    |
| SaladCloud                    | 完整支持（官方 Comfy worker `/prompt`）          | 完整支持                                             | 完整支持                                      | 完整支持（镜像 digest）                     | 完整支持（handler 决定）       | 完整支持                                                         | 完整支持（自定义镜像）                    |
| Replicate Custom Cog          | 完整支持（官方 Comfy runner 可扩展）             | 完整支持                                             | 完整支持                                      | 完整支持（Cog image/version）               | 完整支持（predictor 决定）     | 部分支持（默认 runner 有节点/权重限制；自定义 predictor 可完整） | 完整支持（自定义 Cog）                    |
| fal.ai Serverless             | 完整支持（自定义容器/函数）                      | 完整支持                                             | 完整支持                                      | 完整支持（镜像/依赖）                       | 完整支持                       | 完整支持（自行实现）                                             | 完整支持（自行安装）                      |
| Beam                          | 部分支持（官方 Comfy 示例；请求 handler 需扩展） | 完整支持                                             | 完整支持                                      | 完整支持（镜像/版本）                       | 完整支持                       | 部分支持（默认示例不是任意图网关）                               | 完整支持（自定义镜像）                    |
| Modal                         | 部分支持（无官方统一 Comfy 契约；可自建）        | 完整支持                                             | 完整支持                                      | 完整支持（image definition）                | 完整支持                       | 部分支持（自行实现）                                             | 完整支持（自行实现）                      |
| Hugging Face Custom Container | 部分支持（无官方统一 Comfy 契约；可自建）        | 完整支持                                             | 完整支持                                      | 完整支持（container image）                 | 完整支持                       | 部分支持（自行实现）                                             | 完整支持（自行实现）                      |
| Together Dedicated Container  | 未验证（官方未给 Comfy 契约）                    | 部分支持（容器内自管）                               | 完整支持                                      | 部分支持（容器可固定；服务能力需商务确认）  | 完整支持（handler 决定）       | 未验证                                                           | 部分支持（理论可装；未有官方 Comfy 示例） |

### 运行、目录、政策与数据

| Provider                  | 异步/轮询/webhook                                  | 结果与保留                                                        | 模型目录发现                                           | 认证/限流                                                  | 成人内容政策                                                                      | 商用与隐私                                                       |
| ------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Runware                   | 完整支持（async、`getResponse`、webhook）          | 完整支持（URL 默认 7 天，可设 TTL）                               | 完整支持（`modelSearch`）                              | Bearer；动态共享队列，无固定平台硬阈值                     | 不支持（Terms 禁止淫秽/成熟性内容；`NSFWContent` 字段不是许可）                   | 部分支持（用户须有资源权利；Privacy 按必要期限保留）             |
| fal.ai                    | 完整支持（queue status/result/SSE/cancel/webhook） | 完整支持（JSON I/O 30 天；CDN 生命周期/ACL 另管）                 | 完整支持（`GET /v1/models` + OpenAPI）                 | `Authorization: Key`；模型级限额                           | 不支持（AUP 禁止 sexually explicit content）                                      | 部分支持（模型许可证仍适用；文件可签名/设 ACL）                  |
| Replicate                 | 完整支持（wait、poll、cancel、webhook、签名验证）  | 完整支持（API 输入/输出/日志约 1 小时）                           | 完整支持（models/search）                              | `Authorization: Token`；600 predictions/min、其他 3000/min | 部分支持（AUP 未给 blanket adult 许可，且模型/部署政策各异）                      | 部分支持（模型许可证适用；短期默认保留）                         |
| Novita Hosted             | 完整支持（task-result、webhook）                   | 部分支持（签名 URL 示例 3600 秒；账户/自有 S3 规则另算）          | 完整支持（`GET /v3/model`）                            | Bearer；模型级 rate limit                                  | 不支持（Terms 禁止 explicit/porn；关闭 detection 不改变条款）                     | 部分支持（模型权利与账户条款适用；服务端留存期未验证）           |
| Tensor.Art TAMS           | 完整支持（queue、status、callback）                | 未验证（TAMS 专属期限缺失；旧 Privacy 称最多 60 天但可能更久）    | 不支持（FAQ 明确没有 list API，只能按 ID GET）         | Bearer 或 TAMS-SHA256-RSA；5 QPS                           | 不支持（最新政策全面 SFW；旧 ToS 仍有 NSFW 标签措辞，存在冲突）                   | 部分支持（资源/模型权利适用；TAMS 专属隐私未验证）               |
| Comfy Cloud               | 完整支持（poll/WS/cancel）                         | 部分支持（`/api/view` 302 签名 URL；无固定保留天数）              | 完整支持（object_info、模型目录/资产 API）             | `X-API-Key`；并发按套餐，API 套餐说明互相冲突              | 未验证（未找到 Cloud API 官方内容政策）                                           | 部分支持（按必要期限/账户期保留，支持申请删除；模型许可自负）    |
| ComfyDeploy               | 完整支持（run status/cancel/webhook）              | 未验证（公开文档未给结果保留期限）                                | 部分支持（导入时检测节点/模型；非托管模型总目录）      | Bearer；限额仅 dashboard 可见                              | 未验证（官方 API 文档未给内容政策）                                               | 未验证（定价、保留、输出隐私需账户合同确认）                     |
| RunComfy                  | 完整支持（v2 async/poll/result/webhook）           | 完整支持（PAYG inactive assets 90 天清理；Pro 200GB permanent）   | 部分支持（Model APIs 目录与 workflow deployment 分离） | API key；并发/计费按部署与 GPU                             | 未验证（未找到明确官方内容政策）                                                  | 完整支持（官方称隔离私有实例、数据/模型/输出私有；许可证仍自负） |
| RunPod                    | 完整支持（run/status/stream/cancel/retry）         | 完整支持（任务约 30 分钟、公开 media URL 7 天；同步期限文档冲突） | 部分支持（Hub/template；自建 endpoint 无统一目录）     | Bearer；endpoint 自定 worker/concurrency                   | 不支持（Terms 禁止 pornography/graphic adult）                                    | 部分支持（自建存储与模型许可自负）                               |
| Stability AI              | 不支持（当前图片 API 同步）                        | 未验证（当前文档未给统一输出保留期）                              | 部分支持（OpenAPI 模型枚举，不是动态目录）             | Bearer；150 请求/10 秒，触发后 60 秒                       | 不支持（AUP 禁止 sexually explicit content）                                      | 部分支持（服务条款与模型许可适用；数据期限需账户条款确认）       |
| Together Serverless       | 部分支持（视频 poll；未见 webhook）                | 未验证（公开生成文档未给统一期限）                                | 完整支持（`GET /v1/models`）                           | Bearer；模型/账户限额                                      | 不支持（Terms 禁止 obscene/porn；safety toggle 不是许可）                         | 部分支持（模型许可适用；专属隐私/保留需合同确认）                |
| Hugging Face Endpoint     | 部分支持（原生 T2I 同步；自定义容器可自建 async）  | 完整支持（官方称 payload/token 不存储；Endpoint 日志 30 天）      | 完整支持（Hub API；one-click 目录另有范围）            | Bearer；实例/账户配额                                      | 未验证（未找到 Dedicated Endpoint 的明确成人内容许可）                            | 部分支持（Hub repo license 和数据处理条款适用）                  |
| SaladCloud / Beam / Modal | 部分支持（均可自建任务/webhook，平台能力各异）     | 部分支持（由自建存储和平台日志策略决定）                          | 不支持（没有统一托管模型目录）                         | 平台 key/token；资源配额                                   | Salad 部分支持（受地区/主机政策约束）；Beam 未验证；Modal 不支持 indecent/obscene | 部分支持（用户自管模型、输出、许可证和保留）                     |

## 托管生成 API 详表

### Runware

- 分类：统一托管生成 API，不是任意 Comfy workflow 执行器。
- 端点与认证：`POST https://api.runware.ai/v1`，`Authorization: Bearer <RUNWARE_API_KEY>`；body 是 task 数组。
- 任务：`imageInference`、`videoInference`、`modelSearch`、`modelUpload`、`getResponse`。统一 task 并不表示每个视频模型字段相同。
- 模型引用：AIR 格式为 `creator:family@version`；官方 LoRA 示例直接使用 `civitai:120096@135931`。model search 返回 `air`、`architecture`、`category`、`private` 等。
- 图片：Z-Image Turbo 使用 `runware:z-image@turbo`；支持 prompt、negativePrompt、width、height、steps、seed、`CFGScale`、`scheduler`、`numberResults`、多 LoRA、ControlNet 和多种输出格式。Base 必须以实时 `modelSearch` 返回的 AIR 为准。
- 视频：例如 Veo 3.1 支持 `inputs.frameImages[{inputImage,frame:"first"}]` 和 providerSettings；Wan 2.7 的 frame input、分辨率、duration/fps 组合规则不同。能力必须来自所选 model schema。
- scheduler：通用文档示例包括 `DDIM`、`Euler Ancestral`、`UniPC`、`DPM++ 2M Karras`、`DPM++ 2M SDE Karras`、`DPM++ 3M Exponential`；Z-Image 示例又使用 `Default`。官方说明不兼容值可能回退到模型默认值，因此 Boundless 不得把这个列表当全局强枚举，也不能声称支持 `capitanZiT`。
- 官方资料：[平台总览](https://runware.ai/docs/platform/introduction)、[Z-Image Turbo](https://runware.ai/docs/models/z-image-turbo)、[LoRA](https://runware.ai/docs/learn/loras)、[Model Search](https://runware.ai/docs/platform/model-search)、[Model Upload](https://runware.ai/docs/platform/model-upload)、[Schedulers](https://runware.ai/docs/learn/schedulers)、[Task Polling](https://runware.ai/docs/platform/task-polling)、[Webhooks](https://runware.ai/docs/platform/webhooks)、[Rate Limits](https://runware.ai/docs/platform/rate-limits)、[Pricing](https://runware.ai/docs/platform/pricing)、[Terms](https://runware.ai/terms)、[Privacy](https://runware.ai/privacy)。

中性请求示例：

```http
POST https://api.runware.ai/v1
Authorization: Bearer <RUNWARE_API_KEY>
Content-Type: application/json

[
  {
    "taskType": "imageInference",
    "taskUUID": "<UUID>",
    "model": "runware:z-image@turbo",
    "positivePrompt": "A ceramic teapot on a wooden table in soft daylight",
    "negativePrompt": "blurred, low detail",
    "width": 1024,
    "height": 1024,
    "steps": 9,
    "CFGScale": 1,
    "seed": 123456,
    "numberResults": 1,
    "outputType": ["URL"],
    "outputFormat": "PNG",
    "deliveryMethod": "async"
  }
]
```

### fal.ai Model APIs

- 目录：`GET https://api.fal.ai/v1/models`；请求 `expand=openapi-3.0` 可读取模型契约。调用和队列 schema 必须以 model id 对应 OpenAPI 为准。
- 队列：`POST https://queue.fal.run/{model_id}`；`GET .../requests/{request_id}/status`、`GET .../requests/{request_id}`、`PUT .../requests/{request_id}/cancel`；支持 SSE 和 webhook。
- 认证：REST 使用 `Authorization: Key <FAL_KEY>`。浏览器端不应直接暴露 key，Boundless 应继续经桌面 relay。
- 高级图片：`fal-ai/lora` 接受模型 URL/Hugging Face ID、negative prompt、size、1–150 steps、guidance、seed、1–8 图片、多 LoRA、embeddings、ControlNet、IP-Adapter、clip skip、自定义 timesteps/sigmas。
- 当前 schema 的 scheduler 枚举：`DPM++ 2M`、`DPM++ 2M Karras`、`DPM++ 2M SDE`、`DPM++ 2M SDE Karras`、`Euler`、`Euler A`、`Euler trailing`、`LCM`、`LCM trailing`、`DDIM`、`TCD`。没有 `capitanZiT`。
- 文件与 webhook：支持 ED25519/JWKS 验签；JSON I/O 默认约 30 天，CDN 文件应单独配置生命周期、ACL或签名 URL。
- 官方资料：[模型目录 API](https://docs.fal.ai/model-apis/model-endpoints/model-schema)、[Queue](https://docs.fal.ai/model-apis/model-endpoints/queue)、[Webhooks](https://docs.fal.ai/model-apis/model-endpoints/webhooks)、[Webhook Security](https://docs.fal.ai/model-apis/model-endpoints/webhooks/security)、[File APIs](https://docs.fal.ai/model-apis/file-storage)、[Pricing API](https://docs.fal.ai/model-apis/model-endpoints/pricing)、[Acceptable Use](https://fal.ai/acceptable-use-policy)。

### Replicate Hosted Models

- 目录：`GET https://api.replicate.com/v1/models`、`GET /v1/search?query=...`，live OpenAPI 为 `GET https://api.replicate.com/openapi.json`。
- 调用：官方模型 `POST /v1/models/{owner}/{name}/predictions`；社区模型通常 `POST /v1/predictions` 并指定不可变 version。
- 生命周期：`GET /v1/predictions/{id}`、`POST /v1/predictions/{id}/cancel`；支持 `Prefer: wait=1..60`、webhook 和 webhook 签名密钥。
- 状态：OpenAPI 包含 `starting`、`processing`、`succeeded`、`failed`、`canceled`、`aborted`；部分 webhook 文档遗漏 `aborted`，Boundless 必须按 live schema 把未知非终态保守处理为 pending。
- Z-Image：官方托管 `prunaai/z-image-turbo`；Base 当前可见于社区 `prunaai/z-image`，社区模型的稳定性和版本保证不能等同官方模型。
- Comfy：官方 Comfy runner 可接 workflow JSON；公共 runner 对节点/权重有限制。官方指南允许将公开 Civitai LoRA 下载 URL 作为输入，自定义 Cog 才能完整固定节点和模型。
- 限流/保留：官方默认约 600 prediction requests/min、其他 API 3000/min；输入、输出和日志通常约 1 小时后移除。`Cancel-After` 支持 5 秒至 24 小时，默认预测超时通常约 30 分钟。
- 官方资料：[HTTP API](https://replicate.com/docs/reference/http)、[OpenAPI](https://api.replicate.com/openapi.json)、[Predictions](https://replicate.com/docs/topics/predictions)、[Webhooks](https://replicate.com/docs/topics/webhooks)、[ComfyUI](https://replicate.com/docs/guides/extend/comfyui/)、[Limits](https://replicate.com/docs/topics/predictions/rate-limits)、[Data retention](https://replicate.com/docs/topics/predictions/data-retention)、[AUP](https://replicate.com/acceptable-use-policy)。

### Novita AI Hosted

- 目录：`GET https://api.novita.ai/v3/model`。只读实测曾在无 key 时返回目录，但官方文档要求 Bearer；实现必须按文档发送认证，不能依赖当前宽松行为。
- 图片：`POST /v3/async/txt2img`；查询 `GET /v3/async/task-result?task_id={id}`。支持 checkpoint、LoRA、VAE、ControlNet、prompt、negative prompt、尺寸、数量、seed、steps、CFG 和图片 sampler。
- 模型：目录含 checkpoint/lora/vae/controlnet 等类型和 Civitai 来源元数据；生成使用 Novita model ID，不接受 Civitai AIR。Z-Image Turbo 有原生模型，Base 未验证。
- webhook：`extra.webhook.url`；文档称最多重试 5 次，未找到签名验证契约。结果可使用平台签名 URL或写入自有 S3；当前示例 URL TTL 为 3600 秒，不能据此推断所有任务的永久保留。
- sampler：当前 V3 txt2img schema 的枚举为 `Euler a`、`Euler`、`LMS`、`Heun`、`DPM2`、`DPM2 a`、`DPM++ 2S a`、`DPM++ 2M`、`DPM++ SDE`、`DPM fast`、`DPM adaptive`、`LMS Karras`、`DPM2 Karras`、`DPM2 a Karras`、`DPM++ 2S a Karras`、`DPM++ 2M Karras`、`DPM++ SDE Karras`、`DDIM`、`PLMS`、`UniPC`。Novita 没有独立自定义 scheduler，也没有 `capitanZiT` 契约。
- 官方资料：[Image Generation](https://novita.ai/docs/api-reference/model-apis-txt2img)、[Task Result](https://novita.ai/docs/api-reference/model-apis-task-result)、[Model API](https://novita.ai/docs/api-reference/model-apis-get-model)、[API Overview](https://novita.ai/docs/api-reference/api-reference-overview)、[Documentation index](https://novita.ai/docs/llms.txt)、[Terms](https://novita.ai/legal/terms-of-service)。

### Tensor.Art TAMS

- 基础地址：`https://ap-east-1.tensorart.cloud`；Bearer 或 `TAMS-SHA256-RSA`。
- 基础任务：`POST /v1/jobs`，body 要有幂等 `requestId` 和 stages。输入 count 为 1–4；Diffusion 宽高为 512–1536、64 对齐，steps 为 1–60，CFG 上限 30。stage 支持 checkpoint、VAE、LoRA、ControlNet、sampler 和 `scheduleName`。
- 工作流：`POST /v1/jobs/workflow` 接受带 `classType`/inputs 的节点图；另有 `POST /v1/jobs/workflow/template`，通过 `fieldAttrs` 覆盖固定模板字段。它类似 Comfy 图，但官方没有证明任意自定义节点和节点版本均可上传。
- 视频：同一 jobs schema 有 `VIDEO_DIFFUSION`/`videoDiffusion`、TEXT_TO_VIDEO/IMAGE_TO_VIDEO、fps 和 totalFrames 等字段；具体模型 ID 没有公开目录可发现。
- 目录：FAQ 明确目前没有 list models API；只有 `GET /v1/models/{modelId}`。这会阻碍 Boundless 动态同步。
- 限流/计费：FAQ 为 5 QPS（可申请调整），任务统一排队；1 computational credit = USD 0.003，实际消耗按尺寸、steps、count、模型系数。
- 政策冲突：最新官方更新和 2025 内容政策将产品设为全面 SFW，并阻止 NSFW 生成；旧 ToS 仍出现“strongly discourage”与 NSFW tag。Boundless 应按较新的专门政策禁用成人生成，且在合同确认前不能认为 TAMS 是例外。
- 官方资料：[TAMS API](https://tams-docs.tensor.art/docs/api/apis/tams-api/)、[Create Job](https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-create-job/)、[Workflow](https://tams-docs.tensor.art/docs/api/guide/workspace-api-example/)、[Integration FAQ](https://tams-docs.tensor.art/docs/api/guide/integration-faq/)、[Model](https://tams-docs.tensor.art/docs/api/apis/tams-api-v-1-service-get-model/)、[Billing](https://tams-docs.tensor.art/docs/use-cases/intro-to-billing/)、[Policy update](https://www.tensor.art/event/NSFW%26CelebrityAdjustments)、[Content policy](https://tensor.art/articles/940575284145485270)、[Terms](https://tensor.art/about/terms-of-service-new)、[OpenAPI JSON](https://echoing-swagger.oss-cn-shanghai.aliyuncs.com/tams/tams_api.swagger.online.json)。

### Stability AI v2beta

- 当前图片端点：`POST https://api.stability.ai/v2beta/stable-image/generate/{core|ultra|sd3}`，以及 edit/control/upscale 系列；Bearer 认证。
- 当前 live OpenAPI 没有任意 checkpoint、LoRA、VAE、CLIP、sampler、scheduler、steps 或 quantity；尺寸主要用官方 aspect_ratio 枚举，SD3 暴露 cfg 和 seed。
- 旧视频 API 当前请求为 404，不能继续在 Boundless 预设中宣称 Stability 支持视频。
- 官方限流为 150 请求/10 秒；触发后 60 秒限制窗口。价格按 credits/调用；公开 pricing 页面提到 Flash，而当前 OpenAPI 模型枚举未包含它，必须标为未验证冲突。
- 官方资料：[API Reference](https://platform.stability.ai/docs/api-reference)、[OpenAPI](https://platform.stability.ai/docs/api-reference#tag/Generate)、[Pricing](https://platform.stability.ai/pricing)、[Acceptable Use](https://stability.ai/use-policy)。

### Together AI Serverless

- 图片：`POST https://api.together.xyz/v1/images/generations`；视频：`POST https://api.together.xyz/v2/videos`，`GET /v2/videos/{id}`。
- 图片统一字段包括 model、prompt、width/height 或模型尺寸、seed、steps（仅模型支持时）、reference image 字段和 `image_loras[]`。没有任意 checkpoint/VAE/CLIP 和公开 sampler/scheduler。
- 视频模型的 duration、resolution、frame/reference input、状态值都由模型 schema 决定。官方页面和 SDK 对部分状态命名有差异；Boundless 应把明确 success/failure/cancel 之外的未知值保守当作非终态。
- 未找到 Serverless webhook 契约；使用轮询。Dedicated Container 是另一种企业部署形态，不能据此给 Serverless API 增加“完整 Comfy”勾选。
- 官方资料：[Images](https://docs.together.ai/reference/post-images-generations)、[Image parameters](https://docs.together.ai/docs/inference/images/parameters)、[Videos](https://docs.together.ai/docs/inference/videos/overview)、[Video parameters](https://docs.together.ai/docs/inference/videos/parameters)、[Models](https://docs.together.ai/docs/serverless-models)、[Dedicated Endpoints](https://docs.together.ai/docs/dedicated-endpoints)、[Terms](https://www.together.ai/terms-of-service)。

### Hugging Face Inference Endpoints

- 原生 Text-to-Image handler 接受 prompt、negative_prompt、width、height、num_inference_steps、guidance_scale、scheduler 和 seed，通常直接返回单个图片二进制而非统一 JSON job。
- 视频、多 LoRA、任意 workflow、私有 VAE/CLIP 组合需要 Custom Container；这时请求/异步/结果协议都是用户自定义，不能算原生 T2I 契约。
- Hub 有 Z-Image 模型仓库，但当前 one-click supported model catalog 未证明 Z-Image 是原生模板，因此列为部分支持。
- 官方安全说明称推理 payload/token 不存储，Endpoint 日志保留 30 天。未找到 Dedicated Endpoint 针对成人内容的明确许可，状态保持未验证。
- 官方资料：[Text to Image](https://huggingface.co/docs/inference-endpoints/engines/toolkit#text-to-image)、[Custom Container](https://huggingface.co/docs/inference-endpoints/guides/custom_container)、[Manage Endpoints API](https://huggingface.co/docs/inference-endpoints/api_reference)、[Security](https://huggingface.co/docs/inference-endpoints/security)。

## 工作流与部署平台详表

### Comfy Cloud API

- 分类：官方托管 ComfyUI 工作流 API，当前标为 **experimental**。
- 认证与入口：`https://cloud.comfy.org`，header `X-API-Key`。提交 `POST /api/prompt`，body 的 `prompt` 是前端 `Save (API Format)` 导出的节点图 JSON，可带 `extra_data` 和 `partial_execution_targets`。
- 生命周期：响应 `prompt_id` 和 `node_errors`；状态 `pending`、`in_progress`、`completed`、`failed`、`cancelled`。可轮询 job，也可连 `wss://cloud.comfy.org/ws?clientId={uuid}&token={api_key}` 接收执行事件。
- 结果：`GET /api/view` 返回 302 到临时签名 URL。还提供 object_info、model folders/models、资产上传/下载和 background download。
- 边界：图片、视频、音频图都能提交；但“可提交图”不等于“Cloud 已安装图中所有第三方节点和私有模型”。官方当前未完整说明任意节点安装、模型上传后如何固定版本，也未给 `capitanZiT` 可用性。
- 套餐冲突：overview 称 Creator/Pro 才有 API access；并发表格又列 Free/Standard 并发 1、Creator 3、Pro 5。接入前必须用实际账户 capability 验证，不能只按套餐名预设。
- 计费/保留：官方 support 当前称 GPU runtime 约 0.266 credits/sec；prompts/workflows/outputs/uploads 按运营、分析、改进所需期限保留，未给固定天数，可联系支持删除。
- 官方资料：[Cloud OpenAPI](https://docs.comfy.org/development/cloud/openapi)、[Submit workflow](https://docs.comfy.org/api-reference/cloud/workflow/submit-a-workflow-for-execution)、[Cloud overview](https://docs.comfy.org/development/cloud/overview)、[Credits](https://support.comfy.org/articles/5846341390-how-credits-work-in-comfy)、[Data retention](https://docs.comfy.org/support/data-retention)。

中性 workflow 请求骨架：

```http
POST https://cloud.comfy.org/api/prompt
X-API-Key: <COMFY_CLOUD_API_KEY>
Content-Type: application/json

{
  "prompt": {
    "3": {
      "class_type": "KSampler",
      "inputs": {
        "seed": 123456,
        "steps": 20,
        "cfg": 4,
        "sampler_name": "euler",
        "scheduler": "normal",
        "model": ["4", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["5", 0]
      }
    },
    "4": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": { "ckpt_name": "<CHECKPOINT_FILENAME>" }
    }
  },
  "extra_data": {
    "client_id": "<UUID>"
  }
}
```

这是结构示例，不保证 `<CHECKPOINT_FILENAME>` 或省略的连接节点已存在于 Cloud；调用前必须先用 object_info/model API 做能力检查。

### RunComfy Serverless

- 分类：把 ComfyUI 环境发布为版本化 deployment；另有独立 Model APIs，二者不能混用协议。
- 当前推荐入口：`POST https://model-api.runcomfy.net/prod/v2/deployments/{deployment_id}/inference`（以官方当前 deployment 文档显示的 host 为准）；v1 已弃用。返回 `request_id`，再轮询 status/result 或配置 webhook。
- Cloud Save 会把 full workflow、`workflow_api.json`、object_info、ComfyUI 版本、驱动、库、自定义节点、模型和依赖打进可复现容器。每个保存版本不可变，deployment 显式固定版本；最多 3 个保存版本，未部署的最旧版本可能自动移除，已部署版本受保护。
- 模型可来自 Civitai、Hugging Face、Drive 或上传，但 API 调用引用的是已部署资产，不是每请求 Civitai AIR。
- 计费：当前公开 PAYG GPU 小时价从 T4/A4000 USD 0.99 到 H200 USD 9.59；Model API 另按请求。PAYG 10GB inactive asset 90 天后移除；Pro 200GB 为永久保留。价格会变，UI 不应固化金额。
- 官方资料：[Serverless introduction](https://docs.runcomfy.com/serverless/introduction)、[Custom workflows](https://docs.runcomfy.com/serverless/custom-workflows)、[Workflow files](https://docs.runcomfy.com/serverless/workflow-files)、[Workflow versions](https://docs.runcomfy.com/serverless/workflow-versions)、[Webhooks](https://docs.runcomfy.com/serverless/webhooks)、[Pricing](https://www.runcomfy.com/assets/pricing)、[Model API billing](https://docs.runcomfy.com/model-apis/about-billing)。

### ComfyDeploy

- 基础地址：`https://api.comfydeploy.com/api`，Bearer 认证。
- 调用：`POST /run/deployment/queue`，body 包含 `deployment_id`、可选 `gpu`、`inputs`、`webhook` 和 `webhook_intermediate_status`；`GET /run/{run_id}` 查询，官方 API 另列 cancel 操作。
- webhook：run update payload 包含 run_id、status（`queued|processing|completed|failed|cancelled`）、outputs 和 progress。
- 固定性：workflow 导入会检测节点和模型；deployment 固定 workflow version。自定义节点 picker 默认 latest，但可以 git hash 固定，Docker commands 也可固定节点 commit 和模型 URL。V4 Business versioning 支持 snapshot/rollback，官方同时警告 rollback 不保证运行时绝对相同。
- 限额、价格、输出保留、成人内容政策只在账户/dashboard或未见公开说明，均保持未验证。
- 官方资料：[API](https://docs.comfydeploy.com/docs/api)、[Live API](https://api.comfydeploy.com/)、[Create deployment](https://docs.comfydeploy.com/docs/deployments/create)、[Environment](https://docs.comfydeploy.com/docs/machines/environment)、[Versioning](https://docs.comfydeploy.com/docs/machines/versioning)、[Import workflow](https://docs.comfydeploy.com/docs/workflows/import)、[Webhook](https://docs.comfydeploy.com/docs/api/runUpdateWebhook)。

### RunPod Serverless

- 标准任务：`POST https://api.runpod.ai/v2/{endpoint_id}/run` 或 `/runsync`；`GET /status/{job_id}`、`GET /stream/{job_id}`、`POST /cancel/{job_id}`、`POST /retry/{job_id}`。
- 官方 Comfy worker 接受 API workflow JSON。默认 handler 主要收集图片；视频/音频结果、签名存储、超大输出和多文件 manifest 需要自定义 handler，不能仅换 workflow 就宣称视频完整。
- 自建镜像可固定 ComfyUI、自定义节点和模型；Z-Image Turbo 有当前官方/公共模板路径，Base 可自装。Civitai 模型通常先下载到镜像、网络卷或启动缓存，不是生成端点原生 AIR 参数。
- 保留：异步 job 状态/结果通常约 30 分钟，公开 media URL 可约 7 天。官方不同页面对 runsync 超时写过 1 分钟和 5 分钟，Boundless 必须避免依赖同步长任务，结果应立即转存。
- 官方资料：[Serverless endpoints](https://docs.runpod.io/serverless/endpoints/job-operations)、[ComfyUI worker](https://github.com/runpod-workers/worker-comfyui)、[Handler](https://docs.runpod.io/serverless/workers/handlers/overview)、[Terms](https://www.runpod.io/legal/terms-of-service)。

### Novita Async Serverless

- 基础地址为 `https://async.novita.ai`。调用：`POST /v1/{endpoint}/run`、`GET /v1/{endpoint}/status/{job_id}`、`GET /v1/{endpoint}/cancel/{job_id}`、`GET /v1/{endpoint}/stats`。
- 当前官方示例使用 `runpod/worker-comfyui:5.5.0-flux1-dev`；自定义镜像可以接受完整 workflow 并安装节点、模型和 `capitanZiT`。
- request/status payload 最大 4 MiB，job result 约保留 6 小时。图片/视频结果如何编码仍由 worker handler 决定。
- Hosted `/v3/async/*` 与 Async Serverless `/v1/{endpoint}/*` 是两套协议，Boundless 应使用不同 adapter 类型。
- 官方资料：[Create Async Serverless Endpoint](https://novita.ai/docs/guides/serverless-gpus-quickstart-create-async-endpoint)、[官方示例使用的 worker-comfyui](https://github.com/runpod-workers/worker-comfyui)。

### Replicate Custom Cog 与 fal.ai Serverless

- Replicate Custom Cog：用 Cog image/version 封装完整运行时；官方 Comfy runner 是起点，不是任意节点的保证。自定义 predictor 可接受原始 workflow JSON、固定节点/模型，并把视频输出定义为 File/URL。
- fal.ai Serverless：自定义 Python/function/container 可实现完整 workflow gateway；平台负责队列、扩缩和文件层，但 Comfy handler、节点安装和模型许可证仍由开发者负责。
- 二者都应作为 deployment 实例接入，能力由部署 manifest 声明；不能用 Replicate/fal 托管目录的通用 schema 推断自建 deployment 能力。
- 官方资料：[Replicate ComfyUI](https://replicate.com/docs/guides/extend/comfyui/)、[Cog](https://cog.run/)、[fal Serverless](https://docs.fal.ai/serverless/deployment)。

### SaladCloud、Beam 与 Modal

- **SaladCloud**：官方 Comfy worker 暴露 `/prompt` 接受原始 workflow，并有 models/download/interrupt；Job Queue 负责异步调度。官方示例可按 Civitai version 下载模型。适合长期 GPU pool 和自管镜像；内容仅在地区、主机和上游条款允许时成立，不能默认成人内容可用。
- **Beam**：官方 ComfyUI 示例可固定容器和节点，callback 支持签名；默认示例的 handler 不等于通用“每请求任意 workflow”网关，需要扩展输入/输出协议。
- **Modal**：可定义 image、volume、GPU function 和 web endpoint，但没有官方标准 Comfy API contract；所有 queue、status、webhook 和返回类型都要自行实现。Terms 禁止 indecent/obscene 内容。
- 官方资料：[Salad ComfyUI Recipe](https://docs.salad.com/container-engine/reference/recipes/comfyui)、[Salad ComfyUI Deployment](https://docs.salad.com/container-engine/how-to-guides/ai-machine-learning/deploy-stable-diffusion-comfy)、[Salad Job Queues](https://docs.salad.com/container-engine/explanation/job-processing/job-queues)、[Beam ComfyUI](https://docs.beam.cloud/v2/examples/comfy-ui)、[Beam callbacks](https://docs.beam.cloud/v2/topics/callbacks)、[Modal custom containers](https://modal.com/docs/guide/custom-container)、[Modal web endpoints](https://modal.com/docs/guide/webhooks)、[Modal Terms](https://modal.com/legal/terms)。

## `capitanZiT` 与目标工作流复现结论

| 平台形态                                                                                                                                    | `euler + capitanZiT`                                                                  | 对目标工作流的结论                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 自定义 Comfy 容器：RunPod、RunComfy、ComfyDeploy、Novita Serverless、Salad、Replicate Cog、fal Serverless、Beam、Modal、HF Custom Container | 完整支持，前提是安装并固定原 scheduler/节点及依赖                                     | 可做高保真复现；仍需取得原模型/LoRA并固定精度、节点版本和所有输入                           |
| Comfy Cloud                                                                                                                                 | 未验证                                                                                | 只有 Cloud 当前节点库已经包含相同实现时才可能精确复现                                       |
| Tensor.Art workflow                                                                                                                         | 未验证                                                                                | 没有任意自定义节点/版本上传的官方保证，不能承诺精确复现                                     |
| Civitai Orchestration                                                                                                                       | 不支持；live schema 是 `sampleMethod=euler` + 公开 `schedule` 枚举，未含 `capitanZiT` | 可用 `euler/simple` 等近似，不能逐像素一致；详见 [Civitai 调研](./CIVITAI_ORCHESTRATION.md) |
| Runware                                                                                                                                     | 不支持自定义 scheduler；按模型选择其公开 `scheduler`                                  | 近似复现                                                                                    |
| fal Model APIs                                                                                                                              | 不支持命名为 `capitanZiT`；可自定义 timesteps/sigmas 的端点仍不等于原节点实现         | 近似复现，除非转 fal Serverless 自建                                                        |
| Novita Hosted、Stability、Together、Replicate Hosted、HF 原生 T2I                                                                           | 不支持或未暴露                                                                        | 只能按模型 schema 近似                                                                      |

不能只比较 prompt、seed 和尺寸来声明“复现成功”。扩散模型文件 hash、text encoder、VAE、LoRA 应用顺序、权重精度、latent 初始化、scheduler 实现和节点版本任一不同，都可能导致明显差异。

## API 认证、计费和结果安全的实现约束

1. 所有 provider token 继续存入 Boundless 的桌面安全配置副本；浏览器持久化只保留脱敏值。不得把 token 放在 URL query、workflow metadata、日志、错误信息或测试 fixture。
2. webhook secret/signature 是独立 credential。支持签名的平台必须验签；只支持任意 callback URL 但没有签名的平台，应要求用户配置不可猜测路径并配合来源限制，UI 明示“无官方签名”。
3. provider 的临时 URL 必须下载到 Boundless 本地媒体存储，再写入画布。不得把 1 小时、6 小时、7 天或未知 TTL 的 URL当永久资产。
4. 价格不能固化为“每张多少钱”。统一记录 `estimatedCost`、`actualCost`、`currency`、`billingUnit` 和原始 provider 账单字段；只有 provider 的 current schema 给出时才展示估价。
5. 自定义模型和 Civitai 下载必须由用户确认有权使用，保留来源、version/hash 和许可证元数据。API 能下载不等于允许商用。

## Boundless Studio provider 接入优先级

### P0：建立能力层，不再增加硬编码 provider 分支

先实现 provider manifest、模型目录缓存、单模型 capability schema、任务状态归一化、临时结果转存和 webhook 安全。没有这层继续增加预设，会让 UI 显示平台不支持的 steps、scheduler、首尾帧或视频时长。

### P1：Runware

- 新增 `runware` adapter，接 `modelSearch`、imageInference、videoInference、getResponse。
- 模型选择器显示 AIR、architecture、category、source、private 和模型级 schema。
- Civitai AIR 原样传递；多 LoRA 权重按模型架构做兼容验证。
- 先接图片和单图/首帧视频，再接 providerSettings 等模型特有字段。

### P2：fal.ai

- 新增 `fal` adapter；目录读取 `/v1/models` 并缓存每个 model 的 OpenAPI。
- queue/status/result/cancel/webhook 统一到任务层。
- 参数表由 schema 驱动，`fal-ai/lora` 作为高级图片首个完整实现。

### P3：Replicate

- 新增 `replicate` adapter，区分 official model endpoint 与 community version endpoint。
- 用模型/version schema 动态生成参数；输出在 1 小时前转存。
- webhook 状态包含 `aborted`，未知状态不得误判失败。

### P4：工作流部署 provider

- 首批接 RunPod Serverless 和 RunComfy 或 ComfyDeploy。
- UI 选择的是 deployment + version，不是“模型”；deployment manifest 声明输入 ports、输出媒体、节点/模型 hash 和 webhook 能力。
- 之后复用同一接口接 Novita Serverless、Salad、Replicate Cog、fal Serverless、Beam、Modal、HF Custom Container。

### P5：Novita Hosted、Together、Stability、Tensor.Art

- Novita 适合 Civitai 来源目录和传统 SD 高级参数。
- Together 适合模型多、参数简单的图片/视频。
- Stability 只接当前 v2beta 图片能力，不显示视频和高级 sampler。
- Tensor.Art 要等模型目录、当前政策和任意节点边界得到官方/账户验证后再接。

## 推荐的统一参数模型

```ts
type MediaGenerationRequest = {
  modality: "image" | "video";
  providerId: string;
  modelId?: string;
  deploymentId?: string;
  deploymentVersion?: string;
  prompt?: string;
  negativePrompt?: string;
  size?: {
    width?: number;
    height?: number;
    aspectRatio?: string;
    resolution?: string;
  };
  quantity?: number;
  seed?: number;
  steps?: number;
  guidance?: number;
  sampler?: string;
  scheduler?: string;
  durationSeconds?: number;
  fps?: number;
  loras?: Array<{ resource: MediaModelResource; weight: number }>;
  checkpoint?: MediaModelResource;
  vae?: MediaModelResource;
  clip?: MediaModelResource;
  controls?: ControlInput[];
  references?: ReferenceInput[];
  workflow?: { apiJson: unknown; inputOverrides?: Record<string, unknown> };
  output?: {
    format?: string;
    delivery?: "sync" | "async";
    ttlSeconds?: number;
  };
  providerOptions?: Record<string, unknown>;
};

type MediaModelResource =
  | { kind: "provider-model"; id: string; version?: string }
  | { kind: "air"; air: string }
  | { kind: "url"; url: string; sha256?: string }
  | { kind: "uploaded"; assetId: string; sha256?: string };

type ReferenceInput = {
  role: "image" | "first_frame" | "last_frame" | "video" | "audio" | "mask";
  url?: string;
  assetId?: string;
  weight?: number;
};

type NormalizedMediaTask = {
  id: string;
  providerId: string;
  providerTaskId: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress?: number;
  outputs: Array<{
    kind: "image" | "video" | "audio";
    url?: string;
    storageKey?: string;
    mimeType?: string;
  }>;
  error?: { code?: string; message: string; retryable?: boolean };
  rawStatus?: string;
};
```

这应是内部领域模型，不应直接序列化给 provider。`providerOptions` 必须通过所选模型 schema 校验并限制在该 provider 命名空间，不能成为绕过类型检查的任意 JSON 通道。

## 各 provider 参数映射表

| 统一字段           | Civitai                                 | Runware                        | fal.ai                              | Replicate                 | Novita                       | Tensor TAMS              | Comfy workflow               | Stability              | Together                             |
| ------------------ | --------------------------------------- | ------------------------------ | ----------------------------------- | ------------------------- | ---------------------------- | ------------------------ | ---------------------------- | ---------------------- | ------------------------------------ |
| `modelId`          | service id + recipe parameters          | `model` AIR                    | URL path model id                   | owner/name + version      | `model_name`/`sd_model_name` | `sdModel` ID             | loader node/file             | endpoint/model enum    | `model`                              |
| `prompt`           | `input.prompt`                          | `positivePrompt`               | `prompt`                            | schema `prompt`           | `prompt`/`prompts`           | `prompts`                | positive text node           | `prompt`               | `prompt`                             |
| `negativePrompt`   | `input.negativePrompt`                  | `negativePrompt`               | `negative_prompt`                   | model schema              | `negative_prompt`            | `negativePrompts`        | negative text node           | endpoint-specific      | `negative_prompt` if schema supports |
| `size`             | `width`,`height` 或 ratio/resolution    | width/height 或模型 resolution | `image_size` 或 width/height        | model schema              | width/height                 | width/height             | latent/image node            | `aspect_ratio`         | width/height 或模型 schema           |
| `quantity`         | `quantity`                              | `numberResults`                | `num_images`                        | model schema              | `image_num`                  | INPUT `count`            | batch node                   | 不支持                 | `n`/模型 schema                      |
| `seed`             | `seed`                                  | `seed`                         | `seed`                              | model schema              | `seed`                       | INPUT seed               | sampler node                 | `seed`                 | `seed`                               |
| `steps`            | `steps`                                 | `steps`                        | `num_inference_steps`               | model schema              | `steps`                      | `steps`                  | sampler node                 | 不支持                 | 模型支持时                           |
| `guidance`         | `cfgScale`                              | `CFGScale`                     | `guidance_scale`                    | model schema              | `guidance_scale`             | `cfgScale`               | sampler node `cfg`           | SD3 `cfg_scale`        | 模型支持时                           |
| `sampler`          | `sampleMethod`                          | 合并进 `scheduler`             | `scheduler` enum                    | model schema              | `sampler_name`               | `sampler`                | `sampler_name`               | 不支持                 | 不支持                               |
| `scheduler`        | `schedule`                              | 单 `scheduler`                 | `scheduler`/timesteps/sigmas        | model schema              | 无独立字段                   | `scheduleName`           | `scheduler`                  | 不支持                 | 不支持                               |
| `loras`            | AIR→weight map                          | `lora[] {model,weight}`        | `loras[]`                           | model schema              | `loras[]`                    | LoRA stage/nodes         | LoRA loader nodes            | 不支持                 | `image_loras[]`                      |
| `references`       | recipe/model-specific image/video/audio | `inputs.frameImages` 等        | model-specific image/control inputs | model schema              | img2img/control/IP adapter   | resource IDs/stages      | load image/video/audio nodes | edit/control endpoints | image/reference fields               |
| `workflow.apiJson` | 不支持                                  | 不支持                         | 不支持（Serverless 才支持）         | public/custom runner only | Hosted 不支持                | workflow graph，边界受限 | `prompt`/已发布 workflow     | 不支持                 | 不支持                               |

## 无法统一的 provider 特有参数

- Runware `providerSettings.*`、AIR model upload、`includeCost`、`ttl`。
- fal.ai custom timesteps/sigmas、embeddings、每个 model OpenAPI 的 union 字段和 webhook URL query。
- Replicate version、`Prefer: wait`、`Cancel-After`、deployment owner/version。
- Civitai `allowMatureContent`、currencies、Yellow Buzz、upgradeMode、ephemeral、whatif 和 service discriminator。
- Together/Runware/fal 的模型专属视频音频生成开关、resizeMode、frameImages、audio、camera/motion 参数。
- Tensor stage graph、template `fieldAttrs` 和 `TAMS-SHA256-RSA` 签名。
- Comfy 原始 node graph、partial execution targets、deployment version、node/model hash。
- 各平台 webhook signature、output storage、TTL、provider cost 和 safety fields。

这些字段应保存在模型能力 schema 的 provider 命名空间，只有该模型明确声明后 UI 才显示。

## 正确的能力发现与降级策略

1. **发现 provider**：adapter 自报 `hosted-model`、`workflow-deployment` 或 `custom-container`，以及 image/video、catalog、webhook、cancel、signed-output 能力。
2. **发现模型**：优先调用官方目录；Runware/fal/Replicate/Together/HF 动态同步。没有 list API 的 Tensor 只允许用户粘贴并验证 ID，不伪造目录。
3. **发现 schema**：缓存 model/version schema 和 ETag/更新时间。fal/Replicate/Together/Runware 按模型；Comfy 读取 object_info/部署 manifest。
4. **参数交集**：UI 只呈现 schema 明确支持的字段、范围和 enum。用户切模型时保留公共合法值，隐藏字段不继续偷偷发送。
5. **资源验证**：提交前校验 checkpoint/LoRA 架构、数量、权重、URL 可达性和 hash；Civitai AIR 原样保存，不从名字猜 ID。
6. **工作流预检**：检查缺失节点、模型文件、输入 port 和输出 node；支持 what-if/validation 的 provider 先做免费预检。
7. **降级必须可见**：scheduler、尺寸、时长或参考图不支持时给出目标值、允许值和将采用的替代值，等待用户确认；不得静默 fallback。Runware 官方会静默回退 scheduler，Boundless 应在提交前阻止未知值。
8. **状态保守**：只把明确的 success/failure/cancel 当终态；未知状态继续 pending 并保留 rawStatus。创建、轮询和取消必须固定同一 provider、deployment、model 和 credential。
9. **结果持久化**：下载后校验 HTTP、MIME、文件签名和大小，再写本地 storageKey；失败时保留 providerTaskId 供恢复。
10. **策略能力不是技术能力**：NSFW/safety toggle 只表示检测行为，不覆盖 ToS/AUP。provider manifest 应分别记录 `technicalSafetyControls` 与 `contentPolicy`，政策未知时 UI 标“未验证”，不自动允许。

## 下一步最小但完整的实现任务清单

1. 新增 `MediaProviderManifest`、`MediaModelCapability`、`MediaGenerationRequest`、`NormalizedMediaTask` 类型和 schema 校验；迁移现有 Civitai/DashScope/Ark/Agnes adapter 到同一任务接口。
2. 新增 capability cache：provider catalog、model schema、ETag/last-verified、source URL、冲突/未验证标记；设置页提供“刷新能力”和原始证据查看。
3. 完成 Runware adapter：modelSearch、image/video、AIR、多 LoRA、poll/webhook、TTL、cost 和结果转存，配契约测试和一张中性最小图片的用户授权实测。
4. 完成 fal.ai adapter：models/OpenAPI、queue/status/result/cancel、webhook 验签、file lifecycle 和 `fal-ai/lora` 高级字段，配 schema fixture 与用户授权实测。
5. 完成 Replicate adapter：official/community endpoint 分流、version schema、status/aborted、wait/cancel-after、webhook 验签和 1 小时内转存。
6. 新增 `workflow-deployment` adapter：deployment/version/input ports/output nodes/node+model hashes；先实现 RunPod，再实现 RunComfy 或 ComfyDeploy。
7. 将图片/视频设置面板改为 capability-driven；字段隐藏、范围、enum、首尾帧/参考集、duration/fps、sampler/scheduler 都来自 schema，并实现显式降级确认。
8. 给任务持久化补 provider/deployment/version/model/credential affinity、rawStatus、webhook event id、输出 manifest；覆盖重启恢复、取消、过期 URL 和多输出视频。
9. 完成安全门：桌面 relay host allowlist、token redaction、webhook 验签、下载大小/MIME/签名验证、临时 URL 本地化、workflow metadata secret 扫描。
10. 每个 provider 上线前执行：官方契约快照、只读目录验证、最小授权生成、结果转存、重启恢复、取消/失败、速率限制、日志敏感信息和政策 UI 检查。

这份清单不等于已经接入上述 provider。按用户要求，本文件先完成调研和设计；实际新增 provider 文件、设置项、网络请求和测试会改变应用行为，应在确认实施顺序后再修改。

## 官方资料冲突与验证等级

| 项目                | 冲突/缺口                                                          | 当前处理                                     |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| Comfy Cloud 套餐    | overview 称 Creator/Pro 才有 API；并发表格包含 Free/Standard       | 未验证；运行时探测 API access，不按套餐名猜  |
| Replicate 状态      | live OpenAPI 有 `aborted`，部分 webhook 文档遗漏                   | 以 live OpenAPI 为准并保留未知状态           |
| Runware scheduler   | 通用文档列多个名称，Z-Image 示例使用 `Default`，且不兼容值可能回退 | 以实时单模型 schema 为准，提交前阻止未知值   |
| Novita catalog      | 官方要求 Bearer，只读实测曾允许无 key GET                          | 代码仍按官方要求认证                         |
| Tensor 内容政策     | 旧 ToS 有 NSFW 标签措辞，最新专门政策全面 SFW                      | 按最新专门政策视为不支持，合同例外需书面确认 |
| Stability 模型/视频 | pricing 提到 Flash但 live OpenAPI 枚举缺失；旧视频路径当前 404     | Flash 未验证；视频标不支持                   |
| RunPod 同步期限     | 官方页面曾分别写 1 分钟与 5 分钟                                   | 长任务一律 async，立即转存结果               |
| Together 视频状态   | 文档与 SDK 的命名不完全一致                                        | 明确终态映射，其余 pending + rawStatus       |
| TAMS model catalog  | 只有按 ID GET；FAQ 明确没有 list                                   | 不伪造动态模型目录                           |

### 经实时 API/OpenAPI 或官方源码核验

- Civitai Orchestration service catalog、Z-Image live OpenAPI 和项目已有的两次最小授权测试：见 [CIVITAI_ORCHESTRATION.md](./CIVITAI_ORCHESTRATION.md)。本次未追加生成 POST。
- Replicate live `openapi.json`、models/search 契约。
- fal.ai models + 单模型 OpenAPI schema。
- Novita `GET /v3/model` 的当前只读行为。
- Stability 当前 v2beta OpenAPI 与旧视频路径 404。
- Tensor TAMS 官方 OpenAPI JSON 的静态读取。
- RunPod 官方 `worker-comfyui` 源码和 handler 行为。

### 只有官方文档/政策证据，未做付费生成验证

- Runware、Novita 生成、Tensor jobs/workflow、Comfy Cloud、RunComfy、ComfyDeploy、RunPod 生成、Replicate 生成、fal 生成、Hugging Face、Together、Stability 图片、SaladCloud、Beam 和 Modal。
- 所有价格都可能变化；只有文档当前明确的计费单位被记录，未读取任何私人账户账单。
- 标为“未验证”的内容不应转成默认产品能力；必须在接入时用当前账户、当前 schema 和中性测试重新核验。
