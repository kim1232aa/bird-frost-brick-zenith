# 真功能 TODO — 不删入口，不造空壳

仓库：`kim1232aa/bird-frost-brick-zenith`
对照：用户本轮截图 + BananaPro 电商套图 / Seedance / GPT Image

## 原则
- 不删除已有板块、模型、供应商、按钮
- 不改用户选中的线路
- 文案必须和真实行为一致
- 生成必须前台点击

## 已落地
- [x] 积分 `record()` 改为真正 `ops.spend`，成功才扣
- [x] 默认模型不再硬偏 Grok，先读用户选择再读已接线
- [x] 「现在用的模型」可改，并写入 `boundless-studio:current-models`
- [x] 视频模板保留，并分成「电商运镜 / 电影运镜」
- [x] 设置页去掉抢焦点 useEffect：点哪个供应商就停在哪个
- [x] 生视频页去掉「本地演示 / 改用 Civitai LTX」改线路文案；参考样片按模型标注
- [x] 账户 balances JSON 面板保留，文案改成「本账号额度接口」
- [x] 电商套图默认不再写死 coffee mug / grok；按钮写真实扣点
- [x] 无限画布打开不再把「清凉写真」当默认项目

## 仍待（画布深层，入口全留）
- 标题栏/底部图片模型不得共用 open state
- 同名模型带 provider（Grok 中转 · grok-imagine-image）
- 一键全流程导演+角色+5镜+连线（点按钮才跑）
- Seedance2 视频路径不是 stub
- 双击图片详情要带缩略图和提示
- 故事导演下拉空了就用已接线模型名单
