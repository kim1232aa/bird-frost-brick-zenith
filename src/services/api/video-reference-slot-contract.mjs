export function resolveVideoReferenceSlotContract({ capability, operation, references = [], videos = [] }) {
  const policy = capability.intentPolicy;
  const blockedReason = capability.requiresExplicitProfile
    ? "当前模型需要配置精确 video capability profile，现有引用保留但不提交"
    : policy === "blocked"
      ? capability.referenceContractBlockReason || "当前模型的参考媒体合同未核验，现有引用保留但不提交"
      : undefined;
  if (blockedReason) return blockedContract(references, videos, blockedReason, "blocked-contract", operation);
  const exclusiveMode = framesOrReferenceSetMode(policy, operation);
  const unsupportedOperationReason = videoOperationBlockReason(capability, operation, exclusiveMode);
  if (unsupportedOperationReason) return blockedContract(references, videos, unsupportedOperationReason, "unsupported-operation", operation);
  if (!operation && (references.length > 0 || videos.length > 0)) {
    return blockedContract(references, videos, "现有参考媒体必须显式选择视频 operation；不能按引用数量或用途猜测付费请求类型", "operation-required");
  }
  if (!operation && capabilityRequiresExplicitOperation(capability)) {
    return blockedContract(references, videos, "当前模型提供多个视频 operation；必须显式选择视频 operation，不能按引用数量或用途猜测付费请求类型", "operation-required");
  }
  if (policy === "frames-or-reference-set" && !exclusiveMode && operation !== "text-to-video") {
    return blockedContract(
      references,
      videos,
      "当前模型同时提供帧模式和普通参考集模式；必须显式选择视频 operation，不能按图片顺序猜测",
      "operation-required",
      operation,
    );
  }
  const allVideoSlots = capability.videoInputPolicy?.supported
    ? capability.videoInputPolicy.uses.map((useAs) => ({ useAs, minimum: capability.videoInputPolicy.min, maximum: capability.videoInputPolicy.max }))
    : [];
  const normalizedVideos = videos.map((video) => ({ reference: video, useAs: normalizeVideoUseAs(video.useAs, capability) }));
  const requiredVideoUseAs = operationVideoUseAs(operation);
  const videoSlots = requiredVideoUseAs
    ? allVideoSlots.filter((slot) => slot.useAs === requiredVideoUseAs)
    : operation
      ? []
      : allVideoSlots;
  const acceptsVideoOperation = requiredVideoUseAs
    ? allVideoSlots.some((slot) => slot.useAs === requiredVideoUseAs)
    : !operation && normalizedVideos.every(({ useAs }) => videoSlots.some((slot) => slot.useAs === useAs));
  const videoMinimum = operation && acceptsVideoOperation && capability.videoInputPolicy?.supported ? capability.videoInputPolicy.min : 0;
  const videoMaximum = acceptsVideoOperation && capability.videoInputPolicy?.supported ? capability.videoInputPolicy.max : 0;
  const invalidVideoRole = normalizedVideos.find(({ useAs }) => (requiredVideoUseAs && useAs !== requiredVideoUseAs) || !videoSlots.some((slot) => slot.useAs === useAs));
  if (normalizedVideos.length && (!acceptsVideoOperation || invalidVideoRole)) {
    const reason = !acceptsVideoOperation
      ? `当前 operation ${operation || "未指定"} 不接收视频候选`
      : `当前 operation ${operation} 不接受视频用途 ${invalidVideoRole?.useAs || "未指定"}`;
    return blockedContract(references, videos, reason, acceptsVideoOperation ? "unsupported-video-purpose" : "operation-does-not-accept-videos", operation, normalizedVideos, videoSlots);
  }
  const videoMinimumMissing = acceptsVideoOperation && normalizedVideos.length < videoMinimum;
  const videoMaximumExceeded = acceptsVideoOperation && videoMaximum !== null && normalizedVideos.length > videoMaximum;
  const sharedMaximum = capability.sharedImageVideoMaximum ?? null;
  const referenceVideoCount = sharedMaximum !== null
    ? normalizedVideos.filter((video) => video.useAs === "reference_video").length
    : 0;
  const ordinaryMaximum = capability.referenceImagePolicy.supported ? capability.referenceImagePolicy.max : 0;
  const sharedRemaining = sharedMaximum === null ? null : Math.max(0, sharedMaximum - referenceVideoCount);
  const effectiveOrdinaryMaximum = ordinaryMaximum === null ? sharedRemaining : sharedRemaining === null ? ordinaryMaximum : Math.min(ordinaryMaximum, sharedRemaining);
  const imagePurposes = imagePurposesForOperation(capability, operation, exclusiveMode);
  const operationOrdinaryMaximum = imagePurposes.ordinary ? effectiveOrdinaryMaximum : 0;
  const keyframeMaximum = capability.supportsKeyframeSequence ? capability.keyframeImageLimit ?? null : 0;
  const keyframeMinimum = capability.supportsKeyframeSequence ? capability.keyframeImageMinimum ?? 0 : 0;
  if (videoMinimumMissing || videoMaximumExceeded) {
    const maximum = videoMaximum === null ? "官方未公布上限" : String(videoMaximum);
    const operationKeyframeMaximum = imagePurposes.keyframes ? keyframeMaximum : 0;
    return blockedContract(references, videos, `当前 operation 的参考视频要求 ${videoMinimum}..${maximum} 个，当前为 ${normalizedVideos.length} 个`, "video-cardinality", operation, normalizedVideos, videoSlots, {
      visibleImageSlotPurposes: visiblePurposes({ capability, policy, references, effectiveOrdinaryMaximum: operationOrdinaryMaximum, state: "known", imagePurposes }),
      nextImageConnectionPurpose: nextConnectionPurpose({ operation, imagePurposes, firstFrameCount: 0, lastFrameCount: 0, keyframeCount: 0, keyframeMaximum, ordinaryCount: 0, effectiveOrdinaryMaximum: operationOrdinaryMaximum }),
      ordinaryReferenceMaximum: operationOrdinaryMaximum,
      temporalSlots: { firstFrame: imagePurposes.firstFrame, lastFrame: imagePurposes.lastFrame, keyframes: imagePurposes.keyframes, keyframeMaximum: operationKeyframeMaximum },
    });
  }
  const submitted = [];
  const notSubmitted = [];
  let firstFrameCount = 0;
  let lastFrameCount = 0;
  let keyframeCount = 0;
  let ordinaryCount = 0;
  const temporalSequenceAtCapacity = () => imagePurposes.keyframes && keyframeMaximum !== null && firstFrameCount + lastFrameCount + keyframeCount >= keyframeMaximum;
  const reject = (reference, reasonCode, reason) => notSubmitted.push({ reference, reasonCode, reason });
  references.forEach((reference) => {
    const useAs = normalizedUseAs(reference.useAs);
    if (reference.referenceOrigin === "story_auto") {
      if (capability.storyAutoReferencePolicy === "disabled") return reject(reference, "workflow-policy", "当前 service 未启用 Story 自动参考提交，该参考不会提交");
      if (capability.storyAutoReferencePolicy === "current-shot" && reference.role !== "current_shot" && useAs === "reference_image") return reject(reference, "workflow-policy", "当前 Story 策略只自动提交时序分镜，该语义参考不会提交");
    }
    if (policy === "none" || operation === "text-to-video") return reject(reference, "operation-does-not-accept-images", "当前 operation 不接收图片");
    if (policy === "frames-or-reference-set") {
      const referenceMode = useAs === "reference_image" ? "references" : "frames";
      if (exclusiveMode && referenceMode !== exclusiveMode) return reject(reference, "mixed-operation", "当前 operation 的帧模式与普通参考集模式必须二选一");
    }
    if (useAs === "first_frame") {
      if (!imagePurposes.firstFrame) return reject(reference, "unsupported-purpose", "当前 operation 不支持首帧");
      if (firstFrameCount >= 1) return reject(reference, "slot-occupied", "首帧槽位已占用");
      if (temporalSequenceAtCapacity()) return reject(reference, "capacity", `关键帧序列最多 ${keyframeMaximum} 张`);
      firstFrameCount += 1; submitted.push(reference); return;
    }
    if (useAs === "last_frame") {
      if (!imagePurposes.lastFrame) return reject(reference, "unsupported-purpose", "当前 operation 不支持尾帧");
      if (lastFrameCount >= 1) return reject(reference, "slot-occupied", "尾帧槽位已占用");
      if (temporalSequenceAtCapacity()) return reject(reference, "capacity", `关键帧序列最多 ${keyframeMaximum} 张`);
      lastFrameCount += 1; submitted.push(reference); return;
    }
    if (useAs === "keyframe") {
      if (!imagePurposes.keyframes) return reject(reference, "unsupported-purpose", "当前 operation 不支持中间关键帧");
      if (temporalSequenceAtCapacity()) return reject(reference, "capacity", `关键帧序列最多 ${keyframeMaximum} 张`);
      keyframeCount += 1; submitted.push(reference); return;
    }
    if (!imagePurposes.ordinary) return reject(reference, "unsupported-purpose", "当前 operation 不支持普通参考图");
    if (operationOrdinaryMaximum !== null && ordinaryCount >= operationOrdinaryMaximum) return reject(reference, "capacity", sharedMaximum !== null ? `普通参考图与参考视频共享最多 ${sharedMaximum} 个槽位` : `普通参考图最多 ${operationOrdinaryMaximum} 张`);
    ordinaryCount += 1; submitted.push(reference);
  });
  const continuationAllowsLoneLast = capability.id === "dashscope-wan27-i2v" && videos.some((video) => video.useAs === "first_clip");
  if (lastFrameCount && !firstFrameCount && !continuationAllowsLoneLast) {
    const index = submitted.findIndex((reference) => normalizedUseAs(reference.useAs) === "last_frame");
    if (index >= 0) { const [reference] = submitted.splice(index, 1); reject(reference, "missing-first-frame", "尾帧必须与显式首帧一起提交"); lastFrameCount = 0; }
  }
  const missingRequiredFrameReason = requiredFrameReason(operation, firstFrameCount, lastFrameCount, keyframeCount, keyframeMinimum);
  if (missingRequiredFrameReason) {
    const operationKeyframeMaximum = imagePurposes.keyframes ? keyframeMaximum : 0;
    return blockedContract(references, videos, missingRequiredFrameReason, "missing-required-frame", operation, normalizedVideos, videoSlots, {
      visibleImageSlotPurposes: visiblePurposes({ capability, policy, references, effectiveOrdinaryMaximum: operationOrdinaryMaximum, state: "known", imagePurposes }),
      nextImageConnectionPurpose: nextConnectionPurpose({ operation, imagePurposes, firstFrameCount, lastFrameCount, keyframeCount, keyframeMaximum, ordinaryCount, effectiveOrdinaryMaximum: operationOrdinaryMaximum }),
      ordinaryReferenceMaximum: operationOrdinaryMaximum,
      temporalSlots: { firstFrame: imagePurposes.firstFrame, lastFrame: imagePurposes.lastFrame, keyframes: imagePurposes.keyframes, keyframeMaximum: operationKeyframeMaximum },
    });
  }
  if (operation === "reference-to-video" && capability.referenceImagePolicy.supported && ordinaryCount + normalizedVideos.filter((video) => video.useAs === "reference_video").length < capability.referenceImagePolicy.min) {
    const minimum = capability.referenceImagePolicy.min;
    const operationKeyframeMaximum = imagePurposes.keyframes ? keyframeMaximum : 0;
    return blockedContract(references, videos, `当前 reference-to-video 至少需要 ${minimum} 个普通参考图或参考视频`, "capacity", operation, normalizedVideos, videoSlots, {
      visibleImageSlotPurposes: visiblePurposes({ capability, policy, references, effectiveOrdinaryMaximum: operationOrdinaryMaximum, state: "known", imagePurposes }),
      nextImageConnectionPurpose: nextConnectionPurpose({ operation, imagePurposes, firstFrameCount, lastFrameCount, keyframeCount, keyframeMaximum, ordinaryCount, effectiveOrdinaryMaximum: operationOrdinaryMaximum }),
      ordinaryReferenceMaximum: operationOrdinaryMaximum,
      temporalSlots: { firstFrame: imagePurposes.firstFrame, lastFrame: imagePurposes.lastFrame, keyframes: imagePurposes.keyframes, keyframeMaximum: operationKeyframeMaximum },
    });
  }
  const operationKeyframeMaximum = imagePurposes.keyframes ? keyframeMaximum : 0;
  const state = operationOrdinaryMaximum === null || operationKeyframeMaximum === null || (acceptsVideoOperation && videoMaximum === null) ? "unbounded" : "known";
  const imageCandidates = references.map((reference) => ({ mediaType: "image", reference }));
  const videoCandidates = normalizedVideos.map(({ reference, useAs }) => ({ mediaType: "video", reference, useAs }));
  const mediaCandidates = [...imageCandidates, ...videoCandidates];
  const submittedImages = new Set(submitted);
  const mediaSubmitted = mediaCandidates.filter((candidate) => candidate.mediaType === "video" || submittedImages.has(candidate.reference));
  const rejectedImages = new Map(notSubmitted.map((item) => [item.reference, item]));
  const mediaNotSubmitted = mediaCandidates.flatMap((candidate) => {
    if (candidate.mediaType === "video") return [];
    const rejection = rejectedImages.get(candidate.reference);
    return rejection ? [{ candidate, reasonCode: rejection.reasonCode, reason: rejection.reason }] : [];
  });
  return {
    state,
    recoverable: false,
    ...(state === "unbounded" ? { reason: "官方合同未公布该图片数组的上限" } : {}),
    ...(operation ? { operation } : {}),
    mode: exclusiveMode || null,
    candidates: [...references],
    visibleImageSlotPurposes: operation === "text-to-video" ? [] : visiblePurposes({ capability, policy, references, effectiveOrdinaryMaximum: operationOrdinaryMaximum, state, imagePurposes }),
    nextImageConnectionPurpose: operation === "text-to-video"
      ? null
      : nextConnectionPurpose({ operation, imagePurposes, firstFrameCount, lastFrameCount, keyframeCount, keyframeMaximum, ordinaryCount, effectiveOrdinaryMaximum: operationOrdinaryMaximum }),
    ordinaryReferenceMaximum: operationOrdinaryMaximum,
    temporalSlots: {
      firstFrame: imagePurposes.firstFrame,
      lastFrame: imagePurposes.lastFrame,
      keyframes: imagePurposes.keyframes, keyframeMaximum: operationKeyframeMaximum,
    },
    videoSlots, sharedImageVideoMaximum: sharedMaximum, sharedRemainingCapacity: sharedRemaining,
    submitted, notSubmitted, mediaCandidates, mediaSubmitted, mediaNotSubmitted,
  };
}

