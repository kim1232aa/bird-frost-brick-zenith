import type { ApiRequestRoute } from "@/services/api/ai-routing";
import type { ResolvedImageCapabilityId } from "@/services/api/image-model-capabilities";
import { orderedProviderCredentialIds } from "@/stores/provider-credentials";

export const CANVAS_IMAGE_TASK_SCHEMA_VERSION = 1 as const;
export type NativeImageTaskProvider = "dashscope" | "miaohua" | "civitai";
export type CanvasImageTaskProvider = NativeImageTaskProvider | "platform";
export type CanvasImageTaskOperation = "generate" | "edit" | "variation" | "responses-tool";
export type CanvasImageTaskResultPolicy = "exact-count" | "partial-valid";

export type SubmittedNativeImageTask = {
    readonly provider: NativeImageTaskProvider;
    readonly taskId: string;
    /** Opaque server-vault identity selected for this task. */
    readonly credentialId?: string;
    readonly startedAt: string;
    readonly expectedOutputs: number;
};
export type NativeImageTaskSubmissionObserver = (task: SubmittedNativeImageTask) => void | Promise<void>;

export class NativeImageTaskTerminalError extends Error {
    readonly terminal = true;
}

export type CanvasImageTaskSnapshot = {
    readonly schemaVersion: typeof CANVAS_IMAGE_TASK_SCHEMA_VERSION;
    readonly taskId: string;
    readonly provider: CanvasImageTaskProvider;
    readonly providerId?: string;
    readonly providerRevision?: string;
    readonly adapterType?: string;
    readonly credentialId?: string;
    readonly model: string;
    readonly operation: CanvasImageTaskOperation;
    readonly capabilityId: ResolvedImageCapabilityId;
    readonly expectedOutputs: number;
    readonly resultPolicy: CanvasImageTaskResultPolicy;
    readonly startedAt: string;
};

export type CanvasImageTaskBinding = {
    readonly snapshot: CanvasImageTaskSnapshot;
    readonly attemptId: string;
    readonly outputIndex: number;
};

export function snapshotSubmittedNativeImageTask(
    route: ApiRequestRoute,
    submitted: SubmittedNativeImageTask,
    options: { operation: CanvasImageTaskOperation; capabilityId: ResolvedImageCapabilityId; resultPolicy: CanvasImageTaskResultPolicy },
): CanvasImageTaskSnapshot {
    if (route.mode !== "local") throw new Error("原生图片任务只能绑定本地 provider 路由");
    const adapter = String(route.provider.adapterType || "").trim().toLowerCase();
    const providerMatchesAdapter =
        (submitted.provider === "dashscope" && adapter === "dashscope") ||
        (submitted.provider === "miaohua" && (adapter === "sensenova-miaohua" || adapter === "miaohua" || adapter === "sensenova")) ||
        (submitted.provider === "civitai" && (adapter === "civitai-orchestration" || adapter === "civitai"));
    if (!providerMatchesAdapter) throw new Error("图片任务 provider 与创建路由的协议适配器不一致");
    const credentialId = String(submitted.credentialId || "").trim();
    if (!credentialId || !orderedProviderCredentialIds(route.provider).includes(credentialId)) {
        throw new Error("图片任务创建所用凭据没有稳定槽位 ID，无法安全持久化并恢复");
    }
    return {
        schemaVersion: CANVAS_IMAGE_TASK_SCHEMA_VERSION,
        taskId: submitted.taskId,
        provider: submitted.provider,
        providerId: route.provider.id,
        providerRevision: route.provider.updatedAt,
        adapterType: adapter,
        credentialId,
        model: route.model,
        operation: options.operation,
        capabilityId: options.capabilityId,
        expectedOutputs: submitted.expectedOutputs,
        resultPolicy: options.resultPolicy,
        startedAt: submitted.startedAt,
    };
}

export type RestoredNativeImageTask =
    | { readonly status: "ready"; readonly credentialId: string }
    | { readonly status: "provider-missing" | "provider-revision-mismatch" | "adapter-mismatch" | "model-mismatch" | "credential-missing" };

export function restoreNativeImageTaskCredential(snapshot: CanvasImageTaskSnapshot, route: ApiRequestRoute): RestoredNativeImageTask {
    if (snapshot.provider === "platform") return { status: "provider-missing" };
    if (route.mode !== "local" || route.provider.id !== snapshot.providerId) return { status: "provider-missing" };
    if (route.provider.updatedAt !== snapshot.providerRevision) return { status: "provider-revision-mismatch" };
    if (String(route.provider.adapterType || "").trim().toLowerCase() !== String(snapshot.adapterType || "").trim().toLowerCase()) return { status: "adapter-mismatch" };
    if (route.model !== snapshot.model) return { status: "model-mismatch" };
    const credentialId = String(snapshot.credentialId || "").trim();
    if (!credentialId || !orderedProviderCredentialIds(route.provider).includes(credentialId)) return { status: "credential-missing" };
    return { status: "ready", credentialId };
}

export function ownsCanvasImageTask(binding: CanvasImageTaskBinding | undefined, attemptId: string, taskId?: string) {
    return Boolean(binding && binding.attemptId === attemptId && (!taskId || binding.snapshot.taskId === taskId));
}

export function assertSecretFreeCanvasImageTaskSnapshot(snapshot: CanvasImageTaskSnapshot) {
    const serialized = JSON.stringify(snapshot);
    if (/authorization|api[_-]?key|prompt|data:image|https?:\/\//i.test(serialized)) throw new Error("图片任务快照包含禁止持久化的凭据、提示词或媒体内容");
    return serialized;
}
