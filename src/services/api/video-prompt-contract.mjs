export function resolveVideoPromptRequirement(capability) {
  if (capability.id === "agnes-video-v2") {
    return {
      kind: "required",
      reason: "Agnes Video v2 的提示词 prompt 为官方必填字段，不能仅凭图片或关键帧提交",
    };
  }
  if (capability.provider === "civitai") {
    return {
      kind: "required",
      reason: "Civitai videoGen 实时 OpenAPI 的基础输入要求 prompt",
    };
  }
  if (
    capability.id === "dashscope-happyhorse-r2v" ||
    capability.id === "dashscope-happyhorse-video-edit" ||
    capability.id === "dashscope-t2v"
  ) {
    return {
      kind: "required",
      reason: `${capability.providerLabel} / ${capability.model} 当前精确 operation 要求 prompt`,
    };
  }
  return {
    kind: "required-without-media",
    reason: `${capability.providerLabel} / ${capability.model || "未选择模型"} 至少需要提示词或一种受支持素材`,
  };
}

export function videoPromptPreflightError(capability, prompt, material = {}) {
  if (String(prompt || "").trim()) return "";
  const requirement = resolveVideoPromptRequirement(capability);
  const materialCount =
    Math.max(0, material.imageCount || 0) +
    Math.max(0, material.videoCount || 0) +
    Math.max(0, material.audioCount || 0);
  if (requirement.kind === "required" || materialCount === 0) {
    return requirement.reason;
  }
  return "";
}
