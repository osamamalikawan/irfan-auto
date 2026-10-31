import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

/** Set monthly targets. Body: { kind: "salesman" | "route", id, sales, collection, visits } */
export async function POST(req: NextRequest) {
  const a = await authorize("targets.manage");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b?.id || !["salesman", "route"].includes(b.kind)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const patch = {
    target_sales: Math.max(0, Number(b.sales) || 0), target_collection: Math.max(0, Number(b.collection) || 0), target_visits: Math.max(0, Math.round(Number(b.visits) || 0)),
  };
  const { error } = await db().from(b.kind === "route" ? "routes" : "app_users").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
