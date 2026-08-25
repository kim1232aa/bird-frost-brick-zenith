"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { Button, InputNumber, Modal, Segmented } from "antd";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Grid2x2, Minus, Move, Plus, RotateCcw } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";
import type { ImageSplitParams } from "../utils/canvas-image-data";

export type CanvasImageSplitParams = ImageSplitParams;

const defaultParams: CanvasImageSplitParams = { rows: 2, columns: 2 };
const maxGridSize = 12;
const minZoom = 0.35;
const maxZoom = 5;
const zoomStep = 0.2;

type DragTarget = { type: "pan"; x: number; y: number; panX: number; panY: number } | { type: "row"; index: number } | { type: "column"; index: number };
type ImageMeta = { width: number; height: number };

export function CanvasNodeSplitDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageSplitParams) => void }) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [params, setParams] = useState(defaultParams);
    const [image, setImage] = useState<ImageMeta | null>(null);
    const [imageError, setImageError] = useState("");
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
    const [activeLine, setActiveLine] = useState<{ type: "row" | "column"; index: number } | null>(null);
    const [step, setStep] = useState(1);
    const total = params.rows * params.columns;
    const rowCuts = useMemo(() => normalizeCuts(image?.height || 1, params.rows, params.rowCuts), [image?.height, params.rowCuts, params.rows]);
    const columnCuts = useMemo(() => normalizeCuts(image?.width || 1, params.columns, params.columnCuts), [image?.width, params.columnCuts, params.columns]);
    const rowBounds = useMemo(() => (image ? [0, ...rowCuts, image.height] : []), [image, rowCuts]);
    const columnBounds = useMemo(() => (image ? [0, ...columnCuts, image.width] : []), [columnCuts, image]);
    const selectedLine = activeLine?.type === "row" ? rowCuts[activeLine.index] : activeLine?.type === "column" ? columnCuts[activeLine.index] : null;
    const selectedRegion = activeLine && image ? describeAdjacentRegion(activeLine, rowBounds, columnBounds, image) : null;

    useEffect(() => {
        if (!open) return;
        setParams(defaultParams);
        setImage(null);
        setImageError("");
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setActiveLine(null);
        setDragTarget(null);
    }, [dataUrl, open]);

    useEffect(() => {
        if (!open) return;
        let active = true;
        void readImageMeta(dataUrl)
            .then((meta) => {
                if (!active) return;
                setImage(meta);
                setParams((current) => ({
                    ...current,
                    rowCuts: equalCuts(meta.height, current.rows),
                    columnCuts: equalCuts(meta.width, current.columns),
                }));
            })
            .catch((error: unknown) => {
                if (active) setImageError(error instanceof Error ? error.message : "图片元数据读取失败，请确认图片内容有效后重试");
            });
        return () => {
            active = false;
        };
    }, [dataUrl, open]);

    useEffect(() => {
        if (!dragTarget || !image) return;
        const onMove = (event: PointerEvent) => {
            if (dragTarget.type === "pan") {
                setPan({ x: dragTarget.panX + event.clientX - dragTarget.x, y: dragTarget.panY + event.clientY - dragTarget.y });
                return;
            }
            const point = imagePointFromClient(event.clientX, event.clientY, image, viewportRef.current, zoom, pan);
            if (!point) return;
            if (dragTarget.type === "row") updateCut("row", dragTarget.index, point.y);
            if (dragTarget.type === "column") updateCut("column", dragTarget.index, point.x);
        };
        const onUp = () => setDragTarget(null);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    }, [dragTarget, image, pan, zoom]);

    const update = (key: "rows" | "columns", value: string | number | null) => {
        if (!image) {
            setParams((current) => ({ ...current, [key]: clampGrid(value ?? current[key]) }));
            return;
        }
        setParams((current) => {
            const next = { ...current, [key]: clampGrid(value ?? current[key]) };
            if (key === "rows") next.rowCuts = equalCuts(image.height, Number(next.rows));
            if (key === "columns") next.columnCuts = equalCuts(image.width, Number(next.columns));
            return next;
        });
        setActiveLine(null);
    };

    const updateCut = (type: "row" | "column", index: number, value: number) => {
        if (!image) return;
        const size = type === "row" ? image.height : image.width;
        const cuts = type === "row" ? rowCuts : columnCuts;
        const nextCuts = moveCut(cuts, index, value, size);
        setActiveLine({ type, index });
        setParams((current) => ({ ...current, [type === "row" ? "rowCuts" : "columnCuts"]: nextCuts }));
    };

    const nudgeCut = (type: "row" | "column", index: number, delta: number) => {
        const cuts = type === "row" ? rowCuts : columnCuts;
        updateCut(type, index, (cuts[index] || 0) + delta);
    };

    useEffect(() => {
        if (!open || !activeLine || !image) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !event.target || isTypingTarget(event.target)) return;
            const previousKey = activeLine.type === "row" ? "ArrowUp" : "ArrowLeft";
            const nextKey = activeLine.type === "row" ? "ArrowDown" : "ArrowRight";
            if (event.key !== previousKey && event.key !== nextKey) return;
            event.preventDefault();
            event.stopPropagation();
            nudgeCut(activeLine.type, activeLine.index, event.key === previousKey ? -1 : 1);
        };
        window.addEventListener("keydown", onKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
    }, [activeLine, columnCuts, image, open, rowCuts]);

    const changeZoom = (nextZoom: number) => {
        setZoom((current) => Math.min(maxZoom, Math.max(minZoom, typeof nextZoom === "number" ? nextZoom : current)));
    };

    const onWheel = (event: WheelEvent<HTMLDivElement>) => {
        if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
        event.preventDefault();
        changeZoom(zoom + (event.deltaY > 0 ? -zoomStep : zoomStep));
    };

    const resetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const startLineDrag = (type: "row" | "column", index: number, event: ReactPointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setActiveLine({ type, index });
        setDragTarget({ type, index });
    };

    const startPan = (event: ReactPointerEvent) => {
        if (!image || imageError || event.button !== 0 || dragTarget) return;
        event.preventDefault();
        setDragTarget({ type: "pan", x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
    };

    const confirm = () => {
        if (!image || imageError) return;
        onConfirm({ ...params, rowCuts, columnCuts });
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width="min(1180px, calc(100vw - 32px))" centered destroyOnHidden>
            <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold">切分图片</h2>
                        <p className="mt-1 text-sm opacity-60">拖动切线精准切分，生成 {total} 个图片子节点</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button disabled={!image || Boolean(imageError)} icon={<Minus className="size-4" />} onClick={() => changeZoom(zoom - zoomStep)} />
                        <span className="min-w-14 text-center text-sm font-semibold">{Math.round(zoom * 100)}%</span>
                        <Button disabled={!image || Boolean(imageError)} icon={<Plus className="size-4" />} onClick={() => changeZoom(zoom + zoomStep)} />
                        <Button disabled={!image || Boolean(imageError)} icon={<RotateCcw className="size-4" />} onClick={resetView}>重置</Button>
                    </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
                    <div className="rounded-xl border p-3">
                        <div
                            ref={viewportRef}
                            className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-lg bg-zinc-950"
                            onWheel={onWheel}
                            onPointerDown={startPan}
                        >
                            {imageError ? (
                                <div role="alert" className="grid h-full place-items-center px-5 text-center text-sm font-medium text-red-300">{imageError}</div>
                            ) : image ? (
                                <div
                                    className="absolute left-1/2 top-1/2 origin-center"
                                    style={{
                                        width: image.width,
                                        height: image.height,
                                        transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
                                    }}
                                >
                                    <img src={dataUrl} alt="" className="block size-full select-none object-fill" draggable={false} />
                                    <SplitLines image={image} rowCuts={rowCuts} columnCuts={columnCuts} activeLine={activeLine} onDragStart={startLineDrag} />
                                </div>
                            ) : (
                                <div className="grid h-full place-items-center text-sm text-white/70">图片读取中</div>
                            )}
                            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{imageError ? "读取失败" : image ? `${image.width} x ${image.height}px` : "读取中"}</div>
                            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                                <Move className="size-3.5" />
                                滚轮缩放，拖拽查看局部
                            </div>
                            {activeLine && selectedLine !== null ? (
                                <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-black/70 px-3 py-2 text-xs text-white shadow-xl">
                                    <div>{activeLine.type === "row" ? "横向切线" : "纵向切线"} {activeLine.index + 1}: {selectedLine}px</div>
                                    {selectedRegion ? <div className="mt-1 opacity-80">相邻区域 {selectedRegion}</div> : null}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <NumberField disabled={!image || Boolean(imageError)} label="行数" value={params.rows} onChange={(value) => update("rows", value)} />
                            <NumberField disabled={!image || Boolean(imageError)} label="列数" value={params.columns} onChange={(value) => update("columns", value)} />
                        </div>

                        <div className="rounded-xl border px-4 py-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="opacity-60">子节点</span>
                                <span className="font-semibold">{total} 个</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                                <span className="opacity-60">步进</span>
                                <Segmented disabled={!image || Boolean(imageError)} size="small" value={step} options={[1, 5, 10].map((value) => ({ label: `${value}px`, value }))} onChange={(value) => setStep(Number(value))} />
                            </div>
                        </div>

                        <LineControls title="横向切线" type="row" cuts={rowCuts} size={image?.height || 0} step={step} activeLine={activeLine} onActivate={(index) => setActiveLine({ type: "row", index })} onNudge={nudgeCut} onChange={updateCut} />
                        <LineControls title="纵向切线" type="column" cuts={columnCuts} size={image?.width || 0} step={step} activeLine={activeLine} onActivate={(index) => setActiveLine({ type: "column", index })} onNudge={nudgeCut} onChange={updateCut} />

                        <Button type="primary" size="large" className="w-full" icon={<Grid2x2 className="size-4" />} disabled={!image || Boolean(imageError)} onClick={confirm}>
                            生成子节点
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function NumberField({ disabled, label, value, onChange }: { disabled?: boolean; label: string; value: number; onChange: (value: string | number | null) => void }) {
    return (
        <label className="block space-y-2">
            <span className="font-medium opacity-75">{label}</span>
            <InputNumber className="w-full" disabled={disabled} min={1} max={maxGridSize} precision={0} value={value} onChange={onChange} />
        </label>
    );
}

function SplitLines({
    image,
    rowCuts,
    columnCuts,
    activeLine,
    onDragStart,
}: {
    image: ImageMeta;
    rowCuts: number[];
    columnCuts: number[];
    activeLine: { type: "row" | "column"; index: number } | null;
    onDragStart: (type: "row" | "column", index: number, event: ReactPointerEvent) => void;
}) {
    return (
        <div className="absolute inset-0">
            {columnCuts.map((cut, index) => (
                <button
                    key={`column-${index}`}
                    type="button"
                    className="absolute inset-y-0 z-10 w-5 -translate-x-1/2 cursor-ew-resize border-l-2 border-white/95 outline-none drop-shadow-[0_0_2px_rgba(0,0,0,.8)] focus-visible:ring-2 focus-visible:ring-sky-300"
                    style={{ left: `${(cut / image.width) * 100}%`, borderColor: activeLine?.type === "column" && activeLine.index === index ? "#38bdf8" : undefined }}
                    onPointerDown={(event) => onDragStart("column", index, event)}
                    aria-label={`拖动纵向切线 ${index + 1}`}
                >
                    <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">{cut}px</span>
                </button>
            ))}
            {rowCuts.map((cut, index) => (
                <button
                    key={`row-${index}`}
                    type="button"
                    className="absolute inset-x-0 z-10 h-5 -translate-y-1/2 cursor-ns-resize border-t-2 border-white/95 outline-none drop-shadow-[0_0_2px_rgba(0,0,0,.8)] focus-visible:ring-2 focus-visible:ring-sky-300"
                    style={{ top: `${(cut / image.height) * 100}%`, borderColor: activeLine?.type === "row" && activeLine.index === index ? "#38bdf8" : undefined }}
                    onPointerDown={(event) => onDragStart("row", index, event)}
                    aria-label={`拖动横向切线 ${index + 1}`}
                >
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">{cut}px</span>
                </button>
            ))}
        </div>
    );
}

function LineControls({
    title,
    type,
    cuts,
    size,
    step,
    activeLine,
    onActivate,
    onNudge,
    onChange,
}: {
    title: string;
    type: "row" | "column";
    cuts: number[];
    size: number;
    step: number;
    activeLine: { type: "row" | "column"; index: number } | null;
    onActivate: (index: number) => void;
    onNudge: (type: "row" | "column", index: number, delta: number) => void;
    onChange: (type: "row" | "column", index: number, value: number) => void;
}) {
    const previousIcon = type === "row" ? <ArrowUp className="size-3.5" /> : <ArrowLeft className="size-3.5" />;
    const nextIcon = type === "row" ? <ArrowDown className="size-3.5" /> : <ArrowRight className="size-3.5" />;

    return (
        <div className="rounded-xl border px-3 py-3">
            <div className="mb-2 text-sm font-semibold">{title}</div>
            {cuts.length ? (
                <div className="max-h-40 space-y-2 overflow-auto pr-1">
                    {cuts.map((cut, index) => {
                        const active = activeLine?.type === type && activeLine.index === index;
                        const min = (cuts[index - 1] || 0) + 1;
                        const max = (cuts[index + 1] || size) - 1;
                        return (
                            <div
                                key={`${type}-${index}`}
                                role="button"
                                tabIndex={0}
                                className={`rounded-lg border px-2 py-2 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-sky-300 ${active ? "border-sky-400 bg-sky-50" : "border-zinc-200 hover:border-zinc-300"}`}
                                onClick={() => onActivate(index)}
                                onFocus={() => onActivate(index)}
                            >
                                <div className="mb-2 flex w-full items-center justify-between gap-2">
                                    <span className="shrink-0">切线 {index + 1}</span>
                                    <InputNumber
                                        aria-label={`${title} ${index + 1} 位置`}
                                        size="small"
                                        min={min}
                                        max={max}
                                        precision={0}
                                        controls={false}
                                        addonAfter="px"
                                        value={cut}
                                        className="w-28"
                                        onClick={(event) => event.stopPropagation()}
                                        onFocus={() => onActivate(index)}
                                        onChange={(value) => {
                                            if (value === null) return;
                                            onChange(type, index, Number(value));
                                        }}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button size="small" tabIndex={-1} icon={previousIcon} onMouseDown={(event) => event.preventDefault()} onClick={() => onNudge(type, index, -step)}>
                                        -{step}px
                                    </Button>
                                    <Button size="small" tabIndex={-1} icon={nextIcon} onMouseDown={(event) => event.preventDefault()} onClick={() => onNudge(type, index, step)}>
                                        +{step}px
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-lg bg-zinc-100 px-3 py-2 text-sm opacity-70">当前没有切线</div>
            )}
        </div>
    );
}

function isTypingTarget(target: EventTarget) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
}

function equalCuts(size: number, count: number) {
    return Array.from({ length: Math.max(0, count - 1) }, (_, index) => Math.round(((index + 1) * size) / count));
}

function normalizeCuts(size: number, count: number, cuts?: number[]) {
    if (count <= 1) return [];
    const source = Array.isArray(cuts) && cuts.length === count - 1 ? cuts : equalCuts(size, count);
    return source.reduce<number[]>((result, cut, index) => {
        const min = (result[index - 1] || 0) + 1;
        const max = size - (count - 1 - index);
        result.push(Math.min(max, Math.max(min, Math.round(cut))));
        return result;
    }, []);
}

function moveCut(cuts: number[], index: number, value: number, size: number) {
    const next = [...cuts];
    const min = (next[index - 1] || 0) + 1;
    const max = (next[index + 1] || size) - 1;
    next[index] = Math.min(max, Math.max(min, Math.round(value)));
    return next;
}

function imagePointFromClient(clientX: number, clientY: number, image: ImageMeta, viewport: HTMLDivElement | null, zoom: number, pan: { x: number; y: number }) {
    const rect = viewport?.getBoundingClientRect();
    if (!rect) return null;
    const imageLeft = rect.left + rect.width / 2 - (image.width * zoom) / 2 + pan.x;
    const imageTop = rect.top + rect.height / 2 - (image.height * zoom) / 2 + pan.y;
    return {
        x: Math.min(image.width, Math.max(0, (clientX - imageLeft) / zoom)),
        y: Math.min(image.height, Math.max(0, (clientY - imageTop) / zoom)),
    };
}

function describeAdjacentRegion(activeLine: { type: "row" | "column"; index: number }, rowBounds: number[], columnBounds: number[], image: ImageMeta) {
    if (activeLine.type === "row") {
        const top = rowBounds[activeLine.index] || 0;
        const bottom = rowBounds[activeLine.index + 2] || image.height;
        return `${image.width} x ${bottom - top}px`;
    }
    const left = columnBounds[activeLine.index] || 0;
    const right = columnBounds[activeLine.index + 2] || image.width;
    return `${right - left} x ${image.height}px`;
}

function clampGrid(value: string | number) {
    const numberValue = Number(value);
    return Math.min(maxGridSize, Math.max(1, Math.round(Number.isFinite(numberValue) ? numberValue : 1)));
}
