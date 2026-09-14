import { liveCatalog, liveCard } from "@/studio/ops";
import { catalogKey } from "@/studio/catalog";
import { useStudioSession } from "@/studio/session";
import type { StoryDirectorTextModelSourceOption } from "./story-director-text-model";

/** When the canvas parent passes an empty model list, fall back to the studio catalog.
 *  列出全部目录模型：未接线的标「（待接线）」，别无声消失让用户不知道去哪配 key。 */
export function wiredStoryDirectorModels(kind: "text" | "image" | "video"): StoryDirectorTextModelSourceOption[] {
  useStudioSession.getState();
  const cards = liveCatalog(kind, false);
  return cards.map((card) => {
    const live = liveCard(card);
    return {
      providerId: card.providerId || card.provider,
      model: card.model,
      value: catalogKey(card),
      label: `${card.provider} · ${card.model}${live?.wired ? "" : "（待接线）"}`,
      providerName: card.provider,
    };
  });
}
