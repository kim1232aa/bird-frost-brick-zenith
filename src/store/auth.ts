"use client";

import localforage from "localforage";

import { cacheAuthStorageScope, clearCachedAuthStorageScope } from "@/lib/user-storage-scope";

export type AuthRole = "admin" | "user";

export type StoredAuthSession = {
  key: string;
  role: AuthRole;
  subjectId: string;
  name: string;
};

export const AUTH_KEY_STORAGE_KEY = "chatgpt2api_auth_key";
export const AUTH_SESSION_STORAGE_KEY = "chatgpt2api_auth_session";

const AUTH_SESSION_COOKIE_KEY = "chatgpt2api_auth_session_cookie";
const AUTH_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const legacyAuthStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "auth",
});
const authStorage = legacyAuthStorage;

function normalizeSession(value: unknown, fallbackKey = ""): StoredAuthSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredAuthSession>;
  const key = String(candidate.key || fallbackKey || "").trim();
  const role = candidate.role === "admin" || candidate.role === "user" ? candidate.role : null;
  if (!key || !role) {
    return null;
  }

  return {
    key,
    role,
    subjectId: String(candidate.subjectId || "").trim(),
    name: String(candidate.name || "").trim(),
  };
}

function readCookieAuthSession(): StoredAuthSession | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${AUTH_SESSION_COOKIE_KEY}=`));
  if (!cookie) {
    return null;
  }

  try {
    const rawValue = decodeURIComponent(cookie.slice(AUTH_SESSION_COOKIE_KEY.length + 1));
    return normalizeSession(JSON.parse(rawValue));
  } catch {
    clearCookieAuthSession();
    return null;
  }
}

function writeCookieAuthSession(session: StoredAuthSession) {
  if (typeof document === "undefined") {
    return;
  }

  const normalizedSession = normalizeSession(session);
  if (!normalizedSession) {
    clearCookieAuthSession();
    return;
  }

  const value = encodeURIComponent(JSON.stringify(normalizedSession));
  document.cookie = `${AUTH_SESSION_COOKIE_KEY}=${value}; Max-Age=${AUTH_SESSION_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

function clearCookieAuthSession() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${AUTH_SESSION_COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function getDefaultRouteForRole(role: AuthRole) {
  return role === "admin" ? "/admin-center" : "/image";
}

export async function getStoredAuthKey() {
  if (typeof window === "undefined") {
    return "";
  }

  const value = await authStorage.getItem<string>(AUTH_KEY_STORAGE_KEY);
  const storedKey = String(value || "").trim();
  const cookieSession = readCookieAuthSession();
  if (cookieSession) {
    cacheAuthStorageScope(cookieSession.subjectId);
    if (cookieSession.key !== storedKey) {
      await setStoredAuthSession(cookieSession);
    }
    return cookieSession.key;
  }
  return storedKey;
}

export async function getStoredAuthSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const [storedKey, storedSession] = await Promise.all([
    authStorage.getItem<string>(AUTH_KEY_STORAGE_KEY),
    authStorage.getItem<StoredAuthSession>(AUTH_SESSION_STORAGE_KEY),
  ]);

  const normalizedSession = normalizeSession(storedSession, String(storedKey || ""));
  const cookieSession = readCookieAuthSession();
  if (cookieSession) {
    if (
      !normalizedSession ||
      normalizedSession.key !== cookieSession.key ||
      String(storedKey || "").trim() !== cookieSession.key
    ) {
      await setStoredAuthSession(cookieSession);
    } else {
      cacheAuthStorageScope(cookieSession.subjectId);
    }
    return cookieSession;
  }

  if (normalizedSession) {
    if (normalizedSession.key !== String(storedKey || "").trim()) {
      await authStorage.setItem(AUTH_KEY_STORAGE_KEY, normalizedSession.key);
    }
    writeCookieAuthSession(normalizedSession);
    cacheAuthStorageScope(normalizedSession.subjectId);
    return normalizedSession;
  }

  if (String(storedKey || "").trim()) {
    await clearStoredAuthSession();
  } else {
    clearCookieAuthSession();
  }
  return null;
}

export async function setStoredAuthSession(session: StoredAuthSession) {
  const normalizedSession = normalizeSession(session);
  if (!normalizedSession) {
    await clearStoredAuthSession();
    return;
  }

  writeCookieAuthSession(normalizedSession);
  cacheAuthStorageScope(normalizedSession.subjectId);
  await Promise.allSettled([
    authStorage.setItem(AUTH_KEY_STORAGE_KEY, normalizedSession.key),
    authStorage.setItem(AUTH_SESSION_STORAGE_KEY, normalizedSession),
  ]);

  // Synchronize canvas, asset, and conversation stores to the new account scope
  const { setCanvasStorageScope } = await import("@/app/canvas/stores/use-canvas-store");
  const { setAssetStorageScope } = await import("@/stores/use-asset-store");
  const { setImageConversationStorageScope } = await import("@/store/image-conversations");
  setCanvasStorageScope(normalizedSession.subjectId);
  setAssetStorageScope(normalizedSession.subjectId);
  setImageConversationStorageScope(normalizedSession.subjectId);
}

export async function setStoredAuthKey(authKey: string) {
  const normalizedAuthKey = String(authKey || "").trim();
  if (!normalizedAuthKey) {
    await clearStoredAuthSession();
    return;
  }
  await authStorage.setItem(AUTH_KEY_STORAGE_KEY, normalizedAuthKey);
}

export async function clearStoredAuthSession() {
  if (typeof window === "undefined") {
    return;
  }
  clearCookieAuthSession();
  clearCachedAuthStorageScope();
  await Promise.allSettled([
    authStorage.removeItem(AUTH_KEY_STORAGE_KEY),
    authStorage.removeItem(AUTH_SESSION_STORAGE_KEY),
  ]);

  // Synchronize canvas, asset, and conversation stores to anonymous scope
  const { setCanvasStorageScope } = await import("@/app/canvas/stores/use-canvas-store");
  const { setAssetStorageScope } = await import("@/stores/use-asset-store");
  const { setImageConversationStorageScope } = await import("@/store/image-conversations");
  setCanvasStorageScope(null);
  setAssetStorageScope(null);
  setImageConversationStorageScope(null);
}

export async function clearStoredAuthKey() {
  await clearStoredAuthSession();
}
