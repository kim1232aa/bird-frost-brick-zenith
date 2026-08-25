import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

async function ensure(userId: string) {
  const sql = await getSql();
  const existing = await sql<{ user_id: string }>`select user_id from studio_profiles where user_id = ${userId}`;
  if (!existing.length) {
    const count = await sql<{ n: number }>`select count(*)::int as n from studio_profiles`;
    const role = (count[0]?.n || 0) === 0 ? "admin" : "user";
    await sql`insert into studio_profiles (user_id, role, plan) values (${userId}, ${role}, 'studio')`;
    await sql`insert into studio_credits (user_id, kind, balance) values (${userId}, 'image', 200), (${userId}, 'video', 40), (${userId}, 'text', 2000)`;
  }
}

export const loadAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensure(context.userId);
    const sql = await getSql();
    const profile = (await sql<{ user_id: string; role: string; plan: string }>`select user_id, role, plan from studio_profiles where user_id = ${context.userId}`)[0];
    const credits = await sql<{ kind: string; balance: number }>`select kind, balance from studio_credits where user_id = ${context.userId}`;
    const ledger = await sql<{ id: string; kind: string; delta: number; reason: string; model: string; ok: boolean; created_at: string }>`
      select id, kind, delta, reason, model, ok, created_at::text from studio_ledger where user_id = ${context.userId} order by created_at desc limit 30
    `;
    const audit = await sql<{ id: string; action: string; detail: string; created_at: string }>`
      select id, action, detail, created_at::text from studio_audit where user_id = ${context.userId} order by created_at desc limit 30
    `;
    return { profile, credits, ledger, audit };
  });

export const grantCredits = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((value: { kind: "image" | "video" | "text"; amount: number; reason: string }) => value)
  .handler(async ({ context, data }) => {
    await ensure(context.userId);
    const sql = await getSql();
    const profile = (await sql<{ role: string }>`select role from studio_profiles where user_id = ${context.userId}`)[0];
    if (profile?.role !== "admin") throw new Error("只有管理员能发放额度");
    await sql`update studio_credits set balance = balance + ${data.amount} where user_id = ${context.userId} and kind = ${data.kind}`;
    await sql`insert into studio_ledger (id, user_id, kind, delta, reason, model, ok) values (${crypto.randomUUID()}, ${context.userId}, ${data.kind}, ${data.amount}, ${data.reason}, '', true)`;
    await sql`insert into studio_audit (id, user_id, action, detail) values (${crypto.randomUUID()}, ${context.userId}, '发放额度', ${`${data.kind} ${data.amount}`})`;
    return { ok: true };
  });
