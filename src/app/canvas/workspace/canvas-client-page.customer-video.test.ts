import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { sniffMedia } from "../../../studio/adapters/contracts.ts";
import { buildCustomerVideoStudioRequest } from "../../../studio/adapters/contracts.ts";

const PAGE = fileURLToPath(new URL("./canvas-client-page.tsx", import.meta.url));

type CustomerVideoContracts = {
  splitCustomerVideoPath: (path: string) => { pathname: string; query: string };
  joinCustomerVideoRequestUrl: (input: {
    path: string;
    baseUrl?: string;
    localProxyUrl?: string;
  }) => string;
  parseCustomerVideoHttpBody: (input: {
    ok: boolean;
    status: number;
    contentType: string;
    bytes: Uint8Array;
    sniffMedia: (bytes: Uint8Array) => string;
    createObjectUrl: (blob: Blob) => string;
  }) => { ok: boolean; status: number; data: Record<string, unknown> };
  customerVideoCreatedTaskId: (data: {
    video_id?: string;
    task_id?: string;
    request_id?: string;
    id?: string;
    task?: { video_id?: string; task_id?: string; id?: string };
  }) => string;
  canvasCustomerVideoSubmitGuard: (input: {
    hasLocalAdapter: boolean;
    isLocalRoute: boolean;
    adapterType?: string;
    model?: string;
    baseUrl?: string;
    operation?: string;
    prompt: string;
    references: Array<{ useAs?: string; value?: string }>;
    videoCount: number;
  }) => { kind: "native" | "customer" | "block"; reason?: string };
};

