import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";

type Ctx = { params: Promise<{ id: string }> };

/** Takes the goods back out of stock and reverses the supplier's account. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("purchases.cancel");
  if (a.error) return a.error;
  const { id } = await params;
  const { error } = await db().rpc("cancel_purchase", { p_id: id, p_user: a.user.id });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