export function blockUnverifiedVideoMediaContract({ references = [], videos = [], operation, reason = "当前 customer 视频端点没有显式验证的参考媒体 serializer/profile" }) {
  return blockedContract(references, videos, reason, "blocked-contract", operation);
}

function blockedContract(references, videos, reason, reasonCode, operation, normalizedVideos = videos.map((video) => ({ reference: video, useAs: String(video.useAs || "unknown") })), preservedVideoSlots = [], recovery) {
  const mediaCandidates = [
    ...references.map((reference) => ({ mediaType: "image", reference })),
    ...normalizedVideos.map(({ reference, useAs }) => ({ mediaType: "video", reference, useAs })),
  ];
  return { state: "blocked", recoverable: Boolean(recovery), reason, ...(operation ? { operation } : {}), mode: null, candidates: [...references], visibleImageSlotPurposes: recovery?.visibleImageSlotPurposes || [], nextImageConnectionPurpose: recovery?.nextImageConnectionPurpose ?? null, ordinaryReferenceMaximum: recovery?.ordinaryReferenceMaximum ?? 0,
    temporalSlots: recovery?.temporalSlots || { firstFrame: false, lastFrame: false, keyframes: false, keyframeMaximum: 0 }, videoSlots: preservedVideoSlots,
    sharedImageVideoMaximum: null, sharedRemainingCapacity: null, submitted: [],
    notSubmitted: references.map((reference) => ({ reference, reasonCode, reason })),
    mediaCandidates, mediaSubmitted: [], mediaNotSubmitted: mediaCandidates.map((candidate) => ({ candidate, reasonCode, reason })) };
}