async function loadCustomerVideoContracts(): Promise<CustomerVideoContracts> {
  const source = fs.readFileSync(PAGE, "utf8");
  const start = source.indexOf("// canvas-customer-video-contract:start");
  const end = source.indexOf("// canvas-customer-video-contract:end");
  assert.ok(start >= 0, "canvas-client-page.tsx must mark customer video contract helpers");
  assert.ok(end > start, "canvas-client-page.tsx customer video contract marker is incomplete");
  const slice = source.slice(start, end);
  const js = ts.transpileModule(slice, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    fileName: "canvas-customer-video-contract.ts",
  }).outputText;
  const tmpDir = path.join(fileURLToPath(new URL("../../../..", import.meta.url)), "temp");
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, "canvas-customer-video-contract.tmp.mjs");
  fs.writeFileSync(tmp, js);
  try {
    return (await import(pathToFileURL(tmp).href + `?t=${Date.now()}`)) as CustomerVideoContracts;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function mp4Bytes() {
  const bytes = new Uint8Array(64);
  bytes[4] = 0x66;
  bytes[5] = 0x74;
  bytes[6] = 0x79;
  bytes[7] = 0x70;
  bytes[8] = 0x69;
  bytes[9] = 0x73;
  bytes[10] = 0x6f;
  bytes[11] = 0x6d;
  return bytes;
}

function pageSource() {
  return fs.readFileSync(PAGE, "utf8");
}

test("joinCustomerVideoRequestUrl keeps official OpenAI /v1/videos create, poll, and /content", async () => {
  const { joinCustomerVideoRequestUrl } = await loadCustomerVideoContracts();
  const baseUrl = "https://api.openai.com/v1";
  assert.equal(joinCustomerVideoRequestUrl({ path: "/videos", baseUrl }), "https://api.openai.com/v1/videos");
  assert.equal(
    joinCustomerVideoRequestUrl({ path: "/videos/vid%201", baseUrl }),
    "https://api.openai.com/v1/videos/vid%201",
  );
  assert.equal(
    joinCustomerVideoRequestUrl({ path: "/videos/vid%201/content", baseUrl }),
    "https://api.openai.com/v1/videos/vid%201/content",
  );
});

test("joinCustomerVideoRequestUrl keeps Agnes create under /v1/videos and poll at /agnesapi?video_id=", async () => {
  const { joinCustomerVideoRequestUrl } = await loadCustomerVideoContracts();
  const baseUrl = "https://apihub.agnes-ai.com/v1";
  assert.equal(joinCustomerVideoRequestUrl({ path: "/videos", baseUrl }), "https://apihub.agnes-ai.com/v1/videos");
  assert.equal(
    joinCustomerVideoRequestUrl({ path: "/agnesapi?video_id=vid-1", baseUrl }),
    "https://apihub.agnes-ai.com/agnesapi?video_id=vid-1",
  );
  assert.equal(
    joinCustomerVideoRequestUrl({ path: "/agnesapi?video_id=vid%201", baseUrl }),
    "https://apihub.agnes-ai.com/agnesapi?video_id=vid%201",
  );
  assert.equal(
    joinCustomerVideoRequestUrl({
      path: "/agnesapi?video_id=vid-1",
      baseUrl: "https://relay.example.test/v1",
    }),
    "https://relay.example.test/v1/agnesapi?video_id=vid-1",
  );
});

test("joinCustomerVideoRequestUrl preserves local proxy query without a trailing slash before ?", async () => {
  const { joinCustomerVideoRequestUrl } = await loadCustomerVideoContracts();
  assert.equal(
    joinCustomerVideoRequestUrl({
      path: "/agnesapi?video_id=vid-1",
      localProxyUrl: "/local-relay-proxy/agnesapi/",
    }),
    "/local-relay-proxy/agnesapi?video_id=vid-1",
  );
  assert.equal(
    joinCustomerVideoRequestUrl({
      path: "/videos/vid-1/content",
      localProxyUrl: "/local-relay-proxy/videos/vid-1/content/",
    }),
    "/local-relay-proxy/videos/vid-1/content",
  );
  const joined = joinCustomerVideoRequestUrl({
    path: "/agnesapi?video_id=vid-1",
    localProxyUrl: "/local-relay-proxy/agnesapi/",
  });
  assert.equal(joined.includes("??"), false);
  assert.equal(joined.endsWith("/?video_id=vid-1"), false);
});

test("parseCustomerVideoHttpBody treats official /content MP4 bytes as a blob URL instead of JSON", async () => {
  const { parseCustomerVideoHttpBody } = await loadCustomerVideoContracts();
  const parsed = parseCustomerVideoHttpBody({
    ok: true,
    status: 200,
    contentType: "video/mp4",
    bytes: mp4Bytes(),
    sniffMedia,
    createObjectUrl: () => "blob:official-mp4",
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.success, true);
  assert.equal(parsed.data.url, "blob:official-mp4");
  assert.equal((parsed.data.content as { video_url?: string }).video_url, "blob:official-mp4");
});

test("parseCustomerVideoHttpBody keeps JSON create/poll bodies as JSON", async () => {
  const { parseCustomerVideoHttpBody } = await loadCustomerVideoContracts();
  const parsed = parseCustomerVideoHttpBody({
    ok: true,
    status: 200,
    contentType: "application/json",
    bytes: new TextEncoder().encode(JSON.stringify({ id: "video_1", status: "queued" })),
    sniffMedia,
    createObjectUrl: () => "blob:should-not-use",
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.id, "video_1");
  assert.equal(parsed.data.url, undefined);
});

test("parseCustomerVideoHttpBody maps Agnes metadata.url onto content.video_url for poll completion", async () => {
  const { parseCustomerVideoHttpBody } = await loadCustomerVideoContracts();
  const parsed = parseCustomerVideoHttpBody({
    ok: true,
    status: 200,
    contentType: "application/json",
    bytes: new TextEncoder().encode(JSON.stringify({
      status: "completed",
      video_id: "video-9",
      task_id: "task-1",
      metadata: { url: "https://example.test/official.mp4" },
    })),
    sniffMedia,
    createObjectUrl: () => "blob:should-not-use",
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.url, "https://example.test/official.mp4");
  assert.equal((parsed.data.content as { video_url?: string }).video_url, "https://example.test/official.mp4");
  assert.equal((parsed.data.file_urls as string[])[0], "https://example.test/official.mp4");
});

test("joinCustomerVideoRequestUrl keeps generic relay /v1 instead of stripping it", async () => {
  const { joinCustomerVideoRequestUrl } = await loadCustomerVideoContracts();
  assert.equal(
    joinCustomerVideoRequestUrl({ path: "/videos/generations", baseUrl: "https://hansyai.cn/v1" }),
    "https://hansyai.cn/v1/videos/generations",
  );
  assert.equal(
    joinCustomerVideoRequestUrl({ path: "/tasks", baseUrl: "https://hansyai.cn/v1" }),
    "https://hansyai.cn/v1/tasks",
  );
  assert.equal(
    joinCustomerVideoRequestUrl({ path: "/videos", baseUrl: "https://api.openai.com" }),
    "https://api.openai.com/v1/videos",
  );
});

test("parseCustomerVideoHttpBody does not treat non-video binary as a successful empty JSON task", async () => {
  const { parseCustomerVideoHttpBody } = await loadCustomerVideoContracts();
  const bytes = new Uint8Array(400);
  bytes.fill(7);
  const parsed = parseCustomerVideoHttpBody({
    ok: true,
    status: 200,
    contentType: "application/octet-stream",
    bytes,
    sniffMedia,
    createObjectUrl: () => "blob:wrong",
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.data.success, false);
  assert.equal(parsed.data.url, undefined);
});

test("customerVideoCreatedTaskId prefers Agnes video_id over task_id", async () => {
  const { customerVideoCreatedTaskId } = await loadCustomerVideoContracts();
  assert.equal(
    customerVideoCreatedTaskId({ task_id: "task-1", video_id: "video-9", id: "id-3" }),
    "video-9",
  );
  assert.equal(
    customerVideoCreatedTaskId({ task: { task_id: "task-1", video_id: "video-9" }, id: "id-3" }),
    "video-9",
  );
  assert.equal(customerVideoCreatedTaskId({ id: "video_openai" }), "video_openai");
});

test("canvasCustomerVideoSubmitGuard blocks direct browser video endpoints and keeps local labeled I2V", async () => {
  const { canvasCustomerVideoSubmitGuard } = await loadCustomerVideoContracts();
  const i2v = canvasCustomerVideoSubmitGuard({
    hasLocalAdapter: false,
    isLocalRoute: false,
    operation: "image-to-video",
    prompt: "p",
    references: [{ useAs: "first_frame", value: "https://example.test/first.png" }],
    videoCount: 0,
  });
  assert.equal(i2v.kind, "block");
  assert.match(String(i2v.reason), /同源后端中转|浏览器直接发送|API Key/u);

  const keyframes = canvasCustomerVideoSubmitGuard({
    hasLocalAdapter: false,
    isLocalRoute: true,
    operation: "first-last-frame-to-video",
    prompt: "p",
    references: [
      { useAs: "first_frame", value: "https://example.test/first.png" },
      { useAs: "last_frame", value: "https://example.test/last.png" },
    ],
    videoCount: 0,
  });
  assert.equal(keyframes.kind, "customer");
});

test("canvasCustomerVideoSubmitGuard blocks official xAI first/last-frame mode with an explicit reason", async () => {
  const { canvasCustomerVideoSubmitGuard } = await loadCustomerVideoContracts();
  const result = canvasCustomerVideoSubmitGuard({
    hasLocalAdapter: false,
    isLocalRoute: true,
    adapterType: "xai-imagine",
    model: "grok-imagine-video-1.5",
    baseUrl: "https://api.x.ai/v1",
    operation: "first-last-frame-to-video",
    prompt: "p",
    references: [
      { useAs: "first_frame", value: "https://example.test/first.png" },
      { useAs: "last_frame", value: "https://example.test/last.png" },
    ],
    videoCount: 0,
  });
  assert.equal(result.kind, "block");
  assert.match(String(result.reason), /xAI|首尾帧|尾帧|last_frame/);
});

test("canvasCustomerVideoSubmitGuard blocks official xAI image and reference_images mix with an explicit reason", async () => {
  const { canvasCustomerVideoSubmitGuard } = await loadCustomerVideoContracts();
  const result = canvasCustomerVideoSubmitGuard({
    hasLocalAdapter: false,
    isLocalRoute: true,
    adapterType: "xai-imagine",
    model: "grok-imagine-video-1.5",
    baseUrl: "https://api.x.ai/v1",
    operation: "reference-to-video",
    prompt: "p",
    references: [
      { useAs: "first_frame", value: "https://example.test/first.png" },
      { useAs: "reference_image", value: "https://example.test/reference.png" },
    ],
    videoCount: 0,
  });
  assert.equal(result.kind, "block");
  assert.match(String(result.reason), /xAI|I2V|R2V|reference_images|互斥/);
});

test("canvasCustomerVideoSubmitGuard blocks official OpenAI last_frame mode with an explicit reason", async () => {
  const { canvasCustomerVideoSubmitGuard } = await loadCustomerVideoContracts();
  const result = canvasCustomerVideoSubmitGuard({
    hasLocalAdapter: true,
    isLocalRoute: true,
    adapterType: "openai",
    model: "sora-2",
    baseUrl: "https://api.openai.com/v1",
    operation: "first-last-frame-to-video",
    prompt: "p",
    references: [
      { useAs: "first_frame", value: "https://example.test/first.png" },
      { useAs: "last_frame", value: "https://example.test/last.png" },
    ],
    videoCount: 0,
  });
  assert.equal(result.kind, "block");
  assert.match(String(result.reason), /OpenAI|尾帧|last_frame|input_reference/);
});

test("canvasCustomerVideoSubmitGuard still blocks empty local adapter T2V and I2V-without-frames", async () => {
  const { canvasCustomerVideoSubmitGuard } = await loadCustomerVideoContracts();
  const emptyLocal = canvasCustomerVideoSubmitGuard({
    hasLocalAdapter: false,
    isLocalRoute: true,
    operation: "text-to-video",
    prompt: "p",
    references: [],
    videoCount: 0,
  });
  assert.equal(emptyLocal.kind, "block");
  assert.match(String(emptyLocal.reason), /没有已验证的原生视频/);

  const i2vNoFrames = canvasCustomerVideoSubmitGuard({
    hasLocalAdapter: false,
    isLocalRoute: false,
    operation: "image-to-video",
    prompt: "p",
    references: [],
    videoCount: 0,
  });
  assert.equal(i2vNoFrames.kind, "block");
  assert.match(String(i2vNoFrames.reason), /同源后端中转|浏览器直接发送|API Key/u);

  const native = canvasCustomerVideoSubmitGuard({
    hasLocalAdapter: true,
    isLocalRoute: true,
    operation: "image-to-video",
    prompt: "p",
    references: [{ useAs: "first_frame", value: "https://example.test/first.png" }],
    videoCount: 0,
  });
  assert.equal(native.kind, "native");
});

test("page still hands first_frame/last_frame to buildCustomerVideoStudioRequest and does not empty labeled refs", () => {
  const source = pageSource();
  assert.match(source, /first_frame:\s*payload\.first_frame/);
  assert.match(source, /last_frame:\s*payload\.last_frame/);
  assert.match(
    source,
    /buildSeedance2CustomerVideoPayload\(\s*latest,\s*(hydratedCustomerReferences|unresolvedReferences|hydrated)/,
  );
  assert.doesNotMatch(
    source,
    /hasCustomerMediaCandidates && \(authorityError \|\| !localAdapter\)/,
  );
  assert.doesNotMatch(
    source,
    /serializer 只验证了 text-to-video，不能按 \$\{ledgerOperation\} 提交/,
  );
});

test("customer request forwards every validated scalar setting from wirePayload to the provider builder", () => {
  const source = pageSource();
  for (const field of [
    "resolution",
    "fps",
    "generateAudio",
    "seed",
    "steps",
    "guidance",
    "modelVariant",
    "watermark",
    "promptExpansion",
    "returnLastFrame",
    "audioUrl",
    "width",
    "height",
  ]) {
    assert.match(source, new RegExp(`${field}:\\s*wirePayload\\.${field}`));
  }
  assert.match(source, /negative_prompt:\s*wirePayload\.negative_prompt/);
  assert.match(source, /ratio:\s*wirePayload\.ratio/);
  assert.match(source, /duration:\s*wirePayload\.duration/);
  assert.match(source, /operation:\s*wirePayload\.mode/);
  assert.match(source, /first_frame:\s*payload\.first_frame/);
  assert.match(source, /last_frame:\s*payload\.last_frame/);
  assert.doesNotMatch(source, /image_urls:\s*wirePayload\.image_urls/);
  assert.doesNotMatch(source, /payload\.duration \|\| 5/);
  assert.doesNotMatch(source, /payload\.ratio \|\| ["']16:9["']/);
});

test("customer video requests pin only an opaque credential id and never construct browser Authorization", () => {
  const source = pageSource();
  assert.match(source, /buildLocalRelayProxyHeaders\([\s\S]*?apiConfig\.credentialId/);
  assert.doesNotMatch(source, /headers\.Authorization\s*=\s*`Bearer/);
  assert.doesNotMatch(source, /apiConfig\.apiKey/);
  assert.doesNotMatch(source, /strictResume\.apiKey/);
  assert.doesNotMatch(source, /customerLocalCredential\.apiKey/);
});

test("Fal customer builder refuses unmapped models instead of relaxing validation", () => {
  assert.throws(
    () =>
      buildCustomerVideoStudioRequest({
        adapterType: "fal",
        model: "kling-v3",
        baseUrl: "https://fal.run",
        prompt: "p",
        first_frame: "https://example.test/first.png",
      }),
    /未映射到官方队列端点/,
  );
});
