import type { db } from "./supabase";

type SB = ReturnType<typeof db>;

/** How many other active users hold a role with the "*" permission. */
export async function otherActiveAdmins(sb: SB, excludeUserId: string | null) {
  const { data: roles } = await sb.from("roles").select("id").contains("perms", ["*"]);
  const ids = (roles ?? []).map((r: { id: string }) => r.id);
  if (!ids.length) return { ids, count: 0 };
  let q = sb.from("app_users").select("id", { count: "exact", head: true }).eq("active", true).in("role_id", ids);
  if (excludeUserId) q = q.neq("id", excludeUserId);
  const { count } = await q;
  return { ids, count: count ?? 0 };
}
