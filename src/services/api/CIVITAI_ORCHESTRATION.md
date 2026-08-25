# Civitai Orchestration API 调研与实测记录

本文记录 Boundless Studio 的 Civitai Orchestration 接入约定、2026-08-02 的脱敏 API 契约测试结果，以及本次排查确认的易错点。真实页面、工作流、账户和输出标识已替换为中性占位符；以后修改 `civitai-*.ts` 或排查 Civitai 生成失败时，应先阅读本文，再核对实时官方文档和 OpenAPI。

## 结论速查

1. 单步图片或视频生成也优先使用通用工作流接口：
   `POST https://orchestration.civitai.com/v2/consumer/workflows`。
2. 付费提交前先加 `whatif=true`。它只做解析和费用预估，不执行生成。
3. LoRA AIR 必须从模型版本 API 的 `air` 字段原样读取，禁止根据 recipe 的 `ecosystem` 手工拼接。
4. 提交后只按工作流 `id` 轮询 `GET /v2/consumer/workflows/{id}`，禁止轮询尚不可用的 blob 签名 URL。
5. `HTTP 200` 只表示请求成功到达终态，还必须检查工作流和步骤的 `status`。
6. `available: false` 的 blob 不是可用结果；只有工作流成功且 blob 可用、URL 实测返回图片时才能交付。
7. 成人内容需在工作流体设置 `allowMatureContent: true`，并使用 Yellow Buzz；需要返回成人 blob URL 时设置 `hideMatureContent=false`。
8. 签名 blob URL 会过期。长期保存必须下载到本地存储，刷新 URL 应重新获取工作流或使用官方 GetBlob 操作。

## 官方资料

以下内容均在 2026-08-02 实际读取：

