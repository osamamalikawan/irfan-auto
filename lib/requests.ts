import { NextResponse } from "next/server";
import type { db } from "./supabase";
import type { SessionUser } from "./permissions";
import { allowedRouteIds } from "./customer-scope";
import { cleanCoords, cleanIdem, cleanText, isUuid } from "./field";

type SB = ReturnType<typeof db>;

/** The three kinds of request a salesman can file. `perm` lets a salesman file/list that kind; requests.approve lets the office review all. */
export const REQ_TYPES = {
  orders: { table: "order_requests", perm: "orders.request", select: "*,salesman:app_users!order_requests_salesman_id_fkey(name),sale:sales(no,total,fulfil_status)" },
  payments: { table: "payment_requests", perm: "payments.request", select: "*,salesman:app_users!payment_requests_salesman_id_fkey(name),payment:payments(no,amount)" },
  returns: { table: "return_requests", perm: "returns.request", select: "*,salesman:app_users!return_requests_salesman_id_fkey(name),ret:sale_returns(no,amount)" },
} as const;
export type ReqType = keyof typeof REQ_TYPES;
export const isReqType = (t: string): t is ReqType => Object.prototype.hasOwnProperty.call(REQ_TYPES, t);

export const STATUSES = ["pending", "approved", "rejected", "cancelled"];
const bad = (m: string, status = 400) => NextResponse.json({ error: m }, { status });
type Body = Record<string, unknown>;

/** A customer this salesman may take requests for: on his routes, active, not the walk-in customer. */
async function ownCustomer(sb: SB, user: SessionUser, customerId: unknown) {
  const id = String(customerId ?? "");
  if (!isUuid(id)) return { error: bad("Choose a customer.") };
  const { data: c } = await sb.from("customers").select("id,name,route_id,status,is_walk_in").eq("id", id).maybeSingle();
  if (!c || c.is_walk_in) return { error: bad("Customer not found.", 404) };
  const mine = await allowedRouteIds(sb, user);
  if (mine && !(c.route_id && mine.includes(c.route_id))) return { error: bad("That customer is not on your routes.", 403) };
  if (c.status !== "active") return { error: bad("This customer is archived.", 409) };
  return { customer: c as { id: string; name: string } };
}

/** A phone that retries an upload sends the same idem_key: answer with the request already saved instead of making a second. */
async function already(sb: SB, table: string, user: SessionUser, idem: string | null) {
  if (!idem) return null;
  const { data } = await sb.from(table).select("id,no,status,created_at").eq("idem_key", idem).eq("salesman_id", user.id).maybeSingle();
  return data ? NextResponse.json({ ...data, duplicate: true }) : null;
}

function saved(res: { data: unknown; error: { message: string; code?: string } | null }) {
  if (res.error) return bad(res.error.code === "23505" ? "This request was already sent." : res.error.message, res.error.code === "23505" ? 409 : 500);
  return NextResponse.json(res.data, { status: 201 });
}

/** Body: { customer_id, lines: [{ product_id, qty }], term?: "cash"|"credit", bilti?, local_charges?, remarks?, lat?, lng?, idem_key? } */
export async function createOrderRequest(sb: SB, user: SessionUser, b: Body) {
  const c = await ownCustomer(sb, user, b.customer_id);
  if (c.error) return c.error;
  const raw = Array.isArray(b.lines) ? (b.lines as Body[]) : [];
  if (!raw.length) return bad("Add at least one item.");
  if (raw.length > 100) return bad("An order can have at most 100 lines.");
  const lines = raw.map((l) => ({ product_id: String(l?.product_id ?? ""), qty: Number(l?.qty) }));
  if (lines.some((l) => !isUuid(l.product_id) || !(l.qty > 0) || l.qty > 100000)) return bad("Every line needs a part and a quantity above zero.");
  const idem = cleanIdem(b.idem_key);
  const dup = await already(sb, "order_requests", user, idem);
  if (dup) return dup;

  const ids = [...new Set(lines.map((l) => l.product_id))];
  const { data: ps, error: pe } = await sb.from("products").select("id,name_en,cp").in("id", ids).eq("active", true);
  if (pe) return bad(pe.message, 500);
  type Part = { id: string; name_en: string; cp: number };
  const byId = new Map<string, Part>(((ps ?? []) as Part[]).map((p) => [p.id, p]));
  if (ids.some((id) => !byId.has(id))) return bad("One of the parts was not found or is no longer active.", 409);
  const snap = lines.map((l) => { const p = byId.get(l.product_id)!; return { product_id: l.product_id, name: p.name_en, qty: l.qty, price: Number(p.cp) }; });

  const pos = cleanCoords(b.lat, b.lng);
  return saved(await sb.from("order_requests").insert({
    customer_id: c.customer.id, customer_name: c.customer.name, salesman_id: user.id, kind: "ledger", term: b.term === "cash" ? "cash" : "credit",
    lines: snap, bilti: Math.max(0, Math.round(Number(b.bilti) || 0)), local_charges: Math.max(0, Math.round(Number(b.local_charges) || 0)),
    remarks: cleanText(b.remarks, 500), idem_key: idem, lat: pos?.lat ?? null, lng: pos?.lng ?? null,
  }).select("id,no,status,created_at").single());
}

