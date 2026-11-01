/** [{ method_id, amount }] with junk removed. */
export function cleanPays(x: unknown) {
  if (!Array.isArray(x)) return [];
  return x.map((p) => ({ method_id: String(p?.method_id ?? ""), amount: Number(p?.amount) })).filter((p) => p.method_id && p.amount > 0);
}

