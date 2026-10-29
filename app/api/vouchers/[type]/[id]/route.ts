import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { pad4 } from "@/lib/expense";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ type: string; id: string }> };
const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

/** One voucher for printing. type = "pay" (received) or "exp" (paid). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const a = await authorize("payments.receive", "accounts.edit", "reports.view");
  if (a.error) return a.error;
  const { type, id } = await params;
  const sb = db();
  if (type === "pay") {
    const p = await sb.from("payments").select("id,no,pay_date,amount,kind,reversed,created_at,route_id,customer_id,customer:customers(code,name),sale:sales(no),by:app_users!payments_created_by_fkey(name)").eq("id", id).maybeSingle();
    if (!p.data) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
    const mine = await allowedRouteIds(sb, a.user);
    if (mine && !(p.data.route_id && mine.includes(p.data.route_id))) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
    const led = await sb.from("customer_ledger").select("amount").eq("customer_id", p.data.customer_id).lte("ts", p.data.created_at);
    const balance = (led.data ?? []).reduce((x: number, e: { amount: number }) => x + Number(e.amount), 0);
    const cust = one(p.data.customer) as { code: string; name: string } | null, sale = one(p.data.sale) as { no: string } | null;
    return NextResponse.json({
      voucher: { no: "RV-" + pad4(p.data.no), type: "received", title: "Payment Voucher - Received (Credit)", date: p.data.pay_date, party: cust?.name ?? "", code: cust?.code ?? "",
        amount: Number(p.data.amount), reversed: !!p.data.reversed, details: sale ? "Received with " + sale.no : "Payment received", balance_after: balance, by: (one(p.data.by) as { name: string } | null)?.name ?? "" },
    });
  }
  if (type === "exp") {
    if (a.user.ownOnly) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
    const e = await sb.from("expenses").select("id,no,expense_date,amount,category,note,voided,route:routes(name),by:app_users!expenses_created_by_fkey(name)").eq("id", id).maybeSingle();
    if (!e.data || e.data.voided) return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
    return NextResponse.json({
      voucher: { no: "PV-" + pad4(e.data.no), type: "paid", title: "Payment Voucher - Paid (Debit)", date: e.data.expense_date, party: e.data.category, code: "", amount: Number(e.data.amount), reversed: false,
        details: e.data.note ?? "", route: (one(e.data.route) as { name: string } | null)?.name ?? "", balance_after: null, by: (one(e.data.by) as { name: string } | null)?.name ?? "" },
    });
  }
  return NextResponse.json({ error: "Voucher not found." }, { status: 404 });
}
