(function () {
  "use strict";

  var PROVIDER_ID = "chatgpt2api";
  var CHAT_PROVIDER_ID = "chatgpt2api-chat";
  var OPENAI_PROVIDER_ID = "openai";
  var DEFAULT_MODEL_ID = "gpt-image-2";
  var DEFAULT_CHAT_MODEL_ID = "gpt-5.5";
  var SESSION_KEY_PLACEHOLDER = "chatgpt2api-session";
  var BRIDGE_PATHS = [
    "/canvas/chatgpt2api/images/generations",
    "/canvas/chatgpt2api/images/edits",
    "/api/tapnow-bridge/images/generations",
    "/api/tapnow-bridge/images/edits"
  ];
  var AUTH_PROXY_PATHS = [
    "/v1/chat/completions",
    "/v1/responses",
    "/v1/models"
  ];
  var AUTH_DB_NAME = "chatgpt2api";
  var AUTH_STORE_NAME = "auth";
  var AUTH_KEY_STORAGE_KEY = "chatgpt2api_auth_key";
  var AUTH_SESSION_STORAGE_KEY = "chatgpt2api_auth_session";

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var modelCache = null;
  var sessionModelCache = null;
  var authTokenPromise = null;

  function readJsonStorage(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function unwrapLocalForageRecord(value) {
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
      return value.value;
    }
    return value;
  }

  function readIndexedDbValue(key) {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var request;
      try {
        request = window.indexedDB.open(AUTH_DB_NAME);
      } catch (_) {
        resolve(null);
        return;
      }
      request.onerror = function () {
        resolve(null);
      };
      request.onsuccess = function () {
        var db = request.result;
        if (!db || !db.objectStoreNames || !db.objectStoreNames.contains(AUTH_STORE_NAME)) {
          try { db && db.close(); } catch (_) {}
          resolve(null);
          return;
        }
        try {
          var tx = db.transaction(AUTH_STORE_NAME, "readonly");
          var store = tx.objectStore(AUTH_STORE_NAME);
          var getRequest = store.get(key);
          getRequest.onerror = function () {
            resolve(null);
          };
          getRequest.onsuccess = function () {
            resolve(unwrapLocalForageRecord(getRequest.result));
          };
          tx.oncomplete = function () {
            try { db.close(); } catch (_) {}
          };
          tx.onerror = function () {
            try { db.close(); } catch (_) {}
          };
        } catch (_) {
          try { db.close(); } catch (__) {}
          resolve(null);
        }
      };
    });
  }

  async function getAuthToken() {
    if (!authTokenPromise) {
      authTokenPromise = (async function () {
        var session = await readIndexedDbValue(AUTH_SESSION_STORAGE_KEY);
        if (session && typeof session === "object" && session.key) {
          return String(session.key || "").trim();
        }
        var storedKey = await readIndexedDbValue(AUTH_KEY_STORAGE_KEY);
        if (storedKey) return String(storedKey || "").trim();
        try {
          return String(window.localStorage.getItem(AUTH_KEY_STORAGE_KEY) || "").trim();
        } catch (_) {
          return "";
        }
      })();
    }
    return authTokenPromise;
  }

  function normalizeModel(item) {
    var id = String(item && item.id || "").trim();
    if (!id) return null;
    var displayName = String(item.display_name || item.displayName || id).trim();
    var sizes = Array.isArray(item.sizes) && item.sizes.length ? item.sizes.map(String) : ["auto", "1k", "2k", "4k"];
    var normalizedSizes = Array.from(new Set(sizes.map(function (size) {
      var text = String(size || "").trim();
      var upper = text.toUpperCase();
      if (upper === "AUTO") return "Auto";
      if (upper === "1K" || upper === "2K" || upper === "4K") return upper;
      return text || "Auto";
    })));
    return {
      id: id,
      displayName: displayName,
      provider: String(item.provider || PROVIDER_ID).trim() || PROVIDER_ID,
      sizes: normalizedSizes,
      defaultOutputSize: String(item.default_output_size || item.defaultOutputSize || "1k").trim()
    };
  }

  function fallbackModels() {
    return [{
      id: DEFAULT_MODEL_ID,
      displayName: "GPT Image 2",
      provider: "chatgpt",
      sizes: ["Auto", "1K", "2K", "4K"],
      defaultOutputSize: "1k"
    }];
  }

  function fallbackSessionModels() {
    return [
      { id: DEFAULT_CHAT_MODEL_ID, displayName: "GPT 5.5", provider: CHAT_PROVIDER_ID },
      { id: "gpt-5.1", displayName: "GPT 5.1", provider: CHAT_PROVIDER_ID },
      { id: "gpt-4o", displayName: "GPT-4o", provider: CHAT_PROVIDER_ID }
    ];
  }

  async function apiFetch(path, options) {
    if (!nativeFetch) throw new Error("fetch is not available");
    var token = await getAuthToken();
    var headers = new Headers(options && options.headers || {});
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", "Bearer " + token);
    }
    return nativeFetch(path, Object.assign({}, options || {}, { headers: headers }));
  }

  async function listImageModels(force) {
    if (modelCache && !force) return modelCache.slice();
    try {
      var response = await apiFetch("/api/image-models?capability=text2image", { method: "GET" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      var payload = await response.json();
      var items = Array.isArray(payload && payload.items) ? payload.items : [];
      var models = items.map(normalizeModel).filter(Boolean);
      modelCache = models.length ? models : fallbackModels();
    } catch (error) {
      console.warn("[chatgpt2api canvas bridge] model sync failed", error);
      modelCache = fallbackModels();
    }
    return modelCache.slice();
  }

  function normalizeSessionModel(item, excludedIds) {
    var id = String(item && item.id || "").trim();
    if (!id || (excludedIds && excludedIds.has(id)) || !isSessionModel(item)) return null;
    return {
      id: id,
      displayName: String(item.display_name || item.displayName || id).trim() || id,
      provider: CHAT_PROVIDER_ID
    };
  }

  function isSessionModel(item) {
    var id = String(item && item.id || "").trim().toLowerCase();
    if (!id) return false;
    var ownedBy = String(item && item.owned_by || "").trim().toLowerCase();
    var capabilities = Array.isArray(item && item.capabilities)
      ? item.capabilities.map(function (value) { return String(value || "").toLowerCase(); })
      : [];
    var haystack = [id, ownedBy].concat(capabilities).join(" ");
    if (/\b(text2image|image2image|multi_reference|embedding|embeddings|moderation)\b/.test(haystack)) return false;
    if (/(^|[-_])(image|img|video|sora|tts|audio|whisper|embed|embedding|rerank|vision)([-_]|$)/.test(id)) return false;
    if (id.indexOf("gpt-image") >= 0 || id.indexOf("dall-e") >= 0 || id.indexOf("flux") >= 0 || id.indexOf("stable-diffusion") >= 0) return false;
    return true;
  }

  async function listSessionModels(force) {
    if (sessionModelCache && !force) return sessionModelCache.slice();
    try {
      var response = await apiFetch("/v1/models", { method: "GET" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      var payload = await response.json();
      var items = Array.isArray(payload && payload.data) ? payload.data : [];
      var imageIds = new Set((await listImageModels(false)).map(function (model) { return model.id; }));
      var models = items.map(function (item) { return normalizeSessionModel(item, imageIds); }).filter(Boolean);
      var byId = new Map();
      fallbackSessionModels().concat(models).forEach(function (model) {
        if (model && model.id && !byId.has(model.id)) byId.set(model.id, model);
      });
      sessionModelCache = Array.from(byId.values());
    } catch (error) {
      console.warn("[chatgpt2api canvas bridge] session model sync failed", error);
      sessionModelCache = fallbackSessionModels();
    }
    return sessionModelCache.slice();
  }

  function buildProviderConfig(existing) {
    return Object.assign({}, existing || {}, {
      key: SESSION_KEY_PLACEHOLDER,
      url: window.location.origin,
      apiType: "openai",
      useProxy: false,
      forceAsync: false,
      enabled: true
    });
  }

  function buildModelConfig(model) {
    var modelId = model.id || DEFAULT_MODEL_ID;
    var displayName = model.displayName || modelId;
    var resolutionLimits = model.sizes && model.sizes.length ? model.sizes : ["Auto", "1K", "2K", "4K"];
    if (!resolutionLimits.includes("Auto")) resolutionLimits = ["Auto"].concat(resolutionLimits);
    return {
      id: modelId,
      _uid: modelId,
      provider: PROVIDER_ID,
      type: "Image",
      modelName: modelId,
      displayName: displayName,
      apiType: "openai",
      disabled: false,
      imageRouteMode: "auto",
      imageBatchMode: "parallel_aggregate",
      nativeMultiImageMode: "auto",
      ratioLimits: ["Auto", "1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3"],
      defaultRatio: "1:1",
      resolutionLimits: resolutionLimits,
      defaultResolution: normalizeTapnowResolution(model.defaultOutputSize || "1k"),
      defaultImageConcurrency: 1,
      customParams: [],
      asyncConfig: null,
      requestChain: null,
      transport: "http-json",
      transportOptions: {
        sseDataPrefix: "data:",
        sseDoneToken: "[DONE]",
        sseDeltaPath: "",
        sseDelimiter: "\n\n",
        wsMessagePath: "",
        wsDoneToken: "[DONE]"
      },
      capabilities: {
        supportsMultipart: true,
        supportsRequestChain: false,
        supportsSSE: false,
        supportsWS: false,
        supportsTools: false
      },
      previewOverrideEnabled: false,
      previewOverridePatch: null,
      requestTemplate: {
        enabled: true,
        endpoint: window.location.origin + "/canvas/chatgpt2api/images/generations",
        method: "POST",
        bodyType: "json",
        headers: { "Content-Type": "application/json" },
        query: {},
        files: {},
        timeoutMs: 300000,
        responseParser: "",
        body: {
          model: "{{modelName}}",
          prompt: "{{prompt}}",
          n: "{{n:number}}",
          size: "{{size}}",
          ratio: "{{ratio}}",
          resolution: "{{resolution}}",
          image_url: "{{imageUrl}}",
          image_urls: "{{imageUrls}}"
        }
      },
      requestOverrideEnabled: false,
      requestOverridePatch: null,
      responseParser: ""
    };
  }

  function buildChatModelConfig(model) {
    var modelId = model.id || DEFAULT_CHAT_MODEL_ID;
    var displayName = model.displayName || modelId;
    return {
      id: modelId,
      _uid: "chatgpt2api-chat-" + modelId,
      provider: CHAT_PROVIDER_ID,
      type: "Chat",
      modelName: modelId,
      displayName: displayName,
      apiType: "openai",
      disabled: false,
      customParams: [],
      asyncConfig: null,
      requestChain: null,
      transport: "http-json",
      transportOptions: {
        sseDataPrefix: "data:",
        sseDoneToken: "[DONE]",
        sseDeltaPath: "",
        sseDelimiter: "\n\n",
        wsMessagePath: "",
        wsDoneToken: "[DONE]"
      },
      capabilities: {
        supportsMultipart: false,
        supportsRequestChain: false,
        supportsSSE: false,
        supportsWS: false,
        supportsTools: true
      },
      previewOverrideEnabled: false,
      previewOverridePatch: null,
      requestTemplate: {
        enabled: true,
        endpoint: window.location.origin + "/v1/chat/completions",
        method: "POST",
        bodyType: "json",
        headers: { "Content-Type": "application/json" },
        query: {},
        files: {},
        timeoutMs: 300000,
        responseParser: "",
        body: {
          model: "{{modelName}}",
          messages: "{{messages}}",
          stream: false
        }
      },
      requestOverrideEnabled: false,
      requestOverridePatch: null,
      responseParser: ""
    };
  }

  function mergeById(existing, additions) {
    var additionsById = new Map(additions.map(function (item) { return [item.id, item]; }));
    var seen = new Set();
    var merged = (Array.isArray(existing) ? existing : []).map(function (item) {
      if (!item || typeof item !== "object") return item;
      var id = String(item.id || item.modelName || "").trim();
      if (!additionsById.has(id)) return item;
      seen.add(id);
      return Object.assign({}, item, additionsById.get(id), {
        _uid: item._uid || additionsById.get(id)._uid || id
      });
    });
    additions.forEach(function (item) {
      if (!seen.has(item.id)) merged.push(item);
    });
    return merged;
  }

  function seedTapnowConfig(models) {
    var normalized = (models && models.length ? models : fallbackModels()).map(normalizeModel).filter(Boolean);
    if (!normalized.some(function (model) { return model.id === DEFAULT_MODEL_ID; })) {
      normalized.unshift(fallbackModels()[0]);
    }
    var tapnowModels = normalized.map(buildModelConfig);

    var providers = readJsonStorage("tapnow_providers", {});
    providers[PROVIDER_ID] = buildProviderConfig(providers[PROVIDER_ID]);
    providers[OPENAI_PROVIDER_ID] = buildProviderConfig(providers[OPENAI_PROVIDER_ID]);
    writeJsonStorage("tapnow_providers", providers);

    var apiConfigs = readJsonStorage("tapnow_api_configs", []);
    writeJsonStorage("tapnow_api_configs", mergeById(apiConfigs, tapnowModels));

    var library = readJsonStorage("tapnow_model_library", []);
    writeJsonStorage("tapnow_model_library", mergeById(Array.isArray(library) ? library : [], tapnowModels));

    try {
      var last = String(window.localStorage.getItem("tapnow_last_image_model") || "").trim();
      var ids = new Set(tapnowModels.map(function (item) { return item.id; }));
      if (!last || last === "nano-banana" || !ids.has(last)) {
        window.localStorage.setItem("tapnow_last_image_model", DEFAULT_MODEL_ID);
      }
    } catch (_) {}

    try {
      var collapsed = readJsonStorage("tapnow_model_library_collapsed", []);
      if (!Array.isArray(collapsed)) collapsed = [];
      if (!collapsed.includes(DEFAULT_MODEL_ID)) collapsed.push(DEFAULT_MODEL_ID);
      writeJsonStorage("tapnow_model_library_collapsed", collapsed);
    } catch (_) {}
  }

  function seedTapnowChatConfig(models) {
    var normalized = (models && models.length ? models : fallbackSessionModels()).map(function (model) {
      return normalizeSessionModel(model);
    }).filter(Boolean);
    if (!normalized.some(function (model) { return model.id === DEFAULT_CHAT_MODEL_ID; })) {
      normalized.unshift(fallbackSessionModels()[0]);
    }
    var tapnowModels = normalized.map(buildChatModelConfig);

    var providers = readJsonStorage("tapnow_providers", {});
    providers[CHAT_PROVIDER_ID] = buildProviderConfig(providers[CHAT_PROVIDER_ID]);
    writeJsonStorage("tapnow_providers", providers);

    var apiConfigs = readJsonStorage("tapnow_api_configs", []);
    writeJsonStorage("tapnow_api_configs", mergeById(apiConfigs, tapnowModels));

    var library = readJsonStorage("tapnow_model_library", []);
    writeJsonStorage("tapnow_model_library", mergeById(Array.isArray(library) ? library : [], tapnowModels));

    try {
      var ids = new Set(tapnowModels.map(function (item) { return item.id; }));
      ["tapnow_chat_model", "tapnow_last_analyze_model", "tapnow_last_extract_model"].forEach(function (key) {
        var last = String(window.localStorage.getItem(key) || "").trim();
        if (!last || last === "gemini-3-pro" || !ids.has(last)) {
          window.localStorage.setItem(key, DEFAULT_CHAT_MODEL_ID);
        }
      });
    } catch (_) {}
  }

  function normalizeTapnowResolution(value) {
    var text = String(value || "").trim().toLowerCase();
    if (text === "auto") return "Auto";
    if (text === "1k" || text === "standard") return "1K";
    if (text === "2k" || text === "medium") return "2K";
    if (text === "4k" || text === "hd" || text === "high") return "4K";
    return "1K";
  }

  function normalizeOutputSize(value) {
    var text = String(value || "").trim().toLowerCase();
    if (!text || text === "auto") return "";
    if (text === "1k" || text === "1K".toLowerCase() || text === "standard") return "1k";
    if (text === "2k" || text === "medium") return "2k";
    if (text === "4k" || text === "hd" || text === "high") return "4k";
    return "";
  }

  function normalizeSize(value) {
    var text = String(value || "").trim();
    if (/^\d+\s*x\s*\d+$/i.test(text)) return text.replace(/\s+/g, "");
    return "";
  }

  function parseMaybeJson(value) {
    if (typeof value !== "string") return value;
    var text = value.trim();
    if (!text) return "";
    if ((text[0] === "{" && text[text.length - 1] === "}") || (text[0] === "[" && text[text.length - 1] === "]")) {
      try { return JSON.parse(text); } catch (_) {}
    }
    return value;
  }

  async function parseRequestBody(options) {
    var body = options && options.body;
    if (!body) return {};
    if (typeof body === "string") {
      try { return JSON.parse(body); } catch (_) { return {}; }
    }
    if (body instanceof FormData) {
      var out = {};
      body.forEach(function (value, key) {
        if (out[key] === undefined) out[key] = value;
        else if (Array.isArray(out[key])) out[key].push(value);
        else out[key] = [out[key], value];
      });
      return out;
    }
    if (body instanceof URLSearchParams) {
      var params = {};
      body.forEach(function (value, key) { params[key] = value; });
      return params;
    }
    if (body && typeof body === "object") return body;
    return {};
  }

  function collectImageInputs(payload) {
    var values = [];
    function add(value) {
      value = parseMaybeJson(value);
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      if (value instanceof Blob || value instanceof File) {
        values.push(value);
        return;
      }
      if (typeof value === "object") {
        add(value.url || value.image_url || value.imageUrl || value.src || value.data || value.b64_json);
        return;
      }
      var text = String(value || "").trim();
      if (!text || text === "undefined" || text === "null") return;
      if (/^(https?:|data:image\/|blob:)/i.test(text)) values.push(text);
    }
    add(payload.image);
    add(payload.image_url);
    add(payload.imageUrl);
    add(payload.image_urls);
    add(payload.imageUrls);
    add(payload.images);
    add(payload.imagesUrl);
    add(payload.imagesUrls);
    return values;
  }

  function dataUrlToFile(dataUrl, filename) {
    var parts = String(dataUrl).split(",");
    var meta = parts[0] || "";
    var b64 = parts[1] || "";
    var mimeMatch = meta.match(/^data:([^;]+);base64$/i);
    var mime = mimeMatch ? mimeMatch[1] : "image/png";
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename || "image.png", { type: mime });
  }

  async function toUploadFile(value, index) {
    if (value instanceof File) return value;
    if (value instanceof Blob) return new File([value], "image-" + index + ".png", { type: value.type || "image/png" });
    var text = String(value || "").trim();
    if (text.startsWith("data:image/")) return dataUrlToFile(text, "image-" + index + ".png");
    var response = await nativeFetch(text, { credentials: "include" });
    if (!response.ok) throw new Error("image fetch failed: " + response.status);
    var blob = await response.blob();
    return new File([blob], "image-" + index + ".png", { type: blob.type || "image/png" });
  }

  function createClientTaskId(prefix) {
    if (window.crypto && window.crypto.randomUUID) return prefix + "-" + window.crypto.randomUUID();
    return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  async function pollTask(id) {
    var maxAttempts = 180;
    for (var attempt = 0; attempt < maxAttempts; attempt += 1) {
      var response = await apiFetch("/api/image-tasks?ids=" + encodeURIComponent(id), { method: "GET" });
      if (!response.ok) throw new Error("task poll failed: HTTP " + response.status);
      var payload = await response.json();
      var item = Array.isArray(payload && payload.items) ? payload.items[0] : null;
      if (!item) throw new Error("task not found");
      if (item.status === "success") return item;
      if (item.status === "error" || item.status === "canceled") {
        throw new Error(item.error || "image task failed");
      }
      await new Promise(function (resolve) { setTimeout(resolve, 2000); });
    }
    throw new Error("image task timeout");
  }

  function taskToOpenAIResponse(task, model) {
    var data = Array.isArray(task && task.data) ? task.data : [];
    var urls = data.map(function (item) {
      if (item && item.url) return item.url;
      if (item && item.b64_json) return "data:image/png;base64," + item.b64_json;
      return "";
    }).filter(Boolean);
    return {
      id: task.id,
      created: Math.floor(Date.now() / 1000),
      model: model || task.model || DEFAULT_MODEL_ID,
      data: data,
      images: data,
      output_images: urls,
      result: { data: data, output_images: urls },
      status: "completed"
    };
  }

  async function createGeneration(payload) {
    var prompt = String(payload.prompt || payload.input || "").trim();
    if (!prompt) throw new Error("prompt is required");
    var model = String(payload.model || payload.modelName || DEFAULT_MODEL_ID).trim() || DEFAULT_MODEL_ID;
    var outputSize = normalizeOutputSize(payload.output_size || payload.outputSize || payload.resolution);
    var size = normalizeSize(payload.size);
    var response = await apiFetch("/api/image-tasks/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_task_id: createClientTaskId("canvas-gen"),
        prompt: prompt,
        model: model,
        size: size || undefined,
        output_size: outputSize || undefined
      })
    });
    if (!response.ok) throw new Error(await response.text() || ("HTTP " + response.status));
    var task = await response.json();
    return taskToOpenAIResponse(await pollTask(task.id), model);
  }

  async function createEdit(payload, imageInputs) {
    var prompt = String(payload.prompt || payload.input || "").trim();
    if (!prompt) throw new Error("prompt is required");
    var model = String(payload.model || payload.modelName || DEFAULT_MODEL_ID).trim() || DEFAULT_MODEL_ID;
    var outputSize = normalizeOutputSize(payload.output_size || payload.outputSize || payload.resolution);
    var size = normalizeSize(payload.size);
    var formData = new FormData();
    formData.append("client_task_id", createClientTaskId("canvas-edit"));
    formData.append("prompt", prompt);
    formData.append("model", model);
    if (size) formData.append("size", size);
    if (outputSize) formData.append("output_size", outputSize);
    for (var index = 0; index < imageInputs.length; index += 1) {
      formData.append("image", await toUploadFile(imageInputs[index], index + 1));
    }
    var response = await apiFetch("/api/image-tasks/edits", { method: "POST", body: formData });
    if (!response.ok) throw new Error(await response.text() || ("HTTP " + response.status));
    var task = await response.json();
    return taskToOpenAIResponse(await pollTask(task.id), model);
  }

  async function handleBridgeRequest(url, options) {
    try {
      var payload = await parseRequestBody(options || {});
      var imageInputs = collectImageInputs(payload);
      var result = imageInputs.length > 0
        ? await createEdit(payload, imageInputs)
        : await createGeneration(payload);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      var message = normalizeBridgeErrorMessage(error);
      var status = /no available image quota|暂无可用额度|额度/i.test(message) ? 429 : 500;
      console.error("[chatgpt2api canvas bridge] generation failed", error);
      notifyBridgeError(message);
      return new Response(JSON.stringify({
        error: { message: message, type: status === 429 ? "insufficient_quota" : "server_error", code: status === 429 ? "insufficient_quota" : "upstream_error" },
        message: message,
        status: "error"
      }), {
        status: status,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  function normalizeBridgeErrorMessage(error) {
    var raw = error && error.message ? error.message : String(error || "generation failed");
    if (/no available image quota/i.test(raw)) {
      return "系统维护中，请10分钟后再试";
    }
    if (/task poll failed: HTTP 401/i.test(raw)) {
      return "登录已失效，画布无法读取当前用户授权，请重新登录后再生成。";
    }
    return raw;
  }

  function notifyBridgeError(message) {
    var text = String(message || "").trim();
    if (!text) return;
    try {
      window.dispatchEvent(new CustomEvent("chatgpt2api-canvas-error", { detail: { message: text } }));
    } catch (_) {}
    try {
      if (window.__chatgpt2apiLastCanvasError === text) return;
      window.__chatgpt2apiLastCanvasError = text;
      window.setTimeout(function () { window.__chatgpt2apiLastCanvasError = ""; }, 5000);
      window.alert(text);
    } catch (_) {}
  }

  function isBridgeUrl(input) {
    var raw = typeof input === "string" ? input : input && input.url;
    if (!raw) return false;
    try {
      var url = new URL(raw, window.location.origin);
      return BRIDGE_PATHS.includes(url.pathname);
    } catch (_) {
      return BRIDGE_PATHS.some(function (path) { return String(raw).indexOf(path) >= 0; });
    }
  }

  function isAuthProxyUrl(input) {
    var raw = typeof input === "string" ? input : input && input.url;
    if (!raw) return false;
    try {
      var url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return false;
      return AUTH_PROXY_PATHS.includes(url.pathname);
    } catch (_) {
      return AUTH_PROXY_PATHS.some(function (path) { return String(raw).indexOf(path) >= 0; });
    }
  }

  function shouldReplaceAuthHeader(value) {
    var auth = String(value || "").trim();
    if (!auth) return true;
    return auth === "Bearer " + SESSION_KEY_PLACEHOLDER || auth.indexOf(SESSION_KEY_PLACEHOLDER) >= 0;
  }

  async function withSessionAuthorization(input, options) {
    var token = await getAuthToken();
    if (!token) return { input: input, options: options };
    var sourceHeaders = options && options.headers ? options.headers : (input && input.headers);
    var headers = new Headers(sourceHeaders || {});
    if (!shouldReplaceAuthHeader(headers.get("Authorization") || headers.get("authorization"))) {
      return { input: input, options: options };
    }
    headers.set("Authorization", "Bearer " + token);
    if (typeof Request !== "undefined" && input instanceof Request) {
      return {
        input: new Request(input, Object.assign({}, options || {}, { headers: headers })),
        options: undefined
      };
    }
    return {
      input: input,
      options: Object.assign({}, options || {}, { headers: headers })
    };
  }

  if (nativeFetch) {
    window.fetch = function (input, options) {
      if (isBridgeUrl(input)) {
        return handleBridgeRequest(input, options || {});
      }
      if (isAuthProxyUrl(input)) {
        return withSessionAuthorization(input, options).then(function (request) {
          return nativeFetch(request.input, request.options);
        });
      }
      return nativeFetch(input, options);
    };
  }

  seedTapnowConfig(fallbackModels());
  seedTapnowChatConfig(fallbackSessionModels());
  listImageModels(true).then(seedTapnowConfig).catch(function (_) {});
  listSessionModels(true).then(seedTapnowChatConfig).catch(function (_) {});

  window.chatgpt2apiCanvasBridge = {
    defaultImageModel: DEFAULT_MODEL_ID,
    defaultChatModel: DEFAULT_CHAT_MODEL_ID,
    getAuthToken: getAuthToken,
    listImageModels: listImageModels,
    listSessionModels: listSessionModels,
    generateImage: createGeneration,
    editImage: function (payload) {
      return createEdit(payload || {}, collectImageInputs(payload || {}));
    },
    reseedTapnowConfig: function () {
      return Promise.all([
        listImageModels(true).then(seedTapnowConfig),
        listSessionModels(true).then(seedTapnowChatConfig)
      ]);
    }
  };
})();