function operationVideoUseAs(operation) {
  if (operation === "reference-to-video") return "reference_video";
  if (operation === "continuation") return "first_clip";
  if (operation === "video-edit") return "source_video";
  return undefined;
}

function normalizeVideoUseAs(useAs, capability) {
  if (useAs) return useAs;
  if (capability.legacyUndefinedVideoUseAs) return capability.legacyUndefinedVideoUseAs;
  const uses = capability.videoInputPolicy?.supported ? capability.videoInputPolicy.uses : [];
  return uses.length === 1 ? uses[0] : "unknown";
}

function visiblePurposes({ capability, policy, references, effectiveOrdinaryMaximum, state, imagePurposes }) {
  if (policy === "none") return [];
  if (imagePurposes.keyframes) {
    if (state === "unbounded") {
      const existing = references.filter((reference) => ["first_frame", "last_frame", "keyframe"].includes(normalizedUseAs(reference.useAs))).length;
      const visibleCount = Math.max(existing, supportsFirstFrameSlot(capability) ? 1 : 0);
      return Array.from({ length: visibleCount }, (_, index) => index === 0 ? "first_frame" : "keyframe");
    }
    return Array.from({ length: capability.keyframeImageLimit || 0 }, (_, index) => index === 0 ? "first_frame" : "keyframe");
  }
  const purposes = [];
  if (imagePurposes.firstFrame) purposes.push("first_frame");
  if (imagePurposes.lastFrame) purposes.push("last_frame");
  if (imagePurposes.ordinary) {
    const count = effectiveOrdinaryMaximum === null ? Math.max(references.filter((reference) => normalizedUseAs(reference.useAs) === "reference_image").length, capability.referenceImagePolicy.supported ? capability.referenceImagePolicy.min : 0) : effectiveOrdinaryMaximum;
    purposes.push(...Array.from({ length: count }, () => "reference_image"));
  }
  return purposes;
}

