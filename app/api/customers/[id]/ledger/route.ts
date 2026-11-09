import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { computeBills, statement, type LedgerEntry } from "@/lib/bills";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD  ->  statement, balance and the bills still unpaid */
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await authorize("customers.view", "customers.edit", "sales.create", "payments.receive");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const c = await sb.from("customers").select("id,name,route_id,credit_limit").eq("id", id).maybeSingle();
  if (!c.data) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !(c.data.route_id && mine.includes(c.data.route_id))) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const [led, sales, pays] = await Promise.all([
    sb.from("customer_ledger").select("id,ts,entry_date,type,amount,ref,note").eq("customer_id", id).order("ts").limit(5000),
    sb.from("sales").select("id,no,created_at,total,status").eq("customer_id", id),
    sb.from("payments").select("id,sale_id,kind,amount,reversed").eq("customer_id", id),
  ]);
  const err = led.error ?? sales.error ?? pays.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saleById = new Map((sales.data ?? []).map((s: any) => [s.id, s]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payById = new Map((pays.data ?? []).map((p: any) => [p.id, p]));
  const label = (e: { type: string; ref: string | null; note: string | null }) => {
    if (e.type === "opening") return "Opening balance";
    if (e.type === "invoice") return (saleById.get(e.ref ?? "") as { no?: string } | undefined)?.no ?? "Invoice";
    if (e.type === "payment") {
      const p = payById.get(e.ref ?? "") as { sale_id: string | null; kind: string } | undefined;
      const sl = p?.sale_id ? (saleById.get(p.sale_id) as { no?: string } | undefined) : undefined;
      return "Payment" + (sl ? " with " + sl.no : p?.kind === "collection" ? " (collection)" : "");
    }
    if (e.type === "reversal") return "Reversal";
    if (e.type === "refund") return "Cash refund";
    if (e.type === "return") {
      if (/^Imported Oracle CASHD1 Sale Discount voucher \d+/.test(e.note ?? "")) return "Sale Discount";
      const source = /Imported from Oracle (?:INVR0 return|INV0P RETURN2 invoice) (\d+)/.exec(e.note ?? "");
      return source ? `Return (Oracle #${source[1]})` : "Return";
    }
    return e.type;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: LedgerEntry[] = (led.data ?? []).map((e: any) => ({ ts: e.ts, entry_date: e.entry_date, type: e.type, amount: Number(e.amount), label: label(e) }));
  const sp = req.nextUrl.searchParams;
  const st = statement(entries, sp.get("from"), sp.get("to"));
  const balance = entries.reduce((x, e) => x + e.amount, 0);

  const bills = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(led.data ?? []).filter((e: any) => e.type === "opening").map((e: any) => ({ id: "open:" + e.id, kind: "opening" as const, no: "Opening balance", ts: e.ts, total: Number(e.amount) })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(sales.data ?? []).filter((s: any) => s.status === "confirmed").map((s: any) => ({ id: s.id, kind: "invoice" as const, no: s.no, ts: s.created_at, total: Number(s.total) })),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const due = computeBills(bills, (pays.data ?? []).filter((p: any) => !p.reversed).map((p: any) => ({ sale_id: p.sale_id, amount: Number(p.amount) })));
  return NextResponse.json({
    customer: { id: c.data.id, name: c.data.name, credit_limit: Number(c.data.credit_limit) },
    balance, ...st, unpaid: due.bills.filter((b) => b.due > 0).map((b) => ({ no: b.no, due: b.due, total: b.total, ts: b.ts })),
  });
}
