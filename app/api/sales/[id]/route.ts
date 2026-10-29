import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.create", "payments.receive");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const s = await sb.from("sales").select("*,customer:customers(id,code,name,name_ur,phone,address,is_walk_in,area:areas(name,city:cities(name)),route:routes(name))").eq("id", id).maybeSingle();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 });
  if (!s.data) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !(s.data.route_id && mine.includes(s.data.route_id))) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const items = await sb.from("sale_items").select("id,line_no,product_id,name,qty,free,price,disc_pct,line_disc,sale_item_allocs(qty,location:locations(id,name))").eq("sale_id", id).order("line_no");
  if (items.error) return NextResponse.json({ error: items.error.message }, { status: 500 });
  const pids = [...new Set((items.data ?? []).map((i: { product_id: string }) => i.product_id))];
  const none = { data: [] as unknown[], error: null };
  const [racks, prods, before] = await Promise.all([
    pids.length ? sb.from("product_racks").select("product_id,rack:racks(code,location_id)").in("product_id", pids) : Promise.resolve(none),
    pids.length ? sb.from("products").select("id,code_name,name_ur,unit").in("id", pids) : Promise.resolve(none),
    // previous balance = every ledger entry made before this invoice (entries of one transaction share one timestamp)
    sb.from("customer_ledger").select("amount").eq("customer_id", s.data.customer_id).lt("ts", s.data.created_at),
  ]);
  const prevBal = (before.data ?? []).reduce((x: number, e: { amount: number }) => x + Number(e.amount), 0);

  const rackMap = new Map<string, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (racks.data ?? []) as any[]) { const k = r.product_id + "|" + one(r.rack)?.location_id; rackMap.set(k, [...(rackMap.get(k) ?? []), one(r.rack)?.code]); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pmap = new Map(((prods.data ?? []) as any[]).map((p) => [p.id, p]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = (items.data ?? []).map((i: any) => ({
    ...i, sale_item_allocs: undefined, code_name: pmap.get(i.product_id)?.code_name ?? null, name_ur: pmap.get(i.product_id)?.name_ur ?? null, unit: pmap.get(i.product_id)?.unit ?? "pc",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allocs: (i.sale_item_allocs ?? []).map((al: any) => { const loc = one(al.location); return { qty: Number(al.qty), location: loc?.name ?? "?", racks: (rackMap.get(i.product_id + "|" + loc?.id) ?? []).sort() }; }),
  }));
  const cust = one(s.data.customer) as Record<string, unknown> | null;
  return NextResponse.json({
    sale: { ...s.data, customer: undefined }, customer: cust ? { ...cust, area: one(cust.area as never), route: one(cust.route as never) } : null,
    items: lines, prev_balance: prevBal, final_balance: prevBal + (s.data.status === "confirmed" ? Number(s.data.total) - Number(s.data.paid) : 0),
  });
}
