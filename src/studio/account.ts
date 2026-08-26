import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StudioAccountProfile = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  createdAt: number;
};

type StoredAccount = StudioAccountProfile & {
  passwordHash: string;
};

type AccountRegistry = {
  users: StoredAccount[];
};

type AccountState = {
  session: StudioAccountProfile | null;
  isGuest: boolean;
  register: (input: { username: string; password: string; displayName?: string; email?: string }) => Promise<StudioAccountProfile>;
  login: (input: { username: string; password: string }) => Promise<StudioAccountProfile>;
  continueAsGuest: () => void;
  logout: () => void;
  updateProfile: (patch: Partial<Pick<StudioAccountProfile, "displayName" | "email">>) => void;
};

const REGISTRY_KEY = "boundless-studio:account-registry";

function readRegistry(): AccountRegistry {
  if (typeof window === "undefined") return { users: [] };
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    if (!raw) return { users: [] };
    const parsed = JSON.parse(raw) as AccountRegistry;
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch {
    return { users: [] };
  }
}

function writeRegistry(registry: AccountRegistry) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function hashPassword(username: string, password: string) {
  const payload = `${normalizeUsername(username)}::${password}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("");
  }
  return `fallback:${btoa(unescape(encodeURIComponent(payload)))}`;
}

function validateCredentials(username: string, password: string) {
  const name = username.trim();
  if (name.length < 3) throw new Error("用户名至少 3 个字符");
  if (name.length > 32) throw new Error("用户名最多 32 个字符");
  if (!/^[\w.\u4e00-\u9fa5-]+$/u.test(name)) throw new Error("用户名只能包含中文、字母、数字、点和下划线");
  if (password.length < 6) throw new Error("密码至少 6 位");
  if (password.length > 72) throw new Error("密码过长");
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      session: null,
      isGuest: false,
      register: async ({ username, password, displayName, email }) => {
        validateCredentials(username, password);
        const registry = readRegistry();
        const key = normalizeUsername(username);
        if (registry.users.some((item) => normalizeUsername(item.username) === key)) {
          throw new Error("这个用户名已被注册，请直接登录");
        }
        const profile: StoredAccount = {
          id: crypto.randomUUID(),
          username: username.trim(),
          displayName: (displayName || username).trim(),
          email: normalizeEmail(email || ""),
          createdAt: Date.now(),
          passwordHash: await hashPassword(username, password),
        };
        writeRegistry({ users: registry.users.concat(profile) });
        const session = {
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          email: profile.email,
          createdAt: profile.createdAt,
        };
        set({ session, isGuest: false });
        return session;
      },
      login: async ({ username, password }) => {
        validateCredentials(username, password);
        const registry = readRegistry();
        const key = normalizeUsername(username);
        const match = registry.users.find((item) => normalizeUsername(item.username) === key);
        if (!match) throw new Error("账号不存在，请先注册");
        const hash = await hashPassword(username, password);
        if (hash !== match.passwordHash) throw new Error("密码不正确");
        const session = {
          id: match.id,
          username: match.username,
          displayName: match.displayName,
          email: match.email,
          createdAt: match.createdAt,
        };
        set({ session, isGuest: false });
        return session;
      },
      continueAsGuest: () => set({ session: null, isGuest: true }),
      logout: () => set({ session: null, isGuest: false }),
      updateProfile: (patch) => {
        const session = get().session;
        if (!session) return;
        const next = {
          ...session,
          displayName: (patch.displayName ?? session.displayName).trim() || session.username,
          email: normalizeEmail(patch.email ?? session.email),
        };
        const registry = readRegistry();
        writeRegistry({
          users: registry.users.map((item) => (item.id === session.id ? { ...item, displayName: next.displayName, email: next.email } : item)),
        });
        set({ session: next });
      },
    }),
    { name: "boundless-studio:account-session" },
  ),
);

export function accountLabel(state: Pick<AccountState, "session" | "isGuest">) {
  if (state.session) return state.session.displayName || state.session.username;
  if (state.isGuest) return "访客";
  return "未登录";
}
