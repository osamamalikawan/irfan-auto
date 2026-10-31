import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { statement, type LedgerEntry } from "@/lib/bills";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** ?from=&to=  statement of what we owe this supplier */
export async function GET(req: NextRequest, { params }: Ctx) {
  const a = await authorize("suppliers.view", "suppliers.edit", "suppliers.pay");
  if (a.error) return a.error;
  const { id } = await params;
  const sb = db();
  const [led, pur, pay] = await Promise.all([
    sb.from("supplier_ledger").select("id,ts,entry_date,type,amount,ref").eq("supplier_id", id).order("ts").limit(5000),
    sb.from("purchases").select("id,no").eq("supplier_id", id),
    sb.from("supplier_payments").select("id,no,method,purchase_id").eq("supplier_id", id),
  ]);
  const err = led.error ?? pur.error ?? pay.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const pn = new Map((pur.data ?? []).map((p: { id: string; no: string }) => [p.id, p.no]));
  const pm = new Map((pay.data ?? []).map((p: { id: string; method: string; purchase_id: string | null }) => [p.id, p]));
  const label = (e: { type: string; ref: string | null }) => {
    if (e.type === "opening") return "Opening balance";
    if (e.type === "purchase") return pn.get(e.ref ?? "") ?? "Purchase";
    if (e.type === "payment") {
      const p = pm.get(e.ref ?? "");
      return "Payment (" + (p?.method ?? "cash") + ")" + (p?.purchase_id ? " with " + pn.get(p.purchase_id) : "");
    }
    return e.type === "reversal" ? "Reversal" : "Return";
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: LedgerEntry[] = (led.data ?? []).map((e: any) => ({ ts: e.ts, entry_date: e.entry_date, type: e.type, amount: Number(e.amount), label: label(e) }));
  const sp = req.nextUrl.searchParams;
  return NextResponse.json({ balance: entries.reduce((x, e) => x + e.amount, 0), ...statement(entries, sp.get("from"), sp.get("to")) });
}
