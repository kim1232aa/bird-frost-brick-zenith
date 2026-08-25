"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { App } from "antd";
import { LoaderCircle, PackagePlus, RefreshCw } from "lucide-react";

import { ModelSelectControl } from "@/components/model-picker";
import {
    beginProviderDiscovery,
    classifyProviderDiscoveryConnection,
    createProviderDiscoveryLoadingState,
    finishProviderDiscovery,
    isSameProviderDiscoveryConnection,
    safeProviderDiscoveryErrorMessage,
} from "@/components/provider-discovery-state";
import { WebdavSettingsPanel } from "@/components/webdav-settings-panel";
import { Button } from "@/components/ui/button";
import {
    AUDIO_CAPABILITY_PROFILES,
    AUDIO_CAPABILITY_PROFILE_IDS,
    audioCapabilityProfileCompatibility,
    normalizeAudioCapabilityProfiles,
    resolveAudioModelCapability,
    type AudioCapabilityProfileId,
} from "@/services/api/audio-model-capabilities";
import { refreshCivitaiGenerationCatalog } from "@/services/api/civitai-client";
import { isCivitaiAdapterType } from "@/services/api/civitai-orchestration";
import { civitaiCatalogModelLists, mergeCivitaiCatalogDiscovery } from "@/services/api/civitai-services";
import { fetchRelayProviderModels } from "@/services/api/image";
import {
    IMAGE_CAPABILITY_PROFILES,
    IMAGE_CAPABILITY_PROFILE_IDS,
    imageCapabilityProfileCompatibility,
    resolveImageModelCapability,
    type ImageCapabilityProfileId,
    type ImageOperation,
} from "@/services/api/image-model-capabilities";
import {
    fetchModelsDevMetadataForModels,
    summarizeModelsDevMetadata,
} from "@/services/api/models-dev-catalog";
import { mergeDiscoveredRelayModels, rotateRelayApiKey } from "@/services/api/relay-proxy";
import {
    isVideoCapabilityProfileId,
    normalizeVideoCapabilityProfiles,
    videoCapabilityProfileCompatibility,
} from "@/services/api/video-model-capabilities";
import { OPEN_API_SETTINGS_EVENT, type ApiSettingsTab } from "@/services/settings-dialog";
import {
    API_BOARD_ROUTE_DEFINITIONS,
    API_CAPABILITIES,
    API_CAPABILITY_LABELS,
    createApiRelayProvider,
    classifyProviderModels,
    defaultApiRelayAdvanced,
    imageCapabilityProfileOverrideForOperation,
    normalizeApiKeyInput,
    normalizeModelList,
    providerDisplayName,
    reconcileApiRelayModelAssignments,
    resolveBoardRouteSelection,
    setImageCapabilityProfileOverride,
    modelBelongsToProvider,
    providerModelsForCapability,
    providersForCapability,
    type ApiBoardModelRoute,
    type ApiBoardRouteKey,
    type ApiCapability,
    type ApiCapabilityRoute,
    type ApiRelayProvider,
} from "@/stores/api-relay-config";
import { hasProviderCredential, parseProviderKeyText, providerCredentialPool, reconcileProviderCredentialPool } from "@/stores/provider-credentials";
import { PRESET_RELAY_ENDPOINTS } from "@/stores/api-relay-presets";
import { flushConfigStore, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { STUDIO_PROVIDERS, STUDIO_ROUTES } from "@/studio/wiring";
import { getStudioAdapter } from "@/studio/registry";

export async function persistApiSettingsBeforeClose(
    flush: () => Promise<void>,
    close: () => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        await flush();
        close();
        return { ok: true };
    } catch (error) {
        const detail = error instanceof Error && error.message.trim() ? `：${error.message.trim()}` : "";
        return {
            ok: false,
            error: `设置保存失败，本地数据库未确认写入。弹窗已保持打开，请重试${detail}`,
        };
    }
}

