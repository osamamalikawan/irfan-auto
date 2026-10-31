import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("purchases.create", "purchases.cancel", "suppliers.view");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const [p, items, pays] = await Promise.all([
    sb.from("purchases").select("*,supplier:suppliers(id,code,name,phone),location:locations(name)").eq("id", id).maybeSingle(),
    sb.from("purchase_items").select("id,line_no,name,qty,free,cost,disc_pct,line_disc").eq("purchase_id", id).order("line_no"),
    sb.from("supplier_payments").select("id,no,amount,method,ref_no,reversed").eq("purchase_id", id),
  ]);
  const err = p.error ?? items.error ?? pays.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  if (!p.data) return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  return NextResponse.json({
    purchase: { ...p.data, supplier: undefined, location: undefined }, supplier: one(p.data.supplier), location: one(p.data.location)?.name ?? "",
    items: items.data ?? [], payments: pays.data ?? [],
  });
}
