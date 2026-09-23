import type { ResolvedImageModelCapability } from "@/services/api/image-model-capabilities";
import { buildStoryReferencePromptDescription } from "./story-image-prompt-policy";

import type {
    CanvasImageOperation,
    CanvasNodeData,
    CharacterDerivedView,
    CharacterDerivedViewAngle,
    StoryCharacter,
    StoryShot,
} from "../types";

export type StoryImageReferenceRole = "identity" | "scene" | "prop" | "story" | "style";

/** An explicitly classified canvas image. Input array order is preserved. */
export type StoryImageReferenceCandidate = {
    readonly node: CanvasNodeData;
    readonly role: "scene" | "prop" | "story" | "style" | "other";
    readonly entityId?: string;
    readonly label?: string;
};

export type StoryImageReferenceDescriptor = {
    /** Stable semantic identity. It never contains media URLs, bytes, storage keys, or credentials. */
    readonly candidateKey: string;
    /** Collection order before provider capability/media filtering. */
    readonly originalOrder: number;
    readonly id: string;
    /** Concrete canvas node that owns this asset; derived views point to their turnaround parent. */
    readonly sourceNodeId: string;
    /** Durable local handle when one exists. Legacy nodes may only have content/backendUrl. */
    readonly storageKey?: string;
    /** Direct persisted/runtime source used when no local storage handle exists. */
    readonly dataUrl?: string;
    readonly url?: string;
    readonly mediaSource: "storage-key" | "content" | "backend-url" | "missing";
    readonly mimeType?: string;
    readonly role: StoryImageReferenceRole;
    readonly entityId?: string;
    readonly angle?: CharacterDerivedViewAngle | "identity";
    readonly label: string;
};

export type SubmittedStoryImageReference = StoryImageReferenceDescriptor & {
    readonly imageNumber: number;
    /** Chinese instruction appended to the image prompt. */
    readonly promptDescription: string;
};

export type StoryImageReferenceWarningCode =
    | "character_not_found"
    | "character_reference_missing"
    | "character_derived_view_missing"
    | "turnaround_sheet_retained"
    | "reference_storage_key_missing"
    | "reference_media_missing"
    | "scene_reference_unclassified"
    | "scene_reference_mismatch"
    | "ambiguous_other_reference_retained"
    | "duplicate_reference_retained"
    | "reference_count_limited"
    | "references_unsupported"
    | "references_unknown";

export type StoryImageReferenceWarning = {
    readonly code: StoryImageReferenceWarningCode;
    readonly message: string;
    readonly referenceId?: string;
    readonly entityId?: string;
};

export type StoryImageReferenceSelection = {
    /** Ordered descriptors that may be sent to the selected provider. */
    readonly submitted: readonly SubmittedStoryImageReference[];
    /** Alias for callers that need semantic descriptors by name. */
    readonly semanticDescriptors: readonly SubmittedStoryImageReference[];
    /** Every excluded input remains visible to callers; none is silently discarded. */
    readonly retainedButNotSubmitted: readonly StoryImageReferenceDescriptor[];
    readonly warnings: readonly StoryImageReferenceWarning[];
    /** Paid transport must honor this plan; retained reference intent is never re-labelled as T2I. */
    readonly submissionPlan:
        | { readonly state: "ready"; readonly operation: CanvasImageOperation; readonly referenceIntent: boolean }
        | {
            readonly state: "blocked";
            readonly operation: CanvasImageOperation;
            readonly referenceIntent: true;
            readonly reasonCode: StoryImageReferenceWarningCode;
        };
    /** Newline-separated `Image N` instructions for prompt concatenation. */
    readonly promptAppendix: string;
};

export type SelectStoryImageReferencesOptions = {
    readonly shot: StoryShot;
    readonly characters: readonly StoryCharacter[];
    /** Includes each character's semantic parent image node and derived-view metadata. */
    readonly nodes: readonly CanvasNodeData[];
    readonly capability: ResolvedImageModelCapability;
    readonly promptScope?: "single" | "grid9";
    /** The actual grid shots; required to preserve their semantic angle union. */
    readonly gridShots?: readonly StoryShot[];
    /** Optional user/workflow mitigation. Provider capability must not silently force this policy. */
    readonly identityReferenceStrategy?: "shot-angle" | "portrait-only";
    /** Ordered candidate lists from the calling layer. */
    readonly unboundCharacterReferences?: readonly StoryImageReferenceCandidate[];
    readonly sceneReferences?: readonly StoryImageReferenceCandidate[];
    readonly propReferences?: readonly StoryImageReferenceCandidate[];
    readonly otherReferences?: readonly StoryImageReferenceCandidate[];
    /** Preserve an explicit workflow operation; omission keeps legacy refs => edit behavior. */
    readonly requestedOperation?: CanvasImageOperation;
};

