import type {
  CanvasConnection,
  CanvasNodeData,
  Seedance2ReferenceSlotBinding,
  Seedance2ReferenceSlotKey,
  Seedance2ReferenceSlotUseAs,
  VideoReferenceRole,
} from "../types";
import { isCharacterAssetForbiddenForVideo } from "./character-video-guard";
import {
  SEEDANCE2_MAX_REFERENCE_SLOT_COUNT,
  SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER as SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER_RAW,
  SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY as SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY_RAW,
  assignExclusiveSeedance2ReferenceUseAs as assignExclusiveSeedance2ReferenceUseAsRaw,
  buildSeedance2ReferenceSlotKeysFromOrder as buildSeedance2ReferenceSlotKeysFromOrderRaw,
  getSeedance2FirstFrameReference,
  mergeSeedance2OrderedCustomerReferences,
  nextSeedance2ReferenceSequence,
  normalizeSeedance2ReferenceSlotUseAs as normalizeSeedance2ReferenceSlotUseAsRaw,
  normalizeSeedance2StoryReferenceRole as normalizeSeedance2StoryReferenceRoleRaw,
  parseSeedance2ExtraReferenceSlotIndex,
  planSeedance2ReferenceConnection as planSeedance2ReferenceConnectionRaw,
  resolveSeedance2ReferenceSlots as resolveSeedance2ReferenceSlotsRaw,
  seedance2BoundExtraSlotStats,
  seedance2CanOccupyReferenceSlot as seedance2CanOccupyReferenceSlotRaw,
  seedance2ManualReferenceHighestSlotIndex,
  seedance2ResolvedSlotsToCustomerReferences as seedance2ResolvedSlotsToCustomerReferencesRaw,
} from "./seedance2-reference-slots.mjs";

export {
  SEEDANCE2_MAX_REFERENCE_SLOT_COUNT,
  getSeedance2FirstFrameReference,
  mergeSeedance2OrderedCustomerReferences,
  nextSeedance2ReferenceSequence,
  parseSeedance2ExtraReferenceSlotIndex,
  seedance2BoundExtraSlotStats,
  seedance2ManualReferenceHighestSlotIndex,
};

export type Seedance2CustomerReferenceSource = "semantic" | "extra" | "connected";

export type Seedance2CustomerReferenceLike = {
  id?: string;
  referenceId?: string;
  label: string;
  value: string;
  nodeId: string;
  useAs?: Seedance2ReferenceSlotUseAs;
  role?: VideoReferenceRole;
  slotSource?: Seedance2CustomerReferenceSource;
  slotOrderIndex?: number;
};

export type Seedance2ResolvedReferenceSlotSource = "manual" | "connected" | "pending" | "empty";

export type Seedance2ResolvedReferenceSlot = {
  slotIndex: number;
  source: Seedance2ResolvedReferenceSlotSource;
  label: string;
  value: string;
  previewValue?: string;
  nodeId?: string;
  connectionId?: string;
  referenceId?: string;
  referenceSequence?: number;
  referenceOrigin?: CanvasConnection["referenceOrigin"];
  useAs: Seedance2ReferenceSlotUseAs;
  role?: VideoReferenceRole;
};

export type Seedance2ReferenceSlotResolveOptions = {
  placeholder: CanvasNodeData;
  nodes: readonly CanvasNodeData[];
  connections: readonly CanvasConnection[];
  visibleSlotCount?: number;
  visibleSlotPurposes?: readonly Seedance2ReferenceSlotUseAs[];
  automaticConnectionPurpose?: Seedance2ReferenceSlotUseAs | null;
};

export type Seedance2ResolvedCustomerReference = {
  id?: string;
  referenceId?: string;
  label: string;
  value: string;
  nodeId: string;
  useAs: Seedance2ReferenceSlotUseAs;
  role: VideoReferenceRole;
  referenceOrigin?: CanvasConnection["referenceOrigin"];
};

export type Seedance2ReferenceConnectionPlanOptions = {
  connection: Omit<CanvasConnection, "id"> & { id?: string };
  placeholderId: string;
  nodes: readonly CanvasNodeData[];
  connections: readonly CanvasConnection[];
  visibleSlotCount?: number;
};

export type Seedance2ReferenceConnectionPlan = {
  accepted: boolean;
  referenceSequence: number;
};

export type { Seedance2ReferenceSlotBinding, Seedance2ReferenceSlotKey, Seedance2ReferenceSlotUseAs };

// The .mjs implementation is untyped; every wrapper below pins a precise
// signature so downstream TS code does not inherit `any` leaks.

export const SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER =
  SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER_RAW as readonly Seedance2ReferenceSlotKey[];

export const SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY =
  SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY_RAW as Record<Seedance2ReferenceSlotKey, string>;

export function assignExclusiveSeedance2ReferenceUseAs<T extends { id: string; useAs?: Seedance2ReferenceSlotUseAs }>(
  items: readonly T[],
  targetId: string,
  nextUseAs: Seedance2ReferenceSlotUseAs,
): T[] {
  return (assignExclusiveSeedance2ReferenceUseAsRaw as (items: readonly T[], targetId: string, nextUseAs: Seedance2ReferenceSlotUseAs) => T[])(items, targetId, nextUseAs);
}

export function buildSeedance2ReferenceSlotKeysFromOrder(referenceOrder: readonly string[] | undefined): Seedance2ReferenceSlotKey[] {
  return (buildSeedance2ReferenceSlotKeysFromOrderRaw as (order: readonly string[] | undefined) => Seedance2ReferenceSlotKey[])(referenceOrder);
}

export function normalizeSeedance2ReferenceSlotUseAs(value: unknown): Seedance2ReferenceSlotUseAs {
  return (normalizeSeedance2ReferenceSlotUseAsRaw as (value: unknown) => Seedance2ReferenceSlotUseAs)(value);
}

export function normalizeSeedance2StoryReferenceRole(value: unknown): VideoReferenceRole | undefined {
  return (normalizeSeedance2StoryReferenceRoleRaw as (value: unknown) => VideoReferenceRole | undefined)(value);
}

export function planSeedance2ReferenceConnection(options: Seedance2ReferenceConnectionPlanOptions): Seedance2ReferenceConnectionPlan {
  return (planSeedance2ReferenceConnectionRaw as (options: Seedance2ReferenceConnectionPlanOptions) => Seedance2ReferenceConnectionPlan)(options);
}

export function seedance2ResolvedSlotsToCustomerReferences(
  slots: readonly Seedance2ResolvedReferenceSlot[],
): Seedance2ResolvedCustomerReference[] {
  return (seedance2ResolvedSlotsToCustomerReferencesRaw as (slots: readonly Seedance2ResolvedReferenceSlot[]) => Seedance2ResolvedCustomerReference[])(slots);
}

export function seedance2CanOccupyReferenceSlot(node: CanvasNodeData | undefined | null) {
  if (isCharacterAssetForbiddenForVideo(node)) return false;
  return seedance2CanOccupyReferenceSlotRaw(node);
}

export function resolveSeedance2ReferenceSlots(options: Seedance2ReferenceSlotResolveOptions): Seedance2ResolvedReferenceSlot[] {
  const slots = (resolveSeedance2ReferenceSlotsRaw as (options: Seedance2ReferenceSlotResolveOptions) => Seedance2ResolvedReferenceSlot[])(options);
  return slots.filter((slot) => {
    const node = options.nodes.find((item) => item.id === slot.nodeId);
    return !isCharacterAssetForbiddenForVideo(node);
  });
}
