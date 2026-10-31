import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { computePerformance } from "@/lib/performance";

export const dynamic = "force-dynamic";

/** ?range=today|week|month|custom&from=&to=&group=salesman|route|area */
export async function GET(req: NextRequest) {
  const a = await authorize("reports.view", "targets.manage");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  try {
    const p = await computePerformance(db(), a.user, { range: sp.get("range") ?? "month", from: sp.get("from"), to: sp.get("to"), group: sp.get("group") ?? "salesman" });
    return NextResponse.json(p);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
