"use client";
import { useEffect, useRef, useState } from "react";
import { rs } from "@/lib/format";

export type PickedCustomer = { id: string; name: string; is_walk_in?: boolean };
type Row = { id: string; code: string; name: string; owner: string | null; phone: string | null; balance: number; route: { name: string } | null };

/** Bottom sheet (dialog on desktop) to find a customer by name, phone or code. */
export default function CustomerPicker({ onPick, onClose, allowWalkIn, onlyWithBalance }: {
  onPick: (c: PickedCustomer) => void; onClose: () => void; allowWalkIn?: boolean; onlyWithBalance?: boolean;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [walkIn, setWalkIn] = useState<PickedCustomer | null>(null);
  const req = useRef(0);

  useEffect(() => {
    if (allowWalkIn) fetch("/api/customers/walkin").then((r) => r.json()).then((j) => j.customer && setWalkIn({ id: j.customer.id, name: j.customer.name, is_walk_in: true })).catch(() => {});
  }, [allowWalkIn]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const id = ++req.current;
      setLoading(true); setError("");
      try {
        const r = await fetch("/api/customers?limit=30&q=" + encodeURIComponent(q));
        const j = await r.json();
        if (id !== req.current) return;
        if (!r.ok) throw new Error(j.error || "Could not load customers");
        setRows(onlyWithBalance ? j.items.filter((c: Row) => c.balance > 0) : j.items);
      } catch (e) { if (id === req.current) setError((e as Error).message); }
      finally { if (id === req.current) setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, onlyWithBalance]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Choose customer" onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />
        <div className="mb-3 flex items-center gap-2">
          <input className="input" autoFocus type="text" inputMode="search" placeholder="Search name, phone or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
          <button className="btn px-3" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto">
          {allowWalkIn && walkIn && !q && (
            <li><button className="flex min-h-14 w-full items-center gap-2 py-2 text-left active:bg-bg" onClick={() => onPick(walkIn)}>
              <span className="flex-1"><span className="block font-semibold">Walk-in customer</span><span className="text-xs text-muted">Cash sale, paid in full</span></span>
            </button></li>
          )}
          {rows.map((c) => (
            <li key={c.id}>
              <button className="flex min-h-14 w-full items-center gap-2 py-2 text-left active:bg-bg" onClick={() => onPick({ id: c.id, name: c.name })}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block truncate text-xs text-muted">{[c.code, c.owner, c.phone, c.route?.name].filter(Boolean).join(" · ")}</span>
                </span>
                {c.balance > 0 && <span className="pill bg-red-bg text-red">Due {rs(c.balance)}</span>}
              </button>
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="mt-2 text-sm text-red">{error}</p>}
        {!loading && !error && !rows.length && <p className="py-4 text-center text-sm text-muted">{onlyWithBalance ? "No customer with a balance matches." : "No customer matches."}</p>}
      </div>
    </div>
  );
}