- [Quick start](https://developer.civitai.com/orchestration/guide/getting-started.md)
- [Submitting work](https://developer.civitai.com/orchestration/guide/submitting-work.md)
- [Results and webhooks](https://developer.civitai.com/orchestration/guide/results-and-webhooks.md)
- [Errors and retries](https://developer.civitai.com/orchestration/guide/errors-and-retries.md)
- [Z-Image recipe](https://developer.civitai.com/orchestration/recipes/zimage.md)
- [imageGen live OpenAPI](https://orchestration.civitai.com/v2/consumer/recipes/imageGen/openapi.yaml)
- 模型版本 API：`GET https://civitai.com/api/v1/model-versions/{versionId}`

外部 API 可能更新。配置项、枚举和返回结构有疑问时，必须重新读取与当前服务版本匹配的资料，不能只依赖本文。

## API 接口与工作流参数

### 基础地址与认证

```text
Orchestration base URL: https://orchestration.civitai.com
Site API base URL:      https://civitai.com/api/v1
Authentication:         Authorization: Bearer <TOKEN>
Content-Type:           application/json
```

Orchestration token 应用于工作流提交、查询和服务目录。公开的模型版本元数据接口无需把 token 写入 URL。应用内请求必须通过现有 provider 密钥存储和本地 relay，不能把 token 固化到源码或前端日志。

### 推荐端点

| 方法与路径                                           | 用途                   | 备注                                           |
| ---------------------------------------------------- | ---------------------- | ---------------------------------------------- |
| `POST /v2/consumer/workflows`                        | 提交一个或多个步骤     | 当前推荐入口                                   |
| `GET /v2/consumer/workflows/{id}`                    | 查询工作流             | 异步轮询只使用这个端点                         |
| `GET /v2/services?limit=200&offset=0`                | 获取服务目录           | 当前代码读取 `0` 和 `200` 两页                 |
| `GET https://civitai.com/api/v1/model-versions/{id}` | 获取模型版本和原始 AIR | LoRA 接入前必须读取                            |
| `POST /v2/consumer/recipes/imageGen`                 | 单步骤快捷入口         | 存在文档与线上响应冲突，当前不推荐用于状态管理 |

服务目录返回的每个 item 主要包含：

```json
{
  "id": "image/sdcpp/zImage/turbo/createImage",
  "step": "imageGen",
  "category": "image",
  "parameters": {
    "operation": "createImage",
    "model": "turbo",
    "engine": "sdcpp",
    "ecosystem": "zImage"
  },
  "modalities": {
    "input": ["text"],
    "output": ["image"]
  },
  "status": "available"
}
```

正确用法是按 `id` 选择服务，再把服务返回的 `parameters` 合并进步骤 `input`。`status: degraded` 仍表示目录中存在该服务，但不应等同于稳定可用。服务 ID 和 recipe parameters 只描述生成服务，不能用它们推导模型资源 AIR。

### 通用工作流 query 参数

| 参数                | 类型            | 默认值  | 正确用法                                                                      |
| ------------------- | --------------- | ------- | ----------------------------------------------------------------------------- |
| `whatif`            | boolean         | `false` | `true` 时只校验、解析 provider/资源并估价，不执行作业                         |
| `wait`              | integer seconds | `0`     | 阻塞等待终态；官方请求超时上限为 100 秒，应用应限制到 `0..100`                |
| `hideMatureContent` | boolean         | `false` | `true` 时成熟内容 blob 不返回 URL；需要读取已获授权的成人结果时显式传 `false` |

实际 URL 示例：

```text
# 免费预检
/v2/consumer/workflows?whatif=true&wait=100&hideMatureContent=false

# 真实执行
/v2/consumer/workflows?whatif=false&wait=100&hideMatureContent=false
```

### 工作流 body 字段

| 字段                 | 类型    | 必需 | 说明                                                             |
| -------------------- | ------- | ---- | ---------------------------------------------------------------- |
| `steps`              | array   | 是   | 工作流步骤；每项包含 `$type` 和 `input`                          |
| `allowMatureContent` | boolean | 否   | `true` 允许成熟内容并强制使用 Yellow Buzz                        |
| `currencies`         | array   | 否   | 限定可结算币种：`blue`、`green`、`yellow`                        |
| `upgradeMode`        | string  | 否   | `manual` 或 `automatic`；控制 SFW 结算后产出成熟内容时的升级方式 |
| `callbacks`          | array   | 否   | HTTPS webhook；长视频等任务优先使用                              |
| `tags`               | array   | 否   | 可索引标签，适合关联租户、画布或任务 ID                          |
| `metadata`           | JSON    | 否   | 不可索引的附加数据，不得放 token                                 |
| `arguments`          | JSON    | 否   | 模板参数保留字段                                                 |
| `tips`               | object  | 否   | 可选创作者/Civitai tip                                           |
| `experimental`       | boolean | 否   | 标记实验性工作流，不能用来绕过参数或内容边界                     |
| `ephemeral`          | boolean | 否   | 不长期保留；必须配 callback 或 `wait>0`，终态后无法再查询        |

### `imageGen` 步骤结构

```json
{
  "$type": "imageGen",
  "input": {
    "engine": "sdcpp",
    "ecosystem": "zImage",
    "model": "turbo",
    "operation": "createImage",
    "prompt": "A cinematic portrait in warm window light"
  }
}
```

Z-Image 的固定 discriminator 组合：

| 字段        | Turbo         | Base          |
| ----------- | ------------- | ------------- |
| `$type`     | `imageGen`    | `imageGen`    |
| `engine`    | `sdcpp`       | `sdcpp`       |
| `ecosystem` | `zImage`      | `zImage`      |
| `model`     | `turbo`       | `base`        |
| `operation` | `createImage` | `createImage` |

Z-Image 不支持 `editImage` 或 `createVariant`。需要图生图或编辑时应选择官方声明支持对应 operation 的其他服务，不能向 Z-Image 塞入未知字段。

### Z-Image 输入参数完整表

下表来自 2026-08-02 的 live OpenAPI；“建议”列同时标明 Z-Image 官方 recipe 文档的调优建议。

| 参数             | 类型/范围               | 默认值                          | 必需 | 用法与限制                                                                                     |
| ---------------- | ----------------------- | ------------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| `engine`         | `sdcpp`                 | 无                              | 是   | 固定值                                                                                         |
| `ecosystem`      | `zImage`                | 无                              | 是   | 区分大小写，固定值                                                                             |
| `model`          | `turbo` / `base`        | 无                              | 是   | Turbo 快且便宜；Base 提示词遵循和负面提示更强                                                  |
| `operation`      | `createImage`           | 无                              | 是   | Z-Image 唯一 operation                                                                         |
| `prompt`         | string, 最长 10000      | 无                              | 是   | schema 允许空字符串，但真实生成应提供有效提示词                                                |
| `negativePrompt` | string/null, 最长 10000 | 无                              | 否   | Turbo 在 CFG 1 时基本忽略；Base 更适用                                                         |
| `width`          | int32, `64..2048`       | `1024`                          | 否   | 官方 recipe 要求按 16 对齐                                                                     |
| `height`         | int32, `64..2048`       | `1024`                          | 否   | 官方 recipe 要求按 16 对齐                                                                     |
| `steps`          | int32, `1..150`         | Turbo `9`; Base `20`            | 否   | Turbo 建议 `8..12`；Base 建议 `20..30`                                                         |
| `cfgScale`       | double, `0..30`         | Turbo `1`; Base `4`             | 否   | Turbo 保持 `1`；Base 常用 `3..5`                                                               |
| `seed`           | int64/null              | 随机                            | 否   | 固定种子用于可复现；仍受模型/调度器/worker 版本影响                                            |
| `quantity`       | int32, `1..12`          | `1`                             | 否   | 数量越大越可能超过 100 秒同步等待窗口                                                          |
| `sampleMethod`   | enum                    | `euler`                         | 否   | 见下方完整枚举                                                                                 |
| `schedule`       | enum                    | `simple`                        | 否   | 见下方完整枚举；没有 `capitanZiT`                                                              |
| `loras`          | `{ [air]: number }`     | `{}`                            | 否   | key 必须是 model-version API 原始 AIR；OpenAPI 未给 strength 上下限，recipe 文档称 `0..2` 常用 |
| `controlNets`    | array                   | 无                              | 否   | 每项使用 `ImageJobControlNet` 结构，见下方                                                     |
| `diffuserModel`  | AIR string              | 由 model 自动解析               | 否   | 一般不要手填；指定自定义 checkpoint 时必须使用真实 AIR                                         |
| `outputFormat`   | enum                    | OpenAPI 未声明；本次实测 `jpeg` | 否   | `jpeg`、`png`、`webP`                                                                          |
| `imageMetadata`  | string/null             | 无                              | 否   | 写入图片的外部元数据；不得包含 token 或私密配置                                                |

### 支持的 sampler

live OpenAPI 的 `SdCppSampleMethod` 枚举：

```text
euler
heun
dpm2
dpm++2s_a
dpm++2m
dpm++2mv2
ipndm
ipndm_v
ddim_trailing
euler_a
lcm
res_multistep
res_2s
tcd
er_sde
```

### 支持的 schedule

live OpenAPI 的 `SdCppSchedule` 枚举：

```text
simple
discrete
karras
exponential
ays
bong_tangent
gits
sgm_uniform
smoothstep
kl_optimal
lcm
```

原 ComfyUI 工作流使用的 `capitanZiT` 不在列表中。不能把 ComfyUI 的组合字符串 `euler_capitanZiT` 直接放进 `sampleMethod`；API 中 sampler 和 schedule 是两个独立字段。

### ControlNet 参数

`controlNets[]` 每项结构：

| 字段           | 类型        | 必需           | 说明                                                 |
| -------------- | ----------- | -------------- | ---------------------------------------------------- |
| `preprocessor` | enum        | 是             | 预处理器名称                                         |
| `weight`       | number      | 是             | ControlNet 权重；live OpenAPI 未声明范围             |
| `startStep`    | number      | 是             | 起始步骤；live OpenAPI 未声明范围                    |
| `endStep`      | number      | 是             | 结束步骤；live OpenAPI 未声明范围                    |
| `image`        | string/null | 否             | AIR URN、URL 或 base64 data URL；调度前会转换成 blob |
| `mask`         | string/null | Inpaint 时需要 | inpaint mask                                         |

支持的 `preprocessor`：

```text
canny, mlsd,
depthZoe, depthAnything, depthAnythingV2, zoeDepthAnything, zoeDepth,
midasDepth, leresDepth, metric3dDepth,
softedgePidinet, hed, teed,
midasNormal, baeNormal, dsineNormal, metric3dNormal,
lineartRealistic, lineartStandard, lineartAnime, lineartManga, anyline,
scribble, scribbleXdog, scribblePidinet, fakeScribble,
openpose, dwpose,
oneformerCoco, oneformerAde20k, uniformer,
shuffle, tile, gray, rembg, inpaint
```

这里只确认了 schema 支持，未在本次付费测试中验证 ControlNet worker 行为。首次接入某个 preprocessor 时仍须先 `whatif`，再做一张最小真实测试。

### 图片结果字段

`ImageBlob` 的关键字段：

| 字段                  | 类型          | 说明                                |
| --------------------- | ------------- | ----------------------------------- |
| `id`                  | string        | blob ID                             |
| `type`                | `image`       | 媒体类型                            |
| `available`           | boolean       | 是否真的可读取                      |
| `url`                 | URI/null      | 原图签名 URL                        |
| `urlExpiresAt`        | datetime/null | 原图 URL 过期时间                   |
| `previewUrl`          | URI/null      | 缩略预览 URL                        |
| `previewUrlExpiresAt` | datetime/null | 预览 URL 过期时间                   |
| `jobId`               | string/null   | 关联 job                            |
| `width` / `height`    | int32/null    | 图片尺寸                            |
| `nsfwLevel`           | enum          | `pg`、`pg13`、`r`、`x`、`xxx`、`na` |
| `blockedReason`       | string/null   | blob 被拦截时的原因                 |

## 推荐调用流程

### 1. 解析模型和 LoRA

Z-Image Turbo 的工作流参数为：

```json
{
  "engine": "sdcpp",
  "ecosystem": "zImage",
  "model": "turbo",
  "operation": "createImage",
  "cfgScale": 1,
  "steps": 9,
  "sampleMethod": "euler",
  "schedule": "simple"
}
```

注意两个不同概念：

- recipe 的 `ecosystem` 是 `zImage`。
- 某个具体资源的 AIR ecosystem 以模型版本 API 返回的 `air` 为准，可能是 `zimageturbo`。

示例 LoRA 版本的响应包含：

```json
{
  "id": "<MODEL_VERSION_ID>",
  "modelId": "<MODEL_ID>",
  "baseModel": "ZImageTurbo",
  "air": "urn:air:example:lora:example-model@example-version"
}
```

正确规则：

```text
GET /api/v1/model-versions/<MODEL_VERSION_ID>
                    |
                    +-- 读取 response.air
                            |
                            +-- 原样作为 imageGen.input.loras 的 key
```

不要写成下面这样：

```text
urn:air:zImage:lora:example:manual-construction
```

这个手工构造的 AIR 在本次测试中通过了 `whatif`，但真实作业在调度瞬间失败，且服务端没有返回 `reason`。因此 `whatif` 成功不代表所有资源一定能在 worker 上执行。

### 2. 免费预检

```http
POST /v2/consumer/workflows?whatif=true&wait=100&hideMatureContent=false
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

请求体示例：

```json
{
  "allowMatureContent": true,
  "currencies": ["yellow"],
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "engine": "sdcpp",
        "ecosystem": "zImage",
        "model": "turbo",
        "operation": "createImage",
        "prompt": "<PROMPT>",
        "negativePrompt": "blurry, ugly, bad",
        "width": 768,
        "height": 1344,
        "cfgScale": 1,
        "steps": 9,
        "sampleMethod": "euler",
        "schedule": "simple",
        "seed": 123456789,
        "quantity": 1,
        "loras": {
          "urn:air:example:lora:example-model@example-version": 1.0
        }
      }
    }
  ]
}
```

预检至少检查：

- HTTP 状态为 `2xx`。
- 顶层有工作流 `id`。
- `steps[0].input.loras` 中的 AIR 没有被错误改写。
- 解析出的 `diffuserModel` 与目标生态一致。
- `cost.total` 符合预期。
- 预检没有产生 debit 交易。

本次正确 AIR 的预检结果：

```text
HTTP:               200
status:             unassigned
diffuserModel:      urn:air:zimageturbo:checkpoint:civitai:2168935@2442439
additionalResources: 1
cost.total:         9 Yellow Buzz
```

### 3. 真实提交

预检通过后，使用相同请求体提交：

```http
POST /v2/consumer/workflows?whatif=false&wait=100&hideMatureContent=false
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

`wait` 最长按官方 100 秒请求超时处理：

- `200`：工作流已到终态，仍需检查 `status`。
- `202`：工作流仍在执行，保存响应里的 `id` 并继续轮询。
- `400`：请求结构或字段校验失败，不要重试相同请求。
- `401` / `403`：认证或权限问题，不要轮换参数盲试。
- `429` / `5xx`：按官方建议使用带抖动的指数退避。

### 4. 正确轮询

只在工作流未到终态时轮询：

```http
GET /v2/consumer/workflows/{workflowId}
Authorization: Bearer <TOKEN>
```

官方建议的轮询间隔为 `2s -> 5s -> 10s -> 15s -> 30s`，之后维持 30 秒。终态包括：

```text
succeeded | failed | expired | canceled
```

禁止行为：

- 不要把 `output.images[0].url` 当作任务状态接口。
- 不要对 `available: false` 的 blob URL 循环请求。
- 不要在工作流已经 `failed` 后继续轮询，终态不会恢复。
- 不要因为提交接口返回 HTTP 200 就当作生成成功。

### 5. 读取和验证结果

Z-Image 成功结果位于：

```text
workflow.steps[].output.images[]
```

交付前必须同时满足：

```text
workflow.status == "succeeded"
step.status == "succeeded"
image.available != false
image.url 非空
GET image.url 返回 200
Content-Type 是 image/*
文件魔数、尺寸和响应声明一致
```

不要长期缓存签名 URL。应用需要保留图片时，应下载到自己的媒体存储，并只持久化本地资产引用。

## 正确案例

除“案例三”外，以下请求体依据 2026-08-02 的官方 Z-Image recipe 和 live OpenAPI 编写，未在本次会话中产生付费作业。首次在真实账户运行仍应先 `whatif=true`。

### 案例一：Z-Image Turbo 基础文生图

适合快速、低成本的一般文生图。Turbo 使用 `cfgScale: 1` 和约 9 steps。

```http
POST /v2/consumer/workflows?whatif=true&wait=30&hideMatureContent=true
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

```json
{
  "allowMatureContent": false,
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "engine": "sdcpp",
        "ecosystem": "zImage",
        "model": "turbo",
        "operation": "createImage",
        "prompt": "A quiet mountain cabin at sunrise, natural light, detailed photography",
        "width": 1024,
        "height": 1024,
        "cfgScale": 1,
        "steps": 9,
        "sampleMethod": "euler",
        "schedule": "simple",
        "quantity": 1,
        "outputFormat": "jpeg"
      }
    }
  ]
}
```

预检通过并获得用户付费授权后，仅把 URL 的 `whatif=true` 改成 `whatif=false`。不要在预检和真实提交之间改变 body，否则费用和资源解析结果不再对应。

### 案例二：Z-Image Base 与负面提示词

Base 比 Turbo 慢且贵，但官方 recipe 明确建议在需要提示词遵循、细节或负面提示时使用 Base。

```json
{
  "allowMatureContent": false,
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "engine": "sdcpp",
        "ecosystem": "zImage",
        "model": "base",
        "operation": "createImage",
        "prompt": "A detailed botanical illustration of alpine flowers, clean paper texture",
        "negativePrompt": "blurry, low quality, watermark, text, deformed",
        "width": 1024,
        "height": 1024,
        "cfgScale": 4,
        "steps": 20,
        "sampleMethod": "euler",
        "schedule": "simple",
        "seed": 123456789,
        "quantity": 1,
        "outputFormat": "png"
      }
    }
  ]
}
```

不要只把 Turbo 的 steps 拉高来代替 Base。官方文档建议需要更高质量时直接切换 `model: base`。

### 案例三：带 LoRA 的成人 Z-Image Turbo，本次实测成功

先从模型版本 API 获取 AIR：

```http
GET https://civitai.com/api/v1/model-versions/<MODEL_VERSION_ID>
```

从响应原样读取：

```json
{
  "air": "urn:air:example:lora:example-model@example-version"
}
```

预检和真实提交使用同一个 body：

```json
{
  "allowMatureContent": true,
  "currencies": ["yellow"],
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "engine": "sdcpp",
        "ecosystem": "zImage",
        "model": "turbo",
        "operation": "createImage",
        "prompt": "<AUTHORIZED_MATURE_PROMPT>",
        "negativePrompt": "blurry, ugly, bad",
        "width": 768,
        "height": 1344,
        "cfgScale": 1,
        "steps": 9,
        "sampleMethod": "euler",
        "schedule": "simple",
        "seed": 123456789,
        "quantity": 1,
        "loras": {
          "urn:air:example:lora:example-model@example-version": 1.0
        },
        "outputFormat": "jpeg"
      }
    }
  ]
}
```

免费预检：

```text
POST /v2/consumer/workflows?whatif=true&wait=100&hideMatureContent=false
```

真实提交：

```text
POST /v2/consumer/workflows?whatif=false&wait=100&hideMatureContent=false
```

脱敏成功响应的精简结构（真实工作流标识与计费细节已移除）：

```json
{
  "id": "workflow-example-succeeded",
  "status": "succeeded",
  "transactions": {
    "list": [{ "type": "debit", "amount": "<BUZZ_AMOUNT>", "accountType": "yellow" }]
  },
  "steps": [
    {
      "$type": "imageGen",
      "status": "succeeded",
      "output": {
        "images": [
          {
            "type": "image",
            "available": true,
            "url": "<SIGNED_URL>",
            "width": 768,
            "height": 1344,
            "nsfwLevel": "x"
          }
        ]
      }
    }
  ],
  "cost": { "total": "<BUZZ_AMOUNT>" }
}
```

### 案例四：异步提交和轮询

视频、大批量图片或不希望阻塞请求时使用 `wait=0`：

```text
POST /v2/consumer/workflows?whatif=false&wait=0&hideMatureContent=false
```

服务通常返回 `202` 和当前工作流：

```json
{
  "id": "<WORKFLOW_ID>",
  "status": "processing",
  "steps": [{ "name": "$0", "status": "processing" }]
}
```

之后查询同一工作流，不要重新 POST：

```text
GET /v2/consumer/workflows/<WORKFLOW_ID>
```

伪代码：

```ts
const terminalStatuses = new Set([
  "succeeded",
  "failed",
  "expired",
  "canceled",
]);
const delays = [2_000, 5_000, 10_000, 15_000, 30_000];

