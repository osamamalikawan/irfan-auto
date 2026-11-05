import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds, safeWord } from "@/lib/customer-scope";
import { hasPerm } from "@/lib/permissions";
import { dbError } from "@/lib/sql-error";
import { cleanPays } from "@/lib/pays";
import { mapLines } from "@/lib/sale-lines";

export const dynamic = "force-dynamic";

/** ?q=&from=YYYY-MM-DD&to=&customer=&status=active|packed|delivered|completed|cancelled&kind=counter|cash|credit&offset=&limit=
 *  Active invoices come first, then the newest. */
export async function GET(req: NextRequest) {
  const a = await authorize("sales.create", "payments.receive", "orders.request", "returns.request");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const sb = db();
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !mine.length) return NextResponse.json({ items: [], total: 0 });

  let q = sb.from("sales").select("id,no,sale_date,customer_id,customer_name,total,paid,status,fulfil_status,sale_kind,pay_term,local_charges,created_at,sale_items(count)", { count: "exact" })
    .order("active_first", { ascending: true }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (mine) q = q.in("route_id", mine);
  if (sp.get("from")) q = q.gte("sale_date", sp.get("from")!);
  if (sp.get("to")) q = q.lte("sale_date", sp.get("to")!);
  if (sp.get("customer")) q = q.eq("customer_id", sp.get("customer")!);
  const st = sp.get("status") ?? "";
  if (st === "cancelled") q = q.eq("status", "cancelled");
  else if (st === "returnable") q = q.eq("status", "confirmed").in("fulfil_status", ["delivered", "completed"]);
  else if (["active", "packed", "delivered", "completed"].includes(st)) q = q.eq("status", "confirmed").eq("fulfil_status", st);
  const kind = sp.get("kind") ?? "";
  if (kind === "counter") q = q.eq("sale_kind", "counter");
  else if (kind === "cash" || kind === "credit") q = q.eq("sale_kind", "ledger").eq("pay_term", kind);
  for (const raw of (sp.get("q") ?? "").split(/\s+/)) {
    const w = safeWord(raw);
    if (w) q = q.or("no.ilike.%" + w + "%,customer_name.ilike.%" + w + "%");
  }
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data ?? []).map((s: any) => ({ ...s, items: s.sale_items?.[0]?.count ?? 0, sale_items: undefined }));
  return NextResponse.json({ items, total: count ?? 0 });
}

/** Body: { customer_id, kind: "counter"|"ledger", term?: "cash"|"credit", hold?, location_id?, lines: [{ product_id, qty, price?, disc_pct?, location_id? }],
 *  discount?, bilti? (outside the city), local_charges? (inside the city), payments?: [{ method_id, amount }], contact_name?, contact_phone?, remarks?, idem_key? } */
export async function POST(req: NextRequest) {
  const a = await authorize("sales.create");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b?.customer_id) return NextResponse.json({ error: "Choose a customer." }, { status: 400 });
  const sb = db();

  const mine = await allowedRouteIds(sb, a.user);
  if (mine) {
    const c = await sb.from("customers").select("route_id,is_walk_in").eq("id", b.customer_id).maybeSingle();
    if (!c.data || (!c.data.is_walk_in && !(c.data.route_id && mine.includes(c.data.route_id)))) return NextResponse.json({ error: "That customer is not on your routes." }, { status: 403 });
  }
  const lines = mapLines(b.lines);
  const { data, error } = await sb.rpc("create_sale", {
    p_customer: b.customer_id, p_location: b.location_id || null, p_lines: lines,
    p_discount: Number(b.discount) || 0, p_bilti: Number(b.bilti) || 0,
    p_remarks: String(b.remarks ?? "").slice(0, 500), p_idem: b.idem_key ? String(b.idem_key) : null,
    p_user: a.user.id, p_can_discount: hasPerm(a.user, "sales.discount"), p_allowed: a.user.locationIds,
    p_kind: b.kind === "counter" ? "counter" : "ledger", p_term: b.term === "cash" ? "cash" : "credit", p_hold: b.hold === true,
    p_local: Number(b.local_charges) || 0,
    p_contact_name: String(b.contact_name ?? "").trim().slice(0, 80) || null, p_contact_phone: String(b.contact_phone ?? "").trim().slice(0, 30) || null,
    p_pays: cleanPays(b.payments),
  });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
