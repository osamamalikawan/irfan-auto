import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";

export const dynamic = "force-dynamic";
const READERS = ["sales.create", "stock.view", "stock.transfer"];
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** ?from=&to=&status=pending|printed|all  confirmed invoices that need (or have had) a dispatch voucher */
export async function GET(req: NextRequest) {
  const a = await authorize(...READERS);
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !mine.length) return NextResponse.json({ items: [] });
  let q = sb.from("sales").select("id,no,sale_date,customer_id,customer_name,dispatch_count,dispatch_last,sale_items(qty,free),customer:customers(area:areas(name,city:cities(name)))")
    .eq("status", "confirmed").order("created_at", { ascending: false }).limit(200);
  if (mine) q = q.in("route_id", mine);
  if (sp.get("from")) q = q.gte("sale_date", sp.get("from")!);
  if (sp.get("to")) q = q.lte("sale_date", sp.get("to")!);
  const st = sp.get("status") ?? "pending";
  if (st === "pending") q = q.eq("dispatch_count", 0);
  if (st === "printed") q = q.gt("dispatch_count", 0);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data ?? []).map((s: any) => {
    const area = one(one(s.customer)?.area) as { name: string; city: { name: string } | null } | null;
    const its = (s.sale_items ?? []) as { qty: number; free: number }[];
    return {
      id: s.id, no: s.no, sale_date: s.sale_date, customer_id: s.customer_id, customer_name: s.customer_name, dispatch_count: s.dispatch_count,
      place: area ? [one(area.city)?.name, area.name].filter(Boolean).join(" › ") : "", items: its.length, pieces: its.reduce((x, i) => x + Number(i.qty) + Number(i.free), 0),
    };
  });
  return NextResponse.json({ items });
}
