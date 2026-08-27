"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu } from "lucide-react";

import { cn } from "@/lib/utils";

type ModelIconRule = {
    icon: string;
    monochrome?: boolean;
    matches: (model: string) => boolean;
};

const includesAny = (value: string, candidates: readonly string[]) => candidates.some((candidate) => value.includes(candidate));

const MODEL_ICON_RULES: readonly ModelIconRule[] = [
    { icon: "/model-icons/claude-color.svg", matches: (model) => includesAny(model, ["claude", "anthropic"]) },
    { icon: "/model-icons/gemini-color.svg", matches: (model) => includesAny(model, ["gemini", "imagen", "google", "vertex"]) },
    { icon: "/model-icons/sora-color.svg", matches: (model) => model.includes("sora") },
    { icon: "/model-icons/dalle-color.svg", matches: (model) => includesAny(model, ["dall-e", "dalle"]) },
    { icon: "/model-icons/openai.svg", monochrome: true, matches: (model) => /(^|[\s/_-])(gpt|chatgpt|openai|o1|o3|o4)([\s/_.-]|$)/u.test(model) || model.startsWith("gpt") },
    { icon: "/model-icons/grok.svg", monochrome: true, matches: (model) => includesAny(model, ["grok", "xai", "x.ai"]) },
    { icon: "/model-icons/deepseek-color.svg", matches: (model) => model.includes("deepseek") },
    { icon: "/model-icons/zhipu-color.svg", matches: (model) => includesAny(model, ["zhipu", "chatglm", "glm-"]) || model === "glm" },
    { icon: "/model-icons/qwen-color.svg", matches: (model) => includesAny(model, ["qwen", "tongyi", "通义"]) },
    { icon: "/model-icons/doubao-color.svg", matches: (model) => includesAny(model, ["doubao", "seedance", "seedream", "bytedance", "byte-dance", "volcengine", "ark-"]) },
    { icon: "/model-icons/flux.svg", monochrome: true, matches: (model) => model.includes("flux") },
    { icon: "/model-icons/stability-color.svg", matches: (model) => includesAny(model, ["stability", "stable-diffusion", "sdxl", "stable diffusion"]) },
    { icon: "/model-icons/midjourney.svg", monochrome: true, matches: (model) => includesAny(model, ["midjourney", "mj-"]) },
    { icon: "/model-icons/mistral-color.svg", matches: (model) => includesAny(model, ["mistral", "mixtral", "codestral"]) },
    { icon: "/model-icons/kimi-color.svg", matches: (model) => includesAny(model, ["kimi", "moonshot"]) },
    { icon: "/model-icons/hailuo-color.svg", matches: (model) => includesAny(model, ["hailuo", "海螺"]) },
    { icon: "/model-icons/minimax-color.svg", matches: (model) => includesAny(model, ["minimax", "abab"]) },
    { icon: "/model-icons/kling-color.svg", matches: (model) => includesAny(model, ["kling", "可灵"]) },
    { icon: "/model-icons/vidu-color.svg", matches: (model) => model.includes("vidu") },
    { icon: "/model-icons/hunyuan-color.svg", matches: (model) => includesAny(model, ["hunyuan", "混元"]) },
    { icon: "/model-icons/wenxin-color.svg", matches: (model) => includesAny(model, ["wenxin", "ernie", "文心"]) },
    { icon: "/model-icons/baidu-color.svg", matches: (model) => model.includes("baidu") },
    { icon: "/model-icons/meta-color.svg", matches: (model) => includesAny(model, ["llama", "meta-"]) },
    { icon: "/model-icons/cohere-color.svg", matches: (model) => includesAny(model, ["cohere", "command-r"]) },
];

export function resolveModelIcon(model: string) {
    const normalized = String(model || "").trim().toLowerCase();
    if (!normalized) return null;
    return MODEL_ICON_RULES.find((rule) => rule.matches(normalized)) || null;
}

export function ModelIcon({ model, className }: { model: string; className?: string }) {
    const icon = resolveModelIcon(model);
    const [failedIcon, setFailedIcon] = useState<string | null>(null);

    useEffect(() => {
        setFailedIcon(null);
    }, [icon?.icon]);

    if (!model.trim()) return null;
    if (!icon || failedIcon === icon.icon) return <Cpu aria-hidden="true" className={cn("size-4 shrink-0 opacity-70", className)} />;

    return (
        <img
            src={icon.icon}
            alt=""
            aria-hidden="true"
            className={cn("size-4 shrink-0 object-contain", icon.monochrome && "dark:invert", className)}
            onError={() => setFailedIcon(icon.icon)}
        />
    );
}

export function ModelLabel({ model, label, className }: { model: string; label?: string; className?: string }) {
    const visibleLabel = String(label || model || "").trim();
    const parts = visibleLabel.includes("·") ? visibleLabel.split("·").map((part) => part.trim()).filter(Boolean) : [];
    const provider = parts.length >= 2 ? parts.slice(0, -1).join(" · ") : "";
    const modelName = parts.length >= 2 ? parts[parts.length - 1] : visibleLabel || model;
    return (
        <span className={cn("flex min-w-0 items-center gap-2", className)}>
            <ModelIcon model={model || modelName} />
            <span className="flex min-w-0 flex-col leading-4" title={`${provider ? `${provider} · ` : ""}${modelName}`}>
                <span className="min-w-0 whitespace-normal break-all font-medium">{modelName}</span>
                {provider ? <span className="min-w-0 whitespace-normal break-all text-[11px] opacity-70">{provider}</span> : null}
            </span>
        </span>
    );
}
