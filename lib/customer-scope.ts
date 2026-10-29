import type { db } from "./supabase";
import type { SessionUser } from "./permissions";

type SB = ReturnType<typeof db>;

/** Route ids a restricted ("own customers only") user may see, or null when the user sees everything. */
export async function allowedRouteIds(sb: SB, user: SessionUser): Promise<string[] | null> {
  if (!user.ownOnly) return null;
  const { data } = await sb.from("routes").select("id").eq("salesman_id", user.id);
  return (data ?? []).map((r: { id: string }) => r.id);
}

/** Strips characters that would break a PostgREST filter string. */
export const safeWord = (w: string) => w.replace(/[,()*%\\"]/g, " ").trim();
