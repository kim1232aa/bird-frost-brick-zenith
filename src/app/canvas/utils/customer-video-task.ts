export type CustomerVideoTask = {
  task_id?: string;
  id?: string;
  status?: string;
  result?: string;
  message?: string;
  failure_reason_short?: string;
  postprocess_last_error?: string;
  files?: string[];
  file_urls?: string[];
  watermark_removed?: boolean;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  } | null;
  error?: string | { message?: string; code?: string } | null;
};

export function customerVideoTaskFileUrls(
  task: CustomerVideoTask | undefined,
  fallbackBaseUrl?: string,
) {
  const candidates = [
    ...stringArray(task?.file_urls),
    ...stringArray(task?.files),
    task?.content?.video_url,
    videoResultUrl(task?.result),
  ];
  const seen = new Set<string>();
  return candidates
    .map((value) => normalizeCustomerVideoFileUrl(value, fallbackBaseUrl))
    .filter((url): url is string => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

export function isCustomerVideoTaskReady(
  task: CustomerVideoTask | undefined,
  fallbackBaseUrl?: string,
): task is CustomerVideoTask {
  return customerVideoTaskFileUrls(task, fallbackBaseUrl).length > 0;
}

export type CustomerVideoTaskPollDisposition = "pending" | "completed" | "failed";

export function requireCustomerVideoTask(
  tasks: readonly CustomerVideoTask[] | undefined,
  taskId: string,
) {
  const cleanTaskId = String(taskId || "").trim();
  const task = (Array.isArray(tasks) ? tasks : []).find(
    (candidate) => candidate.task_id === cleanTaskId || candidate.id === cleanTaskId,
  );
  if (task) return task;
  throw Object.assign(new Error("视频任务不存在或已被上游删除"), { status: 404 });
}

export function customerVideoTaskPollDisposition(
  task: CustomerVideoTask | undefined,
): CustomerVideoTaskPollDisposition {
  const status = String(task?.status || "").trim().toLowerCase();
  if (["error", "failed", "canceled", "cancelled"].includes(status)) return "failed";
  if (["success", "completed", "done", "succeeded"].includes(status)) return "completed";
  return "pending";
}

export function customerVideoTaskError(task: CustomerVideoTask | undefined) {
  const candidates = [
    task?.postprocess_last_error,
    errorMessage(task?.error),
    task?.message,
    task?.result,
    task?.failure_reason_short,
  ];
  const detail = candidates.find((value) => !isGenericCustomerVideoFailure(value));
  return formatCustomerVideoTaskError(detail || candidates.find(Boolean));
}

function isGenericCustomerVideoFailure(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || ["生成失败", "视频生成失败", "failed", "generation failed"].includes(normalized);
}

function formatCustomerVideoTaskError(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || isGenericCustomerVideoFailure(raw)) return "视频生成失败";

  const detail = raw.replace(/^protocol_only\s+direct\s+adapter\s+failed:\s*/i, "").trim().slice(0, 300);
  if (/国家\s*\/\s*地区.*不可用/.test(detail)) {
    // 保留上游原文，地区提示追加在后面，不替换。
    return `视频生成失败：${detail}（提示：当前视频供应商在所在国家/地区不可用，可切换可用的视频供应商或线路）`;
  }
  if (/^视频生成失败(?:[：:]|$)/.test(detail)) return detail;
  return `视频生成失败：${detail}`;
}

function normalizeCustomerVideoFileUrl(value: unknown, fallbackBaseUrl?: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = raw.startsWith("/") && fallbackBaseUrl
      ? new URL(raw, normalizeFallbackBaseUrl(fallbackBaseUrl))
      : new URL(raw);
    if (parsed.hostname === "0.0.0.0") {
      const fallback = fallbackBaseUrl ? new URL(normalizeFallbackBaseUrl(fallbackBaseUrl)) : null;
      if (fallback) {
        parsed.protocol = fallback.protocol;
        parsed.hostname = fallback.hostname;
        parsed.port = fallback.port;
      }
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function normalizeFallbackBaseUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "") || "http://127.0.0.1:8006";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function videoResultUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|blob:|asset:\/\/)/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  if (/\.(mp4|mov|webm|m3u8)(\?|#|$)/i.test(raw)) return raw;
  return "";
}

function errorMessage(value: CustomerVideoTask["error"]) {
  if (typeof value === "string") return value;
  return value?.message || "";
}
