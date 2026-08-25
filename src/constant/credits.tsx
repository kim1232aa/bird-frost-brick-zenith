import type { ComponentProps } from "react";
import { Zap } from "lucide-react";

export function CreditSymbol({ className, ...props }: ComponentProps<"span">) {
    return (
        <span {...props} className={`inline-flex items-center justify-center ${className || ""}`}>
            <Zap className="size-[1em] fill-current" strokeWidth={2.4} />
        </span>
    );
}

export type ModelCreditCost = {
    model: string;
    credits: number;
};

export function modelCreditCost(modelCosts: ModelCreditCost[] | undefined, model: string) {
    return modelCosts?.find((item) => item.model === model)?.credits || 0;
}

export function requestCreditCost(options: { channelMode: string; modelCosts?: ModelCreditCost[]; model: string; count?: string | number }) {
    if (options.channelMode !== "remote") return 0;
    const count = Math.max(1, Math.floor(Math.abs(Number(options.count)) || 1));
    return modelCreditCost(options.modelCosts, options.model) * count;
}

export function imageCreditCost(options: { channelMode: string; prices?: Record<string, number>; mode: "generation" | "edit"; outputSize?: string; count?: string | number }) {
    if (options.channelMode !== "remote") return 0;
    const count = Math.max(1, Math.floor(Math.abs(Number(options.count)) || 1));
    const billingMode = options.mode === "edit" ? "image_edit" : "image_generation";
    const size = normalizeImageOutputSize(options.outputSize);
    const fallback = options.mode === "edit" ? ({ "1k": 10, "2k": 15, "4k": 20 } as Record<string, number>)[size] : ({ "1k": 7, "2k": 10, "4k": 14 } as Record<string, number>)[size];
    const legacyFallback = size === "1k" ? options.prices?.[billingMode] : undefined;
    const unitPrice = Math.max(0, Number(options.prices?.[`${billingMode}_${size}`] ?? legacyFallback ?? fallback) || fallback);
    return unitPrice * count;
}

export function outputSizeForImageQuality(quality?: string) {
    const value = String(quality || "").trim().toLowerCase();
    if (value === "medium" || value === "2k") return "2k";
    if (value === "high" || value === "4k") return "4k";
    return "1k";
}

function normalizeImageOutputSize(value?: string) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "2k") return "2k";
    if (normalized === "4k") return "4k";
    return "1k";
}
