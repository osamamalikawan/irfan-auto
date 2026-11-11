import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { cleanText, isDate, isUuid, todayPk } from "@/lib/field";

type Ctx = { params: Promise<{ id: string }> };

/** A bonus (the shop owes more), a deduction (for absence, a fine...), or an opening balance. Body: { kind: "bonus" | "deduction" | "opening", amount, date?, note? }
 *  Bonus and deduction amounts are positive numbers; an opening balance is positive when the shop owes him and negative when he owes the shop. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await authorize("employees.pay");
  if (a.error) return a.error;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const b = await req.json().catch(() => null);
  const kind = String(b?.kind);
  if (!["bonus", "deduction", "opening"].includes(kind)) return NextResponse.json({ error: "Choose bonus, deduction or opening balance." }, { status: 400 });
  const raw = Math.round(Number(b?.amount) * 100) / 100;
  if (!Number.isFinite(raw) || raw === 0 || Math.abs(raw) > 100_000_000 || (kind !== "opening" && raw < 0)) return NextResponse.json({ error: "Enter an amount above zero." }, { status: 400 });
  const today = todayPk();
  const date = isDate(b?.date) ? b.date : today;
  if (date > today) return NextResponse.json({ error: "The date cannot be in the future." }, { status: 400 });
  const sb = db();
  const e = await sb.from("employees").select("id").eq("id", id).maybeSingle();
  if (!e.data) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const { data, error } = await sb.from("employee_ledger").insert({
    employee_id: id, entry_date: date, type: kind, amount: kind === "deduction" ? -raw : raw, note: cleanText(b?.note, 200), created_by: a.user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
