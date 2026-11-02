import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** ?customer=<id>&ids=<product ids>  ->  { history: { [productId]: { days_ago, price, qty, date, no } } }. Parts never sold to this customer are left out. */
export async function GET(req: NextRequest) {
  const a = await authorize("sales.create");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const customer = sp.get("customer");
  const ids = (sp.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
  if (!customer || !ids.length) return NextResponse.json({ history: {} });
  const { data, error } = await db().rpc("customer_product_history", { p_customer: customer, p_products: ids });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const history: Record<string, { days_ago: number; price: number; qty: number; date: string; no: string }> = {};
  for (const r of (data ?? []) as { product_id: string; days_ago: number; price: number; qty: number; sale_date: string; sale_no: string }[]) {
    history[r.product_id] = { days_ago: Number(r.days_ago), price: Number(r.price), qty: Number(r.qty), date: r.sale_date, no: r.sale_no };
  }
  return NextResponse.json({ history });
}
