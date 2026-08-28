"use client";

import type { ReactNode } from "react";

export const CANVAS_OVERLAY_POPUP_CLASS = "canvas-overlay-popup";

export function stopCanvasOverlayEvent(event: { stopPropagation: () => void }) {
    event.stopPropagation();
}

export function wrapCanvasOverlayPopup(menu: ReactNode) {
    return (
        <div
            data-canvas-no-drag
            data-canvas-no-zoom
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
