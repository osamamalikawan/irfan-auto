import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** What can still be returned from an invoice, per item. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.return");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const s = await sb.from("sales").select("id,no,status,customer_name,route_id,total").eq("id", id).maybeSingle();
  if (!s.data) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !(s.data.route_id && mine.includes(s.data.route_id))) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const items = await sb.from("sale_items").select("id,line_no,name,qty,price,disc_pct").eq("sale_id", id).order("line_no");
  if (items.error) return NextResponse.json({ error: items.error.message }, { status: 500 });
  const ids = (items.data ?? []).map((i: { id: string }) => i.id);
  const done = ids.length ? await sb.from("sale_return_lines").select("sale_item_id,qty").in("sale_item_id", ids) : { data: [] as { sale_item_id: string; qty: number }[], error: null };
  if (done.error) return NextResponse.json({ error: done.error.message }, { status: 500 });
  const back = new Map<string, number>();
  for (const d of done.data ?? []) back.set(d.sale_item_id, (back.get(d.sale_item_id) ?? 0) + Number(d.qty));
  return NextResponse.json({
    sale: s.data,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (items.data ?? []).map((i: any) => ({
      id: i.id, name: i.name, sold: Number(i.qty), returned: back.get(i.id) ?? 0, remaining: Number(i.qty) - (back.get(i.id) ?? 0),
      net_unit: Math.round(Number(i.price) * (1 - Number(i.disc_pct) / 100)),
    })),
  });
}
