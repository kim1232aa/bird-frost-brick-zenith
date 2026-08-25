"use client";

/* eslint-disable @next/next/no-img-element -- Editor previews in-memory data URLs that Next/Image cannot optimize. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { App, Button, InputNumber, Modal, Slider } from "antd";
import { Circle, Grid3X3, Hand, Move, RotateCcw, Save, Undo2, X } from "lucide-react";
import {
  clampEllipseBox,
  createDefaultFaceGridLayer,
  createDefaultFaceSelection,
  createFaceLayerFromSelection,
  createGridLinePlan,
  moveEllipseBox,
  resizeEllipseBox,
  type FaceEditorEllipseBox,
  type FaceEditorFaceLayer,
  type FaceEditorGridLayer,
  type FaceEditorLayer,
  type FaceEditorResizeHandle,
} from "../utils/seedance2-face-editor";

export type CanvasSeedance2FaceEditPayload = { dataUrl: string };
const FACE_EDITOR_MODAL_WIDTH = "min(1280px, 92vw)";
const FACE_EDITOR_MODAL_HEIGHT = "min(820px, 88vh)";
type ActiveTool = "select" | "move" | "hand" | "grid";
type ImageMeta = { width: number; height: number };
type FaceEditorStateSnapshot = {
  selection: FaceEditorEllipseBox | null;
  layers: FaceEditorLayer[];
  selectedLayerId: string;
  activeTool: ActiveTool;
  zoom: number;
};

type DialogProps = {
  dataUrl: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: CanvasSeedance2FaceEditPayload) => Promise<void> | void;
};

type WheelZoomFocus = {
  clientX: number;
  clientY: number;
  imageRatioX: number;
  imageRatioY: number;
};

type DragStateBase = {
  pointerId: number;
  captureTarget: Element;
  start: { x: number; y: number };
  box: FaceEditorEllipseBox;
};

type ViewportPanDragState = {
  type: "viewport-pan";
  pointerId: number;
  captureTarget: Element;
  start: { x: number; y: number };
  scrollLeft: number;
  scrollTop: number;
};

type DragState =
  | ViewportPanDragState
  | (DragStateBase & { type: "selection-move" })
  | (DragStateBase & {
      type: "selection-resize";
      handle: FaceEditorResizeHandle;
    })
  | (DragStateBase & {
      type: "layer-move";
      layerId: string;
    })
  | (DragStateBase & {
      type: "layer-resize";
      layerId: string;
      handle: FaceEditorResizeHandle;
    });

const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 5;
const MAX_ZOOM = 160;
const FACE_EDITOR_VIEWPORT_CHROME = 88;
const FACE_EDITOR_WORKSPACE_FRAME = 40;
const MIN_BOX_SIZE = 24;
const resizeHandles: FaceEditorResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const layerResizeHandleDirections: Record<FaceEditorResizeHandle, { x: number; y: number }> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

function rotateDeltaForBox(delta: { dx: number; dy: number }, rotation: number) {
  const radians = (-rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    dx: delta.dx * cos - delta.dy * sin,
    dy: delta.dx * sin + delta.dy * cos,
  };
}

function calculateFaceEditorFitZoom(imageSize: ImageMeta, viewport: { width: number; height: number }): number {
  const availableWidth = Math.max(1, viewport.width - FACE_EDITOR_VIEWPORT_CHROME);
  const availableHeight = Math.max(1, viewport.height - FACE_EDITOR_VIEWPORT_CHROME);
  const fitScale = Math.min(1, availableWidth / imageSize.width, availableHeight / imageSize.height);
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(fitScale * 100)));
}

function normalizeLayerRotation(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric > 180 || numeric < -180) {
    return ((((numeric + 180) % 360) + 360) % 360) - 180;
  }
  return Math.round(numeric * 100) / 100;
}

function normalizeLayerBox(box: FaceEditorEllipseBox): FaceEditorEllipseBox {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.max(MIN_BOX_SIZE, Math.round(box.width)),
    height: Math.max(MIN_BOX_SIZE, Math.round(box.height)),
    rotation: normalizeLayerRotation(box.rotation),
  };
}

function cloneFaceEditorLayer(layer: FaceEditorLayer): FaceEditorLayer {
  return layer.kind === "face"
    ? { ...layer, sourceSelection: { ...layer.sourceSelection } }
    : { ...layer };
}

function cloneFaceEditorSelection(selection: FaceEditorEllipseBox | null): FaceEditorEllipseBox | null {
  return selection ? { ...selection } : null;
}

function hasVisibleFaceLayerChange(layer: FaceEditorFaceLayer): boolean {
  const source = layer.sourceSelection;
  return (
    Math.abs(layer.x - source.x) > 0.5 ||
    Math.abs(layer.y - source.y) > 0.5 ||
    Math.abs(layer.width - source.width) > 0.5 ||
    Math.abs(layer.height - source.height) > 0.5 ||
    Math.abs(layer.rotation - source.rotation) > 0.1 ||
    Math.abs(layer.opacity - 1) > 0.001
  );
}

function cloneFaceEditorSnapshot(snapshot: FaceEditorStateSnapshot): FaceEditorStateSnapshot {
  return {
    selection: cloneFaceEditorSelection(snapshot.selection),
    layers: snapshot.layers.map((layer) => cloneFaceEditorLayer(layer)),
    selectedLayerId: snapshot.selectedLayerId,
    activeTool: snapshot.activeTool,
    zoom: snapshot.zoom,
  };
}

function moveLayerBox(box: FaceEditorEllipseBox, delta: { dx: number; dy: number }): FaceEditorEllipseBox {
  return normalizeLayerBox({ ...box, x: box.x + delta.dx, y: box.y + delta.dy });
}

function resizeLayerAxis(
  start: number,
  size: number,
  delta: number,
  direction: number,
): { start: number; size: number } {
  const end = start + size;
  if (direction > 0) {
    return { start, size: Math.max(MIN_BOX_SIZE, end + delta - start) };
  }
  if (direction < 0) {
    const nextStart = start + delta;
    const nextSize = end - nextStart;
    if (nextSize < MIN_BOX_SIZE) {
      return { start: end - MIN_BOX_SIZE, size: MIN_BOX_SIZE };
    }
    return { start: nextStart, size: nextSize };
  }
  return { start, size };
}

function resizeLayerBox(
  box: FaceEditorEllipseBox,
  handle: FaceEditorResizeHandle,
  delta: { dx: number; dy: number },
  lockCircle: boolean,
): FaceEditorEllipseBox {
  const direction = layerResizeHandleDirections[handle] || layerResizeHandleDirections.se;
  const horizontal = resizeLayerAxis(box.x, box.width, delta.dx, direction.x);
  const vertical = resizeLayerAxis(box.y, box.height, delta.dy, direction.y);

  if (lockCircle) {
    const hasHorizontalResize = direction.x !== 0;
    const hasVerticalResize = direction.y !== 0;
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    let requestedSize = Math.min(horizontal.size, vertical.size);
    if (hasHorizontalResize && !hasVerticalResize) {
      requestedSize = horizontal.size;
    } else if (!hasHorizontalResize && hasVerticalResize) {
      requestedSize = vertical.size;
    }
    const size = Math.max(MIN_BOX_SIZE, Math.round(requestedSize));
    return normalizeLayerBox({
      x: direction.x < 0 ? right - size : box.x,
      y: direction.y < 0 ? bottom - size : box.y,
      width: size,
      height: size,
      rotation: box.rotation,
    });
  }

  return normalizeLayerBox({
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.size,
    height: vertical.size,
    rotation: box.rotation,
  });
}

function readStrictImageMeta(dataUrl: string): Promise<ImageMeta> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      reject(new Error("Image failed to load"));
    };
    image.src = dataUrl;
  });
}

function isEditorShortcutModifier(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

function consumeEditorShortcutEvent(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function isEditorShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;
  const editableTarget = target.closest("[contenteditable]");
  return Boolean(editableTarget && (editableTarget as HTMLElement).isContentEditable);
}

function loadEditorImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    image.src = src;
  });
}

function drawEllipsePath(context: CanvasRenderingContext2D, box: FaceEditorEllipseBox): void {
  context.beginPath();
  context.ellipse(
    box.x + box.width / 2,
    box.y + box.height / 2,
    Math.max(1, box.width / 2),
    Math.max(1, box.height / 2),
    (box.rotation * Math.PI) / 180,
    0,
    Math.PI * 2,
  );
}

function drawWhiteFill(context: CanvasRenderingContext2D, selection: FaceEditorEllipseBox): void {
  context.save();
  drawEllipsePath(context, selection);
  context.fillStyle = "#fff";
  context.fill();
  context.restore();
}

function drawSourceSelectionPatch(source: HTMLImageElement, sourceSelection: FaceEditorEllipseBox): HTMLCanvasElement {
  const patchCanvas = document.createElement("canvas");
  patchCanvas.width = Math.max(1, Math.round(sourceSelection.width));
  patchCanvas.height = Math.max(1, Math.round(sourceSelection.height));
  const patchContext = patchCanvas.getContext("2d");
  if (!patchContext) throw new Error("无法创建脸部取样画布");
  patchContext.translate(patchCanvas.width / 2, patchCanvas.height / 2);
  patchContext.rotate(-(sourceSelection.rotation * Math.PI) / 180);
  patchContext.drawImage(
    source,
    -(sourceSelection.x + sourceSelection.width / 2),
    -(sourceSelection.y + sourceSelection.height / 2),
  );
  return patchCanvas;
}

function drawFaceLayer(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement,
  layer: FaceEditorFaceLayer,
): void {
  const sourcePatch = drawSourceSelectionPatch(source, layer.sourceSelection);
  context.save();
  drawEllipsePath(context, layer);
  context.clip();
  context.globalAlpha = layer.opacity;
  context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  context.rotate((layer.rotation * Math.PI) / 180);
  context.drawImage(sourcePatch, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  context.restore();
}

function drawGridLayer(context: CanvasRenderingContext2D, layer: FaceEditorGridLayer): void {
  const plan = createGridLinePlan(layer, layer.spacing);
  context.save();
  drawEllipsePath(context, layer);
  context.clip();
  context.globalAlpha = layer.opacity;
  context.strokeStyle = layer.color;
  context.lineWidth = layer.strokeWidth;
  context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  context.rotate((layer.rotation * Math.PI) / 180);
  const span = Math.max(layer.width, layer.height) * 2;
  for (const line of plan.diagonals) {
    context.beginPath();
    if (line.direction === "down") {
      context.moveTo(-span, line.offset - span);
      context.lineTo(span, line.offset + span);
    } else {
      context.moveTo(-span, line.offset + span);
      context.lineTo(span, line.offset - span);
    }
    context.stroke();
  }
  context.restore();
}

function exportCanvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL("image/png");
  } catch (error) {
    const isSecurityError =
      (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "SecurityError") ||
      (error instanceof Error && error.name === "SecurityError");
    if (isSecurityError) {
      throw new Error("图片跨域，无法导出；请先上传或使用本地图片");
    }
    throw error;
  }
}

async function composeSeedance2FaceEditImage({
  sourceDataUrl,
  imageSize,
  faceLayers,
  gridLayers,
}: {
  sourceDataUrl: string;
  imageSize: ImageMeta;
  faceLayers: FaceEditorFaceLayer[];
  gridLayers: FaceEditorGridLayer[];
}): Promise<string> {
  const source = await loadEditorImage(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = imageSize.width;
  canvas.height = imageSize.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建合成画布");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  faceLayers.forEach((layer) => drawWhiteFill(context, layer.sourceSelection));
  faceLayers.forEach((layer) => drawFaceLayer(context, source, layer));
  gridLayers.forEach((layer) => drawGridLayer(context, layer));
  return exportCanvasToPngDataUrl(canvas);
}

export function CanvasNodeSeedance2FaceEditDialog({
  dataUrl,
  open,
  onClose,
  onConfirm,
}: DialogProps) {
  const modalOpen = open && Boolean(dataUrl);

  return (
    <Modal
      title={null}
      open={modalOpen}
      onCancel={onClose}
      footer={null}
      centered
      destroyOnHidden
      maskClosable={false}
      keyboard={false}
      closable={false}
      width={FACE_EDITOR_MODAL_WIDTH}
      styles={{
        container: { padding: 0, background: "transparent", boxShadow: "none" },
        body: { height: FACE_EDITOR_MODAL_HEIGHT, padding: 0, overflow: "hidden" },
      }}
    >
      {modalOpen ? (
        <Seedance2FaceEditDialogInner
          key={dataUrl}
          dataUrl={dataUrl}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  );
}

function Seedance2FaceEditDialogInner({
  dataUrl,
  onClose,
  onConfirm,
}: Omit<DialogProps, "open">) {
  const { message } = App.useApp();
  const viewportRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const undoSnapshotRef = useRef<FaceEditorStateSnapshot | null>(null);
  const initialFitAppliedRef = useRef(false);
  const previousWorkspaceSizeRef = useRef<{ width: number; height: number } | null>(null);
  const wheelZoomFocusRef = useRef<WheelZoomFocus | null>(null);
  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(() => null);
  const [selection, setSelection] = useState<FaceEditorEllipseBox | null>(() => null);
  const [layers, setLayers] = useState<FaceEditorLayer[]>(() => []);
  const [selectedLayerId, setSelectedLayerId] = useState(() => "");
  const [activeTool, setActiveTool] = useState<ActiveTool>(() => "select");
  const [isCtrlPanning, setIsCtrlPanning] = useState(false);
  const [zoom, setZoom] = useState(() => DEFAULT_ZOOM);
  const [fitZoom, setFitZoom] = useState(() => DEFAULT_ZOOM);
  const [error, setError] = useState(() => "");
  const [previewDataUrl, setPreviewDataUrl] = useState(() => "");
  const [isSaving, setIsSaving] = useState(false);
  const [hasUndoSnapshot, setHasUndoSnapshot] = useState(false);


  const captureUndoSnapshot = useCallback(() => {
    if (!imageMeta) return;
    undoSnapshotRef.current = cloneFaceEditorSnapshot({
      selection,
      layers,
      selectedLayerId,
      activeTool,
      zoom,
    });
    setHasUndoSnapshot(true);
  }, [activeTool, imageMeta, layers, selectedLayerId, selection, zoom]);

  const restoreUndoSnapshot = useCallback(() => {
    const snapshot = undoSnapshotRef.current;
    if (!snapshot) return;
    undoSnapshotRef.current = null;
    setHasUndoSnapshot(false);
    setSelection(cloneFaceEditorSelection(snapshot.selection));
    setLayers(snapshot.layers.map((layer) => cloneFaceEditorLayer(layer)));
    setSelectedLayerId(snapshot.selectedLayerId);
    setActiveTool(snapshot.activeTool);
    setZoom(snapshot.zoom);
    setError("");
  }, []);

  useEffect(() => {
    let active = true;
    undoSnapshotRef.current = null;
    initialFitAppliedRef.current = false;
    previousWorkspaceSizeRef.current = null;
    setHasUndoSnapshot(false);

    void readStrictImageMeta(dataUrl)
      .then((meta) => {
        if (!active) return;
        const nextMeta: ImageMeta = { width: meta.width, height: meta.height };
        setImageMeta(nextMeta);
        setSelection(createDefaultFaceSelection(nextMeta));
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setImageMeta(null);
        setSelection(null);
        setLayers([]);
        setSelectedLayerId("");
        setActiveTool("select");
        setPreviewDataUrl("");
        setError("读取图片尺寸失败，请重新选择图片");
      });

    return () => {
      active = false;
      dragRef.current = null;
    };
  }, [dataUrl]);

  useLayoutEffect(() => {
    if (!imageMeta) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateFitZoom = () => {
      if (viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return;
      const nextFitZoom = calculateFaceEditorFitZoom(imageMeta, {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
      setFitZoom(nextFitZoom);
      if (!initialFitAppliedRef.current) {
        initialFitAppliedRef.current = true;
        setZoom(nextFitZoom);
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
      }
    };

    updateFitZoom();
    const observer = new ResizeObserver(updateFitZoom);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [imageMeta]);

  useEffect(() => {
    if (!imageMeta) {
      return;
    }

    let active = true;
    const faceLayers = layers.filter((layer): layer is FaceEditorFaceLayer => layer.kind === "face");
    const gridLayers = layers.filter((layer): layer is FaceEditorGridLayer => layer.kind === "grid");
    void composeSeedance2FaceEditImage({
      sourceDataUrl: dataUrl,
      imageSize: imageMeta,
      faceLayers,
      gridLayers,
    })
      .then((nextPreviewDataUrl) => {
        if (!active) return;
        setPreviewDataUrl(nextPreviewDataUrl);
      })
      .catch(() => {
        if (!active) return;
        setPreviewDataUrl("");
      });

    return () => {
      active = false;
    };
  }, [dataUrl, imageMeta, layers]);

  const imageSize = imageMeta ? { width: imageMeta.width, height: imageMeta.height } : null;
  const handToolActive = activeTool === "hand" || isCtrlPanning;
  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.id === selectedLayerId) || null,
    [layers, selectedLayerId],
  );
  const selectedFaceLayer = selectedLayer?.kind === "face" ? selectedLayer : null;
  const selectedGridLayer = selectedLayer?.kind === "grid" ? selectedLayer : null;
  const scale = useMemo(() => zoom / 100, [zoom]);
  const workspaceSize = useMemo(
    () =>
      imageMeta
        ? {
            width: Math.max(1, Math.round(imageMeta.width * scale)),
            height: Math.max(1, Math.round(imageMeta.height * scale)),
          }
        : null,
    [imageMeta, scale],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !workspaceSize) {
      previousWorkspaceSizeRef.current = workspaceSize;
      return;
    }

    const previous = previousWorkspaceSizeRef.current;
    previousWorkspaceSizeRef.current = workspaceSize;
    if (!previous) return;

    const wheelFocus = wheelZoomFocusRef.current;
    if (wheelFocus) {
      wheelZoomFocusRef.current = null;
      const workspaceRect = workspaceRef.current?.getBoundingClientRect();
      if (workspaceRect) {
        const focusedClientX = workspaceRect.left + workspaceRect.width * wheelFocus.imageRatioX;
        const focusedClientY = workspaceRect.top + workspaceRect.height * wheelFocus.imageRatioY;
        viewport.scrollLeft += focusedClientX - wheelFocus.clientX;
        viewport.scrollTop += focusedClientY - wheelFocus.clientY;
        return;
      }
    }

    const previousWidth = previous.width + FACE_EDITOR_WORKSPACE_FRAME;
    const previousHeight = previous.height + FACE_EDITOR_WORKSPACE_FRAME;
    const nextWidth = workspaceSize.width + FACE_EDITOR_WORKSPACE_FRAME;
    const nextHeight = workspaceSize.height + FACE_EDITOR_WORKSPACE_FRAME;
    const centerRatioX = previousWidth <= viewport.clientWidth
      ? 0.5
      : (viewport.scrollLeft + viewport.clientWidth / 2) / previousWidth;
    const centerRatioY = previousHeight <= viewport.clientHeight
      ? 0.5
      : (viewport.scrollTop + viewport.clientHeight / 2) / previousHeight;

    viewport.scrollLeft = Math.max(0, centerRatioX * nextWidth - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, centerRatioY * nextHeight - viewport.clientHeight / 2);
  }, [workspaceSize]);

  const createFaceLayer = () => {
    if (!selection) return;
    captureUndoSnapshot();
    const layer = createFaceLayerFromSelection(createLayerId("face"), selection);
    setLayers((current) => [...current, layer]);
    setSelectedLayerId(layer.id);
    setActiveTool("move");
    setError("");
  };

  const activateMoveTool = () => {
    if (selectedFaceLayer) {
      setActiveTool("move");
      setError("");
      return;
    }

    const existingFaceLayer = [...layers].reverse().find(
      (layer): layer is FaceEditorFaceLayer => layer.kind === "face",
    );
    if (existingFaceLayer) {
      setSelectedLayerId(existingFaceLayer.id);
      setActiveTool("move");
      setError("");
      return;
    }

    if (selection) {
      createFaceLayer();
      return;
    }

    setActiveTool("move");
  };

  const createGridLayer = () => {
    const basis = selectedFaceLayer || selection;
    if (!basis) return;
    captureUndoSnapshot();
    const layer = createDefaultFaceGridLayer(createLayerId("grid"), basis);
    setLayers((current) => [...current, layer]);
    setSelectedLayerId(layer.id);
    setActiveTool("grid");
    setError("");
  };

  useEffect(() => {
    const handleModifierKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") setIsCtrlPanning(true);
    };
    const handleModifierKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") setIsCtrlPanning(false);
    };
    const clearModifierState = () => setIsCtrlPanning(false);

    window.addEventListener("keydown", handleModifierKeyDown, true);
    window.addEventListener("keyup", handleModifierKeyUp, true);
    window.addEventListener("blur", clearModifierState);
    return () => {
      window.removeEventListener("keydown", handleModifierKeyDown, true);
      window.removeEventListener("keyup", handleModifierKeyUp, true);
      window.removeEventListener("blur", clearModifierState);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isEditorShortcutModifier(event)) return;

      const key = event.key.toLowerCase();
      if (key !== "x" && key !== "v" && key !== "z") return;

      if (isEditorShortcutTarget(event.target)) return;

      consumeEditorShortcutEvent(event);

      if (key === "x") {
        createFaceLayer();
        return;
      }

      if (key === "v") {
        createGridLayer();
        return;
      }

      restoreUndoSnapshot();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [createFaceLayer, createGridLayer, restoreUndoSnapshot]);

  const resetEditor = () => {
    if (!imageMeta) return;
    captureUndoSnapshot();
    setSelection(createDefaultFaceSelection(imageMeta));
    setLayers([]);
    setSelectedLayerId("");
    setActiveTool("select");
    setZoom(fitZoom);
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
    setError("");
  };

  const exportImage = async () => {
    if (isSaving || !imageMeta) return;
    const faceLayers = layers.filter((layer): layer is FaceEditorFaceLayer => layer.kind === "face");
    const gridLayers = layers.filter((layer): layer is FaceEditorGridLayer => layer.kind === "grid");
    if (faceLayers.length === 0 && gridLayers.length === 0) {
      const warning = "尚未创建脸部迁移层，请点击“移动”并拖动脸部后再保存";
      setError(warning);
      message.warning(warning);
      return;
    }
    if (gridLayers.length === 0 && !faceLayers.some(hasVisibleFaceLayerChange)) {
      const warning = "脸部层仍与原选区重合，请先拖动青色脸部层到目标位置";
      setError(warning);
      message.warning(warning);
      return;
    }
    setIsSaving(true);
    try {
      const editedDataUrl = await composeSeedance2FaceEditImage({
        sourceDataUrl: dataUrl,
        imageSize: imageMeta,
        faceLayers,
        gridLayers,
      });
      await onConfirm({ dataUrl: editedDataUrl });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "合成失败";
      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const normalizeLayerPatch = <Layer extends FaceEditorLayer>(layer: Layer, patch: Partial<Layer>): Layer => {
    const merged = { ...layer, ...patch, id: layer.id, kind: layer.kind } as Layer;
    return { ...merged, ...normalizeLayerBox(merged) } as Layer;
  };

  const updateFaceLayerById = (id: string, patch: Partial<FaceEditorFaceLayer>) => {
    setLayers((current) =>
      current.map((layer) => (layer.id === id && layer.kind === "face" ? normalizeLayerPatch(layer, patch) : layer)),
    );
  };

  const updateFaceLayer = (patch: Partial<FaceEditorFaceLayer>) => {
    if (!selectedFaceLayer) return;
    updateFaceLayerById(selectedFaceLayer.id, patch);
  };

  const updateSelectedFaceLayer = (patch: Partial<FaceEditorFaceLayer>) => {
    updateFaceLayer(patch);
  };

  const updateGridLayerById = (id: string, patch: Partial<FaceEditorGridLayer>) => {
    setLayers((current) =>
      current.map((layer) => (layer.id === id && layer.kind === "grid" ? normalizeLayerPatch(layer, patch) : layer)),
    );
  };

  const updateLayerBoxById = (id: string, box: FaceEditorEllipseBox) => {
    const layer = layers.find((item) => item.id === id);
    if (layer?.kind === "face") {
      updateFaceLayerById(id, box);
      return;
    }
    if (layer?.kind === "grid") {
      updateGridLayerById(id, box);
    }
  };

  const layerBoxById = (id: string): FaceEditorEllipseBox | null => {
    const layer = layers.find((item) => item.id === id);
    return layer
      ? {
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          rotation: layer.rotation,
        }
      : null;
  };

  const updateSelection = (patch: Partial<FaceEditorEllipseBox>) => {
    if (!selection || !imageSize) return;
    setSelection(clampEllipseBox({ ...selection, ...patch }, imageSize));
  };

  const handleViewportWheel = useCallback((event: WheelEvent) => {
    if (!imageMeta || !workspaceSize || event.deltaY === 0) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + (event.deltaY < 0 ? 5 : -5)));
    event.preventDefault();
    event.stopPropagation();
    if (nextZoom === zoom) return;

    const workspaceRect = workspace.getBoundingClientRect();
    const pointerInsideImage =
      event.clientX >= workspaceRect.left &&
      event.clientX <= workspaceRect.right &&
      event.clientY >= workspaceRect.top &&
      event.clientY <= workspaceRect.bottom;
    wheelZoomFocusRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      imageRatioX: pointerInsideImage
        ? (event.clientX - workspaceRect.left) / Math.max(1, workspaceRect.width)
        : 0.5,
      imageRatioY: pointerInsideImage
        ? (event.clientY - workspaceRect.top) / Math.max(1, workspaceRect.height)
        : 0.5,
    };
    setZoom(nextZoom);
  }, [imageMeta, workspaceSize, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleViewportWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleViewportWheel);
  }, [handleViewportWheel]);

  const startViewportPan = (event: ReactPointerEvent<HTMLElement>) => {
    if ((!handToolActive && !event.ctrlKey) || event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    event.stopPropagation();
    const captureTarget = event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "viewport-pan",
      pointerId: event.pointerId,
      captureTarget,
      start: { x: event.clientX, y: event.clientY },
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  };

  const startSelectionDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (handToolActive || event.ctrlKey || !selection) return;
    captureUndoSnapshot();
    event.preventDefault();
    event.stopPropagation();
    const point = readWorkspacePoint(event.clientX, event.clientY);
    const captureTarget = event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "selection-move",
      pointerId: event.pointerId,
      captureTarget,
      start: point,
      box: { ...selection },
    };
    setSelectedLayerId("");
    setActiveTool("select");
    setError("");
  };

  const startLayerDrag = (event: ReactPointerEvent<HTMLDivElement>, layer: FaceEditorLayer) => {
    if (handToolActive || event.ctrlKey) return;
    captureUndoSnapshot();
    event.preventDefault();
    event.stopPropagation();
    const point = readWorkspacePoint(event.clientX, event.clientY);
    const captureTarget = event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      type: "layer-move",
      pointerId: event.pointerId,
      captureTarget,
      layerId: layer.id,
      start: point,
      box: layerBoxById(layer.id) || {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
      },
    };
    setSelectedLayerId(layer.id);
    setActiveTool(layer.kind === "grid" ? "grid" : "move");
    setError("");
  };

  const startResizeDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    handle: FaceEditorResizeHandle,
    target: "selection" | "layer",
    box: FaceEditorEllipseBox,
    layerId?: string,
  ) => {
    if (handToolActive || event.ctrlKey) return;
    captureUndoSnapshot();
    event.preventDefault();
    event.stopPropagation();
    const point = readWorkspacePoint(event.clientX, event.clientY);
    if (target === "selection") {
      setSelectedLayerId("");
      setActiveTool("select");
    }
    const captureTarget = event.currentTarget;
    const nextDrag: DragState | null =
      target === "selection"
        ? {
            type: "selection-resize",
            pointerId: event.pointerId,
            captureTarget,
            handle,
            start: point,
            box: { ...box },
          }
        : layerId
          ? {
              type: "layer-resize",
              pointerId: event.pointerId,
              captureTarget,
              layerId,
              handle,
              start: point,
              box: { ...box },
            }
          : null;
    if (!nextDrag) return;
    captureTarget.setPointerCapture(event.pointerId);
    dragRef.current = nextDrag;
    if (layerId) {
      const layer = layers.find((item) => item.id === layerId);
      setSelectedLayerId(layerId);
      setActiveTool(layer?.kind === "grid" ? "grid" : "move");
    }
    setError("");
  };

  const handlePointerMove = (event: ReactPointerEvent<Element>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    if (drag.type === "viewport-pan") {
      event.stopPropagation();
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = drag.scrollLeft - (event.clientX - drag.start.x);
      viewport.scrollTop = drag.scrollTop - (event.clientY - drag.start.y);
      return;
    }
    if (!imageSize) return;
    const point = readWorkspacePoint(event.clientX, event.clientY);
    const delta = { dx: point.x - drag.start.x, dy: point.y - drag.start.y };

    if (drag.type === "selection-move") {
      setSelection(moveEllipseBox(drag.box, delta, imageSize));
      return;
    }
    if (drag.type === "selection-resize") {
      setSelection(
        resizeEllipseBox(drag.box, drag.handle, rotateDeltaForBox(delta, drag.box.rotation), imageSize, event.shiftKey),
      );
      return;
    }
    if (drag.type === "layer-move") {
      updateLayerBoxById(drag.layerId, moveLayerBox(drag.box, delta));
      return;
    }
    updateLayerBoxById(
      drag.layerId,
      resizeLayerBox(drag.box, drag.handle, rotateDeltaForBox(delta, drag.box.rotation), event.shiftKey),
    );
  };

  const stopPointerDrag = (event: ReactPointerEvent<Element>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.type === "viewport-pan") {
      event.stopPropagation();
    }
    dragRef.current = null;
    if (drag.captureTarget.hasPointerCapture(event.pointerId)) {
      drag.captureTarget.releasePointerCapture(event.pointerId);
    }
  };

  const readWorkspacePoint = (clientX: number, clientY: number) => {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect || !imageMeta) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / Math.max(0.001, rect.width)) * imageMeta.width,
      y: ((clientY - rect.top) / Math.max(0.001, rect.height)) * imageMeta.height,
    };
  };

  const imageLabel = imageMeta ? `${imageMeta.width} × ${imageMeta.height}px` : "读取图片尺寸中";

  return (
    <div
      ref={editorRef}
      tabIndex={-1}
      className="relative grid h-full grid-rows-[64px_minmax(0,1fr)_68px] overflow-hidden rounded-xl bg-[#111318] text-slate-100 shadow-2xl"
    >
        <button
          type="button"
          aria-label="关闭人脸迁移编辑器，不保存"
          title="关闭，不保存"
          disabled={isSaving}
          className="absolute right-4 top-4 z-20 grid size-8 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleClose}
        >
          <X className="size-5" />
        </button>
        <header className="grid grid-cols-[76px_minmax(0,1fr)_340px] border-b border-white/10 bg-[#171a21]">
          <div className="border-r border-white/10" />
          <div className="flex min-w-0 items-center px-5">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-wide">Seedance2 人脸迁移</h2>
              <div className="mt-0.5 text-xs text-slate-400">PS-style face editor shell · {imageLabel}</div>
            </div>
          </div>
          <div className="border-l border-white/10 px-4 py-3 pr-14 text-sm text-slate-300">属性面板</div>
        </header>

        <main className="grid min-h-0 grid-cols-[76px_minmax(0,1fr)_340px]">
          <aside className="flex flex-col items-center gap-2 border-r border-white/10 bg-[#151820] px-2 py-4">
            <ToolButton active={activeTool === "select"} icon={<Circle className="size-4" />} onClick={() => setActiveTool("select")}>
              椭圆选择
            </ToolButton>
            <ToolButton active={activeTool === "move"} icon={<Move className="size-4" />} onClick={activateMoveTool}>
              移动
            </ToolButton>
            <ToolButton active={activeTool === "hand"} icon={<Hand className="size-4" />} onClick={() => setActiveTool("hand")}>
              抓手
            </ToolButton>
            <ToolButton active={activeTool === "grid"} icon={<Grid3X3 className="size-4" />} onClick={() => setActiveTool("grid")}>
              网格
            </ToolButton>
            <div className="my-2 h-px w-10 bg-white/10" />
            <ToolButton icon={<RotateCcw className="size-4" />} onClick={resetEditor}>
              重置
            </ToolButton>
            <ToolButton icon={<Undo2 className="size-4" />} onClick={restoreUndoSnapshot} disabled={!hasUndoSnapshot}>
              回退一步
            </ToolButton>
          </aside>

          <section
            ref={viewportRef}
            className="min-h-0 overflow-auto bg-[#0d0f14] p-6"
            onPointerDownCapture={startViewportPan}
            onPointerMoveCapture={handlePointerMove}
            onPointerUpCapture={stopPointerDrag}
            onPointerCancelCapture={stopPointerDrag}
            onLostPointerCapture={stopPointerDrag}
          >
            <div
              className="flex min-h-full min-w-full items-center justify-center"
              style={
                workspaceSize
                  ? {
                      width: workspaceSize.width + FACE_EDITOR_WORKSPACE_FRAME,
                      height: workspaceSize.height + FACE_EDITOR_WORKSPACE_FRAME,
                    }
                  : undefined
              }
            >
              {imageMeta && workspaceSize ? (
                <div
                  className="rounded-2xl border border-white/10 bg-[#20242d] p-5 shadow-[0_18px_60px_rgba(0,0,0,.45)]"
                >
                  <div
                    ref={workspaceRef}
                    className={`relative touch-none overflow-hidden bg-black shadow-[0_0_0_1px_rgba(255,255,255,.08)] ${handToolActive ? "cursor-grab active:cursor-grabbing" : ""}`}
                    style={{ width: workspaceSize.width, height: workspaceSize.height }}
                  >
                    <img src={previewDataUrl || dataUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />
                    {layers
                      .filter((layer): layer is FaceEditorFaceLayer => layer.kind === "face")
                      .map((layer) => (
                        <FaceLayerSourceCutoutFill key={`source-${layer.id}`} box={layer.sourceSelection} scale={scale} />
                      ))}
                    {selection ? (
                      <EllipseOverlay
                        box={selection}
                        label="选区"
                        scale={scale}
                        tone="selection"
                        selected={activeTool === "select" && !selectedLayerId}
                        interactive={!handToolActive}
                        onPointerDown={startSelectionDrag}
                        onLostPointerCapture={stopPointerDrag}
                        onResize={(event, handle) => startResizeDrag(event, handle, "selection", selection)}
                      />
                    ) : null}
                    {layers.map((layer) =>
                      layer.kind === "face" ? (
                        <EllipseOverlay
                          key={layer.id}
                          box={layer}
                          label="脸部层"
                          scale={scale}
                          tone="face"
                          selected={selectedLayerId === layer.id}
                          opacity={layer.opacity}
                          interactive={!handToolActive}
                          onPointerDown={(event) => startLayerDrag(event, layer)}
                          onLostPointerCapture={stopPointerDrag}
                          onResize={(event, handle) => startResizeDrag(event, handle, "layer", layer, layer.id)}
                        >
                          <FaceLayerPreview sourceDataUrl={dataUrl} layer={layer} scale={scale} imageSize={imageMeta} />
                        </EllipseOverlay>
                      ) : (
                        <EllipseOverlay
                          key={layer.id}
                          box={layer}
                          label="网格"
                          scale={scale}
                          tone="grid"
                          selected={selectedLayerId === layer.id}
                          opacity={layer.opacity}
                          interactive={!handToolActive}
                          onPointerDown={(event) => startLayerDrag(event, layer)}
                          onLostPointerCapture={stopPointerDrag}
                          onResize={(event, handle) => startResizeDrag(event, handle, "layer", layer, layer.id)}
                        >
                          <div className="pointer-events-none absolute inset-0 rounded-[inherit]" style={gridOverlayStyle(layer, scale)} />
                        </EllipseOverlay>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-56 w-full max-w-xl items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/30 px-6 text-center text-sm text-slate-400">
                  {error || "读取图片尺寸中"}
                </div>
              )}
            </div>
          </section>

          <aside className="min-h-0 overflow-auto border-l border-white/10 bg-[#171a21] p-4">
            <div className="space-y-5">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-200">图层</h3>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-slate-400">{layers.length} layers</span>
                </div>
                <div className="space-y-2">
                  <LayerButton label="椭圆选区" detail={selection ? `${Math.round(selection.width)} × ${Math.round(selection.height)}` : "未初始化"} active={!selectedLayerId} onClick={() => setSelectedLayerId("")} />
                  {layers.map((layer) => (
                    <LayerButton
                      key={layer.id}
                      label={layer.kind === "face" ? "脸部迁移层" : "圆/椭圆网格"}
                      detail={`${Math.round(layer.width)} × ${Math.round(layer.height)} · ${Math.round(layer.rotation)}°`}
                      active={selectedLayerId === layer.id}
                      onClick={() => setSelectedLayerId(layer.id)}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Button block onClick={createFaceLayer}>
                    创建脸部层
                  </Button>
                  <Button block onClick={createGridLayer}>
                    + 新增圆/椭圆网格
                  </Button>
                </div>
                <p className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-xs leading-5 text-slate-400">
                  快捷键：Ctrl/Cmd + X 创建脸部层；Ctrl/Cmd + V 新增圆/椭圆网格
                </p>
              </section>

              <section className="rounded-xl border border-white/10 bg-black/20 p-3">
                <ControlRow label="缩放" value={`${zoom}%`}>
                  <Slider min={MIN_ZOOM} max={MAX_ZOOM} step={1} value={zoom} onFocus={captureUndoSnapshot} onChange={setZoom} />
                </ControlRow>
              </section>
              {selectedFaceLayer ? (
                <section className="space-y-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
                  <h3 className="text-sm font-semibold text-cyan-100">脸部层尺寸</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <ControlRow label="宽" value={`${Math.round(selectedFaceLayer.width)}px`}>
                      <InputNumber
                        className="w-full"
                        min={MIN_BOX_SIZE}
                        value={Math.round(selectedFaceLayer.width)}
                        onFocus={captureUndoSnapshot}
                        onChange={(value) => updateSelectedFaceLayer({ width: toNumber(value, selectedFaceLayer.width) })}
                      />
                    </ControlRow>
                    <ControlRow label="高" value={`${Math.round(selectedFaceLayer.height)}px`}>
                      <InputNumber
                        className="w-full"
                        min={MIN_BOX_SIZE}
                        value={Math.round(selectedFaceLayer.height)}
                        onFocus={captureUndoSnapshot}
                        onChange={(value) => updateSelectedFaceLayer({ height: toNumber(value, selectedFaceLayer.height) })}
                      />
                    </ControlRow>
                  </div>
                  <ControlRow label="旋转" value={`${Math.round(selectedFaceLayer.rotation)}°`}>
                    <Slider
                      min={-180}
                      max={180}
                      value={Math.round(selectedFaceLayer.rotation)}
                      onFocus={captureUndoSnapshot}
                      onChange={(rotation) => updateSelectedFaceLayer({ rotation })}
                    />
                  </ControlRow>
                </section>
              ) : null}

              {selectedGridLayer ? (
                <section className="space-y-3 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3">
                  <h3 className="text-sm font-semibold text-rose-100">网格控制</h3>
                  <ControlRow label="间距" value={`${Math.round(selectedGridLayer.spacing)}px`}>
                    <Slider
                      min={6}
                      max={120}
                      value={Math.round(selectedGridLayer.spacing)}
                      onFocus={captureUndoSnapshot}
                      onChange={(spacing) => updateGridLayerById(selectedGridLayer.id, { spacing })}
                    />
                  </ControlRow>
                  <ControlRow label="透明度" value={`${Math.round(selectedGridLayer.opacity * 100)}%`}>
                    <Slider
                      min={10}
                      max={100}
                      value={Math.round(selectedGridLayer.opacity * 100)}
                      onFocus={captureUndoSnapshot}
                      onChange={(opacity) => updateGridLayerById(selectedGridLayer.id, { opacity: opacity / 100 })}
                    />
                  </ControlRow>
                  <ControlRow label="旋转" value={`${Math.round(selectedGridLayer.rotation)}°`}>
                    <Slider
                      min={-180}
                      max={180}
                      value={Math.round(selectedGridLayer.rotation)}
                      onFocus={captureUndoSnapshot}
                      onChange={(rotation) => updateGridLayerById(selectedGridLayer.id, { rotation })}
                    />
                  </ControlRow>
                  <div className="grid grid-cols-2 gap-2">
                    <ControlRow label="网格宽" value={`${Math.round(selectedGridLayer.width)}px`}>
                      <InputNumber
                        className="w-full"
                        min={MIN_BOX_SIZE}
                        value={Math.round(selectedGridLayer.width)}
                        onFocus={captureUndoSnapshot}
                        onChange={(value) =>
                          updateGridLayerById(selectedGridLayer.id, { width: toNumber(value, selectedGridLayer.width) })
                        }
                      />
                    </ControlRow>
                    <ControlRow label="网格高" value={`${Math.round(selectedGridLayer.height)}px`}>
                      <InputNumber
                        className="w-full"
                        min={MIN_BOX_SIZE}
                        value={Math.round(selectedGridLayer.height)}
                        onFocus={captureUndoSnapshot}
                        onChange={(value) =>
                          updateGridLayerById(selectedGridLayer.id, { height: toNumber(value, selectedGridLayer.height) })
                        }
                      />
                    </ControlRow>
                  </div>
                </section>
              ) : null}

              {!selectedLayerId && selection ? (
                <section className="space-y-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                  <h3 className="text-sm font-semibold text-emerald-100">Selection</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <ControlRow label="Width" value={`${Math.round(selection.width)}px`}>
                      <InputNumber
                        className="w-full"
                        min={MIN_BOX_SIZE}
                        value={Math.round(selection.width)}
                        onFocus={captureUndoSnapshot}
                        onChange={(value) => updateSelection({ width: toNumber(value, selection.width) })}
                      />
                    </ControlRow>
                    <ControlRow label="Height" value={`${Math.round(selection.height)}px`}>
                      <InputNumber
                        className="w-full"
                        min={MIN_BOX_SIZE}
                        value={Math.round(selection.height)}
                        onFocus={captureUndoSnapshot}
                        onChange={(value) => updateSelection({ height: toNumber(value, selection.height) })}
                      />
                    </ControlRow>
                  </div>
                  <ControlRow label="Rotation" value={`${Math.round(selection.rotation)}°`}>
                    <Slider
                      min={-180}
                      max={180}
                      value={Math.round(selection.rotation)}
                      onFocus={captureUndoSnapshot}
                      onChange={(rotation) => updateSelection({ rotation })}
                    />
                  </ControlRow>
                </section>
              ) : null}
            </div>
          </aside>
        </main>

        <footer className="grid grid-cols-[76px_minmax(0,1fr)_340px] border-t border-white/10 bg-[#171a21]">
          <div className="border-r border-white/10" />
            <div className="flex min-w-0 items-center px-5 text-sm text-slate-400">快捷键：Ctrl/Cmd + X / V；Ctrl/Cmd + Z 回退上一步（仅本窗口）；按住 Ctrl 可临时使用抓手拖动；滚轮缩放图片；抓手可拖动放大后的图片；点击窗口外、按 Esc 都不会关闭。</div>
          <div className="flex items-center justify-end border-l border-white/10 px-4">
            <Button
              type="primary"
              icon={<Save className="size-4" />}
              onClick={exportImage}
              loading={isSaving}
              disabled={isSaving || !imageMeta}
            >
              确认保存并替换原图
            </Button>
          </div>
        </footer>
    </div>
  );
}

function ToolButton({
  active,
  icon,
  children,
  onClick,
  disabled,
}: {
  active?: boolean;
  icon: import("react").ReactNode;
  children: import("react").ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex w-full flex-col items-center gap-1 rounded-lg border px-1.5 py-2 text-[11px] transition ${
        active
          ? "border-cyan-300/70 bg-cyan-400/15 text-cyan-100"
          : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/10 hover:text-slate-100"
      } ${disabled ? "cursor-not-allowed opacity-45 hover:border-transparent hover:bg-transparent hover:text-slate-400" : ""}`}
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
    >
      {icon}
      <span className="leading-tight">{children}</span>
    </button>
  );
}

function LayerButton({
  label,
  detail,
  active,
  onClick,
}: {
  label: string;
  detail: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
        active ? "border-[#2f80ff] bg-[#2f80ff]/15" : "border-white/10 bg-white/[.03] hover:bg-white/[.07]"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-100">{label}</span>
        <span className="block truncate text-xs text-slate-500">{detail}</span>
      </span>
      <span className={`h-2 w-2 rounded-full ${active ? "bg-[#2f80ff]" : "bg-slate-600"}`} />
    </button>
  );
}

function ControlRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: import("react").ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-slate-400">{label}</span>
        <span className="font-semibold text-slate-200">{value}</span>
      </div>
      {children}
    </div>
  );
}

function EllipseOverlay({
  box,
  label,
  scale,
  tone,
  selected,
  opacity = 1,
  interactive = true,
  onPointerDown,
  onLostPointerCapture,
  onResize,
  children,
}: {
  box: FaceEditorEllipseBox;
  label: string;
  scale: number;
  tone: "selection" | "face" | "grid";
  selected?: boolean;
  opacity?: number;
  interactive?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<Element>) => void;
  onResize: (event: ReactPointerEvent<HTMLButtonElement>, handle: FaceEditorResizeHandle) => void;
  children?: import("react").ReactNode;
}) {
  const toneClass =
    tone === "face"
      ? "border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,.2)]"
      : tone === "grid"
        ? "border-rose-300 bg-rose-400/5 shadow-[0_0_0_1px_rgba(251,113,133,.2)]"
        : "border-emerald-300 bg-emerald-400/5 shadow-[0_0_0_1px_rgba(110,231,183,.2)]";

  return (
    <div
      className={`absolute overflow-visible border-2 ${interactive ? "cursor-move" : "pointer-events-none"} ${toneClass} ${selected ? "ring-2 ring-white/80" : ""}`}
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: box.width * scale,
        height: box.height * scale,
        transform: `rotate(${box.rotation}deg)`,
        transformOrigin: "center",
        opacity,
        borderRadius: "50%",
      }}
      onPointerDown={onPointerDown}
      onLostPointerCapture={onLostPointerCapture}
    >
      {children}
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white shadow">
        {label}
      </span>
      {resizeHandles.map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={`调整${label}${handle}`}
          className="absolute z-20 size-3 rounded-full border border-slate-900 bg-white"
          style={resizeHandleStyle(handle)}
          onPointerDown={(event) => onResize(event, handle)}
          onLostPointerCapture={onLostPointerCapture}
        />
      ))}
    </div>
  );
}

function FaceLayerSourceCutoutFill({ box, scale }: { box: FaceEditorEllipseBox; scale: number }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: box.width * scale,
        height: box.height * scale,
        backgroundColor: "#fff",
        borderRadius: "50%",
        transform: `rotate(${box.rotation}deg)`,
        transformOrigin: "center",
        zIndex: 0,
      }}
    />
  );
}

function FaceLayerPreview({
  sourceDataUrl,
  layer,
  scale,
  imageSize,
}: {
  sourceDataUrl: string;
  layer: FaceEditorFaceLayer;
  scale: number;
  imageSize: ImageMeta;
}) {
  const sourceSelectionRotation = layer.sourceSelection.rotation || 0;
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{
        clipPath: "ellipse(50% 50% at 50% 50%)",
        opacity: layer.opacity,
        zIndex: 1,
      }}
    >
      <img
        src={sourceDataUrl}
        alt=""
        draggable={false}
        className="absolute left-0 top-0 max-w-none select-none object-fill"
        style={{
          width: imageSize.width * scale,
          height: imageSize.height * scale,
          transform: `translate(${-layer.sourceSelection.x * scale}px, ${-layer.sourceSelection.y * scale}px)`,
          transformOrigin: `${(layer.sourceSelection.x + layer.sourceSelection.width / 2) * scale}px ${(layer.sourceSelection.y + layer.sourceSelection.height / 2) * scale}px`,
          rotate: sourceSelectionRotation ? `${-sourceSelectionRotation}deg` : undefined,
        }}
      />
    </div>
  );
}

function resizeHandleStyle(handle: FaceEditorResizeHandle) {
  const top = handle.includes("n") ? "-6px" : handle.includes("s") ? "calc(100% - 6px)" : "calc(50% - 6px)";
  const left = handle.includes("w") ? "-6px" : handle.includes("e") ? "calc(100% - 6px)" : "calc(50% - 6px)";
  return { top, left, cursor: `${handle}-resize` };
}

function createLayerId(prefix: FaceEditorLayer["kind"]) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function gridOverlayStyle(layer: FaceEditorGridLayer, scale: number): import("react").CSSProperties {
  const spacing = Math.max(6, Math.round(layer.spacing * scale));
  const stroke = Math.max(1, Math.round(layer.strokeWidth * scale));
  return {
    backgroundImage: [
      `repeating-linear-gradient(45deg, transparent 0 ${Math.max(0, spacing - stroke)}px, ${layer.color} ${Math.max(0, spacing - stroke)}px ${spacing}px)`,
      `repeating-linear-gradient(-45deg, transparent 0 ${Math.max(0, spacing - stroke)}px, ${layer.color} ${Math.max(0, spacing - stroke)}px ${spacing}px)`,
    ].join(", "),
  };
}

function toNumber(value: number | string | null, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
