import { i as __toESM } from "../_runtime.mjs";
import { n as require_react, r as require_jsx_runtime, t as QueryClientProvider } from "../_libs/react+tanstack__react-query.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
import { o as TriangleAlert } from "../_libs/lucide-react.mjs";
import { _ as createRootRoute, d as useRouterState, g as createFileRoute, h as lazyRouteComponent, l as Scripts, m as Outlet, p as createRouter, u as HeadContent, v as Link, y as useRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as union, i as string, n as number, r as object, t as literal } from "../_libs/zod.mjs";
import { t as QueryClient } from "../_libs/tanstack__query-core.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-CvpcwDwX.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-red-500",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-lg font-semibold",
				children: "Something went wrong"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400",
				children: error.message || "An unexpected error occurred. Try reloading the page."
			})
		]
	});
}
/**
* App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
*
*   <AuthProvider><Outlet /></AuthProvider>
*
* Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
* its `useSession()` works standalone — so this is a passthrough today. It's
* kept as the single, stable mount point for any future client-side providers
* (e.g. a toast or theme provider) without churning the root shell.
*/
function AuthProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
function isGrokEmbedderOrigin(origin) {
	try {
		const url = new URL(origin);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "grok.com" || host.endsWith(".grok.com")) return true;
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
		return false;
	} catch {
		return false;
	}
}
function isSandboxPreviewGuestHost(hostname) {
	const host = hostname.toLowerCase();
	return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}
