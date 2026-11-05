/** Lines of an invoice as sent by the screens, cleaned for create_sale / edit_sale. */
export function mapLines(x: unknown) {
  if (!Array.isArray(x)) return [];
  return x.map((l: Record<string, unknown>) => ({
    product_id: l.product_id, qty: Number(l.qty),
    price: l.price === undefined || l.price === null || l.price === "" ? null : Number(l.price),
    disc_pct: l.disc_pct === undefined || l.disc_pct === null || l.disc_pct === "" ? null : Number(l.disc_pct),
    location_id: l.location_id || null,
    market: l.market && typeof l.market === "object"
      ? { cost: Number((l.market as { cost?: unknown }).cost), vendor: String((l.market as { vendor?: unknown }).vendor ?? "").slice(0, 80), supplier_id: (l.market as { supplier_id?: unknown }).supplier_id || null }
      : undefined,
  }));
}
