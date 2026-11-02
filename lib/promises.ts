// A promise to pay is "kept" once the customer has paid the promised amount since it was made
// (or has nothing left to pay); otherwise it is upcoming, due today, or overdue.
export type PromiseStatus = "kept" | "overdue" | "due" | "upcoming";

export function promiseStatus(p: { date: string; amount: number; paidSince: number; balance: number }, today: string): PromiseStatus {
  const kept = p.amount > 0 ? p.paidSince >= p.amount : p.paidSince > 0;
  if (kept || p.balance <= 0) return "kept";
  if (p.date < today) return "overdue";
  return p.date === today ? "due" : "upcoming";
}

const RANK: Record<PromiseStatus, number> = { overdue: 0, due: 1, upcoming: 2, kept: 3 };
/** Overdue first (oldest promise first), then due, upcoming (soonest first), kept (latest first). */
export function comparePromises(a: { status: PromiseStatus; date: string }, b: { status: PromiseStatus; date: string }) {
  if (a.status !== b.status) return RANK[a.status] - RANK[b.status];
  return a.status === "kept" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
}
