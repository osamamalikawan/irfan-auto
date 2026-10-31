import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { pad4 } from "@/lib/expense";

export const dynamic = "force-dynamic";
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** ?from=&to=&type=received|paid  Received = customer payments, Paid = expenses. */
export async function GET(req: NextRequest) {
  const a = await authorize("payments.receive", "accounts.edit", "reports.view", "suppliers.pay");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  const out: { key: string; no: string; type: "received" | "paid"; date: string; ts: string; party: string; amount: number; reversed: boolean; details: string }[] = [];

  if (!type || type === "received") {
    let q = sb.from("payments").select("id,no,pay_date,amount,kind,reversed,created_at,customer:customers(name),sale:sales(no)").order("created_at", { ascending: false }).limit(500);
    if (mine) q = q.in("route_id", mine);
    if (sp.get("from")) q = q.gte("pay_date", sp.get("from")!);
    if (sp.get("to")) q = q.lte("pay_date", sp.get("to")!);
    const r = await q;
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (r.data ?? []) as any[]) {
      const sale = one(p.sale);
      out.push({ key: "pay/" + p.id, no: "RV-" + pad4(p.no), type: "received", date: p.pay_date, ts: p.created_at, party: one(p.customer)?.name ?? "", amount: Number(p.amount), reversed: !!p.reversed, details: sale ? "Received with " + sale.no : "Payment received" });
    }
  }
  if ((!type || type === "paid") && !mine) {
    let q = sb.from("expenses").select("id,no,expense_date,amount,category,note,created_at").eq("voided", false).order("created_at", { ascending: false }).limit(500);
    if (sp.get("from")) q = q.gte("expense_date", sp.get("from")!);
    if (sp.get("to")) q = q.lte("expense_date", sp.get("to")!);
    const r = await q;
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (r.data ?? []) as any[]) out.push({ key: "exp/" + e.id, no: "PV-" + pad4(e.no), type: "paid", date: e.expense_date, ts: e.created_at, party: e.category, amount: Number(e.amount), reversed: false, details: e.note ?? "" });
  }
  if ((!type || type === "paid") && !mine) {
    let q = sb.from("supplier_payments").select("id,no,pay_date,amount,method,reversed,created_at,supplier:suppliers(name),purchase:purchases(no)").order("created_at", { ascending: false }).limit(500);
    if (sp.get("from")) q = q.gte("pay_date", sp.get("from")!);
    if (sp.get("to")) q = q.lte("pay_date", sp.get("to")!);
    const r = await q;
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (r.data ?? []) as any[]) out.push({ key: "sup/" + p.id, no: "SP-" + pad4(p.no), type: "paid", date: p.pay_date, ts: p.created_at, party: one(p.supplier)?.name ?? "", amount: Number(p.amount), reversed: !!p.reversed, details: "Supplier payment (" + p.method + ")" + (one(p.purchase) ? " with " + one(p.purchase)!.no : "") });
  }
  out.sort((x, y) => y.ts.localeCompare(x.ts));
  return NextResponse.json({ items: out });
}