let workflow = await submitWorkflow(body, {
  wait: 0,
  hideMatureContent: false,
});
for (let index = 0; !terminalStatuses.has(workflow.status); index += 1) {
  await delay(delays[Math.min(index, delays.length - 1)]);
  workflow = await getWorkflow(workflow.id);
}

if (workflow.status !== "succeeded") {
  throw new Error(readWorkflowFailure(workflow));
}
```

实际应用不要新建第二套直连实现。当前项目应通过 `createCivitaiWorkflow` 和 `pollCivitaiWorkflow`，由本地 relay 处理密钥和 base URL。

### 案例五：多个 LoRA

schema 允许 `loras` map 同时包含多个 AIR：

```json
{
  "loras": {
    "<MODEL_VERSION_RESPONSE_1.air>": 0.8,
    "<MODEL_VERSION_RESPONSE_2.air>": 0.5
  }
}
```

每个 key 都必须来自对应 model-version API 的原始 `air`，并与目标基础模型兼容。这个示例只表示 schema 用法，本次未做多 LoRA 付费测试。

## 成人内容与 Buzz

官方提交指南确认：

- `allowMatureContent: true` 强制使用 Yellow Buzz。
- Blue 和 Green Buzz 只能结算 SFW 工作流。
- `hideMatureContent: false` 允许响应携带成人 blob URL。
- 输出仍可能被分类为成人等级；本次成功图片的 `nsfwLevel` 为 `x`。

Boundless Studio 当前按已确认的产品决定固定发送 `allowMatureContent: true`，并用 `hideMatureContent: false` 取回获授权的成熟内容结果；设置页会同时披露 Yellow Buzz 计费影响。这里没有绕过服务端分类或合规字段。若以后面向不同用户提供独立策略，必须新增显式产品设置，不能静默改变现有默认值。

## 失败排查顺序

工作流失败时依次检查：

1. `workflow.status`。
2. `steps[].status`。
3. `steps[].jobs[].reason`。
4. `steps[].jobs[].blockedReason`。
5. `steps[].output.errors[]`。
6. `transactions.list[]` 是否已退款。
7. 实际提交的 `input` 中模型、AIR、尺寸和枚举是否被解析成预期值。

官方失败原因处理：

| 原因                    | 含义                     | 处理                                            |
| ----------------------- | ------------------------ | ----------------------------------------------- |
| `no_provider_available` | 没有 worker 能执行该输入 | 调整不常见输入、换 provider/version，或稍后再试 |
| `blocked`               | 内容审核阻止             | 查看 `blockedReason`，不要重试相同输入          |
| `timeout` / `expired`   | 内部超时                 | 可缩小负载后重试                                |
| `canceled`              | 工作流被取消             | 仅在确实需要时重新提交                          |
| 没有 `reason`           | 通用失败                 | 官方允许使用完全相同请求体重试一次              |

同一请求无原因失败两次后，不应继续盲试。先对照模型版本 API 的 `air`、实时 OpenAPI 和已解析工作流输入。

## 脱敏复现测试记录

目标页面：`https://example.invalid/images/example`

