import { createZip, readZip } from "@/lib/zip";
import type { StudioHistoryItem } from "./history";

const APP = "boundless-studio";
const VERSION = 1;

function extOf(url: string, kind: string) {
  if (kind === "video") return "mp4";
  if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) return "jpg";
  if (url.startsWith("data:image/webp")) return "webp";
  if (url.includes(".jpg") || url.includes(".jpeg")) return "jpg";
  if (url.includes(".webp")) return "webp";
  if (url.includes(".mp4")) return "mp4";
  return kind === "video" ? "mp4" : "png";
}

async function blobFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`读取素材失败 ${response.status}`);
  return response.blob();
}

export async function exportStudioLibrary(items: StudioHistoryItem[]) {
  const local = items.filter((item) => item.urls[0]);
  if (!local.length) throw new Error("没有可导出的本机作品");
  const files: Array<{ name: string; data: BlobPart }> = [];
  const manifestItems: Array<StudioHistoryItem & { files: string[] }> = [];
  for (const [index, item] of local.entries()) {
    const names: string[] = [];
    for (const [offset, url] of item.urls.entries()) {
      const ext = extOf(url, item.kind);
      const name = `media/${String(index).padStart(3, "0")}-${offset}.${ext}`;
      try {
        files.push({ name, data: await blobFromUrl(url) });
        names.push(name);
      } catch {
        /* skip unreachable remote sample */
      }
    }
    if (names.length) manifestItems.push({ ...item, urls: [], files: names });
  }
  if (!manifestItems.length) throw new Error("作品里的文件读不到，无法打包");
  files.push({
    name: "manifest.json",
    data: JSON.stringify({ app: APP, version: VERSION, exportedAt: new Date().toISOString(), items: manifestItems }, null, 2),
  });
  return createZip(files);
}

export async function importStudioLibrary(file: Blob): Promise<Omit<StudioHistoryItem, "id" | "createdAt">[]> {
  const zip = await readZip(file);
  const manifestFile = zip.get("manifest.json");
  if (!manifestFile) throw new Error("不是无界创作台作品包（缺少 manifest.json）");
  const manifest = JSON.parse(await manifestFile.text()) as {
    app?: string;
    version?: number;
    items?: Array<StudioHistoryItem & { files?: string[] }>;
  };
  if (manifest.app !== APP) throw new Error("该压缩包不是无界创作台作品导出");
  if (manifest.version !== VERSION) throw new Error(`作品包版本不兼容，仅支持 ${VERSION}`);
  const out: Omit<StudioHistoryItem, "id" | "createdAt">[] = [];
  for (const item of manifest.items || []) {
    const urls: string[] = [];
    for (const name of item.files || []) {
      const blob = zip.get(name);
      if (!blob) continue;
      urls.push(URL.createObjectURL(blob));
    }
    if (!urls.length && item.urls?.[0]) {
      urls.push(
        ...item.urls.filter((url) =>
          url.startsWith("data:") || url.startsWith("/works/") || url.startsWith("/gallery/"),
        ),
      );
    }
    if (!urls.length) continue;
    out.push({
      kind: item.kind === "video" ? "video" : "image",
      title: item.title || "导入作品",
      prompt: item.prompt || "",
      model: item.model || "",
      providerId: item.providerId,
      urls,
    });
  }
  if (!out.length) throw new Error("压缩包里没有可用素材");
  return out;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}
