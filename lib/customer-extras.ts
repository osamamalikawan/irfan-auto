import type { db } from "./supabase";

type SB = ReturnType<typeof db>;

/** Phone numbers from a request body: `phones: string[]`, or the old `phone` / `phone2` fields. Blank and repeated numbers are dropped. */
export function cleanPhones(b: Record<string, unknown> | null | undefined): string[] {
  const raw: unknown[] = Array.isArray(b?.phones) ? (b!.phones as unknown[]) : [b?.phone, b?.phone2];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const p = String(x ?? "").trim().slice(0, 30);
    const key = p.replace(/\D/g, "") || p;
    if (!p || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 10) break;
  }
  return out;
}

/** The numbers go in customer_phones; the first two also stay in customers.phone / phone2, and phone_search holds all of them. */
export function phoneColumns(phones: string[]) {
  return { phone: phones[0] ?? null, phone2: phones[1] ?? null, phone_search: phones.length ? phones.join(" ") : null };
}

export async function savePhones(sb: SB, customerId: string, phones: string[]) {
  const del = await sb.from("customer_phones").delete().eq("customer_id", customerId);
  if (del.error) throw new Error(del.error.message);
  if (!phones.length) return;
  const ins = await sb.from("customer_phones").insert(phones.map((phone, position) => ({ customer_id: customerId, phone, position })));
  if (ins.error) throw new Error(ins.error.message);
}

/** Replaces the groups of a customer with `ids` (ids that do not exist are ignored). */
export async function saveGroups(sb: SB, customerId: string, ids: unknown) {
  const want = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const known = want.length ? await sb.from("customer_groups").select("id").in("id", want) : { data: [], error: null };
  if (known.error) throw new Error(known.error.message);
  const del = await sb.from("customer_group_members").delete().eq("customer_id", customerId);
  if (del.error) throw new Error(del.error.message);
  const rows = (known.data ?? []).map((g: { id: string }) => ({ customer_id: customerId, group_id: g.id }));
  if (rows.length) {
    const ins = await sb.from("customer_group_members").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }
}
