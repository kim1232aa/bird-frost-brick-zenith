# 2026-09-16 全板块页面点击 E2E 验证（10/10 PASS）

用户要求：生图/改图/生视频/图生视频/电商套图/故事导演/无限画布/作品/账户/设置 全板块页面真实点击验证，不能后端跑通就算过。

环境：dev server :8090，7 key 经 /settings 录入（Grok/Fal/Civitai/NanoGPT/HF/ModelScope×2），mihomo 代理，Playwright chromium headless 单开。

## 生成板块（真实点击 + 真实产出 + 截图）

| 板块 | 页面 | 操作 | 结果 | 证据 |
|---|---|---|---|---|
| 生图 | /image | 填词→点生成 | PASS | Grok xAI 真实出图（grok-image-verify.py，排除 /gallery/ 样片） |
| 改图 | /edit | 传 Civitai 参考图→点「开始编辑」 | PASS | xAI 编辑图 imgen.x.ai/xai-tmp-imgen-27144408…jpeg |
| 生视频 | /video | 新提示词（萤火虫稻田）→点生成 | PASS | fal kling-3-turbo t2v /works/2341e8cb…mp4（before 列表排除法确认新片） |
| 图生视频 | /i2v | 传首帧→点生成 | PASS | fal kling-3-turbo i2v /works/eb205408…mp4（ftypisom/avc1 验证）；尾帧框正确显示「当前模型不支持」= 能力分档生效 |
| 电商套图 | /ecommerce | 传商品图+描述→「生成整套 6」（Amazon 套图） | PASS | 6/6 张全出（正面/3-4/左侧/背面/细节/场景），进度 1/6→6/6 已完成，打包 ZIP 可用，ecom-final.png |
| 故事导演 | /story | 贴原创故事→「一键全流程」 | PASS | AI 分析成功（grok-4.6，无降级）：故事总结+2 角色（林岚/老人）+3 分镜（雨夜载客望海/灯塔雨中下车/后座泛黄照片，分镜 2、3 不丢）→ 3/3 出图 → grok-imagine-video 7s 视频 /works/839b4732…mp4（ftyp 验证），角色一致性良好，story-final.png |
| 无限画布 | /canvas | 新建画布→生成配置节点（弹窗自动开）→填词→「开始生成」 | PASS | 节点连线出图（雨后巷口实景），积分 200→199 真实扣减，canvas-4-final.png |

## 非生成板块

- 作品 /library：40 作品、24 个 /works/ 媒体元素、无空壳提示（library-final.png）
- 账户 /account、设置 /settings、首页：board-sweep 走查无报错、选择器已接线、无「暂无可选模型」

## 走查中发现并修复

1. 「一键全流程」busy 文案写死「5 张分镜」：选 3 镜时按钮仍显示 5 张 → 改为按 shotCount 动态（story-director-page.tsx:312）

## 走查中确认为非问题（设计如此）

1. 画布「组装提示词」弹窗：新建配置节点时自动打开（canvas-client-page.tsx setDialogNodeId(newNode.id)），点按钮是 toggle。E2E 初期误判「首次点击无效」实为把已开弹窗点关。
2. 故事导演 AI 分析阶段（grok-4.6，约 90-100s）页面长任务期间 Playwright 偶发 body 读取超时，容错等待后自动恢复，功能无影响。

## 回归

- npm test：918/918 pass
- npm run build：0 error
