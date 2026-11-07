import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { applyPlacement, ensureLocation, ensureNamed } from "@/lib/placement-db";
import { setProductSuppliers, suppliersOf } from "@/lib/product-suppliers";
import { marketLists } from "@/lib/market-lists";
import type { Placement } from "@/lib/placement";

export const dynamic = "force-dynamic";


const FILTERS = ["all", "low", "out", "norack"];

export async function GET(req: NextRequest) {
  const a = await authorize("stock.view", "sales.create", "orders.request");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const filter = sp.get("filter") ?? "all";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const sb = db();
  const { data, error } = await sb.rpc("inventory_list", {
    p_q: (sp.get("q") ?? "").trim() || null,
    p_list: sp.get("list") || null,
    p_filter: FILTERS.includes(filter) ? filter : "all",
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { total: number }[];
  const market = await marketLists(sb);
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  const sups = await suppliersOf(sb, ids);
  const rps = new Map<string, number>();
  if (ids.length) { const rr = await sb.from("products").select("id,rp").in("id", ids); for (const r of rr.data ?? []) rps.set(r.id, Number(r.rp)); }
  return NextResponse.json({ items: rows.map(({ total, ...r }) => ({ ...r, rp: rps.get((r as { id?: string }).id ?? "") ?? 0, suppliers: sups.get((r as { id?: string }).id ?? "") ?? [], market_list: !!(r as { list_name?: string }).list_name && market.has((r as { list_name: string }).list_name) })), total: rows[0] ? Number(rows[0].total) : 0 });
}

export async function POST(req: NextRequest) {
  const a = await authorize("stock.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name_en ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const sb = db();
  try {
    const [list_id, brand_id, company_id] = await Promise.all([
      ensureNamed(sb, "price_lists", b.list), ensureNamed(sb, "brands", b.brand), ensureNamed(sb, "companies", b.company),
    ]);
    const { data: p, error } = await sb.from("products").insert({
      name_en: name, code_name: b.code_name?.trim() || null, name_ur: b.name_ur?.trim() || null,
      scheme: b.scheme?.trim() || null, cp: Number(b.cp) || 0, rp: Math.max(0, Number(b.rp) || 0), unit: b.unit?.trim() || "pc",
      reorder_level: Number(b.reorder_level) || 0, list_id, brand_id, company_id,
    }).select("id").single();
    if (error) throw new Error(error.message);
    if (Array.isArray(b.supplier_ids)) await setProductSuppliers(sb, p.id, b.supplier_ids);
    const placement: Placement = Array.isArray(b.placement) ? b.placement : [];
    const first = await applyPlacement(sb, p.id, placement);
    const opening = Number(b.opening_stock) || 0;
    if (opening > 0) {
      const loc = first ?? (await ensureLocation(sb, "Main"));
      const r = await sb.rpc("adjust_stock", { p_product: p.id, p_location: loc, p_qty: opening, p_type: "opening", p_note: "Opening stock" });
      if (r.error) throw new Error(r.error.message);
    }
    return NextResponse.json({ id: p.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
