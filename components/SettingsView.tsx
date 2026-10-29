"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AddLocationModal from "./AddLocationModal";
import { useMe } from "./Me";
import Toast from "./Toast";

type ListRow = { id: string; name: string; visible: boolean; products: number };
type LocRow = { id: string; name: string; type: string; racks: number; active: boolean };

export default function SettingsView() {
  const { can } = useMe();
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [locs, setLocs] = useState<LocRow[] | null>(null);
  const [error, setError] = useState("");
  const [addLoc, setAddLoc] = useState(false);
  const [toast, setToast] = useState("");
  const [negStock, setNegStock] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((j) => setNegStock(!!j.settings?.allow_negative_stock)).catch(() => {});
  }, []);
  async function toggleNeg(v: boolean) {
    setNegStock(v);
    const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allow_negative_stock: v }) });
    if (!r.ok) { setNegStock(!v); const j = await r.json().catch(() => ({})); setToast(j.error || "Could not save"); }
  }
  async function move(i: number, dir: -1 | 1) {
    if (!locs) return;
    const k = i + dir;
    if (k < 0 || k >= locs.length) return;
    const next = [...locs];
    [next[i], next[k]] = [next[k], next[i]];
    setLocs(next);
    const r = await fetch("/api/inventory/locations/priority", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((l) => l.id) }) });
    if (!r.ok) { setToast("Could not save the order"); loadLocs(); }
  }

  const loadLists = useCallback(async () => {
    const r = await fetch("/api/inventory/lists");
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load lists");
    setLists(j.lists);
  }, []);
  const loadLocs = useCallback(async () => {
    const r = await fetch("/api/inventory/locations");
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Could not load locations");
    setLocs(j.locations);
  }, []);
  useEffect(() => { loadLists(); loadLocs(); }, [loadLists, loadLocs]);

  async function setVisible(body: { id?: string; all?: boolean; visible: boolean }) {
    const before = lists;
    setLists((ls) => ls && ls.map((l) => (body.all || l.id === body.id ? { ...l, visible: body.visible } : l)));
    const r = await fetch("/api/inventory/lists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      setLists(before);
      const j = await r.json().catch(() => ({}));
      setToast(j.error || "Could not save");
    }
  }

  const hidden = lists?.filter((l) => !l.visible).length ?? 0;

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line bg-bg px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:hidden">
        <h1 className="text-lg font-bold">Settings</h1>
      </header>

      <div className="space-y-4 p-3 lg:max-w-3xl lg:p-5">
        {error && <p className="rounded-lg bg-red-bg p-2 text-sm text-red">{error}</p>}

        {can("users.manage") && (
          <Link href="/users" className="card flex items-center justify-between p-4 active:opacity-70">
            <span><span className="block font-semibold">Users &amp; Roles</span><span className="text-sm text-muted">Who can sign in and what they can do</span></span>
            <span aria-hidden>›</span>
          </Link>
        )}

        <section className="card p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Price lists</h2>
            <div className="flex gap-2">
              <button className="btn min-h-9 px-3" onClick={() => setVisible({ all: true, visible: true })} disabled={!lists || !hidden}>Show all</button>
              <button className="btn min-h-9 px-3" onClick={() => setVisible({ all: true, visible: false })} disabled={!lists || hidden === lists.length}>Hide all</button>
            </div>
          </div>
          <p className="mb-2 text-sm text-muted">
            Choose which lists appear on the Stock screen. Hidden lists are only left out of view; nothing is deleted.
            {lists ? " " + hidden + " of " + lists.length + " hidden." : ""}
          </p>
          {!lists && !error && <p className="py-3 text-sm text-muted">Loading…</p>}
          <ul className="divide-y divide-line">
            {lists?.map((l) => (
              <li key={l.id} className="flex min-h-14 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className={"break-words font-medium " + (l.visible ? "" : "text-muted")}>{l.name}</p>
                  <p className="text-xs text-muted">{l.products.toLocaleString()} products</p>
                </div>
                <button role="switch" aria-checked={l.visible} aria-label={(l.visible ? "Hide " : "Show ") + l.name}
                  onClick={() => setVisible({ id: l.id, visible: !l.visible })}
                  className={"relative h-8 w-14 shrink-0 rounded-full transition-colors " + (l.visible ? "bg-accent" : "bg-line")}>
                  <span className={"absolute top-1 size-6 rounded-full bg-white shadow transition-all " + (l.visible ? "left-7" : "left-1")} />
                </button>
              </li>
            ))}
          </ul>
          {lists && !lists.length && <p className="py-3 text-sm text-muted">No lists yet. They appear after the product import.</p>}
        </section>

        <section className="card p-4">
          <h2 className="mb-1 font-semibold">Selling</h2>
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" className="size-5" checked={negStock} onChange={(e) => toggleNeg(e.target.checked)} />
            <span><span className="block">Allow selling more than is in stock</span><span className="block text-xs text-muted">Stock can go below zero. Leave off to refuse such invoices.</span></span>
          </label>
        </section>

        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Stock locations</h2>
            {can("stock.manage") && <button className="btn btn-primary min-h-9 px-3" onClick={() => setAddLoc(true)}>Add stock location</button>}
          </div>
          <p className="mb-1 text-sm text-muted">Invoices take stock from the top location first, then the next. Use the arrows to change the order.</p>
          {!locs && !error && <p className="py-3 text-sm text-muted">Loading…</p>}
          <ul className="divide-y divide-line">
            {locs?.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-muted">{l.type} · {l.racks} {l.racks === 1 ? "rack" : "racks"}</p>
                </div>
                <button className="btn size-10 min-h-10 px-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label={"Sell from " + l.name + " earlier"}>↑</button>
                <button className="btn size-10 min-h-10 px-0" disabled={i === (locs?.length ?? 0) - 1} onClick={() => move(i, 1)} aria-label={"Sell from " + l.name + " later"}>↓</button>
              </li>
            ))}
          </ul>
          {locs && !locs.length && <p className="py-3 text-sm text-muted">No locations yet.</p>}
        </section>
      </div>

      {addLoc && <AddLocationModal onClose={() => setAddLoc(false)} onDone={(n) => { setAddLoc(false); setToast(n + " added"); loadLocs(); }} />}
      {toast && <Toast msg={toast} onHide={() => setToast("")} />}
    </div>
  );
}
