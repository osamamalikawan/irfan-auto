import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { applyPlacement, ensureNamed } from "@/lib/placement-db";
import type { Placement } from "@/lib/placement";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const sb = db();
  const [prod, levels, pls, prs, moves] = await Promise.all([
    sb.from("products").select("*, brand:brands(name), company:companies(name), list:price_lists(name)").eq("id", id).maybeSingle(),
    sb.from("stock_levels").select("location_id, qty").eq("product_id", id),
    sb.from("product_locations").select("location:locations(id,name)").eq("product_id", id),
    sb.from("product_racks").select("rack:racks(code, location_id)").eq("product_id", id),
    sb.from("stock_movements").select("id, qty, type, note, created_at, location:locations(name)").eq("product_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const err = prod.error ?? levels.error ?? pls.error ?? prs.error ?? moves.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  if (!prod.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const byLoc = new Map<string, { id: string; name: string; qty: number; racks: string[] }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (pls.data ?? []) as any[]) if (r.location) byLoc.set(r.location.id, { ...r.location, qty: 0, racks: [] });
  const qtyOf = new Map<string, number>((levels.data ?? []).map((l): [string, number] => [l.location_id as string, Number(l.qty)]));
  for (const [lid, q] of qtyOf) {
    if (!byLoc.has(lid)) {
      const n = await sb.from("locations").select("name").eq("id", lid).single();
      byLoc.set(lid, { id: lid, name: n.data?.name ?? "?", qty: 0, racks: [] });
    }
    byLoc.get(lid)!.qty = q;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (prs.data ?? []) as any[]) if (r.rack) byLoc.get(r.rack.location_id)?.racks.push(r.rack.code);
  const locations = [...byLoc.values()].map((l) => ({ ...l, racks: l.racks.sort() })).sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({
    product: prod.data, locations,
    onHand: locations.reduce((s, l) => s + l.qty, 0),
    movements: moves.data,
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const sb = db();
  try {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.name_en !== undefined) {
      if (!String(b.name_en).trim()) throw new Error("Name is required");
      patch.name_en = String(b.name_en).trim();
    }
    for (const k of ["code_name", "name_ur", "scheme", "unit"] as const) if (b[k] !== undefined) patch[k] = String(b[k]).trim() || (k === "unit" ? "pc" : null);
    if (b.cp !== undefined) patch.cp = Number(b.cp) || 0;
    if (b.reorder_level !== undefined) patch.reorder_level = Number(b.reorder_level) || 0;
    if (b.list !== undefined) patch.list_id = await ensureNamed(sb, "price_lists", b.list);
    if (b.brand !== undefined) patch.brand_id = await ensureNamed(sb, "brands", b.brand);
    if (b.company !== undefined) patch.company_id = await ensureNamed(sb, "companies", b.company);
    const { error } = await sb.from("products").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    if (Array.isArray(b.placement)) await applyPlacement(sb, id, b.placement as Placement);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
