import { niceDate } from "@/lib/dates";
import { rs } from "@/lib/format";

export type Statement = {
  balance: number; opening: number; closing: number; totalDebit: number; totalCredit: number;
  rows: { date: string; type: string; label: string; debit: number; credit: number; balance: number }[];
};

/** Debit / credit / running balance table used by supplier statements. */
export default function StatementTable({ d, from, debitLabel = "Debit", creditLabel = "Credit" }: { d: Statement; from?: string; debitLabel?: string; creditLabel?: string }) {
  if (!d.rows.length) return <p className="text-sm text-muted">No entries in this period.</p>;
  const th = "border-b border-line py-1.5 pr-2 font-semibold";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead><tr className="text-left text-xs text-muted">
          <th className={th}>Date</th><th className={th}>Details</th><th className={th + " text-right"}>{debitLabel}</th><th className={th + " text-right"}>{creditLabel}</th><th className="border-b border-line py-1.5 text-right font-semibold">Balance</th>
        </tr></thead>
        <tbody>
          {from && <tr><td className="py-1.5 pr-2 text-xs">{niceDate(from)}</td><td className="py-1.5 pr-2 italic text-muted">Brought forward</td><td /><td /><td className="py-1.5 text-right">{rs(d.opening)}</td></tr>}
          {d.rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              <td className="whitespace-nowrap py-1.5 pr-2 text-xs">{niceDate(r.date)}</td><td className="py-1.5 pr-2">{r.label}</td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-right">{r.debit ? rs(r.debit) : ""}</td><td className="whitespace-nowrap py-1.5 pr-2 text-right">{r.credit ? rs(r.credit) : ""}</td>
              <td className="whitespace-nowrap py-1.5 text-right font-medium">{rs(r.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t-2 border-line font-semibold"><td className="py-1.5" colSpan={2}>Totals</td><td className="py-1.5 pr-2 text-right">{rs(d.totalDebit)}</td><td className="py-1.5 pr-2 text-right">{rs(d.totalCredit)}</td><td className="py-1.5 text-right">{rs(d.closing)}</td></tr></tfoot>
      </table>
    </div>
  );
}
