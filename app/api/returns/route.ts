import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds } from "@/lib/customer-scope";
import { dbError } from "@/lib/sql-error";

export const dynamic = "force-dynamic";

/** ?from=&to=  recorded returns and claims */
export async function GET(req: NextRequest) {
  const a = await authorize("sales.return", "reports.view");
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !mine.length) return NextResponse.json({ items: [] });
  let q = sb.from("sale_returns").select("id,no,kind,return_date,amount,damaged,reason,created_at,sale:sales(id,no,customer_id,customer_name),lines:sale_return_lines(qty,name),by:app_users!sale_returns_created_by_fkey(name)")
    .order("created_at", { ascending: false }).limit(1000);
  if (mine) q = q.in("route_id", mine);
  if (sp.get("from")) q = q.gte("return_date", sp.get("from")!);
  if (sp.get("to")) q = q.lte("return_date", sp.get("to")!);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x);
  const items = (data ?? []).map((r) => ({ ...r, sale: one(r.sale), by: one(r.by)?.name ?? "" }));
  let customerIds: string[] | null = null;
  if (mine) {
    customerIds = [];
    for (let from = 0; ; from += 1000) {
      const customers = await sb.from("customers").select("id").in("route_id", mine).order("id").range(from, from + 999);
      if (customers.error) return NextResponse.json({ error: customers.error.message }, { status: 500 });
      customerIds.push(...(customers.data ?? []).map((customer) => customer.id));
      if (!customers.data || customers.data.length < 1000) break;
    }
    if (!customerIds.length) return NextResponse.json({ items });
  }
  const ledger: { id: string; ts: string; entry_date: string; amount: number; note: string | null; ref: string | null; customer_id: string; customer: { name: string } | { name: string }[] | null }[] = [];
  for (let from = 0; ; from += 1000) {
    let ledgerQuery = sb.from("customer_ledger")
      .select("id,ts,entry_date,amount,note,ref,customer_id,customer:customers(name)")
      .eq("type", "return")
      .or("note.like.Imported from Oracle INVR0 return %,note.like.Imported from Oracle INV0P RETURN2 invoice %");
    if (customerIds) ledgerQuery = ledgerQuery.in("customer_id", customerIds);
    if (sp.get("from")) ledgerQuery = ledgerQuery.gte("entry_date", sp.get("from")!);
    if (sp.get("to")) ledgerQuery = ledgerQuery.lte("entry_date", sp.get("to")!);
    const { data: page, error: ledgerError } = await ledgerQuery
      .order("ts", { ascending: false }).order("id").range(from, from + 999);
    if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    ledger.push(...(page ?? []));
    if (!page || page.length < 1000) break;
  }
  const linkedReturnIds = new Set(items.map((item) => item.id));
  const unlinkedItems = ledger.filter((entry) => !entry.ref || !linkedReturnIds.has(entry.ref)).map((entry) => {
    const source = /Imported from Oracle (INVR0 return|INV0P RETURN2 invoice) (\d+)/.exec(entry.note ?? "");
    const customer = one(entry.customer);
    return {
      id: entry.id,
      no: `OLD-RET-${source?.[1].startsWith("INV0P") ? "INVP-" : ""}${source?.[2] ?? entry.id}`,
      kind: "return",
      return_date: entry.entry_date,
      amount: Math.abs(Number(entry.amount)),
      damaged: false,
      reason: entry.note,
      created_at: entry.ts,
      sale: null,
      lines: [],
      by: "",
      customer_name: customer?.name ?? "Customer",
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({
    items: [...items, ...unlinkedItems].sort((a, b) => b.return_date.localeCompare(a.return_date)),
  });
}

/** Body: { sale_id, lines: [{ item_id, qty }], kind?: "return" | "claim", damaged?, reason? } */
export async function POST(req: NextRequest) {
  const a = await authorize("sales.return");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  if (!b?.sale_id) return NextResponse.json({ error: "Find the invoice first." }, { status: 400 });
  const sb = db();
  const mine = await allowedRouteIds(sb, a.user);
  if (mine) {
    const s = await sb.from("sales").select("route_id").eq("id", b.sale_id).maybeSingle();
    if (!s.data?.route_id || !mine.includes(s.data.route_id)) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  const lines = Array.isArray(b.lines) ? b.lines.map((l: { item_id: string; qty: unknown }) => ({ item_id: l.item_id, qty: Number(l.qty) })).filter((l: { qty: number }) => l.qty > 0) : [];
  const { data, error } = await sb.rpc("create_return", { p_sale: b.sale_id, p_lines: lines, p_damaged: !!b.damaged, p_reason: String(b.reason ?? "").slice(0, 300), p_user: a.user.id, p_kind: b.kind === "claim" ? "claim" : "return" });
  if (error) return dbError(error);
  return NextResponse.json({ id: data }, { status: 201 });
}
