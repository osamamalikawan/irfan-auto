import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { marketLists } from "@/lib/market-lists";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** Everything the edit screen needs: the order, and each line with the full part information (stock includes what this order holds). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const s = await sb.from("sales").select("id,no,customer_id,customer_name,route_id,sale_kind,pay_term,status,fulfil_status,total,paid,discount,line_discount,bilti,local_charges,remarks").eq("id", id).maybeSingle();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: 500 });
  const mine = await allowedRouteIds(sb, a.user);
  if (!s.data || (mine && !(s.data.route_id && mine.includes(s.data.route_id)))) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (s.data.status !== "confirmed") return NextResponse.json({ error: "A cancelled invoice cannot be edited." }, { status: 400 });
  if (!["active", "packed"].includes(s.data.fulfil_status)) return NextResponse.json({ error: "A delivered or completed order cannot be edited. Use a return or claim instead." }, { status: 400 });

  const items = await sb.from("sale_items").select("id,line_no,product_id,qty,price,disc_pct,market,market_cost,sale_item_allocs(qty)").eq("sale_id", id).order("line_no");
  if (items.error) return NextResponse.json({ error: items.error.message }, { status: 500 });
  const pids = [...new Set((items.data ?? []).map((i: { product_id: string }) => i.product_id))];
  const [prods, racks, stock, mkt, markets] = await Promise.all([
    sb.from("products").select("id,name_en,code_name,name_ur,unit,cp,rp,scheme_buy,scheme_free,brand:brands(name),list:price_lists(name)").in("id", pids),
    sb.from("product_racks").select("product_id,rack:racks(code)").in("product_id", pids),
    sb.rpc("stock_on_hand", { p_products: pids }),
    sb.from("market_purchases").select("product_id,vendor,supplier_id").eq("sale_id", id),
    marketLists(sb),
  ]);
  const err = prods.error ?? racks.error ?? stock.error ?? mkt.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const rackMap = new Map<string, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (racks.data ?? []) as any[]) { const code = one(r.rack)?.code; if (code) rackMap.set(r.product_id, [...(rackMap.get(r.product_id) ?? []), code]); }
  const onHand = new Map<string, number>((stock.data ?? []).map((r: { product_id: string; qty: number }) => [r.product_id, Number(r.qty)]));
  const held = new Map<string, number>();   // stock this order holds now, free again once it is edited (market lines hold none)
  for (const i of (items.data ?? []) as { product_id: string; market: boolean; sale_item_allocs: { qty: number }[] }[]) {
    if (!i.market) held.set(i.product_id, (held.get(i.product_id) ?? 0) + i.sale_item_allocs.reduce((t, x) => t + Number(x.qty), 0));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pmap = new Map<string, any>((prods.data ?? []).map((p: any) => [p.id, p]));
  const mmap = new Map<string, { vendor: string | null; supplier_id: string | null }>((mkt.data ?? []).map((m: { product_id: string; vendor: string | null; supplier_id: string | null }) => [m.product_id, m]));
  const lines = (items.data ?? []).map((i: { id: string; product_id: string; qty: number; price: number; disc_pct: number; market: boolean; market_cost: number | null }) => {
    const p = pmap.get(i.product_id);
    const listName = one(p?.list)?.name ?? null;
    return {
      key: i.id, qty: Number(i.qty), price: Number(i.price), disc_pct: Number(i.disc_pct),
      market: i.market ? { cost: Number(i.market_cost ?? 0), vendor: mmap.get(i.product_id)?.vendor ?? "", supplier_id: mmap.get(i.product_id)?.supplier_id ?? undefined } : null,
      product: {
        id: i.product_id, name_en: p?.name_en ?? "", code_name: p?.code_name ?? null, name_ur: p?.name_ur ?? null, unit: p?.unit ?? "pc", cp: Number(p?.cp ?? 0), rp: Number(p?.rp ?? 0), brand: one(p?.brand)?.name ?? null,
        scheme: p?.scheme_buy && p?.scheme_free ? p.scheme_buy + "+" + p.scheme_free : null, on_hand: (onHand.get(i.product_id) ?? 0) + (held.get(i.product_id) ?? 0),
        racks: rackMap.get(i.product_id) ?? [], list_name: listName, market_list: !!listName && markets.has(listName),
      },
    };
  });
  return NextResponse.json({ sale: s.data, lines });
}
