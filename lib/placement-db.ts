import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LOCATION, type Placement } from "./placement";

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function ensureNamed(sb: SupabaseClient, table: "companies" | "brands" | "price_lists", name?: string | null) {
  const n = (name ?? "").trim();
  if (!n) return null;
  const row = must(await sb.from(table).upsert({ name: n }, { onConflict: "name" }).select("id").single());
  return (row as { id: string }).id;
}

export async function ensureLocation(sb: SupabaseClient, name: string) {
  const row = must(await sb.from("locations").upsert({ name: name.trim() }, { onConflict: "name" }).select("id").single());
  return (row as { id: string }).id;
}

/** Replaces where a product lives: its locations and racks. Creates missing locations/racks. */
export async function applyPlacement(sb: SupabaseClient, productId: string, placement: Placement) {
  must(await sb.from("product_locations").delete().eq("product_id", productId));
  must(await sb.from("product_racks").delete().eq("product_id", productId));
  let first: string | null = null;
  for (const { location, racks } of placement) {
    if (!location.trim()) continue;
    const locId = await ensureLocation(sb, location);
    first ??= locId;
    must(await sb.from("product_locations").upsert({ product_id: productId, location_id: locId }, { onConflict: "product_id,location_id" }));
    if (racks.length) {
      const rows = must(
        await sb.from("racks").upsert(racks.map((code) => ({ location_id: locId, code })), { onConflict: "location_id,code" }).select("id")
      ) as { id: string }[];
      must(await sb.from("product_racks").upsert(rows.map((r) => ({ product_id: productId, rack_id: r.id })), { onConflict: "product_id,rack_id" }));
    }
  }
  must(await sb.from("products").update({ default_location_id: first }).eq("id", productId));
  return first;
}

export { DEFAULT_LOCATION };
