import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** ?customer=<id>&ids=<product ids, comma separated>  ->  { pct: { [productId]: percent } }  (the discount the invoice will use by default) */
export async function GET(req: NextRequest) {
  const a = await authorize("sales.create");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean).slice(0, 200);
  const customer = sp.get("customer");
  if (!ids.length) return NextResponse.json({ pct: {} });
  const sb = db();
  const prods = await sb.from("products").select("id,brand_id,brand:brands(discount_pct)").in("id", ids);
  if (prods.error) return NextResponse.json({ error: prods.error.message }, { status: 500 });
  const custom = new Map<string, number>();
  if (customer) {
    const d = await sb.from("customer_brand_discounts").select("brand_id,pct").eq("customer_id", customer);
    for (const x of d.data ?? []) custom.set(x.brand_id, Number(x.pct));
  }
  const pct: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (prods.data ?? []) as any[]) {
    const brand = Array.isArray(p.brand) ? p.brand[0] : p.brand;
    pct[p.id] = (p.brand_id && custom.get(p.brand_id)) ?? Number(brand?.discount_pct ?? 0);
  }
  return NextResponse.json({ pct });
}
