import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";

type Ctx = { params: Promise<{ id: string }> };

/** Reopen a completed route. Its fuel expense is cancelled. */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("routes.manage");
  if (a.error) return a.error;
  const { id } = await params;
  const { error } = await db().rpc("undo_route", { p_run: id, p_user: a.user.id });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true });
}