function isRemintPreviewPair(guestHost, parentHost) {
	const guest = guestHost.toLowerCase();
	const parent = parentHost.toLowerCase();
	const i = guest.indexOf(".preview.");
	if (i <= 0) return false;
	const label = guest.slice(0, i);
	const rest = guest.slice(i + 9);
	if (label.includes(".") || !rest.includes(".")) return false;
	return parent === rest || parent === `grok.${rest}`;
}
function resolveParentEmbedderOrigin(parentIsSelf, referrer, ancestorOrigin, guestHostname = "") {
	if (parentIsSelf) return null;
	for (const candidate of [referrer, ancestorOrigin ?? ""].filter(Boolean)) try {
		const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") continue;
		if (isGrokEmbedderOrigin(url.origin)) return url.origin;
		if (isSandboxPreviewGuestHost(guestHostname) || isRemintPreviewPair(guestHostname, url.hostname)) return url.origin;
	} catch {}
	return null;
}
/**
* Guest side of the grok-web ↔ sandbox preview postMessage bridge.
*
* Activates only when this page is framed by an allowlisted Grok embedder.
* Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
*/
var PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge";
var EnvelopeSchema = object({
	channel: literal(PREVIEW_BRIDGE_CHANNEL),
	version: number().int().positive(),
	type: string().min(1)
});
var HelloSchema = EnvelopeSchema.extend({ type: literal("hello") });
var NavigateSchema = EnvelopeSchema.extend({
	type: literal("navigate"),
	path: string().min(1)
});
var HistorySchema = EnvelopeSchema.extend({
	type: literal("history"),
	delta: union([literal(-1), literal(1)])
});
function isSafeBridgePath(path) {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
	try {
		return new URL(path, "https://preview.invalid").origin === "https://preview.invalid";
	} catch {
		return false;
	}
}
/**
* Install host↔guest messaging. Returns a dispose function.
* Noops (returns a no-op dispose) when not embedded under a Grok parent.
*/
function installPreviewHostBridge(options = {}) {
	if (typeof window === "undefined") return () => {};
	const ancestorOrigin = typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0 ? location.ancestorOrigins[0] : null;
	const parentOrigin = resolveParentEmbedderOrigin(window.parent === window, document.referrer, ancestorOrigin, window.location.hostname);
	if (parentOrigin === null) return () => {};
	const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";
	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);
	const isAtHistoryRoot = () => {
		const state = window.history.state;
		return Boolean(state && typeof state === "object" && state[ROOT_STATE_KEY] === true);
	};
	try {
		const current = window.history.state;
		if (!(current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY))) {
			const isRoot = window.history.length <= 1;
			originalReplaceState(current && typeof current === "object" ? {
				...current,
				[ROOT_STATE_KEY]: isRoot
			} : { [ROOT_STATE_KEY]: isRoot }, "", window.location.href);
		}
	} catch {}
	const post = (message) => {
		window.parent.postMessage(message, parentOrigin);
	};
	const reportLocation = () => {
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "location",
			path: window.location.pathname || "/",
			search: window.location.search,
			hash: window.location.hash
		});
	};
	const reportRoutes = () => {
		const paths = options.getRoutePaths?.() ?? [];
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "routes",
			paths
		});
	};
	const defaultNavigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		try {
			const url = new URL(path, window.location.origin);
			if (url.origin !== window.location.origin) return;
			const next = `${url.pathname}${url.search}${url.hash}`;
			window.history.pushState(window.history.state, "", next);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		} catch {}
	};
	const navigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		if (options.navigate) {
			options.navigate(path);
			return;
		}
		defaultNavigate(path);
	};
	const announce = () => {
		reportLocation();
		reportRoutes();
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "ready"
		});
	};
	const onMessage = (event) => {
		if (event.source !== window.parent) return;
		if (event.origin !== parentOrigin) return;
		const envelope = EnvelopeSchema.safeParse(event.data);
		if (!envelope.success || envelope.data.version !== 1) return;
		if (envelope.data.type === "hello") {
			if (!HelloSchema.safeParse(event.data).success) return;
			announce();
			return;
		}
		if (envelope.data.type === "navigate") {
			const parsed = NavigateSchema.safeParse(event.data);
			if (!parsed.success) return;
			navigate(parsed.data.path);
			queueMicrotask(reportLocation);
			return;
		}
		if (envelope.data.type === "history") {
			const parsed = HistorySchema.safeParse(event.data);
			if (!parsed.success) return;
			if (parsed.data.delta === -1 && isAtHistoryRoot()) return;
			window.history.go(parsed.data.delta);
		}
	};
	const onPopState = () => {
		reportLocation();
	};
	const onHashChange = () => {
		reportLocation();
	};
	window.history.pushState = (data, unused, url) => {
		const next = data && typeof data === "object" ? {
			...data,
			[ROOT_STATE_KEY]: false
		} : data;
		originalPushState(next, unused, url);
		reportLocation();
	};
	window.history.replaceState = (data, unused, url) => {
		const next = isAtHistoryRoot() ? {
			...data && typeof data === "object" ? data : {},
			[ROOT_STATE_KEY]: true
		} : data;
		originalReplaceState(next, unused, url);
		reportLocation();
	};
	window.addEventListener("message", onMessage);
	window.addEventListener("popstate", onPopState);
	window.addEventListener("hashchange", onHashChange);
	announce();
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener("popstate", onPopState);
		window.removeEventListener("hashchange", onHashChange);
		window.history.pushState = originalPushState;
		window.history.replaceState = originalReplaceState;
	};
}
/** Collect static path patterns from a TanStack route tree (best-effort). */
function collectRoutePathsFromTree(routeTree) {
	const paths = /* @__PURE__ */ new Set();
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		const record = node;
		const full = typeof record.fullPath === "string" ? record.fullPath : typeof record.path === "string" ? record.path : null;
		if (full !== null && full !== "") paths.add(full.startsWith("/") ? full : `/${full}`);
		else if (full === "") paths.add("/");
		const children = record.children;
		if (Array.isArray(children)) for (const child of children) walk(child);
		else if (children && typeof children === "object") for (const child of Object.values(children)) walk(child);
	};
	walk(routeTree);
	return [...paths];
}
/**
* Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
* (and later receive registered routes). Noops when the app is not embedded.
*/
function PreviewHostBridge() {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		return installPreviewHostBridge({
			navigate: (path) => {
				router.history.push(path);
			},
			getRoutePaths: () => collectRoutePathsFromTree(router.routeTree)
		});
	}, [router]);
	return null;
}
var queryClient = new QueryClient({ defaultOptions: { queries: {
	retry: false,
	refetchOnWindowFocus: false
} } });
function StudioRuntime({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(QueryClientProvider, {
		client: queryClient,
		children
	});
}
var STUDIO_NAV = [
	{
		href: "/",
		label: "首页",
		id: "home"
	},
	{
		href: "/image",
		label: "生图",
		id: "image"
	},
	{
		href: "/video",
		label: "生视频",
		id: "video"
	},
	{
		href: "/ecommerce",
		label: "电商套图",
		id: "ecommerce"
	},
	{
		href: "/story",
		label: "故事导演",
		id: "story"
	},
	{
		href: "/canvas",
		label: "无限画布",
		id: "canvas"
	},
	{
		href: "/library",
		label: "创作记录",
		id: "library"
	},
	{
		href: "/settings",
		label: "接线",
		id: "settings"
	}
];
var PLAN_LIMITS = {
	studio: {
		text: 2e3,
		image: 200,
		video: 40
	},
	pro: {
		text: 2e4,
		image: 2e3,
		video: 400
	}
};
var useMembershipStore = create()(persist((set, get) => ({
	plan: "studio",
	usage: {
		text: 0,
		image: 0,
		video: 0
	},
	record: (kind) => {
		const { plan, usage } = get();
		if (usage[kind] >= PLAN_LIMITS[plan][kind]) return false;
		set({ usage: {
			...usage,
			[kind]: usage[kind] + 1
		} });
		return true;
	},
	remaining: (kind) => {
		const { plan, usage } = get();
		return Math.max(0, PLAN_LIMITS[plan][kind] - usage[kind]);
	},
	upgrade: () => set({ plan: "pro" })
}), { name: "boundless-studio:membership" }));
function planLabel(plan) {
	return plan === "pro" ? "专业版" : "工作室";
}
function planLimits(plan) {
	return PLAN_LIMITS[plan];
}
function StudioShell({ children }) {
	const path = useRouterState({ select: (state) => state.location.pathname }).replace(/\/+$/, "") || "/";
	const plan = useMembershipStore((state) => state.plan);
	const remainingImage = useMembershipStore((state) => state.remaining("image"));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "studio-root min-h-screen",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "studio-topbar",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/",
					className: "studio-brand",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "studio-mark",
						"aria-hidden": true
					}), "无界创作台"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
					className: "studio-nav",
					"aria-label": "主导航",
					children: STUDIO_NAV.map((item) => {
						const active = item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: item.href,
							className: active ? "is-active" : void 0,
							children: item.label
						}, item.href);
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "studio-top-actions",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						className: "studio-ghost",
						to: "/settings",
						children: [
							planLabel(plan),
							" · 图 ",
							remainingImage
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						className: "studio-ghost",
						to: "/settings",
						children: "接线"
					})]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: path.startsWith("/canvas") ? "studio-page studio-flush" : "studio-page",
			children
		})]
	});
}
var styles_default = "/assets/styles-DlODynMU.css";
var APP_NAME = "无界创作台";
var Route$15 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: APP_NAME },
			{
				name: "description",
				content: "无界创作台：在无限画布上组织文本、图片、视频与生成工作流。"
			},
			{
				name: "theme-color",
				content: "#0B0B0F"
			}
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "manifest",
				href: "/__grok/manifest.webmanifest"
			},
			{
				rel: "apple-touch-icon",
				href: "/__grok/icon-180.png"
			}
		]
	}),
	component: () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "zh-CN",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewHostBridge, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StudioRuntime, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StudioShell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) }) }) }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
		] })]
	})
});
var $$splitComponentImporter$9 = () => import("./routes-BuKSi8GD.mjs");
var Route$14 = createFileRoute("/")({ component: lazyRouteComponent($$splitComponentImporter$9, "component") });
var $$splitComponentImporter$8 = () => import("./catalog-B4nrwPWZ.mjs");
var Route$13 = createFileRoute("/catalog")({ component: lazyRouteComponent($$splitComponentImporter$8, "component") });
var $$splitComponentImporter$7 = () => import("./ecommerce-CUeqRwv3.mjs");
var Route$12 = createFileRoute("/ecommerce")({ component: lazyRouteComponent($$splitComponentImporter$7, "component") });
var $$splitComponentImporter$6 = () => import("./image-CCkVdUbV.mjs");
var Route$11 = createFileRoute("/image")({ component: lazyRouteComponent($$splitComponentImporter$6, "component") });
var $$splitComponentImporter$5 = () => import("./library-CNZGyFzb.mjs");
var Route$10 = createFileRoute("/library")({ component: lazyRouteComponent($$splitComponentImporter$5, "component") });
var $$splitComponentImporter$4 = () => import("./settings-Cg93DN1_.mjs");
var Route$9 = createFileRoute("/settings")({ component: lazyRouteComponent($$splitComponentImporter$4, "component") });
var $$splitComponentImporter$3 = () => import("./story-m8ER6GeC.mjs");
var Route$8 = createFileRoute("/story")({ component: lazyRouteComponent($$splitComponentImporter$3, "component") });
var $$splitComponentImporter$2 = () => import("./video-CFYpkYGc.mjs");
var Route$7 = createFileRoute("/video")({ component: lazyRouteComponent($$splitComponentImporter$2, "component") });
var RELAY_TIMEOUT_MS = 6e5;
var FETCH_URL_TIMEOUT_MS = 12e4;
var IMAGE_HOST_TIMEOUT_MS = 6e4;
var MAX_FETCH_BYTES = 2147483648;
var HOP_HEADERS = [
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
	"origin",
	"referer",
	"sec-fetch-dest",
	"sec-fetch-mode",
	"sec-fetch-site",
	"content-length"
];
var CONTROL_HEADERS = [
	"x-boundless-desktop-token",
	"x-local-relay-base-url",
	"x-local-relay-proxy-url",
	"x-boundless-builtin",
	"x-image-host-base-url",
	"x-image-host-key"
];
function jsonError(status, message) {
	return Response.json({
		message,
		error: { message }
	}, { status });
}
function stripHeaders(headers, extra = []) {
	const next = new Headers();
	const blocked = new Set([
		...HOP_HEADERS,
		...CONTROL_HEADERS,
		...extra
	].map((name) => name.toLowerCase()));
	headers.forEach((value, key) => {
		const lower = key.toLowerCase();
		if (blocked.has(lower)) return;
		if (lower.startsWith("access-control-allow-")) return;
		if (lower.startsWith("x-webdav-")) return;
		next.append(key, value);
	});
	return next;
}
function normalizeHttpUrl(raw) {
	const value = String(raw || "").trim().replace(/\/+$/, "");
	if (!value) return "";
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		return "";
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
	return parsed.toString().replace(/\/+$/, "");
}
function isCivitaiOrchestration(url) {
	return url.hostname.toLowerCase() === "orchestration.civitai.com";
}
function buildRelayTarget(baseUrl, relayPath, search) {
	const normalized = normalizeHttpUrl(baseUrl);
	if (!normalized) throw new Error("自定义 API Base URL 无效");
	const parsed = new URL(normalized);
	const trimmedRelay = String(relayPath || "").replace(/^\/+|\/+$/g, "");
	const lowerRelay = trimmedRelay.toLowerCase();
	if (isCivitaiOrchestration(parsed) && (lowerRelay === "services" || lowerRelay.startsWith("services?"))) {
		parsed.pathname = "/v2/services";
		parsed.search = search.startsWith("?") ? search.slice(1) : search;
		return parsed;
	}
	if (isCivitaiOrchestration(parsed) && parsed.pathname.replace(/\/+$/, "") === "") parsed.pathname = "/v2/consumer";
	const lowerPath = parsed.pathname.replace(/\/+$/, "").toLowerCase();
	if (!(lowerPath.endsWith("/v1") || lowerPath.endsWith("/api/v3") || lowerPath.endsWith("/api/plan/v3") || isCivitaiOrchestration(parsed) && lowerPath.endsWith("/v2")) && !isCivitaiOrchestration(parsed)) parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/v1`;
	parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/${trimmedRelay}`.replace(/\/+$/, "") || "/";
	parsed.search = search.startsWith("?") ? search.slice(1) : search;
	return parsed;
}
async function proxyLocalRelay(request, splat) {
	const baseUrl = request.headers.get("x-local-relay-base-url") || "";
	const builtin = (request.headers.get("x-boundless-builtin") || "").trim().toLowerCase();
	let target;
	try {
		target = buildRelayTarget(baseUrl, splat, new URL(request.url).search);
	} catch (error) {
		return jsonError(400, error instanceof Error ? error.message : "自定义 API Base URL 无效");
	}
	const headers = stripHeaders(request.headers);
	if (builtin === "xai") {
		if (target.hostname.toLowerCase() !== "api.x.ai") return jsonError(400, "内置 xAI 通道只能转发到 api.x.ai");
		const key = process.env.XAI_API_KEY;
		if (!key) return jsonError(503, "当前环境未接入 xAI，请改用自定义中转并填写 API Key");
		headers.set("Authorization", `Bearer ${key}`);
	}
	return forward(request, target, headers, RELAY_TIMEOUT_MS);
}
async function proxyWebDav(request) {
	const targetUrl = normalizeHttpUrl(request.headers.get("x-webdav-target") || "");
	if (!targetUrl) return jsonError(400, "WebDAV 目标地址无效");
	const method = (request.headers.get("x-webdav-method") || request.method || "GET").toUpperCase();
	if (!(/* @__PURE__ */ new Set([
		"GET",
		"HEAD",
		"PUT",
		"DELETE",
		"MKCOL",
		"PROPFIND",
		"MOVE",
		"COPY"
	])).has(method)) return jsonError(400, "不支持的 WebDAV 请求方法");
	const headers = stripHeaders(request.headers);
	for (const [source, dest] of Object.entries({
		"x-webdav-authorization": "Authorization",
		"x-webdav-depth": "Depth",
		"x-webdav-destination": "Destination",
		"x-webdav-overwrite": "Overwrite",
		"x-webdav-content-type": "Content-Type"
	})) {
		const value = request.headers.get(source);
		if (value) headers.set(dest, value);
	}
	const init = {
		method,
		headers,
		redirect: "manual",
		signal: AbortSignal.timeout(RELAY_TIMEOUT_MS)
	};
	if (method !== "GET" && method !== "HEAD") {
		init.body = request.body;
		init.duplex = "half";
	}
	try {
		return toClientResponse(await fetch(targetUrl, init));
	} catch {
		return jsonError(502, "无法连接 WebDAV 服务，请检查地址和网络后重试");
	}
}
async function proxyFetchUrl(request) {
	if (request.method !== "GET") return jsonError(405, "不支持的请求方法");
	const raw = new URL(request.url).searchParams.get("url") || "";
	let parsed;
	try {
		parsed = new URL(raw);
	} catch {
		return jsonError(400, "资源地址无效或指向受保护的网络");
	}
	if (!isSafeFetchUrl(parsed)) return jsonError(400, "资源地址无效或指向受保护的网络");
	const headers = new Headers();
	const authorization = request.headers.get("Authorization");
	if (authorization) headers.set("Authorization", authorization);
	try {
		const upstream = await fetch(parsed, {
			method: "GET",
			headers,
			redirect: "follow",
			signal: AbortSignal.timeout(FETCH_URL_TIMEOUT_MS)
		});
		if (!upstream.ok) return jsonError(upstream.status, `资源下载失败（${upstream.status}）`);
		if (Number(upstream.headers.get("content-length") || "0") > MAX_FETCH_BYTES) return jsonError(413, "资源文件超过 2 GiB 安全上限");
		return toClientResponse(upstream);
	} catch {
		return jsonError(502, "资源下载失败，请检查地址和网络后重试");
	}
}
async function proxyImageHostUpload(request) {
	if (request.method !== "POST") return jsonError(405, "不支持的请求方法");
	const baseUrl = normalizeHttpUrl(request.headers.get("x-image-host-base-url") || "");
	if (!baseUrl) return jsonError(400, "图床地址无效");
	const target = `${baseUrl}/api/upload`;
	const headers = new Headers();
	const contentType = request.headers.get("Content-Type");
	if (contentType) headers.set("Content-Type", contentType);
	const apiKey = (request.headers.get("x-image-host-key") || "").trim();
	if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);
	try {
		return toClientResponse(await fetch(target, {
			method: "POST",
			headers,
			body: request.body,
			duplex: "half",
			signal: AbortSignal.timeout(IMAGE_HOST_TIMEOUT_MS)
		}));
	} catch {
		return jsonError(502, "图床上传失败，请检查地址和网络后重试");
	}
}
async function forward(request, target, headers, timeoutMs) {
	const init = {
		method: request.method,
		headers,
		redirect: "manual",
		signal: AbortSignal.timeout(timeoutMs)
	};
	if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = request.body;
		init.duplex = "half";
	}
	try {
		return await toClientResponse(await fetch(target, init));
	} catch {
		const host = target.hostname.toLowerCase();
		return jsonError(502, host === "localhost" || host === "127.0.0.1" || host === "::1" ? "无法连接本机中转服务，请确认服务正在运行后重试" : "无法连接上游服务，请检查网络或代理后重试");
	}
}
async function toClientResponse(upstream) {
	const headers = stripHeaders(upstream.headers, [
		"content-encoding",
		"content-length",
		"transfer-encoding"
	]);
	const buffer = Buffer.from(await upstream.arrayBuffer());
	headers.set("content-length", String(buffer.byteLength));
	headers.set("content-encoding", "identity");
	headers.set("cache-control", "no-transform");
	return new Response(buffer, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers
	});
}
function isSafeFetchUrl(target) {
	if (target.protocol !== "http:" && target.protocol !== "https:") return false;
	const host = target.hostname.replace(/\.$/, "").toLowerCase();
	if (host === "localhost" || host.endsWith(".localhost")) return false;
	const ip = parseIp(host);
	if (ip && isDisallowedIp(ip)) return false;
	return true;
}
function parseIp(host) {
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
	if (host.includes(":")) return host;
	return "";
}
function isDisallowedIp(ip) {
	if (ip === "::1" || ip === "0.0.0.0") return true;
	const v4 = ip.split(".").map((part) => Number(part));
	if (v4.length === 4 && v4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
		const [a, b] = v4;
		if (a === 10 || a === 127 || a === 0) return true;
		if (a === 192 && b === 168) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 169 && b === 254) return true;
		if (a === 100 && b >= 64 && b <= 127) return true;
		if (ip === "100.100.100.200" || ip === "168.63.129.16") return true;
	}
	return false;
}
function healthPayload() {
	return {
		ok: true,
		service: "boundless-studio",
		xai: Boolean(process.env.XAI_API_KEY)
	};
}
var handler$1 = ({ request }) => proxyWebDav(request);
var Route$6 = createFileRoute("/webdav-proxy")({ server: { handlers: {
	GET: handler$1,
	POST: handler$1,
	PUT: handler$1,
	DELETE: handler$1,
	OPTIONS: handler$1
} } });
var $$splitComponentImporter$1 = () => import("./canvas-CLYwb8TX.mjs");
var Route$5 = createFileRoute("/canvas/")({
	ssr: false,
	component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
var $$splitComponentImporter = () => import("./workspace-Cbk7ZicK.mjs");
var Route$4 = createFileRoute("/canvas/workspace")({
	ssr: false,
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
var Route$3 = createFileRoute("/client-api/fetch-url")({ server: { handlers: { GET: ({ request }) => proxyFetchUrl(request) } } });
var Route$2 = createFileRoute("/client-api/health")({ server: { handlers: { GET: async () => Response.json(healthPayload()) } } });
var Route$1 = createFileRoute("/client-api/upload-image-host")({ server: { handlers: { POST: ({ request }) => proxyImageHostUpload(request) } } });
var handler = async ({ request, params }) => proxyLocalRelay(request, params._splat || "");
var Route = createFileRoute("/local-relay-proxy/$")({ server: { handlers: {
	GET: handler,
	POST: handler,
	PUT: handler,
	PATCH: handler,
	DELETE: handler,
	OPTIONS: handler,
	HEAD: handler
} } });
var IndexRoute = Route$14.update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$15
});
var CatalogRoute = Route$13.update({
	id: "/catalog",
	path: "/catalog",
	getParentRoute: () => Route$15
});
var EcommerceRoute = Route$12.update({
	id: "/ecommerce",
	path: "/ecommerce",
	getParentRoute: () => Route$15
});
var ImageRoute = Route$11.update({
	id: "/image",
	path: "/image",
	getParentRoute: () => Route$15
});
var LibraryRoute = Route$10.update({
	id: "/library",
	path: "/library",
	getParentRoute: () => Route$15
});
var SettingsRoute = Route$9.update({
	id: "/settings",
	path: "/settings",
	getParentRoute: () => Route$15
});
var StoryRoute = Route$8.update({
	id: "/story",
	path: "/story",
	getParentRoute: () => Route$15
});
var VideoRoute = Route$7.update({
	id: "/video",
	path: "/video",
	getParentRoute: () => Route$15
});
var WebdavProxyRoute = Route$6.update({
	id: "/webdav-proxy",
	path: "/webdav-proxy",
	getParentRoute: () => Route$15
});
var CanvasIndexRoute = Route$5.update({
	id: "/canvas/",
	path: "/canvas/",
	getParentRoute: () => Route$15
});
var rootRouteChildren = {
	IndexRoute,
	CatalogRoute,
	EcommerceRoute,
	ImageRoute,
	LibraryRoute,
	SettingsRoute,
	StoryRoute,
	VideoRoute,
	WebdavProxyRoute,
	CanvasWorkspaceRoute: Route$4.update({
		id: "/canvas/workspace",
		path: "/canvas/workspace",
		getParentRoute: () => Route$15
	}),
	ClientApiFetchUrlRoute: Route$3.update({
		id: "/client-api/fetch-url",
		path: "/client-api/fetch-url",
		getParentRoute: () => Route$15
	}),
	ClientApiHealthRoute: Route$2.update({
		id: "/client-api/health",
		path: "/client-api/health",
		getParentRoute: () => Route$15
	}),
	ClientApiUploadImageHostRoute: Route$1.update({
		id: "/client-api/upload-image-host",
		path: "/client-api/upload-image-host",
		getParentRoute: () => Route$15
	}),
	LocalRelayProxySplatRoute: Route.update({
		id: "/local-relay-proxy/$",
		path: "/local-relay-proxy/$",
		getParentRoute: () => Route$15
	}),
	CanvasIndexRoute
};
var routeTree = Route$15._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: AppErrorComponent
	});
}
//#endregion
export { STUDIO_NAV as a, useMembershipStore as i, planLabel as n, planLimits as r, router_exports as t };