type UnorderedStoryImageReferenceDescriptor = Omit<StoryImageReferenceDescriptor, "candidateKey" | "originalOrder">;
type OrderStoryImageReferenceDescriptor = (
    descriptor: UnorderedStoryImageReferenceDescriptor,
) => StoryImageReferenceDescriptor;

const BACK_ANGLE_PATTERN = /背面|背影|后背|背部|\brear\b|\bback\b/iu;
const SIDE_ANGLE_PATTERN = /侧面|侧脸|侧身|\bprofile\b|\bside\b/iu;
const PORTRAIT_ANGLE_PATTERN = /特写|近景|脸部|面部|脸|\bface\b|\bportrait\b|\bclose[ -]?up\b/iu;

/**
 * Plans one identity crop per appearing character plus explicitly semantic
 * scene/prop/story/style references. It intentionally never turns a complete
 * turnaround sheet into a provider reference.
 */
export function selectStoryImageReferences(options: SelectStoryImageReferencesOptions): StoryImageReferenceSelection {
    const warnings: StoryImageReferenceWarning[] = [];
    const retainedButNotSubmitted: StoryImageReferenceDescriptor[] = [];
    const candidates: StoryImageReferenceDescriptor[] = [];
    const nodeById = new Map(options.nodes.map((node) => [node.id, node]));
    const seenCharacterIds = new Set<string>();
    const orderDescriptor = storyImageReferenceDescriptorOrderer();

    for (const characterId of appearingCharacterIds(options)) {
        if (!characterId || seenCharacterIds.has(characterId)) continue;
        seenCharacterIds.add(characterId);
        const character = options.characters.find((candidate) => candidate.id === characterId);
        if (!character) {
            const missingId = `story-character:${characterId}`;
            retainedButNotSubmitted.push(orderDescriptor({
                id: missingId,
                sourceNodeId: missingId,
                mediaSource: "missing",
                role: "identity",
                entityId: characterId,
                label: `未解析角色 ${characterId}`,
            }));
            warnings.push({
                code: "character_not_found",
                entityId: characterId,
                referenceId: missingId,
                message: `出场角色 ${characterId} 不在故事角色列表中，未提交身份参考。`,
            });
            continue;
        }

        const parent = characterReferenceParent(character, options.nodes, nodeById);
        if (!parent) {
            const missingId = `story-character:${character.id}`;
            retainedButNotSubmitted.push(orderDescriptor({
                id: missingId,
                sourceNodeId: missingId,
                mediaSource: "missing",
                role: "identity",
                entityId: character.id,
                label: `角色「${character.name}」缺失身份参考`,
            }));
            warnings.push({
                code: "character_reference_missing",
                entityId: character.id,
                referenceId: missingId,
                message: `角色「${character.name}」缺少带明确语义的身份参考资产，未提交身份参考。`,
            });
            continue;
        }

        const assetKind = parent.metadata?.storyCharacterAssetKind;
        if (assetKind === "turnaround_sheet") {
            const selectedAngles = selectedAnglesForCharacter(options, characterId);
            const derivedViews = completeDerivedViews(parent.metadata?.characterDerivedViews);
            if (derivedViews) {
                selectedAngles.forEach((angle) => {
                    const derived = derivedViews.get(angle);
                    if (derived) candidates.push(orderDescriptor(derivedViewDescriptor(character, parent.id, derived)));
                });
                continue;
            }

            const sheet = orderDescriptor({
                ...nodeDescriptor(parent, "identity", character.id, `角色「${character.name}」四视图设定表`),
                angle: "identity",
            });
            candidates.push(sheet);
            warnings.push({
                code: "character_derived_view_missing",
                entityId: character.id,
                referenceId: parent.id,
                message: `角色「${character.name}」单视图尚未切出（镜头需要：${selectedAngles.map(angleLabel).join("、")}）；先提交整张四视图设定表作为一张身份参考。`,
            });
            continue;
        }

        if (assetKind === "identity_reference") {
            candidates.push(orderDescriptor({
                ...nodeDescriptor(parent, "identity", character.id, `角色「${character.name}」身份参考`),
                angle: "identity",
            }));
            continue;
        }

        retainedButNotSubmitted.push(orderDescriptor(
            nodeDescriptor(parent, "identity", character.id, `角色「${character.name}」身份参考`),
        ));
        warnings.push({
            code: "character_reference_missing",
            entityId: character.id,
            referenceId: parent.id,
            message: `角色「${character.name}」的参考资产未标记为 identity_reference 或 turnaround_sheet，未提交。`,
        });
    }

    for (const reference of options.unboundCharacterReferences || []) {
        const descriptor = orderDescriptor(
            nodeDescriptor(reference.node, "identity", undefined, candidateLabel(reference)),
        );
        retainedButNotSubmitted.push(descriptor);
        warnings.push({
            code: "character_reference_missing",
            referenceId: descriptor.id,
            message: `角色输入「${descriptor.label}」无法唯一绑定到故事角色，已保留但未提交。`,
        });
    }

    appendSceneCandidates(candidates, retainedButNotSubmitted, warnings, options.sceneReferences || [], options.shot.sceneId, orderDescriptor);
    appendCandidates(candidates, retainedButNotSubmitted, warnings, options.propReferences || [], "prop", orderDescriptor);
    appendOtherCandidates(candidates, retainedButNotSubmitted, warnings, options.otherReferences || [], orderDescriptor);

    // 缺少角色身份参考图只作为警告提示，不再硬阻断整个故事分镜的生成与提交
    const hardBlockingReason = undefined;
    const referenceIntent = candidates.length > 0 || retainedButNotSubmitted.length > 0 || Boolean(hardBlockingReason);
    const plannedOperation = options.requestedOperation || (referenceIntent ? "edit" : "generate");
    const uniqueCandidates: StoryImageReferenceDescriptor[] = [];
    const seenReferenceKeys = new Set<string>();
    for (const candidate of candidates) {
        if (candidate.mediaSource === "missing") {
            retainedButNotSubmitted.push(candidate);
            warnings.push({
                code: "reference_media_missing",
                referenceId: candidate.id,
                entityId: candidate.entityId,
                message: `参考「${candidate.label}」没有可解析的 storageKey、content 或 backendUrl，已保留但未提交。`,
            });
            continue;
        }
        const key = `${candidate.id}\u0000${descriptorMediaKey(candidate)}`;
        if (seenReferenceKeys.has(key)) {
            retainedButNotSubmitted.push(candidate);
            warnings.push({
                code: "duplicate_reference_retained",
                referenceId: candidate.id,
                entityId: candidate.entityId,
                message: `参考「${candidate.label}」重复出现，已保留但不会重复提交。`,
            });
            continue;
        }
        seenReferenceKeys.add(key);
        uniqueCandidates.push(candidate);
    }

    if (options.capability.referenceCount.state !== "supported" && referenceIntent) {
        retainedButNotSubmitted.push(...uniqueCandidates);
        uniqueCandidates.forEach((candidate) => warnings.push({
            code: options.capability.referenceCount.state === "unsupported" ? "references_unsupported" : "references_unknown",
            referenceId: candidate.id,
            entityId: candidate.entityId,
            message: options.capability.referenceCount.state === "unsupported"
                ? `所选模型主要用于文生图；参考「${candidate.label}」已保留。`
                : `所选模型未标记支持多参考图；参考「${candidate.label}」已保留。`,
        }));
        return emptySubmission(retainedButNotSubmitted, warnings, {
            state: "ready",
            operation: "generate",
            referenceIntent: false,
        });
    }

    if (options.capability.referenceCount.state !== "supported") {
        return emptySubmission(retainedButNotSubmitted, warnings, {
            state: "ready",
            operation: "generate",
            referenceIntent: false,
        });
    }

    const max = options.capability.referenceCount.max;
    const submittedCandidates = max === null ? uniqueCandidates : uniqueCandidates.slice(0, Math.max(0, max));
    const overflow = max === null ? [] : uniqueCandidates.slice(Math.max(0, max));
    if (overflow.length) {
        retainedButNotSubmitted.push(...overflow);
        overflow.forEach((candidate) => warnings.push({
            code: "reference_count_limited",
            referenceId: candidate.id,
            entityId: candidate.entityId,
            message: `所选模型最多提交 ${max} 张参考图；参考「${candidate.label}」已保留但未提交。`,
        }));
    }

    const submitted = submittedCandidates.map((descriptor, index) => {
        const imageNumber = index + 1;
        return {
            ...descriptor,
            imageNumber,
            promptDescription: buildStoryReferencePromptDescription(
                imageNumber,
                descriptor,
                options.capability.storyPromptConstraintStyle || "explicit-exclusions",
                options.promptScope || "single",
            ),
        };
    });
    const submissionPlan: StoryImageReferenceSelection["submissionPlan"] = hardBlockingReason
        ? { state: "blocked", operation: "generate", referenceIntent: true, reasonCode: hardBlockingReason }
        : submitted.length > 0
        ? { state: "ready", operation: plannedOperation, referenceIntent: true }
        : { state: "ready", operation: "generate", referenceIntent: false };
    return {
        submitted,
        semanticDescriptors: submitted,
        retainedButNotSubmitted,
        warnings,
        submissionPlan,
        promptAppendix: options.capability.storyPromptConstraintStyle === "positive-only" &&
            submitted.length === 1 && submitted[0]?.role === "identity"
            ? ""
            : submitted.map((reference) => reference.promptDescription).join("\n"),
    };
}

