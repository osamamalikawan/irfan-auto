import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { ensureNamed } from "@/lib/placement-db";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

/** Change many products at once.
 *  Body: { ids: string[], company?: string, brand?: string, supplier_ids?: string[], supplier_mode?: "add" | "replace" | "remove" }
 *  A field that is left out is not touched. company / brand: a name (created when new); "" clears it.
 *  supplier_mode: add (default) links the suppliers, replace keeps only them, remove unlinks them. */
export async function POST(req: NextRequest) {
  const a = await authorize("stock.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const ids: string[] = (Array.isArray(b?.ids) ? b.ids : []).map(String).filter((x: string) => UUID.test(x));
  if (!ids.length) return NextResponse.json({ error: "Choose at least one product." }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: "Change at most 500 products at a time." }, { status: 400 });
  const mode = ["add", "replace", "remove"].includes(b?.supplier_mode) ? b.supplier_mode : "add";
  const sups: string[] = b?.supplier_ids === undefined ? [] : [...new Set((Array.isArray(b.supplier_ids) ? b.supplier_ids : []).map(String))].filter((x) => UUID.test(x));
  const touchSuppliers = b?.supplier_ids !== undefined && (sups.length > 0 || mode === "replace");
  if (b?.company === undefined && b?.brand === undefined && !touchSuppliers) return NextResponse.json({ error: "Choose what to change." }, { status: 400 });
  const sb = db();
  try {
    const patch: Record<string, unknown> = {};
    if (b.company !== undefined) patch.company_id = await ensureNamed(sb, "companies", String(b.company));
    if (b.brand !== undefined) patch.brand_id = await ensureNamed(sb, "brands", String(b.brand));
    if (Object.keys(patch).length) {
      const { error } = await sb.from("products").update({ ...patch, updated_at: new Date().toISOString() }).in("id", ids);
      if (error) throw new Error(error.message);
    }
    if (touchSuppliers) {
      if (sups.length) {
        const known = await sb.from("suppliers").select("id").in("id", sups);
        if (known.error) throw new Error(known.error.message);
        if ((known.data ?? []).length !== sups.length) throw new Error("A chosen supplier was not found.");
      }
      if (mode === "replace") {
        const d = await sb.from("product_suppliers").delete().in("product_id", ids);
        if (d.error) throw new Error(d.error.message);
      } else if (mode === "remove") {
        const d = await sb.from("product_suppliers").delete().in("product_id", ids).in("supplier_id", sups);
        if (d.error) throw new Error(d.error.message);
      }
      if (mode !== "remove" && sups.length) {
        const rows = ids.flatMap((product_id) => sups.map((supplier_id) => ({ product_id, supplier_id })));
        const i = await sb.from("product_suppliers").upsert(rows, { onConflict: "product_id,supplier_id", ignoreDuplicates: true });
        if (i.error) throw new Error(i.error.message);
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, changed: ids.length });
}
