import { SEEDANCE2_MAX_REFERENCE_SLOT_COUNT } from './seedance2-reference-slots';

export type Seedance2ResponsiveRatio = '9:16' | '16:9';

export const SEEDANCE2_PORTRAIT_MIN_SIZE = { width: 420, height: 746 } as const;
export const SEEDANCE2_NATURAL_PORTRAIT_RATIO_THRESHOLD = 0.85;
export const SEEDANCE2_NATURAL_LANDSCAPE_RATIO_THRESHOLD = 1.25;
export const SEEDANCE2_PORTRAIT_FRAME_SWITCH_RATIO = 0.75;
export const SEEDANCE2_LANDSCAPE_FRAME_SWITCH_RATIO = 1.35;
const SEEDANCE2_LANDSCAPE_DEFAULT_SLOT_MIN_WIDTH = 900;

function fallbackRatio(value?: string | null): Seedance2ResponsiveRatio {
  return value === '16:9' ? '16:9' : '9:16';
}

export function seedance2RatioFromNaturalSize(
  width: number,
  height: number,
  fallback: string | null = '9:16',
): Seedance2ResponsiveRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return fallbackRatio(fallback);
  const ratio = width / height;
  if (ratio <= SEEDANCE2_NATURAL_PORTRAIT_RATIO_THRESHOLD) return '9:16';
  if (ratio >= SEEDANCE2_NATURAL_LANDSCAPE_RATIO_THRESHOLD) return '16:9';
  return fallbackRatio(fallback);
}

export function seedance2SourceRatioFromNaturalSize(
  width: number,
  height: number,
): Seedance2ResponsiveRatio | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  if (ratio <= SEEDANCE2_NATURAL_PORTRAIT_RATIO_THRESHOLD) return '9:16';
  if (ratio >= SEEDANCE2_NATURAL_LANDSCAPE_RATIO_THRESHOLD) return '16:9';
  return null;
}

export function seedance2RatioFromNodeFrame(
  width: number,
  height: number,
  current: string | null = '9:16',
): Seedance2ResponsiveRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return fallbackRatio(current);
  const ratio = width / height;
  if (ratio >= SEEDANCE2_LANDSCAPE_FRAME_SWITCH_RATIO) return '16:9';
  if (ratio <= SEEDANCE2_PORTRAIT_FRAME_SWITCH_RATIO) return '9:16';
  return fallbackRatio(current);
}

export function seedance2VisibleReferenceSlotCount({
  width,
  height,
  boundSlotCount = 0,
  isExpanded = false,
  orientation,
}: {
  width: number;
  height: number;
  boundSlotCount?: number;
  isExpanded?: boolean;
  orientation?: Seedance2ResponsiveRatio;
}): number {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  const safeBoundSlotCount = Number.isFinite(boundSlotCount) ? Math.max(0, Math.floor(boundSlotCount)) : 0;
  const isLandscapeFrame = orientation === '16:9' || (
    orientation === undefined && (
      safeWidth >= SEEDANCE2_LANDSCAPE_DEFAULT_SLOT_MIN_WIDTH ||
      (safeHeight > 0 && safeWidth / safeHeight >= SEEDANCE2_LANDSCAPE_FRAME_SWITCH_RATIO)
    )
  );
  const defaultSlotCount = isLandscapeFrame ? 4 : 2;
  if (!isExpanded) {
    return Math.min(SEEDANCE2_MAX_REFERENCE_SLOT_COUNT, Math.max(defaultSlotCount, safeBoundSlotCount));
  }
  const extraByWidth = Math.max(0, Math.floor((safeWidth - SEEDANCE2_PORTRAIT_MIN_SIZE.width) / 140));
  const extraByHeight = Math.max(0, Math.floor((safeHeight - SEEDANCE2_PORTRAIT_MIN_SIZE.height) / 96));
  return Math.min(
    SEEDANCE2_MAX_REFERENCE_SLOT_COUNT,
    Math.max(
      defaultSlotCount,
      Math.min(SEEDANCE2_MAX_REFERENCE_SLOT_COUNT, defaultSlotCount + extraByWidth + extraByHeight),
      safeBoundSlotCount,
    ),
  );
}
