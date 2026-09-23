type InterruptedVideoSubmitMetadata = {
  status?: string;
  content?: string;
  errorDetails?: string;
  videoGenerationTask?: { id?: string };
  videoGenerationAttempt?: { id?: string };
  seedanceTaskId?: string;
  seedanceGenerationTaskState?: { status?: string; taskId?: string };
  [key: string]: unknown;
};

export const INTERRUPTED_VIDEO_SUBMIT_ERROR =
  "上次视频提交没有真正跑起来就中断了（提交失败、切换画布或刷新页面），远端没有任务在跑。请检查参考图与视频模型后重新点「生成视频」。";

/**
 * A submit that dies before it obtains a task id leaves the node at `loading` with
 * no task to resume. Wiping that back to a blank placeholder loses the only trace
 * the user had, and the card silently reads "等待生成" again — indistinguishable from
 * never having pressed the button. Settle it as a failure instead: the card then
 * shows a reason, and, because `error` is a terminal state, the model picker and the
 * generate button both unlock for a retry.
 *
 * Returns `null` when the node owns a task that polling can still pick up.
 */
export function recoverInterruptedVideoSubmit(
  metadata: InterruptedVideoSubmitMetadata | undefined,
): InterruptedVideoSubmitMetadata | null {
  if (!metadata || metadata.status !== "loading") return null;
  if (metadata.videoGenerationTask?.id) return null;
  const taskState = metadata.seedanceGenerationTaskState;
  if (taskState?.status === "generating" && taskState.taskId) return null;
  return {
    ...metadata,
    status: "error",
    errorDetails: String(metadata.errorDetails || "").trim() || INTERRUPTED_VIDEO_SUBMIT_ERROR,
    videoGenerationAttempt: undefined,
    videoGenerationTask: undefined,
    seedanceTaskId: undefined,
    seedanceGenerationTaskState: undefined,
  };
}
