import type { CanvasExportAsset, CanvasExportFile } from "../export-types";

type ArchiveEntry = Blob;

type CanvasImportMedia = {
    asset: CanvasExportAsset;
    blob: Blob;
};

export type CanvasArchive = {
    get: (path: string) => ArchiveEntry | undefined;
};

export type CanvasArchiveImportHandlers = {
    writeMedia: (storageKey: string, blob: Blob) => Promise<void>;
    deleteMedia?: (storageKeys: string[]) => Promise<void>;
    importProject: (project: CanvasExportFile["projects"][number]["project"]) => string | void;
    deleteProjects?: (projectIds: string[]) => void;
    getExistingMediaKeys?: () => Promise<Set<string>>;
};

/**
 * Reads and normalizes every manifest-declared media entry before any storage
 * writer runs. This keeps an incomplete archive from producing a partial import.
 */
export async function collectCanvasArchiveMedia(archive: CanvasArchive, data: CanvasExportFile): Promise<CanvasImportMedia[]> {
    if (!Array.isArray(data.projects)) throw new Error("画布压缩包缺少项目清单");

    const declaredFiles = data.projects.flatMap((project) => {
        if (!Array.isArray(project.files)) throw new Error("画布压缩包的素材清单无效");
        return project.files;
    });

    return Promise.all(
        declaredFiles.map(async (asset) => {
            if (!asset.path || !asset.storageKey) throw new Error("画布压缩包的素材条目无效");
            const entry = archive.get(asset.path);
            if (!entry) throw new Error(`画布压缩包缺少素材：${asset.path}`);

            // Accessing the bytes detects unreadable entries before the first write.
            await entry.arrayBuffer();
            const blob = entry.type ? entry : entry.slice(0, entry.size, asset.mimeType);
            return { asset, blob };
        }),
    );
}

export async function importCanvasArchive(archive: CanvasArchive, data: CanvasExportFile, handlers: CanvasArchiveImportHandlers) {
    const media = await collectCanvasArchiveMedia(archive, data);

    // Reject duplicate manifest keys before remapping: two identical source
    // keys could otherwise both conflict and be remapped to distinct keys,
    // silently bypassing the duplicate detection below.
    const manifestKeys = new Set<string>();
    for (const m of media) {
        if (manifestKeys.has(m.asset.storageKey)) {
            throw new Error(`压缩包清单包含重复的 storageKey: ${m.asset.storageKey}`);
        }
        manifestKeys.add(m.asset.storageKey);
    }

    // Check for storage key conflicts before any writes
    const existingKeys = handlers.getExistingMediaKeys ? await handlers.getExistingMediaKeys() : new Set<string>();
    const keyRemapping = new Map<string, string>();
    for (const m of media) {
        if (!existingKeys.has(m.asset.storageKey)) continue;
        const oldKey = m.asset.storageKey;
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const newKey = `${oldKey}_remapped_${timestamp}_${randomSuffix}`;
        keyRemapping.set(oldKey, newKey);
        m.asset.storageKey = newKey;
    }

    const newlyCreatedMediaKeys: string[] = [];
    const importedProjectIds: string[] = [];

    try {
        // Write all media. Every destination key is registered for rollback
        // before the write attempt: a failing writer may have already stored
        // the blob, and deleting a never-written key is harmless.
        for (const { asset, blob } of media) {
            newlyCreatedMediaKeys.push(asset.storageKey);
            await handlers.writeMedia(asset.storageKey, blob);
        }

        // Import all projects with remapped keys
        for (const { project } of data.projects) {
            const remappedProject = applyStorageKeyRemapping(project, keyRemapping);
            const result = handlers.importProject(remappedProject);
            if (typeof result === "string") {
                importedProjectIds.push(result);
            }
        }

        return data.projects.length;
    } catch (error) {
        // Roll back only newly created media and projects (not pre-existing keys)
        if (newlyCreatedMediaKeys.length > 0 && handlers.deleteMedia) {
            await handlers.deleteMedia(newlyCreatedMediaKeys).catch(() => {});
        }
        if (importedProjectIds.length > 0 && handlers.deleteProjects) {
            handlers.deleteProjects(importedProjectIds);
        }
        throw error;
    }
}

function applyStorageKeyRemapping(project: any, remapping: Map<string, string>): any {
    if (!remapping.size) return project;

    const remapped = structuredClone(project);

    function remapInObject(obj: any): void {
        if (!obj || typeof obj !== "object") return;

        if (Array.isArray(obj)) {
            obj.forEach(remapInObject);
        } else {
            if (obj.metadata?.storageKey && remapping.has(obj.metadata.storageKey)) {
                obj.metadata.storageKey = remapping.get(obj.metadata.storageKey);
            }
            Object.values(obj).forEach(remapInObject);
        }
    }

    remapInObject(remapped);
    return remapped;
}
