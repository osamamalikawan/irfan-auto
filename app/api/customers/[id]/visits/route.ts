import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** The last visit responses recorded for a customer. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.view", "customers.edit", "sales.create", "visits.record");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const c = await sb.from("customers").select("route_id").eq("id", id).maybeSingle();
  if (!c.data) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !(c.data.route_id && mine.includes(c.data.route_id))) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const { data, error } = await sb.from("visits").select("id,visit_date,outcome,notes,promise_date,promise_amount,by:app_users(name),route:routes(name)").eq("customer_id", id)
    .order("visit_date", { ascending: false }).order("created_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ visits: (data ?? []).map((v: any) => ({ ...v, by: one(v.by)?.name ?? "", route: one(v.route)?.name ?? "" })) });
}