/** Chooses the single derived angle required by the shot, in semantic priority order. */
export function selectStoryCharacterReferenceAngle(shot: StoryShot): CharacterDerivedViewAngle {
    const semanticText = [shot.title, shot.camera, shot.action, shot.visualContent, shot.imagePrompt]
        .filter((value): value is string => typeof value === "string")
        .join(" ");
    if (BACK_ANGLE_PATTERN.test(semanticText)) return "back";
    if (SIDE_ANGLE_PATTERN.test(semanticText)) return "side";
    if (PORTRAIT_ANGLE_PATTERN.test(semanticText)) return "portrait";
    return "front";
}

/** Stable first-seen union used by grid Story planning; duplicate angles never consume capacity twice. */
export function selectStoryCharacterReferenceAngles(shots: readonly StoryShot[]): CharacterDerivedViewAngle[] {
    const seen = new Set<CharacterDerivedViewAngle>();
    const angles: CharacterDerivedViewAngle[] = [];
    shots.forEach((shot) => {
        const angle = selectStoryCharacterReferenceAngle(shot);
        if (seen.has(angle)) return;
        seen.add(angle);
        angles.push(angle);
    });
    return angles;
}

function appearingCharacterIds(options: SelectStoryImageReferencesOptions) {
    const shots = options.promptScope === "grid9" && options.gridShots?.length ? options.gridShots : [options.shot];
    return [...new Set(shots.flatMap((shot) => shot.appearingCharacterIds || []).filter(Boolean))];
}

