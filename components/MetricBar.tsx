import { rs } from "@/lib/format";
import type { Metric } from "@/lib/targets";

const FILL = { green: "bg-green", amber: "bg-amber", red: "bg-red", none: "bg-line" } as const;
const TEXT = { green: "text-green", amber: "text-amber", red: "text-red", none: "text-muted" } as const;

/** One target as a bar: actual against target, with the status colour. */
export default function MetricBar({ label, m, money = true }: { label: string; m: Metric; money?: boolean }) {
  const f = (n: number) => (money ? rs(n) : n.toLocaleString());
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted">{f(m.actual)}{m.target ? " of " + f(m.target) : ""}</span>
      </div>
      <div className="my-1 h-2.5 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuenow={Math.min(m.pct ?? 0, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={"h-full rounded-full " + FILL[m.status]} style={{ width: Math.min(m.pct ?? 0, 100) + "%" }} />
      </div>
      <div className="flex justify-between text-xs"><span className={"font-medium " + TEXT[m.status]}>{m.label}</span><span className="text-muted">{m.pct !== null ? m.pct + "%" : ""}</span></div>
    </div>
  );
}
