# Boundless Studio 核心设计准则与架构全盘白皮书

> 宗旨：彻底废除一切伪造的 fail-closed 拦截与单机 localStorage 假全栈，严格忠于 Boundless 原版工作流、智能参数匹配与生产级云端架构。

## 一、废除历史毒文档与错误教条
1. **废除“无法验证时显式报错与 fail-closed”**：
   - 严禁以“未在本地静态合同验证”、“schema 未声明 images[]”为由将生成请求置为 `blocked` 并抛出红字报错；
   - 允许用户自由探索，遇到未声明字段平滑过滤或容错透传，绝不弹红报错打断创作。
2. **废除“无论选什么模型都强行塞 LoRA 和步数”的伪支持**：
   - 严格遵循真实能力智能匹配：支持的才显示，不支持的坚决隐藏；
   - 严禁对 Grok、Google、OpenAI 等闭源黑盒模型强行展示 LoRA 挂载区、步数 (Steps)、CFG、采样器 (Sampler) 等不支持的虚假控件；
   - 扩散模型（SDXL、Flux、Civitai、Krea）才展示完整的步数、CFG、官方采样器、调度器与 LoRA 挂载区，并自动带入推荐默认值。
3. **废除“双套参数竞争挂载与多余 Tab”**：
   - 页面标题与顶栏导航严格契合：在改图页面专注改图，不放置多余的“文生图/按图出图/改图”重复分段器；在生图页面保留文生图与图生图双模式；
   - 故事导演卡片由当前选中的模型能力驱动，彻底移除不可穿透的全局全屏遮罩。

## 二、全面开放与真实接通
1. **采样与模型参数全链路闭环**：
   - Steps、CFG Scale、Seed、Sampler、Scheduler、Denoise、Negative Prompt 在各 Provider（Civitai、Fal、NanoGPT、火山方舟等）适配器中完整打入请求载荷，真实出站；
   - 采样器 (Sampler) 与调度器 (Scheduler) 真实渲染并绑定模型官方推荐枚举。
2. **多模态与业务链路打通**：
   - Fal 视频通道在画布与 Studio 彻底双向接通，消除了未接线硬阻断；
   - 生视频支持首尾帧（FLF）双槽位拖入与智能切换；
   - 电商套图在存在参考图时明确透传 `operation: "edit"` 与 `imageUrls`，确保商品真实出图；
   - 故事导演支持至多 6 位出镜角色的批量设定与分镜引用。

## 三、中心化云端架构基础设施（真全栈生产架构）
1. **作品真落盘 (`/client-api/works`)**：
   - 出图成功后由服务端自动下载并持久化到宿主机目录 `/works/`，并写入数据库；
   - 彻底废除前端直接 `import("@/studio/server/works")` 的报错伪逻辑，全面改走 HTTP REST API；
   - 本地 404 失效记录提供一键清理，网络图片支持全自动代理重试。
2. **画布工程真云端 (`/client-api/canvas-projects`)**：
   - 画布数据通过 REST API 异步持久化到服务器 SQLite / 文件目录；
   - 换设备、换浏览器打开链接 100% 无缝还原，告别 localStorage 单机易失。
3. **安全配置保险库 (`/client-api/config-vault`)**：
   - 用户 API Keys 与中转配置安全加密持久化于服务端，实现多端自动 Hydrate 漫游。
4. **统一额度账本 (`/client-api/membership`)**：
   - 服务端真实原子扣点与记账流水，彻底终结 `MEMBERSHIP_IS_LOCAL_MOCK` 本地伪造状态。