function selectedAnglesForCharacter(
    options: SelectStoryImageReferencesOptions,
    characterId: string,
): CharacterDerivedViewAngle[] {
    if (options.identityReferenceStrategy === "portrait-only") return ["portrait"];
    if (options.promptScope === "grid9" && options.gridShots?.length) {
        const relevantShots = options.gridShots.filter((shot) => shot.appearingCharacterIds?.includes(characterId));
        const angles = selectStoryCharacterReferenceAngles(relevantShots);
        if (angles.length) return angles;
    }
    return [selectStoryCharacterReferenceAngle(options.shot)];
}

function characterReferenceParent(
    character: StoryCharacter,
    nodes: readonly CanvasNodeData[],
    nodeById: ReadonlyMap<string, CanvasNodeData>,
) {
    const explicit = character.referenceNodeId ? nodeById.get(character.referenceNodeId) : undefined;
    if (explicit) return explicit;
    return nodes.find((node) => node.metadata?.storyCharacterId === character.id &&
        (node.metadata.storyCharacterAssetKind === "identity_reference" || node.metadata.storyCharacterAssetKind === "turnaround_sheet"));
}

function completeDerivedViews(views: readonly CharacterDerivedView[] | undefined) {
    const completeAngles: readonly CharacterDerivedViewAngle[] = ["front", "side", "back", "portrait"];
    if (!views || views.length !== completeAngles.length) return undefined;
    if (!completeAngles.every((expectedAngle) => {
        const matching = views.filter((view) => view.angle === expectedAngle && Boolean(view.id) && Boolean(view.storageKey));
        return matching.length === 1;
    })) return undefined;
    return new Map(views.map((view) => [view.angle, view] as const));
}

