import {
  resolveImageModelCapability,
  type ImageCapabilityProvider,
} from "../services/api/image-model-capabilities.ts";

/** Legacy substring matcher — fallback only when the capability contract has no verdict. */
function legacyIsEditModel(model: string) {
  const value = String(model || "").toLowerCase();
  return (
    value.includes("qwen-image-edit") ||
    value.includes("flux.2") ||
    value.includes("flux2-") ||
    value.includes("qwen-3.0-pro") ||
    value.includes("civitai-grok") ||
    value.includes("gpt-image") ||
    value.includes("grok-imagine-image") ||
    value.includes("agnes-image")
  );
}

/**
 * Models that accept an edit / inpaint-style request (need at least one reference).
 * Contract-first: a provider-scoped capability verdict wins; the regex is only a
 * fallback so contract-supported edit models (Ark Seedream、万相 2.6/2.7、qwen-image、
 * Civitai krea2/flux/sdxl/seedream 等) 不再被旧正则误拦。
 */
export function isEditModel(model: string, provider?: ImageCapabilityProvider | null) {
  const capability = resolveImageModelCapability({
    model: String(model || ""),
    operation: "edit",
    provider: provider ?? undefined,
  });
  if (capability.availability.state === "supported") return true;
  // 有 provider 上下文时，合同明确不支持 edit 才隐藏；无上下文时 unsupported 可能
  // 是适配器缺位的误判，回退旧匹配，宁可多列也不错拦。
  if (provider && capability.availability.state === "unsupported") return false;
  return legacyIsEditModel(model);
}

/** Edit-only: hide from 文生图 picker so the 编辑 tab is not empty. */
export function isEditOnlyModel(model: string, provider?: ImageCapabilityProvider | null) {
  const value = String(model || "");
  const generate = resolveImageModelCapability({
    model: value,
    operation: "generate",
    provider: provider ?? undefined,
  });
  if (generate.availability.state === "supported") return false;
  if (generate.availability.state === "unsupported") {
    const edit = resolveImageModelCapability({
      model: value,
      operation: "edit",
      provider: provider ?? undefined,
    });
    if (edit.availability.state === "supported") return true;
  }
  return value.toLowerCase().includes("qwen-image-edit");
}

export function defaultEditKey(keys: string[]) {
  const preferred =
    keys.find((key) => /preset-superxihe-image::gpt-image-2/i.test(key)) ||
    keys.find((key) => /gpt-image-2|chatgpt-image-latest/i.test(key)) ||
    keys.find((key) => /qwen-image-edit/i.test(key)) ||
    keys.find((key) => /grok-imagine-image/i.test(key)) ||
    keys.find((key) => /flux\.2-dev|flux2-dev/i.test(key));
  return preferred || keys[0] || "";
}
