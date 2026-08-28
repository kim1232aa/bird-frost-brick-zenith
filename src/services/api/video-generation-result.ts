export type VideoGenerationOutput = {
    readonly blob?: Blob;
    readonly url?: string;
    readonly mimeType?: string;
};

/**
 * Backward-compatible video result. Legacy consumers may read the first
 * output through blob/url/mimeType; batch-aware consumers must use outputs.
 */
export type VideoGenerationResult = VideoGenerationOutput & {
    readonly outputs?: readonly VideoGenerationOutput[];
};

export function createVideoGenerationResult(
    outputs: readonly VideoGenerationOutput[],
    expectedQuantity?: number,
    providerLabel = "视频生成服务",
): VideoGenerationResult {
    if (expectedQuantity !== undefined && (!Number.isInteger(expectedQuantity) || expectedQuantity < 1)) {
        throw new Error(`${providerLabel}：期望视频数量必须是正整数，当前为 ${expectedQuantity}`);
    }
    if (expectedQuantity !== undefined && outputs.length !== expectedQuantity) {
        throw new Error(`${providerLabel}：期望 ${expectedQuantity} 个视频，实际返回 ${outputs.length} 个；已停止接收不完整批次`);
    }
    if (!outputs.length) throw new Error(`${providerLabel}：工作流成功但没有返回视频`);
    const normalized = outputs.map((output, index) => {
        if (!output.blob && !String(output.url || "").trim()) {
            throw new Error(`${providerLabel}：第 ${index + 1} 个视频没有可下载的 blob 或 URL`);
        }
        return output;
    });
    const result = {
        ...normalized[0],
        outputs: normalized,
    };
    const url = String(result.url || "").trim();
    if (typeof window !== "undefined" && url) {
        void import("@/studio/history").then(({ recordGeneratedWork }) => {
            recordGeneratedWork({
                kind: "video",
                title: `画布视频 · ${providerLabel}`.slice(0, 40),
                prompt: "",
                model: providerLabel,
                urls: [url],
            });
        });
    }
    return result;
}

export function videoGenerationResultOutputs(result: VideoGenerationResult): readonly VideoGenerationOutput[] {
    if (result.outputs?.length) return result.outputs;
    if (result.blob || String(result.url || "").trim()) {
        return [{
            ...(result.blob ? { blob: result.blob } : {}),
            ...(result.url ? { url: result.url } : {}),
            ...(result.mimeType ? { mimeType: result.mimeType } : {}),
        }];
    }
    return [];
}
