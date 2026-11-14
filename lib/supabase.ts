import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only database client. Never import this from a "use client" file.
 * Same .from() / .rpc() calls as supabase-js, so no other file changes.
 *  - Desktop server: APO_POSTGREST_URL=http://127.0.0.1:3001 (local PostgREST, bound to loopback only)
 *  - Cloud Supabase (old setup): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
/** Typed as SupabaseClient so the existing helper signatures keep compiling; only .from() and .rpc() are ever used (checked: no auth/storage/realtime calls). */
export function db(): SupabaseClient {
  const local = process.env.APO_POSTGREST_URL;
  if (local) return new PostgrestClient(local) as unknown as SupabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set APO_POSTGREST_URL (desktop server) or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  return new PostgrestClient(url.replace(/\/+$/, "") + "/rest/v1", { headers: { apikey: key, Authorization: "Bearer " + key } }) as unknown as SupabaseClient;
}
