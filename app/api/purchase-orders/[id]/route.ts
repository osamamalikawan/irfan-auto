import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("purchases.create", "purchases.cancel", "suppliers.view", "suppliers.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const [po, items] = await Promise.all([
    sb.from("purchase_orders").select("*,supplier:suppliers(code,phone,phone2,address,city)").eq("id", id).maybeSingle(),
    sb.from("purchase_order_items").select("id,line_no,product_id,name,unit,qty,cost").eq("po_id", id).order("line_no"),
  ]);
  if (po.error ?? items.error) return NextResponse.json({ error: (po.error ?? items.error)!.message }, { status: 500 });
  if (!po.data) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
  const s = Array.isArray(po.data.supplier) ? po.data.supplier[0] : po.data.supplier;
  return NextResponse.json({ order: { ...po.data, supplier: s ?? null }, items: items.data ?? [] });
}

/** Change the status. Body: { status: "open" | "received" | "cancelled" } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("purchases.create", "purchases.cancel");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!["open", "received", "cancelled"].includes(b?.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
  const { error } = await db().from("purchase_orders").update({ status: b.status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
