# 视频参考素材 Provider 合同核验

> 核验截止：2026-08-11（Asia/Tokyo）
> Civitai 实时目录抓取记录：2026-08-02T22:44:53Z（发布前仍需重新读取 live catalog）
> 范围：Agnes Video v2.0、OpenAI Videos、阿里云百炼 DashScope（Wan / HappyHorse）、火山方舟 Ark（Seedance 1.x / 2.0）、Civitai Orchestration。

本文只记录官方文档、官方 API Explorer、官方 OpenAPI、官方源码中可以直接验证的合同。没有使用聚合商文档替代原生 provider 文档，没有调用付费生成接口，也没有读取或记录任何用户密钥。

## 结论

不能只接 Agnes，也不能把所有 provider 压成一个模糊的 `images[]` 空壳：各家的参考语义、数量上限和组合能力并不相同。

- **Agnes v2.0**：单图 I2V 使用顶层 `image`；关键帧使用 `extra_body.image[]` + `extra_body.mode: "keyframes"`。官方文档没有公布上限；对当前 `agnes-video-v2.0` 中转实测为 2–3 张，超过 3 张在创建阶段拒绝。没有语义参考角色。
- **OpenAI Videos**：`input_reference` 是单张开场首帧；当前官方指南另有最多两个非真人 character 视频资产，并明确可以和 `input_reference` 组合。它不是“多参考图片”。更重要的是，Videos API / Sora 2 已公告于 **2026-09-24** 下线，不适合作为新的长期主 provider。
- **DashScope Wan 2.7**：I2V 原生支持首帧、首尾帧；R2V 支持最多 1 张首帧再加最多 5 个语义图片/视频参考，是本次核验中原生“首帧 + 语义参考”合同最明确的一家。
- **DashScope HappyHorse 1.1**：I2V 必须且只能 1 张首帧；R2V 接受 1–9 张语义参考图。两种能力是不同模型/合同，不能混传。
- **Ark Seedance 1.x**：通用创建接口与 `content[]` 已公开，示例模型是 1.0 Pro；当前公开 API Explorer 没有给出模型级 role、首尾/参考组合规则和图片上限，因此只能保守接入已验证字段。
- **Ark Seedance 2.0**：当前实现按精确 standard/fast/mini model ID 分 profile，支持 T2V、首帧、首尾帧和 1–9 张普通 `reference_image`；三种图片模式互斥，带引用时必须显式 operation。未知 Ark model 不继承这个合同，必须阻断并要求显式 capability profile。官方一手入口见 [CreateContentsGenerationsTasks](https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01)、[Seedance 2 教程](https://docs.volcengine.com/docs/82379/2291680) 和 [可信素材文档](https://www.volcengine.com/docs/82379/2315856?lang=en)。
- **Civitai Orchestration**：应以实时 `/v2/services` 和 `videoGen/openapi.json` 为事实来源。目录与 schema 已覆盖 Wan 2.7、HappyHorse 1.1、Sora 和 Seedance，但目录状态、modalities 与详细 schema 之间存在差异；必须按 service id、status 和 discriminator 分派，不能只看 engine 名称。

## 能力矩阵

符号含义：`是` = 官方请求合同明确；`声明` = 官方一方只给能力说明、未给足字段合同；`否` = 当前公开合同不能表达；`未公布` = 没有足够一手证据。

| Provider / 模型合同 | 单首帧 | 首尾帧 | 多关键帧 | 语义多参考 | 首帧 + 语义参考 | 图片数量合同 |
| --- | --- | --- | --- | --- | --- | --- |
| Agnes `agnes-video-v2.0` | 是：顶层 `image`（文档称 I2V，未命名为 `first_frame`） | 可用两个 keyframe 表达过渡，但不是专用首/尾字段 | 是：`extra_body.image[]` | 否：没有 role/subject 字段 | 否 | 单图 I2V 为 1；官方上限未公布，当前中转实测关键帧 2–3 张 |
| OpenAI `sora-2` / `sora-2-pro` | 是：`input_reference`，官方明确作为第一帧 | 否 | 否 | 非图片：最多 2 个 character 视频资产 | 是：官方指南明确 character 可与 `input_reference` 组合 | 图片 1；另可有最多 2 个 character 资产 |
| DashScope Wan 2.7 I2V | 是：`media[].type = first_frame` | 是：再加唯一 `last_frame` | 否 | 否 | 否（应改用 R2V 合同） | 最多 2 张：首帧 + 尾帧 |
| DashScope Wan 2.7 R2V | 仅与语义参考组合：`first_frame` | 否 | 否 | 是：`reference_image` / `reference_video` | 是 | 首帧最多 1；图片+视频语义参考合计最多 5；全为图片时图片总数最多 6 |
| DashScope Wan 2.6 及更早 I2V | 是：旧协议 `input.img_url` | Wan 2.2 KF2V 有专用首尾帧合同 | 否 | 否 | 否 | 普通 I2V 1；KF2V 2 |
| HappyHorse 1.1 I2V | 是：`media=[{type:"first_frame",url}]` | 否 | 否 | 否 | 否 | 必须且只能 1 张 |
| HappyHorse 1.1 R2V | 否 | 否 | 否 | 是：`media[].type = reference_image` | 否 | 1–9 张 |
| Ark Seedance 1.x | API 示例有单张 `image_url`，但未公开 role | 未公布完整合同 | 未公布 | 未公布完整合同 | 未公布 | API Explorer 未公布模型级上限 |
| Ark Seedance 2.0 standard/fast/mini | 是：精确 operation=`image-to-video` | 是：精确 operation=`first-last-frame-to-video` | 不把普通参考图伪装成关键帧 | 是：`reference_image`，1–9 张 | 否：图片模式互斥，需改用明确 operation | standard 480/720/1080p；fast/mini 480/720p；参考图 1–9 |
| Civitai Seedance v2 / fast / mini | schema 有 `images[]`，未定义首帧 role | 未定义 | 未定义 | 数组传输可表达多素材，但 role/顺序语义未公布 | 未定义 | `images[]` / `referenceVideos[]` / `referenceAudios[]` 均未声明 `maxItems` |
| Civitai HappyHorse 1.1 I2V | 是：单个 `image` | 否 | 否 | 否 | 否 | 1 |
| Civitai HappyHorse 1.1 R2V | 否 | 否 | 否 | 是：`images[]` | 否 | schema 描述为 1–9 |
| Civitai Wan 2.7 I2V | 是：`startImage` | 是：`startImage` + `endImage` | 否 | 否 | 否 | 2 |
| Civitai Wan 2.7 R2V | 否 | 否 | 否 | 是：`referenceImages[]` / `referenceVideoUrls[]` | 否：该 schema 没有 `firstFrame` | schema 未声明数组 `maxItems` |
| Civitai Sora I2V | `images[]`，但未声明精确数量/首帧 role | 否 | 否 | 未公布 | 未公布 | 未公布 |

## 1. Agnes Video v2.0

官方文档：[Agnes Video V2.0](https://agnes-ai.com/en/docs/agnes-video-v20)。

### 创建合同

```http
POST https://apihub.agnes-ai.com/v1/videos
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

```json
{
  "model": "agnes-video-v2.0",
  "prompt": "...",
  "image": "https://example.com/source.png",
  "width": 1152,
  "height": 768,
  "num_frames": 121,
  "frame_rate": 24
}
```

关键帧合同是另一组字段：

```json
{
  "model": "agnes-video-v2.0",
  "prompt": "...",
  "extra_body": {
    "image": [
      "https://example.com/keyframe-1.png",
      "https://example.com/keyframe-2.png"
    ],
    "mode": "keyframes"
  }
}
```

已验证字段：`model`、`prompt`、顶层 `image`、`mode`、`width`、`height`、`num_frames`、`frame_rate`、`num_inference_steps`、`seed`、`negative_prompt`、`extra_body.image[]`、`extra_body.mode`。`num_frames <= 441` 且须满足 `8n+1`，`frame_rate` 为 `1..60`。

### 不能自行推断的内容

- 文档把顶层 `image` 称为 image-to-video 输入，没有承诺这是通用语义参考图。
- `extra_body.image[]` 被称为 multiple keyframes，官方示例只放了两张；没有公布 `minItems` / `maxItems`。当前中转的脱敏实测接受 2、3 张并拒绝 4、8 张，因此本地精确模型 profile 使用 2–3 张；这不是官方文档上限声明。
- 没有首帧/尾帧专用字段、reference role、首帧与语义参考联合控制字段。
- 顶层 `image` 与 `extra_body.image[]` 同时出现时的优先级或互斥关系未公布。
- 公共 `GET /v1/openapi.json` 实测为 404，无法用公开 OpenAPI 补足上述限制。

查询结果推荐使用 `GET https://apihub.agnes-ai.com/agnesapi?video_id=...`；`GET /v1/videos/{task_id}` 是兼容旧入口。创建响应可能同时返回 `task_id` 和 `video_id`。

## 2. OpenAI Videos

官方资料：[Videos API 创建参考](https://developers.openai.com/api/reference/resources/videos/methods/create)、[Sora 视频生成指南](https://developers.openai.com/api/docs/guides/video-generation)、[官方 OpenAPI 固定提交](https://github.com/openai/openai-openapi/blob/117ce5680e4269f6656a4fd70d28f9755630d938/openapi.yaml#L68624-L68703)。

### 单张首帧

```http
POST https://api.openai.com/v1/videos
```

- JSON：`input_reference: { "image_url": "..." }` 或 `{ "file_id": "..." }`，两者应二选一。
- multipart：`input_reference` 可作为二进制图片 part；官方 OpenAPI 还允许引用对象。
- `input_reference` 是单个对象，不是数组。指南明确说明它作为视频的第一帧。
- `image_url` 可为完整 URL 或 base64 data URL；schema 的 `maxLength: 20971520` 是字符串长度约束，不能擅自解释为 20 MB 文件大小上限。

当前 Create API 参考页没有 `last_frame`、多关键帧或多个图片 reference 字段。

### Character 资产是另一种语义参考

当前官方指南说明：

1. 先把 2–4 秒、720p–1080p、16:9 或 9:16 的 MP4 上传到 `POST /v1/videos/characters`。
2. 创建视频时传 `characters: [{ "id": "char_..." }]`，并在 prompt 中逐字使用 character name。
3. 单个视频最多包含两个 characters。
4. Characters 可以和 `input_reference` 同时使用。
5. Character 主要面向非真人主体；真人 likeness 默认阻止，需额外资格。

因此 OpenAI 支持“单张首帧 + 最多两个语义 character 资产”，但这两个 character 是复用的视频资产，不是多张参考图片。当前 Create API 参考页和官方 OpenAPI 尚未列出 `characters`，而指南已经给出请求示例，属于官方资料不同步；接入时应把 character 功能独立做成能力开关，不要混进 `input_reference[]`。

### 生命周期风险

官方指南当前明确标记 Videos API、`sora-2`、`sora-2-pro` 及相关 snapshots 已弃用，将于 **2026-09-24** 关闭。保留已有接入可以，但不应把它作为新项目唯一或长期默认的视频 provider。

## 3. Alibaba Cloud Model Studio / DashScope

所有 HTTP 视频创建都使用异步头：

```http
X-DashScope-Async: enable
Content-Type: application/json
```

当前推荐的工作区端点形如：

```text
POST https://{WorkspaceId}.{region}.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis
GET  https://{WorkspaceId}.{region}.maas.aliyuncs.com/api/v1/tasks/{task_id}
```

模型、端点和 API key 必须属于同一区域；不能把北京、新加坡、美国、德国、日本的域名和 key 混用。

### 3.1 Wan 2.7 I2V

官方资料：[Wan 2.7 image-to-video API](https://help.aliyun.com/en/model-studio/image-to-video-general-api-reference)。

```json
{
  "model": "wan2.7-i2v-2026-04-25",
  "input": {
    "prompt": "...",
    "media": [
      { "type": "first_frame", "url": "https://example.com/first.png" },
      { "type": "last_frame", "url": "https://example.com/last.png" }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "duration": 10,
    "prompt_extend": false,
    "watermark": true
  }
}
```

合法组合只包括：`first_frame`、`first_frame + driving_audio`、`first_frame + last_frame`、`first_frame + last_frame + driving_audio`、`first_clip`、`first_clip + last_frame`。每个 `type` 最多出现一次，所以这不是任意多关键帧接口。

图片限制：JPEG/JPG/PNG（不支持 alpha）/BMP/WEBP；宽高各 `240..8000`；宽高比 `1:8..8:1`；每张最多 20 MB。

### 3.2 Wan 2.7 R2V

官方资料：[Wan reference-to-video API](https://help.aliyun.com/en/model-studio/wan-video-to-video-api-reference)。

```json
{
  "model": "wan2.7-r2v-2026-06-12",
  "input": {
    "prompt": "Image 1 enters from the left while Video 1 speaks...",
    "media": [
      { "type": "first_frame", "url": "https://example.com/opening.png" },
      { "type": "reference_image", "url": "https://example.com/subject.png" },
      { "type": "reference_video", "url": "https://example.com/subject.mp4" }
    ]
  },
  "parameters": {
    "resolution": "1080P",
    "duration": 10,
    "ratio": "16:9"
  }
}
```

官方明确约束：

- `first_frame` 最多 1 张。
- 至少有 1 个 `reference_image` 或 `reference_video`。
- 参考图片 + 参考视频合计最多 5 个。
- `first_frame` 可以与主体参考联合控制。
- prompt 使用 `Image 1`、`Video 1` 对应各自媒体类型在数组中的顺序。
- 存在首帧时 `parameters.ratio` 被忽略，输出比例跟随首帧。

因此全用图片时，理论图片输入总数上限是 `1 first_frame + 5 reference_image = 6`；这不是 6 张关键帧，而是 1 张时间锚点加 5 张语义参考。

### 3.3 Wan 2.6 及更早版本

官方资料：[Wan legacy first-frame API](https://help.aliyun.com/en/model-studio/legacy-image-to-video-api-reference/)、[Wan 2.2 first/last-frame API](https://help.aliyun.com/en/model-studio/legacy-image-to-video-by-first-and-last-frame-api-reference)。

- 普通 I2V 使用旧字段 `input.img_url`，只表达首帧。
- Wan 2.2 KF2V 使用 `input.first_frame_url` 和 `input.last_frame_url`。
- 不要把 Wan 2.7 的 `input.media[]` 结构发送给这些旧模型，也不要把旧字段发送给 2.7。
- `shot_type: "multi"` 是多镜头叙事设置，不等于多关键帧或多参考图。

### 3.4 HappyHorse 1.1 I2V

官方资料：[HappyHorse first-frame I2V API](https://help.aliyun.com/en/model-studio/happyhorse-image-to-video-api-reference)。

```json
{
  "model": "happyhorse-1.1-i2v",
  "input": {
    "prompt": "...",
    "media": [
      { "type": "first_frame", "url": "https://example.com/first.png" }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "duration": 5
  }
}
```

`media` 必须且只能含一张 `first_frame`。图片为 JPEG/JPG/PNG/WEBP，宽高均至少 300，宽高比 `1:2.5..2.5:1`，最多 20 MB。I2V 不支持 `ratio`，输出比例跟随首帧。

### 3.5 HappyHorse 1.1 R2V

官方资料：[HappyHorse reference-to-video API](https://help.aliyun.com/en/model-studio/happyhorse-reference-to-video-api-reference)。

```json
{
  "model": "happyhorse-1.1-r2v",
  "input": {
    "prompt": "The subject in [Image 1] holds the prop in [Image 2]...",
    "media": [
      { "type": "reference_image", "url": "https://example.com/subject.png" },
      { "type": "reference_image", "url": "https://example.com/prop.png" }
    ]
  },
  "parameters": {
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 5
  }
}
```

图片数量为 1–9；prompt 用 `[Image 1]` 到 `[Image 9]` 对应数组顺序。图片为 JPEG/JPG/PNG/WEBP，短边至少 400，最多 20 MB。这个合同没有 `first_frame`，不能把 I2V 首帧和 R2V 参考图混在同一个请求中。

## 4. Volcengine Ark / Seedance

### 4.1 当前公开通用任务合同

官方 API Explorer：[CreateContentsGenerationsTasks](https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01)。页面更新时间为 2025-11-20。

```http
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
```

```json
{
  "model": "doubao-seedance-1-0-pro-250528",
  "content": [
    {
      "type": "text",
      "text": "... --ratio adaptive --dur 5"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/source.png"
      }
    }
  ],
  "callback_url": "https://example.com/callback",
  "return_last_frame": true
}
```

API Explorer 当前只把 `content` 定义为支持文本和图片的对象数组，并展示 `type: text` / `type: image_url`；没有在这份公开通用 schema 中列出模型级 image role、图片上限、首尾组合或参考组合规则。`return_last_frame` 是让结果额外返回尾帧图片，不能误解为输入尾帧。

### 4.2 Seedance 1.x

当前 API Explorer 的可执行示例使用 `doubao-seedance-1-0-pro-250528`，并展示一个文本 content item 或文本加一个 `image_url` item。它没有针对 1.0 Pro、1.0 Pro Fast、1.0 Lite I2V、1.5 Pro 分别给出 `role` 枚举、首尾帧字段、语义参考字段或图片数量约束。

因此即使其他产品页面或开发者社区文章描述了首帧、首尾帧或参考图能力，也不能据此自己发明 `first_frame` / `last_frame` / `reference_image` 的 JSON 形状；只有模型级官方 API 文档或 schema 才能解除这个限制。

### 4.3 Seedance 2.0

当前代码只对三个精确模型 ID 启用这组合同：

| Profile | Model ID | 分辨率 | 图片模式 |
| --- | --- | --- | --- |
| standard | `doubao-seedance-2-0-260128` | 480p / 720p / 1080p | T2V、首帧、首尾帧、普通参考图 1–9 |
| fast | `doubao-seedance-2-0-fast-260128` | 480p / 720p | 同上 |
| mini | `doubao-seedance-2-0-mini-260615` | 480p / 720p | 同上 |

已验证的请求参数包括 `duration=-1` 或 4–15、`ratio`=`21:9/16:9/4:3/1:1/3:4/9:16/adaptive`、`generate_audio`、`watermark` 和 `return_last_frame`。有引用时必须显式指定 `image-to-video`、`first-last-frame-to-video` 或 `reference-to-video`；不会按引用数组的首项猜模式，也不会把普通参考图裁成首图。

```json
{
  "type": "image_url",
  "image_url": { "url": "https://example.com/reference-1.png" },
  "role": "reference_image"
}
```

官方一手入口：[CreateContentsGenerationsTasks](https://api.volcengine.com/api-docs/view?action=CreateContentsGenerationsTasks&serviceCode=ark&version=2024-01-01)、[Seedance 2 教程](https://docs.volcengine.com/docs/82379/2291680)、[可信素材文档](https://www.volcengine.com/docs/82379/2315856?lang=en)。

仍未在当前代码中启用的边界：参考视频/参考音频的具体 role 与 serializer、未知自定义 Ark model 的能力、以及服务端未公布的请求级总素材上限。未知或不匹配的 profile 必须 fail-closed；只有用户显式配置并通过精确 capability 校验后才可启用。

## 5. Civitai Orchestration

### 5.1 实时事实来源

- [服务目录（视频过滤）](https://orchestration.civitai.com/v2/services?limit=200&offset=0&category=video)
- [videoGen live OpenAPI JSON](https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.json)
- [videoGen live OpenAPI YAML](https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.yaml)
- [Civitai 官方源码：HappyHorse handler](https://github.com/civitai/civitai/blob/9592fe1e96a78f47defeca79dba8568997fc6a81/src/server/services/orchestrator/ecosystems/happy-horse.handler.ts#L53-L164)
- [Civitai 官方源码：Seedance handler](https://github.com/civitai/civitai/blob/9592fe1e96a78f47defeca79dba8568997fc6a81/src/server/services/orchestrator/ecosystems/seedance.handler.ts#L28-L48)
- [Civitai 官方源码：Sora handler](https://github.com/civitai/civitai/blob/9592fe1e96a78f47defeca79dba8568997fc6a81/src/server/services/orchestrator/ecosystems/sora.handler.ts#L28-L55)

本次实时 GET：

- `/v2/services?...category=video` 返回 `totalCount: 61`。
- 目录响应 SHA-256：`d6516eb9290444e3417a2fa1d66f7a8c113def05c6b59688bcb1035031110864`。
- `videoGen/openapi.json` SHA-256：`4e59dbe90eccad8d8666e5ce98ef9ec8049c30ecb313a166a4ca2f677453a33b`。
- 公开目录和 OpenAPI GET 不需要用户密钥；实际 recipe 提交需要认证，本次没有提交生成。

### 5.2 目标服务的实时目录状态

| Service id | 状态 | 目录输入模态 |
| --- | --- | --- |
| `video/seedance` | `degraded` | 仅列 `text` |
| `video/happyHorse/v1.1/imageToVideo` | `available` | `text,image` |
| `video/happyHorse/v1.1/referenceToVideo` | `unknown` | `text,image` |
| `video/sora/image-to-video` | `unknown` | `text,image` |
| `video/wan/v2.7/fal/image-to-video` | `available` | `text,image` |
| `video/wan/v2.7/fal/reference-to-video` | `unknown` | `text,image` |

目录中没有 Agnes service id。目录有 OpenAI Sora 引擎，但不是 OpenAI 原生 API 合同，而是 Civitai 通过其 worker/provider 层暴露的独立合同。

`unknown` 不能当成 `available`；`unavailable` 也不能展示成可生成。服务目录是动态数据，任何内置 fallback 都只能作为离线可见性，不得伪装为实时可用状态。

### 5.3 live OpenAPI 的真实请求字段

快捷 recipe 直接接收 discriminator body，而不是原生 provider body：

```http
POST /v2/consumer/recipes/videoGen
Content-Type: application/json
```

所有输入继承 `VideoGenInput`，必需 `engine` 和 `prompt`，并按 `engine` / `operation` / `version` / `provider` 分派。多数具体 schema 设置 `additionalProperties: false`，所以不能塞入“通用备用字段”。

#### Civitai Seedance

```json
{
  "engine": "seedance",
  "model": "v2",
  "prompt": "...",
  "aspectRatio": "16:9",
  "duration": 5,
  "resolution": "720p",
  "generateAudio": true,
  "images": ["https://example.com/a.png"],
  "referenceVideos": ["https://example.com/a.mp4"],
  "referenceAudios": ["https://example.com/a.mp3"]
}
```

`model` 枚举为 `v2`、`v2-fast`、`v2-mini`；`duration` 为 `4..15` 的整数枚举；`resolution` 为 `480p|720p|1080p`。三个素材数组都没有 `maxItems`，也没有 role/first/last 标记。目录只写 text 输入，而 schema 接受图片、视频、音频，二者冲突时应以具体 recipe OpenAPI 校验请求，但仍不能擅自承诺未声明的参考语义和上限。

#### Civitai HappyHorse 1.1

I2V：

```json
{
  "engine": "happyHorse",
  "version": "v1.1",
  "operation": "imageToVideo",
  "prompt": "...",
  "image": "https://example.com/first.png",
  "resolution": "1080p",
  "duration": 5
}
```

R2V：

```json
{
  "engine": "happyHorse",
  "version": "v1.1",
  "operation": "referenceToVideo",
  "prompt": "character1 meets character2",
  "images": [
    "https://example.com/subject-1.png",
    "https://example.com/subject-2.png"
  ],
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "duration": 5
}
```

live schema 的 R2V 描述明确为 1–9 张参考图，并要求 prompt 使用 `character1` 到 `character9`。I2V 是单个 `image`。由于两个 schema 均 `additionalProperties: false`，不能在 R2V 中追加 `image` 首帧，也不能在 I2V 中追加 `images[]`。

#### Civitai Wan 2.7

I2V：

```json
{
  "engine": "wan",
  "version": "v2.7",
  "provider": "fal",
  "operation": "image-to-video",
  "prompt": "...",
  "startImage": "https://example.com/first.png",
  "endImage": "https://example.com/last.png"
}
```

R2V：

```json
{
  "engine": "wan",
  "version": "v2.7",
  "provider": "fal",
  "operation": "reference-to-video",
  "prompt": "...",
  "referenceImages": ["https://example.com/subject.png"],
  "referenceVideoUrls": ["https://example.com/subject.mp4"],
  "multiShots": false
}
```

Civitai 的 Wan 2.7 R2V schema 没有原生 DashScope 合同中的 `first_frame`，也没给参考数组 `maxItems`。因此不能把 DashScope 的“首帧 + 最多 5 个参考”上限直接搬到 Civitai；这是两个独立 transport 合同。

#### Civitai Sora

```json
{
  "engine": "sora",
  "operation": "image-to-video",
  "prompt": "...",
  "images": ["https://example.com/source.png"],
  "resolution": "720p",
  "duration": 4,
  "aspectRatio": "auto",
  "usePro": false
}
```

live schema 使用 `images[]`，但没有 `minItems` / `maxItems`，也没有 OpenAI 原生的 `input_reference` 或 `characters` 字段。不能把 Civitai Sora 与 OpenAI 原生 Videos API 当作同一个 serializer。

## 实现约束

为避免误导和空壳功能，provider capability / serializer 至少应遵守以下规则：

1. 能力按 **provider + model/version + operation** 解析，不能只按“视频模型”或 engine 名称解析。
2. UI 只展示当前合同可表达的 reference intent；没有合同的组合直接隐藏或明确禁用，不能静默丢图。
3. 序列化前按 provider 上限验证；超限报错必须说明实际支持数量，不能截断。
4. 语义参考、时间关键帧和普通 I2V 首帧是三种不同意图，不能因为都是图片就合并成同一 `images[]`。
5. OpenAI character 是视频资产；不得把普通图片伪装成 character，也不得把 character id 填进 `input_reference`。
6. DashScope Wan 2.7 I2V、Wan 2.7 R2V、HappyHorse I2V、HappyHorse R2V 必须使用各自字段合同。
7. Ark Seedance 2.0 只按精确 model + operation 使用已验证的首帧、首尾帧和 1–9 普通参考图合同；未知 model、混合图片模式和未验证的视频/音频参考保持阻断。
8. Civitai 每次优先读取 live 目录；只有 `available` / 项目明确接受的 `degraded` 才可作为可选服务，`unknown` / `unavailable` 不得冒充可用。
9. Civitai 按 live OpenAPI discriminator 构造 body；不要把原生 OpenAI、DashScope 或 Ark 字段透传给 Civitai recipe。
10. 外部文档和目录会变；发布前重新 GET Civitai 目录/OpenAPI，并复核 OpenAI 下线状态及 Ark Seedance 2.0 模型级文档。

## 未验证项清单

以下内容截至 2026-08-11 仍应在代码中标为未知，而不是用猜测补齐：

- Agnes `extra_body.image[]` 的最大图片数，以及与顶层 `image` 的组合规则。
- OpenAI guide 的 `characters[]` 与当前 Create API reference / OpenAPI 不同步时的运行时资格和账号可用性。
- Ark Seedance 1.x 的完整 role 枚举、全部媒体组合和每类/总素材上限；Seedance 2.0 的参考视频/音频组合和服务端总素材上限。
- Civitai Seedance、Sora、Wan 2.7 R2V 数组的服务端实际上限；live schema 没有 `maxItems`。
- Civitai `unknown` 状态服务是否可实际调度；本次未进行付费生成验证。
