/** Built-in wiring slots. Keep in sync with STUDIO_PROVIDERS in wiring.ts. */
const MANAGED_IDS = new Set([
  "preset-superxihe-image",
  "preset-superxihe-grok",
  "preset-volcengine-plan",
  "preset-civitai",
  "preset-aliyun-dashscope",
  "preset-aliyun-tokenplan",
  "preset-volcengine-ark",
  "preset-agnes-ai",
  "preset-sensenova",
  "preset-fal",
  "preset-custom-compat",
  "legacy-default-relay",
]);

export function isManagedRelayId(id: string) {
  return MANAGED_IDS.has(id);
}