公开元数据确认：

- 页面图片 ID：`<IMAGE_ID>`
- 生成方式：ComfyUI，`onSite: false`
- 基础模型：Z-Image Turbo
- 尺寸：`768 x 1344`
- Steps：`9`
- CFG：`1`
- Seed：`123456789`
- 页面 sampler：`euler_capitanZiT`
- 关联 LoRA 版本：`<MODEL_ID>@<MODEL_VERSION_ID>`
- `minor: false`，`poi: false`

原 PNG 的 ComfyUI 工作流还包含自定义节点和本地 LoRA 文件名。Civitai Orchestration 的公开 `imageGen` schema 没有 `capitanZiT` scheduler，也不能原样运行这些自定义 Comfy 节点。因此 API 只能做高相似复现，不能承诺逐像素一致。

### 失败测试：手工构造 AIR

错误 AIR：

```text
urn:air:example:lora:example-model@example-version
```

实测现象：

- `whatif` 返回 200，预估金额以服务端响应为准。
- 真实工作流在调度瞬间进入 `failed`。
- job 没有 `reason` 或 `blockedReason`。
- blob 为 `available: false`，签名 URL 返回 404。
- 失败响应中的交易明细应以服务端退款记录为准；本文不保留真实交易金额或工作流标识。
- 失败工作流：`workflow-example-failed-a`、`workflow-example-failed-b`

