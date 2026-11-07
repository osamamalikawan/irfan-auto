import { rs } from "@/lib/format";

/**
 * Total Limit / Previous Balance / Remaining Balance of a customer, in bold colours.
 *  Remaining = limit - previous balance, so a customer who has paid in advance (negative balance) has more than the limit left.
 *  Without a credit limit only the balance is shown.
 */
export default function CreditSummary({ limit, balance, align = "left" }: { limit: number; balance: number; align?: "left" | "right" }) {
  const hasLimit = limit > 0;
  const remaining = limit - balance;
  const row = "flex items-baseline gap-2 " + (align === "right" ? "justify-end" : "");
  return (
    <dl className="space-y-0.5 text-sm" aria-label="Credit summary">
      <div className={row}>
        <dt className="text-muted">Total Limit:</dt>
        <dd className={"font-bold " + (hasLimit ? "text-accent" : "text-muted")}>{hasLimit ? rs(limit) : "No limit"}</dd>
      </div>
      <div className={row}>
        <dt className="text-muted">Previous Balance:</dt>
        <dd className={"font-bold " + (balance > 0 ? "text-red" : balance < 0 ? "text-green" : "")}>{rs(balance)}</dd>
      </div>
      {hasLimit && (
        <div className={row}>
          <dt className="text-muted">Remaining Balance:</dt>
          <dd className={"font-bold " + (remaining < 0 ? "text-red" : remaining < limit * 0.1 ? "text-amber" : "text-green")}>{rs(remaining)}</dd>
        </div>
      )}
    </dl>
  );
}
