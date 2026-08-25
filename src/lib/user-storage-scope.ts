"use client";

export const AUTH_STORAGE_SCOPE_KEY = "chatgpt2api_auth_storage_scope";

const ANONYMOUS_STORAGE_SCOPE = "anonymous";

export function normalizeStorageScope(scopeId?: string | null) {
  const normalized = String(scopeId || "").trim();
  return normalized || ANONYMOUS_STORAGE_SCOPE;
}

export function scopedStorageKey(baseKey: string, scopeId?: string | null) {
  return `${baseKey}:user:${normalizeStorageScope(scopeId)}`;
}

export function getCachedAuthStorageScope() {
  if (typeof window === "undefined") {
    return ANONYMOUS_STORAGE_SCOPE;
  }
  try {
    return normalizeStorageScope(window.localStorage.getItem(AUTH_STORAGE_SCOPE_KEY));
  } catch {
    return ANONYMOUS_STORAGE_SCOPE;
  }
}

export function cacheAuthStorageScope(scopeId?: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(AUTH_STORAGE_SCOPE_KEY, normalizeStorageScope(scopeId));
  } catch {
    // Ignore unavailable localStorage.
  }
}

export function clearCachedAuthStorageScope() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(AUTH_STORAGE_SCOPE_KEY);
  } catch {
    // Ignore unavailable localStorage.
  }
}
