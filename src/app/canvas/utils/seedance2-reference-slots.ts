import type {
  CanvasConnection,
  CanvasNodeData,
  Seedance2ReferenceSlotBinding,
  Seedance2ReferenceSlotKey,
  Seedance2ReferenceSlotUseAs,
  VideoReferenceRole,
} from "../types";
import { CanvasNodeType } from "../types";
import { isCharacterAssetForbiddenForVideo } from "./character-video-guard";

export const SEEDANCE2_MAX_REFERENCE_SLOT_COUNT = 12;

export function seedance2CanOccupyReferenceSlot(node: CanvasNodeData | undefined | null) {
  if (!node || node.type !== CanvasNodeType.Image) return false;
  if (isCharacterAssetForbiddenForVideo(node)) return false;
  const metadata = node.metadata || {};
  const storageKey = String(metadata.storageKey || "").trim();
  const content = String(metadata.content || "").trim();
  const backendUrl = String(metadata.backendUrl || "").trim();
  const backendRel = String(metadata.backendRel || "").trim();
  const status = String(metadata.status || "").trim();
  const pending = status === "loading" || status === "generating" || Boolean(metadata.sourceImageTaskId);
  const usable = [storageKey, backendUrl, content, backendRel].some((value) => value && !value.startsWith("blob:"));
  return Boolean(usable || pending);
}
