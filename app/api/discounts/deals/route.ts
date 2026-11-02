import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { safeWord } from "@/lib/customer-scope";

export const dynamic = "force-dynamic";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** ?customer=<id>&brand=<id>&q=&offset=&limit=  customer deals: a special discount on a brand for one customer */
export async function GET(req: NextRequest) {
  const a = await authorize("sales.discount", "settings.edit", "customers.edit");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 40, 1), 200);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  let q = db().from("customer_brand_discounts").select("pct,customers!inner(id,code,name,route:routes(name)),brands!inner(id,name,discount_pct)", { count: "exact" })
    .order("pct", { ascending: false }).range(offset, offset + limit - 1);
  if (sp.get("customer")) q = q.eq("customer_id", sp.get("customer")!);
  if (sp.get("brand")) q = q.eq("brand_id", sp.get("brand")!);
  for (const raw of (sp.get("q") ?? "").split(/\s+/)) {
    const w = safeWord(raw);
    if (w) q = q.ilike("customers.name", "%" + w + "%");
  }
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data ?? []).map((d: any) => ({ pct: Number(d.pct), customer: { ...one(d.customers), route: one(one(d.customers)?.route)?.name ?? "" }, brand: { ...one(d.brands), discount_pct: Number(one(d.brands)?.discount_pct ?? 0) } }));
  return NextResponse.json({ items, total: count ?? 0 });
}

/** Body: { customer_id, brand_id, pct }  adds or changes a deal */
export async function POST(req: NextRequest) {
  const a = await authorize("sales.discount", "settings.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const pct = Number(b?.pct);
  if (!b?.customer_id || !b?.brand_id) return NextResponse.json({ error: "Choose a customer and a brand." }, { status: 400 });
  if (!(pct >= 0 && pct <= 100)) return NextResponse.json({ error: "Discount must be between 0 and 100 percent." }, { status: 400 });
  const { error } = await db().from("customer_brand_discounts").upsert({ customer_id: b.customer_id, brand_id: b.brand_id, pct: Math.round(pct * 100) / 100 }, { onConflict: "customer_id,brand_id" });
  if (error) return NextResponse.json({ error: error.code === "23503" ? "Customer or brand not found." : error.message }, { status: error.code === "23503" ? 404 : 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** ?customer=<id>&brand=<id>  removes the deal; the customer then gets the brand's normal discount */
export async function DELETE(req: NextRequest) {
  const a = await authorize("sales.discount", "settings.edit");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  if (!sp.get("customer") || !sp.get("brand")) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { error } = await db().from("customer_brand_discounts").delete().eq("customer_id", sp.get("customer")!).eq("brand_id", sp.get("brand")!);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
