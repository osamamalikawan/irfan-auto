import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { isUuid } from "@/lib/field";

type Ctx = { params: Promise<{ id: string }> };

/** Cancel a wrong handover entry (it stays on record, marked voided, and the salesman's balance goes back up). */
export async function POST(_req: Request, { params }: Ctx) {
  const a = await authorize("accounts.edit");
  if (a.error) return a.error;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  const { data, error } = await db().from("cash_handovers").update({ voided: true }).eq("id", id).eq("voided", false).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Entry not found or already cancelled." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
