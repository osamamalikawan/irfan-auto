/** Sale type (counter / cash ledger / credit ledger) and the four invoice statuses. */
export const FULFIL = [["active", "Active"], ["packed", "Packed"], ["delivered", "Delivered"], ["completed", "Completed"]] as const;
export type Fulfil = (typeof FULFIL)[number][0];
export const FULFIL_KEYS: string[] = FULFIL.map(([k]) => k);

type KindInput = { sale_kind?: string | null; pay_term?: string | null };

/** counter = paid at the counter, cash = ledger sale paid on delivery, credit = ledger sale on the customer's account. */
export function saleKind(s: KindInput) {
  if (s.sale_kind === "counter") return { key: "counter" as const, label: "Counter", pill: "border border-accent bg-bg text-accent", bar: "border-l-accent" };
  if (s.pay_term === "cash") return { key: "cash" as const, label: "Cash", pill: "bg-green-bg text-green", bar: "border-l-green" };
  return { key: "credit" as const, label: "Credit", pill: "bg-amber-bg text-amber", bar: "border-l-amber" };
}

export const fulfilIndex = (k: string) => FULFIL_KEYS.indexOf(k);
/** An order's status only moves forward (Active, Packed, Delivered, Completed). An administrator may also move it back. */
export const canMoveStatus = (from: string, to: string, admin: boolean) => to !== from && fulfilIndex(to) >= 0 && (admin || fulfilIndex(to) > fulfilIndex(from));

export function fulfilLabel(k: string) { return FULFIL.find(([x]) => x === k)?.[1] ?? k; }

/** What to show for an invoice's status: cancelled wins, a counter sale not yet paid is "On hold". */
export function statusPill(s: { status: string; fulfil_status: string; sale_kind?: string | null; total: number; paid: number }) {
  if (s.status === "cancelled") return { label: "Cancelled", cls: "bg-bg text-muted" };
  if (s.fulfil_status === "active") {
    const hold = s.sale_kind === "counter" && Number(s.total) - Number(s.paid) > 0;
    return { label: hold ? "Active (Hold)" : "Active", cls: "bg-amber-bg text-amber" };
  }
  if (s.fulfil_status === "packed") return { label: "Packed", cls: "border border-accent bg-bg text-accent" };
  if (s.fulfil_status === "delivered") return { label: "Delivered", cls: "bg-green-bg text-green" };
  return { label: "Completed", cls: "bg-bg text-muted" };
}
