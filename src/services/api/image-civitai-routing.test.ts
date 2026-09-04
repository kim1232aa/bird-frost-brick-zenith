import { register } from "node:module";
import assert from "node:assert/strict";
import test, { mock } from "node:test";

const aliasLoader = `
const SRC = new URL("file://" + process.cwd() + "/src/").href;
const SUFFIXES = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (specifier.startsWith("@/")) target = SRC + specifier.slice(2);
  else if (specifier.startsWith("./") || specifier.startsWith("../")) target = new URL(specifier, context.parentURL).href;
  try {
    return await nextResolve(target, context);
  } catch (error) {
    if (!target.startsWith("file:")) throw error;
    for (const suffix of SUFFIXES) {
      try {
        return await nextResolve(target + suffix, context);
      } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

// image.ts keeps a type-only config import, but Node's strip-types loader still
// evaluates the module; keep this integration test free of persistence startup.
mock.module("@/stores/use-config-store", {
  namedExports: {
    persistImageHostCredential: async () => ({ ok: true, baseUrl: "", hasApiKey: false }),
  },
});

const dynamicService = {
  id: "image/comfy/flux1/createImage",
  step: "imageGen",
  parameters: {
    operation: "createImage",
    engine: "comfy",
    ecosystem: "flux1",
  },
  modalities: { input: ["text"], output: ["image"] },
  status: "available",
} as const;
const workflowCalls: unknown[] = [];
const studioCalls: unknown[] = [];

mock.module("@/services/api/civitai-client", {
  namedExports: {
    isCivitaiRoute: (route: { mode?: string; provider?: { adapterType?: string } }) =>
      route.mode === "local" && route.provider?.adapterType === "civitai-orchestration",
    resolveCivitaiRouteService: async () => dynamicService,
    createCivitaiWorkflow: async (_route: unknown, workflow: unknown) => {
      workflowCalls.push(workflow);
      return {
        state: {
          status: "completed",
          workflowId: "wf_dynamic",
          blobs: [{ id: "blob_dynamic", url: "https://example.test/dynamic.png" }],
        },
        workflowId: "wf_dynamic",
        taskId: "wf_dynamic",
        startedAt: "2026-08-30T00:00:00.000Z",
        apiKey: "token",
        preflight: { workflowId: "wf_dynamic", estimatedCost: { total: 0, breakdown: {} } },
      };
    },
    waitCivitaiWorkflow: async () => ({
      status: "completed",
      workflowId: "wf_dynamic",
      blobs: [{ id: "blob_dynamic", url: "https://example.test/dynamic.png" }],
    }),
  },
});

mock.module("@/studio/generate/image", {
  namedExports: {
    generateStudioImage: async (input: { model: string; n?: number }) => {
      studioCalls.push(input);
      const urls = Array.from({ length: input.n || 1 }, () => "https://example.test/legacy.png");
      return {
        url: urls[0],
        urls,
        model: input.model,
        providerId: "preset-civitai",
      };
    },
  },
});

const { requestEdit, requestGeneration } = await import("./image.ts");

test("dynamic Civitai image service uses workflow serializer before legacy preset adapter", async () => {
  const model = dynamicService.id;
  const provider = {
    id: "preset-civitai",
    name: "Civitai Orchestration",
    baseUrl: "https://orchestration.civitai.com/v2/consumer",
    apiKey: "token",
    adapterType: "civitai-orchestration",
    proxyMode: "direct" as const,
    proxyUrl: "",
    enabled: true,
    capabilities: ["image" as const],
    models: [model],
    textModels: [],
    imageModels: [model],
    videoModels: [],
    audioModels: [],
    timeoutMs: 360_000,
    remark: "",
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
  const config = {
    channelMode: "local" as const,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: "",
    imageModel: model,
    videoModel: "",
    textModel: "",
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    imageHostBaseUrl: "",
    imageHostApiKey: "",
    systemPrompt: "",
    models: [model],
    imageModels: [model],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "",
    size: "",
    count: "1",
    canvasImageCount: "1",
    imageAdvancedSettingsByScope: {},
    videoGenerationSettingsByScope: {},
    apiRelays: [provider],
    apiRouting: {
      text: { source: "relay" as const, providerId: "", model: "" },
      image: { source: "relay" as const, providerId: provider.id, model },
      video: { source: "relay" as const, providerId: "", model: "" },
      audio: { source: "relay" as const, providerId: "", model: "" },
    },
    apiBoardRouting: {} as import("@/stores/use-config-store").AiConfig["apiBoardRouting"],
    apiPlatformBoardRouting: {} as import("@/stores/use-config-store").AiConfig["apiPlatformBoardRouting"],
    apiRelayAdvanced: { allowCustomModel: false, defaultTimeoutMs: 360_000, showDisabledProviders: false },
  };

  const images = await requestGeneration(config, "dynamic service prompt");

  assert.deepEqual(images.map((image) => image.dataUrl), ["https://example.test/dynamic.png"]);
  assert.equal(workflowCalls.length, 1);
  const workflow = workflowCalls[0] as { steps: Array<{ input: Record<string, unknown> }> };
  assert.deepEqual(workflow.steps[0]?.input, {
    engine: "comfy",
    ecosystem: "flux1",
    operation: "createImage",
    prompt: "dynamic service prompt",
    width: 1024,
    height: 1024,
    quantity: 1,
  });
  assert.equal(studioCalls.length, 0);
});

test("static Studio image model still uses the legacy Studio adapter", async () => {
  const model = "grok-imagine-image";
  const provider = {
    id: "preset-grok-relay",
    name: "Grok 中转",
    baseUrl: "https://relay.example.test/v1",
    apiKey: "token",
    adapterType: "xai-imagine",
    proxyMode: "direct" as const,
    proxyUrl: "",
    enabled: true,
    capabilities: ["image" as const],
    models: [model],
    textModels: [],
    imageModels: [model],
    videoModels: [],
    audioModels: [],
    timeoutMs: 360_000,
    remark: "",
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
  const config = {
    channelMode: "local" as const,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: "",
    imageModel: model,
    videoModel: "",
    textModel: "",
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    imageHostBaseUrl: "",
    imageHostApiKey: "",
    systemPrompt: "",
    models: [model],
    imageModels: [model],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "",
    size: "",
    count: "1",
    canvasImageCount: "1",
    imageAdvancedSettingsByScope: {},
    videoGenerationSettingsByScope: {},
    apiRelays: [provider],
    apiRouting: {
      text: { source: "relay" as const, providerId: "", model: "" },
      image: { source: "relay" as const, providerId: provider.id, model },
      video: { source: "relay" as const, providerId: "", model: "" },
      audio: { source: "relay" as const, providerId: "", model: "" },
    },
    apiBoardRouting: {} as import("@/stores/use-config-store").AiConfig["apiBoardRouting"],
    apiPlatformBoardRouting: {} as import("@/stores/use-config-store").AiConfig["apiPlatformBoardRouting"],
    apiRelayAdvanced: { allowCustomModel: false, defaultTimeoutMs: 360_000, showDisabledProviders: false },
  };

  const images = await requestGeneration(config, "static Studio prompt");

  assert.deepEqual(images.map((image) => image.dataUrl), ["https://example.test/legacy.png"]);
  assert.equal(studioCalls.length, 1);
  assert.equal((studioCalls[0] as { model: string }).model, model);
});


test("static GPT Studio edit forwards operation, settings, count, and every reference", async () => {
  const model = "gpt-image-2";
  const provider = {
    id: "preset-openai",
    name: "OpenAI",
    baseUrl: "https://api.example.test/v1",
    apiKey: "token",
    adapterType: "openai-compat",
    proxyMode: "direct" as const,
    proxyUrl: "",
    enabled: true,
    capabilities: ["image" as const],
    models: [model],
    textModels: [],
    imageModels: [model],
    videoModels: [],
    audioModels: [],
    timeoutMs: 360_000,
    remark: "",
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    imageCapabilityProfiles: {
      [model]: {
        generate: "openai-gpt-image-2-generate" as const,
        edit: "openai-gpt-image-2-edit" as const,
      },
    },
  };
  const config = {
    channelMode: "local" as const,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: "",
    imageModel: model,
    videoModel: "",
    textModel: "",
    audioModel: "",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    imageHostBaseUrl: "",
    imageHostApiKey: "",
    systemPrompt: "",
    models: [model],
    imageModels: [model],
    videoModels: [],
    textModels: [],
    audioModels: [],
    quality: "high",
    size: "1536x864",
    count: "3",
    canvasImageCount: "3",
    imageRequestBasicSettings: true as const,
    imageAdvancedSettingsByScope: {},
    videoGenerationSettingsByScope: {},
    apiRelays: [provider],
    apiRouting: {
      text: { source: "relay" as const, providerId: "", model: "" },
      image: { source: "relay" as const, providerId: provider.id, model },
      video: { source: "relay" as const, providerId: "", model: "" },
      audio: { source: "relay" as const, providerId: "", model: "" },
    },
    apiBoardRouting: {} as import("@/stores/use-config-store").AiConfig["apiBoardRouting"],
    apiPlatformBoardRouting: {} as import("@/stores/use-config-store").AiConfig["apiPlatformBoardRouting"],
    apiRelayAdvanced: { allowCustomModel: false, defaultTimeoutMs: 360_000, showDisabledProviders: false },
  };
  const references = Array.from({ length: 16 }, (_, index) => ({
    id: `ref-${index}`,
    name: `ref-${index}.png`,
    type: "image/png",
    dataUrl: `data:image/png;base64,${Buffer.from(`ref-${index}`).toString("base64")}`,
  }));

  const before = studioCalls.length;
  const images = await requestEdit(config, "edit all refs", references, undefined, undefined, { useReferenceLabels: false });

  assert.equal(images.length, 3);
  assert.equal(studioCalls.length, before + 1);
  const input = studioCalls.at(-1) as {
    operation?: string;
    size?: string;
    quality?: string;
    n?: number;
    imageUrl?: string;
    imageUrls?: string[];
  };
  assert.equal(input.operation, "edit");
  assert.equal(input.size, "1536x864");
  assert.equal(input.quality, "high");
  assert.equal(input.n, 3);
  assert.equal(input.imageUrl, references[0].dataUrl);
  assert.deepEqual(input.imageUrls, references.map((reference) => reference.dataUrl));
});
