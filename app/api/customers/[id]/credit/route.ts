import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Can this customer get a new credit invoice? Same rules create_sale applies: remaining limit and unpaid invoices older than the day limit. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.view", "customers.edit", "sales.create");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const c = await sb.from("customers").select("id,route_id,credit_limit,invoice_days_limit,is_walk_in").eq("id", id).maybeSingle();
  if (c.error) return NextResponse.json({ error: c.error.message }, { status: 500 });
  if (!c.data) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !(c.data.route_id && mine.includes(c.data.route_id))) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const days = Number(c.data.invoice_days_limit);
  const [bal, over] = await Promise.all([
    sb.from("customer_balances").select("balance").eq("customer_id", id).maybeSingle(),
    sb.rpc("customer_overdue", { p_customer: id, p_days: days }),
  ]);
  if (over.error) return NextResponse.json({ error: over.error.message }, { status: 500 });
  const balance = Number(bal.data?.balance ?? 0), limit = Number(c.data.credit_limit);
  return NextResponse.json({
    credit_limit: limit, balance, remaining: limit > 0 ? Math.max(limit - balance, 0) : null,
    invoice_days_limit: days, overdue: c.data.is_walk_in ? 0 : Number(over.data ?? 0),
  });
}
