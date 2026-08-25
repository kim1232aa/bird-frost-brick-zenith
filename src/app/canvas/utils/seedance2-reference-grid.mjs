function stopSeedance2ReferenceGridCanvasEvent(event) {
  event.stopPropagation();
}

export const seedance2ReferenceGridCanvasEventHandlers = {
  onMouseDown: stopSeedance2ReferenceGridCanvasEvent,
  onPointerDown: stopSeedance2ReferenceGridCanvasEvent,
  onWheel: stopSeedance2ReferenceGridCanvasEvent,
};

export function seedance2PortraitReferenceGridClassName(slotCount) {
  const hasInternalOverflow = Number.isFinite(slotCount) && Math.floor(slotCount) > 4;
  return hasInternalOverflow
    ? "thin-scrollbar grid min-h-0 flex-1 grid-cols-2 content-start auto-rows-min gap-2 overflow-y-auto pr-1"
    : "grid min-h-0 flex-1 grid-cols-2 content-start auto-rows-min gap-2 overflow-hidden";
}
