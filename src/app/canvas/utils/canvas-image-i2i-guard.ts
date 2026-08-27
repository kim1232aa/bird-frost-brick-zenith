import { resolveAdapterId, type StudioAdapterId } from "@/studio/adapters";
import { planStudioImageI2I, type ImageI2IMode } from "@/studio/adapters/image-i2i-contract";

/**
 * Infinite-canvas / studio fallback must plan I2I through the official
 * per-provider contract before any serializer runs. T2I-only models throw
 * if references are attached. Over-cap lists throw instead of being sliced.
 */
export function planCanvasImageI2I(input: {
  adapter?: string;
  adapterType?: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  refs: readonly string[];
  operation?: ImageI2IMode;
  size?: string;
  n?: number;
  strength?: number;
  negativePrompt?: string;
}) {
  const adapter = resolveAdapterId({
    adapter: input.adapter,
    adapterType: input.adapterType,
    model: input.model,
    baseUrl: input.baseUrl,
  }) as StudioAdapterId;
  return planStudioImageI2I({
    adapter,
    model: input.model,
    prompt: input.prompt,
    refs: input.refs,
    operation: input.operation,
    size: input.size,
    n: input.n,
    strength: input.strength,
    negativePrompt: input.negativePrompt,
  });
}
