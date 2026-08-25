export class VideoTaskPollingPausedError extends Error {
    constructor() {
        super("本轮视频任务查询已结束，远端任务已保留；应用将自动继续查询");
        this.name = "VideoTaskPollingPausedError";
    }
}

export class VideoTaskPollingRequestError extends Error {
    readonly retryable: boolean;
    readonly status?: number;

    constructor(
        message: string,
        options: { retryable: boolean; status?: number; cause?: unknown },
    ) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "VideoTaskPollingRequestError";
        this.retryable = options.retryable;
        this.status = options.status;
    }
}

type PollingErrorShape = {
    code?: unknown;
    name?: unknown;
    status?: unknown;
    response?: { status?: unknown };
};

function finiteHttpStatus(value: unknown) {
    const status = Number(value);
    return Number.isInteger(status) && status >= 100 && status <= 599
        ? status
        : undefined;
}

function pollingErrorStatus(error: unknown, explicitStatus?: number) {
    if (explicitStatus !== undefined) return finiteHttpStatus(explicitStatus);
    if (!error || typeof error !== "object") return undefined;
    const shaped = error as PollingErrorShape;
    return finiteHttpStatus(shaped.response?.status) ?? finiteHttpStatus(shaped.status);
}

function isRetryableHttpStatus(status: number | undefined) {
    return status === 408
        || status === 425
        || status === 429
        || (status !== undefined && status >= 500);
}

function isVerifiedTransportFailure(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const shaped = error as PollingErrorShape;
    const name = String(shaped.name ?? "").trim().toLowerCase();
    const code = String(shaped.code ?? "").trim().toUpperCase();
    if (name === "aborterror" || code === "ERR_CANCELED") return false;
    if ([
        "ECONNABORTED",
        "ECONNREFUSED",
        "ECONNRESET",
        "EHOSTUNREACH",
        "ENETUNREACH",
        "ENOTFOUND",
        "EAI_AGAIN",
        "ERR_NETWORK",
        "ETIMEDOUT",
    ].includes(code)) return true;
    const message = error instanceof Error ? error.message : String(error);
    return /failed to fetch|fetch failed|load failed|network(?:error| error)|dial tcp|connectex|connection (?:attempt )?(?:failed|refused|reset)|socket hang up|timed? out/i.test(message);
}

export function createVideoTaskPollingRequestError(
    error: unknown,
    message: string,
    options: { status?: number } = {},
) {
    if (error instanceof VideoTaskPollingRequestError) return error;
    const status = pollingErrorStatus(error, options.status);
    return new VideoTaskPollingRequestError(message, {
        retryable: isRetryableHttpStatus(status)
            || (status === undefined && isVerifiedTransportFailure(error)),
        ...(status === undefined ? {} : { status }),
        cause: error,
    });
}

export function isRetryableVideoTaskPollingError(error: unknown) {
    return error instanceof VideoTaskPollingRequestError && error.retryable;
}

export function isVideoTaskPollingPausedError(error: unknown, signal?: AbortSignal) {
    return error instanceof VideoTaskPollingPausedError
        || signal?.reason instanceof VideoTaskPollingPausedError;
}

export function normalizeVideoTaskProviderStatus(status: unknown) {
    return String(status ?? "").trim().toLowerCase();
}

export function videoTaskPollingRemainingMs(
    startedAt: string,
    timeoutMs: number,
    nowMs = Date.now(),
) {
    const parsedStartedAt = Date.parse(startedAt);
    const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
    const safeStartedAt = Number.isFinite(parsedStartedAt) ? parsedStartedAt : safeNow;
    const safeTimeout = Math.max(1, Math.floor(timeoutMs));
    return Math.max(0, safeStartedAt + safeTimeout - safeNow);
}

type VideoTaskRetryWait = (delayMs: number, signal?: AbortSignal) => Promise<void>;

function waitForVideoTaskRetry(delayMs: number, signal?: AbortSignal) {
    if (signal?.aborted) {
        return Promise.reject(
            signal.reason instanceof Error ? signal.reason : new Error("视频任务查询已取消"),
        );
    }
    return new Promise<void>((resolve, reject) => {
        const timeoutId = globalThis.setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
        }, Math.max(0, delayMs));
        const abort = () => {
            globalThis.clearTimeout(timeoutId);
            reject(
                signal?.reason instanceof Error
                    ? signal.reason
                    : new Error("视频任务查询已取消"),
            );
        };
        signal?.addEventListener("abort", abort, { once: true });
    });
}

export async function pollVideoTaskWithTransientRetry<T>(
    poll: () => Promise<T>,
    options: {
        maxAttempts?: number;
        baseDelayMs?: number;
        signal?: AbortSignal;
        wait?: VideoTaskRetryWait;
    } = {},
) {
    const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
    const baseDelayMs = Math.max(0, Math.floor(options.baseDelayMs ?? 1_000));
    const wait = options.wait ?? waitForVideoTaskRetry;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (options.signal?.aborted) {
            throw options.signal.reason instanceof Error
                ? options.signal.reason
                : new Error("视频任务查询已取消");
        }
        try {
            return await poll();
        } catch (error) {
            lastError = error;
            if (
                options.signal?.aborted
                || !isRetryableVideoTaskPollingError(error)
                || attempt === maxAttempts
            ) throw error;
            await wait(baseDelayMs * (2 ** (attempt - 1)), options.signal);
        }
    }

    throw lastError;
}

export function createVideoTaskPollingController(timeoutMs: number) {
    const controller = new AbortController();
    const durationMs = Math.max(1, Math.floor(timeoutMs));
    const timeoutId = globalThis.setTimeout(
        () => controller.abort(new VideoTaskPollingPausedError()),
        durationMs,
    );
    return {
        controller,
        cancelTimeout: () => globalThis.clearTimeout(timeoutId),
    };
}
