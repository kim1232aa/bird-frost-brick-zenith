import { useAssetStore, type Asset } from "@/stores/use-asset-store";

export type AssetLibraryItem = {
    id: string;
    title: string;
    type: "text" | "image" | "video";
    coverUrl: string;
    tags: string[];
    category: string;
    description: string;
    content: string;
    url: string;
    createdAt: string;
    updatedAt: string;
};

export type AssetLibraryResponse = {
    items: AssetLibraryItem[];
    tags: string[];
    total: number;
};

export type AssetLibraryQuery = {
    keyword?: string;
    type?: string;
    tag?: string[];
    page?: number;
    pageSize?: number;
};

export async function fetchAssetLibrary(query: AssetLibraryQuery = {}): Promise<AssetLibraryResponse> {
    const assets = useAssetStore.getState().assets;
    const keyword = String(query.keyword || "").trim().toLowerCase();
    const type = String(query.type || "").trim();
    const tags = (query.tag || []).filter(Boolean);
    const page = query.page || 1;
    const pageSize = query.pageSize || 24;

    const mapped = assets.map(toLibraryItem);
    const filtered = mapped.filter((item) => {
        if (type && type !== "all" && item.type !== type) return false;
        if (tags.length && !tags.every((tag) => item.tags.includes(tag))) return false;
        if (!keyword) return true;
        return `${item.title} ${item.description} ${item.content} ${item.tags.join(" ")}`.toLowerCase().includes(keyword);
    });
    const start = Math.max(0, (page - 1) * pageSize);
    return {
        items: filtered.slice(start, start + pageSize),
        tags: [...new Set(mapped.flatMap((item) => item.tags))],
        total: filtered.length,
    };
}

function toLibraryItem(asset: Asset): AssetLibraryItem {
    const content = asset.kind === "text" ? asset.data.content : "";
    const url = asset.kind === "image" ? asset.data.dataUrl : asset.kind === "video" ? asset.data.url : "";
    return {
        id: asset.id,
        title: asset.title,
        type: asset.kind,
        coverUrl: asset.coverUrl,
        tags: asset.tags,
        category: "我的素材",
        description: asset.note || "",
        content,
        url,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
    };
}