function derivedViewDescriptor(
    character: StoryCharacter,
    sourceNodeId: string,
    view: CharacterDerivedView,
): UnorderedStoryImageReferenceDescriptor {
    return {
        id: view.id,
        sourceNodeId,
        storageKey: view.storageKey,
        mediaSource: "storage-key",
        mimeType: view.mimeType,
        role: "identity",
        entityId: character.id,
        angle: view.angle,
        label: `角色「${character.name}」${view.label || angleLabel(view.angle)}视图`,
    };
}

function appendSceneCandidates(
    candidates: StoryImageReferenceDescriptor[],
    retained: StoryImageReferenceDescriptor[],
    warnings: StoryImageReferenceWarning[],
    references: readonly StoryImageReferenceCandidate[],
    sceneId: string | undefined,
    orderDescriptor: OrderStoryImageReferenceDescriptor,
) {
    for (const reference of references) {
        if (reference.role !== "scene") continue;
        if (!sceneId) {
            const descriptor = orderDescriptor(nodeDescriptor(reference.node, "scene", reference.entityId, candidateLabel(reference)));
            retained.push(descriptor);
            warnings.push({
                code: "scene_reference_unclassified",
                referenceId: descriptor.id,
                entityId: descriptor.entityId,
                message: `镜头缺少 sceneId；场景参考「${descriptor.label}」已保留但未提交。`,
            });
            continue;
        }
        if (reference.entityId !== sceneId) {
            const descriptor = orderDescriptor(nodeDescriptor(reference.node, "scene", reference.entityId, candidateLabel(reference)));
            retained.push(descriptor);
            warnings.push({
                code: "scene_reference_mismatch",
                referenceId: descriptor.id,
                entityId: descriptor.entityId,
                message: `场景参考「${descriptor.label}」属于 ${reference.entityId || "未分类场景"}，与当前镜头 ${sceneId} 不匹配；已保留但未提交。`,
            });
            continue;
        }
        appendCandidate(candidates, retained, warnings, reference, "scene", orderDescriptor);
    }
}

function appendCandidates(
    candidates: StoryImageReferenceDescriptor[],
    retained: StoryImageReferenceDescriptor[],
    warnings: StoryImageReferenceWarning[],
    references: readonly StoryImageReferenceCandidate[],
    expectedRole: "prop",
    orderDescriptor: OrderStoryImageReferenceDescriptor,
) {
    for (const reference of references) {
        if (reference.role !== expectedRole) continue;
        appendCandidate(candidates, retained, warnings, reference, expectedRole, orderDescriptor);
    }
}

function appendOtherCandidates(
    candidates: StoryImageReferenceDescriptor[],
    retained: StoryImageReferenceDescriptor[],
    warnings: StoryImageReferenceWarning[],
    references: readonly StoryImageReferenceCandidate[],
    orderDescriptor: OrderStoryImageReferenceDescriptor,
) {
    for (const reference of references) {
        if (reference.role === "story" || reference.role === "style") {
            appendCandidate(candidates, retained, warnings, reference, reference.role, orderDescriptor);
            continue;
        }
        const descriptor = orderDescriptor(nodeDescriptor(reference.node, "story", reference.entityId, candidateLabel(reference)));
        retained.push(descriptor);
        warnings.push({
            code: "ambiguous_other_reference_retained",
            referenceId: reference.node.id,
            entityId: reference.entityId,
            message: `其它参考「${descriptor.label}」未明确标记为 story 或 style，已保留但未提交。`,
        });
    }
}

