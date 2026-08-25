import type { ApiRelayProvider } from "@/stores/api-relay-config";
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
      readonly apiKey: string;
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
  readonly apiKey: string;
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
  const credentials: ProviderCredential[] = [];
  const seen = new Set<string>();
  const append = (apiKeyValue: string | undefined, idValue: string | undefined) => {
    const apiKey = String(apiKeyValue || "").trim();
    const id = String(idValue || "").trim();
    if (!apiKey || !id || seen.has(apiKey)) return;
    seen.add(apiKey);
    credentials.push({ id, apiKey, slot: credentials.length });
  };
  append(provider.apiKey, provider.apiKeyId);
  (provider.apiKeys || []).forEach((apiKey, index) => {
    append(apiKey, provider.apiKeyIds?.[index]);
  });
  return credentials;
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
  if (!model || !input.provider.videoModels.includes(model)) {
    return block(
      "model-unavailable",
      "provider 未明确提供该视频模型，无法创建可恢复任务快照。",
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
  if (!snapshot) {
    return block(
      "legacy-snapshot-unverifiable",
      "旧视频任务没有严格 provider 快照，无法安全自动恢复。",
    );
  }
  if (!isValidSnapshot(snapshot)) {
    return block(
      "snapshot-invalid",
      "视频任务 provider 快照不完整或已损坏，无法安全自动恢复。",
    );
  }
  if (!expected) {
    return block(
      "task-context-missing",
      "视频任务缺少用于核对 provider 快照的路由上下文，无法安全自动恢复。",
    );
  }
  if (
    expected.providerId !== snapshot.providerId ||
    expected.model !== snapshot.model ||
    expected.credentialId !== snapshot.credentialId ||
    expected.capability !== snapshot.capability ||
    expected.operation !== snapshot.operation
  ) {
    return block(
      "task-route-mismatch",
      "视频任务的 provider、模型、凭据或 operation 与快照不一致，任务恢复已阻止。",
    );
  }
  const provider = providers.find((candidate) => candidate.id === snapshot.providerId);
  if (!provider) return block("provider-deleted", "原视频 provider 已删除，任务恢复已阻止。");
  if (!provider.enabled) return block("provider-disabled", "原视频 provider 已停用，任务恢复已阻止。");
  if (normalizeCanvasVideoTaskBaseUrl(provider.baseUrl) !== snapshot.baseUrl) {
    return block("base-url-changed", "原视频 provider 的 Base URL 已改变，任务恢复已阻止。");
  }
  if (normalizeAdapterType(provider.adapterType) !== snapshot.adapterType) {
    return block("adapter-changed", "原视频 provider 的协议适配器已改变，任务恢复已阻止。");
  }
  if (!provider.capabilities.includes("video")) {
    return block("capability-unavailable", "原 provider 已不再声明视频能力，任务恢复已阻止。");
  }
  if (!provider.videoModels.includes(snapshot.model)) {
    return block("model-unavailable", "原 provider 已不再提供该视频模型，任务恢复已阻止。");
  }
  const credential = providerCredentials(provider).find(
    (candidate) => candidate.id === snapshot.credentialId,
  );
  if (!credential) return block("credential-missing", "原视频任务凭据已缺失，任务恢复已阻止。");
  if (credential.slot !== snapshot.credentialSlot) {
    return block("credential-slot-changed", "原视频任务凭据槽位已改变，任务恢复已阻止。");
  }
  if (provider.updatedAt.trim() !== snapshot.providerUpdatedAt) {
    return block("provider-revision-changed", "原视频 provider 配置版本已变化，任务恢复已阻止。");
  }
  const current = createCanvasVideoTaskProviderSnapshot({
    provider,
    model: snapshot.model,
    credentialId: snapshot.credentialId,
    operation: snapshot.operation,
  });
  if (current.status === "blocked") return current;
  if (current.snapshot.providerFingerprint !== snapshot.providerFingerprint) {
    return block("provider-revision-changed", "原视频 provider 配置版本已变化，任务恢复已阻止。");
  }
  return { status: "ready", provider, apiKey: credential.apiKey };
}
