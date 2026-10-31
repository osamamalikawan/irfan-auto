"use client";
import { useEffect, useRef, useState } from "react";
import { rs } from "@/lib/format";
import { canAddCustomer, hasPerm } from "@/lib/permissions";
import { useMe } from "./Me";
import { Loading, LoadingBar, Spinner } from "./Loading";

export type PickedCustomer = { id: string; name: string; is_walk_in?: boolean };
type Row = { id: string; code: string; name: string; owner: string | null; phone: string | null; balance: number; route: { name: string } | null };

/** Bottom sheet (dialog on desktop) to find a customer by name, phone or code. */
export default function CustomerPicker({ onPick, onClose, allowWalkIn, allowAdd, onlyWithBalance }: {
  onPick: (c: PickedCustomer) => void; onClose: () => void; allowWalkIn?: boolean; allowAdd?: boolean; onlyWithBalance?: boolean;
}) {
  const { user } = useMe();
  const [adding, setAdding] = useState(false);
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

  if (adding) return <QuickAdd startName={q} mustPickRoute={!hasPerm(user, "customers.edit")} onBack={() => setAdding(false)} onClose={onClose} onCreated={onPick} />;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <div role="dialog" aria-label="Choose customer" onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />
        <div className="mb-3 flex items-center gap-2">
          <input className="input" autoFocus type="text" inputMode="search" placeholder="Search name, phone or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
          <button className="btn px-3" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <LoadingBar active={loading} className="mb-2" />
        {allowAdd && canAddCustomer(user) && (
          <button className="btn mb-2 w-full justify-start gap-2" onClick={() => setAdding(true)}>＋ Add new customer{q.trim() ? ": " + q.trim() : ""}</button>
        )}
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
        {loading && !rows.length && !error && <Loading label={q.trim() ? "Searching…" : "Loading…"} />}
        {error && <p role="alert" className="mt-2 text-sm text-red">{error}</p>}
        {!loading && !error && !rows.length && <p className="py-4 text-center text-sm text-muted">{onlyWithBalance ? "No customer with a balance matches." : "No customer matches."}</p>}
      </div>
    </div>
  );
}

/** Small form to create a customer without leaving the invoice. Saves through POST /api/customers and returns the new customer. */
function QuickAdd({ startName, mustPickRoute, onBack, onClose, onCreated }: {
  startName: string; mustPickRoute: boolean; onBack: () => void; onClose: () => void; onCreated: (c: PickedCustomer) => void;
}) {
  const [name, setName] = useState(startName.trim());
  const [phone, setPhone] = useState("");
  const [owner, setOwner] = useState("");
  const [routeId, setRouteId] = useState("");
  const [routes, setRoutes] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/routes").then((r) => r.json()).then((j) => setRoutes(j.routes ?? [])).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/customers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, owner, route_id: routeId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save the customer");
      onCreated({ id: j.id, name: name.trim().replace(/\s+/g, " ") });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:items-center" onClick={onClose}>
      <form role="dialog" aria-label="Add customer" onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col gap-3 overflow-auto rounded-t-2xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:max-w-lg lg:rounded-2xl lg:pb-4">
        <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />
        <div className="flex items-center gap-2">
          <button type="button" className="btn border-0 bg-transparent px-3 text-xl" onClick={onBack} aria-label="Back">←</button>
          <h2 className="flex-1 text-base font-semibold">New customer</h2>
        </div>
        <div>
          <label className="label" htmlFor="qa-name">Business name *</label>
          <input id="qa-name" className="input" autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="qa-phone">Phone</label>
            <input id="qa-phone" className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="qa-owner">Owner</label>
            <input id="qa-owner" className="input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="qa-route">Route{mustPickRoute ? " *" : ""}</label>
          <select id="qa-route" className="input" required={mustPickRoute} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">{mustPickRoute ? "Choose a route" : "No route"}</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted">Credit limit, area, address and the rest can be added later from the Customers page.</p>
        {error && <p role="alert" className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}
        <div className="grid grid-cols-2 gap-2 lg:flex lg:justify-end">
          <button type="button" className="btn" onClick={onBack}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || (mustPickRoute && !routeId)}>{busy ? <><Spinner /> Saving…</> : "Save and use"}</button>
        </div>
      </form>
    </div>
  );
}
