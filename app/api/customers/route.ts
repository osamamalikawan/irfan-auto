import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { authorize } from "@/lib/auth";
import { allowedRouteIds, safeWord } from "@/lib/customer-scope";

export const dynamic = "force-dynamic";
const READERS = ["customers.view", "customers.edit", "sales.create"];

const SELECT =
  "id,code,name,name_ur,owner,phone,credit_limit,status,customer_remarks(text,created_at),area:areas(id,name,city:cities(name)),route:routes(id,name,visit_days,salesman:app_users(id,name))";

/** ?q=&route=&area=&status=active|archived&offset=&limit= */
export async function GET(req: NextRequest) {
  const a = await authorize(...READERS);
  if (a.error) return a.error;
  const sp = req.nextUrl.searchParams;
  const sb = db();
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 30, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const mine = await allowedRouteIds(sb, a.user);
  if (mine && !mine.length) return NextResponse.json({ items: [], total: 0 });

  let q = sb.from("customers").select(SELECT, { count: "exact" })
    .eq("is_walk_in", false).eq("status", sp.get("status") === "archived" ? "archived" : "active")
    .order("name").order("created_at", { referencedTable: "customer_remarks", ascending: false }).limit(1, { referencedTable: "customer_remarks" })
    .range(offset, offset + limit - 1);
  if (mine) q = q.in("route_id", mine);
  if (sp.get("route")) q = q.eq("route_id", sp.get("route")!);
  if (sp.get("area")) q = q.eq("area_id", sp.get("area")!);
  for (const raw of (sp.get("q") ?? "").split(/\s+/)) {
    const w = safeWord(raw);
    if (w) q = q.or(["name", "name_ur", "owner", "phone", "phone2", "code"].map((c) => c + ".ilike.%" + w + "%").join(","));
  }
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (data ?? []).map((c: { id: string }) => c.id);
  const bal = ids.length ? await sb.from("customer_balances").select("customer_id,balance").in("customer_id", ids) : { data: [] as { customer_id: string; balance: number }[] };
  const balance = new Map((bal.data ?? []).map((b) => [b.customer_id, Number(b.balance)]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (data ?? []).map((c: any) => {
    const { customer_remarks, ...rest } = c;
    const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
    const route = one(c.route);
    return { ...rest, area: one(c.area), route: route ? { ...route, salesman: one(route.salesman) } : null, last_remark: customer_remarks?.[0]?.text ?? null, balance: balance.get(c.id) ?? 0 };
  });
  return NextResponse.json({ items, total: count ?? 0 });
}

const TEXT = ["name_ur", "owner", "phone", "phone2", "address", "cnic", "ntn", "email", "gps"] as const;

/** Body: { name, name_ur?, owner?, phone?, phone2?, address?, cnic?, ntn?, email?, credit_limit?, credit_days?, opening_balance?, area_id?, route_id?, remarks? } */
export async function POST(req: NextRequest) {
  const a = await authorize("customers.edit");
  if (a.error) return a.error;
  const b = await req.json().catch(() => null);
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
  const sb = db();

  const phone = String(b?.phone ?? "").trim();
  let dup = sb.from("customers").select("id").ilike("name", name.replace(/[\\%_]/g, "\\$&")).limit(1);
  dup = phone ? dup.eq("phone", phone) : dup.is("phone", null);
  const d = await dup;
  if (d.error) return NextResponse.json({ error: d.error.message }, { status: 500 });
  if (d.data?.length) return NextResponse.json({ error: "A customer with this name and phone already exists." }, { status: 409 });

  const row: Record<string, unknown> = {
    name, credit_limit: Math.max(0, Number(b?.credit_limit) || 0), credit_days: Math.max(0, Math.round(Number(b?.credit_days) || 0)),
    opening_balance: Number(b?.opening_balance) || 0, area_id: b?.area_id || null, route_id: b?.route_id || null,
  };
  for (const k of TEXT) row[k] = String(b?.[k] ?? "").trim() || null;
  const { data, error } = await sb.from("customers").insert(row).select("id,code").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (Number(row.opening_balance)) await sb.from("customer_ledger").insert({ customer_id: data.id, type: "opening", amount: row.opening_balance, ref: data.id });
  if (row.route_id) await sb.from("customer_route_history").insert({ customer_id: data.id, route_id: row.route_id });
  const remark = String(b?.remarks ?? "").trim().slice(0, 500);
  if (remark) await sb.from("customer_remarks").insert({ customer_id: data.id, text: remark, by_user: a.user.id, by_name: a.user.name });
  return NextResponse.json({ id: data.id, code: data.code }, { status: 201 });
}
