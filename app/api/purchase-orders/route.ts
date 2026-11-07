import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";

export const dynamic = "force-dynamic";
const READ = ["purchases.create", "purchases.cancel", "suppliers.view", "suppliers.edit"];

/** ?supplier=&status=open|received|cancelled&offset=&limit= */
export async function GET(req: NextRequest) {
  const a = await authorize(...READ);
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  let q = db().from("purchase_orders").select("id,no,po_date,expected_date,supplier_id,supplier_name,status,total,remarks,purchase_order_items(count)", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (sp.get("supplier")) q = q.eq("supplier_id", sp.get("supplier")!);
  if (["open", "received", "cancelled"].includes(sp.get("status") ?? "")) q = q.eq("status", sp.get("status")!);
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ items: (data ?? []).map((p: any) => ({ ...p, items: p.purchase_order_items?.[0]?.count ?? 0, purchase_order_items: undefined })), total: count ?? 0 });
}

/** Body: { supplier_id, lines: [{ product_id, qty, cost? }], expected_date?, remarks? } */
export async function POST(req: NextRequest) {
  const a = await authorize("purchases.create");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b?.supplier_id) return NextResponse.json({ error: "Choose a supplier." }, { status: 400 });
  const lines = Array.isArray(b.lines) ? b.lines.map((l: Record<string, unknown>) => ({ product_id: l.product_id, qty: Number(l.qty), cost: Number(l.cost) || 0 })) : [];
  const date = /^\d{4}-\d\d-\d\d$/.test(String(b.expected_date ?? "")) ? b.expected_date : null;
  const { data, error } = await db().rpc("create_purchase_order", {
    p_supplier: b.supplier_id, p_lines: lines, p_expected: date, p_remarks: String(b.remarks ?? "").slice(0, 500), p_user: a.user.id,
  });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
