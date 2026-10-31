import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { safeWord } from "@/lib/customer-scope";
import { dbError } from "@/lib/sql-error";

export const dynamic = "force-dynamic";

/** ?q=&from=&to=&supplier=&status=&offset=&limit= */
export async function GET(req: NextRequest) {
  const a = await authorize("purchases.create", "purchases.cancel", "suppliers.view");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  let q = db().from("purchases").select("id,no,purchase_date,supplier_id,supplier_name,supplier_inv_no,total,paid,status,purchase_items(count)", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (sp.get("from")) q = q.gte("purchase_date", sp.get("from")!);
  if (sp.get("to")) q = q.lte("purchase_date", sp.get("to")!);
  if (sp.get("supplier")) q = q.eq("supplier_id", sp.get("supplier")!);
  if (["confirmed", "cancelled"].includes(sp.get("status") ?? "")) q = q.eq("status", sp.get("status")!);
  for (const raw of (sp.get("q") ?? "").split(/\s+/)) {
    const w = safeWord(raw);
    if (w) q = q.or("no.ilike.%" + w + "%,supplier_name.ilike.%" + w + "%,supplier_inv_no.ilike.%" + w + "%");
  }
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ items: (data ?? []).map((p: any) => ({ ...p, items: p.purchase_items?.[0]?.count ?? 0, purchase_items: undefined })), total: count ?? 0 });
}

/** Body: { supplier_id, location_id, lines: [{ product_id, qty, free?, cost, disc_pct? }], discount?, freight?, paid?, method?, ref?, supplier_inv_no?, supplier_inv_date?, remarks?, idem_key? } */
export async function POST(req: NextRequest) {
  const a = await authorize("purchases.create");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b?.supplier_id) return NextResponse.json({ error: "Choose a supplier." }, { status: 400 });
  const lines = Array.isArray(b.lines) ? b.lines.map((l: Record<string, unknown>) => ({
    product_id: l.product_id, qty: Number(l.qty), free: Number(l.free) || 0, cost: l.cost === "" || l.cost == null ? null : Number(l.cost),
    disc_pct: l.disc_pct === "" || l.disc_pct == null ? 0 : Number(l.disc_pct),
  })) : [];
  const date = /^\d{4}-\d\d-\d\d$/.test(String(b.supplier_inv_date ?? "")) ? b.supplier_inv_date : null;
  const { data, error } = await db().rpc("create_purchase", {
    p_supplier: b.supplier_id, p_location: b.location_id || null, p_lines: lines, p_discount: Number(b.discount) || 0, p_freight: Number(b.freight) || 0,
    p_paid: Number(b.paid) || 0, p_method: String(b.method ?? "cash"), p_ref: String(b.ref ?? "").slice(0, 60), p_supp_no: String(b.supplier_inv_no ?? "").slice(0, 40),
    p_supp_date: date, p_remarks: String(b.remarks ?? "").slice(0, 500), p_idem: b.idem_key ? String(b.idem_key) : null, p_user: a.user.id,
  });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
