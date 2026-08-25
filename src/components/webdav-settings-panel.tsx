"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { syncAppDataToWebdav } from "@/services/app-sync";
import { testWebdavConnection } from "@/services/webdav-sync";
import { useConfigStore } from "@/stores/use-config-store";

const inputClass = "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100";

export function WebdavSettingsPanel() {
    const webdav = useConfigStore((state) => state.webdav);
    const updateWebdavConfig = useConfigStore((state) => state.updateWebdavConfig);
    const [action, setAction] = useState<"test" | "sync" | null>(null);
    const [status, setStatus] = useState("");

    const run = async (kind: "test" | "sync") => {
        setAction(kind);
        setStatus("");
        try {
            if (kind === "test") {
                await testWebdavConnection(webdav);
                setStatus("连接成功");
            } else {
                const result = await syncAppDataToWebdav(webdav);
                updateWebdavConfig("lastSyncedAt", result.syncedAt);
                setStatus(`同步完成：${result.projects} 个画布，${result.assets} 个素材`);
            }
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "WebDAV 操作失败");
        } finally {
            setAction(null);
        }
    };

    return (
        <section className="space-y-4">
            <div>
                <h3 className="text-base font-semibold text-stone-950 dark:text-white">WebDAV 同步</h3>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">配置后可在桌面端同步画布、素材与生成记录。地址可使用公网、127.0.0.1 或局域网服务。</p>
            </div>
            <label className="block space-y-1.5 text-sm text-stone-700 dark:text-stone-300">
                <span>服务地址</span>
                <input className={inputClass} type="url" value={webdav.url} placeholder="https://dav.example.com/remote.php/dav/files/user" onChange={(event) => updateWebdavConfig("url", event.target.value)} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm text-stone-700 dark:text-stone-300">
                    <span>用户名</span>
                    <input className={inputClass} autoComplete="username" value={webdav.username} onChange={(event) => updateWebdavConfig("username", event.target.value)} />
                </label>
                <label className="block space-y-1.5 text-sm text-stone-700 dark:text-stone-300">
                    <span>密码或应用密码</span>
                    <input className={inputClass} type="password" autoComplete="current-password" value={webdav.password} onChange={(event) => updateWebdavConfig("password", event.target.value)} />
                </label>
            </div>
            <label className="block space-y-1.5 text-sm text-stone-700 dark:text-stone-300">
                <span>远端目录</span>
                <input className={inputClass} value={webdav.directory} placeholder="Boundless-Studio" onChange={(event) => updateWebdavConfig("directory", event.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
                <input type="checkbox" checked={webdav.proxyMode === "nextjs"} onChange={(event) => updateWebdavConfig("proxyMode", event.target.checked ? "nextjs" : "direct")} />
                通过桌面本地代理连接（浏览器跨域受限时建议开启）
            </label>
            <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4 dark:border-stone-800">
                <Button type="button" variant="outline" disabled={Boolean(action) || !webdav.url.trim()} onClick={() => void run("test")}>{action === "test" ? "正在测试…" : "测试连接"}</Button>
                <Button type="button" disabled={Boolean(action) || !webdav.url.trim()} onClick={() => void run("sync")}>{action === "sync" ? "正在同步…" : "立即同步"}</Button>
                {status ? <span className="text-xs text-stone-600 dark:text-stone-300" role="status">{status}</span> : null}
            </div>
            {webdav.lastSyncedAt ? <p className="text-xs text-stone-500">最近同步：{new Date(webdav.lastSyncedAt).toLocaleString()}</p> : null}
        </section>
    );
}
