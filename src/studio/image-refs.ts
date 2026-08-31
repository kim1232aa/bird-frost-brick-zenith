import type { ImageGenInput } from "./adapters/types";

/** Official GPT Image edit reference maximum; callers must pass provider-specific caps explicitly. */
export const MAX_IMAGE_REFS = 16;

function uniqueImageUrls(input: Pick<ImageGenInput, "imageUrl" | "imageUrls">): string[] {
  const list = [...(input.imageUrls || []), ...(input.imageUrl ? [input.imageUrl] : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(list));
}

function assertReferenceLimit(count: number, max?: number) {
  if (max === undefined) return;
  if (!Number.isInteger(max) || max < 0) throw new Error(`参考图数量上限必须是非负整数，当前为 ${String(max)}`);
  if (count > max) {
    throw new Error(`该模型最多 ${max} 张参考图，当前 ${count} 张。请先去掉多余的参考再生成。`);
  }
}

/** Unique refs. An explicit max is validated, never used for silent truncation. */
export function imageRefs(input: Pick<ImageGenInput, "imageUrl" | "imageUrls">, max?: number): string[] {
  return collectImageRefs(input, max);
}

/** Unique refs. Throws if the model cannot take this many — never silently drop extras. */
export function collectImageRefs(input: Pick<ImageGenInput, "imageUrl" | "imageUrls">, max?: number): string[] {
  const unique = uniqueImageUrls(input);
  assertReferenceLimit(unique.length, max);
  return unique;
}

/** Merge ordered refs, de-duplicate them, and reject an explicit provider cap. */
export function mergeImageRefs(current: readonly string[], incoming: readonly string[], max?: number): string[] {
  const merged = Array.from(
    new Set([...current, ...incoming].map((item) => String(item || "").trim()).filter(Boolean)),
  );
  assertReferenceLimit(merged.length, max);
  return merged;
}

export async function filesToDataUrls(files: FileList | File[] | null | undefined, max?: number): Promise<string[]> {
  const selected = [...(files || [])];
  const nonImages = selected.filter((file) => !file.type.startsWith("image/"));
  if (nonImages.length) throw new Error(`参考图只能上传图片文件；当前有 ${nonImages.length} 个非图片文件`);
  assertReferenceLimit(selected.length, max);
  return Promise.all(
    selected.map(
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