export function ApiAccessSettingsDialog() {
    const { message } = App.useApp();
    const open = useConfigStore((state) => state.isConfigOpen);
    const setOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [loadingProviderIds, setLoadingProviderIds] = useState(createProviderDiscoveryLoadingState);
    const [settingsTab, setSettingsTab] = useState<ApiSettingsTab>("relay");
    const [pendingDeleteRelayId, setPendingDeleteRelayId] = useState("");
    const [configSaveError, setConfigSaveError] = useState("");
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    const requestedSettingsTabRef = useRef<ApiSettingsTab | null>(null);
    const closeInFlightRef = useRef(false);
    const providerDiscoveryLoadingRef = useRef(createProviderDiscoveryLoadingState());
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const openRequestedSettings = (event: Event) => {
            const requestedTab = event instanceof CustomEvent ? event.detail : null;
            const nextTab: ApiSettingsTab = requestedTab === "routing" || requestedTab === "sync" ? requestedTab : "relay";
            requestedSettingsTabRef.current = nextTab;
            setSettingsTab(nextTab);
            setOpen(true);
        };
        window.addEventListener(OPEN_API_SETTINGS_EVENT, openRequestedSettings);
        return () => window.removeEventListener(OPEN_API_SETTINGS_EVENT, openRequestedSettings);
    }, [setOpen]);

    useEffect(() => {
        if (!open) return;
        setConfigSaveError("");
        if (requestedSettingsTabRef.current) {
            setSettingsTab(requestedSettingsTabRef.current);
            requestedSettingsTabRef.current = null;
            return;
        }
        setSettingsTab("relay");
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const appRoot = document.getElementById("root");
        const rootWasInert = appRoot?.inert ?? false;
        window.getSelection()?.removeAllRanges();
        if (appRoot) appRoot.inert = true;

        return () => {
            if (appRoot) appRoot.inert = rootWasInert;
        };
    }, [open]);

    const close = async () => {
        if (closeInFlightRef.current) return;
        closeInFlightRef.current = true;
        setIsSavingConfig(true);
        setConfigSaveError("");
        try {
            const result = await persistApiSettingsBeforeClose(flushConfigStore, () => {
                setPendingDeleteRelayId("");
                setOpen(false);
                clearPromptContinue();
            });
            if (!result.ok) {
                setConfigSaveError(result.error);
                message.error(result.error);
            }
        } finally {
            setIsSavingConfig(false);
            closeInFlightRef.current = false;
        }
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") void close();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    const updateRelays = (relays: ApiRelayProvider[]) => updateConfig("apiRelays", relays);

    const updateRelay = (id: string, patch: Partial<ApiRelayProvider>) => {
        const nextRelays = config.apiRelays.map((provider) =>
            provider.id === id
                ? {
                      ...provider,
                      ...patch,
                      updatedAt: new Date().toISOString(),
                  }
                : provider,
        );
        updateRelays(nextRelays);
    };

    const applyDiscoveryPatch = (requestedProvider: ApiRelayProvider, patch: RelayDiscoveryPatch) => {
        // Discovery is asynchronous, so the provider captured when the button
        // was pressed is not authoritative once a response arrives. Read the
        // store directly to avoid replacing edits made while /models (or the
        // Civitai directory) was in flight.
        const currentConfig = useConfigStore.getState().config;
        const currentProvider = currentConfig.apiRelays.find((item) => item.id === requestedProvider.id);
        if (!currentProvider) {
            message.warning("模型发现结果已丢弃：中转已被删除");
            return false;
        }
        if (!isSameProviderDiscoveryConnection(requestedProvider, currentProvider)) {
            message.warning("模型发现结果已丢弃：连接信息已修改，请重新读取");
            return false;
        }
        useConfigStore.getState().updateConfig(
            "apiRelays",
            currentConfig.apiRelays.map((item) =>
                item.id === currentProvider.id
                    ? { ...item, ...patch, updatedAt: new Date().toISOString() }
                    : item,
            ),
        );
        return true;
    };

    const addRelay = () => {
        const provider = createApiRelayProvider({
            name: `中转 API ${config.apiRelays.length + 1}`,
            capabilities: ["text", "image", "video"],
            enabled: false,
        });
        updateRelays([...config.apiRelays, provider]);
    };

    const addPresetRelays = () => {
        const existingIds = new Set(config.apiRelays.map((provider) => provider.id));
        const missingPresets = PRESET_RELAY_ENDPOINTS.filter(
            (preset): preset is typeof preset & { id: string } => {
                if (typeof preset.id !== "string" || !preset.id) return false;
                return !existingIds.has(preset.id);
            },
        );
        if (!missingPresets.length) {
            message.info("所有预设端点都已存在，没有修改当前中转设置");
            return;
        }
        updateRelays([
            ...config.apiRelays,
            ...missingPresets.map((preset) => createApiRelayProvider({ ...preset, id: preset.id })),
        ]);
        message.success(`已添加 ${missingPresets.length} 个缺少的预设端点`);
    };

    const deleteRelay = (id: string) => {
        updateRelays(config.apiRelays.filter((provider) => provider.id !== id));
        const nextRouting = { ...config.apiRouting };
        for (const capability of API_CAPABILITIES) {
            if (nextRouting[capability].providerId === id) nextRouting[capability] = { source: "relay", providerId: "", model: "" };
        }
        updateConfig("apiRouting", nextRouting);
        const nextBoardRouting = { ...config.apiBoardRouting };
        for (const definition of API_BOARD_ROUTE_DEFINITIONS) {
            if (nextBoardRouting[definition.key].providerId === id) nextBoardRouting[definition.key] = { mode: "inherit", providerId: "", model: "" };
        }
        updateConfig("apiBoardRouting", nextBoardRouting);
    };

    const updateCapabilityRoute = (capability: ApiCapability, patch: Partial<ApiCapabilityRoute>) => {
        const current = config.apiRouting[capability];
        const providerId = patch.providerId ?? current.providerId;
        const provider = config.apiRelays.find((item) => item.id === providerId);
        const model = patch.providerId !== undefined
            ? (provider && modelBelongsToProvider(provider, capability, current.model) ? current.model : "")
            : patch.model ?? current.model;

        updateConfig("apiRouting", {
            ...config.apiRouting,
            [capability]: { source: "relay", providerId, model },
        });
        if (model) updateConfig(`${capability}Model`, model);
    };

    const updateBoardRoute = (key: ApiBoardRouteKey, patch: Partial<ApiBoardModelRoute>) => {
        const definition = API_BOARD_ROUTE_DEFINITIONS.find((item) => item.key === key);
        if (!definition) return;
        const current = config.apiBoardRouting[key];
        const mode = patch.mode ?? current.mode;
        let providerId = patch.providerId ?? current.providerId;
        let model = patch.model ?? current.model;

        const selection = resolveBoardRouteSelection(
            mode,
            providerId,
            model,
            config.apiRelays,
            definition.capability,
            patch.providerId !== undefined,
        );
        providerId = selection.providerId;
        model = selection.model;

        updateConfig("apiBoardRouting", {
            ...config.apiBoardRouting,
            [key]: { mode, providerId, model },
        });
    };

    const pullModels = async (requestedProvider: ApiRelayProvider) => {
        // A click immediately after editing credentials fires after blur, but
        // the provider prop captured by this render can still contain the old
        // key/proxy. Read the synchronous store snapshot before dispatch.
        const provider = useConfigStore.getState().config.apiRelays.find((item) => item.id === requestedProvider.id);
        if (!provider) {
            message.warning("模型读取已取消：中转已被删除");
            return;
        }
        const civitai = isCivitaiAdapterType(provider.adapterType);
        if (!provider.baseUrl.trim() || (!civitai && !hasProviderCredential(provider))) {
            message.warning(`请先填写 Base URL${civitai ? "" : " 和 API Key"}`);
            return;
        }
        const started = beginProviderDiscovery(providerDiscoveryLoadingRef.current, provider.id);
        if (!started.started) return;
        providerDiscoveryLoadingRef.current = started.loading;
        setLoadingProviderIds(started.loading);
        try {
            const discoveryApiKey = rotateRelayApiKey(provider);
            if (civitai) {
                const catalog = await refreshCivitaiGenerationCatalog(discoveryApiKey, {
                    providerId: provider.id,
                    baseUrl: provider.baseUrl,
                    proxyMode: provider.proxyMode,
                    proxyUrl: provider.proxyUrl,
                });
                const services = catalog.services;
                const { models, imageModels, videoModels } = civitaiCatalogModelLists(catalog);
                const currentProvider = useConfigStore.getState().config.apiRelays.find((item) => item.id === provider.id);
                if (!currentProvider) {
                    message.warning("模型发现结果已丢弃：中转已被删除");
                    return;
                }
                if (!isSameProviderDiscoveryConnection(provider, currentProvider)) {
                    message.warning("模型发现结果已丢弃：连接信息已修改，请重新读取");
                    return;
                }
                const mergedCatalogDiscovery = catalog.source === "live"
                    ? mergeCivitaiCatalogDiscovery(currentProvider, { models, imageModels, videoModels }, "live")
                    : mergeCivitaiCatalogDiscovery(currentProvider, { models, imageModels, videoModels });
                if (!applyDiscoveryPatch(provider, mergedCatalogDiscovery)) return;
                if (catalog.source === "live") {
                    message.success(`已实时读取 ${services.length} 个 Civitai 图片/视频服务（含 available / degraded / unknown）`);
                } else {
                    message.warning(`Civitai 实时目录连接失败，已载入内置 ${services.length} 项图片/视频服务目录`);
                }
                return;
            }
            const discoveredModels = await fetchRelayProviderModels(provider, discoveryApiKey);
            let catalogMetadata = {};
            let catalogUnavailable = false;
            try {
                // Public metadata lookup is intentionally unauthenticated. It is
                // only a classification hint for IDs already returned by /models.
                catalogMetadata = await fetchModelsDevMetadataForModels(discoveredModels);
            } catch {
                catalogUnavailable = true;
            }
            const currentProvider = useConfigStore.getState().config.apiRelays.find((item) => item.id === provider.id);
            if (!currentProvider) {
                message.warning("模型发现结果已丢弃：中转已被删除");
                return;
            }
            if (!isSameProviderDiscoveryConnection(provider, currentProvider)) {
                message.warning("模型发现结果已丢弃：连接信息已修改，请重新读取");
                return;
            }
            const modelConfiguration = mergeDiscoveredRelayModels(currentProvider, discoveredModels, catalogMetadata);
            if (!applyDiscoveryPatch(provider, modelConfiguration)) return;
            const summary = summarizeModelsDevMetadata(discoveredModels, modelConfiguration.modelCatalogMetadata);
            const summaryText = `已读取 ${discoveredModels.length} 个模型；已保留原有模型和分类；models.dev 分类提示：已匹配 ${summary.matched}，未验证 ${summary.unverified}`;
            if (catalogUnavailable) message.warning(`${summaryText}（元数据暂不可用，已保留 /models 结果）`);
            else message.success(summaryText);
        } catch (error) {
            const currentProvider = useConfigStore.getState().config.apiRelays.find((item) => item.id === provider.id);
            const failureConnection = classifyProviderDiscoveryConnection(provider, currentProvider);
            if (failureConnection === "missing") {
                message.warning("模型读取失败结果已丢弃：中转已被删除");
            } else if (failureConnection === "changed") {
                message.warning("模型读取失败结果已丢弃：连接信息已修改，请重新读取");
            } else {
                message.error(safeProviderDiscoveryErrorMessage(error));
            }
        } finally {
            const finished = finishProviderDiscovery(providerDiscoveryLoadingRef.current, provider.id);
            providerDiscoveryLoadingRef.current = finished;
            setLoadingProviderIds(finished);
        }
    };

    if (!mounted || !open) return null;

    const pendingDeleteRelay = config.apiRelays.find((provider) => provider.id === pendingDeleteRelayId);

    return createPortal(
        <div
            className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/45 px-2 py-3 sm:px-4 sm:py-6"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) void close();
            }}
        >
            <div className="relative flex h-[min(760px,calc(100vh-1.5rem))] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white p-3 shadow-[0_24px_80px_-20px_rgba(15,23,42,0.28),0_8px_24px_-12px_rgba(15,23,42,0.12)] sm:h-[min(760px,calc(100vh-3rem))] sm:rounded-[28px] sm:p-6 dark:border-stone-800 dark:bg-stone-950">
                <button type="button" className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-stone-500 transition hover:bg-black/5 hover:text-stone-900 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-white" onClick={() => void close()} aria-label="关闭" disabled={isSavingConfig}>
                    <span className="text-lg leading-none">×</span>
                </button>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col text-stone-900 dark:text-stone-100">
                    <div className="grid w-[calc(100%-2.5rem)] shrink-0 grid-cols-2 gap-1 self-start rounded-xl bg-stone-100 p-1 sm:inline-flex sm:w-auto sm:gap-0 dark:bg-stone-900" role="tablist" aria-label="API 设置">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={settingsTab === "relay"}
                            className={`whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition sm:px-4 ${settingsTab === "relay" ? "bg-white text-stone-950 shadow-sm dark:bg-stone-800 dark:text-white" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"}`}
                            onClick={() => setSettingsTab("relay")}
                        >
                            中转设置
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={settingsTab === "routing"}
                            className={`whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition sm:px-4 ${settingsTab === "routing" ? "bg-white text-stone-950 shadow-sm dark:bg-stone-800 dark:text-white" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"}`}
                            onClick={() => setSettingsTab("routing")}
                        >
                            模型路由设置
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={settingsTab === "sync"}
                            className={`whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition sm:px-4 ${settingsTab === "sync" ? "bg-white text-stone-950 shadow-sm dark:bg-stone-800 dark:text-white" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"}`}
                            onClick={() => setSettingsTab("sync")}
                        >
                            WebDAV 同步
                        </button>
                    </div>

                    <div className="mt-3 min-h-0 min-w-0 flex-1 overflow-y-auto pr-1 sm:mt-5">
                        {settingsTab === "relay" ? (
                            <div className="space-y-5" role="tabpanel">
                                <div>
                                    <div className="text-base font-semibold">中转设置</div>
                                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">配置中转地址和每个中转可用的<span className="whitespace-nowrap">模型列表</span>。</div>
                                </div>
                                <div className="grid gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-3 sm:grid-cols-3">
                                    {(["text", "image", "video"] as const).map((capability) => {
                                        const route = STUDIO_ROUTES[capability];
                                        const provider = STUDIO_PROVIDERS.find((item) => item.id === route.providerId);
                                        return (
                                            <div key={capability} className="min-w-0">
                                                <div className="text-[11px] uppercase tracking-wider text-stone-500">{capability}</div>
                                                <div className="truncate font-mono text-xs">{route.model || "未接线"}</div>
                                                <div className="truncate text-[11px] text-stone-500">{provider ? getStudioAdapter(provider.adapter).label : ""}</div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="min-w-0 rounded-2xl border border-stone-200 p-2 sm:p-4 dark:border-stone-800">
                                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold">中转地址</div>
                                            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">可以添加多个中转，每个中转保存自己的 Base URL / API Key / <span className="whitespace-nowrap">模型列表</span>。</div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 sm:shrink-0">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-9 flex-1 whitespace-nowrap rounded-xl sm:flex-none"
                                                onClick={addPresetRelays}
                                            >
                                                <PackagePlus className="size-4" />
                                                添加缺少的预设端点
                                            </Button>
                                            <Button type="button" variant="outline" className="h-9 flex-1 whitespace-nowrap rounded-xl sm:flex-none" onClick={addRelay}>
                                                添加中转
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {config.apiRelays.length ? (
                                                config.apiRelays.map((provider) => (
                                                <RelayProviderCard key={provider.id} provider={provider} displayName={providerDisplayName(provider, config.apiRelays)} loading={loadingProviderIds.has(provider.id)} onChange={(patch) => updateRelay(provider.id, patch)} onDelete={() => setPendingDeleteRelayId(provider.id)} onPullModels={() => void pullModels(provider)} />
                                            ))
                                        ) : (
                                            <div className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">还没有中转地址，点击“添加中转”开始配置。</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : settingsTab === "routing" ? (
                            <div className="space-y-5" role="tabpanel">
                                <div>
                                    <div className="text-base font-semibold">模型路由设置</div>
                                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">按模型类型配置默认路由、板块模型路由和高级选项。</div>
                                </div>

                                <div className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                                    <div className="mb-3">
                                        <div className="text-sm font-semibold">模型路由</div>
                                        <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">文本、图片、视频、音频分别选择默认中转和模型。</div>
                                    </div>
                                    <div className="grid gap-3">
                                        {API_CAPABILITIES.map((capability) => (
                                            <RouteRow key={capability} capability={capability} config={config} onRouteChange={updateCapabilityRoute} />
                                        ))}
                                    </div>
                                </div>

                                <details className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                                    <summary className="cursor-pointer select-none text-sm font-semibold">
                                        板块模型路由（可选）
                                        <span className="ml-2 text-xs font-normal text-stone-500 dark:text-stone-400">默认继承上面的文本/图片/视频路由</span>
                                    </summary>
                                    <div className="mt-3 grid gap-3">
                                        {API_BOARD_ROUTE_DEFINITIONS.map((definition) => (
                                            <BoardRouteRow key={definition.key} definition={definition} config={config} onRouteChange={updateBoardRoute} />
                                        ))}
                                    </div>
                                </details>

                                <details className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
                                    <summary className="cursor-pointer select-none text-sm font-semibold">高级</summary>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <label className="flex items-center gap-2 text-sm">
                                            <input type="checkbox" checked={config.apiRelayAdvanced.showDisabledProviders} onChange={(event) => updateConfig("apiRelayAdvanced", { ...config.apiRelayAdvanced, showDisabledProviders: event.target.checked })} />
                                            路由下拉显示停用中转
                                        </label>
                                    </div>
                                    <div className="mt-3 grid gap-1.5">
                                        <span className="text-xs font-medium text-stone-500 dark:text-stone-400">默认超时毫秒</span>
                                        <input className={inputClass} value={String(config.apiRelayAdvanced.defaultTimeoutMs)} onChange={(event) => updateConfig("apiRelayAdvanced", { ...config.apiRelayAdvanced, defaultTimeoutMs: Number(event.target.value) || 360_000 })} />
                                    </div>
                                </details>
                            </div>
                        ) : (
                            <WebdavSettingsPanel />
                        )}
                    </div>
                    <div className="mt-5 flex min-w-0 shrink-0 items-center justify-end gap-3">
                        {configSaveError ? (
                            <div className="min-w-0 flex-1 text-sm leading-5 text-red-600 dark:text-red-400" role="alert">
                                {configSaveError}
                            </div>
                        ) : null}
                        <Button type="button" className="h-10 shrink-0 rounded-xl px-5" onClick={() => void close()} disabled={isSavingConfig}>
                            {isSavingConfig ? <LoaderCircle className="size-4 animate-spin" /> : null}
                            {isSavingConfig ? "正在保存" : "完成"}
                        </Button>
                    </div>
                </div>
            </div>
            {pendingDeleteRelay ? (
                <div
                    className="fixed inset-0 z-[1310] grid place-items-center bg-black/55 px-4"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setPendingDeleteRelayId("");
                    }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-relay-title"
                        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 text-stone-900 shadow-2xl dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100"
                    >
                        <div id="delete-relay-title" className="text-base font-semibold">删除中转“{pendingDeleteRelay.name}”？</div>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">
                            将移除这个中转保存的地址、凭据引用、模型与能力配置；所有指向它的默认路由和板块路由会同时重置。其它中转不会被修改。
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => setPendingDeleteRelayId("")}>取消</Button>
                            <Button
                                type="button"
                                className="h-9 rounded-xl bg-red-600 text-white hover:bg-red-700"
                                onClick={() => {
                                    deleteRelay(pendingDeleteRelay.id);
                                    setPendingDeleteRelayId("");
                                }}
                            >
                                删除并重置相关路由
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>,
        document.body,
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="grid min-w-0 gap-1.5">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{label}</span>
            {children}
        </label>
    );
}

type RelayDiscoveryPatch = Pick<
    ApiRelayProvider,
    "models" | "textModels" | "imageModels" | "videoModels" | "audioModels" | "capabilities" | "modelCatalogMetadata"
>;

function BoardRouteRow({
    definition,
    config,
    onRouteChange,
}: {
    definition: (typeof API_BOARD_ROUTE_DEFINITIONS)[number];
    config: AiConfig;
    onRouteChange: (key: ApiBoardRouteKey, patch: Partial<ApiBoardModelRoute>) => void;
}) {
    const route = config.apiBoardRouting[definition.key];
    const providers = providersForCapability(config.apiRelays, definition.capability, config.apiRelayAdvanced.showDisabledProviders);
    const provider = providers.find((item) => item.id === route.providerId) || config.apiRelays.find((item) => item.id === route.providerId);
    const models = provider ? providerModelsForCapability(provider, definition.capability) : [];
    const isCustom = route.mode === "custom";
    const capabilityLabel = API_CAPABILITY_LABELS[definition.capability];

    return (
        <div className="grid gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-900 sm:grid-cols-[120px_74px_118px_1fr_1fr] sm:items-center">
            <div>
                <div className="text-sm font-semibold">{definition.label}</div>
                <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">{definition.key}</div>
            </div>
            <div className="inline-flex h-8 items-center justify-center rounded-lg bg-white px-2 text-xs text-stone-600 dark:bg-stone-950 dark:text-stone-300">{capabilityLabel}</div>
            <select className={inputClass} value={route.mode} onChange={(event) => onRouteChange(definition.key, { mode: event.target.value === "custom" ? "custom" : "inherit" })}>
                <option value="inherit">继承全局</option>
                <option value="custom">单独指定</option>
            </select>
            <select className={inputClass} value={route.providerId} disabled={!isCustom} onChange={(event) => onRouteChange(definition.key, { providerId: event.target.value })}>
                <option value="">{isCustom ? "选择中转" : `继承${capabilityLabel}路由`}</option>
                {providers.map((item) => (
                    <option key={item.id} value={item.id}>
                        {providerDisplayName(item, config.apiRelays)}
                        {item.enabled ? "" : "（停用）"}
                    </option>
                ))}
            </select>
            <ModelSelectControl
                models={models}
                value={isCustom ? route.model : ""}
                disabled={!isCustom || !provider}
                placeholder={!isCustom ? "继承全局模型" : provider ? `选择${capabilityLabel}模型` : `请先选择${capabilityLabel}中转`}
                emptyLabel={`暂无已配置${capabilityLabel}模型`}
                triggerClassName={inputClass}
                contentClassName="z-[1400] w-[min(360px,calc(100vw-24px))]"
                onChange={(model) => onRouteChange(definition.key, { model })}
            />
        </div>
    );
}

function RouteRow({ capability, config, onRouteChange }: { capability: ApiCapability; config: AiConfig; onRouteChange: (capability: ApiCapability, patch: Partial<ApiCapabilityRoute>) => void }) {
    const providers = providersForCapability(config.apiRelays, capability, config.apiRelayAdvanced.showDisabledProviders);
    const route = config.apiRouting[capability];
    const provider = route.providerId ? providers.find((item) => item.id === route.providerId) || config.apiRelays.find((item) => item.id === route.providerId) : undefined;
    const models = provider ? providerModelsForCapability(provider, capability) : [];

    return (
        <div className="grid gap-2 rounded-xl bg-stone-50 p-3 dark:bg-stone-900 sm:grid-cols-[80px_1fr_1fr] sm:items-center">
            <div className="text-sm font-semibold">{API_CAPABILITY_LABELS[capability]}</div>
            <select className={inputClass} value={route.providerId} onChange={(event) => onRouteChange(capability, { source: "relay", providerId: event.target.value })}>
                <option value="">选择中转 API</option>
                {providers.map((item) => (
                    <option key={item.id} value={item.id}>
                        {providerDisplayName(item, config.apiRelays)}
                        {item.enabled ? "" : "（停用）"}
                    </option>
                ))}
            </select>
            <ModelSelectControl
                models={models}
                value={route.model}
                disabled={!provider}
                placeholder={provider ? `选择${API_CAPABILITY_LABELS[capability]}模型` : "请先选择中转 API"}
                emptyLabel={`暂无已配置${API_CAPABILITY_LABELS[capability]}模型`}
                triggerClassName={inputClass}
                contentClassName="z-[1400] w-[min(360px,calc(100vw-24px))]"
                onChange={(model) => onRouteChange(capability, { model })}
            />
        </div>
    );
}

/**
 * 模型清单编辑框。
 *
 * 每行一个模型，编辑期间保留用户输入的原始文本（含空行和尾随换行），
 * 只在失焦时才归一化并提交。如果在 onChange 里直接归一化，用户敲下的
 * 换行会立刻被折叠掉，光标也会跳走，导致无法正常换行输入或清空内容。
 */
function ModelListTextarea({ value, className, placeholder, onCommit }: { value: string[]; className: string; placeholder?: string; onCommit: (models: string[]) => void }) {
    const committedText = value.join("\n");
    const [draft, setDraft] = useState<string | null>(null);

    return (
        <textarea
            className={className}
            placeholder={placeholder}
            value={draft ?? committedText}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
                if (draft === null) return;
                const next = normalizeModels(draft);
                setDraft(null);
                if (next.join("\n") !== committedText) onCommit(next);
            }}
        />
    );
}

function ModelCapabilityCheckboxes({ provider, onChange }: { provider: ApiRelayProvider; onChange: (patch: Partial<ApiRelayProvider>) => void }) {
    const updateModelCapability = (model: string, capability: ApiCapability, checked: boolean) => {
        const current = providerModelsForCapability(provider, capability);
        const next = checked
            ? normalizeModelList([...current, model])
            : current.filter((candidate) => candidate !== model);
        onChange(classifyProviderModels(provider, capability, next));
    };

    return (
        <div className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-950">
            <div>
                <div className="text-sm font-medium">模型能力（可多选）</div>
                <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">勾选后该模型才会出现在对应路由中；同一模型可以同时用于文本、图片、视频和音频。</div>
            </div>
            {provider.models.length ? provider.models.map((model) => (
                <div key={model} className="grid gap-2 border-t border-stone-100 pt-2 first:border-t-0 first:pt-0 dark:border-stone-800 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <code className="min-w-0 break-all text-xs text-stone-700 dark:text-stone-300">{model}</code>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
                        {API_CAPABILITIES.map((capability) => (
                            <label key={capability} className="flex items-center gap-1.5">
                                <input
                                    type="checkbox"
                                    checked={providerModelsForCapability(provider, capability).includes(model)}
                                    onChange={(event) => updateModelCapability(model, capability, event.target.checked)}
                                />
                                {API_CAPABILITY_LABELS[capability]}
                            </label>
                        ))}
                    </div>
                </div>
            )) : <div className="text-xs text-stone-500 dark:text-stone-400">暂无模型。可先手动填写模型列表，或从 /models 读取后再确认能力。</div>}
        </div>
    );
}

function RelayProviderCard({ provider, displayName, loading, onChange, onDelete, onPullModels }: { provider: ApiRelayProvider; displayName: string; loading: boolean; onChange: (patch: Partial<ApiRelayProvider>) => void; onDelete: () => void; onPullModels: () => void }) {
    const credentialPool = providerCredentialPool(provider);
    const catalogSummary = summarizeModelsDevMetadata(provider.models, provider.modelCatalogMetadata);
    const updateModels = (models: string[]) => {
        onChange(
            // 主列表只记录可见的 /models ID；未验证 ID 维持未分类，必须由用户
            // 在下面独立的能力列表中明确勾选，才会成为可路由模型。
            reconcileApiRelayModelAssignments(
                models,
                {
                    textModels: provider.textModels,
                    imageModels: provider.imageModels,
                    videoModels: provider.videoModels,
                    audioModels: provider.audioModels,
                },
                { inferUnassigned: false },
            ),
        );
    };
    return (
        <div className="min-w-0 space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-2 sm:p-3 dark:border-stone-800 dark:bg-stone-900/60">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between">
                <div className="col-span-2 min-w-0 sm:col-span-1 sm:flex-1">
                    <input className={inputClass} value={provider.name} onChange={(event) => onChange({ name: event.target.value })} />
                    {displayName !== (provider.name.trim() || provider.id) ? (
                        <div className="mt-1 truncate text-[11px] text-stone-500 dark:text-stone-400" data-provider-display-name={provider.id} title={displayName}>
                            路由显示：{displayName}
                        </div>
                    ) : null}
                </div>
                <label className="flex shrink-0 items-center gap-2 text-xs text-stone-500">
                    <input type="checkbox" checked={provider.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
                    启用
                </label>
                <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={onDelete}>
                    删除
                </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Base URL">
                    <input className={inputClass} value={provider.baseUrl} placeholder="https://your-relay.example.com" onChange={(event) => onChange({ baseUrl: event.target.value })} />
                </Field>
                <Field label={`API Keys / 轮询凭据（已配置 ${credentialPool.keys.length} 把）`}>
                    <SecretListInput
                        values={credentialPool.keys}
                        placeholder="每行或逗号分隔；按顺序轮询，仅一把也可"
                        onCommit={(keys) => onChange(reconcileProviderCredentialPool(keys, provider))}
                    />
                </Field>
            </div>
            <div className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm dark:border-stone-800 dark:bg-stone-950">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={provider.timeoutOverrideMs !== undefined}
                        onChange={(event) => onChange(event.target.checked
                            ? { timeoutOverrideMs: provider.timeoutOverrideMs ?? provider.timeoutMs }
                            : { timeoutOverrideMs: undefined, timeoutMs: defaultApiRelayAdvanced.defaultTimeoutMs })}
                    />
                    使用此中转的专属超时
                </label>
                {provider.timeoutOverrideMs !== undefined ? (
                    <Field label="专属超时毫秒">
                        <input
                            className={inputClass}
                            value={String(provider.timeoutOverrideMs)}
                            onChange={(event) => onChange({ timeoutOverrideMs: Number(event.target.value) || provider.timeoutOverrideMs })}
                        />
                    </Field>
                ) : (
                    <div className="text-xs text-stone-500 dark:text-stone-400">未开启时继承“模型路由设置”中的默认超时。</div>
                )}
            </div>
            {isCivitaiAdapterType(provider.adapterType) ? (
                <div className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm dark:border-stone-800 dark:bg-stone-950">
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={provider.allowMatureContent !== false}
                            onChange={(event) => onChange({ allowMatureContent: event.target.checked })}
                        />
                        允许成人内容（Civitai Yellow Buzz）
                    </label>
                    <div className="text-xs text-stone-500 dark:text-stone-400">默认开启。取消勾选才会把 allowMatureContent=false 发给 Civitai， mature 提示词会被上游拒绝。</div>
                </div>
            ) : null}
            <div className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm dark:border-stone-800 dark:bg-stone-950">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={provider.proxyMode === "custom"}
                        onChange={(event) => onChange({ proxyMode: event.target.checked ? "custom" : "direct" })}
                    />
                    使用此中转的专属代理
                </label>
                {provider.proxyMode === "custom" ? (
                    <Field label="专属代理 URL">
                        <input
                            aria-label="专属代理 URL"
                            type="text"
                            autoComplete="off"
                            className={inputClass}
                            value={provider.proxyUrl}
                            placeholder="http://127.0.0.1:7890"
                            onChange={(event) => onChange({ proxyUrl: event.target.value })}
                        />
                    </Field>
                ) : (
                    <div className="text-xs text-stone-500 dark:text-stone-400">关闭时强制直连，不继承系统或环境代理。</div>
                )}
                <div className="text-xs text-stone-500 dark:text-stone-400">仅影响此 provider 的提交、轮询和结果代取；代理地址只保存在本地配置中。</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="协议适配器">
                    <select className={inputClass} value={provider.adapterType || ""} onChange={(event) => onChange({ adapterType: event.target.value || undefined })}>
                        <option value="">OpenAI 兼容 / 自动识别</option>
                        <option value="agnes">Agnes</option>
                        <option value="dashscope">DashScope</option>
                        <option value="ark">火山方舟 Ark</option>
                        <option value="sensenova">SenseNova</option>
                        <option value="sensenova-miaohua">SenseTime 秒画</option>
                        <option value="civitai-orchestration">Civitai Orchestration</option>
                    </select>
                </Field>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
                {API_CAPABILITIES.map((capability) => (
                    <label key={capability} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={provider.capabilities.includes(capability)} onChange={(event) => onChange({ capabilities: event.target.checked ? mergeCapabilities(provider.capabilities, capability) : provider.capabilities.filter((item) => item !== capability) })} />
                        {API_CAPABILITY_LABELS[capability]}
                    </label>
                ))}
            </div>
            <Field label="模型列表">
                <ModelListTextarea className={`${inputClass} min-h-24 resize-y py-2 leading-5`} value={provider.models} placeholder={"每行一个模型，例如：\ngpt-5.5\ngpt-image-2\nseedance-2.0"} onCommit={updateModels} />
            </Field>
            <ModelCapabilityCheckboxes provider={provider} onChange={onChange} />
            <AudioCapabilityProfilesEditor
                provider={provider}
                onChange={(audioCapabilityProfiles) => onChange({ audioCapabilityProfiles })}
            />
            <ImageCapabilityProfilesEditor
                provider={provider}
                onChange={(imageCapabilityProfiles) => onChange({ imageCapabilityProfiles })}
            />
            <details className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-950">
                <summary className="cursor-pointer select-none text-xs font-medium text-stone-600 dark:text-stone-300">自定义视频 Endpoint 能力映射</summary>
                <div className="mt-3">
                    <Field label="每行填写 模型ID=能力模板；用于自定义 Ark Endpoint 参考图协议">
                        <ProfileMapTextarea provider={provider} value={provider.videoCapabilityProfiles} onCommit={(videoCapabilityProfiles) => onChange({ videoCapabilityProfiles })} />
                    </Field>
                </div>
            </details>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs leading-5 text-stone-500">
                    <div>已配置 {provider.models.length} 个模型；models.dev 已匹配 {catalogSummary.matched}，未验证 {catalogSummary.unverified}</div>
                    <div>元数据仅辅助分类，不代表中转端点可用性或生成参数能力。</div>
                </div>
                <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={onPullModels} disabled={loading}>
                    {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    {provider.adapterType === "civitai-orchestration" ? "从 /v2/services 读取" : "从 /models 读取"}
                </Button>
            </div>
        </div>
    );
}

function AudioCapabilityProfilesEditor({
    provider,
    onChange,
}: {
    provider: ApiRelayProvider;
    onChange: (value: ApiRelayProvider["audioCapabilityProfiles"]) => void;
}) {
    const audioModels = normalizeModelList(provider.audioModels);
    return (
        <details className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-950">
            <summary className="cursor-pointer select-none text-xs font-medium text-stone-600 dark:text-stone-300">
                自定义音频 Endpoint 能力映射
            </summary>
            <div className="mt-2 text-[11px] leading-5 text-stone-500 dark:text-stone-400">
                当前只接通 text-to-speech。音频分类不会授权 /audio/speech；未知模型必须选择与 Endpoint 实际合同一致的模板。
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {audioModels.length ? audioModels.map((model) => {
                    const selected = provider.audioCapabilityProfiles?.[model] || "";
                    const resolved = resolveAudioModelCapability({ model, operation: "text-to-speech", provider });
                    const compatibleProfiles = AUDIO_CAPABILITY_PROFILE_IDS.filter(
                        (profileId) => audioCapabilityProfileCompatibility(provider, profileId).compatible,
                    );
                    const selectedIncompatible = selected && !audioCapabilityProfileCompatibility(provider, selected).compatible;
                    return (
                        <Field key={model} label={`${model} · text-to-speech`}>
                            <select
                                className={inputClass}
                                aria-label={`${model} text-to-speech 能力模板`}
                                value={selected}
                                onChange={(event) => {
                                    const profileId = event.target.value as AudioCapabilityProfileId | "";
                                    const next = { ...(provider.audioCapabilityProfiles || {}) };
                                    if (profileId) next[model] = profileId;
                                    else delete next[model];
                                    onChange(normalizeAudioCapabilityProfiles(next));
                                }}
                            >
                                <option value="">自动识别 / 未验证</option>
                                {selectedIncompatible ? (
                                    <option value={selected} disabled>
                                        {AUDIO_CAPABILITY_PROFILES[selected].label}（与当前 adapter 不兼容；请求会被阻止）
                                    </option>
                                ) : null}
                                {compatibleProfiles.map((profileId) => (
                                    <option key={profileId} value={profileId}>{AUDIO_CAPABILITY_PROFILES[profileId].label}</option>
                                ))}
                            </select>
                            <span className={`text-[11px] leading-4 ${resolved.availability.state === "supported" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                                {selected ? `显式映射：${resolved.label}` : resolved.availability.state === "supported" ? `自动识别：${resolved.label}` : `未验证：${resolved.availability.reason}`}
                            </span>
                        </Field>
                    );
                }) : (
                    <div className="text-xs text-stone-500 dark:text-stone-400">暂无显式音频模型。</div>
                )}
            </div>
        </details>
    );
}

const IMAGE_PROFILE_OPERATIONS: readonly { operation: ImageOperation; label: string }[] = [
    { operation: "generate", label: "Generate 文生图" },
    { operation: "edit", label: "Edit 参考图编辑" },
    { operation: "variation", label: "Variation 变体" },
    { operation: "responses-tool", label: "Responses 图片工具" },
];

function ImageCapabilityProfilesEditor({
    provider,
    onChange,
}: {
    provider: ApiRelayProvider;
    onChange: (value: ApiRelayProvider["imageCapabilityProfiles"]) => void;
}) {
    const imageModels = normalizeModelList(provider.imageModels);

    return (
        <details className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-950">
            <summary className="cursor-pointer select-none text-xs font-medium text-stone-600 dark:text-stone-300">
                自定义图片 Endpoint 能力映射
            </summary>
            <div className="mt-2 text-[11px] leading-5 text-stone-500 dark:text-stone-400">
                每个图片模型按 operation 单独覆盖。留空会继续自动识别；任何标记为未验证的 operation 都会在提交前明确阻止，不会假定成 OpenAI 协议。
            </div>
            <div className="mt-3 space-y-2">
                {imageModels.length ? (
                    imageModels.map((model) => (
                        <ImageCapabilityModelEditor
                            key={model}
                            model={model}
                            provider={provider}
                            onChange={(operation, profileId) =>
                                onChange(
                                    setImageCapabilityProfileOverride(
                                        provider.imageCapabilityProfiles,
                                        model,
                                        operation,
                                        profileId,
                                    ),
                                )
                            }
                        />
                    ))
                ) : (
                    <div className="rounded-lg border border-dashed border-stone-300 p-3 text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
                        暂无显式图片模型；先从 /models 读取，或在“显式图片模型”中添加。已有映射仍会保留，模型重新发现后会再次显示。
                    </div>
                )}
            </div>
        </details>
    );
}

function ImageCapabilityModelEditor({
    model,
    provider,
    onChange,
}: {
    model: string;
    provider: ApiRelayProvider;
    onChange: (operation: ImageOperation, profileId: ImageCapabilityProfileId | "") => void;
}) {
    const needsMapping = IMAGE_PROFILE_OPERATIONS.some(({ operation }) => {
        const override = imageCapabilityProfileOverrideForOperation(provider.imageCapabilityProfiles, model, operation);
        const resolved = resolveImageModelCapability({ model, operation, provider });
        return !override && !resolved.profileConfigured && resolved.requiresExplicitProfile === true;
    });

    return (
        <details
            className="rounded-lg border border-stone-200 bg-stone-50 p-2 dark:border-stone-800 dark:bg-stone-900/60"
            data-image-capability-model={model}
        >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium marker:hidden">
                <span className="min-w-0 break-all">{model}</span>
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                        needsMapping
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            : "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
                    }`}
                >
                    {needsMapping ? "需要能力映射" : "可自动识别/覆盖"}
                </span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {IMAGE_PROFILE_OPERATIONS.map(({ operation, label }) => {
                    const selected = imageCapabilityProfileOverrideForOperation(
                        provider.imageCapabilityProfiles,
                        model,
                        operation,
                    );
                    const resolved = resolveImageModelCapability({ model, operation, provider });
                    const matchingProfiles = IMAGE_CAPABILITY_PROFILE_IDS.filter(
                        (profileId) =>
                            IMAGE_CAPABILITY_PROFILES[profileId].operation === operation &&
                            imageCapabilityProfileCompatibility(provider, profileId).compatible,
                    );
                    const selectedIncompatibleProfile = selected && !imageCapabilityProfileCompatibility(provider, selected).compatible
                        ? IMAGE_CAPABILITY_PROFILES[selected]
                        : undefined;
                    return (
                        <Field key={operation} label={label}>
                            <select
                                className={inputClass}
                                aria-label={`${model} ${label}能力模板`}
                                value={selected}
                                onChange={(event) => onChange(operation, event.target.value as ImageCapabilityProfileId | "")}
                            >
                                <option value="">自动识别 / 未验证</option>
                                {selectedIncompatibleProfile ? (
                                    <option value={selected} disabled>
                                        {selectedIncompatibleProfile.label}（与当前 adapter 不兼容；请求会被阻止）
                                    </option>
                                ) : null}
                                {matchingProfiles.map((profileId) => {
                                    const profile = IMAGE_CAPABILITY_PROFILES[profileId];
                                    const lifecycle = profile.lifecycle === "active" ? "" : profile.lifecycle === "deprecated" ? "（已弃用）" : "（已移除；仅旧中转合同）";
                                    return (
                                        <option key={profileId} value={profileId}>
                                            {profile.label}{lifecycle}
                                        </option>
                                    );
                                })}
                            </select>
                            <ImageCapabilityResolutionHint operation={operation} selected={selected} resolved={resolved} />
                        </Field>
                    );
                })}
            </div>
        </details>
    );
}

function ImageCapabilityResolutionHint({
    operation,
    selected,
    resolved,
}: {
    operation: ImageOperation;
    selected: ImageCapabilityProfileId | "";
    resolved: ReturnType<typeof resolveImageModelCapability>;
}) {
    if (selected) {
        return <span className="text-[11px] leading-4 text-stone-500 dark:text-stone-400">显式覆盖：{resolved.label}</span>;
    }
    if (resolved.profileConfigured) {
        return <span className="text-[11px] leading-4 text-stone-500 dark:text-stone-400">通配映射：{resolved.label}</span>;
    }
    if (resolved.availability.state === "supported") {
        return <span className="text-[11px] leading-4 text-emerald-700 dark:text-emerald-400">自动识别：{resolved.label}</span>;
    }
    if (resolved.availability.state === "unsupported") {
        return <span className="text-[11px] leading-4 text-stone-500 dark:text-stone-400">自动识别：{resolved.availability.reason}</span>;
    }
    const explicitProfileRequired = resolved.requiresExplicitProfile === true;
    return (
        <span className="text-[11px] leading-4 text-amber-700 dark:text-amber-400">
            未验证：{resolved.availability.reason}
            {explicitProfileRequired || operation !== "generate"
                ? "；提交前必须选择与 Endpoint 实际合同一致的模板。"
                : "；基础文生图可按兼容模式尝试，额外参数仍需明确 profile。"}
        </span>
    );
}

function SecretListInput({ values, placeholder, onCommit }: { values: string[]; placeholder: string; onCommit: (values: string[]) => void }) {
    const committedText = values.join("\n");
    const [draft, setDraft] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);

    return editing ? (
        <textarea
            className={`${inputClass} min-h-20 resize-y py-2 leading-5`}
            autoComplete="off"
            autoFocus
            placeholder={placeholder}
            value={draft ?? committedText}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
                const next = draft === null ? values : parseProviderKeyText(draft);
                setDraft(null);
                setEditing(false);
                if (next.join("\n") !== committedText) onCommit(next);
            }}
        />
    ) : (
        <div className="flex min-w-0 gap-2">
            <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                aria-label="API Keys / 轮询凭据（默认隐藏）"
                readOnly
                value={values.length ? "configured" : ""}
                placeholder={placeholder}
            />
            <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl" onClick={() => setEditing(true)}>
                编辑
            </Button>
        </div>
    );
}

function ProfileMapTextarea({ provider, value, onCommit }: { provider: ApiRelayProvider; value: ApiRelayProvider["videoCapabilityProfiles"]; onCommit: (value: ApiRelayProvider["videoCapabilityProfiles"]) => void }) {
    const committedText = Object.entries(value || {}).map(([model, profile]) => `${model}=${profile}`).join("\n");
    const [draft, setDraft] = useState<string | null>(null);
    const [draftError, setDraftError] = useState("");
    const committedError = validateVideoProfileMap(provider, committedText).error;
    return (
        <div>
            <textarea
                className={`${inputClass} min-h-20 resize-y py-2 leading-5`}
                value={draft ?? committedText}
                placeholder={"custom-video-id=openai-video"}
                aria-invalid={Boolean(draftError || committedError)}
                onChange={(event) => {
                    setDraft(event.target.value);
                    setDraftError("");
                }}
                onBlur={() => {
                    if (draft === null) return;
                    const parsed = validateVideoProfileMap(provider, draft);
                    if (parsed.error) {
                        setDraftError(parsed.error);
                        return;
                    }
                    setDraft(null);
                    setDraftError("");
                    if (JSON.stringify(parsed.value || {}) !== JSON.stringify(value || {})) onCommit(parsed.value);
                }}
            />
            {draftError || committedError ? (
                <div className="mt-1 text-[11px] leading-4 text-red-600 dark:text-red-400">{draftError || committedError}</div>
            ) : null}
        </div>
    );
}

function validateVideoProfileMap(provider: ApiRelayProvider, text: string): { value?: ApiRelayProvider["videoCapabilityProfiles"]; error: string } {
    const entries: Array<[string, string]> = [];
    for (const [index, rawLine] of text.split("\n").entries()) {
        const line = rawLine.trim();
        if (!line) continue;
        const separator = line.indexOf("=");
        if (separator < 1 || !line.slice(separator + 1).trim()) return { error: `第 ${index + 1} 行格式无效，请使用 模型ID=能力模板` };
        const model = line.slice(0, separator).trim();
        const profile = line.slice(separator + 1).trim();
        if (!isVideoCapabilityProfileId(profile)) return { error: `第 ${index + 1} 行包含未知视频能力模板：${profile}` };
        const compatibility = videoCapabilityProfileCompatibility(provider, profile);
        if (!compatibility.compatible) return { error: `第 ${index + 1} 行：${compatibility.reason}` };
        entries.push([model, profile]);
    }
    return { value: normalizeVideoCapabilityProfiles(Object.fromEntries(entries)), error: "" };
}

function normalizeModels(value: string) {
    // 只按换行和逗号分隔：模型 ID 可能带空格（例如某些中转的带前缀命名），
    // 按空白切会把一个模型拆成多个无效条目。
    return normalizeModelList(value.split(/[\n,，]+/));
}

function mergeCapabilities(capabilities: ApiCapability[], capability: ApiCapability) {
    return API_CAPABILITIES.filter((item) => item === capability || capabilities.includes(item));
}

const inputClass = "h-10 min-w-0 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-stone-400 dark:border-stone-800 dark:bg-stone-950 dark:focus:border-stone-600";