function appendCandidate(
    candidates: StoryImageReferenceDescriptor[],
    retained: StoryImageReferenceDescriptor[],
    warnings: StoryImageReferenceWarning[],
    reference: StoryImageReferenceCandidate,
    role: Exclude<StoryImageReferenceRole, "identity">,
    orderDescriptor: OrderStoryImageReferenceDescriptor,
) {
    if (reference.node.metadata?.storyCharacterAssetKind === "turnaround_sheet") {
        const descriptor = orderDescriptor(nodeDescriptor(reference.node, role, reference.entityId, candidateLabel(reference)));
        retained.push(descriptor);
        warnings.push({
            code: "turnaround_sheet_retained",
            referenceId: reference.node.id,
            entityId: reference.entityId,
            message: `四视图设定表「${descriptor.label}」已保留但未提交；调用侧须显式扩展为单视图资产。`,
        });
        return;
    }
    candidates.push(orderDescriptor(nodeDescriptor(reference.node, role, reference.entityId, candidateLabel(reference))));
}

function nodeDescriptor(
    node: CanvasNodeData,
    role: StoryImageReferenceRole,
    entityId: string | undefined,
    label: string,
): UnorderedStoryImageReferenceDescriptor {
    const storageKey = stringValue(node.metadata?.storageKey);
    const content = stringValue(node.metadata?.content);
    const backendUrl = stringValue(node.metadata?.backendUrl);
    const mediaSource = storageKey ? "storage-key" : content ? "content" : backendUrl ? "backend-url" : "missing";
    return {
        id: node.id,
        sourceNodeId: node.id,
        ...(storageKey ? { storageKey } : {}),
        ...(content ? { dataUrl: content } : {}),
        ...(backendUrl ? { url: backendUrl } : {}),
        mediaSource,
        ...(stringValue(node.metadata?.mimeType) ? { mimeType: stringValue(node.metadata?.mimeType) } : {}),
        role,
        ...(entityId ? { entityId } : {}),
        label,
    };
}

function storyImageReferenceDescriptorOrderer(): OrderStoryImageReferenceDescriptor {
    let originalOrder = 0;
    const occurrences = new Map<string, number>();
    return (descriptor) => {
        const semanticKey = [
            descriptor.role,
            descriptor.sourceNodeId,
            descriptor.id,
            descriptor.entityId || "",
            descriptor.angle || "",
        ].map((value) => encodeURIComponent(value)).join(":");
        const occurrence = occurrences.get(semanticKey) || 0;
        occurrences.set(semanticKey, occurrence + 1);
        return {
            ...descriptor,
            candidateKey: `story-reference:${semanticKey}:${occurrence}`,
            originalOrder: originalOrder++,
        };
    };
}

function candidateLabel(reference: StoryImageReferenceCandidate) {
    return stringValue(reference.label) || stringValue(reference.node.title) || reference.node.id;
}

function emptySubmission(
    retainedButNotSubmitted: readonly StoryImageReferenceDescriptor[],
    warnings: readonly StoryImageReferenceWarning[],
    submissionPlan: StoryImageReferenceSelection["submissionPlan"],
): StoryImageReferenceSelection {
    return { submitted: [], semanticDescriptors: [], retainedButNotSubmitted, warnings, submissionPlan, promptAppendix: "" };
}

function descriptorMediaKey(descriptor: StoryImageReferenceDescriptor) {
    return descriptor.storageKey || descriptor.dataUrl || descriptor.url || "missing";
}

function firstBlockingReason(warnings: readonly StoryImageReferenceWarning[]): StoryImageReferenceWarningCode {
    return warnings.find((warning) =>
        warning.code === "character_not_found" ||
        warning.code === "character_reference_missing" ||
        warning.code === "reference_media_missing" ||
        warning.code === "scene_reference_unclassified" ||
        warning.code === "scene_reference_mismatch" ||
        warning.code === "ambiguous_other_reference_retained" ||
        warning.code === "reference_count_limited"
    )?.code || "reference_media_missing";
}

function angleLabel(angle: CharacterDerivedViewAngle | "identity" | undefined) {
    if (angle === "back") return "背面";
    if (angle === "side") return "侧面";
    if (angle === "portrait") return "特写";
    if (angle === "identity") return "单图";
    return "正面";
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
