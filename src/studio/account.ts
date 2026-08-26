import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StudioRole = "admin" | "user";

export type StudioAccountProfile = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: StudioRole;
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
  skipAutoLogin: boolean;
  hydrated: boolean;
  register: (input: { username: string; password: string; displayName?: string; email?: string }) => Promise<StudioAccountProfile>;
  login: (input: { username: string; password: string }) => Promise<StudioAccountProfile>;
  continueAsGuest: () => void;
  logout: () => void;
  loginDemoAdmin: () => Promise<StudioAccountProfile>;
  updateProfile: (patch: Partial<Pick<StudioAccountProfile, "displayName" | "email">>) => void;
};

const REGISTRY_KEY = "boundless-studio:account-registry";

export const DEMO_ADMIN = {
  username: "admin",
  password: "admin123",
  displayName: "管理员",
  email: "admin@local",
} as const;

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

export function normalizeUsername(value: string) {
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

function toSession(row: StoredAccount): StudioAccountProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
    createdAt: row.createdAt,
  };
}

export async function ensureDemoAdmin() {
  const registry = readRegistry();
  const key = normalizeUsername(DEMO_ADMIN.username);
  const hash = await hashPassword(DEMO_ADMIN.username, DEMO_ADMIN.password);
  const existing = registry.users.find((item) => normalizeUsername(item.username) === key);
  if (existing) {
    writeRegistry({
      users: registry.users.map((item) =>
        item.id === existing.id
          ? { ...item, passwordHash: hash, role: "admin", displayName: item.displayName || DEMO_ADMIN.displayName, email: item.email || DEMO_ADMIN.email }
          : item,
      ),
    });
    return;
  }
  writeRegistry({
    users: [
      {
        id: "demo-admin",
        username: DEMO_ADMIN.username,
        displayName: DEMO_ADMIN.displayName,
        email: DEMO_ADMIN.email,
        role: "admin",
        createdAt: Date.now(),
        passwordHash: hash,
      },
      ...registry.users,
    ],
  });
}

let bootPromise: Promise<void> | null = null;

export function bootstrapStudioAuth() {
  if (!bootPromise) bootPromise = runBootstrap();
  return bootPromise;
}

async function runBootstrap() {
  if (typeof window === "undefined") return;
  await ensureDemoAdmin();
  const state = useAccountStore.getState();
  if (state.session || state.isGuest || state.skipAutoLogin) {
    useAccountStore.setState({ hydrated: true });
    return;
  }
  try {
    await useAccountStore.getState().login({ username: DEMO_ADMIN.username, password: DEMO_ADMIN.password });
  } catch {
    /* keep unlogged if seed failed */
  }
  useAccountStore.setState({ hydrated: true });
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      session: null,
      isGuest: false,
      skipAutoLogin: false,
      hydrated: false,
      register: async ({ username, password, displayName, email }) => {
        validateCredentials(username, password);
        if (normalizeUsername(username) === normalizeUsername(DEMO_ADMIN.username)) {
          throw new Error("admin 是预置管理员账号，请直接登录");
        }
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
          role: "user",
          createdAt: Date.now(),
          passwordHash: await hashPassword(username, password),
        };
        writeRegistry({ users: registry.users.concat(profile) });
        const session = toSession(profile);
        set({ session, isGuest: false, skipAutoLogin: false, hydrated: true });
        return session;
      },
      login: async ({ username, password }) => {
        validateCredentials(username, password);
        await ensureDemoAdmin();
        const registry = readRegistry();
        const key = normalizeUsername(username);
        const match = registry.users.find((item) => normalizeUsername(item.username) === key);
        if (!match) throw new Error("账号不存在，请先注册");
        const hash = await hashPassword(username, password);
        if (hash !== match.passwordHash) throw new Error("密码不正确");
        const session = toSession(match);
        set({ session, isGuest: false, skipAutoLogin: false, hydrated: true });
        return session;
      },
      continueAsGuest: () => set({ session: null, isGuest: true, skipAutoLogin: true, hydrated: true }),
      logout: () => set({ session: null, isGuest: false, skipAutoLogin: true, hydrated: true }),
      loginDemoAdmin: async () => get().login({ username: DEMO_ADMIN.username, password: DEMO_ADMIN.password }),
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
    {
      name: "boundless-studio:account-session",
      version: 2,
      partialize: (state) => ({
        session: state.session,
        isGuest: state.isGuest,
        skipAutoLogin: state.skipAutoLogin,
      }),
      migrate: (persisted) => {
        const row = persisted && typeof persisted === "object" ? (persisted as Partial<AccountState>) : {};
        const session = row.session
          ? {
              ...row.session,
              role: row.session.role === "admin" || normalizeUsername(row.session.username) === "admin" ? ("admin" as const) : ("user" as const),
            }
          : null;
        return {
          session,
          isGuest: Boolean(row.isGuest),
          skipAutoLogin: Boolean(row.skipAutoLogin),
        };
      },
    },
  ),
);

export function isAdminSession(session: StudioAccountProfile | null | undefined) {
  return session?.role === "admin";
}

export function canEnterOps(state: Pick<AccountState, "session">) {
  return isAdminSession(state.session);
}

export function canGenerate(state: Pick<AccountState, "session" | "isGuest">) {
  return Boolean(state.session) || state.isGuest;
}

export function accountLabel(state: Pick<AccountState, "session" | "isGuest" | "hydrated">) {
  if (!state.hydrated) return "…";
  if (state.session?.role === "admin") return state.session.displayName || "管理员";
  if (state.session) return state.session.displayName || state.session.username;
  if (state.isGuest) return "访客";
  return "登录";
}
