import axios, {AxiosError, AxiosHeaders, type AxiosRequestConfig} from "axios";

import webConfig from "@/constants/common-env";
import {clearAuthSessionCache} from "@/lib/auth-session";
import {desktopApiHeaders, desktopApiUrl, isDesktopLoopbackUrl} from "@/services/desktop-api-url";
import {clearStoredAuthSession, getStoredAuthKey} from "@/store/auth";

type RequestConfig = AxiosRequestConfig & {
    redirectOnUnauthorized?: boolean;
};

type ErrorPayload = {
    detail?: string | { error?: string | { message?: string } } | ValidationErrorItem[];
    error?: string | { message?: string };
    message?: string;
};

type ValidationErrorItem = {
    type?: string;
    loc?: Array<string | number>;
    msg?: string;
    ctx?: {
        min_length?: number;
        max_length?: number;
        ge?: number;
        le?: number;
        [key: string]: unknown;
    };
};

const FIELD_LABELS: Record<string, string> = {
    username: "账号",
    password: "密码",
    old_password: "旧密码",
    new_password: "新密码",
    confirm_password: "确认密码",
    name: "昵称",
    email: "邮箱",
};

function fieldLabelFromLoc(loc: ValidationErrorItem["loc"]): string {
    const parts = loc?.map(String) || [];
    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index];
        if (part !== "body" && part !== "query" && part !== "path") {
            return FIELD_LABELS[part] || part;
        }
    }
    return "输入内容";
}

function validationMessageFromItem(item: ValidationErrorItem): string {
    const label = fieldLabelFromLoc(item.loc);
    const type = String(item.type || "");
    if (type === "missing") {
        return `请填写${label}`;
    }
    if (type === "string_too_short") {
        const minLength = item.ctx?.min_length;
        const unit = label.includes("密码") ? "位" : "个字符";
        return typeof minLength === "number" ? `${label}至少 ${minLength} ${unit}` : `${label}长度太短`;
    }
    if (type === "string_too_long") {
        const maxLength = item.ctx?.max_length;
        return typeof maxLength === "number" ? `${label}最多 ${maxLength} 个字符` : `${label}长度太长`;
    }
    if (type === "greater_than_equal") {
        const min = item.ctx?.ge;
        return typeof min === "number" ? `${label}不能小于 ${min}` : `${label}数值太小`;
    }
    if (type === "less_than_equal") {
        const max = item.ctx?.le;
        return typeof max === "number" ? `${label}不能大于 ${max}` : `${label}数值太大`;
    }
    if (type.startsWith("string_")) {
        return `${label}格式不正确`;
    }
    return item.msg ? `${label}不符合要求` : "";
}

function errorMessageFromValue(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        return value
            .map((item) => (item && typeof item === "object" ? validationMessageFromItem(item as ValidationErrorItem) : ""))
            .find(Boolean) || "";
    }
    if (!value || typeof value !== "object") {
        return "";
    }

    const item = value as { error?: unknown; message?: unknown };
    if (typeof item.message === "string") {
        return item.message;
    }
    return errorMessageFromValue(item.error);
}

export const request = axios.create({
    baseURL: webConfig.apiUrl.replace(/\/$/, ""),
});

request.interceptors.request.use(async (config) => {
    const nextConfig = {...config};
    const authKey = await getStoredAuthKey();
    const headers = AxiosHeaders.from(nextConfig.headers);
    if (authKey && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${authKey}`);
    }
    if (typeof nextConfig.url === "string" && isDesktopLoopbackUrl(nextConfig.url)) {
        const authenticatedHeaders = await desktopApiHeaders();
        authenticatedHeaders.forEach((value, key) => headers.set(key, value));
    }
    nextConfig.headers = headers;
    return nextConfig;
});

request.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ErrorPayload>) => {
        const status = error.response?.status;
        if (!error.response) {
            return Promise.reject(new Error("连接后端失败，请确认服务已启动或稍后重试"));
        }
        const shouldRedirect = (error.config as RequestConfig | undefined)?.redirectOnUnauthorized !== false;
        if (status === 401 && shouldRedirect && typeof window !== "undefined") {
            // Avoid redirect loop — only redirect if not already on /login
            if (!window.location.pathname.startsWith("/login")) {
                await clearStoredAuthSession();
                clearAuthSessionCache();
                window.location.replace("/login");
                // Return a never-resolving promise to prevent further error handling
                // while the browser navigates away
                return new Promise(() => {});
            }
        }

        const payload = error.response?.data;
        const message =
            errorMessageFromValue(payload?.detail) ||
            errorMessageFromValue(payload?.error) ||
            payload?.message ||
            error.message ||
            `请求失败 (${status || 500})`;
        return Promise.reject(new Error(message));
    },
);

type RequestOptions = {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    redirectOnUnauthorized?: boolean;
};

export async function httpRequest<T>(path: string, options: RequestOptions = {}) {
    const {method = "GET", body, headers, redirectOnUnauthorized = true} = options;
    const config: RequestConfig = {
        url: desktopApiUrl(path),
        method,
        data: body,
        headers,
        redirectOnUnauthorized,
    };
    const response = await request.request<T>(config);
    return response.data;
}
