import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds, safeWord } from "@/lib/customer-scope";
import { hasPerm } from "@/lib/permissions";
import { dbError } from "@/lib/sql-error";

export const dynamic = "force-dynamic";

/** ?q=&from=YYYY-MM-DD&to=&customer=&status=&offset=&limit= */
export async function GET(req: NextRequest) {
  const a = await authorize("sales.create", "payments.receive");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const sb = db();
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !mine.length) return NextResponse.json({ items: [], total: 0 });

  let q = sb.from("sales").select("id,no,sale_date,customer_id,customer_name,total,paid,status,created_at,sale_items(count)", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (mine) q = q.in("route_id", mine);
  if (sp.get("from")) q = q.gte("sale_date", sp.get("from")!);
  if (sp.get("to")) q = q.lte("sale_date", sp.get("to")!);
  if (sp.get("customer")) q = q.eq("customer_id", sp.get("customer")!);
  if (["confirmed", "cancelled"].includes(sp.get("status") ?? "")) q = q.eq("status", sp.get("status")!);
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

/** Body: { customer_id, location_id?, lines: [{ product_id, qty, price?, disc_pct?, location_id? }], discount?, bilti?, paid?, remarks?, idem_key? } */
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
  const lines = Array.isArray(b.lines) ? b.lines.map((l: Record<string, unknown>) => ({
    product_id: l.product_id, qty: Number(l.qty),
    price: l.price === undefined || l.price === null || l.price === "" ? null : Number(l.price),
    disc_pct: l.disc_pct === undefined || l.disc_pct === null || l.disc_pct === "" ? null : Number(l.disc_pct),
    location_id: l.location_id || null,
  })) : [];
  const { data, error } = await sb.rpc("create_sale", {
    p_customer: b.customer_id, p_location: b.location_id || null, p_lines: lines,
    p_discount: Number(b.discount) || 0, p_bilti: Number(b.bilti) || 0, p_paid: Number(b.paid) || 0,
    p_remarks: String(b.remarks ?? "").slice(0, 500), p_idem: b.idem_key ? String(b.idem_key) : null,
    p_user: a.user.id, p_can_discount: hasPerm(a.user, "sales.discount"), p_allowed: a.user.locationIds,
  });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
