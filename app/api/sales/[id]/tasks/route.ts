import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { cleanDate } from "@/lib/schedule";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const todayPk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });

/** The scheduled actions (pack, deliver, complete) of one order. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.create", "payments.receive", "sales.status");
  if (a.error) return a.error;
  const { id } = await params;
  const { data, error } = await db().from("sale_tasks").select("id,action,due_date,note,done_at").eq("sale_id", id).order("due_date");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

/** Schedule an order. Body: { action: "pack" | "deliver" | "complete", due_date, note? } */
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await authorize("sales.status");
  if (a.error) return a.error;
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const action = String(b?.action ?? "");
  if (!["pack", "deliver", "complete"].includes(action)) return NextResponse.json({ error: "Choose pack, deliver or complete." }, { status: 400 });
  const date = cleanDate(b?.due_date);
  if (!date) return NextResponse.json({ error: "Choose a date." }, { status: 400 });
  if (date < todayPk()) return NextResponse.json({ error: "Choose today or a later date." }, { status: 400 });
  const sb = db();
  const s = await sb.from("sales").select("id,status,fulfil_status,route_id").eq("id", id).maybeSingle();
  const mine = await allowedRouteIds(sb, a.user);
  if (!s.data || (mine && !(s.data.route_id && mine.includes(s.data.route_id)))) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (s.data.status !== "confirmed") return NextResponse.json({ error: "A cancelled invoice cannot be scheduled." }, { status: 400 });
  if (s.data.fulfil_status === "completed") return NextResponse.json({ error: "This order is already completed." }, { status: 400 });
  const { data, error } = await sb.from("sale_tasks").insert({ sale_id: id, action, due_date: date, note: String(b?.note ?? "").trim().slice(0, 200) || null, created_by: a.user.id }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
