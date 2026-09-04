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
  SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER,
  SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY,
  assignExclusiveSeedance2ReferenceUseAs,
  buildSeedance2ReferenceSlotKeysFromOrder,
  getSeedance2FirstFrameReference,
  mergeSeedance2OrderedCustomerReferences,
  nextSeedance2ReferenceSequence,
  normalizeSeedance2ReferenceSlotUseAs,
  normalizeSeedance2StoryReferenceRole,
  parseSeedance2ExtraReferenceSlotIndex,
  planSeedance2ReferenceConnection,
  resolveSeedance2ReferenceSlots as resolveSeedance2ReferenceSlotsRaw,
  seedance2BoundExtraSlotStats,
  seedance2CanOccupyReferenceSlot as seedance2CanOccupyReferenceSlotRaw,
  seedance2ManualReferenceHighestSlotIndex,
  seedance2ResolvedSlotsToCustomerReferences,
} from "./seedance2-reference-slots.mjs";

export {
  SEEDANCE2_MAX_REFERENCE_SLOT_COUNT,
  SEEDANCE2_REFERENCE_SLOT_FALLBACK_ORDER,
  SEEDANCE2_REFERENCE_SLOT_LABELS_BY_KEY,
  assignExclusiveSeedance2ReferenceUseAs,
  buildSeedance2ReferenceSlotKeysFromOrder,
  getSeedance2FirstFrameReference,
  mergeSeedance2OrderedCustomerReferences,
  nextSeedance2ReferenceSequence,
  normalizeSeedance2ReferenceSlotUseAs,
  normalizeSeedance2StoryReferenceRole,
  parseSeedance2ExtraReferenceSlotIndex,
  planSeedance2ReferenceConnection,
  seedance2BoundExtraSlotStats,
  seedance2ManualReferenceHighestSlotIndex,
  seedance2ResolvedSlotsToCustomerReferences,
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

export type { Seedance2ReferenceSlotBinding, Seedance2ReferenceSlotKey, Seedance2ReferenceSlotUseAs };

export function seedance2CanOccupyReferenceSlot(node: CanvasNodeData | undefined | null) {
  if (isCharacterAssetForbiddenForVideo(node)) return false;
  return seedance2CanOccupyReferenceSlotRaw(node);
}

export function resolveSeedance2ReferenceSlots(options: Seedance2ReferenceSlotResolveOptions) {
  return resolveSeedance2ReferenceSlotsRaw(options).filter((slot) => {
    const node = options.nodes.find((item) => item.id === slot.nodeId);
    return !isCharacterAssetForbiddenForVideo(node);
  });
}
