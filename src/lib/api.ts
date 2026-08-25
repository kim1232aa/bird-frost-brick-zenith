import { httpRequest, request } from "@/lib/request";

export type AccountType = string;
export type AccountStatus = "正常" | "限流" | "异常" | "禁用";
export type ImageModel = string;
export type ImageQuality = "low" | "medium" | "high";
export type ImageTextMode = "auto" | "none" | "overlay";
export type AuthRole = "admin" | "user";

export type ImageModelInfo = {
  id: string;
  object: "model";
  display_name: string;
  provider: string;
  owned_by: string;
  status: string;
  enabled: boolean;
  capabilities: string[];
  sizes: string[];
  default_output_size: string;
  max_n: number;
  supports_stream: boolean;
  supports_multi_image: boolean;
  quality?: ImageQuality;
  speed?: string;
  costs: Record<string, string>;
  price_preview: {
    image_generation: number;
    image_edit: number;
  };
  notes?: string;
};

export type ImageOperationInfo = {
  id: "generate" | "edit" | "upscale" | "remove_bg" | "reframe" | "remix" | string;
  label: string;
  capability: string;
  price_key: string;
  endpoint: string;
  status: string;
  enabled: boolean;
  price: number;
  models: Array<{
    id: string;
    display_name: string;
    provider: string;
  }>;
};

export type PsdReferenceImportResponse = {
  name: string;
  type: "image/png";
  data_url: string;
};

export type Account = {
  access_token: string;
  type: AccountType;
  status: AccountStatus;
  quota: number;
  initial_quota?: number;
  image_quota_unknown?: boolean;
  email?: string | null;
  user_id?: string | null;
  limits_progress?: Array<{
    feature_name?: string;
    remaining?: number;
    reset_after?: string;
  }>;
  default_model_slug?: string | null;
  restore_at?: string | null;
  success: number;
  fail: number;
  last_used_at?: string | null;
  phone_verified?: string;
  proxy?: string;
  proxy_enabled?: boolean;
};

type AccountListResponse = {
  items: Account[];
};

type AccountMutationResponse = {
  items: Account[];
  added?: number;
  skipped?: number;
  removed?: number;
  refreshed?: number;
  errors?: Array<{ access_token: string; error: string }>;
};

type AccountRefreshResponse = {
  items: Account[];
  refreshed: number;
  errors: Array<{ access_token: string; error: string }>;
};

type AccountUpdateResponse = {
  item: Account;
  items: Account[];
};

export type SettingsConfig = {
  proxy: string;
  serper_api_key?: string;
  base_url?: string;
  global_system_prompt?: string;
  sensitive_words?: string[];
  ai_review?: {
    enabled?: boolean;
    base_url?: string;
    api_key?: string;
    model?: string;
    prompt?: string;
  };
  refresh_account_interval_minute?: number | string;
  image_retention_days?: number | string;
  image_retention_hours?: number | string;
  image_task_retention_hours?: number | string;
  cleanup_protect_gallery?: boolean;
  cleanup_protect_user_images?: boolean;
  image_poll_timeout_secs?: number | string;
  image_account_concurrency?: number | string;
  auto_remove_invalid_accounts?: boolean;
  auto_remove_rate_limited_accounts?: boolean;
  log_levels?: string[];
  backup?: BackupSettings;
  backup_state?: BackupState;
  [key: string]: unknown;
};

export type BackupInclude = {
  config: boolean;
  register: boolean;
  cpa: boolean;
  sub2api: boolean;
  logs: boolean;
  image_tasks: boolean;
  accounts_snapshot: boolean;
  auth_keys_snapshot: boolean;
  images: boolean;
};

export type BackupSettings = {
  enabled: boolean;
  provider: "cloudflare_r2" | string;
  account_id: string;
  access_key_id: string;
  secret_access_key: string;
  bucket: string;
  prefix: string;
  interval_minutes: number | string;
  rotation_keep: number | string;
  encrypt: boolean;
  passphrase: string;
  include: BackupInclude;
};

export type BackupState = {
  running: boolean;
  last_started_at?: string | null;
  last_finished_at?: string | null;
  last_status?: string;
  last_error?: string | null;
  last_object_key?: string | null;
};

export type BackupItem = {
  key: string;
  name: string;
  size: number;
  updated_at?: string | null;
  encrypted: boolean;
};

export type BackupDetail = {
  key: string;
  name: string;
  encrypted: boolean;
  created_at?: string | null;
  trigger?: string | null;
  app_version?: string | null;
  storage_backend?: Record<string, unknown> | null;
  files: Array<{
    name: string;
    exists: boolean;
    content_type?: string;
    size: number;
    sha256?: string;
  }>;
  snapshots: Array<{
    name: string;
    count: number;
  }>;
};

export type ManagedImage = {
  rel: string;
  path?: string;
  name: string;
  date: string;
  size: number;
  url: string;
  thumbnail_url?: string;
  created_at: string;
  width?: number;
  height?: number;
  tags?: string[];
  owner_id?: string;
  // 后端在 list_images 里打的标记：true 表示该 owner_id 落在 admin 集合里。
  // 前端用它把 badge 显示成"管理员"，避免暴露具体 admin 密钥 id。
  is_admin_owner?: boolean;
  // 生成时记下来的 prompt 原文（image_prompts.json）。老数据为空字符串。
  // 给"我的作品"页一键复用 / 发布画廊用；为空时前端弹窗手填。
  prompt?: string;
};

