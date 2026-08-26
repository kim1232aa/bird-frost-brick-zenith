# 账户中心（对照 BananaPro）

参考：https://api.bananapro.site/zh/api-docs/account
认证：https://api.bananapro.site/zh/api-docs/authentication

## BananaPro 合约

```
GET /api/v1/account/balances
Authorization: Bearer sk-...
```

```json
{
  "success": true,
  "request_id": "req_xxx",
  "data": {
    "web_credits": 100,
    "api_credits": 500
  }
}
```

- 密钥一律 `sk-` 前缀
- 网关：`https://gateway.bananapro.site/api/v1/account/balances`
- 未授权：`{"success":false,"error":{"code":"unauthorized"}}`
- 双钱包：`web_credits`（网页生成）与 `api_credits`（API 调用）分开

## 本仓库落地

- 页面：`/account`
- 导航与顶栏积分入口指向账户页
- 字段对齐上述 JSON，数据来自本地 `ops` / `membership` 假账
- 接线密钥只在 `/settings` 编辑，账户页仅掩码展示
- 不要把 BananaPro 账户 API 当成生产后端来轮询
