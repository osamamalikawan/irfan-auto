"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { qty, stockTone, toneClass } from "@/lib/format";

type Item = {
  id: string; legacy_no: number | null; name_en: string; code_name: string | null; name_ur: string | null;
  scheme: string | null; unit: string; reorder_level: number; list_name: string | null; brand: string | null;
  on_hand: number; racks: string[]; locations: string[];
};
const FILTERS = [["all", "All"], ["low", "Low stock"], ["out", "Out of stock"], ["norack", "No rack"]] as const;
const PAGE = 30;

export default function InventoryList({ initialFilter }: { initialFilter: string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  const [list, setList] = useState("");
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const req = useRef(0);

  useEffect(() => {
    fetch("/api/inventory/meta").then((r) => r.json()).then((m) => setLists(m.lists ?? [])).catch(() => {});
  }, []);

  const load = useCallback(async (offset: number) => {
    const id = ++req.current;
    setLoading(true); setError("");
    const p = new URLSearchParams({ q, filter, offset: String(offset), limit: String(PAGE) });
    if (list) p.set("list", list);
    try {
      const r = await fetch("/api/inventory/products?" + p);
      const j = await r.json();
      if (id !== req.current) return;
      if (!r.ok) throw new Error(j.error || "Could not load");
      setItems((prev) => (offset ? [...prev, ...j.items] : j.items));
      setTotal(j.total);
    } catch (e) {
      if (id === req.current) setError((e as Error).message);
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [q, filter, list]);

  useEffect(() => {
    const t = setTimeout(() => load(0), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-line px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="mb-2 flex items-baseline justify-between">
          <h1 className="text-lg font-bold">Stock</h1>
          <span className="text-xs text-muted">{loading && !items.length ? "Loading…" : total.toLocaleString() + " items"}</span>
        </div>
        <input className="input" type="search" inputMode="search" placeholder="Search name, code or Urdu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 pb-1">
          {FILTERS.map(([k, label]) => (
            <button key={k} className={"chip " + (filter === k ? "chip-on" : "")} onClick={() => setFilter(k)}>{label}</button>
          ))}
          <select className="chip" value={list} onChange={(e) => setList(e.target.value)} aria-label="Price list">
            <option value="">All lists</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </header>

      <ul className="space-y-2 p-3">
        {items.map((it) => {
          const tone = stockTone(Number(it.on_hand), Number(it.reorder_level));
          return (
            <li key={it.id}>
              <Link href={"/inventory/" + it.id} className="card flex gap-3 p-3 active:opacity-70">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{it.name_en}</p>
                  {it.name_ur && <p className="ur text-sm text-muted">{it.name_ur}</p>}
                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted">
                    {it.list_name && <span className="pill bg-bg">{it.list_name}</span>}
                    {it.scheme && <span className="pill bg-bg">Scheme {it.scheme}</span>}
                    {it.racks.map((r) => <span key={r} className="pill bg-bg">Rack {r}</span>)}
                    {!it.racks.length && it.locations.map((l) => <span key={l} className="pill bg-bg">{l}</span>)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={"pill text-base " + toneClass[tone]}>{qty(it.on_hand)}</span>
                  <p className="mt-1 text-xs text-muted">{it.unit}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="px-3 pb-6 text-center text-sm text-muted">
        {error && <p className="mb-2 text-red">{error} <button className="underline" onClick={() => load(0)}>Retry</button></p>}
        {!loading && !error && !items.length && <p>No products match.</p>}
        {items.length < total && (
          <button className="btn w-full" disabled={loading} onClick={() => load(items.length)}>
            {loading ? "Loading…" : "Load more (" + (total - items.length).toLocaleString() + " left)"}
          </button>
        )}
      </div>

      <Link href="/inventory/new" aria-label="Add product"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-20 flex size-14 items-center justify-center rounded-full bg-accent text-3xl text-accent-ink shadow-lg active:opacity-80">＋</Link>
    </div>
  );
}
