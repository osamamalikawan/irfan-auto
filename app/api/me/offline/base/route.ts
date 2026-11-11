import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { buildPlan, lastVisits } from "@/lib/offline-pack";
import { myEmployeeLedger } from "@/lib/employees";
import { addDays } from "@/lib/schedule";
import { todayPk } from "@/lib/field";

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
    // his salary ledger of the last 4 months, so "My ledger" opens without internet (null if he has no employee record or the employees update is not installed yet)
    const today = todayPk();
    const my_ledger = await myEmployeeLedger(sb, a.user.id, today, addDays(today, -120), null).catch(() => null);
    return NextResponse.json({ server_time: new Date().toISOString(), customers, methods: pm.data ?? [], plan, last_visits: last, my_ledger, can: { sale_status: hasPerm(a.user, "sales.status") } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
