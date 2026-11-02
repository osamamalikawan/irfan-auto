import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** ?from=&to=  goods bought from the market for invoices, with the margin on each */
export async function GET(req: NextRequest) {
  const a = await authorize("stock.manage", "accounts.edit", "reports.view", "sales.create");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  let q = db().from("market_purchases").select("id,no,purchase_date,qty,cost,total,vendor,sale_id,sale_no,sale_amount,created_at,product:products(id,name_en,name_ur)")
    .order("created_at", { ascending: false }).limit(500);
  if (a.user.ownOnly) q = q.eq("created_by", a.user.id);
  if (sp.get("from")) q = q.gte("purchase_date", sp.get("from")!);
  if (sp.get("to")) q = q.lte("purchase_date", sp.get("to")!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ items: (data ?? []).map((m: any) => ({ ...m, product: one(m.product), qty: Number(m.qty), cost: Number(m.cost), total: Number(m.total), sale_amount: Number(m.sale_amount), margin: Number(m.sale_amount) - Number(m.total) })) });
}
