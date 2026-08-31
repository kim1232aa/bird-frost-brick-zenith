/** Models that accept an edit / inpaint-style request (need at least one reference). */
export function isEditModel(model: string) {
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

/** Edit-only: hide from 文生图 picker so the 编辑 tab is not empty. */
export function isEditOnlyModel(model: string) {
  return String(model || "").toLowerCase().includes("qwen-image-edit");
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
