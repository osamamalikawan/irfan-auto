import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";

type Ctx = { params: Promise<{ id: string }> };

/** Puts the stock back and reverses the invoice and its payments in the customer's ledger. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.cancel");
  if (a.error) return a.error;
  const { id } = await params;
  const { error } = await db().rpc("cancel_sale", { p_sale: id, p_user: a.user.id });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