export type ImageOwner = {
  id: string;
  name: string;
  deleted: boolean;
  count: number;
};

export type SystemLog = {
  id: string;
  time: string;
  type: "call" | "account" | string;
  summary?: string;
  detail?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ImageResponse = {
  created: number;
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
};

export type AsyncImageGenerationTask = {
  task_id: string;
  id: string;
  object: "image.generation.task";
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  created_at: string;
  updated_at: string;
  data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  error?: { message: string };
};

export type ImageTask = {
  id: string;
  status: "queued" | "running" | "success" | "completed" | "done" | "succeeded" | "error" | "failed" | "canceled" | "cancelled";
  mode: "generate" | "edit";
  operation?: string;
  model?: ImageModel;
  size?: string;
  output_size?: string;
  quality?: string;
  created_at: string;
  updated_at: string;
  width?: number;
  height?: number;
  metadata?: {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  result?: {
    width?: number;
    height?: number;
    metadata?: {
      width?: number;
      height?: number;
      naturalWidth?: number;
      naturalHeight?: number;
    };
  };
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
    width?: number;
    height?: number;
    metadata?: {
      width?: number;
      height?: number;
      naturalWidth?: number;
      naturalHeight?: number;
    };
  }>;
  error?: string;
};

type ImageTaskListResponse = {
  items: ImageTask[];
  missing_ids: string[];
};

type ImageTaskCancelResponse = {
  canceled: string[];
  skipped: string[];
  missing_ids: string[];
};

export type ImageTaskBillingBatch = {
  id: string;
  total: number;
  index: number;
};

export type WebSessionResponse = {
  ok: boolean;
  version: string;
  role: AuthRole;
  subject_id: string;
  auth_key_id?: string;
  name: string;
};

export type UserKey = {
  id: string;
  name: string;
  role: "user";
  enabled: boolean;
  created_at: string | null;
  last_used_at: string | null;
  quota: number;
  used: number;
  unlimited: boolean;
  remaining: number | null;
};

export type AuthIdentity = {
  id: string;
  name: string;
  role: AuthRole;
  quota: number;
  used: number;
  unlimited: boolean;
  remaining: number | null;
};

export type BillingPlan = {
  id: string;
  name: string;
  original_price?: number;
  price: number;
  currency: string;
  credits: number;
  recharge_url?: string;
  positioning: string;
  limit_once?: boolean;
  api_enabled?: boolean;
  highlight?: boolean;
  enabled?: boolean;
};

export type BillingRecord = {
  id: string;
  time: string;
  subject_id: string;
  subject_name?: string;
  type: string;
  amount: number;
  balance_after?: number | null;
  endpoint?: string;
  model?: string;
  note?: string;
  metadata?: Record<string, unknown>;
  image_upstream?: string;
  image_upstream_label?: string;
  image_upstream_attempts?: Array<Record<string, unknown>>;
  image_upstream_chain_label?: string;
};

export type ImageUpstreamStats = {
  period: string;
  total_success: number;
  total_failed: number;
  fallback_triggered: number;
  items: Array<{ id: string; name: string; count: number; percent: number }>;
};

export type ImageUpstreamItem = {
  id: string;
  name: string;
  role: string;
  enabled: boolean;
  description?: string;
  priority?: number;
  configured?: boolean;
  status?: string;
  ready_accounts?: number;
};

export type ImageUpstreamStatus = {
  upstreams: ImageUpstreamItem[];
  updated_at?: number;
};

export type TransferRecipientPreview = {
  username: string;
  name?: string;
  enabled: boolean;
};

export type BillingSummary = {
  identity: AuthIdentity;
  records: BillingRecord[];
  settings: {
    enabled?: boolean;
    unit_name?: string;
    recharge_url?: string;
    default_register_quota?: number;
    daily_budget_per_user?: number;
    monthly_budget_per_user?: number;
    daily_budget_global?: number;
    monthly_budget_global?: number;
    user_concurrency_limit?: number;
    prices?: Record<string, number>;
    plans?: BillingPlan[];
  };
  usage?: {
    day?: number;
    month?: number;
    global_day?: number;
    global_month?: number;
  };
};

export type LoginAccount = {
  id: string;
  role?: AuthRole;
  username: string;
  name: string;
  email: string;
  enabled: boolean;
  auth_key_id: string;
  created_at: string;
  last_login_at?: string | null;
  last_used_at?: string | null;
  quota?: number;
  used?: number;
  remaining?: number | null;
  unlimited?: boolean;
  usage?: {
    day?: number;
    month?: number;
  };
  concurrency_limit?: number;
  effective_concurrency_limit?: number;
  inflight?: number;
  recent_records?: BillingRecord[];
  api_key?: string;
};

export type LoginAccountRechargeMode = "increment" | "decrement" | "set";

export type UserAuthResponse = {
  account: LoginAccount;
  identity: AuthIdentity;
  token?: string;
  expires_at?: string;
};

export type UserProfileResponse = {
  account: LoginAccount | null;
  identity: AuthIdentity;
  billing?: BillingSummary;
};

export type RechargeCode = {
  id: string;
  code: string;
  amount: number;
  note?: string;
  created_at: string;
  redeemed_at?: string | null;
  redeemed_by?: string;
};

export type TraceItem = {
  id: string;
  time: string;
  subject_id?: string;
  subject_name?: string;
  role?: AuthRole | string;
  endpoint?: string;
  model?: string;
  status?: string;
  duration_ms?: number;
  request_text?: string;
  prompt_text?: string;
  error?: string;
  urls?: string[];
  summary?: string;
};

export type SupportSettings = {
  title: string;
  description: string;
  button_label: string;
  contact_url: string;
  announcement: string;
  response_note: string;
  qr_code_data_url: string;
};

export type OutlookPoolResetScope = "all" | "failed" | "unused";

export type RegisterConfig = {
  enabled: boolean;
  mail: {
    request_timeout: number;
    wait_timeout: number;
    wait_interval: number;
    providers: Array<Record<string, unknown>>;
  };
  proxy: string;
  proxy_pool?: {
    enabled: boolean;
    mode: string;
    host: string;
    port: string;
    username: string;
    password: string;
    protocol: string;
    session_prefix: string;
    extra_params: string;
    api_url: string;
    api_protocol: string;
    api_refresh_seconds: number;
  };
  total: number;
  threads: number;
  mode: "total" | "quota" | "available";
  target_quota: number;
  target_available: number;
  check_interval: number;
  unified_password?: string;
  cpa_export?: {
    base_url: string;
    secret_key: string;
  };
  sms?: {
    base_url?: string;
    codes: string[];
  };
  stats: {
    job_id?: string;
    job_kind?: string;
    success: number;
    fail: number;
    done: number;
    running: number;
    threads: number;
    elapsed_seconds?: number;
    avg_seconds?: number;
    success_rate?: number;
    current_quota?: number;
    current_available?: number;
    started_at?: string;
    updated_at?: string;
    finished_at?: string;
  };
  logs?: Array<{
    time: string;
    text: string;
    level: string;
  }>;
};

export async function fetchWebSession(authKey: string) {
  const normalizedAuthKey = String(authKey || "").trim();
  const data = await httpRequest<UserProfileResponse>("/api/users/me", {
    headers: {
      Authorization: `Bearer ${normalizedAuthKey}`,
    },
    redirectOnUnauthorized: false,
  });
  return {
    ok: true,
    version: "",
    role: data.identity.role,
    subject_id: data.account?.id || data.identity.id,
    name: data.identity.name || data.account?.name || "",
  } satisfies WebSessionResponse;
}

export async function loginUser(username: string, password: string) {
  return httpRequest<UserAuthResponse>("/api/users/login", {
    method: "POST",
    body: { username, password },
    redirectOnUnauthorized: false,
  });
}

export async function registerUser(payload: { username: string; password: string; name?: string; email?: string }) {
  return httpRequest<UserAuthResponse>("/api/users/register", {
    method: "POST",
    body: payload,
    redirectOnUnauthorized: false,
  });
}

export async function fetchUserProfile() {
  return httpRequest<UserProfileResponse>("/api/users/me");
}

export async function updateUserProfile(payload: { name?: string; email?: string }) {
  return httpRequest<{ account: LoginAccount; identity: AuthIdentity }>("/api/v1/user", {
    method: "PUT",
    body: payload,
  });
}

export async function changeUserPassword(oldPassword: string, newPassword: string) {
  return httpRequest<{ account: LoginAccount }>("/api/users/me/password", {
    method: "POST",
    body: { old_password: oldPassword, new_password: newPassword },
  });
}

export async function rotateMyApiKey() {
  return httpRequest<{ identity: AuthIdentity; api_key: string }>("/api/users/me/api-key/rotate", {
    method: "POST",
    body: {},
  });
}

export async function fetchBillingPlans() {
  return httpRequest<{
    items: BillingPlan[];
    unit_name: string;
    recharge_url?: string;
    prices: Record<string, number>;
    default_register_quota?: number;
  }>("/api/billing/plans", { redirectOnUnauthorized: false });
}

export async function fetchMyBilling() {
  return httpRequest<BillingSummary>("/api/billing/me");
}

export async function redeemRechargeCode(code: string) {
  return httpRequest<{ identity: AuthIdentity; record: BillingRecord }>("/api/billing/redeem", {
    method: "POST",
    body: { code },
  });
}

export async function transferCredits(recipientUsername: string, amount: number, note = "") {
  return httpRequest<{
    from_identity: AuthIdentity;
    to_identity: AuthIdentity;
    from_record: BillingRecord;
    to_record: BillingRecord;
  }>("/api/billing/transfer", {
    method: "POST",
    body: { recipient_username: recipientUsername, amount, note },
  });
}

export async function fetchTransferRecipient(username: string) {
  const params = new URLSearchParams();
  params.set("username", username);
  return httpRequest<{ account: TransferRecipientPreview }>(`/api/billing/transfer/recipient?${params.toString()}`);
}

export async function fetchBillingSettings() {
  return httpRequest<{ settings: BillingSummary["settings"] }>("/api/billing/settings");
}

export async function updateBillingSettings(settings: Partial<BillingSummary["settings"]>) {
  return httpRequest<{ settings: BillingSummary["settings"] }>("/api/billing/settings", {
    method: "POST",
    body: settings,
  });
}

export async function fetchBillingStats() {
  return httpRequest<{ settings: BillingSummary["settings"]; usage: { day: number; month: number } }>("/api/billing/stats");
}

export async function fetchImageUpstreamStats(period = "day") {
  const params = new URLSearchParams();
  params.set("period", period);
  return httpRequest<ImageUpstreamStats>(`/api/billing/image-upstream-stats?${params.toString()}`);
}

export async function fetchImageUpstreams() {
  return httpRequest<ImageUpstreamStatus>("/api/image-upstreams");
}

export async function updateImageUpstreams(upstreams: Array<{ id: string; enabled: boolean }>) {
  return httpRequest<ImageUpstreamStatus>("/api/image-upstreams", { method: "PUT", body: { upstreams } });
}

export async function fetchBillingRecords(userId = "", limit = 200, offset = 0, recordType = "") {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  if (recordType) params.set("type", recordType);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return httpRequest<{ items: BillingRecord[]; total?: number; limit?: number; offset?: number }>(`/api/billing/records?${params.toString()}`);
}

export async function topupUser(userId: string, amount: number, note = "") {
  return httpRequest<{ identity: AuthIdentity; record: BillingRecord }>("/api/billing/topup", {
    method: "POST",
    body: { user_id: userId, amount, note },
  });
}

export async function adjustUserBalance(userId: string, delta: number, note = "") {
  return httpRequest<{ identity: AuthIdentity; record: BillingRecord }>("/api/billing/adjust", {
    method: "POST",
    body: { user_id: userId, delta, note },
  });
}

export async function fetchRechargeCodes(limit = 200) {
  return httpRequest<{ items: RechargeCode[] }>(`/api/billing/recharge-codes?limit=${limit}`);
}

export async function createRechargeCodes(amount: number, count: number, note = "") {
  return httpRequest<{ items: RechargeCode[] }>("/api/billing/recharge-codes", {
    method: "POST",
    body: { amount, count, note },
  });
}

export async function deleteRechargeCode(id: string) {
  return httpRequest<{ item: RechargeCode }>(`/api/billing/recharge-codes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function fetchLoginAccounts() {
  return httpRequest<{ items: LoginAccount[] }>("/api/login-accounts");
}

export async function fetchLoginAccount(accountId: string) {
  return httpRequest<{ account: LoginAccount }>(`/api/login-accounts/${accountId}`);
}

export async function updateLoginAccount(accountId: string, updates: { enabled?: boolean; concurrency_limit?: number } | boolean) {
  return httpRequest<{ account: LoginAccount; items: LoginAccount[] }>(`/api/login-accounts/${accountId}`, {
    method: "POST",
    body: typeof updates === "boolean" ? { enabled: updates } : updates,
  });
}

export async function rechargeLoginAccount(accountId: string, payload: { amount: number; mode: LoginAccountRechargeMode; remark?: string }) {
  return httpRequest<{ account: LoginAccount; items: LoginAccount[]; identity: AuthIdentity; record: BillingRecord }>(
    `/api/login-accounts/${accountId}/recharge`,
    {
      method: "POST",
      body: {
        amount: payload.amount,
        mode: payload.mode,
        remark: payload.remark || "",
      },
    },
  );
}

export async function fetchTraces(params: { userId?: string; endpoint?: string; status?: string; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.userId) search.set("user_id", params.userId);
  if (params.endpoint) search.set("endpoint", params.endpoint);
  if (params.status) search.set("status", params.status);
  search.set("limit", String(params.limit || 200));
  return httpRequest<{ items: TraceItem[] }>(`/api/traces?${search.toString()}`);
}

export async function fetchMyTraces(params: { endpoint?: string; status?: string; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.endpoint) search.set("endpoint", params.endpoint);
  if (params.status) search.set("status", params.status);
  search.set("limit", String(params.limit || 100));
  return httpRequest<{ items: TraceItem[] }>(`/api/me/traces?${search.toString()}`);
}

export async function fetchSupportSettings() {
  return httpRequest<{ support: SupportSettings }>("/api/support-settings", { redirectOnUnauthorized: false });
}

export async function updateSupportSettings(support: SupportSettings) {
  return httpRequest<{ support: SupportSettings }>("/api/support-settings", {
    method: "POST",
    body: support,
  });
}

export async function fetchAccounts() {
  return httpRequest<AccountListResponse>("/api/accounts");
}

export async function fetchImageModels(params: { includeDisabled?: boolean; capability?: string } = {}) {
  const search = new URLSearchParams();
  if (params.includeDisabled) search.set("include_disabled", "true");
  if (params.capability) search.set("capability", params.capability);
  const suffix = search.toString() ? `?${search.toString()}` : "";
  return httpRequest<{ items: ImageModelInfo[] }>(`/api/image-models${suffix}`);
}

export async function fetchImageOperations(includeDisabled = false) {
  const suffix = includeDisabled ? "?include_disabled=true" : "";
  return httpRequest<{ items: ImageOperationInfo[] }>(`/api/image-operations${suffix}`);
}

export async function createAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "POST",
    body: { tokens },
  });
}

export async function deleteAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "DELETE",
    body: { tokens },
  });
}

export async function refreshAccounts(accessTokens: string[]) {
  return httpRequest<AccountRefreshResponse>("/api/accounts/refresh", {
    method: "POST",
    body: { access_tokens: accessTokens },
  });
}

export async function updateAccount(
  accessToken: string,
  updates: {
    type?: AccountType;
    status?: AccountStatus;
    quota?: number;
    proxy?: string;
    proxy_enabled?: boolean;
  },
) {
  return httpRequest<AccountUpdateResponse>("/api/accounts/update", {
    method: "POST",
    body: {
      access_token: accessToken,
      ...updates,
    },
  });
}

export async function generateImage(prompt: string, model?: ImageModel, size?: string, quality: ImageQuality = "medium") {
  return httpRequest<ImageResponse>(
    "/v1/images/generations",
    {
      method: "POST",
      body: {
        prompt,
        ...(model ? { model } : {}),
        ...(size ? { size } : {}),
        quality,
        n: 1,
        response_format: "b64_json",
      },
    },
  );
}

export async function createAsyncImageGeneration(
  prompt: string,
  model?: ImageModel,
  size?: string,
  outputSize?: string,
  quality: ImageQuality = "medium",
  clientTaskId?: string,
) {
  return httpRequest<AsyncImageGenerationTask>("/v1/images/generations/async", {
    method: "POST",
    body: {
      prompt,
      ...(model ? { model } : {}),
      ...(size ? { size } : {}),
      ...(outputSize ? { output_size: outputSize } : {}),
      quality,
      n: 1,
      ...(clientTaskId ? { client_task_id: clientTaskId } : {}),
    },
  });
}

export async function fetchAsyncImageGenerationTask(taskId: string) {
  return httpRequest<AsyncImageGenerationTask>(`/v1/images/generations/tasks/${encodeURIComponent(taskId)}`);
}

export async function createVideoGenerationTask<TResponse = unknown, TPayload = unknown>(payload: TPayload) {
  return httpRequest<TResponse>("/v1/videos/generations", {
    method: "POST",
    body: payload,
  });
}

export async function fetchVideoGenerationTask<TResponse = unknown>(taskId: string) {
  return httpRequest<TResponse>(`/v1/videos/generations/tasks/${encodeURIComponent(taskId)}`);
}

export async function editImage(files: File | File[], prompt: string, model?: ImageModel, size?: string, quality: ImageQuality = "medium") {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  if (size) {
    formData.append("size", size);
  }
  formData.append("quality", quality);
  formData.append("n", "1");

  return httpRequest<ImageResponse>(
    "/v1/images/edits",
    {
      method: "POST",
      body: formData,
    },
  );
}

export async function createImageGenerationTask(
  clientTaskId: string,
  prompt: string,
  model?: ImageModel,
  size?: string,
  outputSize?: string,
  billingBatch?: ImageTaskBillingBatch,
  quality: ImageQuality = "medium",
  textMode: ImageTextMode = "none",
) {
  return httpRequest<ImageTask>("/api/image-tasks/generations", {
    method: "POST",
    body: {
      client_task_id: clientTaskId,
      prompt,
      ...(model ? { model } : {}),
      ...(size ? { size } : {}),
      ...(outputSize ? { output_size: outputSize } : {}),
      ...(billingBatch ? {
        billing_batch_id: billingBatch.id,
        billing_batch_total: billingBatch.total,
        billing_batch_index: billingBatch.index,
      } : {}),
      quality,
      text_mode: textMode,
    },
  });
}

export async function createImageEditTask(
  clientTaskId: string,
  files: File | File[],
  prompt: string,
  model?: ImageModel,
  size?: string,
  outputSize?: string,
  billingBatch?: ImageTaskBillingBatch,
  quality: ImageQuality = "medium",
  textMode: ImageTextMode = "none",
  mask?: File,
) {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  if (mask) {
    formData.append("mask", mask);
  }
  formData.append("client_task_id", clientTaskId);
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  if (size) {
    formData.append("size", size);
  }
  if (outputSize) {
    formData.append("output_size", outputSize);
  }
  if (billingBatch) {
    formData.append("billing_batch_id", billingBatch.id);
    formData.append("billing_batch_total", String(billingBatch.total));
    formData.append("billing_batch_index", String(billingBatch.index));
  }
  formData.append("quality", quality);
  formData.append("text_mode", textMode);

  return httpRequest<ImageTask>("/api/image-tasks/edits", {
    method: "POST",
    body: formData,
  });
}

export async function importPsdReferenceImage(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return httpRequest<PsdReferenceImportResponse>("/api/images/import/psd", {
    method: "POST",
    body: formData,
  });
}

export async function fetchImageTasks(ids: string[]) {
  const params = new URLSearchParams();
  if (ids.length > 0) {
    params.set("ids", ids.join(","));
  }
  return httpRequest<ImageTaskListResponse>(
    `/api/image-tasks${params.toString() ? `?${params.toString()}` : ""}`,
    { redirectOnUnauthorized: false },
  );
}

export async function cancelImageTasks(ids: string[]) {
  return httpRequest<ImageTaskCancelResponse>("/api/image-tasks/cancel", {
    method: "POST",
    body: { ids },
  });
}

export async function fetchSettingsConfig() {
  return httpRequest<{ config: SettingsConfig }>("/api/settings");
}

export async function updateSettingsConfig(settings: SettingsConfig) {
  return httpRequest<{ config: SettingsConfig }>("/api/settings", {
    method: "POST",
    body: settings,
  });
}

export async function testBackupConnection() {
  return httpRequest<{ result: { ok: boolean; status: number } }>("/api/backup/test", {
    method: "POST",
    body: {},
  });
}

export async function fetchBackups() {
  return httpRequest<{ items: BackupItem[]; state: BackupState; settings: BackupSettings }>("/api/backups");
}

export async function runBackupNow() {
  return httpRequest<{ result: { key: string; size: number; encrypted: boolean } }>("/api/backups/run", {
    method: "POST",
    body: {},
  });
}

export async function deleteBackup(key: string) {
  return httpRequest<{ ok: boolean }>("/api/backups/delete", {
    method: "POST",
    body: { key },
  });
}

export async function fetchBackupDetail(key: string) {
  const params = new URLSearchParams();
  params.set("key", key);
  return httpRequest<{ item: BackupDetail }>(`/api/backups/detail?${params.toString()}`);
}

export function getBackupDownloadUrl(key: string) {
  const params = new URLSearchParams();
  params.set("key", key);
  return `/api/backups/download?${params.toString()}`;
}

export async function fetchManagedImages(filters: { start_date?: string; end_date?: string; owner?: string }) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.owner) params.set("owner", filters.owner);
  return httpRequest<{ items: ManagedImage[]; groups: Array<{ date: string; items: ManagedImage[] }> }>(
    `/api/images${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

/**
 * 拉登录用户自己的图。后端按 identity.id 自动过滤 image_owners.json：
 *  - user 角色：只返回 owner == 自己的图
 *  - admin 角色：返回所有 admin 生成的图（owner=__admin__ 桶）
 * 给 web "我的作品" 页用，跟 Android 端 listMyImages 同一接口。
 */
export async function fetchMyWorks(filters: { start_date?: string; end_date?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  return httpRequest<{ items: ManagedImage[]; groups: Array<{ date: string; items: ManagedImage[] }> }>(
    `/api/me/images${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

export async function fetchImageOwners() {
  return httpRequest<{ items: ImageOwner[] }>("/api/images/owners");
}

export async function deleteManagedImages(body: { paths?: string[]; start_date?: string; end_date?: string; owner?: string; all_matching?: boolean }) {
  return httpRequest<{ removed: number }>("/api/images/delete", { method: "POST", body });
}

export async function downloadImages(paths: string[]) {
  const response = await request.post("/api/images/download", { paths }, { responseType: "blob" });
  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "images.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function protectCanvasImages(paths: string[], projectId = "") {
  return httpRequest<{ ok: boolean; protected: number }>("/api/canvas-images/protect", {
    method: "POST",
    body: { paths, project_id: projectId },
    redirectOnUnauthorized: false,
  });
}

export async function downloadSingleImage(path: string) {
  const response = await request.get(`/api/images/download/${path}`, { responseType: "blob" });
  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || "image.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fetchImageTags() {
  return httpRequest<{ tags: string[] }>("/api/images/tags");
}

export async function setImageTags(path: string, tags: string[]) {
  return httpRequest<{ ok: boolean; tags: string[] }>("/api/images/tags", {
    method: "POST",
    body: { path, tags },
  });
}

export async function deleteImageTag(tag: string) {
  return httpRequest<{ ok: boolean; removed_from: number }>(`/api/images/tags/${encodeURIComponent(tag)}`, {
    method: "DELETE",
  });
}

export async function fetchSystemLogs(filters: { type?: string; start_date?: string; end_date?: string }) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  return httpRequest<{ items: SystemLog[] }>(`/api/logs${params.toString() ? `?${params.toString()}` : ""}`);
}

export async function deleteSystemLogs(ids: string[]) {
  return httpRequest<{ removed: number }>("/api/logs/delete", {
    method: "POST",
    body: { ids },
  });
}

export async function fetchUserKeys() {
  return httpRequest<{ items: UserKey[] }>("/api/auth/users");
}

export async function fetchMyIdentity() {
  return httpRequest<{ identity: AuthIdentity }>("/api/auth/me");
}

export async function createUserKey(payload: { name?: string; quota?: number; unlimited?: boolean }) {
  return httpRequest<{ item: UserKey; key: string; items: UserKey[] }>("/api/auth/users", {
    method: "POST",
    body: {
      name: payload.name ?? "",
      quota: Math.max(0, Number(payload.quota ?? 0) || 0),
      unlimited: Boolean(payload.unlimited),
    },
  });
}

export async function batchCreateUserKeys(payload: { count: number; name_prefix?: string; quota?: number; unlimited?: boolean }) {
  return httpRequest<{ created: Array<{ item: UserKey; key: string }>; count: number; items: UserKey[] }>("/api/auth/users/batch", {
    method: "POST",
    body: {
      count: Math.max(1, Math.min(100, payload.count)),
      name_prefix: payload.name_prefix ?? "",
      quota: Math.max(0, Number(payload.quota ?? 0) || 0),
      unlimited: Boolean(payload.unlimited),
    },
  });
}

export async function updateUserKey(
  keyId: string,
  updates: {
    enabled?: boolean;
    name?: string;
    key?: string;
    quota?: number;
    unlimited?: boolean;
    reset_used?: boolean;
  },
) {
  return httpRequest<{ item: UserKey; items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteUserKey(keyId: string) {
  return httpRequest<{ items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "DELETE",
  });
}

export async function fetchRegisterConfig() {
  return httpRequest<{ register: RegisterConfig }>("/api/register");
}

export async function updateRegisterConfig(updates: Partial<RegisterConfig>) {
  return httpRequest<{ register: RegisterConfig }>("/api/register", {
    method: "POST",
    body: updates,
  });
}

export async function startRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/start", { method: "POST" });
}

export async function stopRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/stop", { method: "POST" });
}

export async function resetRegister() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/reset", { method: "POST" });
}

export async function resetOutlookPool(scope: OutlookPoolResetScope = "all") {
  return httpRequest<{ register: RegisterConfig }>("/api/register/outlook-pool/reset", {
    method: "POST",
    body: { scope },
  });
}

export async function repairAbnormalRegisterAccounts() {
  return httpRequest<{ register: RegisterConfig }>("/api/register/repair-abnormal", { method: "POST" });
}

export async function createRegisterEventsToken() {
  return httpRequest<{ token: string; expires_in: number }>("/api/register/events-token", { method: "POST" });
}

export async function testProxyPool() {
  return httpRequest<{ ok: boolean; proxy: string; ip: string; message: string }>("/api/register/test-proxy", { method: "POST" });
}

// ── CPA (CLIProxyAPI) ──────────────────────────────────────────────

export type CPAPool = {
  id: string;
  name: string;
  base_url: string;
  import_job?: CPAImportJob | null;
};

export type CPARemoteFile = {
  name: string;
  email: string;
};

export type CPAImportJob = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  total: number;
  completed: number;
  added: number;
  skipped: number;
  refreshed: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
};

export async function fetchCPAPools() {
  return httpRequest<{ pools: CPAPool[] }>("/api/cpa/pools");
}

export async function createCPAPool(pool: { name: string; base_url: string; secret_key: string }) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>("/api/cpa/pools", {
    method: "POST",
    body: pool,
  });
}

export async function updateCPAPool(
  poolId: string,
  updates: { name?: string; base_url?: string; secret_key?: string },
) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteCPAPool(poolId: string) {
  return httpRequest<{ pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "DELETE",
  });
}

export async function fetchCPAPoolFiles(poolId: string) {
  return httpRequest<{ pool_id: string; files: CPARemoteFile[] }>(`/api/cpa/pools/${poolId}/files`);
}

export async function startCPAImport(poolId: string, names: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`, {
    method: "POST",
    body: { names },
  });
}

export async function fetchCPAPoolImportJob(poolId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`);
}

// ── Sub2API ────────────────────────────────────────────────────────

export type Sub2APIServer = {
  id: string;
  name: string;
  base_url: string;
  email: string;
  has_api_key: boolean;
  group_id: string;
  import_job?: CPAImportJob | null;
};

export type Sub2APIRemoteAccount = {
  id: string;
  name: string;
  email: string;
  plan_type: string;
  status: string;
  expires_at: string;
  has_refresh_token: boolean;
};

export type Sub2APIRemoteGroup = {
  id: string;
  name: string;
  description: string;
  platform: string;
  status: string;
  account_count: number;
  active_account_count: number;
};

export async function fetchSub2APIServers() {
  return httpRequest<{ servers: Sub2APIServer[] }>("/api/sub2api/servers");
}

export async function createSub2APIServer(server: {
  name: string;
  base_url: string;
  email: string;
  password: string;
  api_key: string;
  group_id: string;
}) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>("/api/sub2api/servers", {
    method: "POST",
    body: server,
  });
}

export async function updateSub2APIServer(
  serverId: string,
  updates: {
    name?: string;
    base_url?: string;
    email?: string;
    password?: string;
    api_key?: string;
    group_id?: string;
  },
) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "POST",
    body: updates,
  });
}

export async function fetchSub2APIServerGroups(serverId: string) {
  return httpRequest<{ server_id: string; groups: Sub2APIRemoteGroup[] }>(
    `/api/sub2api/servers/${serverId}/groups`,
  );
}

export async function deleteSub2APIServer(serverId: string) {
  return httpRequest<{ servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "DELETE",
  });
}

export async function fetchSub2APIServerAccounts(serverId: string) {
  return httpRequest<{ server_id: string; accounts: Sub2APIRemoteAccount[] }>(
    `/api/sub2api/servers/${serverId}/accounts`,
  );
}

export async function startSub2APIImport(serverId: string, accountIds: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`, {
    method: "POST",
    body: { account_ids: accountIds },
  });
}

export async function fetchSub2APIImportJob(serverId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`);
}

// ── Upstream proxy ────────────────────────────────────────────────

export type ProxySettings = {
  enabled: boolean;
  url: string;
};

export type ProxyTestResult = {
  ok: boolean;
  status: number;
  latency_ms: number;
  error: string | null;
};

export async function fetchProxy() {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy");
}

export async function updateProxy(updates: { enabled?: boolean; url?: string }) {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy", {
    method: "POST",
    body: updates,
  });
}

export async function testProxy(url?: string) {
  return httpRequest<{ result: ProxyTestResult }>("/api/proxy/test", {
    method: "POST",
    body: { url: url ?? "" },
  });
}

/* ───────── 公共画廊 ───────── */

export type GalleryItem = {
  id: string;
  url: string;
  image_rel: string;
  prompt: string;
  model: string;
  size: string;
  width: number;
  height: number;
  publisher_name: string;
  created_at: number;
  status: "visible" | "hidden" | string;
  /**
   * 图生图标记。后端在 publish 时检测 image_edits set，命中就强制把 prompt
   * 落空并置 is_edit=true。前端据此把 prompt 区换成"提示词依赖参考图"提示卡，
   * 避免别人复制了一段对参考图的修改指令以为能复现，结果完全跑偏。
   */
  is_edit?: boolean;
  /**
   * 后端 _public_view 派生：当前请求者是否就是这条画廊的发布者。
   * 用于在画廊详情里给「我的发布」额外暴露撤回入口；admin 不依赖这个字段，
   * 走自己那套 hide/unhide/permanent delete 流程。
   * 后端只在 viewer_id 非空且与 publisher_id 一致时才置 true，绝不暴露 publisher_id 本身。
   */
  is_mine?: boolean;
};

export type GalleryFeedResponse = {
  items: GalleryItem[];
  next_cursor: string;
};

export async function fetchGalleryFeed(opts: {
  cursor?: string | null;
  limit?: number;
  includeHidden?: boolean;
}) {
  const params = new URLSearchParams();
  if (opts.cursor) params.set("cursor", opts.cursor);
  params.set("limit", String(opts.limit ?? 24));
  if (opts.includeHidden) params.set("include_hidden", "true");
  return httpRequest<GalleryFeedResponse>(`/api/gallery/feed?${params.toString()}`);
}

export async function fetchGalleryItem(id: string) {
  return httpRequest<{ item: GalleryItem }>(`/api/gallery/items/${id}`);
}

export async function publishGalleryItem(body: {
  image_rel: string;
  prompt: string;
  model?: string;
  size?: string;
  width?: number;
  height?: number;
}) {
  return httpRequest<{ item: GalleryItem }>("/api/gallery/publish", {
    method: "POST",
    body,
  });
}

/**
 * 批量查"哪些 rel 发过画廊"。给"我的作品"页 / admin 图片管理页 reload 时
 * 一次播种 publishStates，否则刷新后角标会丢（state 是前端 Map，重 mount 即清空）。
 *
 * 后端只返回查到记录的 rel，未发布的 rel 不在 items key 里。
 *
 * admin 调用时后端自动按 check_any_publisher=True 跨用户查询，并在每条记录
 * 附带 publisher_name；普通 user 查到的永远是自己发的，publisher_name 也会填。
 */
export async function getMyPublishedBatch(image_rels: string[]) {
  return httpRequest<{
    items: Record<
      string,
      { published: boolean; id: string; status: string; publisher_name?: string }
    >;
  }>("/api/gallery/published/batch", {
    method: "POST",
    body: { image_rels },
  });
}

export async function unpublishGalleryItem(id: string) {
  return httpRequest<{ ok: boolean }>(`/api/gallery/items/${id}`, {
    method: "DELETE",
  });
}

export async function hideGalleryItem(id: string) {
  return httpRequest<{ ok: boolean }>(`/api/gallery/items/${id}/hide`, {
    method: "POST",
  });
}

export async function unhideGalleryItem(id: string) {
  return httpRequest<{ ok: boolean }>(`/api/gallery/items/${id}/unhide`, {
    method: "POST",
  });
}


// ── 接码 (MailCode) ────────────────────────────────────────────────

export type MailCodeMessage = {
  subject: string;
  sender: string;
  text_content: string;
  received_at: string;
};

export type MailCodeResponse = {
  ok: boolean;
  code?: string | null;
  message?: MailCodeMessage | null;
  info?: string;
  error?: string;
};

export type MailCodeCreateResponse = {
  ok: boolean;
  address?: string;
  mailbox?: Record<string, unknown>;
  error?: string;
};

export type MailCodeProvider = {
  index: number;
  type: string;
  domains: string[];
  enabled: boolean;
};

export async function fetchMailCode(address: string, providerIndex?: number) {
  return httpRequest<MailCodeResponse>("/api/mailcode/fetch", {
    method: "POST",
    body: { address, provider_index: providerIndex },
  });
}

export async function createTempMailbox() {
  return httpRequest<MailCodeCreateResponse>("/api/mailcode/create", {
    method: "POST",
    body: {},
  });
}

export async function fetchMailProviders() {
  return httpRequest<{ ok: boolean; providers: MailCodeProvider[] }>("/api/mailcode/providers");
}
