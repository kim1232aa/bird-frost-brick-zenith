import type { ImageGenInput } from "./adapters/types";

/** Default cap used only when a caller has not resolved a per-model contract. */
export const MAX_IMAGE_REFS = 5;

export function collectImageRefs(input: Pick<ImageGenInput, "imageUrl" | "imageUrls">): string[] {
  const list = [...(input.imageUrls || []), ...(input.imageUrl ? [input.imageUrl] : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(list));
}

export function imageRefs(input: Pick<ImageGenInput, "imageUrl" | "imageUrls">, max = MAX_IMAGE_REFS): string[] {
  return collectImageRefs(input).slice(0, max);
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
