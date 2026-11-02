import type { SupabaseClient } from "@supabase/supabase-js";

/** Names of the price lists marked as market lists (a tiny table, cached for a few seconds). */
let cache: { at: number; names: Set<string> } | null = null;

export async function marketLists(sb: SupabaseClient) {
  if (cache && Date.now() - cache.at < 10_000) return cache.names;
  const { data } = await sb.from("price_lists").select("name").eq("is_market", true);
  cache = { at: Date.now(), names: new Set((data ?? []).map((l: { name: string }) => l.name)) };
  return cache.names;
}
export function forgetMarketLists() { cache = null; }
