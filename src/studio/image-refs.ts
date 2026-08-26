import type { ImageGenInput } from "./adapters/types";

export function imageRefs(input: Pick<ImageGenInput, "imageUrl" | "imageUrls">): string[] {
  const list = [...(input.imageUrls || []), ...(input.imageUrl ? [input.imageUrl] : [])]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(list)).slice(0, 3);
}

export async function filesToDataUrls(files: FileList | File[] | null | undefined, max = 3): Promise<string[]> {
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
