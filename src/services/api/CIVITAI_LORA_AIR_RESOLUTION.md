# Civitai LoRA AIR resolution (verified 2026-08-03; ecosystem map rechecked 2026-08-30)

本文只记录 Civitai 官方一手资料（官方 API 实测、Civitai 官方 GitHub 仓库）及可复现的只读请求。未使用 token、生成/付费端点或私人资源。

## AIR 格式与 model/version 语义

Civitai 官方 `civitai_comfy_nodes` README 将 AIR 定义为 AI Resource、遵循 Uniform Resource Naming；Civitai 的简写形式是 `{model_id}` 或 `{model_id}@{version_id}`，完整示例为 `109395@84321`。README 明确写道：只有 model ID 时取作者指定的默认模型（“top most model an author designates”）。因此裸数字不是“version ID 猜测”，而是 model ID 的官方默认/主版本语义；但该默认选择规则没有在 REST API schema 中单独公开，客户端应把它视为服务端选择结果而不是自行按数组顺序推断。[官方源码（SHA 94949435）](https://github.com/civitai/civitai_comfy_nodes/blob/94949435eda6b03802471f837f45b99109041a6d/README.md#L39-L56)

完整 AIR 由官方 API 实测返回，形状为：

`urn:air:{ecosystem}:{type}:{source}:{modelId}@{versionId}`

例如公开 LoRA `modelId=264290`、`versionId=1558543` 返回 `urn:air:sdxl:lora:civitai:264290@1558543`；公开 checkpoint `133005/1759168` 返回 `urn:air:sdxl:checkpoint:civitai:133005@1759168`。这里的 `sdxl` 是生态，`lora`/`checkpoint` 是类型，`civitai` 是来源。

## 精确只读解析流程

1. 有版本 ID 时请求 `GET https://civitai.com/api/v1/model-versions/{versionId}`（注意路径是小写连字符 `model-versions`；`modelVersions` 实测返回网站 HTML/404）。
2. 响应中的 `id`、`modelId`、`air`、`baseModel`、`baseModelType`、`model.type`、`files[].downloadUrl` 是直接可用字段。实测 `GET .../1558543`：`id=1558543`、`modelId=264290`、`air=urn:air:sdxl:lora:civitai:264290@1558543`、`baseModel=Pony`、`baseModelType=Standard`、`model.type=LORA`、`downloadUrl=https://civitai.com/api/download/models/1558543`。
3. 只有 model ID 时请求 `GET https://civitai.com/api/v1/models/{modelId}`，读取 `modelVersions[]`。不要假设裸 ID 是版本；要么将裸 AIR 交给 Civitai 的默认选择语义，要么先请求模型详情并让用户/服务端选择版本。
4. 版本 ID 的精确 AIR 必须使用响应中的 `air` 原样保存；不得用 `modelId`、`baseModel` 或 `model.type` 自行组装。`baseModel` 与 AIR ecosystem 并非可逆映射，手工拼接即使偶尔通过预检，也不能证明 worker 能加载该资源。

官方旧版 REST 参考也记录了上述 model/version 端点、`modelVersions[].downloadUrl`、文件哈希以及按哈希反查端点 `GET /api/v1/model-versions/by-hash/{hash}`；当前服务实测该按 SHA256 端点返回同一版本 JSON。[官方 REST 参考](https://github.com/civitai/civitai/wiki/REST-API-Reference/a1f328d15e27c0149c4627473008c99f110f1a61)

## 下载 URL 与反查边界

`downloadUrl`（例如 `https://civitai.com/api/download/models/1558543`）是版本下载 URL；它包含 version ID，可反推出候选版本号，但这不是官方声明的“download URL -> AIR”解析 API。官方支持的确定性反查是 `GET /api/v1/model-versions/by-hash/{hash}`（需本地文件哈希；旧资料说明支持 AutoV1/AutoV2/SHA256/CRC32/Blake3，且旧文件可能尚未完成哈希）。因此仅凭重定向后的 CDN URL、文件名或下载 URL 本身，不应声称可官方反查完整 AIR；优先使用 URL 中的数字调用 model-version API，再校验响应 `air`。

## 生态/兼容性字段

`baseModel` 是版本级生态标签（实测 LoRA 为 `Pony`，checkpoint 为 `SDXL 1.0`），`baseModelType` 实测为 `Standard`；模型级 `type`/版本级 `model.type` 区分 `LORA`、`Checkpoint` 等。API 还返回 `files[].metadata.format`（如 `SafeTensor`）及哈希。`baseModel` 是兼容性提示，不是 AIR 的 `type`：LoRA AIR 的 type 来自 `model.type=LORA`，生态来自 AIR 中的 `sdxl`；不要把 `baseModel` 字符串直接当作 AIR ecosystem，需保留未知值并向用户提示兼容性。

当前公开 LoRA 的 site-API `air` 生态段与 `baseModel` 对照（2026-08-30 只读 `GET /api/v1/model-versions/{id}`）：

| `baseModel` | AIR ecosystem | 对应 imageGen 服务 |
| --- | --- | --- |
| `ZImageTurbo` | `zimageturbo` | `image/sdcpp/zImage/turbo/*` |
| `ZImageBase` | `zimagebase` | `image/sdcpp/zImage/base/*` |
| `Anima` | `anima` | `image/*/anima/*` |
| `Ernie` | `ernie` | `image/*/ernie/*` |
| `Qwen` | `qwen` | `image/sdcpp/qwen/20b/*` |
| `Pony` / `Illustrious` / `NoobAI` / `SDXL Lightning` / `SDXL Hyper` | `sdxl` | `image/*/sdxl/*` |
| `Flux.2 D` / `Flux.2 Klein 4B` / `Flux.2 Klein 4B-base` / `Flux.2 Klein 9B` / `Flux.2 Klein 9B-base` | `flux2` | `image/flux2/klein/*` 与 `image/sdcpp/flux2Klein/*` |
| `Flux.1 D` / `Flux.1 S` | `flux1` | `image/comfy/flux1/*` |
| `Krea 2` | `krea2` | `image/comfy/krea2/*`（FAL Krea 无 `loras`） |
| `HiDream` | `hidream` | `image/comfy/hidream/*` |
| `HiDream-O1` | `hidream-o1` | `image/comfy/hidream-o1/*` |
| `Wan Image 2.7` | `wanimage27` | WAN image 走 array `{air,strength}`，不按 ecosystem 猜测 |

recipe 占位 `urn:air:zImage:lora:...` 不是 live Turbo/Base AIR。官方 AIR 文档允许可选 `+fileId` 与 `.format` 后缀，解析后必须原样作为 `loras` key。当前 site 文档：[AIR identifiers](https://developer.civitai.com/site/guide/air.md)、[Model versions](https://developer.civitai.com/site/reference/model-versions.md)。

## 认证、CORS、限流与错误

上述 GET 端点对中性公开资源无需 Authorization；实测响应包含 `access-control-allow-origin: *`、`access-control-allow-methods: GET`、`access-control-allow-headers: *`。这只证明当前公开 GET 的 CORS 响应，不能推断下载受限资源或其他 API 的认证规则。未携带私人 token 进行验证。

公开不存在的 version（`999999999`）实测为 HTTP `404`、JSON `{\"error\":\"Model not found\"}`；错误文案将 model/version 统一称为 Model。应按 HTTP 状态处理，不依赖文案。限流阈值/响应头在本次只读请求中未触发，官方可核对资料未给出可保证的数字；实现应处理 HTTP 429/重试提示而不硬编码配额。

## 可复现实测（只读）

```sh
curl -sS https://civitai.com/api/v1/model-versions/1558543
curl -sSI https://civitai.com/api/v1/model-versions/1558543
curl -sS https://civitai.com/api/v1/model-versions/by-hash/DD08FA32F98D05A2443CA1419E46DF1575A0811F6E3B246D9DD47FF20F5EB66A
curl -sS -i https://civitai.com/api/v1/model-versions/999999999
```

注意：公开 API 的响应字段和官方 wiki 存在版本演进（当前响应包含 `air`、`baseModelType`、`model`，旧 wiki 未列出）；以上以 2026-08-03 实测为准，未把旧 wiki 缺失字段当作不存在。
