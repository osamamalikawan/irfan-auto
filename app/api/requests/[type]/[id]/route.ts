import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { REQ_TYPES, isReqType } from "@/lib/requests";
import { isUuid } from "@/lib/field";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ type: string; id: string }> };

/** One request with its lines. A salesman can only open his own. */
export async function GET(_req: Request, { params }: Ctx) {
  const { type, id } = await params;
  if (!isReqType(type) || !isUuid(id)) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const cfg = REQ_TYPES[type];
  const a = await authorize(cfg.perm, "requests.approve");
  if (a.error) return a.error;
  let q = db().from(cfg.table).select(cfg.select).eq("id", id);
  if (!hasPerm(a.user, "requests.approve")) q = q.eq("salesman_id", a.user.id);
  const { data, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  return NextResponse.json({ request: data });
}
