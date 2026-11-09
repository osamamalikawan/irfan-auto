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

export type DocItem = { id: string; name: string; qty: number; free: number; price: number; disc_pct: number; line_disc: number; returned: number };
export type InvoiceDoc = {
  id: string; no: string; sale_date: string | null; customer_id: string; customer_name: string; status: string; fulfil_status: string; kind: string; term: string;
  subtotal: number; line_discount: number; discount: number; bilti: number; local_charges: number; total: number; paid: number; remarks: string | null;
  items: DocItem[]; payments: { method: string; amount: number; date: string | null }[];
};
type SaleRow = {
  id: string; no: string; customer_id: string; customer_name: string; sale_date: string | null; total: number; discount: number; line_discount: number; bilti: number;
  local_charges: number; paid: number; remarks: string | null; status: string; fulfil_status: string; sale_kind: string; pay_term: string; created_at: string; route_id?: string | null;
};
const SALE_COLS = "id,no,customer_id,customer_name,sale_date,total,discount,line_discount,bilti,local_charges,paid,remarks,status,fulfil_status,sale_kind,pay_term,created_at";

/** Invoices as the salesman may see them: lines, totals, payments and what has already been returned. (No cost prices.) */
async function buildDocs(sb: SB, sales: SaleRow[]): Promise<InvoiceDoc[]> {
  if (!sales.length) return [];
  const ids = sales.map((x) => x.id);
  const [items, pays] = await Promise.all([
    sb.from("sale_items").select("id,sale_id,line_no,name,qty,free,price,disc_pct,line_disc").in("sale_id", ids).order("line_no"),
    sb.from("payments").select("sale_id,amount,method,pay_date,reversed").in("sale_id", ids).eq("reversed", false).order("created_at"),
  ]);
  const err = items.error ?? pays.error;
  if (err) throw new Error(err.message);
  type ItemRow = { id: string; sale_id: string; name: string; qty: number; free: number; price: number; disc_pct: number; line_disc: number };
  const itemRows = (items.data ?? []) as ItemRow[];
  const back = new Map<string, number>();
  if (itemRows.length) {
    const done = await sb.from("sale_return_lines").select("sale_item_id,qty").in("sale_item_id", itemRows.map((i) => i.id));
    for (const d of (done.data ?? []) as { sale_item_id: string; qty: number }[]) back.set(d.sale_item_id, (back.get(d.sale_item_id) ?? 0) + Number(d.qty));
  }
  const payRows = (pays.data ?? []) as { sale_id: string; amount: number; method: string | null; pay_date: string | null }[];
  return sales.map((x) => {
    const lines: DocItem[] = itemRows.filter((i) => i.sale_id === x.id).map((i) => ({
      id: i.id, name: i.name, qty: Number(i.qty), free: Number(i.free), price: Number(i.price), disc_pct: Number(i.disc_pct), line_disc: Number(i.line_disc), returned: back.get(i.id) ?? 0,
    }));
    return {
      id: x.id, no: x.no, sale_date: x.sale_date, customer_id: x.customer_id, customer_name: x.customer_name, status: x.status, fulfil_status: x.fulfil_status, kind: x.sale_kind, term: x.pay_term,
      subtotal: lines.reduce((t, i) => t + i.qty * i.price - i.line_disc, 0), line_discount: Number(x.line_discount), discount: Number(x.discount), bilti: Number(x.bilti),
      local_charges: Number(x.local_charges), total: Number(x.total), paid: Number(x.paid), remarks: x.remarks, items: lines,
      payments: payRows.filter((p) => p.sale_id === x.id).map((p) => ({ method: p.method ?? "Cash", amount: Number(p.amount), date: p.pay_date })),
    };
  });
}

/** One invoice by its id or its number (INV-0020), with the route it belongs to (so the caller can check it is his). */
export async function invoiceByKey(sb: SB, key: string): Promise<{ doc: InvoiceDoc; route_id: string | null } | null> {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  const r = await sb.from("sales").select(SALE_COLS + ",route_id").eq(isId ? "id" : "no", key).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  if (!r.data) return null;
  const row = r.data as unknown as SaleRow;
  const [doc] = await buildDocs(sb, [row]);
  return { doc, route_id: row.route_id ?? null };
}

/** What the phone needs to show one customer's account and to take a return, without internet:
 *  balance, unpaid bills, the latest statement lines, and the latest invoices in full (with what can still be returned). */
export async function snapshotCustomer(sb: SB, c: { id: string; credit_limit: number }) {
  const [led, sales, pays] = await Promise.all([
    sb.from("customer_ledger").select("id,ts,entry_date,type,amount,ref").eq("customer_id", c.id).order("ts").limit(5000),
    sb.from("sales").select(SALE_COLS).eq("customer_id", c.id),
    sb.from("payments").select("id,sale_id,kind,amount,reversed").eq("customer_id", c.id),
  ]);
  const err = led.error ?? sales.error ?? pays.error;
  if (err) throw new Error(err.message);
  const saleList = (sales.data ?? []) as unknown as SaleRow[];
  const saleById = new Map(saleList.map((x) => [x.id, x]));
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
    ...saleList.filter((x) => x.status === "confirmed").map((x) => ({ id: x.id, kind: "invoice" as const, no: x.no, ts: x.created_at, total: Number(x.total) })),
  ];
  const due = computeBills(bills, ((pays.data ?? []) as { sale_id: string | null; amount: number; reversed: boolean }[]).filter((p) => !p.reversed).map((p) => ({ sale_id: p.sale_id, amount: Number(p.amount) })));

  // the latest 15 invoices in full: the salesman opens them from the statement or the unpaid list, and returns goods from them
  const recent = [...saleList].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 15);
  const docs = await buildDocs(sb, recent);
  const invoices = docs.filter((d) => d.status === "confirmed" && (d.fulfil_status === "delivered" || d.fulfil_status === "completed")).slice(0, 5).map((d) => ({
    id: d.id, no: d.no, sale_date: d.sale_date, total: d.total,
    items: d.items.map((i) => ({ id: i.id, name: i.name, sold: i.qty, returned: i.returned, remaining: i.qty - i.returned, net_unit: Math.round(i.price * (1 - i.disc_pct / 100)) })),
  }));
  return {
    customer_id: c.id, balance, credit_limit: c.credit_limit, opening: st.opening, closing: st.closing,
    rows: st.rows.slice(-40), unpaid: due.bills.filter((b) => b.due > 0).map((b) => ({ no: b.no, due: b.due, total: b.total, ts: b.ts })), invoices, docs,
  };
}
