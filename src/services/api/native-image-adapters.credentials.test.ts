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
      try { return await nextResolve(target + suffix, context); } catch {}
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(aliasLoader)}`, import.meta.url);

type AxiosCall = {
  method: "GET" | "POST";
  url: string;
  config?: { headers?: Record<string, string> };
};

const axiosCalls: AxiosCall[] = [];
mock.module("axios", {
  defaultExport: {
    post: async (url: string, _body: unknown, config?: AxiosCall["config"]) => {
      axiosCalls.push({ method: "POST", url, config });
      if (url.endsWith("/services/aigc/text2image/image-synthesis")) {
        return { data: { output: { task_id: "task-dashscope" } } };
      }
      if (url.endsWith("/imgenstd/imgen")) {
        return { data: { task_id: "task-miaohua" } };
      }
      throw new Error(`unexpected POST ${url}`);
    },
    get: async (url: string, config?: AxiosCall["config"]) => {
      axiosCalls.push({ method: "GET", url, config });
      if (url.endsWith("/tasks/task-dashscope")) {
        return {
          data: {
            output: {
              task_status: "SUCCEEDED",
              results: [{ url: "https://media.example.test/dashscope.png" }],
            },
          },
        };
      }
      if (url.endsWith("/imgenstd/result/task-miaohua")) {
        return {
          data: {
            state: "SUCCESS",
            images: [{ raw: "https://media.example.test/miaohua.png" }],
          },
        };
      }
      throw new Error(`unexpected GET ${url}`);
    },
    isAxiosError: () => false,
    interceptors: { request: { use: () => undefined } },
  },
  namedExports: { isAxiosError: () => false },
});
mock.module("@/services/api/ai-routing", {
  namedExports: {
    routedLocalApiUrl: (_route: unknown, path: string) => `/local-relay-proxy${path}`,
  },
});

const {
  createDashscopeImageTask,
  pollDashscopeImageTask,
} = await import("./dashscope.ts");
const {
  createMiaohuaImageTask,
  pollMiaohuaImageTask,
} = await import("./sensenova.ts");

const browserSecret = "test-browser-secret-not-for-upstream";
const providerBase = {
  id: "relay-image-credentials",
  name: "Image relay",
  apiKey: browserSecret,
  apiKeyId: "credential-image-one",
  apiKeys: [],
  apiKeyIds: [],
  proxyMode: "direct",
  proxyUrl: "",
  enabled: true,
  capabilities: ["image"],
  models: [],
  textModels: [],
  imageModels: [],
  videoModels: [],
  audioModels: [],
  timeoutMs: 30_000,
  remark: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

const dashscopeRoute = {
  mode: "local",
  capability: "image",
  model: "qwen-image",
  timeoutMs: 30_000,
  provider: {
    ...providerBase,
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    adapterType: "dashscope",
    models: ["qwen-image"],
    imageModels: ["qwen-image"],
  },
} as const;

const miaohuaRoute = {
  mode: "local",
  capability: "image",
  model: "miaohua-v1",
  timeoutMs: 30_000,
  provider: {
    ...providerBase,
    baseUrl: "https://api.sensenova.cn/v1",
    adapterType: "sensenova-miaohua",
    models: ["miaohua-v1"],
    imageModels: ["miaohua-v1"],
  },
} as const;

test.afterEach(() => {
  axiosCalls.length = 0;
});

function assertSecretFreeCalls() {
  assert.equal(JSON.stringify(axiosCalls).includes(browserSecret), false);
  for (const call of axiosCalls) {
    const headers = new Headers(call.config?.headers);
    assert.equal(headers.get("authorization"), null);
    assert.equal(headers.get("x-api-key"), null);
    assert.equal(headers.get("x-boundless-relay-credential-id"), "credential-image-one");
  }
}

test("DashScope async image task keeps only the opaque credential identity", async () => {
  const task = await createDashscopeImageTask(
    dashscopeRoute as unknown as Parameters<typeof createDashscopeImageTask>[0],
    { model: "qwen-image", prompt: "synthetic credential-boundary fixture", count: 1 },
  );

  assert.equal("apiKey" in task, false);
  assert.equal(JSON.stringify(task).includes(browserSecret), false);
  assert.equal(task.credentialId, "credential-image-one");

  const state = await pollDashscopeImageTask(
    dashscopeRoute as unknown as Parameters<typeof pollDashscopeImageTask>[0],
    task.taskId,
    { credentialId: task.credentialId },
  );
  assert.deepEqual(state, {
    status: "completed",
    urls: ["https://media.example.test/dashscope.png"],
  });
  assertSecretFreeCalls();
});

test("SenseNova Miaohua image task keeps only the opaque credential identity", async () => {
  const task = await createMiaohuaImageTask(
    miaohuaRoute as unknown as Parameters<typeof createMiaohuaImageTask>[0],
    { model: "miaohua-v1", prompt: "synthetic credential-boundary fixture", count: 1 },
  );

  assert.equal("apiKey" in task, false);
  assert.equal(JSON.stringify(task).includes(browserSecret), false);
  assert.equal(task.credentialId, "credential-image-one");

  const state = await pollMiaohuaImageTask(
    miaohuaRoute as unknown as Parameters<typeof pollMiaohuaImageTask>[0],
    task,
  );
  assert.deepEqual(state, {
    status: "completed",
    urls: ["https://media.example.test/miaohua.png"],
  });
  assertSecretFreeCalls();
});
