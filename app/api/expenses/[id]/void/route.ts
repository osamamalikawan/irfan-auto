import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Remove a wrongly entered expense. Cash refunds made by a return cannot be removed here. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("accounts.edit");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const e = await sb.from("expenses").select("id,ref_type,voided").eq("id", id).maybeSingle();
  if (!e.data) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  if (e.data.ref_type) return NextResponse.json({ error: "This is a cash refund from a return. It cannot be removed here." }, { status: 400 });
  const { error } = await sb.from("expenses").update({ voided: true }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
