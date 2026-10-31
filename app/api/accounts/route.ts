import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD  money summary, daily cash book, biggest balances */
export async function GET(req: NextRequest) {
  const a = await authorize("accounts.edit", "reports.view");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const ok = (v: string | null) => (v && /^\d{4}-\d\d-\d\d$/.test(v) ? v : null);
  const from = ok(sp.get("from")) ?? "2000-01-01", to = ok(sp.get("to")) ?? "2999-12-31";
  const sb = db();
  const [sum, book, cb, sbal] = await Promise.all([
    sb.rpc("account_summary", { p_from: from, p_to: to }),
    sb.rpc("cash_book", { p_from: from, p_to: to }),
    sb.from("customer_balances").select("customer_id,balance").gt("balance", 0).order("balance", { ascending: false }).limit(8),
    sb.from("supplier_balances").select("supplier_id,balance").gt("balance", 0).order("balance", { ascending: false }).limit(8),
  ]);
  const err = sum.error ?? book.error ?? cb.error ?? sbal.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  const cids = (cb.data ?? []).map((x: { customer_id: string }) => x.customer_id), sids = (sbal.data ?? []).map((x: { supplier_id: string }) => x.supplier_id);
  const [cn, sn] = await Promise.all([
    cids.length ? sb.from("customers").select("id,name").in("id", cids) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    sids.length ? sb.from("suppliers").select("id,name").in("id", sids) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const cname = new Map((cn.data ?? []).map((x) => [x.id, x.name])), sname = new Map((sn.data ?? []).map((x) => [x.id, x.name]));
  return NextResponse.json({
    summary: sum.data, cash_book: (book.data ?? []).map((r: { entry_day: string; money_in: number; money_out: number }) => ({ day: r.entry_day, money_in: Number(r.money_in), money_out: Number(r.money_out) })),
    debtors: (cb.data ?? []).map((x: { customer_id: string; balance: number }) => ({ id: x.customer_id, name: cname.get(x.customer_id) ?? "?", balance: Number(x.balance) })),
    creditors: (sbal.data ?? []).map((x: { supplier_id: string; balance: number }) => ({ id: x.supplier_id, name: sname.get(x.supplier_id) ?? "?", balance: Number(x.balance) })),
  });
}
