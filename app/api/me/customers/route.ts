import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { myCustomers } from "@/lib/salesman-account";

export const dynamic = "force-dynamic";

/** The signed-in salesman's customers with what each owes. ?q=&owing=1 (only those who owe)&sort=balance (biggest first; default by name)
 *  -> { items, count, total_owing } */
export async function GET(req: NextRequest) {
  const a = await authorize();
  if (a.error) return a.error;
  if (!a.user.isSalesman) return NextResponse.json({ error: "This page is for salesmen." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  try {
    let items = await myCustomers(db(), a.user.id);
    const total_owing = items.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0);
    if (sp.get("owing") === "1") items = items.filter((c) => c.balance > 0);
    for (const w of (sp.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean)) {
      items = items.filter((c) => [c.name, c.name_ur, c.phone, c.code].some((f) => (f ?? "").toLowerCase().includes(w)));
    }
    if (sp.get("sort") === "balance") items = [...items].sort((x, y) => y.balance - x.balance);
    return NextResponse.json({ items: items.slice(0, 1000), count: items.length, total_owing });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
