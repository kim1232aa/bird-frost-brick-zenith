"use client";

import { useMemo, useState } from "react";
import { Button, Modal, Segmented, Slider } from "antd";
import { Grid2x2, Columns2, Minus, Plus, RotateCcw, Star } from "lucide-react";

import type { CanvasNodeData } from "../types";

type CompareMode = "side-by-side" | "grid";

export function CanvasImageCompareDialog({
    open,
    nodes,
    primaryId,
    onPrimaryChange,
    onClose,
}: {
    open: boolean;
    nodes: CanvasNodeData[];
    primaryId: string | null;
    onPrimaryChange: (nodeId: string) => void;
    onClose: () => void;
}) {
    const [mode, setMode] = useState<CompareMode>("side-by-side");
    const [zoom, setZoom] = useState(1);
    const visibleNodes = useMemo(() => nodes.filter((node) => node.metadata?.content), [nodes]);
    const activeMode = mode === "side-by-side" && visibleNodes.length > 2 ? "grid" : mode;
    const gridColumns = visibleNodes.length <= 2 ? "grid-cols-2" : visibleNodes.length <= 4 ? "grid-cols-2" : "grid-cols-3";

    return (
        <Modal title="图片对比" open={open} onCancel={onClose} footer={null} width="min(1180px, calc(100vw - 32px))" centered destroyOnHidden>
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Segmented
                        value={activeMode}
                        onChange={(value) => setMode(value as CompareMode)}
                        options={[
                            { value: "side-by-side", label: <span className="inline-flex items-center gap-1.5"><Columns2 className="size-4" />左右对比</span>, disabled: visibleNodes.length !== 2 },
                            { value: "grid", label: <span className="inline-flex items-center gap-1.5"><Grid2x2 className="size-4" />宫格对比</span> },
                        ]}
                    />
                    <div className="flex min-w-[260px] items-center gap-2">
                        <Button size="small" icon={<Minus className="size-3.5" />} onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))} />
                        <Slider className="min-w-28 flex-1" min={0.5} max={3} step={0.1} value={zoom} onChange={setZoom} />
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => setZoom((value) => Math.min(3, Number((value + 0.1).toFixed(2))))} />
                        <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => setZoom(1)}>重置</Button>
                    </div>
                </div>

                <div className={`grid max-h-[72vh] gap-3 overflow-auto rounded-xl bg-black p-3 ${activeMode === "side-by-side" ? "grid-cols-2" : gridColumns}`}>
                    {visibleNodes.map((node) => (
                        <div key={node.id} className="relative min-h-[300px] overflow-auto rounded-lg bg-zinc-950">
                            <img
                                src={node.metadata?.content}
                                alt={node.title}
                                className="mx-auto block max-w-none select-none object-contain"
                                draggable={false}
                                style={{ width: `${zoom * 100}%` }}
                            />
                            <div className="sticky bottom-0 left-0 right-0 flex items-center justify-between gap-2 bg-black/70 px-3 py-2 text-xs text-white backdrop-blur">
                                <span className="min-w-0 truncate">{node.title || "图片"}</span>
                                <Button
                                    size="small"
                                    type={primaryId === node.id ? "primary" : "default"}
                                    icon={<Star className="size-3.5" />}
                                    onClick={() => onPrimaryChange(node.id)}
                                >
                                    主图
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}
