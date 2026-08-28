"use client";

import { useMemo, useState } from "react";
import { App } from "antd";
import { ClipboardPaste, Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    applyParsedRelayTransfer,
    parseRelayTransferText,
    serializeRelayConfigEnvelope,
    serializeRelayKeyBundle,
    type ParsedRelayTransfer,
} from "@/lib/relay-config-transfer";
import { PRESET_RELAY_ENDPOINTS } from "@/stores/api-relay-presets";
import { flushConfigStore, useConfigStore } from "@/stores/use-config-store";

function presetNameForUrl(baseUrl: string) {
    const normalized = String(baseUrl || "").trim().replace(/\/+$/u, "");
    const preset = PRESET_RELAY_ENDPOINTS.find(
        (item) => String(item.baseUrl || "").trim().replace(/\/+$/u, "") === normalized,
    );
    return preset?.name || normalized || "未匹配端点";
}

async function copyText(value: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }
    throw new Error("当前环境不能写入剪贴板");
}

function downloadText(filename: string, value: string) {
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

export function RelayConfigTransferPanel() {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [parseError, setParseError] = useState("");

    const preview = useMemo(() => {
        const text = draft.trim();
        if (!text) return undefined;
        try {
            return { parsed: parseRelayTransferText(text), error: "" };
        } catch (error) {
            return { parsed: undefined, error: error instanceof Error ? error.message : "无法解析粘贴内容" };
        }
    }, [draft]);

    const applyImport = async () => {
        if (!preview?.parsed) {
            setParseError(preview?.error || "请先粘贴密钥包或配置 JSON");
            return;
        }
        setBusy(true);
        setParseError("");
        try {
            const applied = applyParsedRelayTransfer(config.apiRelays, preview.parsed, { enableOnImport: true });
            updateConfig("apiRelays", applied.relays);
            if (applied.apiRouting) updateConfig("apiRouting", applied.apiRouting);
            if (applied.apiBoardRouting) updateConfig("apiBoardRouting", applied.apiBoardRouting);
            if (applied.apiRelayAdvanced) {
                updateConfig("apiRelayAdvanced", { ...config.apiRelayAdvanced, ...applied.apiRelayAdvanced });
            }
            await flushConfigStore();
            const unmatched = applied.summary.unmatchedUrls.length
                ? `；未匹配 ${applied.summary.unmatchedUrls.length} 个地址`
                : "";
            message.success(
                `已写入本地：更新 ${applied.summary.providersUpdated} 个中转，新建 ${applied.summary.providersCreated} 个，加入 ${applied.summary.keysAdded} 把 Key${unmatched}`,
            );
            setDraft("");
            setOpen(false);
        } catch (error) {
            const detail = error instanceof Error && error.message.trim() ? error.message.trim() : "导入失败";
            setParseError(detail);
            message.error(detail);
        } finally {
            setBusy(false);
        }
    };

    const exportBundle = async () => {
        const text = serializeRelayKeyBundle(config.apiRelays);
        if (!text.trim()) {
            message.warning("当前没有可导出的 Key");
            return;
        }
        try {
            await copyText(text);
            message.success("密钥包已复制。内容含明文 Key，只保存在本机");
        } catch {
            downloadText("boundless-relay-keys.txt", text);
            message.success("已下载密钥包。内容含明文 Key，只保存在本机");
        }
    };

    const exportEnvelope = async () => {
        const text = serializeRelayConfigEnvelope({
            relays: config.apiRelays,
            apiRouting: config.apiRouting,
            apiBoardRouting: config.apiBoardRouting,
            apiRelayAdvanced: config.apiRelayAdvanced,
        });
        try {
            await copyText(text);
            message.success("完整配置已复制。内容含明文 Key，只保存在本机");
        } catch {
            downloadText("boundless-relay-config.json", text);
            message.success("已下载完整配置。内容含明文 Key，只保存在本机");
        }
    };

    return (
        <div className="rounded-2xl border border-stone-200 p-3 sm:p-4 dark:border-stone-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">导入 / 导出 Key 和配置</div>
                    <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                        粘贴「Base URL + sk-」文本包或本应用 JSON，按地址合并到预设并写入本地存储。仓库预设保持空 Key。导出含明文凭据，不要发到聊天或提交 Git。
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                    <Button type="button" variant="outline" className="h-9 flex-1 whitespace-nowrap rounded-xl sm:flex-none" onClick={() => setOpen(true)}>
                        <ClipboardPaste className="size-4" />
                        导入 Key / 配置
                    </Button>
                    <Button type="button" variant="outline" className="h-9 flex-1 whitespace-nowrap rounded-xl sm:flex-none" onClick={() => void exportBundle()}>
                        <Upload className="size-4" />
                        导出密钥包
                    </Button>
                    <Button type="button" variant="outline" className="h-9 flex-1 whitespace-nowrap rounded-xl sm:flex-none" onClick={() => void exportEnvelope()}>
                        <Download className="size-4" />
                        导出完整配置
                    </Button>
                </div>
            </div>
            {open ? (
                <ImportDialog
                    busy={busy}
                    draft={draft}
                    parseError={parseError || preview?.error || ""}
                    parsed={preview?.parsed}
                    onCancel={() => {
                        if (busy) return;
                        setOpen(false);
                        setParseError("");
                    }}
                    onChange={setDraft}
                    onApply={() => void applyImport()}
                />
            ) : null}
        </div>
    );
}

function ImportDialog({
    busy,
    draft,
    parseError,
    parsed,
    onCancel,
    onChange,
    onApply,
}: {
    busy: boolean;
    draft: string;
    parseError: string;
    parsed: ParsedRelayTransfer | undefined;
    onCancel: () => void;
    onChange: (value: string) => void;
    onApply: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-[1320] grid place-items-center bg-black/55 px-4"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) onCancel();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="relay-transfer-title"
                className="flex w-full max-w-2xl flex-col rounded-2xl border border-stone-200 bg-white p-5 text-stone-900 shadow-2xl dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100"
            >
                <div id="relay-transfer-title" className="text-base font-semibold">
                    导入 Key / 配置
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">
                    支持直接粘贴多行地址和 sk- Key，也支持本应用导出的 JSON。同一 Base URL 的 Key 会合并进已有中转；匹配到预设时会带上模型列表。
                </p>
                <label className="mt-4 grid gap-1.5">
                    <span className="text-xs font-medium text-stone-500 dark:text-stone-400">粘贴内容</span>
                    <textarea
                        className="min-h-44 w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2 font-mono text-xs leading-5 outline-none transition focus:border-stone-400 dark:border-stone-800 dark:bg-stone-950 dark:focus:border-stone-600"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={"https://token.sensenova.cn/v1\nsk-...\nhttps://apihub.agnes-ai.com/v1\nsk-..."}
                        value={draft}
                        onChange={(event) => onChange(event.target.value)}
                    />
                </label>
                {parsed ? <ParsedPreview parsed={parsed} /> : null}
                {parseError ? (
                    <div className="mt-3 text-sm leading-5 text-red-600 dark:text-red-400" role="alert">
                        {parseError}
                    </div>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                    <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={onCancel} disabled={busy}>
                        取消
                    </Button>
                    <Button type="button" className="h-9 rounded-xl" onClick={onApply} disabled={busy || !parsed}>
                        应用到本地
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ParsedPreview({ parsed }: { parsed: ParsedRelayTransfer }) {
    const formatLabel = parsed.format === "bundle" ? "文本密钥包" : parsed.format === "envelope" ? "本应用配置包" : "配置备份";
    return (
        <div className="mt-3 rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
            <div>已识别为{formatLabel}，共 {parsed.groups.length} 组。</div>
            <ul className="mt-1 space-y-0.5">
                {parsed.groups.map((group) => (
                    <li key={`${group.baseUrl}-${group.keys.length}`}>
                        {presetNameForUrl(group.baseUrl)}：{group.keys.length} 把 Key
                    </li>
                ))}
            </ul>
        </div>
    );
}
