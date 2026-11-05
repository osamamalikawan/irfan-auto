import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedRouteIds } from "@/lib/customer-scope";
import { chunk } from "@/lib/chunks";
import { addDays } from "@/lib/schedule";
import { comparePromises, promiseStatus } from "@/lib/promises";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** Each customer's latest promise to pay (last 90 days of visits) and whether it has been kept. */
export async function loadPromises(sb: SupabaseClient, user: Parameters<typeof allowedRouteIds>[1], today: string) {
  const empty = { items: [] as never[], counts: { attention: 0, upcoming: 0, kept: 0 } };
  const mine = await allowedRouteIds(sb, user);
  if (mine && !mine.length) return { ok: true as const, ...empty, today };
  const vs = await sb.from("visits").select("customer_id,visit_date,notes,promise_date,promise_amount,created_at,by:app_users(name)")
    .not("promise_date", "is", null).gte("visit_date", addDays(today, -90)).order("created_at", { ascending: false }).limit(3000);
  if (vs.error) return { ok: false as const, error: vs.error.message };
  const latest = new Map<string, { customer_id: string; visit_date: string; notes: string | null; promise_date: string; promise_amount: number | null; created_at: string; by: unknown }>();
  for (const v of vs.data ?? []) if (!latest.has(v.customer_id)) latest.set(v.customer_id, v as never);
  const ids = [...latest.keys()];
  if (!ids.length) return { ok: true as const, ...empty, today };

  const cust = new Map<string, { id: string; code: string; name: string; area: string; phone: string | null; route_id: string | null; route: string }>();
  const balance = new Map<string, number>(), paid = new Map<string, number>();
  for (const part of chunk(ids)) {
    const [c, b, p] = await Promise.all([
      sb.from("customers").select("id,code,name,phone,route_id,route:routes(name),area:areas(name)").in("id", part),
      sb.from("customer_balances").select("customer_id,balance").in("customer_id", part),
      sb.from("payments").select("customer_id,amount,created_at").in("customer_id", part).eq("reversed", false).gte("created_at", addDays(today, -91)),
    ]);
    const err = c.error ?? b.error ?? p.error;
    if (err) return { ok: false as const, error: err.message };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const x of (c.data ?? []) as any[]) cust.set(x.id, { id: x.id, code: x.code, name: x.name, area: one(x.area)?.name ?? "", phone: x.phone, route_id: x.route_id, route: one(x.route)?.name ?? "" });
    for (const x of b.data ?? []) balance.set(x.customer_id, Number(x.balance));
    for (const x of p.data ?? []) {
      const pr = latest.get(x.customer_id);
      if (pr && x.created_at >= pr.created_at) paid.set(x.customer_id, (paid.get(x.customer_id) ?? 0) + Number(x.amount));   // paid since the promise was made
    }
  }
  const items = [...latest.values()].flatMap((v) => {
    const c = cust.get(v.customer_id);
    if (!c || (mine && !(c.route_id && mine.includes(c.route_id)))) return [];
    const amount = Number(v.promise_amount ?? 0), paidSince = paid.get(v.customer_id) ?? 0, bal = balance.get(v.customer_id) ?? 0;
    return [{
      customer: { id: c.id, code: c.code, name: c.name, area: c.area, phone: c.phone, route: c.route }, date: v.promise_date, amount, notes: v.notes, made_on: v.visit_date,
      by: one(v.by as { name: string } | { name: string }[] | null)?.name ?? "", paid_since: paidSince, balance: bal, status: promiseStatus({ date: v.promise_date, amount, paidSince, balance: bal }, today),
    }];
  }).sort(comparePromises);
  const counts = { attention: items.filter((i) => i.status === "overdue" || i.status === "due").length, upcoming: items.filter((i) => i.status === "upcoming").length, kept: items.filter((i) => i.status === "kept").length };
  return { ok: true as const, today, items, counts };
}
