import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { safeWord } from "@/lib/customer-scope";

export const dynamic = "force-dynamic";
const READERS = ["suppliers.view", "suppliers.edit", "suppliers.pay", "purchases.create"];
const TEXT = ["name_ur", "contact", "phone", "phone2", "address", "city", "ntn", "email", "notes"] as const;

/** ?q=&status=active|archived&offset=&limit= */
export async function GET(req: NextRequest) {
  const a = await authorize(...READERS);
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const sb = db();
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 40, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  let q = sb.from("suppliers").select("id,code,name,name_ur,contact,phone,city,credit_days,status", { count: "exact" })
    .eq("status", sp.get("status") === "archived" ? "archived" : "active").order("name").range(offset, offset + limit - 1);
  for (const raw of (sp.get("q") ?? "").split(/\s+/)) {
    const w = safeWord(raw);
    if (w) q = q.or(["name", "name_ur", "contact", "phone", "code", "city"].map((c) => c + ".ilike.%" + w + "%").join(","));
  }
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (data ?? []).map((s: { id: string }) => s.id);
  const bal = ids.length ? await sb.from("supplier_balances").select("supplier_id,balance").in("supplier_id", ids) : { data: [] as { supplier_id: string; balance: number }[] };
  const b = new Map((bal.data ?? []).map((x) => [x.supplier_id, Number(x.balance)]));
  return NextResponse.json({ items: (data ?? []).map((s: { id: string }) => ({ ...s, balance: b.get(s.id) ?? 0 })), total: count ?? 0 });
}

/** Body: { name, name_ur?, contact?, phone?, phone2?, address?, city?, ntn?, email?, notes?, credit_days?, opening_balance? } */
export async function POST(req: NextRequest) {
  const a = await authorize("suppliers.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
  const row: Record<string, unknown> = { name, credit_days: Math.max(0, Math.round(Number(b?.credit_days) || 0)), opening_balance: Number(b?.opening_balance) || 0 };
  for (const k of TEXT) row[k] = String(b?.[k] ?? "").trim() || null;
  const sb = db();
  const { data, error } = await sb.from("suppliers").insert(row).select("id,code").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A supplier called '" + name + "' already exists." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  if (Number(row.opening_balance)) await sb.from("supplier_ledger").insert({ supplier_id: data.id, type: "opening", amount: row.opening_balance, ref: data.id });
  return NextResponse.json({ id: data.id, code: data.code }, { status: 201 });
}
