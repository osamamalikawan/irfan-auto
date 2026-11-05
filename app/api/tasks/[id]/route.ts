import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { cleanDate } from "@/lib/schedule";

type Ctx = { params: Promise<{ id: string }> };
const READ = ["sales.create", "sales.status", "payments.receive", "visits.record", "reports.view", "customers.view"] as const;

/** Body: { done?: boolean, title?, due_date?, note? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const a = await authorize(...READ);
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const patch: Record<string, unknown> = {};
  if (typeof b?.done === "boolean") { patch.done_at = b.done ? new Date().toISOString() : null; patch.done_by = b.done ? a.user.id : null; }
  if (typeof b?.title === "string" && b.title.trim()) patch.title = b.title.trim().slice(0, 120);
  if (b?.due_date !== undefined) { const d = cleanDate(b.due_date); if (!d) return NextResponse.json({ error: "Choose a date." }, { status: 400 }); patch.due_date = d; }
  if (b?.note !== undefined) patch.note = String(b.note ?? "").trim().slice(0, 300) || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const { error } = await db().from("tasks").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const a = await authorize(...READ);
  if (a.error) return a.error;
  const { id } = await params;
  const { error } = await db().from("tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
