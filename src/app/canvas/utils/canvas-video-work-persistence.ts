import {
  recordGeneratedWork,
  type StudioHistoryItem,
} from "@/studio/history";

type CanvasVideoWork = {
  readonly url: string;
};

type RecordCanvasVideoWork = (
  item: Omit<StudioHistoryItem, "id" | "createdAt">,
) => unknown | Promise<unknown>;

function isMaterializedCanvasVideoUrl(url: string) {
  return url.startsWith("blob:")
    || url.startsWith("data:")
    || url.startsWith("/works/")
    || url.startsWith("/gallery/");
}

function persistenceError(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const result = value as { persistError?: unknown; ok?: unknown; error?: unknown };
  if (typeof result.persistError === "string" && result.persistError.trim()) return result.persistError.trim();
  if (result.ok === false && typeof result.error === "string" && result.error.trim()) return result.error.trim();
  return "";
}

export async function persistCanvasVideoWorks(input: {
  videos: readonly CanvasVideoWork[];
  title?: string;
  prompt?: string;
  model?: string;
  providerId?: string;
  record?: RecordCanvasVideoWork;
}) {
  const title = (input.title || input.prompt || "画布视频").trim().slice(0, 120) || "画布视频";
  const prompt = input.prompt || "";
  const model = input.model || "";
  const providerId = String(input.providerId || "").trim();
  const record = input.record || recordGeneratedWork;

  for (const video of input.videos) {
    const url = String(video.url || "").trim();
    if (!isMaterializedCanvasVideoUrl(url)) {
      throw new Error("画布视频必须先落盘，拒绝直接写入远程 URL");
    }
    const saved = await record({
      kind: "video",
      title,
      prompt,
      model,
      ...(providerId ? { providerId } : {}),
      urls: [url],
    });
    const error = persistenceError(saved);
    if (error) throw new Error(`作品库保存失败：${error}`);
  }
}
