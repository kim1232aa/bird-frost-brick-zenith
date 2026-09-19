"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { findCatalog, catalogKey } from "@/studio/catalog";
import { captureVideoFrame, evenFrameTimes, extractVideoFrames, videoFileUrl } from "@/studio/frame-extract";
import { createStudioVideo, waitStudioVideo } from "@/studio/generate/video";
import { useStudioJobs } from "@/studio/generate/jobs";
import { GALLERY_SEED } from "@/studio/gallery-seed";
import { useStudioHistory } from "@/studio/history";
import { filesToDataUrls } from "@/studio/image-refs";
import { useMediaDraft } from "@/studio/media-draft";
import { useMembershipStore } from "@/studio/membership";
import { liveCard, modelPoints, selectableCatalog, studioGenerateCreditGate, useOpsStore } from "@/studio/ops";
import { preferredTextKey, preferredVideoKey, StudioModelField } from "@/studio/model-select";
import { VIDEO_TEMPLATES } from "@/studio/prompt-bank";
import { useStudioSession } from "@/studio/session";
import { dropToCanvas, queryParam, splitModel } from "@/studio/split";
import { enhancePrompt } from "@/studio/story/plan";
import { StageOverlay, WorkbenchStatus } from "@/studio/workbench-status";
import { GuestGenerateBanner, useGenerateAccess } from "@/studio/auth-gate";
import {
  buildVideoStudioGenerateFields,
  snapVideoStudioFps,
  videoStudioCivitaiControls,
} from "@/pages/video-studio-page.logic";
import { videoStudioModeFromQuery, videoStudioModeLocation } from "@/pages/studio-mode-routes";
import { pushMediaToCanvasWorkspace } from "@/studio/canvas/push-to-workspace";
import {
  VIDEO_GENERATION_PARAMETER_NAMES,
  type VideoGenerationParameterDescriptor,
} from "@/services/api/video-model-capabilities";

type VideoMode = "t2v" | "i2v" | "flf" | "extract";
type VideoStudioDescriptor = VideoGenerationParameterDescriptor;

const DEFAULT_RATIO_OPTIONS = ["16:9", "9:16", "1:1"] as const;

function uniqueStrings(values: readonly (string | number | boolean)[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const text = String(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    next.push(text);
  }
  return next;
}

function descriptorNamed(descriptors: readonly VideoStudioDescriptor[], name: VideoStudioDescriptor["name"]) {
  return descriptors.find((item) => item.name === name);
}

function parseOptionalNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  return Number(text);
}

