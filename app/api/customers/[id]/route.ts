import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";

type Ctx = { params: Promise<{ id: string }> };
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.view", "customers.edit", "sales.create");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const [c, rem, hist] = await Promise.all([
    sb.from("customers").select("*,area:areas(id,name,city:cities(id,name)),route:routes(id,name,code,visit_days,salesman:app_users(id,name))").eq("id", id).maybeSingle(),
    sb.from("customer_remarks").select("id,text,by_name,created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    sb.from("customer_route_history").select("id,from_date,to_date,route:routes(name)").eq("customer_id", id).order("from_date", { ascending: false }).order("id").limit(30),
  ]);
  const err = c.error ?? rem.error ?? hist.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  if (!c.data) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !(c.data.route_id && mine.includes(c.data.route_id))) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const bal = await sb.from("customer_balances").select("balance").eq("customer_id", id).maybeSingle();
  const route = one(c.data.route) as (Record<string, unknown> & { salesman?: unknown }) | null;
  return NextResponse.json({
    customer: { ...c.data, balance: Number(bal.data?.balance ?? 0), area: one(c.data.area), route: route ? { ...route, salesman: one(route.salesman) } : null },
    remarks: rem.data,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    history: (hist.data ?? []).map((h: any) => ({ id: h.id, from_date: h.from_date, to_date: h.to_date, route_name: one(h.route)?.name ?? "(deleted route)" })),
  });
}

const TEXT = ["name_ur", "owner", "phone", "phone2", "address", "cnic", "ntn", "email", "gps"] as const;

/** Edit details, or archive / restore with { status }. The route changes through /api/customers/reassign. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const sb = db();
  const { data: cur } = await sb.from("customers").select("id,is_walk_in").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) {
    const name = String(b.name).trim().replace(/\s+/g, " ");
    if (!name) return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    patch.name = name;
  }
  for (const k of TEXT) if (b[k] !== undefined) patch[k] = String(b[k]).trim() || null;
  if (b.credit_limit !== undefined) patch.credit_limit = Math.max(0, Number(b.credit_limit) || 0);
  if (b.credit_days !== undefined) patch.credit_days = Math.max(0, Math.round(Number(b.credit_days) || 0));
  if (b.area_id !== undefined) patch.area_id = b.area_id || null;
  if (b.status !== undefined) {
    if (!["active", "archived"].includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
    if (cur.is_walk_in && b.status === "archived") return NextResponse.json({ error: "The walk-in customer cannot be archived." }, { status: 400 });
    patch.status = b.status;
  }
  const { error } = await sb.from("customers").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
