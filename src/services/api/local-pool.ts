import { httpRequest } from "@/lib/request";

export type LocalPoolClientKey = { key: string; enabled: boolean };

export type LocalPoolGatewayConfig = {
    enabled?: boolean;
    account_source?: string;
    client_keys?: LocalPoolClientKey[];
};

export async function fetchLocalPoolGatewayConfig() {
    // Use the backend's canonical route so the browser does not redirect and
    // drop the authenticated session header before reading the pool settings.
    const response = await httpRequest<{ config?: LocalPoolGatewayConfig }>("/api/gateway/config");
    return response.config || {};
}

export function activeLocalPoolKey(config: LocalPoolGatewayConfig) {
    return (config.client_keys || []).find((item) => item.enabled && String(item.key || "").trim())?.key.trim() || "";
}

export async function routedLocalPoolHeaders(contentType?: string) {
    const config = await fetchLocalPoolGatewayConfig();
    if (config.enabled === false) throw new Error("本地号池网关未启用，请先在网关设置中启用");
    if (config.account_source !== "pool") throw new Error("本地号池网关当前未使用账号池");
    const key = activeLocalPoolKey(config);
    if (!key) throw new Error("本地号池没有可用的客户端 Key，请先在网关设置中生成并启用 Key");
    return {
        Authorization: `Bearer ${key}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}
