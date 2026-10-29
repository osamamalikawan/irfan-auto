import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/expense";

export const dynamic = "force-dynamic";

/** ?from=&to=&category= */
export async function GET(req: NextRequest) {
  const a = await authorize("accounts.edit", "reports.view");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  let q = db().from("expenses").select("id,no,expense_date,amount,category,note,ref_type,created_at,route:routes(name)")
    .eq("voided", false).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (sp.get("from")) q = q.gte("expense_date", sp.get("from")!);
  if (sp.get("to")) q = q.lte("expense_date", sp.get("to")!);
  if (sp.get("category")) q = q.eq("category", sp.get("category")!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ items: (data ?? []).map((e: any) => ({ ...e, route: (Array.isArray(e.route) ? e.route[0] : e.route)?.name ?? "" })) });
}

/** Body: { amount, category, note?, date? } */
export async function POST(req: NextRequest) {
  const a = await authorize("accounts.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const amount = Math.round(Number(b?.amount) || 0);
  if (!(amount > 0)) return NextResponse.json({ error: "Enter an amount above zero." }, { status: 400 });
  const category = EXPENSE_CATEGORIES.includes(b?.category) ? b.category : "Other";
  const date = /^\d{4}-\d\d-\d\d$/.test(String(b?.date ?? "")) ? b.date : undefined;
  const { data, error } = await db().from("expenses").insert({
    amount, category, note: String(b?.note ?? "").trim().slice(0, 300) || null, ...(date ? { expense_date: date } : {}), created_by: a.user.id,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
