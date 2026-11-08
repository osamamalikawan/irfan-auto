import type { db } from "./supabase";
import { addDays, isVisitDate } from "./schedule";
import { computeBills, statement, type LedgerEntry } from "./bills";
import { todayPk } from "./field";

type SB = ReturnType<typeof db>;
const PLAN_DAYS = 7;
type RouteRow = { id: string; name: string; code: string | null; frequency: string; visit_days: string[] | null; cycle_start: string | null; month_week: number | null };

/** The salesman's visit plan for today and the next 6 days (which of his routes are visited, which customers are on them),
 *  and the answers already recorded today. */
export async function buildPlan(sb: SB, userId: string) {
  const today = todayPk();
  const rq = await sb.from("routes").select("id,name,code,frequency,visit_days,cycle_start,month_week").eq("active", true).eq("salesman_id", userId).order("name");
  if (rq.error) throw new Error(rq.error.message);
  const routes = (rq.data ?? []) as RouteRow[];
  const ids = routes.map((r) => r.id);
  const members = new Map<string, string[]>();
  const done: Record<string, { outcome: string; notes: string | null }> = {};
  if (ids.length) {
    const [cs, vs] = await Promise.all([
      sb.from("customers").select("id,route_id").in("route_id", ids).eq("status", "active").eq("is_walk_in", false).order("name").limit(3000),
      sb.from("visits").select("customer_id,outcome,notes,created_at").eq("visit_date", today).in("route_id", ids).order("created_at", { ascending: false }),
    ]);
    if (cs.error) throw new Error(cs.error.message);
    for (const c of (cs.data ?? []) as { id: string; route_id: string }[]) members.set(c.route_id, [...(members.get(c.route_id) ?? []), c.id]);
    for (const v of (vs.data ?? []) as { customer_id: string; outcome: string; notes: string | null }[]) if (!done[v.customer_id]) done[v.customer_id] = { outcome: v.outcome, notes: v.notes };
  }
  const days = [];
  for (let i = 0; i < PLAN_DAYS; i++) {
    const date = addDays(today, i);
    const due = routes.filter((r) => isVisitDate({ frequency: r.frequency, visit_days: r.visit_days ?? [], cycle_start: r.cycle_start, month_week: r.month_week } as Parameters<typeof isVisitDate>[0], date));
    days.push({ date, routes: due.map((r) => ({ id: r.id, name: r.name, code: r.code, frequency: r.frequency, customer_ids: members.get(r.id) ?? [] })) });
  }
  return { today, days, done_today: done };
}

