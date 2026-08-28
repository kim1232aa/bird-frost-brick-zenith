"use client";

import type { ReactNode } from "react";

export const CANVAS_OVERLAY_POPUP_CLASS = "canvas-overlay-popup";

// Only portaled menus. Node chrome with data-canvas-no-drag is not an overlay.
const OVERLAY_SELECTOR = [
  `.${CANVAS_OVERLAY_POPUP_CLASS}`,
  ".ant-select-dropdown",
  ".ant-select-item",
  ".ant-dropdown",
  ".ant-picker-dropdown",
  ".ant-popover",
  ".ant-modal",
  ".ant-tooltip",
  ".ant-message",
  ".ant-notification",
  ".canvas-image-settings-popover",
  "[data-radix-popper-content-wrapper]",
  "[data-radix-select-content]",
  "[data-radix-select-viewport]",
].join(",");

export function isCanvasOverlayTarget(target: EventTarget | null): boolean {
  const el =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!el) return false;
  return Boolean(el.closest(OVERLAY_SELECTOR));
}

export function isCanvasNodeInteractiveTarget(target: EventTarget | null): boolean {
  const el =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  if (!el) return false;
  return Boolean(
    el.closest("input,textarea,select,button,a,[contenteditable='true'],[data-canvas-no-drag]"),
  );
}

export function stopCanvasOverlayEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function wrapCanvasOverlayPopup(menu: ReactNode) {
  return (
    <div
      className={CANVAS_OVERLAY_POPUP_CLASS}
      onMouseDown={stopCanvasOverlayEvent}
      onPointerDown={stopCanvasOverlayEvent}
      onClick={stopCanvasOverlayEvent}
    >
      {menu}
    </div>
  );
}

export function canvasSelectOverlayProps() {
  return {
    getPopupContainer: () => document.body,
    popupRender: wrapCanvasOverlayPopup,
    dropdownRender: wrapCanvasOverlayPopup,
    classNames: { popup: { root: CANVAS_OVERLAY_POPUP_CLASS } },
    popupClassName: CANVAS_OVERLAY_POPUP_CLASS,
  };
}
