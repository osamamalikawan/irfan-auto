import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { computePerformance } from "@/lib/performance";
import { rangeOf } from "@/lib/targets";
import { cashAccount, myCustomers, pendingCounts } from "@/lib/salesman-account";
import { todayPk } from "@/lib/field";

export const dynamic = "force-dynamic";

/** The signed-in salesman's own account. ?range=today|week|month|custom&from=&to=  (default: this month)
 *  performance: sales, collections and visits against his targets (the same figures the office sees on the Team screen)
 *  cash: what he collected, what he handed to the office, what is still with him, and the statement
 *  receivable: what his customers owe in total; pending: his requests waiting for approval */
export async function GET(req: NextRequest) {
  const a = await authorize();
  if (a.error) return a.error;
  if (!a.user.isSalesman) return NextResponse.json({ error: "This page is for salesmen." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const [from, to] = rangeOf(sp.get("range") ?? "month", sp.get("from"), sp.get("to"), todayPk());
  const sb = db();
  try {
    const [perf, cash, pending, customers] = await Promise.all([
      computePerformance(sb, a.user, { range: "custom", from, to, group: "salesman" }),
      cashAccount(sb, a.user.id, from, to),
      pendingCounts(sb, a.user.id),
      myCustomers(sb, a.user.id),
    ]);
    const me = perf.rows.find((r) => r.id === a.user.id) ?? null;
    const owing = customers.filter((c) => c.balance > 0);
    return NextResponse.json({
      from, to, days: perf.days, thresholds: perf.thresholds,
      performance: me ? { sales: me.sales, collection: me.collection, visits: me.visits } : null,
      cash, pending,
      receivable: { total: owing.reduce((s, c) => s + c.balance, 0), customers: owing.length },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
