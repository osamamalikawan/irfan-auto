import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { REQ_TYPES, isReqType } from "@/lib/requests";
import { cleanText, isUuid } from "@/lib/field";

type Ctx = { params: Promise<{ type: string; id: string }> };

/** Office rejects a pending request. Body: { note } (the reason the salesman will see). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { type, id } = await params;
  if (!isReqType(type) || !isUuid(id)) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  const a = await authorize("requests.approve");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const note = cleanText(b?.note, 300);
  if (!note) return NextResponse.json({ error: "Write the reason, so the salesman knows what to fix." }, { status: 400 });
  const { data, error } = await db().from(REQ_TYPES[type].table)
    .update({ status: "rejected", reviewed_by: a.user.id, reviewed_at: new Date().toISOString(), review_note: note })
    .eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This request was already reviewed or does not exist." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
