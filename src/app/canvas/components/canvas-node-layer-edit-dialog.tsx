"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Button, InputNumber, Modal, Slider, Switch } from "antd";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ImagePlus,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";

export type CanvasImageLayerEditPayload = {
  dataUrl: string;
};

type LayerItem = {
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  opacity: number;
  rotation: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  grayscale: number;
  visible: boolean;
  locked?: boolean;
};

type DragState =
  | {
      type: "move";
      id: string;
      startX: number;
      startY: number;
      layerX: number;
      layerY: number;
    }
  | {
      type: "resize";
      id: string;
      startX: number;
      startY: number;
      layerWidth: number;
      layerHeight: number;
    };

export function CanvasNodeLayerEditDialog({
  dataUrl,
  open,
  onClose,
  onConfirm,
}: {
  dataUrl: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: CanvasImageLayerEditPayload) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [canvasSize, setCanvasSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    setImageError("");
    setCanvasSize(null);
    setLayers([]);
    setSelectedLayerId("");
    void readImageMeta(dataUrl)
      .then((meta) => {
        if (!active) return;
        const baseLayer: LayerItem = {
          id: "base",
          name: "底图",
          src: dataUrl,
          x: 0,
          y: 0,
          width: meta.width,
          height: meta.height,
          naturalWidth: meta.width,
          naturalHeight: meta.height,
          opacity: 1,
          rotation: 0,
          brightness: 100,
          contrast: 100,
          saturation: 100,
          hue: 0,
          grayscale: 0,
          visible: true,
          locked: true,
        };
        setCanvasSize({ width: meta.width, height: meta.height });
        setLayers([baseLayer]);
        setSelectedLayerId(baseLayer.id);
      })
      .catch((error: unknown) => {
        if (active) setImageError(error instanceof Error ? error.message : "图片元数据读取失败，请确认图片内容有效后重试");
      });
    return () => {
      active = false;
    };
  }, [dataUrl, open]);

  const selectedLayer = useMemo(
    () =>
      layers.find((layer) => layer.id === selectedLayerId) || layers[0] || null,
    [layers, selectedLayerId],
  );
  const scale = useMemo(() => {
    if (!canvasSize) return 1;
    return Math.min(1, 620 / canvasSize.width, 620 / canvasSize.height);
  }, [canvasSize]);

  const updateLayer = (id: string, patch: Partial<LayerItem>) => {
    setLayers((current) =>
      current.map((layer) =>
        layer.id === id ? { ...layer, ...patch } : layer,
      ),
    );
  };

  const addFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/") || !canvasSize || imageError) return;
    try {
      const src = await readFileAsDataUrl(file);
      const meta = await readImageMeta(src);
      const maxWidth = canvasSize.width * 0.56;
      const maxHeight = canvasSize.height * 0.56;
      const ratio = Math.min(1, maxWidth / meta.width, maxHeight / meta.height);
      const width = meta.width * ratio;
      const height = meta.height * ratio;
      const layer: LayerItem = {
        id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name.replace(/\.[^.]+$/, "") || "图片层",
        src,
        x: (canvasSize.width - width) / 2,
        y: (canvasSize.height - height) / 2,
        width,
        height,
        naturalWidth: meta.width,
        naturalHeight: meta.height,
        opacity: 1,
        rotation: 0,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        hue: 0,
        grayscale: 0,
        visible: true,
      };
      setLayers((current) => [...current, layer]);
      setSelectedLayerId(layer.id);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "读取图片失败");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const moveLayer = (id: string, direction: -1 | 1) => {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length)
        return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const deleteLayer = (id: string) => {
    setLayers((current) => {
      const target = current.find((layer) => layer.id === id);
      if (!target || target.locked) return current;
      const next = current.filter((layer) => layer.id !== id);
      setSelectedLayerId(next[next.length - 1]?.id || "");
      return next;
    });
  };

  const startLayerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
    layer: LayerItem,
  ) => {
    if (layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedLayerId(layer.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = readPreviewPoint(event.clientX, event.clientY);
    dragRef.current = {
      type: "move",
      id: layer.id,
      startX: point.x,
      startY: point.y,
      layerX: layer.x,
      layerY: layer.y,
    };
  };

  const startLayerResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    layer: LayerItem,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedLayerId(layer.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = readPreviewPoint(event.clientX, event.clientY);
    dragRef.current = {
      type: "resize",
      id: layer.id,
      startX: point.x,
      startY: point.y,
      layerWidth: layer.width,
      layerHeight: layer.height,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    const point = readPreviewPoint(event.clientX, event.clientY);
    if (drag.type === "move") {
      updateLayer(drag.id, {
        x: drag.layerX + point.x - drag.startX,
        y: drag.layerY + point.y - drag.startY,
      });
      return;
    }
    const dx = point.x - drag.startX;
    const target = layers.find((layer) => layer.id === drag.id);
    const ratio = target ? target.height / Math.max(1, target.width) : 1;
    const width = Math.max(24, drag.layerWidth + dx);
    updateLayer(drag.id, { width, height: width * ratio });
  };

  const stopDrag = () => {
    dragRef.current = null;
  };

  const resetSelectedLayer = () => {
    if (!selectedLayer || !canvasSize) return;
    const ratio = Math.min(
      1,
      (canvasSize.width * 0.56) / selectedLayer.naturalWidth,
      (canvasSize.height * 0.56) / selectedLayer.naturalHeight,
    );
    const width = selectedLayer.naturalWidth * ratio;
    const height = selectedLayer.naturalHeight * ratio;
    updateLayer(selectedLayer.id, {
      x: (canvasSize.width - width) / 2,
      y: (canvasSize.height - height) / 2,
      width,
      height,
      opacity: 1,
      rotation: 0,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      grayscale: 0,
      visible: true,
    });
  };

  const exportImage = async () => {
    if (!canvasSize || imageError) return;
    try {
      const rendered = await renderLayersToDataUrl(canvasSize, layers);
      onConfirm({ dataUrl: rendered });
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    }
  };

  const readPreviewPoint = (clientX: number, clientY: number) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  };

  return (
    <Modal
      title={null}
      open={open && Boolean(dataUrl)}
      onCancel={onClose}
      footer={null}
      width={1120}
      centered
      destroyOnHidden
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(420px,1fr)_340px]">
        <div className="flex min-h-[480px] items-center justify-center overflow-auto rounded-lg border border-black/10 bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0] p-4 dark:border-white/10 dark:bg-[linear-gradient(45deg,#1f2937_25%,transparent_25%),linear-gradient(-45deg,#1f2937_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1f2937_75%),linear-gradient(-45deg,transparent_75%,#1f2937_75%)]">
          {canvasSize ? (
            <div
              ref={previewRef}
              className="relative shrink-0 overflow-hidden bg-transparent shadow-[0_10px_34px_rgba(15,23,42,.18)]"
              style={{
                width: canvasSize.width * scale,
                height: canvasSize.height * scale,
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              {layers.map((layer) =>
                layer.visible ? (
                  <div
                    key={layer.id}
                    className={`absolute select-none ${layer.locked ? "" : "cursor-move"} ${selectedLayerId === layer.id ? "outline outline-2 outline-[#2f80ff]" : ""}`}
                    style={{
                      left: layer.x * scale,
                      top: layer.y * scale,
                      width: layer.width * scale,
                      height: layer.height * scale,
                      opacity: layer.opacity,
                      filter: layerFilter(layer),
                      transform: `rotate(${layer.rotation}deg)`,
                      transformOrigin: "center",
                    }}
                    onPointerDown={(event) => startLayerMove(event, layer)}
                  >
                    <img
                      src={layer.src}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-fill"
                    />
                    {!layer.locked && selectedLayerId === layer.id ? (
                      <button
                        type="button"
                        aria-label="缩放图层"
                        className="absolute -bottom-2 -right-2 size-5 rounded-full border border-white bg-[#2f80ff] shadow"
                        onPointerDown={(event) =>
                          startLayerResize(event, layer)
                        }
                      />
                    ) : null}
                  </div>
                ) : null,
              )}
            </div>
          ) : null}
        </div>

        <div className="flex min-h-[480px] flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold">图层与颜色</h2>
            <div className="mt-2 text-sm opacity-60">
              {imageError ? (
                <span role="alert" className="font-medium text-red-500">
                  {imageError}
                </span>
              ) : canvasSize
                ? `${canvasSize.width} x ${canvasSize.height}px`
                : "读取中"}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              icon={<ImagePlus className="size-4" />}
              disabled={!canvasSize || Boolean(imageError)}
              onClick={() => fileInputRef.current?.click()}
            >
              添加图片层
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!canvasSize || Boolean(imageError)}
              onChange={(event) => void addFiles(event.target.files)}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-black/10 p-2 dark:border-white/10">
            {[...layers].reverse().map((layer) => (
              <button
                key={layer.id}
                type="button"
                className={`mb-2 flex h-14 w-full items-center gap-2 rounded-md border px-2 text-left transition last:mb-0 ${selectedLayerId === layer.id ? "border-[#2f80ff] bg-[#2f80ff]/10" : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"}`}
                onClick={() => setSelectedLayerId(layer.id)}
              >
                <img
                  src={layer.src}
                  alt=""
                  className="size-10 shrink-0 rounded object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {layer.name}
                  </span>
                  <span className="block text-xs opacity-55">
                    {layer.locked
                      ? "底图"
                      : `${Math.round(layer.opacity * 100)}%`}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <IconButton
                    title={layer.visible ? "隐藏" : "显示"}
                    onClick={() =>
                      updateLayer(layer.id, { visible: !layer.visible })
                    }
                  >
                    {layer.visible ? (
                      <Eye className="size-4" />
                    ) : (
                      <EyeOff className="size-4" />
                    )}
                  </IconButton>
                  <IconButton
                    title="上移"
                    disabled={layers.indexOf(layer) >= layers.length - 1}
                    onClick={() => moveLayer(layer.id, 1)}
                  >
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton
                    title="下移"
                    disabled={layers.indexOf(layer) <= 0}
                    onClick={() => moveLayer(layer.id, -1)}
                  >
                    <ArrowDown className="size-4" />
                  </IconButton>
                </span>
              </button>
            ))}
          </div>

          {selectedLayer ? (
            <div className="space-y-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-sm font-semibold">
                  {selectedLayer.name}
                </div>
                <Switch
                  size="small"
                  checked={selectedLayer.visible}
                  onChange={(visible) =>
                    updateLayer(selectedLayer.id, { visible })
                  }
                />
              </div>
              <ControlRow
                label="透明度"
                value={`${Math.round(selectedLayer.opacity * 100)}%`}
              >
                <Slider
                  min={0}
                  max={100}
                  value={Math.round(selectedLayer.opacity * 100)}
                  onChange={(value) =>
                    updateLayer(selectedLayer.id, { opacity: value / 100 })
                  }
                />
              </ControlRow>
              <ControlRow label="亮度" value={`${selectedLayer.brightness}%`}>
                <Slider
                  min={0}
                  max={200}
                  value={selectedLayer.brightness}
                  onChange={(brightness) =>
                    updateLayer(selectedLayer.id, { brightness })
                  }
                />
              </ControlRow>
              <ControlRow label="对比度" value={`${selectedLayer.contrast}%`}>
                <Slider
                  min={0}
                  max={200}
                  value={selectedLayer.contrast}
                  onChange={(contrast) =>
                    updateLayer(selectedLayer.id, { contrast })
                  }
                />
              </ControlRow>
              <ControlRow label="饱和度" value={`${selectedLayer.saturation}%`}>
                <Slider
                  min={0}
                  max={200}
                  value={selectedLayer.saturation}
                  onChange={(saturation) =>
                    updateLayer(selectedLayer.id, { saturation })
                  }
                />
              </ControlRow>
              <ControlRow label="色相" value={`${selectedLayer.hue}°`}>
                <Slider
                  min={-180}
                  max={180}
                  value={selectedLayer.hue}
                  onChange={(hue) => updateLayer(selectedLayer.id, { hue })}
                />
              </ControlRow>
              <ControlRow label="黑白" value={`${selectedLayer.grayscale}%`}>
                <Slider
                  min={0}
                  max={100}
                  value={selectedLayer.grayscale}
                  onChange={(grayscale) =>
                    updateLayer(selectedLayer.id, { grayscale })
                  }
                />
              </ControlRow>
              <ControlRow label="旋转" value={`${selectedLayer.rotation}°`}>
                <Slider
                  min={-180}
                  max={180}
                  value={selectedLayer.rotation}
                  onChange={(rotation) =>
                    updateLayer(selectedLayer.id, { rotation })
                  }
                  disabled={selectedLayer.locked}
                />
              </ControlRow>
              <div className="grid grid-cols-2 gap-2">
                <InputNumber
                  className="w-full"
                  min={1}
                  value={Math.round(selectedLayer.width)}
                  onChange={(width) =>
                    width &&
                    updateLayer(selectedLayer.id, {
                      width,
                      height:
                        width *
                        (selectedLayer.height /
                          Math.max(1, selectedLayer.width)),
                    })
                  }
                  disabled={selectedLayer.locked}
                />
                <InputNumber
                  className="w-full"
                  min={1}
                  value={Math.round(selectedLayer.height)}
                  onChange={(height) =>
                    height &&
                    updateLayer(selectedLayer.id, {
                      height,
                      width:
                        height *
                        (selectedLayer.width /
                          Math.max(1, selectedLayer.height)),
                    })
                  }
                  disabled={selectedLayer.locked}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  icon={<RotateCcw className="size-4" />}
                  onClick={resetSelectedLayer}
                >
                  重置
                </Button>
                <Button
                  danger
                  icon={<Trash2 className="size-4" />}
                  disabled={selectedLayer.locked}
                  onClick={() => deleteLayer(selectedLayer.id)}
                >
                  删除
                </Button>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="text-sm font-medium text-[#ef4444]">{error}</div>
          ) : null}
          <div className="mt-auto flex items-center justify-end gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" disabled={!canvasSize || Boolean(imageError)} onClick={() => void exportImage()}>
              生成合成图
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function IconButton({
  children,
  title,
  disabled,
  onClick,
}: {
  children: ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      title={title}
      aria-disabled={disabled}
      className={`grid size-7 place-items-center rounded ${disabled ? "cursor-not-allowed opacity-30" : "hover:bg-black/10 dark:hover:bg-white/10"}`}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick();
      }}
    >
      {children}
    </span>
  );
}

function ControlRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium opacity-75">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      {children}
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

async function renderLayersToDataUrl(
  size: { width: number; height: number },
  layers: LayerItem[],
) {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建画布");

  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const image = await loadImage(layer.src);
    context.save();
    context.globalAlpha = layer.opacity;
    context.filter = layerFilter(layer);
    context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.drawImage(
      image,
      -layer.width / 2,
      -layer.height / 2,
      layer.width,
      layer.height,
    );
    context.restore();
  }

  return canvas.toDataURL("image/png");
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

function layerFilter(
  layer: Pick<
    LayerItem,
    "brightness" | "contrast" | "saturation" | "hue" | "grayscale"
  >,
) {
  return `brightness(${layer.brightness}%) contrast(${layer.contrast}%) saturate(${layer.saturation}%) hue-rotate(${layer.hue}deg) grayscale(${layer.grayscale}%)`;
}
