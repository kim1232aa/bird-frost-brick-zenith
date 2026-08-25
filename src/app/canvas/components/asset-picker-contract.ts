import type { AssetLibraryItem } from "@/services/api/assets";

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string }
    | { kind: "image"; dataUrl: string; title: string; storageKey?: string }
    | { kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number };

export const libraryKindFilterOptions = [
    { label: "全部", value: "" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
] as const;

/** Convert a library record to the workspace insertion contract without treating video as image data. */
export function createLibraryInsertPayload(asset: AssetLibraryItem, imageDataUrl?: string): InsertAssetPayload {
    if (asset.type === "text") return { kind: "text", content: asset.content, title: asset.title };
    if (asset.type === "video") return { kind: "video", url: asset.url, title: asset.title };
    if (!imageDataUrl) throw new Error("图片素材缺少可插入的数据");
    return { kind: "image", dataUrl: imageDataUrl, title: asset.title };
}