### 成功测试：使用版本 API 的原始 AIR

正确 AIR：

```text
urn:air:example:lora:example-model@example-version
```

实测结果：

```text
workflow id: workflow-example-succeeded
status:      succeeded
cost:        <BUZZ_AMOUNT> Yellow Buzz
image:       available=true, 768x1344 JPEG
SHA-256:     <OUTPUT_SHA256>
```

成功请求使用 `euler/simple` 代替源工作流的 `euler/capitanZiT`，其他核心参数保持一致。生成结果在构图、人物、浴室、镜面、灯光和服饰方面实现了高相似复现。

## per-recipe 接口的已知文档冲突

`Submitting work` 指南称 `/v2/consumer/recipes/{recipe}`：

- 支持 `whatif`、`wait` 和 `hideMatureContent`。
- 返回与通用接口相同的完整 Workflow。

但 2026-08-02 的 `imageGen` live OpenAPI 声明响应为 `ImageGenOutput`，实测未带 `wait` 的调用也返回：

```json
{
  "images": [{ "available": false }],
  "errors": []
}
```

响应没有可用于 `GetWorkflow` 的工作流 ID。由于官方指南、live OpenAPI 和线上行为不一致，当前集成应优先使用通用 `/v2/consumer/workflows`，不要依赖 per-recipe 路径实现异步状态管理。

