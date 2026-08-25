"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, GitBranch, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { flushConfigStore } from "@/stores/use-config-store";
import {
    checkDesktopUpdate,
    emptyUpdateState,
    isDesktopUpdaterAvailable,
    loadDesktopUpdateSettings,
    openReleaseURL,
    setDesktopAutoCheck,
    startDesktopUpdate,
    subscribeDesktopUpdateState,
    type DesktopUpdateState,
    updateErrorMessage,
} from "@/services/desktop-updater";

const activePhases = new Set(["checking", "downloading", "preparing", "installing"]);

export function UpdateSettingsPanel() {
    const [state, setState] = useState<DesktopUpdateState>(emptyUpdateState);
    const [autoCheck, setAutoCheck] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actionError, setActionError] = useState("");
    const desktopAvailable = isDesktopUpdaterAvailable() && (loading || state.supported);
    const busy = activePhases.has(state.phase);
    const downloading = state.phase === "downloading" || state.phase === "preparing" || state.phase === "installing";

    useEffect(() => {
        let active = true;
        const unsubscribe = subscribeDesktopUpdateState((next) => {
            if (active) setState(next);
        });
        void loadDesktopUpdateSettings()
            .then((result) => {
                if (!active) return;
                setAutoCheck(result.autoCheckUpdates);
                setState(result.state);
            })
            .catch((error) => {
                if (active) setActionError(updateErrorMessage(error));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    const status = useMemo(() => statusPresentation(state), [state]);

    const toggleAutoCheck = async () => {
        const next = !autoCheck;
        setAutoCheck(next);
        setActionError("");
        try {
            await setDesktopAutoCheck(next);
        } catch (error) {
            setAutoCheck(!next);
            setActionError(updateErrorMessage(error));
        }
    };

    const checkNow = async () => {
        setActionError("");
        try {
            setState(await checkDesktopUpdate());
        } catch (error) {
            setActionError(updateErrorMessage(error));
        }
    };

    const install = async () => {
        setActionError("");
        try {
            await flushConfigStore();
            await startDesktopUpdate();
        } catch (error) {
            setActionError(updateErrorMessage(error));
        }
    };

    return (
        <div className="space-y-5" role="tabpanel">
            <div>
                <div className="text-base font-semibold">软件更新</div>
                <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Windows 客户端通过 GitHub Releases 校验并安装更新；其他平台请手动下载对应安装包。</div>
            </div>

            {!loading && !state.supported ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">当前平台不支持应用内安装更新，请使用下方 Releases 链接下载对应平台版本。</div> : null}

            <div className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="text-sm font-semibold">启动时自动检测更新</div>
                        <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">开启后，每次启动客户端都会检查最新 Release；只检测，不会自动下载或安装。</div>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={autoCheck}
                        disabled={!desktopAvailable || loading || downloading}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${autoCheck ? "bg-stone-900 dark:bg-white" : "bg-stone-300 dark:bg-stone-700"} disabled:cursor-not-allowed disabled:opacity-50`}
                        onClick={() => void toggleAutoCheck()}
                    >
                        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform dark:bg-stone-950 ${autoCheck ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${status.iconClass}`}>
                            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                        </div>
                        <div>
                            <div className="text-sm font-semibold">{status.title}</div>
                            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{state.message || status.description}</div>
                        </div>
                    </div>
                    <Button type="button" variant="outline" className="h-9 rounded-xl" disabled={!desktopAvailable || busy} onClick={() => void checkNow()}>
                        {state.phase === "checking" ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                        立即检查
                    </Button>
                </div>

                <div className="grid gap-3 rounded-xl bg-stone-50 p-3 text-xs dark:bg-stone-900 sm:grid-cols-2">
                    <InfoItem label="当前版本" value={`v${state.currentVersion || "1.1.0"}`} />
                    <InfoItem label="最新版本" value={state.latestVersion ? `v${state.latestVersion}` : "尚未获取"} />
                    <InfoItem label="更新仓库" value="xshentx/Boundless-Studio" />
                    <InfoItem label="最后检查" value={formatDate(state.checkedAt)} />
                </div>

                {downloading ? (
                    <div className="space-y-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-900" aria-live="polite">
                        <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-medium">{state.phase === "installing" ? "正在安装" : state.phase === "preparing" ? "正在准备安装" : "正在下载更新"}</span>
                            <span className="tabular-nums text-stone-500 dark:text-stone-400">{Math.round(state.progress)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-150" style={{ width: `${state.progress}%` }} />
                        </div>
                        <div className="flex flex-wrap justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                            <span>{state.assetName || "BoundlessStudio.exe"}</span>
                            <span>{formatDownloadProgress(state)}</span>
                        </div>
                    </div>
                ) : null}

                {state.error || actionError ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">{state.error || actionError}</div> : null}

                {state.available ? (
                    <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 dark:border-indigo-900/70 dark:bg-indigo-950/20">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold">{state.releaseName || `Boundless Studio ${state.latestVersion}`}</div>
                                <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                                    {state.assetName ? `${state.assetName} · ${formatBytes(state.assetSize)}` : "Release 中没有兼容的 Windows 客户端文件"}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {state.releaseUrl ? (
                                    <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => openReleaseURL(state.releaseUrl)}>
                                        <ExternalLink className="size-4" />
                                        查看 Release
                                    </Button>
                                ) : null}
                                <Button type="button" className="h-9 rounded-xl" disabled={!state.installable || busy} onClick={() => void install()}>
                                    <Download className="size-4" />
                                    下载并安装
                                </Button>
                            </div>
                        </div>
                        {state.releaseNotes ? <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-xs leading-5 text-stone-600 dark:bg-black/20 dark:text-stone-300">{state.releaseNotes}</div> : null}
                    </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 text-[11px] text-stone-500 dark:border-stone-800 dark:text-stone-400">
                    <span className="inline-flex items-center gap-1.5"><GitBranch className="size-3.5" />Release 标签使用 v1.2.0 格式</span>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-stone-900 dark:hover:text-white" onClick={() => openReleaseURL("https://github.com/xshentx/Boundless-Studio/releases")}>
                        打开 Releases <ExternalLink className="size-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-3 sm:block">
            <div className="text-stone-500 dark:text-stone-400">{label}</div>
            <div className="mt-0.5 truncate font-medium text-stone-800 dark:text-stone-200" title={value}>{value}</div>
        </div>
    );
}

function statusPresentation(state: DesktopUpdateState) {
    if (state.phase === "available") return { title: "发现可用更新", description: "可以下载并安装新版本", iconClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" };
    if (state.phase === "error") return { title: "更新检查失败", description: "请检查网络后重试", iconClass: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300" };
    if (activePhases.has(state.phase)) return { title: state.phase === "checking" ? "正在检查更新" : "正在处理更新", description: "请稍候", iconClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" };
    if (state.phase === "current") return { title: "当前已是最新版本", description: "无需更新", iconClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" };
    return { title: "检查软件更新", description: "从 GitHub Releases 获取最新版本", iconClass: "bg-stone-100 text-stone-600 dark:bg-stone-900 dark:text-stone-300" };
}

function formatBytes(value: number) {
    if (!value || value < 0) return "未知大小";
    const units = ["B", "KB", "MB", "GB"];
    let amount = value;
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
        amount /= 1024;
        unit += 1;
    }
    return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function formatDownloadProgress(state: DesktopUpdateState) {
    if (state.phase === "installing") return "即将重启客户端";
    if (!state.totalBytes) return formatBytes(state.downloadedBytes);
    return `${formatBytes(state.downloadedBytes)} / ${formatBytes(state.totalBytes)}`;
}

function formatDate(value: string) {
    if (!value) return "尚未检查";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN", { hour12: false });
}
