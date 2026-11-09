import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { buildPlan, lastVisits } from "@/lib/offline-pack";

export const dynamic = "force-dynamic";

/** The first part of the salesman's offline pack: his customers with what they owe, the payment methods, his visit plan for the next 7 days,
 *  and what was said at each customer's last visit. The phone keeps this and shows it without internet. */
export async function GET() {
  const a = await authorize();
  if (a.error) return a.error;
  if (!a.user.isSalesman) return NextResponse.json({ error: "This is for salesmen." }, { status: 403 });
  const sb = db();
  try {
    const [cs, pm, plan] = await Promise.all([
      sb.rpc("salesman_customers", { p_user: a.user.id }),
      sb.from("payment_methods").select("id,name").eq("active", true).order("name"),
      buildPlan(sb, a.user.id),
    ]);
    if (cs.error) throw new Error(cs.error.message);
    const customers = (cs.data ?? []) as { id: string }[];
    const last = await lastVisits(sb, customers.map((c) => c.id));
    return NextResponse.json({ server_time: new Date().toISOString(), customers, methods: pm.data ?? [], plan, last_visits: last, can: { sale_status: hasPerm(a.user, "sales.status") } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