## 与当前代码的对应关系

- `civitai-client.ts`
  - 提交和轮询工作流。
  - 必须保持提交后的同一 API key 用于轮询。
- `civitai-orchestration.ts`
  - 构建 query 和解析工作流终态、图片、视频 blob。
  - 解析时兼容顶层 `id` 和 `workflowId`，线上实测通用接口返回 `id`。
- `civitai-services.ts`
  - 服务目录和 `engine` / `ecosystem` / `model` 参数。
  - 服务的 recipe ecosystem 不能用于推导 LoRA AIR ecosystem。

新增 LoRA 支持时，应增加一个“根据 model version ID 读取并保存原始 `air`”的明确数据流，不能在 UI 或工作流构建器里通过字符串拼接生成 AIR。

## 安全与日志

- API token 只能从 provider 密钥存储读取，不得写入源码、fixture、Markdown、URL 或日志。
- 调试输出必须过滤 `Authorization`、prompt、negative prompt 和签名 URL。
- 不要把 token 直接放在可被进程列表读取的命令行参数中。
- 公共文档和测试使用占位 token、占位 prompt 与公开资源 AIR。
- 记录费用时保留金额和币种即可，不要记录账户信息。
- 成人提示词和生成结果按用户数据处理，不写入公开 fixture。

## 下次执行清单

- [ ] 重新读取实时 Z-Image 文档和 imageGen OpenAPI。
- [ ] 从 model-version API 获取 LoRA 的原始 `air`。
- [ ] 使用通用 `/workflows` 接口。
- [ ] 先 `whatif=true`，检查解析模型、LoRA 和费用。
- [ ] 获得用户明确授权后才执行付费提交。
- [ ] 提交使用 `wait<=100`。
- [ ] 非终态只轮询 workflow ID。
- [ ] 失败读取 job `reason` / `blockedReason` 和退款交易。
- [ ] 成功后实测 blob 的 HTTP、Content-Type、格式和尺寸。
- [ ] 不泄漏 token、提示词或签名 URL。