function parseDimensionPair(value: string) {
  const match = /^(\d+)\s*[x×*]\s*(\d+)$/.exec(value.trim());
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function aspectPreviewBox(item: string) {
  const [w, h] = item.split(":").map(Number);
  if (!w || !h) return undefined;
  const max = 22;
  return w >= h
    ? { width: max, height: Math.max(8, Math.round((max * h) / w)) }
    : { width: Math.max(8, Math.round((max * w) / h)), height: max };
}

const TEMPLATE_GROUPS = (() => {
  const map = new Map<string, typeof VIDEO_TEMPLATES>();
  for (const item of VIDEO_TEMPLATES) {
    const group = item.group || "模板";
    const list = map.get(group) || [];
    list.push(item);
    map.set(group, list);
  }
  return [...map.entries()];
})();

export function VideoStudioPage({ initialMode = "t2v" }: { initialMode?: VideoMode }) {
  const navigate = useNavigate();
  const relays = useStudioSession((state) => state.relays);
  const items = useStudioHistory((state) => state.items);
  const addHistory = useStudioHistory((state) => state.add);
  const remaining = useOpsStore((state) => state.credits.video);
  const record = useMembershipStore((state) => state.record);
  const startJob = useStudioJobs((state) => state.start);
  const succeedJob = useStudioJobs((state) => state.succeed);
  const failJob = useStudioJobs((state) => state.fail);
  const access = useGenerateAccess();
  const [selection, setSelection] = useState(preferredVideoKey());
  const [textModel, setTextModel] = useState(preferredTextKey());
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(6);
  const [ratio, setRatio] = useState("16:9");
  const firstFrame = useMediaDraft((state) => state.firstFrame);
  const lastFrame = useMediaDraft((state) => state.lastFrame);
  const setFirstFrame = useMediaDraft((state) => state.setFirstFrame);
  const setLastFrame = useMediaDraft((state) => state.setLastFrame);
  const clipUrl = useMediaDraft((state) => state.clipUrl);
  const setClipUrl = useMediaDraft((state) => state.setClipUrl);
  const frames = useMediaDraft((state) => state.frames);
  const setFrames = useMediaDraft((state) => state.setFrames);
  const [audio, setAudio] = useState(true);
  const [mode, setMode] = useState<VideoMode>(initialMode);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [polishBusy, setPolishBusy] = useState(false);
  const [polishError, setPolishError] = useState("");
  const [url, setUrl] = useState("");
  const [frameCount, setFrameCount] = useState(6);
  const [fps, setFps] = useState(24);
  const [loras, setLoras] = useState<Array<{ resource: string; weight: number }>>([{ resource: "", weight: 1 }]);
  const [resolution, setResolution] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [watermark, setWatermark] = useState<boolean | undefined>(undefined);
  const [promptExpansion, setPromptExpansion] = useState<boolean | undefined>(undefined);
  const [returnLastFrame, setReturnLastFrame] = useState<boolean | undefined>(undefined);
  const [audioUrl, setAudioUrl] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [steps, setSteps] = useState("");
  const [guidance, setGuidance] = useState("");
  const [modelVariant, setModelVariant] = useState("");
  const [generationFrames, setGenerationFrames] = useState("");
  const [audioMode, setAudioMode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [generationMode, setGenerationMode] = useState("");
  const [frameGuideStrength, setFrameGuideStrength] = useState("");
  const [safetyChecker, setSafetyChecker] = useState<boolean | undefined>(undefined);
  const [shift, setShift] = useState("");
  const [turbo, setTurbo] = useState<boolean | undefined>(undefined);
  const [sampler, setSampler] = useState("");
  const [scheduler, setScheduler] = useState("");
  const [usePro, setUsePro] = useState<boolean | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setMode(videoStudioModeFromQuery(queryParam("mode"), initialMode));
  }, [initialMode]);

  useEffect(() => {
    const next = queryParam("model");
    if (next) setSelection(next);
  }, []);

  const models = selectableCatalog("video");
  // 选择器和生成状态使用同一模型池；没有可运行 provider 时仍展示模板，提交前由 selectedLive 拦截未接线模型。
  useEffect(() => {
    if (!models.length) return;
    if (!models.some((item) => catalogKey(item) === selection)) {
      setSelection(catalogKey(models[0]));
    }
  }, [models, selection]);
  const card = models.find((item) => catalogKey(item) === selection) || findCatalog(selection);
  const selectedLive = card ? liveCard(card) : models[0] ? liveCard(models[0]) : undefined;
  const { providerId, model: selectedModel } = splitModel(selection);
  const selectedRelay = relays.find((r) => r.id === providerId || r.id === card?.providerId);
  const isArk =
    (selectedRelay?.adapterType === "ark-plan" || selectedRelay?.adapterType === "ark" || /volcengine|seedance/i.test(selection)) &&
    selectedRelay?.adapterType !== "civitai";
  const videoModel = card?.model || selectedModel || "";
  const videoControls = videoStudioCivitaiControls(selectedRelay?.adapterType, videoModel, providerId || card?.providerId);
  const { showLora: showVideoLora, loraShape: videoLoraShape, fpsSpec, fpsOptions } = videoControls;
  const generateFieldInput = {
    adapterType: selectedRelay?.adapterType,
    providerId: providerId || card?.providerId,
    model: videoModel,
    mode,
    duration,
    ratio,
    resolution: resolution || undefined,
    firstFrame,
    lastFrame,
    audio,
    fps,
    negativePrompt: negativePrompt || undefined,
    seed: parseOptionalNumber(seed),
    watermark,
    promptExpansion,
    returnLastFrame,
    audioUrl: audioUrl || undefined,
    width: parseOptionalNumber(width),
    height: parseOptionalNumber(height),
    steps: parseOptionalNumber(steps),
    guidance: parseOptionalNumber(guidance),
    modelVariant: modelVariant || undefined,
    frames: parseOptionalNumber(generationFrames),
    audioMode: audioMode || undefined,
    quantity: parseOptionalNumber(quantity),
    generationMode: generationMode || undefined,
    frameGuideStrength: parseOptionalNumber(frameGuideStrength),
    safetyChecker,
    shift: parseOptionalNumber(shift),
    turbo,
    sampler: sampler || undefined,
    scheduler: scheduler || undefined,
    usePro,
    loras,
    isArk,
    host: selectedRelay?.baseUrl,
    protocol: selectedRelay?.protocol,
    provider: selectedRelay,
  };
  const generatePreview = buildVideoStudioGenerateFields(generateFieldInput);
  const durationOptions = generatePreview.durationOptions;
  const parameterDescriptors = generatePreview.parameterDescriptors;
  const resolutionField = descriptorNamed(parameterDescriptors, "resolution");
  const aspectField = descriptorNamed(parameterDescriptors, "aspectRatio");
  const dimensionsField = descriptorNamed(parameterDescriptors, "dimensions");
  const audioField = descriptorNamed(parameterDescriptors, "audio");
  const negativePromptField = descriptorNamed(parameterDescriptors, "negativePrompt");
  const seedField = descriptorNamed(parameterDescriptors, "seed");
  const stepsField = descriptorNamed(parameterDescriptors, "steps");
  const guidanceField = descriptorNamed(parameterDescriptors, "guidance");
  const modelVariantField = descriptorNamed(parameterDescriptors, "modelVariant");
  const framesField = descriptorNamed(parameterDescriptors, "frames");
  const audioModeField = descriptorNamed(parameterDescriptors, "audioMode");
  const quantityField = descriptorNamed(parameterDescriptors, "quantity");
  const generationModeField = descriptorNamed(parameterDescriptors, "mode");
  const frameGuideStrengthField = descriptorNamed(parameterDescriptors, "frameGuideStrength");
  const safetyCheckerField = descriptorNamed(parameterDescriptors, "safetyChecker");
  const shiftField = descriptorNamed(parameterDescriptors, "shift");
  const turboField = descriptorNamed(parameterDescriptors, "turbo");
  const samplerField = descriptorNamed(parameterDescriptors, "sampler");
  const schedulerField = descriptorNamed(parameterDescriptors, "scheduler");
  const useProField = descriptorNamed(parameterDescriptors, "usePro");
  const watermarkField = descriptorNamed(parameterDescriptors, "watermark");
  const promptExpansionField = descriptorNamed(parameterDescriptors, "promptExpansion");
  const returnLastFrameField = descriptorNamed(parameterDescriptors, "returnLastFrame");
  const showResolution = resolutionField?.status === "supported";
  const showDimensions = dimensionsField?.status === "supported";
  const showNegativePrompt = negativePromptField?.status === "supported";
  const showSeed = seedField?.status === "supported";
  const showSteps = stepsField?.status === "supported";
  const showGuidance = guidanceField?.status === "supported";
  const showModelVariant = modelVariantField?.status === "supported";
  const showFrames = framesField?.status === "supported";
  const showAudioMode = audioModeField?.status === "supported";
  const showQuantity = quantityField?.status === "supported";
  const showGenerationMode = generationModeField?.status === "supported";
  const showFrameGuideStrength = frameGuideStrengthField?.status === "supported";
  const showSafetyChecker = safetyCheckerField?.status === "supported";
  const showShift = shiftField?.status === "supported";
  const showTurbo = turboField?.status === "supported";
  const showSampler = samplerField?.status === "supported";
  const showScheduler = schedulerField?.status === "supported";
  const showUsePro = useProField?.status === "supported";
  const showWatermark = watermarkField?.status === "supported";
  const showPromptExpansion = promptExpansionField?.status === "supported";
  const showReturnLastFrame = returnLastFrameField?.status === "supported";
  const showAudioUrl = audioField?.status === "supported" && audioField.valueType === "string";
  const showAspectRatio = generatePreview.showAspectRatio;
  const resolutionOptions = uniqueStrings((resolutionField?.options || []).map((item) => item.value));
  const ratioOptions = showAspectRatio
    ? uniqueStrings([
        ...(aspectField?.status === "supported" ? (aspectField.options || []).map((item) => item.value) : []),
        ...DEFAULT_RATIO_OPTIONS,
        ratio,
      ])
    : [];
  const dimensionPresets = uniqueStrings((dimensionsField?.options || []).map((item) => item.value));
  const modelVariantOptions = uniqueStrings((modelVariantField?.options || []).map((item) => item.value));
  const modelVariantOptionKey = modelVariantOptions.join("\u0000");
  const modelVariantDefault = modelVariantField?.defaultValue === undefined
    ? ""
    : String(modelVariantField.defaultValue);
  const audioModeOptions = uniqueStrings((audioModeField?.options || []).map((item) => item.value));
  const generationModeOptions = uniqueStrings((generationModeField?.options || []).map((item) => item.value));
  const samplerOptions = uniqueStrings((samplerField?.options || []).map((item) => item.value));
  const schedulerOptions = uniqueStrings((schedulerField?.options || []).map((item) => item.value));
  const fpsField = descriptorNamed(parameterDescriptors, "fps");
  const showDescriptorFps = !fpsSpec && fpsField?.status === "supported" && generatePreview.fps !== undefined;
  const fpsChipOptions = fpsSpec
    ? fpsOptions
    : uniqueStrings((fpsField?.options || []).map((item) => item.value)).map(Number).filter((item) => Number.isFinite(item));
  const renderedParameterNames = new Set<string>(["duration"]);
  if (showAspectRatio) renderedParameterNames.add("aspectRatio");
  if (generatePreview.showGenerateAudio || showAudioUrl) renderedParameterNames.add("audio");
  if (fpsSpec || showDescriptorFps) renderedParameterNames.add("fps");
  if (showResolution) renderedParameterNames.add("resolution");
  if (showDimensions) renderedParameterNames.add("dimensions");
  if (showNegativePrompt) renderedParameterNames.add("negativePrompt");
  if (showSeed) renderedParameterNames.add("seed");
  if (showSteps) renderedParameterNames.add("steps");
  if (showGuidance) renderedParameterNames.add("guidance");
  if (showModelVariant) renderedParameterNames.add("modelVariant");
  if (showFrames) renderedParameterNames.add("frames");
  if (showAudioMode) renderedParameterNames.add("audioMode");
  if (showQuantity) renderedParameterNames.add("quantity");
  if (showGenerationMode) renderedParameterNames.add("mode");
  if (showFrameGuideStrength) renderedParameterNames.add("frameGuideStrength");
  if (showSafetyChecker) renderedParameterNames.add("safetyChecker");
  if (showShift) renderedParameterNames.add("shift");
  if (showTurbo) renderedParameterNames.add("turbo");
  if (showSampler) renderedParameterNames.add("sampler");
  if (showScheduler) renderedParameterNames.add("scheduler");
  if (showUsePro) renderedParameterNames.add("usePro");
  if (showWatermark) renderedParameterNames.add("watermark");
  if (showPromptExpansion) renderedParameterNames.add("promptExpansion");
  if (showReturnLastFrame) renderedParameterNames.add("returnLastFrame");
  const leftoverFields = VIDEO_GENERATION_PARAMETER_NAMES
    .map((name) => descriptorNamed(parameterDescriptors, name))
    .filter((field): field is VideoStudioDescriptor => {
      if (!field) return false;
      return field.status === "supported" && !renderedParameterNames.has(field.name);
    });
  const leftoverNotice = leftoverFields.length
    ? `当前模型还有未接线官方字段：${leftoverFields.map((field) => `${field.label}（${field.transportName || field.name}）`).join("、")}。这些字段不会画假控件，也不会静默丢弃。`
    : "";
  const staleUnsupportedValues = [
    !showResolution && resolution.trim() ? "分辨率档位" : "",
    !showDimensions && (width.trim() || height.trim()) ? "宽高" : "",
    !showNegativePrompt && negativePrompt.trim() ? "负面提示词" : "",
    !showSeed && seed.trim() ? "随机种子" : "",
    !showSteps && steps.trim() ? "推理步数" : "",
    !showGuidance && guidance.trim() ? "引导强度" : "",
    !showModelVariant && modelVariant.trim() ? "模型变体" : "",
    !showFrames && generationFrames.trim() ? "帧数" : "",
    !showAudioMode && audioMode.trim() ? "音频处理" : "",
    !showQuantity && quantity.trim() ? "生成数量" : "",
    !showGenerationMode && generationMode.trim() ? "生成模式" : "",
    !showFrameGuideStrength && frameGuideStrength.trim() ? "帧引导强度" : "",
    !showSafetyChecker && safetyChecker !== undefined ? "安全检查器" : "",
    !showShift && shift.trim() ? "Shift" : "",
    !showTurbo && turbo !== undefined ? "Turbo" : "",
    !showSampler && sampler.trim() ? "采样器" : "",
    !showScheduler && scheduler.trim() ? "调度器" : "",
    !showUsePro && usePro !== undefined ? "Pro" : "",
    !showWatermark && watermark !== undefined ? "水印" : "",
    !showPromptExpansion && promptExpansion !== undefined ? "提示词扩写" : "",
    !showReturnLastFrame && returnLastFrame !== undefined ? "返回尾帧" : "",
    !showAudioUrl && audioUrl.trim() ? "音频 URL" : "",
  ].filter(Boolean);
  const generateBlockReason = generatePreview.error || "";
  const referenceControls = generatePreview.referenceControls;
  const modeReason = (next: "i2v" | "flf") => next === "i2v" ? referenceControls.i2vReason : referenceControls.flfReason;
  const modeCapabilityNotice = referenceControls.notice || referenceControls.i2vReason || referenceControls.flfReason;
  const firstFrameInputDisabled = !referenceControls.supportsFirstFrame;
  const lastFrameInputDisabled = mode === "flf"
    ? !referenceControls.supportsFirstLastFrame
    : !referenceControls.supportsLastFrameInI2v;

  useEffect(() => {
    if (generatePreview.duration !== duration) {
      setDuration(generatePreview.duration);
    }
  }, [selection, duration, selectedRelay?.baseUrl, selectedRelay?.protocol, generatePreview.duration]);

  useEffect(() => {
    if (!fpsSpec) return;
    setFps((current) => snapVideoStudioFps(videoModel, current) ?? fpsSpec.defaultFps);
  }, [videoModel, fpsSpec]);

  useEffect(() => {
    const options = modelVariantOptionKey ? modelVariantOptionKey.split("\u0000") : [];
    setModelVariant((current) => {
      if (options.includes(current)) return current;
      return options.includes(modelVariantDefault) ? modelVariantDefault : "";
    });
  }, [modelVariantDefault, modelVariantOptionKey]);

  const mine = useMemo(
    () => items.filter(
      (item) => item.kind === "video"
        && item.urls[0]
        && item.model.trim().toLowerCase() === videoModel.trim().toLowerCase(),
    ),
    [items, videoModel],
  );
  const seeds = useMemo(() => {
    const all = GALLERY_SEED.filter((item) => item.kind === "video");
    const model = (card?.model || splitModel(selection).model || "").toLowerCase();
    if (!model) return [];
    return all.filter((item) => {
      const seedModel = String(item.model || "").toLowerCase();
      return seedModel && (seedModel === model || model.includes(seedModel) || seedModel.includes(model));
    });
  }, [card, selection]);
  const creditCost = modelPoints(selection);

  const goMode = (next: VideoMode) => {
    setMode(next);
    setError("");
    void navigate(videoStudioModeLocation(next));
  };

  const pickImage = async (files: FileList | null, slot: "first" | "last") => {
    const next = await filesToDataUrls(files, 1);
    if (!next[0]) return;
    if (slot === "first") setFirstFrame(next[0]);
    else setLastFrame(next[0]);
  };

  const disabledReason = busy
    ? ""
    : mode === "extract"
      ? !clipUrl
        ? "先上传要抽帧的视频"
        : ""
      : access.blockedReason
        ? access.blockedReason
        : !prompt.trim()
          ? "请先填写提示词"
          : !models.length
            ? "没有可选视频模型"
            : generateBlockReason
              ? generateBlockReason
              : selectedLive && !selectedLive.wired
                  ? `${card?.model || "该模型"} 待接线，换一个已填密钥的，或去设置填 Key`
                  : studioGenerateCreditGate("video", creditCost);

  const generate = async () => {
    if (!access.allowed) {
      setError(access.blockedReason || "请先登录");
      return;
    }
    const { providerId, model } = splitModel(selection);
    const payload = buildVideoStudioGenerateFields({
      ...generateFieldInput,
      providerId,
      model: videoModel || model,
    });
    if (payload.error) {
      setError(payload.error);
      return;
    }
    setBusy("提交任务…");
    setError("");
    const jobId = startJob({
      kind: mode === "t2v" ? "video" : "i2v",
      prompt,
      model,
      providerId,
      credits: creditCost,
    });
    try {
      const created = await createStudioVideo({
        relays,
        prompt,
        duration: payload.duration,
        aspectRatio: payload.ratio,
        resolution: payload.resolution,
        providerId,
        model: videoModel || model,
        imageUrl: payload.imageUrl,
        lastFrameUrl: payload.lastFrameUrl,
        generateAudio: payload.generateAudio,
        fps: payload.fps,
        loras: payload.loras,
        negativePrompt: payload.negativePrompt,
        seed: payload.seed,
        watermark: payload.watermark,
        promptExpansion: payload.promptExpansion,
        returnLastFrame: payload.returnLastFrame,
        audioUrl: payload.audioUrl,
        width: payload.width,
        height: payload.height,
        steps: payload.steps,
        guidance: payload.guidance,
        modelVariant: payload.modelVariant,
        frames: payload.frames,
        audioMode: payload.audioMode,
        quantity: payload.quantity,
        mode: payload.generationMode,
        frameGuideStrength: payload.frameGuideStrength,
        safetyChecker: payload.safetyChecker,
        shift: payload.shift,
        turbo: payload.turbo,
        sampler: payload.sampler,
        scheduler: payload.scheduler,
        usePro: payload.usePro,
      });
      const videoUrl = await waitStudioVideo({
        relays,
        providerId: created.providerId,
        taskId: created.id,
        model: created.model,
        ticketId: created.ticketId,
        prompt,
        workTitle: prompt.slice(0, 40),
        onTick: (n) => setBusy(`生成中 · 轮询 ${n}`),
      });
      setUrl(videoUrl);
      record("video");
      addHistory({ kind: "video", title: prompt.slice(0, 40), prompt, model: created.model, providerId: created.providerId, urls: [videoUrl] });
      succeedJob(jobId, [videoUrl]);
      setBusy("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "视频生成失败";
      failJob(jobId, message);
      // 上游报错原样展示，建议以「（提示：…）」追加，不替换原文。
      if (message.includes("eligible")) {
        setError(`${message}（提示：${card?.model || "当前模型"} 返回额度不足，可换一条已接线的视频模型或稍后再试）`);
      } else if (/cloudflare|403/i.test(message)) {
        setError(`${message}（提示：${card?.provider || "当前中转"} 可能被 Cloudflare 拦截，可换一条已接线的视频模型或稍后再试）`);
      } else {
        setError(message);
      }
      setBusy("");
    }
  };

  const extractCurrent = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const frame = captureVideoFrame(video);
      setFrames((current) => [...current, frame].slice(-24));
    } catch (err) {
      setError(err instanceof Error ? err.message : "抽帧失败");
    }
  };

  const extractEven = async () => {
    if (!clipUrl) return;
    setBusy("正在抽帧…");
    setError("");
    try {
      const video = videoRef.current;
      const durationSec = video?.duration || 0;
      const times = evenFrameTimes(durationSec, frameCount);
      const next = await extractVideoFrames(clipUrl, times);
      setFrames(next);
      if (next[0]) {
        addHistory({
          kind: "image",
          title: `抽帧 ${next.length} 张`,
          prompt: prompt || "视频抽帧",
          model: "extract",
          urls: next,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "抽帧失败");
    } finally {
      setBusy("");
    }
  };

  const saveFrames = () => {
    if (!frames.length) return;
    addHistory({
      kind: "image",
      title: `抽帧 ${frames.length} 张`,
      prompt: prompt || "视频抽帧",
      model: "extract",
      urls: frames,
    });
  };

  const hero =
    mode === "extract"
      ? { kicker: "FRAMES", title: "视频抽帧", copy: "上传本地视频，抽当前帧、首尾帧或均匀取样。不消耗生成额度。" }
      : mode === "flf"
        ? { kicker: "VIDEO", title: "首尾帧驱动", copy: "首帧和尾帧都会提交。火山 Seedance 走 last_frame。" }
        : mode === "i2v"
          ? {
              kicker: "VIDEO",
              title: "图生视频",
              copy: referenceControls.supportsLastFrameInI2v
                ? "必须上传首帧。当前模型支持尾帧时会一起提交。"
                : referenceControls.supportsFirstFrame
                  ? "必须上传首帧。当前模型只提交首帧；需要尾帧请切换首尾帧模式。"
                  : "当前模型没有经过验证的图生视频能力，请切换到支持首帧的 provider/model。",
            }
          : { kicker: "VIDEO", title: "文生视频", copy: "写镜头、选时长和画幅。点生成走你选的视频模型，成功才扣本账号视频点。" };

  if (mode === "extract") {
    return (
      <div className="bp-page">
        <header className="bp-hero">
          <p className="studio-kicker">{hero.kicker}</p>
          <h1>{hero.title}</h1>
          <p>{hero.copy}</p>
        </header>
        <div className="studio-seg" style={{ maxWidth: 520, marginBottom: 20 }}>
          <button type="button" onClick={() => goMode("t2v")}>文生视频</button>
          <button
            type="button"
            disabled={Boolean(referenceControls.i2vReason)}
            title={modeReason("i2v") || undefined}
            aria-describedby={modeCapabilityNotice ? "video-mode-capability-hint" : undefined}
            onClick={() => goMode("i2v")}
          >
            图生视频{referenceControls.i2vReason ? "（不可用）" : ""}
          </button>
          <button
            type="button"
            disabled={Boolean(referenceControls.flfReason)}
            title={modeReason("flf") || undefined}
            aria-describedby={modeCapabilityNotice ? "video-mode-capability-hint" : undefined}
            onClick={() => goMode("flf")}
          >
            首尾帧{referenceControls.flfReason ? "（不可用）" : ""}
          </button>
          <button type="button" className="is-active">抽帧</button>
        </div>
        {modeCapabilityNotice ? <small id="video-mode-capability-hint" className="studio-hint">{modeCapabilityNotice}</small> : null}
        <div className="bp-work">
          <aside className="bp-left">
            <label className="dropzone">
              <span>上传视频 · mp4 / webm</span>
              <input
                className="sr-only"
                type="file"
                accept="video/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (clipUrl) URL.revokeObjectURL(clipUrl);
                  setClipUrl(videoFileUrl(file));
                  setFrames([]);
                  event.target.value = "";
                }}
              />
              <small>抽帧在浏览器完成，不打上游。</small>
            </label>
            <div className="studio-seg">
              {[4, 6, 8, 12].map((item) => (
                <button key={item} type="button" className={frameCount === item ? "is-active" : undefined} onClick={() => setFrameCount(item)}>
                  {item} 帧
                </button>
              ))}
            </div>
            <div className="bp-cta">
              <button type="button" className="bp-generate bp-generate-image" disabled={Boolean(disabledReason) || Boolean(busy)} onClick={() => void extractEven()}>
                <span>{busy || "均匀抽帧"}</span>
                <small>{disabledReason || "不扣积分"}</small>
              </button>
              <button type="button" className="studio-ghost" disabled={!clipUrl} onClick={extractCurrent}>
                抽当前帧
              </button>
              {error ? <p className="studio-error" role="alert">{error}</p> : null}
            </div>
          </aside>
          <section className="bp-right">
            <header className="bp-bar">
              <div>
                <p className="studio-kicker">预览</p>
                <strong>拖进度条再点「抽当前帧」</strong>
              </div>
            </header>
            <div className="bp-stage">
              {clipUrl ? <video ref={videoRef} src={clipUrl} controls /> : <p className="studio-hint">还没有视频</p>}
            </div>
            {frames.length ? (
              <>
                <p className="bp-examples-title">抽出 {frames.length} 张</p>
                <div className="bp-examples">
                  {frames.map((frame, index) => (
                    <button
                      key={`${index}-${frame.slice(0, 12)}`}
                      type="button"
                      onClick={() => {
                        setFirstFrame(frame);
                        goMode("i2v");
                      }}
                    >
                      <img src={frame} alt={`帧 ${index + 1}`} />
                      <span>用作首帧</span>
                    </button>
                  ))}
                </div>
                <div className="result-actions" style={{ padding: "0 16px 16px" }}>
                  <button type="button" className="studio-ghost" onClick={saveFrames}>
                    保存到作品
                  </button>
                  <button
                    type="button"
                    className="studio-ghost"
                    onClick={() => {
                      if (frames[0]) setFirstFrame(frames[0]);
                      if (frames.length > 1) setLastFrame(frames[frames.length - 1]);
                      goMode("flf");
                    }}
                  >
                    作首尾帧去生成
                  </button>
                  <button
                    type="button"
                    className="studio-ghost"
                    onClick={() => {
                      dropToCanvas({ kind: "image", url: frames[0], prompt: "视频抽帧", text: "视频抽帧" });
                      const search = pushMediaToCanvasWorkspace({
                        kind: "image",
                        url: frames[0],
                        urls: frames,
                        prompt: "视频抽帧",
                        text: "视频抽帧",
                      });
                      void navigate({ to: "/canvas/workspace", search });
                    }}
                  >
                    送入画布
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="bp-page">
      <header className="bp-hero">
        <p className="studio-kicker">{hero.kicker}</p>
        <h1>{hero.title}</h1>
        <p>{hero.copy}</p>
      </header>
      <GuestGenerateBanner kind="video" />
      <p className="alert-banner warn">选哪个模型就打哪条接线。额度不够或中转失败时，错误出在按钮下面，不会自动换供应商。</p>
      <div className="bp-work">
      <aside className="bp-left">
        <p className="studio-kicker">{card?.model || "生视频"}</p>
        <h1>{hero.title}</h1>
        <div className="studio-seg">
          <button type="button" className={mode === "t2v" ? "is-active" : undefined} onClick={() => goMode("t2v")}>
            文生视频
          </button>
          <button
            type="button"
            className={mode === "i2v" ? "is-active" : undefined}
            disabled={Boolean(referenceControls.i2vReason)}
            title={modeReason("i2v") || undefined}
            aria-describedby={modeCapabilityNotice ? "video-mode-capability-hint" : undefined}
            onClick={() => goMode("i2v")}
          >
            图生视频{referenceControls.i2vReason ? "（不可用）" : ""}
          </button>
          <button
            type="button"
            className={mode === "flf" ? "is-active" : undefined}
            disabled={Boolean(referenceControls.flfReason)}
            title={modeReason("flf") || undefined}
            aria-describedby={modeCapabilityNotice ? "video-mode-capability-hint" : undefined}
            onClick={() => goMode("flf")}
          >
            首尾帧{referenceControls.flfReason ? "（不可用）" : ""}
          </button>
        </div>
        {modeCapabilityNotice ? <small id="video-mode-capability-hint" className="studio-hint">{modeCapabilityNotice}</small> : null}
        <div className="bp-model-fields">
          <StudioModelField kind="video" value={selection} onChange={setSelection} label="视频模型" />
          <StudioModelField kind="text" value={textModel} onChange={setTextModel} label="润色文本模型" />
        </div>
        <label>
          描述你的想法
          <textarea rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述镜头运动、主体和气氛" />
        </label>
        <div className="prompt-tools">
          <span className="bp-count">必填 · {prompt.length} / 20000</span>
          <button
            type="button"
            className="studio-ghost"
            disabled={Boolean(busy) || polishBusy}
            onClick={() => {
              setPolishBusy(true);
              setPolishError("");
              void enhancePrompt({ relays, prompt, textModel, kind: "video" })
                .then(setPrompt)
                .catch((err) => setPolishError(err instanceof Error ? err.message : "润色失败"))
                .finally(() => setPolishBusy(false));
            }}
          >
            {polishBusy ? "正在润色…" : "提示词模板 / 润色"}
          </button>
        </div>
        {polishError ? <p className="studio-hint" role="alert">{polishError}</p> : null}
        {mode !== "t2v" ? (
          <div className="ref-grid">
            <label className="dropzone dropzone-mini">
              <span>首帧（必填）{firstFrameInputDisabled ? "（当前模型不支持）" : ""}</span>
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                disabled={firstFrameInputDisabled}
                aria-describedby={modeCapabilityNotice ? "video-mode-capability-hint" : undefined}
                onChange={(event) => void pickImage(event.target.files, "first")}
              />
              {firstFrame ? <img src={firstFrame} alt="" className="ref-thumb" /> : null}
              {firstFrameInputDisabled ? <small>{referenceControls.firstFrameReason}</small> : !firstFrame ? <small>图生视频必须上传</small> : null}
            </label>
            <label className="dropzone dropzone-mini">
              <span>{mode === "flf" ? "尾帧（必填）" : "尾帧（可选）"}{lastFrameInputDisabled ? "（当前模型不支持）" : ""}</span>
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                disabled={lastFrameInputDisabled}
                aria-describedby={modeCapabilityNotice ? "video-mode-capability-hint" : undefined}
                onChange={(event) => void pickImage(event.target.files, "last")}
              />
              {lastFrame ? <img src={lastFrame} alt="" className="ref-thumb" /> : null}
              {lastFrameInputDisabled ? (
                <small>
                  {referenceControls.lastFrameReason || "当前模型不接受尾帧。"}
                  {lastFrame ? " 已保留，但不会作为当前模式发送。" : ""}
                </small>
              ) : !lastFrame ? <small>{isArk ? "火山会按 last_frame 提交" : "有尾帧的模型会一起提交"}</small> : null}
            </label>
          </div>
        ) : (
          <label className="dropzone">
            <span>可选首帧 · 上传后切到图生视频{firstFrameInputDisabled ? "（当前模型不支持）" : ""}</span>
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              disabled={firstFrameInputDisabled}
              aria-describedby={modeCapabilityNotice ? "video-mode-capability-hint" : undefined}
              onChange={(event) => {
                void pickImage(event.target.files, "first").then(() => goMode("i2v"));
              }}
            />
            <small>{firstFrameInputDisabled ? referenceControls.firstFrameReason : "不上传则走文生视频"}</small>
          </label>
        )}
        {firstFrameInputDisabled && firstFrame ? (
          <button type="button" className="studio-ghost" onClick={() => setFirstFrame("")}>清除已保留首帧</button>
        ) : null}
        {lastFrameInputDisabled && lastFrame ? (
          <button type="button" className="studio-ghost" onClick={() => setLastFrame("")}>清除已保留尾帧</button>
        ) : null}
        {TEMPLATE_GROUPS.map(([group, list]) => (
          <div key={group}>
            <p className="studio-kicker">{group}</p>
            <div className="chip-row">
              {list.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={prompt === item.prompt ? "is-active" : undefined}
                  onClick={() => setPrompt(item.prompt)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="studio-kicker">{showAspectRatio ? "时长 / 画幅" : "时长"}</p>
        <div className="chip-row">
          {durationOptions.map((item) => (
            <button key={item} type="button" className={duration === item ? "is-active" : undefined} onClick={() => setDuration(item)}>
              {item}s
            </button>
          ))}
        </div>
        {videoModel === "ltx2.3" ? (
          <small className="studio-hint">LTX 2.3 时长 3–20 秒，默认 5 秒。</small>
        ) : videoModel === "hunyuan" ? (
          <small className="studio-hint">Hunyuan 时长 1–30 秒，默认 5 秒。</small>
        ) : aspectField?.description ? (
          <small className="studio-hint">{aspectField.description}</small>
        ) : null}
        {showAspectRatio ? (
          <div className="aspect-grid">
            {ratioOptions.map((item) => {
              const box = aspectPreviewBox(item);
              return (
                <button key={item} type="button" className={ratio === item ? "is-active" : undefined} onClick={() => setRatio(item)}>
                  {box ? <span className="aspect-preview" style={box} /> : null}
                  {item}
                </button>
              );
            })}
          </div>
        ) : null}
{showResolution ? (
          <>
            {resolutionOptions.length ? (
              <>
                <p className="studio-kicker">{resolutionField?.label || "分辨率档位"}</p>
                <div className="chip-row">
                  {resolutionOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={resolution === item ? "is-active" : undefined}
                      onClick={() => setResolution(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <label>
                {resolutionField?.label || "分辨率档位"}
                <input
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                  placeholder={resolutionField?.defaultValue === undefined ? "可空，使用模型默认" : String(resolutionField.defaultValue)}
                />
              </label>
            )}
            {resolutionField?.description ? <small className="studio-hint">{resolutionField.description}</small> : null}
          </>
        ) : null}
        {showDimensions ? (
          <>
            <p className="studio-kicker">{dimensionsField?.label || "宽高"}</p>
            {dimensionPresets.length ? (
              <div className="chip-row">
                {dimensionPresets.map((item) => {
                  const pair = parseDimensionPair(item);
                  const active = pair
                    ? Number(width) === pair.width && Number(height) === pair.height
                    : false;
                  return (
                    <button
                      key={item}
                      type="button"
                      className={active ? "is-active" : undefined}
                      onClick={() => {
                        if (!pair) return;
                        setWidth(String(pair.width));
                        setHeight(String(pair.height));
                      }}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="lora-row">
              <label>
                宽
                <input
                  type="number"
                  min={dimensionsField?.minimum}
                  max={dimensionsField?.maximum}
                  step={1}
                  value={width}
                  onChange={(event) => setWidth(event.target.value)}
                  placeholder={dimensionsField?.required ? "必填" : "可空"}
                />
              </label>
              <label>
                高
                <input
                  type="number"
                  min={dimensionsField?.minimum}
                  max={dimensionsField?.maximum}
                  step={1}
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  placeholder={dimensionsField?.required ? "必填" : "可空"}
                />
              </label>
            </div>
            {dimensionsField?.description ? <small className="studio-hint">{dimensionsField.description}</small> : null}
          </>
        ) : null}
        {showNegativePrompt ? (
          <label>
            {negativePromptField?.label || "负面提示词"}
            <textarea
              rows={2}
              maxLength={negativePromptField?.maxLength}
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              placeholder="不要出现的内容，可空"
            />
          </label>
        ) : null}
        {showSeed ? (
          <label>
            {seedField?.label || "随机种子"}
            <input
              type="number"
              step={1}
              min={seedField?.minimum}
              max={seedField?.maximum}
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder="可空"
            />
          </label>
        ) : null}
        {showSteps ? (
          <label>
            {stepsField?.label || "推理步数"}
            <input
              type="number"
              step={1}
              min={stepsField?.minimum}
              max={stepsField?.maximum}
              value={steps}
              onChange={(event) => setSteps(event.target.value)}
              placeholder={stepsField?.defaultValue === undefined ? "可空" : String(stepsField.defaultValue)}
            />
          </label>
        ) : null}
        {showGuidance ? (
          <label>
            {guidanceField?.label || "引导强度"}
            <input
              type="number"
              step="any"
              min={guidanceField?.minimum}
              max={guidanceField?.maximum}
              value={guidance}
              onChange={(event) => setGuidance(event.target.value)}
              placeholder={guidanceField?.defaultValue === undefined ? "可空" : String(guidanceField.defaultValue)}
            />
          </label>
        ) : null}
        {showModelVariant ? (
          <>
            <p className="studio-kicker">{modelVariantField?.label || "模型变体"}</p>
            {modelVariantOptions.length ? (
              <div className="chip-row">
                {modelVariantOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={modelVariant === item ? "is-active" : undefined}
                    onClick={() => setModelVariant(item)}
                  >
                    {item}{item === modelVariantDefault ? " · 默认" : ""}
                  </button>
                ))}
              </div>
            ) : (
              <label>
                {modelVariantField?.label || "模型变体"}
                <input
                  value={modelVariant}
                  onChange={(event) => setModelVariant(event.target.value)}
                  placeholder="可空，使用模型默认"
                />
              </label>
            )}
            {modelVariantField?.description ? <small className="studio-hint">{modelVariantField.description}</small> : null}
          </>
        ) : null}
        {showAudioUrl ? (
          <label>
            {audioField?.label || "音频"}
            <input
              value={audioUrl}
              onChange={(event) => setAudioUrl(event.target.value)}
              placeholder="音频 URL，可空"
            />
            {audioField?.description ? <small className="studio-hint">{audioField.description}</small> : null}
          </label>
        ) : null}
        {showWatermark ? (
          <label className="flow-check">
            <input
              type="checkbox"
              checked={watermark === true}
              onChange={(event) => setWatermark(event.target.checked)}
            />
            {watermarkField?.label || "水印"}
          </label>
        ) : null}
        {showPromptExpansion ? (
          <label className="flow-check">
            <input
              type="checkbox"
              checked={promptExpansion === true}
              onChange={(event) => setPromptExpansion(event.target.checked)}
            />
            {promptExpansionField?.label || "提示词扩写"}
          </label>
        ) : null}
        {showReturnLastFrame ? (
          <label className="flow-check">
            <input
              type="checkbox"
              checked={returnLastFrame === true}
              onChange={(event) => setReturnLastFrame(event.target.checked)}
            />
            {returnLastFrameField?.label || "返回尾帧"}
          </label>
        ) : null}
        {generatePreview.showGenerateAudio ? (
          <label className="flow-check">
            <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} />
            {videoModel === "ltx2.3" ? "生成原声（generateAudio，可开可关）" : "生成原声"}
          </label>
        ) : null}
        {showFrames ? (
          <label>
            {framesField?.label || "帧数"}
            <input
              type="number"
              min={framesField?.minimum}
              max={framesField?.maximum}
              step={1}
              value={generationFrames}
              onChange={(event) => setGenerationFrames(event.target.value)}
              placeholder={framesField?.defaultValue === undefined ? "可空；不填则按时长推导" : String(framesField.defaultValue)}
            />
            {framesField?.description ? <small className="studio-hint">{framesField.description}</small> : null}
          </label>
        ) : null}
        {showQuantity ? (
          <label>
            {quantityField?.label || "生成数量"}
            <input
              type="number"
              min={quantityField?.minimum}
              max={quantityField?.maximum}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={quantityField?.defaultValue === undefined ? "可空" : String(quantityField.defaultValue)}
            />
            {quantityField?.description ? <small className="studio-hint">{quantityField.description}</small> : null}
          </label>
        ) : null}
        {showGenerationMode ? (
          <>
            <p className="studio-kicker">{generationModeField?.label || "生成模式"}</p>
            {generationModeOptions.length ? (
              <div className="chip-row">
                {generationModeOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={generationMode === item ? "is-active" : undefined}
                    onClick={() => setGenerationMode((current) => (current === item ? "" : item))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <label>
                {generationModeField?.label || "生成模式"}
                <input value={generationMode} onChange={(event) => setGenerationMode(event.target.value)} placeholder="可空" />
              </label>
            )}
            {generationModeField?.description ? <small className="studio-hint">{generationModeField.description}</small> : null}
          </>
        ) : null}
        {showAudioMode ? (
          <>
            <p className="studio-kicker">{audioModeField?.label || "音频处理"}</p>
            {audioModeOptions.length ? (
              <div className="chip-row">
                {audioModeOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={audioMode === item ? "is-active" : undefined}
                    onClick={() => setAudioMode((current) => (current === item ? "" : item))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <label>
                {audioModeField?.label || "音频处理"}
                <input value={audioMode} onChange={(event) => setAudioMode(event.target.value)} placeholder="auto / origin" />
              </label>
            )}
            {audioModeField?.description ? <small className="studio-hint">{audioModeField.description}</small> : null}
          </>
        ) : null}
        {showFrameGuideStrength ? (
          <label>
            {frameGuideStrengthField?.label || "帧引导强度"}
            <input
              type="number"
              min={frameGuideStrengthField?.minimum}
              max={frameGuideStrengthField?.maximum}
              step="any"
              value={frameGuideStrength}
              onChange={(event) => setFrameGuideStrength(event.target.value)}
              placeholder={frameGuideStrengthField?.defaultValue === undefined ? "可空" : String(frameGuideStrengthField.defaultValue)}
            />
            {frameGuideStrengthField?.description ? <small className="studio-hint">{frameGuideStrengthField.description}</small> : null}
          </label>
        ) : null}
        {showShift ? (
          <label>
            {shiftField?.label || "Shift"}
            <input
              type="number"
              min={shiftField?.minimum}
              max={shiftField?.maximum}
              step="any"
              value={shift}
              onChange={(event) => setShift(event.target.value)}
              placeholder={shiftField?.defaultValue === undefined ? "可空" : String(shiftField.defaultValue)}
            />
            {shiftField?.description ? <small className="studio-hint">{shiftField.description}</small> : null}
          </label>
        ) : null}
        {showSampler ? (
          <>
            <p className="studio-kicker">{samplerField?.label || "采样器"}</p>
            {samplerOptions.length ? (
              <div className="chip-row">
                {samplerOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={sampler === item ? "is-active" : undefined}
                    onClick={() => setSampler((current) => (current === item ? "" : item))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <label>
                {samplerField?.label || "采样器"}
                <input value={sampler} onChange={(event) => setSampler(event.target.value)} placeholder="可空" />
              </label>
            )}
          </>
        ) : null}
        {showScheduler ? (
          <>
            <p className="studio-kicker">{schedulerField?.label || "调度器"}</p>
            {schedulerOptions.length ? (
              <div className="chip-row">
                {schedulerOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={scheduler === item ? "is-active" : undefined}
                    onClick={() => setScheduler((current) => (current === item ? "" : item))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <label>
                {schedulerField?.label || "调度器"}
                <input value={scheduler} onChange={(event) => setScheduler(event.target.value)} placeholder="可空" />
              </label>
            )}
          </>
        ) : null}
        {showSafetyChecker ? (
          <label className="flow-check">
            <input
              type="checkbox"
              checked={safetyChecker === true}
              onChange={(event) => setSafetyChecker(event.target.checked)}
            />
            {safetyCheckerField?.label || "安全检查器"}
          </label>
        ) : null}
        {showTurbo ? (
          <label className="flow-check">
            <input
              type="checkbox"
              checked={turbo === true}
              onChange={(event) => setTurbo(event.target.checked)}
            />
            {turboField?.label || "Turbo"}
          </label>
        ) : null}
        {showUsePro ? (
          <label className="flow-check">
            <input
              type="checkbox"
              checked={usePro === true}
              onChange={(event) => setUsePro(event.target.checked)}
            />
            {useProField?.label || "Pro"}
          </label>
        ) : null}
        {fpsSpec || showDescriptorFps ? (
          <>
            <p className="studio-kicker">{fpsField?.label || "帧率 fps"}</p>
            {fpsChipOptions.length ? (
              <div className="chip-row">
                {fpsChipOptions.map((item) => (
                  <button key={item} type="button" className={fps === item ? "is-active" : undefined} onClick={() => setFps(item)}>
                    {item} fps
                  </button>
                ))}
              </div>
            ) : (
              <label>
                {fpsField?.label || "帧率"}
                <input
                  type="number"
                  min={fpsField?.minimum}
                  max={fpsField?.maximum}
                  step={fpsField?.valueType === "integer" || fpsField?.integer ? 1 : "any"}
                  value={Number.isFinite(fps) ? fps : ""}
                  onChange={(event) => setFps(Number(event.target.value))}
                  placeholder={fpsField?.defaultValue === undefined ? "可空" : String(fpsField.defaultValue)}
                />
              </label>
            )}
            <small className="studio-hint">
              {videoModel === "hunyuan"
                ? "Hunyuan 常见取值 24 / 25 / 30，默认 25。页面把该值作为 fps 传给 generate。"
                : videoModel === "ltx2.3"
                  ? "LTX 2.3 官方字段是 fps，默认 24。"
                  : fpsField?.description || "仅在当前模型 capability 支持时提交 fps。"}
            </small>
          </>
        ) : null}
        {leftoverNotice ? (
          <p className="studio-hint" role="status">
            {leftoverNotice}
          </p>
        ) : null}
        {staleUnsupportedValues.length ? (
          <p className="studio-error" role="alert">
            当前模型不支持已填写的 {staleUnsupportedValues.join("、")}，提交会被明确拒绝，不会静默丢弃。
            <button
              type="button"
              className="studio-ghost"
              onClick={() => {
                if (!showResolution) setResolution("");
                if (!showDimensions) {
                  setWidth("");
                  setHeight("");
                }
                if (!showNegativePrompt) setNegativePrompt("");
                if (!showSeed) setSeed("");
                if (!showSteps) setSteps("");
                if (!showGuidance) setGuidance("");
                if (!showModelVariant) setModelVariant("");
                if (!showFrames) setGenerationFrames("");
                if (!showAudioMode) setAudioMode("");
                if (!showQuantity) setQuantity("");
                if (!showGenerationMode) setGenerationMode("");
                if (!showFrameGuideStrength) setFrameGuideStrength("");
                if (!showSafetyChecker) setSafetyChecker(undefined);
                if (!showShift) setShift("");
                if (!showTurbo) setTurbo(undefined);
                if (!showSampler) setSampler("");
                if (!showScheduler) setScheduler("");
                if (!showUsePro) setUsePro(undefined);
                if (!showWatermark) setWatermark(undefined);
                if (!showPromptExpansion) setPromptExpansion(undefined);
                if (!showReturnLastFrame) setReturnLastFrame(undefined);
                if (!showAudioUrl) setAudioUrl("");
              }}
            >
              清除不支持的已填值
            </button>
          </p>
        ) : null}
        {showVideoLora ? (
          <div className="lora-stack">
            <p className="studio-kicker">Civitai LoRA{videoLoraShape === "array" ? "（array）" : ""}</p>
            {loras.map((item, index) => (
              <div key={index} className="lora-row">
                <input
                  value={item.resource}
                  onChange={(event) =>
                    setLoras((current) => current.map((row, i) => (i === index ? { ...row, resource: event.target.value } : row)))
                  }
                  placeholder="urn:air:…:lora:civitai:<id>@<ver>"
                />
                <input
                  type="number"
                  min={-2}
                  max={2}
                  step={0.05}
                  value={item.weight}
                  onChange={(event) =>
                    setLoras((current) => current.map((row, i) => (i === index ? { ...row, weight: Number(event.target.value) } : row)))
                  }
                />
                <button
                  type="button"
                  className="studio-ghost"
                  onClick={() =>
                    setLoras((current) => {
                      const next = current.filter((_, i) => i !== index);
                      return next.length ? next : [{ resource: "", weight: 1 }];
                    })
                  }
                >
                  去掉
                </button>
              </div>
            ))}
            {loras.length < 8 ? (
              <button type="button" className="studio-ghost" onClick={() => setLoras((current) => [...current, { resource: "", weight: 1 }])}>
                加 LoRA
              </button>
            ) : null}
            <small className="studio-hint">
              {videoLoraShape === "array"
                ? "Hunyuan 会把 AIR→权重转成官方 {air,strength} array。只支持文生视频。"
                : "LTX 2.3 提交官方 loras map。"}
            </small>
          </div>
        ) : null}
        <div className="bp-cta">
          <button type="button" className="bp-generate bp-generate-video" disabled={Boolean(busy || disabledReason)} onClick={() => void generate()}>
            <span>{busy || (mode === "flf" ? "按首尾帧生成" : "生成视频")}</span>
            <small>{disabledReason || `${creditCost} 点 · 剩余 ${remaining}`}</small>
          </button>
          {error ? <p className="studio-error" role="alert">{error}</p> : null}
        </div>
      </aside>
      <section className="bp-right">
        <header className="bp-bar">
          <div>
            <p className="studio-kicker">{url || busy ? "生成结果" : "预览"}</p>
            <strong>{card?.provider ? `${card.provider} · ${card.model}` : card?.model || "未选模型"}</strong>
          </div>
        </header>
        <WorkbenchStatus
          busy={busy}
          error={error}
          done={url ? `${card?.model || "模型"} 已出片` : ""}
          idle="生成后视频会出现在上面。下面参考样片只带提示词，不会冒充当前模型的成片。"
        />
        {url || busy ? (
          <>
            <div className="bp-stage">
              {url ? <video src={url} controls autoPlay loop /> : null}
              <StageOverlay busy={busy} />
            </div>
            {url ? (
              <div className="result-actions" style={{ padding: "0 16px 8px" }}>
                <a className="studio-ghost" href={url} download="studio.mp4" target="_blank" rel="noreferrer">
                  下载
                </a>
                <button
                  type="button"
                  className="studio-ghost"
                  onClick={() => {
                    dropToCanvas({ kind: "video", url, prompt, model: selection });
                    const search = pushMediaToCanvasWorkspace({
                      kind: "video",
                      url,
                      prompt,
                      model: selection,
                    });
                    void navigate({ to: "/canvas/workspace", search });
                  }}
                >
                  送入画布
                </button>
                <button type="button" className="studio-ghost" onClick={() => { setClipUrl(url); goMode("extract"); }}>
                  抽帧
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="bp-stage">
            <p className="studio-hint">还没有成片。写镜头描述，点“生成视频”按钮。</p>
          </div>
        )}
        {mine.length ? (
          <>
            <p className="bp-examples-title">我的成片</p>
            <div className="bp-examples">
              {mine.map((item) => (
                <button key={item.id} type="button" className={url === item.urls[0] ? "is-active" : undefined} onClick={() => item.urls[0] && setUrl(item.urls[0])}>
                  <video src={item.urls[0]} muted playsInline preload="metadata" />
                  <span>
                    {item.title}
                    <br />
                    {item.model}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <p className="bp-examples-title">参考样片（点一下只带提示词，不是当前模型成片）</p>
        <div className="bp-examples">
          {seeds.length ? seeds.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.prompt) setPrompt(item.prompt);
              }}
            >
              <video src={item.urls[0]} muted playsInline preload="metadata" poster="/gallery/grok-video-poster.png" />
              <span>
                {item.title}
                <br />
                参考 · {item.model}
              </span>
            </button>
          )) : (
            <p className="studio-hint">当前模型没有匹配的参考样片。点生成才会出你选的模型的成片。</p>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
