import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { REQ_TYPES, isReqType } from "@/lib/requests";
import { isUuid } from "@/lib/field";

type Ctx = { params: Promise<{ type: string; id: string }> };

/** A salesman withdraws his own request, as long as the office has not reviewed it yet. */
export async function POST(_req: Request, { params }: Ctx) {
  const { type, id } = await params;
  if (!isReqType(type) || !isUuid(id)) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const cfg = REQ_TYPES[type];
  const a = await authorize(cfg.perm);
  if (a.error) return a.error;
  const { data, error } = await db().from(cfg.table).update({ status: "cancelled" })
    .eq("id", id).eq("salesman_id", a.user.id).eq("status", "pending").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Only your own pending requests can be cancelled." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
