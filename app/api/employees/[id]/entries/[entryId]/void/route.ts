import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";
import { isUuid } from "@/lib/field";

type Ctx = { params: Promise<{ id: string; entryId: string }> };

/** Cancel a ledger entry (it stays on record). A cancelled salary period is not posted again; a cancelled payment also cancels its cash-book entry. */
export async function POST(_req: Request, { params }: Ctx) {
  const a = await authorize("employees.pay");
  if (a.error) return a.error;
  const { id, entryId } = await params;
  if (!isUuid(id) || !isUuid(entryId)) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  const sb = db();
  const e = await sb.from("employee_ledger").select("id").eq("id", entryId).eq("employee_id", id).maybeSingle();
  if (!e.data) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  const { error } = await sb.rpc("employee_void_entry", { p_entry: entryId });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
