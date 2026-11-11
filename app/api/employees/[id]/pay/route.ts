import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { dbError } from "@/lib/sql-error";
import { cleanText, isDate, isUuid, todayPk } from "@/lib/field";

type Ctx = { params: Promise<{ id: string }> };

/** Pay an employee. Body: { kind: "payment" | "advance", amount, date?, method?, note? }. The ledger entry and the cash-book entry
 *  (Expenses > Salaries) are made together. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const a = await authorize("employees.pay");
  if (a.error) return a.error;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  const b = await req.json().catch(() => null);
  const amount = Math.round(Number(b?.amount) * 100) / 100;
  if (!(amount > 0) || amount > 100_000_000) return NextResponse.json({ error: "Enter an amount above zero." }, { status: 400 });
  const today = todayPk();
  const date = isDate(b?.date) ? b.date : today;
  if (date > today) return NextResponse.json({ error: "The date cannot be in the future." }, { status: 400 });
  const { data, error } = await db().rpc("employee_pay", {
    p_employee: id, p_kind: b?.kind === "advance" ? "advance" : "payment", p_amount: amount, p_date: date, p_method: cleanText(b?.method, 30) ?? "Cash", p_note: cleanText(b?.note, 200), p_user: a.user.id,
  });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
