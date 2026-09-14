/** Built-in wiring slots. Keep in sync with STUDIO_PROVIDERS in wiring.ts. */
const MANAGED_IDS = new Set([
  "preset-grok-relay",
  "preset-xai-official",
  "preset-openai",
  "preset-hansyai",
  "preset-modelscope",
  "preset-modelscope-cn",
  "preset-nanogpt",
  "preset-huggingface",
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
  "preset-kling",
  "preset-minimax",
  "preset-custom-compat",
  "legacy-default-relay",
]);

export function isManagedRelayId(id: string | null | undefined): boolean {
  return Boolean(id) && MANAGED_IDS.has(String(id));
}

export function managedRelayIds(): string[] {
  return Array.from(MANAGED_IDS);
}