/** The latest recorded visit of each customer (what was said last time). */
export async function lastVisits(sb: SB, customerIds: string[]) {
  const out: Record<string, { date: string; outcome: string; notes: string | null }> = {};
  for (let i = 0; i < customerIds.length; i += 100) {
    const r = await sb.from("visits").select("customer_id,visit_date,outcome,notes").in("customer_id", customerIds.slice(i, i + 100))
      .order("visit_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
    for (const v of (r.data ?? []) as { customer_id: string; visit_date: string; outcome: string; notes: string | null }[]) {
      if (!out[v.customer_id]) out[v.customer_id] = { date: v.visit_date, outcome: v.outcome, notes: v.notes };
    }
  }
  return out;
}

/** What the phone needs to show one customer's account and to take a return, without internet:
 *  balance, unpaid bills, the latest statement lines, and the latest delivered invoices with what can still be returned. */
export async function snapshotCustomer(sb: SB, c: { id: string; credit_limit: number }) {
  const [led, sales, pays] = await Promise.all([
    sb.from("customer_ledger").select("id,ts,entry_date,type,amount,ref").eq("customer_id", c.id).order("ts").limit(5000),
    sb.from("sales").select("id,no,created_at,sale_date,total,status,fulfil_status").eq("customer_id", c.id),
    sb.from("payments").select("id,sale_id,kind,amount,reversed").eq("customer_id", c.id),
  ]);
  const err = led.error ?? sales.error ?? pays.error;
  if (err) throw new Error(err.message);
  type Sale = { id: string; no: string; created_at: string; sale_date: string | null; total: number; status: string; fulfil_status: string };
  const saleList = (sales.data ?? []) as Sale[];
  const saleById = new Map(saleList.map((s) => [s.id, s]));
  const payById = new Map(((pays.data ?? []) as { id: string; sale_id: string | null; kind: string }[]).map((p) => [p.id, p]));
  const label = (e: { type: string; ref: string | null }) => {
    if (e.type === "opening") return "Opening balance";
    if (e.type === "invoice") return saleById.get(e.ref ?? "")?.no ?? "Invoice";
    if (e.type === "payment") {
      const p = payById.get(e.ref ?? "");
      const sl = p?.sale_id ? saleById.get(p.sale_id) : undefined;
      return "Payment" + (sl ? " with " + sl.no : p?.kind === "collection" ? " (collection)" : "");
    }
    return e.type === "reversal" ? "Reversal" : e.type === "refund" ? "Cash refund" : "Return";
  };
  const ledRows = (led.data ?? []) as { id: string; ts: string; entry_date: string; type: string; amount: number; ref: string | null }[];
  const entries: LedgerEntry[] = ledRows.map((e) => ({ ts: e.ts, entry_date: e.entry_date, type: e.type, amount: Number(e.amount), label: label(e) }));
  const st = statement(entries, null, null);
  const balance = entries.reduce((x, e) => x + e.amount, 0);

  const bills = [
    ...ledRows.filter((e) => e.type === "opening").map((e) => ({ id: "open:" + e.id, kind: "opening" as const, no: "Opening balance", ts: e.ts, total: Number(e.amount) })),
    ...saleList.filter((s) => s.status === "confirmed").map((s) => ({ id: s.id, kind: "invoice" as const, no: s.no, ts: s.created_at, total: Number(s.total) })),
  ];
  const due = computeBills(bills, ((pays.data ?? []) as { sale_id: string | null; amount: number; reversed: boolean }[]).filter((p) => !p.reversed).map((p) => ({ sale_id: p.sale_id, amount: Number(p.amount) })));

  // the latest delivered / completed invoices, with the quantity of each item that can still come back
  const recent = saleList.filter((s) => s.status === "confirmed" && (s.fulfil_status === "delivered" || s.fulfil_status === "completed"))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5);
  const invoices: { id: string; no: string; sale_date: string | null; total: number; items: { id: string; name: string; sold: number; returned: number; remaining: number; net_unit: number }[] }[] = [];
  if (recent.length) {
    const items = await sb.from("sale_items").select("id,sale_id,line_no,name,qty,price,disc_pct").in("sale_id", recent.map((s) => s.id)).order("line_no");
    if (items.error) throw new Error(items.error.message);
    const itemRows = (items.data ?? []) as { id: string; sale_id: string; name: string; qty: number; price: number; disc_pct: number }[];
    const back = new Map<string, number>();
    if (itemRows.length) {
      const done = await sb.from("sale_return_lines").select("sale_item_id,qty").in("sale_item_id", itemRows.map((i) => i.id));
      for (const d of (done.data ?? []) as { sale_item_id: string; qty: number }[]) back.set(d.sale_item_id, (back.get(d.sale_item_id) ?? 0) + Number(d.qty));
    }
    for (const s of recent) {
      invoices.push({
        id: s.id, no: s.no, sale_date: s.sale_date, total: Number(s.total),
        items: itemRows.filter((i) => i.sale_id === s.id).map((i) => ({
          id: i.id, name: i.name, sold: Number(i.qty), returned: back.get(i.id) ?? 0, remaining: Number(i.qty) - (back.get(i.id) ?? 0),
          net_unit: Math.round(Number(i.price) * (1 - Number(i.disc_pct) / 100)),
        })),
      });
    }
  }
  return {
    customer_id: c.id, balance, credit_limit: c.credit_limit, opening: st.opening, closing: st.closing,
    rows: st.rows.slice(-40), unpaid: due.bills.filter((b) => b.due > 0).map((b) => ({ no: b.no, due: b.due, total: b.total, ts: b.ts })), invoices,
  };
}
