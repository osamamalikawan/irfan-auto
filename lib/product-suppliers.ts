import type { db } from "./supabase";

type SB = ReturnType<typeof db>;
const UUID = /^[0-9a-f-]{36}$/i;

/** Replaces the suppliers of a product with `ids` (a product can have several). */
export async function setProductSuppliers(sb: SB, productId: string, ids: unknown) {
  const want = [...new Set<string>((Array.isArray(ids) ? (ids as unknown[]) : []).map(String))].filter((x) => UUID.test(x));
  const known = want.length ? await sb.from("suppliers").select("id").in("id", want) : { data: [], error: null };
  if (known.error) throw new Error(known.error.message);
  const del = await sb.from("product_suppliers").delete().eq("product_id", productId);
  if (del.error) throw new Error(del.error.message);
  const rows = (known.data ?? []).map((s: { id: string }) => ({ product_id: productId, supplier_id: s.id }));
  if (rows.length) {
    const ins = await sb.from("product_suppliers").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }
}

/** Supplier names per product id, for screens that list products. */
export async function suppliersOf(sb: SB, productIds: string[]) {
  const out = new Map<string, { id: string; name: string }[]>();
  if (!productIds.length) return out;
  const { data } = await sb.from("product_suppliers").select("product_id,supplier:suppliers(id,name)").in("product_id", productIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const s = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
    if (!s) continue;
    out.set(r.product_id, [...(out.get(r.product_id) ?? []), s].sort((x, y) => x.name.localeCompare(y.name)));
  }
  return out;
}