/** Body: { customer_id, amount, method_id, note?, lat?, lng?, idem_key? } */
export async function createPaymentRequest(sb: SB, user: SessionUser, b: Body) {
  const c = await ownCustomer(sb, user, b.customer_id);
  if (c.error) return c.error;
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount > 0) || amount > 100_000_000) return bad("Enter an amount above zero.");
  if (!isUuid(String(b.method_id ?? ""))) return bad("Choose how the money was received.");
  const idem = cleanIdem(b.idem_key);
  const dup = await already(sb, "payment_requests", user, idem);
  if (dup) return dup;
  const { data: m } = await sb.from("payment_methods").select("id,name").eq("id", String(b.method_id)).eq("active", true).maybeSingle();
  if (!m) return bad("Choose a valid payment method.");
  const pos = cleanCoords(b.lat, b.lng);
  return saved(await sb.from("payment_requests").insert({
    customer_id: c.customer.id, customer_name: c.customer.name, salesman_id: user.id, amount, method_id: m.id, method: m.name,
    note: cleanText(b.note, 300), idem_key: idem, lat: pos?.lat ?? null, lng: pos?.lng ?? null,
  }).select("id,no,status,created_at").single());
}

/** Body: { sale_id, lines: [{ item_id, qty }], kind?: "return"|"claim", damaged?, reason?, lat?, lng?, idem_key? } */
export async function createReturnRequest(sb: SB, user: SessionUser, b: Body) {
  const saleId = String(b.sale_id ?? "");
  if (!isUuid(saleId)) return bad("Find the invoice first.");
  const { data: s } = await sb.from("sales").select("id,no,customer_id,customer_name,route_id,status").eq("id", saleId).maybeSingle();
  if (!s) return bad("Invoice not found.", 404);
  const mine = await allowedRouteIds(sb, user);
  if (mine && !(s.route_id && mine.includes(s.route_id))) return bad("Invoice not found.", 404);
  if (s.status !== "confirmed") return bad("This invoice is cancelled.", 409);

  const raw = Array.isArray(b.lines) ? (b.lines as Body[]) : [];
  const want = new Map<string, number>();
  for (const l of raw) {
    const id = String(l?.item_id ?? ""), q = Number(l?.qty);
    if (!isUuid(id) || !(q > 0)) return bad("Every line needs an item and a quantity above zero.");
    want.set(id, (want.get(id) ?? 0) + q);
  }
  if (!want.size) return bad("Choose the items that came back.");
  const idem = cleanIdem(b.idem_key);
  const dup = await already(sb, "return_requests", user, idem);
  if (dup) return dup;

  const { data: items } = await sb.from("sale_items").select("id,name,qty").eq("sale_id", saleId);
  type Item = { id: string; name: string; qty: number };
  const byId = new Map<string, Item>(((items ?? []) as Item[]).map((i) => [i.id, i]));
  const snap: { item_id: string; name: string; qty: number }[] = [];
  for (const [id, q] of want) {
    const it = byId.get(id);
    if (!it) return bad("One of the items is not on that invoice.");
    if (q > Number(it.qty)) return bad("More of " + it.name + " than was sold on this invoice.");
    snap.push({ item_id: id, name: it.name, qty: q });
  }
  const pos = cleanCoords(b.lat, b.lng);
  return saved(await sb.from("return_requests").insert({
    kind: b.kind === "claim" ? "claim" : "return", sale_id: s.id, sale_no: s.no, customer_id: s.customer_id, customer_name: s.customer_name, salesman_id: user.id,
    lines: snap, damaged: b.damaged === true, reason: cleanText(b.reason, 300), idem_key: idem, lat: pos?.lat ?? null, lng: pos?.lng ?? null,
  }).select("id,no,status,created_at").single());
}
