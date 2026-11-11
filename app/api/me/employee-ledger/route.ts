import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { myEmployeeLedger } from "@/lib/employees";
import { isDate, todayPk } from "@/lib/field";
import { addDays } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** The signed-in person's own salary ledger. ?range=month|3m|year|all (default month), or ?from=&to=.
 *  { employee: null } when his login has no employee record. */
export async function GET(req: NextRequest) {
  const a = await authorize();
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const today = todayPk();
  let from: string | null = null, to: string | null = null;
  if (isDate(sp.get("from"))) { from = sp.get("from"); to = isDate(sp.get("to")) ? sp.get("to") : null; }
  else {
    const range = sp.get("range") ?? "month";
    if (range === "month") from = today.slice(0, 7) + "-01";
    else if (range === "3m") from = addDays(today, -89);
    else if (range === "year") from = addDays(today, -364);
  }
  try {
    const r = await myEmployeeLedger(db(), a.user.id, today, from, to);
    return NextResponse.json(r ?? { employee: null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
