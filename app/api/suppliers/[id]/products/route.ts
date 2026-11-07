import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

/** Products linked to this supplier, with stock and last purchase price. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("suppliers.view", "suppliers.edit", "purchases.create");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const links = await sb.from("product_suppliers").select("product_id").eq("supplier_id", id).limit(20000);
  if (links.error) return NextResponse.json({ error: links.error.message }, { status: 500 });
  const ids = (links.data ?? []).map((l: { product_id: string }) => l.product_id);
  if (!ids.length) return NextResponse.json({ items: [] });
  const items: unknown[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const [p, lv] = await Promise.all([
      sb.from("products").select("id,name_en,name_ur,code_name,unit,cp,purchase_price,reorder_level,active,brand:brands(name),company:companies(name),list:price_lists(name,visible)").in("id", part),
      sb.from("stock_levels").select("product_id,qty").in("product_id", part),
    ]);
    if (p.error ?? lv.error) return NextResponse.json({ error: (p.error ?? lv.error)!.message }, { status: 500 });
    const stock = new Map<string, number>();
    for (const r of lv.data ?? []) stock.set(r.product_id, (stock.get(r.product_id) ?? 0) + Number(r.qty));
    const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (p.data ?? []) as any[]) {
      items.push({ id: r.id, name_en: r.name_en, name_ur: r.name_ur, code_name: r.code_name, unit: r.unit, cp: Number(r.cp), purchase_price: Number(r.purchase_price),
        reorder_level: Number(r.reorder_level), active: r.active, brand: one(r.brand)?.name ?? null, company: one(r.company)?.name ?? null,
        list: one(r.list)?.name ?? null, on_hand: stock.get(r.id) ?? 0 });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (items as any[]).sort((x, y) => x.name_en.localeCompare(y.name_en));
  return NextResponse.json({ items });
}

/** Link a product to this supplier. Body: { product_id } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await authorize("suppliers.edit", "stock.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!UUID.test(String(b?.product_id ?? ""))) return NextResponse.json({ error: "Choose a product." }, { status: 400 });
  const { error } = await db().from("product_suppliers").upsert({ product_id: b.product_id, supplier_id: id }, { onConflict: "product_id,supplier_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Unlink a product: ?product_id= */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const a = await authorize("suppliers.edit", "stock.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const pid = req.nextUrl.searchParams.get("product_id") ?? "";
  if (!UUID.test(pid)) return NextResponse.json({ error: "Choose a product." }, { status: 400 });
  const { error } = await db().from("product_suppliers").delete().eq("supplier_id", id).eq("product_id", pid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
