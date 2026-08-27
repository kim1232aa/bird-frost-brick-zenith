import type { ImageGenInput } from "./adapters/types";

export const MAX_IMAGE_REFS = 5;

function uniqueImageUrls(input: Pick<ImageGenInput, "imageUrl" | "imageUrls">): string[] {
  const list = [...(input.imageUrls || []), ...(input.imageUrl ? [input.imageUrl] : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(list));
}

/** Unique refs, silently capped. Prefer collectImageRefs when the model has a hard max. */
export function imageRefs(input: Pick<ImageGenInput, "imageUrl" | "imageUrls">, max = MAX_IMAGE_REFS): string[] {
  return uniqueImageUrls(input).slice(0, max);
}

/** Unique refs. Throws if the model cannot take this many — never silently drop extras. */
export function collectImageRefs(input: Pick<ImageGenInput, "imageUrl" | "imageUrls">, max?: number): string[] {
  const unique = uniqueImageUrls(input);
  if (typeof max === "number" && unique.length > max) {
    throw new Error(`该模型最多 ${max} 张参考图，当前 ${unique.length} 张。请先去掉多余的参考再生成。`);
  }
  return unique;
}

export async function filesToDataUrls(files: FileList | File[] | null | undefined, max = MAX_IMAGE_REFS): Promise<string[]> {
  const list = [...(files || [])].filter((file) => file.type.startsWith("image/")).slice(0, max);
  return Promise.all(
    list.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("读取图片失败"));
          reader.readAsDataURL(file);
        }),
    ),
  );
}