function normalizedUseAs(value) { return value === "first_frame" || value === "last_frame" || value === "keyframe" ? value : "reference_image"; }
function nextConnectionPurpose({ operation, imagePurposes, firstFrameCount, lastFrameCount, keyframeCount, keyframeMaximum, ordinaryCount, effectiveOrdinaryMaximum }) {
  if (operation === "reference-to-video" || operation === "video-edit") {
    if (imagePurposes.ordinary && (effectiveOrdinaryMaximum === null || ordinaryCount < effectiveOrdinaryMaximum)) return "reference_image";
    return null;
  }
  if (!operation && imagePurposes.ordinary) {
    return effectiveOrdinaryMaximum === null || ordinaryCount < effectiveOrdinaryMaximum ? "reference_image" : null;
  }
  if (imagePurposes.firstFrame && !firstFrameCount) return "first_frame";
  if (imagePurposes.keyframes) return keyframeMaximum === null || firstFrameCount + lastFrameCount + keyframeCount < keyframeMaximum ? "keyframe" : null;
  if (imagePurposes.lastFrame && !lastFrameCount) return "last_frame";
  if (imagePurposes.ordinary && (effectiveOrdinaryMaximum === null || ordinaryCount < effectiveOrdinaryMaximum)) return "reference_image";
  return null;
}
function imagePurposesForOperation(capability, operation, exclusiveMode) {
  const base = {
    firstFrame: supportsFirstFrameSlot(capability),
    lastFrame: supportsLastFrameSlot(capability),
    keyframes: Boolean(capability.supportsKeyframeSequence),
    ordinary: supportsOrdinaryReferenceSlot(capability),
  };
  if (!operation) return base;
  if (operation === "text-to-video") return { firstFrame: false, lastFrame: false, keyframes: false, ordinary: false };
  if (operation === "image-to-video") return { firstFrame: base.firstFrame, lastFrame: false, keyframes: false, ordinary: false };
  if (operation === "first-last-frame-to-video") return { firstFrame: base.firstFrame, lastFrame: base.lastFrame, keyframes: false, ordinary: false };
  if (operation === "keyframes-to-video") return { firstFrame: base.firstFrame, lastFrame: base.lastFrame, keyframes: base.keyframes, ordinary: false };
  if (operation === "continuation") return { firstFrame: false, lastFrame: base.lastFrame, keyframes: false, ordinary: false };
  if (operation === "video-edit") return { firstFrame: false, lastFrame: false, keyframes: false, ordinary: base.ordinary };
  if (operation === "reference-to-video") {
    return {
      firstFrame: base.firstFrame && (capability.intentPolicy === "r2v-with-first" || capability.intentPolicy === "reference-set-with-frames"),
      lastFrame: base.lastFrame && capability.intentPolicy === "reference-set-with-frames",
      keyframes: false,
      ordinary: base.ordinary && exclusiveMode !== "frames",
    };
  }
  return base;
}
function videoOperationBlockReason(capability, operation, exclusiveMode) {
  if (!operation) return "";
  if (capability.requiresFirstLastFrame && operation !== "first-last-frame-to-video") return "当前模型只支持视频 operation first-last-frame-to-video";
  if (capability.supportedOperations?.length) {
    return capability.supportedOperations.includes(operation) ? "" : `当前模型不支持视频 operation ${operation}`;
  }
  const imagePurposes = imagePurposesForOperation(capability, operation, exclusiveMode);
  const exactKinds = capability.allowedReferenceIntentKinds;
  const acceptsOperation = operation === "text-to-video"
    ? (capability.intentPolicy === "none" || Boolean(exactKinds?.includes("none"))) && !(capability.videoInputPolicy.supported && capability.videoInputPolicy.min > 0)
    : operation === "image-to-video"
      ? imagePurposes.firstFrame
      : operation === "first-last-frame-to-video"
        ? imagePurposes.firstFrame && imagePurposes.lastFrame
        : operation === "keyframes-to-video"
          ? imagePurposes.keyframes
          : operation === "reference-to-video"
            ? imagePurposes.ordinary || (capability.videoInputPolicy.supported && capability.videoInputPolicy.uses.includes("reference_video"))
            : operation === "continuation"
              ? capability.videoInputPolicy.supported && capability.videoInputPolicy.uses.includes("first_clip")
              : operation === "video-edit"
                ? capability.videoInputPolicy.supported && capability.videoInputPolicy.uses.includes("source_video")
                : false;
  return acceptsOperation ? "" : `当前模型不支持视频 operation ${operation}`;
}
function requiredFrameReason(operation, firstFrameCount, lastFrameCount, keyframeCount, keyframeMinimum) {
  if (operation === "keyframes-to-video" && firstFrameCount + lastFrameCount + keyframeCount < keyframeMinimum) return `当前 operation keyframes-to-video 至少需要 ${keyframeMinimum} 张关键帧图片`;
  if ((operation === "image-to-video" || operation === "keyframes-to-video") && firstFrameCount === 0) return `当前 operation ${operation} 缺少必需首帧`;
  if (operation === "first-last-frame-to-video" && (!firstFrameCount || !lastFrameCount)) return "当前 operation first-last-frame-to-video 必须同时提供首帧和尾帧";
  return "";
}
function capabilityRequiresExplicitOperation(capability) {
  if ((capability.supportedOperations?.length || 0) > 1) return true;
  const kinds = capability.allowedReferenceIntentKinds;
  if (!kinds) return capability.intentPolicy === "reference-set-with-frames";
  const operations = new Set();
  if (kinds.includes("none") && !(capability.videoInputPolicy.supported && capability.videoInputPolicy.min > 0)) operations.add("text-to-video");
  if (kinds.includes("first_frame")) operations.add("image-to-video");
  if (kinds.includes("first_last_frame")) operations.add("first-last-frame-to-video");
  if (kinds.some((kind) => kind === "reference_set" || kind === "reference_set_with_first" || kind === "reference_set_with_frames")) operations.add("reference-to-video");
  if (capability.videoInputPolicy.supported) {
    if (capability.videoInputPolicy.uses.includes("reference_video")) operations.add("reference-to-video");
    if (capability.videoInputPolicy.uses.includes("first_clip")) operations.add("continuation");
    if (capability.videoInputPolicy.uses.includes("source_video")) operations.add("video-edit");
  }
  return operations.size > 1;
}
function framesOrReferenceSetMode(policy, operation) {
  if (policy !== "frames-or-reference-set") return undefined;
  if (operation === "reference-to-video") return "references";
  if (operation === "image-to-video" || operation === "first-last-frame-to-video" || operation === "keyframes-to-video") return "frames";
  return undefined;
}
function supportsFirstFrameSlot(capability) {
  const exact = capability.allowedReferenceIntentKinds;
  if (exact) return exact.some((kind) => kind === "first_frame" || kind === "first_last_frame" || kind === "reference_set_with_first" || kind === "reference_set_with_frames");
  return capability.supportsFirstFrame || capability.supportsReferenceSetWithFirst || Boolean(capability.supportsReferenceSetWithFrames);
}
function supportsLastFrameSlot(capability) {
  const exact = capability.allowedReferenceIntentKinds;
  if (exact) return exact.some((kind) => kind === "first_last_frame" || kind === "reference_set_with_frames");
  return capability.supportsFirstLastFrame || Boolean(capability.supportsReferenceSetWithFrames);
}
function supportsOrdinaryReferenceSlot(capability) {
  if (!capability.referenceImagePolicy.supported) return false;
  const exact = capability.allowedReferenceIntentKinds;
  return !exact || exact.some((kind) => kind === "reference_set" || kind === "reference_set_with_first" || kind === "reference_set_with_frames");
}
