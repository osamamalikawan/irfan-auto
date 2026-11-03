import type { db } from "./supabase";
import { addDays } from "./schedule";

type SB = ReturnType<typeof db>;
export type CashEntry = {
  ts: string; entry_date: string; type: "collection" | "handover"; ref: string; customer_name: string | null; method: string | null;
  note: string | null; amount: number; balance: number;
};
export type MyCustomer = { id: string; code: string | null; name: string; name_ur: string | null; phone: string | null; credit_limit: number; area: string | null; route: string | null; balance: number };
const STATEMENT_LIMIT = 1000;

/** A salesman's money account for a period: what he collected, what he handed to the office, and what is still with him. */
export async function cashAccount(sb: SB, userId: string, from: string, to: string) {
  const [open, close, st] = await Promise.all([
    sb.rpc("salesman_cash_balance", { p_user: userId, p_to: addDays(from, -1) }),
    sb.rpc("salesman_cash_balance", { p_user: userId, p_to: to }),
    sb.rpc("salesman_cash_statement", { p_user: userId, p_from: from, p_to: to }).limit(STATEMENT_LIMIT),
  ]);
  const err = open.error ?? close.error ?? st.error;
  if (err) throw new Error(err.message);
  const entries: CashEntry[] = ((st.data ?? []) as Record<string, unknown>[]).map((e) => ({
    ts: String(e.ts), entry_date: String(e.entry_date), type: e.type === "handover" ? "handover" : "collection", ref: String(e.ref),
    customer_name: (e.customer_name as string | null) ?? null, method: (e.method as string | null) ?? null, note: (e.note as string | null) ?? null,
    amount: Number(e.amount), balance: Number(e.balance),
  }));
  const collected = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const handed_over = -entries.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0);
  return { from, to, opening: Number(open.data ?? 0), collected, handed_over, closing: Number(close.data ?? 0), truncated: entries.length >= STATEMENT_LIMIT, entries };
}

/** The customers on this salesman's routes with their balances. */
export async function myCustomers(sb: SB, userId: string): Promise<MyCustomer[]> {
  const { data, error } = await sb.rpc("salesman_customers", { p_user: userId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id), code: (c.code as string | null) ?? null, name: String(c.name), name_ur: (c.name_ur as string | null) ?? null, phone: (c.phone as string | null) ?? null,
    credit_limit: Number(c.credit_limit) || 0, area: (c.area as string | null) ?? null, route: (c.route as string | null) ?? null, balance: Number(c.balance) || 0,
  }));
}

/** How many of this salesman's requests wait for the office. */
export async function pendingCounts(sb: SB, userId: string) {
  const n = async (table: string) => (await sb.from(table).select("id", { count: "exact", head: true }).eq("salesman_id", userId).eq("status", "pending")).count ?? 0;
  const [orders, payments, returns] = await Promise.all([n("order_requests"), n("payment_requests"), n("return_requests")]);
  return { orders, payments, returns, total: orders + payments + returns };
}
