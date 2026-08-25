import type { UploadedImage } from "@/services/image-storage";

import {
    CHARACTER_DERIVED_VIEW_ANGLES,
    type CharacterDerivedView,
    type CharacterDerivedViewAngle,
} from "../types";

const CHARACTER_DERIVED_VIEW_LABELS: Record<CharacterDerivedViewAngle, string> = {
    front: "Front",
    side: "Side",
    back: "Back",
    portrait: "Portrait",
};

export type CharacterTurnaroundViewUpload = (
    image: Blob,
    options: { retained: true },
) => Promise<Pick<UploadedImage, "storageKey" | "width" | "height" | "mimeType" | "bytes">>;

export type SplitAndStoreCharacterTurnaroundSheetOptions = {
    /** Stable parent node ID used to make each derived-view ID referenceable. */
    parentNodeId: string;
    /** Retained storage key for the source turnaround sheet. */
    sourceStorageKey: string;
    /** A transient resolvable source URL; it is never included in the returned descriptors. */
    sourceUrl: string;
    /** Existing metadata from the parent node, used for idempotent reuse. */
    existingViews?: readonly CharacterDerivedView[];
    /** Increment when the derivation contract changes. */
    version?: number;
    /** Explicit retained-image writer; production passes the application image store. */
    upload: CharacterTurnaroundViewUpload;
};

/**
 * True unless there is one complete, retained descriptor for each expected
 * angle from the requested source. A source-key mismatch is always stale.
 */
export function areCharacterDerivedViewsStale(
    views: readonly CharacterDerivedView[] | undefined,
    sourceStorageKey: string,
    parentNodeId?: string,
    version = 1,
) {
    return !hasCompleteCharacterDerivedViews(views, sourceStorageKey, parentNodeId, version);
}

export function hasCompleteCharacterDerivedViews(
    views: readonly CharacterDerivedView[] | undefined,
    sourceStorageKey: string,
    parentNodeId?: string,
    version = 1,
) {
    if (!views || views.length !== CHARACTER_DERIVED_VIEW_ANGLES.length) return false;
    const angles = new Set(views.map((view) => view.angle));
    if (angles.size !== CHARACTER_DERIVED_VIEW_ANGLES.length) return false;
    return CHARACTER_DERIVED_VIEW_ANGLES.every((angle) => {
        const matchingViews = views.filter((candidate) => candidate.angle === angle);
        const view = matchingViews[0];
        return Boolean(
            matchingViews.length === 1 &&
            view &&
                view.storageKey &&
                view.width > 0 &&
                view.height > 0 &&
                view.mimeType &&
                view.bytes >= 0 &&
                view.sourceStorageKey === sourceStorageKey &&
                view.version === version &&
                (parentNodeId === undefined || view.id === characterDerivedViewId(parentNodeId, angle)),
        );
    });
}

export function characterDerivedViewId(parentNodeId: string, angle: CharacterDerivedViewAngle) {
    return `${parentNodeId}:${angle}`;
}

/**
 * Splits a known 1x4 horizontal turnaround sheet into retained storage-backed
 * crops. The source and crop URLs remain transient browser state; canvas
 * metadata receives only the returned storage descriptors.
 */
export async function splitAndStoreCharacterTurnaroundSheet({
    parentNodeId,
    sourceStorageKey,
    sourceUrl,
    existingViews,
    version = 1,
    upload,
}: SplitAndStoreCharacterTurnaroundSheetOptions): Promise<CharacterDerivedView[]> {
    if (!upload) throw new Error("角色 turnaround 切图需要 uploadImage 上传器。");
    if (!areCharacterDerivedViewsStale(existingViews, sourceStorageKey, parentNodeId, version)) {
        return orderedCharacterDerivedViews(existingViews!);
    }

    const image = await loadImage(sourceUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 4 || sourceHeight < 1) {
        throw new Error("角色 turnaround 图必须是可切分的横向 1x4 图像。");
    }

    return Promise.all(
        CHARACTER_DERIVED_VIEW_ANGLES.map(async (angle, index) => {
            const x = Math.round((index * sourceWidth) / CHARACTER_DERIVED_VIEW_ANGLES.length);
            const right = Math.round(((index + 1) * sourceWidth) / CHARACTER_DERIVED_VIEW_ANGLES.length);
            const blob = await cropImageToBlob(image, x, 0, Math.max(1, right - x), sourceHeight);
            const stored = await upload(blob, { retained: true });
            return {
                id: characterDerivedViewId(parentNodeId, angle),
                storageKey: stored.storageKey,
                width: stored.width,
                height: stored.height,
                mimeType: stored.mimeType,
                bytes: stored.bytes,
                sourceStorageKey,
                version,
                angle,
                label: CHARACTER_DERIVED_VIEW_LABELS[angle],
            };
        }),
    );
}

function orderedCharacterDerivedViews(views: readonly CharacterDerivedView[]) {
    return CHARACTER_DERIVED_VIEW_ANGLES.map((angle) => {
        const view = views.find((candidate) => candidate.angle === angle);
        if (!view) throw new Error(`角色 turnaround 缺少 ${angle} 角度图。`);
        return view;
    });
}

function loadImage(sourceUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("无法读取角色 turnaround 图。"));
        image.src = sourceUrl;
    });
}

function cropImageToBlob(image: HTMLImageElement, x: number, y: number, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建角色 turnaround 切图画布。");
    context.drawImage(image, x, y, width, height, 0, 0, width, height);
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("无法编码角色 turnaround 切图。"));
        }, "image/png");
    });
}
