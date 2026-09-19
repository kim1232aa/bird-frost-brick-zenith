import type { ApiRelayProvider } from "@/stores/api-relay-config";
import { orderedProviderCredentialIds } from "@/stores/provider-credentials";
import type {
  CanvasVideoTaskProviderSnapshot,
} from "../types";

const SNAPSHOT_SCHEMA = "canvas-video-provider-snapshot/v1" as const;

export type CanvasVideoTaskSnapshotBlockCode =
  | "legacy-snapshot-unverifiable"
  | "snapshot-invalid"
  | "provider-deleted"
  | "provider-disabled"
  | "provider-revision-changed"
  | "base-url-changed"
  | "adapter-changed"
  | "capability-unavailable"
  | "model-unavailable"
  | "credential-missing"
  | "credential-slot-changed"
  | "task-context-missing"
  | "task-route-mismatch";

export type CanvasVideoTaskProviderSnapshotResult =
  | {
      readonly status: "ready";
      readonly snapshot: CanvasVideoTaskProviderSnapshot;
    }
  | {
      readonly status: "blocked";
      readonly code: CanvasVideoTaskSnapshotBlockCode;
      readonly message: string;
    };

export type CanvasVideoTaskProviderResumeResult =
  | {
      readonly status: "ready";
      readonly provider: ApiRelayProvider;
    }
  | {
      readonly status: "blocked";
      readonly code: CanvasVideoTaskSnapshotBlockCode;
      readonly message: string;
    };

type SnapshotInput = {
  readonly provider: ApiRelayProvider;
  readonly model: string;
  readonly credentialId: string;
  readonly operation: CanvasVideoTaskProviderSnapshot["operation"];
};

export type CanvasVideoTaskResumeExpectation = {
  readonly providerId: string;
  readonly model: string;
  readonly credentialId: string;
  readonly capability: "video";
  readonly operation: CanvasVideoTaskProviderSnapshot["operation"];
};

type ProviderCredential = {
  readonly id: string;
  readonly slot: number;
};

function block(
  code: CanvasVideoTaskSnapshotBlockCode,
  message: string,
): { status: "blocked"; code: CanvasVideoTaskSnapshotBlockCode; message: string } {
  return { status: "blocked", code, message };
}

export function normalizeCanvasVideoTaskBaseUrl(value: string) {
  const input = String(value || "").trim();
  if (!input) return "";
  try {
    const parsed = new URL(input);
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return input.replace(/\/+$/u, "");
  }
}

function normalizeAdapterType(value: string | undefined) {
  return String(value || "openai-compatible").trim().toLowerCase() || "openai-compatible";
}

function providerCredentials(provider: ApiRelayProvider): ProviderCredential[] {
  return orderedProviderCredentialIds(provider).map((id, slot) => ({ id, slot }));
}

function browserSafeProvider(provider: ApiRelayProvider): ApiRelayProvider {
  const credentialIds = orderedProviderCredentialIds(provider);
  return {
    ...provider,
    apiKey: "",
    apiKeys: undefined,
    hasApiKey: Boolean(provider.hasApiKey || credentialIds.length),
  };
}

function providerFingerprint(
  fields: Omit<CanvasVideoTaskProviderSnapshot, "providerFingerprint">,
) {
  return `canvas-video-provider-fingerprint/v1:${JSON.stringify([
    fields.providerId,
    fields.providerUpdatedAt,
    fields.adapterType,
    fields.baseUrl,
    fields.model,
    fields.credentialId,
    fields.credentialSlot,
    fields.capability,
    fields.operation,
  ])}`;
}

const VIDEO_OPERATIONS: readonly CanvasVideoTaskProviderSnapshot["operation"][] = [
  "text-to-video",
  "image-to-video",
  "reference-to-video",
  "first-last-frame-to-video",
  "keyframes-to-video",
  "continuation",
  "video-edit",
];

function isValidSnapshot(
  snapshot: CanvasVideoTaskProviderSnapshot,
): snapshot is CanvasVideoTaskProviderSnapshot {
  if (
    snapshot.schema !== SNAPSHOT_SCHEMA ||
    !snapshot.providerId?.trim() ||
    !snapshot.providerUpdatedAt?.trim() ||
    !snapshot.adapterType?.trim() ||
    !snapshot.baseUrl?.trim() ||
    !snapshot.model?.trim() ||
    !snapshot.credentialId?.trim() ||
    !Number.isSafeInteger(snapshot.credentialSlot) ||
    snapshot.credentialSlot < 0 ||
    snapshot.capability !== "video" ||
    !VIDEO_OPERATIONS.includes(snapshot.operation)
  ) {
    return false;
  }
  const { providerFingerprint: recordedFingerprint, ...fields } = snapshot;
  return recordedFingerprint === providerFingerprint(fields);
}

export function createCanvasVideoTaskProviderSnapshot(
  input: SnapshotInput,
): CanvasVideoTaskProviderSnapshotResult {
  if (!input.provider.enabled) {
    return block(
      "provider-disabled",
      "视频 provider 已停用，无法创建可恢复任务快照。",
    );
  }
  if (!input.provider.capabilities.includes("video")) {
    return block(
      "capability-unavailable",
      "provider 未声明视频能力，无法创建可恢复任务快照。",
    );
  }
  const model = input.model.trim();
  if (!model) {
    return block(
      "model-unavailable",
      "未指定视频模型，无法创建任务快照。",
    );
  }
  if (
    !input.provider.id.trim() ||
    !input.provider.updatedAt.trim() ||
    !normalizeCanvasVideoTaskBaseUrl(input.provider.baseUrl) ||
    !VIDEO_OPERATIONS.includes(input.operation)
  ) {
    return block(
      "snapshot-invalid",
      "provider 路由身份不完整，无法创建可安全恢复的任务快照。",
    );
  }
  const credential = providerCredentials(input.provider).find(
    (candidate) => candidate.id === input.credentialId,
  );
  if (!credential) {
    return block(
      "credential-missing",
      "视频任务所用的凭据标识不存在，已阻止创建可恢复任务快照。",
    );
  }
  const fields = {
    schema: SNAPSHOT_SCHEMA,
    providerId: input.provider.id.trim(),
    providerUpdatedAt: input.provider.updatedAt.trim(),
    adapterType: normalizeAdapterType(input.provider.adapterType),
    baseUrl: normalizeCanvasVideoTaskBaseUrl(input.provider.baseUrl),
    model,
    credentialId: credential.id,
    credentialSlot: credential.slot,
    capability: "video" as const,
    operation: input.operation,
  };
  return {
    status: "ready",
    snapshot: {
      ...fields,
      providerFingerprint: providerFingerprint(fields),
    },
  };
}

export function validateCanvasVideoTaskProviderSnapshot(
  snapshot: CanvasVideoTaskProviderSnapshot | undefined,
  providers: readonly ApiRelayProvider[],
  expected: CanvasVideoTaskResumeExpectation | undefined,
): CanvasVideoTaskProviderResumeResult {
  const providerId = snapshot?.providerId || expected?.providerId;
  const provider = (providerId ? providers.find((c) => c.id === providerId) : null) || providers.find((p) => p.enabled && p.capabilities.includes("video"));
  if (!provider) {
    return block("provider-deleted", "未找到可恢复的视频 provider。");
  }
  return { status: "ready", provider: browserSafeProvider(provider) };
}
