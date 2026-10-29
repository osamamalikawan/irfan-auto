// Which bills are still unpaid? Same rule as the prototype: invoices settled by their own payments first,
// then money collected later is applied to the oldest bill first.

export type BillInput = { id: string; kind: "opening" | "invoice"; no: string; ts: string; total: number };
export type PaymentInput = { sale_id: string | null; amount: number };
export type Bill = BillInput & { credit: number; due: number };

export function computeBills(bills: BillInput[], payments: PaymentInput[]): { bills: Bill[]; unapplied: number } {
  const list: Bill[] = [...bills].sort((a, b) => a.ts.localeCompare(b.ts)).map((b) => ({ ...b, credit: 0, due: 0 }));
  let pool = 0;
  for (const p of payments) {
    const b = p.sale_id ? list.find((x) => x.id === p.sale_id) : null;
    if (b) b.credit += p.amount; else pool += p.amount;      // later collections have no invoice of their own
  }
  for (const b of list) {
    if (b.credit > b.total) { pool += b.credit - b.total; b.credit = b.total; }
    b.due = b.total - b.credit;
  }
  for (const b of list) { const use = Math.min(pool, b.due); b.due -= use; pool -= use; }
  return { bills: list, unapplied: pool };
}

/** Preview: how a new payment would be spread over the unpaid bills, oldest first. */
export function spreadPayment(bills: { no: string; due: number }[], amount: number): { no: string; amount: number }[] {
  let left = amount;
  const out: { no: string; amount: number }[] = [];
  for (const b of bills) {
    if (left <= 0) break;
    if (b.due <= 0) continue;
    const use = Math.min(left, b.due);
    out.push({ no: b.no, amount: use });
    left -= use;
  }
  return out;
}

export type LedgerEntry = { ts: string; entry_date: string; type: string; amount: number; label: string };
export type StatementRow = { date: string; type: string; label: string; debit: number; credit: number; balance: number };

export function statement(entries: LedgerEntry[], from?: string | null, to?: string | null) {
  const all = [...entries].sort((a, b) => a.ts.localeCompare(b.ts));
  const opening = all.filter((e) => from && e.entry_date < from).reduce((x, e) => x + e.amount, 0);
  let run = opening;
  const rows: StatementRow[] = all
    .filter((e) => (!from || e.entry_date >= from) && (!to || e.entry_date <= to))
    .map((e) => { run += e.amount; return { date: e.entry_date, type: e.type, label: e.label, debit: e.amount > 0 ? e.amount : 0, credit: e.amount < 0 ? -e.amount : 0, balance: run }; });
  return {
    opening, rows, closing: run,
    totalDebit: rows.reduce((x, r) => x + r.debit, 0), totalCredit: rows.reduce((x, r) => x + r.credit, 0),
  };
}
