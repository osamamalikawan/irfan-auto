import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Body: { pct }  the discount every invoice gives on this brand unless the customer has a special deal. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.discount", "settings.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const pct = Number(b?.pct);
  if (!(pct >= 0 && pct <= 100)) return NextResponse.json({ error: "Discount must be between 0 and 100 percent." }, { status: 400 });
  const { error } = await db().from("brands").update({ discount_pct: Math.round(pct * 100) / 100 }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
