"use client";

import { useEffect, useState } from "react";
import { Button, Modal, Segmented } from "antd";
import { ImagePlus } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";

export type CanvasImageUpscaleParams = {
    quality: "low" | "medium" | "high";
    size: string;
};

const qualityOptions: Array<{ value: CanvasImageUpscaleParams["quality"]; label: string; description: string }> = [
    { value: "low", label: "1K", description: "轻量修复" },
    { value: "medium", label: "2K", description: "均衡高清" },
    { value: "high", label: "4K", description: "最高细节" },
];

const sizeOptions = [
    { value: "auto", label: "auto", description: "沿用原图比例" },
    { value: "1:1", label: "1:1", description: "方图" },
    { value: "16:9", label: "16:9", description: "横版" },
    { value: "9:16", label: "9:16", description: "竖版" },
    { value: "4:3", label: "4:3", description: "标准横版" },
    { value: "3:4", label: "3:4", description: "标准竖版" },
];

const defaultParams: CanvasImageUpscaleParams = {
    quality: "high",
    size: "auto",
};

export function CanvasNodeUpscaleDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageUpscaleParams) => void }) {
    const [params, setParams] = useState<CanvasImageUpscaleParams>(defaultParams);
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [imageError, setImageError] = useState("");

    useEffect(() => {
        if (!open) return;
        setParams(defaultParams);
        setImage(null);
        setImageError("");
    }, [dataUrl, open]);

    useEffect(() => {
        if (!open) return;
        let active = true;
        void readImageMeta(dataUrl)
            .then((nextImage) => {
                if (active) setImage(nextImage);
            })
            .catch((error: unknown) => {
                if (active) setImageError(error instanceof Error ? error.message : "图片元数据读取失败，请确认图片内容有效后重试");
            });
        return () => {
            active = false;
        };
    }, [dataUrl, open]);

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={820} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">AI 高清放大</h2>
                    <p className="mt-1 text-sm opacity-60">以原图作为参考图进行 AI 超分、重绘和高清修复。</p>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
                    <div className="rounded-xl border p-4">
                        <div className="grid min-h-[280px] place-items-center rounded-lg bg-black/5">
                            <img src={dataUrl} alt="" className="max-h-[320px] max-w-full rounded-lg object-contain shadow-xl" draggable={false} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="opacity-60">源图</span>
                            <span className="font-semibold">{imageError ? <span role="alert" className="text-red-500">{imageError}</span> : image ? `${image.width} x ${image.height} px` : "读取中"}</span>
                        </div>
                    </div>
                    <div className="space-y-6 py-2">
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">清晰度</div>
                            <Segmented
                                block
                                disabled={!image || Boolean(imageError)}
                                value={params.quality}
                                options={qualityOptions.map((item) => ({
                                    value: item.value,
                                    label: (
                                        <span className="flex min-h-12 flex-col justify-center text-left leading-5">
                                            <span className="font-medium">{item.label}</span>
                                            <span className="text-xs opacity-55">{item.description}</span>
                                        </span>
                                    ),
                                }))}
                                onChange={(value) => setParams((current) => ({ ...current, quality: value as CanvasImageUpscaleParams["quality"] }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">尺寸比例</div>
                            <Segmented
                                block
                                disabled={!image || Boolean(imageError)}
                                value={params.size}
                                options={sizeOptions.map((item) => ({
                                    value: item.value,
                                    label: (
                                        <span className="flex min-h-12 flex-col justify-center text-left leading-5">
                                            <span className="font-medium">{item.label}</span>
                                            <span className="text-xs opacity-55">{item.description}</span>
                                        </span>
                                    ),
                                }))}
                                onChange={(value) => setParams((current) => ({ ...current, size: String(value) }))}
                            />
                        </div>
                        <div className="rounded-xl border px-4 py-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="opacity-60">生成规则</span>
                                <span className="font-semibold">{qualityOptions.find((item) => item.value === params.quality)?.label} · {params.size}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<ImagePlus className="size-4" />} disabled={!image || Boolean(imageError)} onClick={() => onConfirm(params)}>
                        开始 AI 高清放大
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
